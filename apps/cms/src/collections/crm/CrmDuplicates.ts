import type { CollectionConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { mergeProspects } from '@/crm/merge'
import { auditChange, auditDelete } from '@/hooks/audit'

/**
 * Doublons possibles, signalés automatiquement.
 * - Correspondance sûre (même SIREN, même nom + commune, même site ou e-mail) : fusion automatique
 *   après une recherche ou un import, la fiche la plus complète est gardée.
 * - Sinon (ex. seulement le même téléphone) : à examiner ; « C'est un doublon » fusionne la paire.
 */
export const CrmDuplicates: CollectionConfig = {
  slug: 'crm-duplicates',
  labels: { singular: 'Doublon possible', plural: 'Doublons à examiner' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    defaultColumns: ['prospect', 'existing', 'reasons', 'status', 'createdAt'],
    description: 'Deux fiches qui semblent décrire le même établissement. Choisis « C’est un doublon » pour les fusionner : la fiche la plus complète est gardée, complétée avec ce que l’autre a en plus (rien n’est écrasé), et reprend son historique. « Pas un doublon » garde les deux.',
  },
  access: crmAccess,
  defaultSort: '-createdAt',
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (data.status && data.status !== originalDoc?.status && data.status !== 'a-examiner') data.decidedAt = new Date().toISOString()
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req, context }) => {
        if (context?.merging || doc.status !== 'doublon' || previousDoc?.status === 'doublon') return doc
        const a = typeof doc.prospect === 'object' ? doc.prospect?.id : doc.prospect
        const b = typeof doc.existing === 'object' ? doc.existing?.id : doc.existing
        if (a && b && a !== b) await mergeProspects(req.payload, a, b, req)
        return doc
      },
      auditChange('crm-duplicates'),
    ],
    afterDelete: [auditDelete('crm-duplicates')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'prospect', label: 'Nouvelle fiche', type: 'relationship', relationTo: 'crm-prospects', required: true, index: true },
        { name: 'existing', label: 'Fiche déjà connue', type: 'relationship', relationTo: 'crm-prospects', required: true, index: true },
      ],
    },
    {
      name: 'reasons',
      label: 'Points communs',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Même nom et même commune', value: 'nom-commune' },
        { label: 'Même téléphone', value: 'telephone' },
        { label: 'Même e-mail', value: 'email' },
        { label: 'Même site', value: 'site' },
        { label: 'Même SIREN', value: 'siren' },
      ],
    },
    {
      name: 'status',
      label: 'Décision',
      type: 'select',
      required: true,
      defaultValue: 'a-examiner',
      index: true,
      options: [
        { label: 'À examiner', value: 'a-examiner' },
        { label: 'C’est un doublon', value: 'doublon' },
        { label: 'Pas un doublon', value: 'pas-doublon' },
      ],
    },
    { name: 'decidedAt', label: 'Décidé le', type: 'date', admin: { readOnly: true, date: { displayFormat: 'dd/MM/yyyy' } } },
    { name: 'note', label: 'Note', type: 'textarea' },
  ],
}
