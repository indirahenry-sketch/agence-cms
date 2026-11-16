import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig, Field } from 'payload'

import {
  CRM_GROUP,
  CRM_INFO_LEVELS,
  CRM_NEEDS,
  CRM_PRIORITIES,
  CRM_STATUSES,
  CRM_TYPES,
  CRM_VERIFICATION_LEVELS,
  CRM_WEBSITE_STATUSES,
} from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { findOptOut, flagDuplicates } from '@/crm/dedupe'
import { crmKeys, type CrmKeys } from '@/crm/normalize'
import { auditChange, auditDelete } from '@/hooks/audit'

const KEY_FIELDS: (keyof CrmKeys)[] = ['nameKey', 'communeKey', 'phoneKey', 'emailKey', 'domainKey', 'sirenKey']

/**
 * Avant enregistrement :
 * - calcule les clés de comparaison (doublons) ;
 * - une information vide est « Non trouvé » (jamais inventée) ;
 * - déduit le besoin (création ou refonte) du site Internet ;
 * - applique la liste « ne plus contacter ».
 */
const prepare: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const d = { ...(originalDoc ?? {}), ...data }
  const keys = crmKeys(d)
  Object.assign(data, keys)

  const level = (value: unknown, current: unknown) => {
    if (!String(value ?? '').trim()) return 'non-trouve'
    return current === 'non-trouve' || !current ? 'a-verifier' : current
  }
  data.phoneLevel = level(d.phone, d.phoneLevel)
  data.emailLevel = level(d.email, d.emailLevel)

  const hasSite = Boolean(String(d.website ?? '').trim())
  // Une adresse de site renseignée = un site existe (la valeur par défaut « À vérifier » ne doit pas rester)
  if (hasSite && d.websiteStatus !== 'site-existant') data.websiteStatus = 'site-existant'
  const websiteStatus = data.websiteStatus ?? d.websiteStatus
  if (!d.need || d.need === 'a-determiner') {
    data.need = websiteStatus === 'sans-site' ? 'creation' : websiteStatus === 'site-existant' ? 'refonte' : 'a-determiner'
  }

  const status = data.status ?? d.status
  const optOut = status === 'ne-plus-contacter' ? null : await findOptOut(req.payload, keys, req)
  if (optOut) data.status = 'ne-plus-contacter'
  data.doNotContact = Boolean(optOut) || (data.status ?? status) === 'ne-plus-contacter'
  return data
}

/** Après enregistrement : mémorise les refus définitifs et signale les doublons possibles. */
const afterSave: CollectionAfterChangeHook = async ({ doc, previousDoc, operation, req, context }) => {
  if (context?.skipCrmChecks) return doc
  const becameStop = doc.status === 'ne-plus-contacter' && (operation === 'create' || previousDoc?.status !== 'ne-plus-contacter')
  if (becameStop) {
    const existing = await findOptOut(req.payload, doc, req)
    if (!existing) {
      await req.payload.create({
        collection: 'crm-optouts',
        data: {
          label: doc.name,
          prospect: doc.id,
          nameKey: doc.nameKey,
          communeKey: doc.communeKey,
          phoneKey: doc.phoneKey,
          emailKey: doc.emailKey,
          domainKey: doc.domainKey,
          sirenKey: doc.sirenKey,
          reason: 'Statut « Ne plus contacter » sur la fiche',
        },
        overrideAccess: true,
        req,
      })
    }
  }
  const keysChanged = operation === 'create' || KEY_FIELDS.some((k) => doc[k] !== previousDoc?.[k])
  if (keysChanged) await flagDuplicates(req.payload, doc, req)
  return doc
}

/** Supprimer une fiche retire aussi son suivi et ses alertes de doublon (la liste « ne plus contacter » est gardée). */
const cleanup: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({ collection: 'crm-activities', where: { prospect: { equals: id } }, overrideAccess: true, req })
  await req.payload.delete({
    collection: 'crm-duplicates',
    where: { or: [{ prospect: { equals: id } }, { existing: { equals: id } }] },
    overrideAccess: true,
    req,
  })
}

const levelField = (name: string, label: string): Field => ({
  name,
  label,
  type: 'select',
  defaultValue: 'non-trouve',
  options: [...CRM_INFO_LEVELS],
  admin: { width: '35%' },
})

export const CrmProspects: CollectionConfig = {
  slug: 'crm-prospects',
  labels: { singular: 'Prospect', plural: 'Prospects' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'commune', 'department', 'websiteStatus', 'status', 'nextFollowUpAt'],
    listSearchableFields: ['name', 'commune', 'email', 'phone', 'website'],
    description: 'Structures à démarcher. Rien n’est inventé : une information introuvable reste « Non trouvé ».',
    pagination: { defaultLimit: 50 },
  },
  access: crmAccess,
  defaultSort: '-createdAt',
  hooks: {
    beforeChange: [prepare],
    afterChange: [afterSave, auditChange('crm-prospects')],
    beforeDelete: [cleanup],
    afterDelete: [auditDelete('crm-prospects')],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Fiche',
          fields: [
            { name: 'name', label: 'Nom de la structure', type: 'text', required: true },
            {
              type: 'row',
              fields: [
                { name: 'type', label: 'Type d’établissement', type: 'select', options: [...CRM_TYPES], index: true },
                { name: 'status', label: 'Statut commercial', type: 'select', required: true, defaultValue: 'nouveau', options: [...CRM_STATUSES], index: true },
                { name: 'priority', label: 'Priorité', type: 'select', defaultValue: 'moyenne', options: [...CRM_PRIORITIES], index: true },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'commune', label: 'Commune', type: 'text', index: true },
                { name: 'department', label: 'Département', type: 'relationship', relationTo: 'crm-zones', index: true },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'address', label: 'Adresse', type: 'text', admin: { width: '70%' } },
                { name: 'postalCode', label: 'Code postal', type: 'text', admin: { width: '30%' } },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'need', label: 'Besoin commercial', type: 'select', defaultValue: 'a-determiner', options: [...CRM_NEEDS] },
                { name: 'verificationLevel', label: 'Niveau de vérification', type: 'select', defaultValue: 'a-verifier', options: [...CRM_VERIFICATION_LEVELS] },
              ],
            },
            { name: 'notes', label: 'Notes personnelles', type: 'textarea' },
          ],
        },
        {
          label: 'Coordonnées',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'phone', label: 'Téléphone professionnel public', type: 'text', admin: { width: '65%' } },
                levelField('phoneLevel', 'Fiabilité'),
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'email', label: 'E-mail professionnel public', type: 'email', admin: { width: '65%' } },
                levelField('emailLevel', 'Fiabilité'),
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'website', label: 'Adresse du site', type: 'text', admin: { width: '65%', placeholder: 'https://…' } },
                { name: 'websiteStatus', label: 'Site Internet', type: 'select', defaultValue: 'a-verifier', options: [...CRM_WEBSITE_STATUSES], index: true, admin: { width: '35%' } },
              ],
            },
            { name: 'siren', label: 'SIREN (si connu)', type: 'text', admin: { description: 'Numéro d’entreprise : aide à repérer les doublons.' } },
          ],
        },
        {
          label: 'Sources',
          fields: [
            {
              name: 'sources',
              label: 'Sources utilisées',
              labels: { singular: 'Source', plural: 'Sources' },
              type: 'array',
              admin: { description: 'Où chaque information a été trouvée (lien de la page, annuaire…).' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'label', label: 'Source', type: 'text', required: true, admin: { placeholder: 'Site officiel, annuaire FFE…' } },
                    { name: 'url', label: 'Lien', type: 'text' },
                    { name: 'checkedAt', label: 'Consultée le', type: 'date', admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
                  ],
                },
              ],
            },
            { name: 'discoveredAt', label: 'Date de découverte', type: 'date', defaultValue: () => new Date().toISOString(), admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
            { name: 'search', label: 'Trouvé par la recherche', type: 'relationship', relationTo: 'crm-searches', admin: { readOnly: true } },
          ],
        },
        {
          label: 'Suivi',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'nextFollowUpAt', label: 'Prochaine relance', type: 'date', index: true, admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
                { name: 'lastContactAt', label: 'Dernier contact', type: 'date', admin: { readOnly: true, date: { displayFormat: 'dd/MM/yyyy' } } },
              ],
            },
            {
              name: 'activities',
              label: 'Historique des échanges',
              type: 'join',
              collection: 'crm-activities',
              on: 'prospect',
              defaultSort: '-date',
              admin: { defaultColumns: ['date', 'kind', 'summary', 'followUpAt', 'done'] },
            },
          ],
        },
      ],
    },
    {
      name: 'doNotContact',
      label: 'Ne plus contacter',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Coché automatiquement : statut « Ne plus contacter » ou demande enregistrée.' },
    },
    // Clés de comparaison (doublons), calculées automatiquement
    ...(['nameKey', 'communeKey', 'phoneKey', 'emailKey', 'domainKey', 'sirenKey'] as const).map((name) => ({
      name,
      type: 'text' as const,
      index: true,
      admin: { hidden: true },
    })),
  ],
}
