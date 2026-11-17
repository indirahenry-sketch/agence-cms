import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig, PayloadRequest } from 'payload'

import { extractID } from '@/access/roles'
import { CRM_ACTIVITY_KINDS, CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { auditChange, auditDelete } from '@/hooks/audit'

/** Échanges qui comptent comme un « contact » avec le prospect. */
const CONTACT_KINDS = ['appel', 'email-envoye', 'reponse', 'relance', 'rdv']

/** Recalcule sur la fiche : prochaine relance non faite, et date du dernier contact. */
const refreshProspect = async (req: PayloadRequest, prospectRef: unknown) => {
  const prospect = extractID(prospectRef)
  if (prospect === null) return
  const base = { collection: 'crm-activities' as const, depth: 0, limit: 1, overrideAccess: true, req }
  const [next, last] = await Promise.all([
    req.payload.find({
      ...base,
      where: { and: [{ prospect: { equals: prospect } }, { done: { not_equals: true } }, { followUpAt: { exists: true } }] },
      sort: 'followUpAt',
    }),
    req.payload.find({ ...base, where: { and: [{ prospect: { equals: prospect } }, { kind: { in: CONTACT_KINDS } }] }, sort: '-date' }),
  ])
  await req.payload.update({
    collection: 'crm-prospects',
    id: prospect,
    data: { nextFollowUpAt: next.docs[0]?.followUpAt ?? null, lastContactAt: last.docs[0]?.date ?? null },
    overrideAccess: true,
    req,
    context: { skipCrmChecks: true, skipAudit: true },
  })
}

const afterChange: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  await refreshProspect(req, doc.prospect)
  if (previousDoc?.prospect && extractID(previousDoc.prospect) !== extractID(doc.prospect)) await refreshProspect(req, previousDoc.prospect)
  return doc
}

const afterDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
  // La fiche elle-même est peut-être en cours de suppression : on ignore alors l'erreur
  await refreshProspect(req, doc.prospect).catch(() => {})
  return doc
}

/** Suivi : notes, appels, e-mails, réponses et relances datées d'un prospect. */
export const CrmActivities: CollectionConfig = {
  slug: 'crm-activities',
  labels: { singular: 'Échange', plural: 'Suivi des échanges' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'summary',
    defaultColumns: ['date', 'prospect', 'kind', 'summary', 'followUpAt', 'done'],
    description: 'Chaque appel, e-mail, réponse ou note. Une date de relance apparaît dans le calendrier des relances.',
  },
  access: crmAccess,
  defaultSort: '-date',
  hooks: {
    afterChange: [afterChange, auditChange('crm-activities')],
    afterDelete: [afterDelete, auditDelete('crm-activities')],
  },
  fields: [
    { name: 'prospect', label: 'Prospect', type: 'relationship', relationTo: 'crm-prospects', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'note', options: [...CRM_ACTIVITY_KINDS], index: true },
        {
          name: 'date',
          label: 'Date',
          type: 'date',
          required: true,
          defaultValue: () => new Date().toISOString(),
          index: true,
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
        },
      ],
    },
    { name: 'summary', label: 'Résumé', type: 'textarea', required: true },
    {
      type: 'row',
      fields: [
        { name: 'followUpAt', label: 'Relancer le', type: 'date', index: true, admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
        { name: 'done', label: 'Relance faite', type: 'checkbox', defaultValue: false },
      ],
    },
  ],
}
