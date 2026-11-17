import type { CollectionConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { auditChange, auditDelete } from '@/hooks/audit'

/**
 * Doublons possibles, signalés automatiquement. Rien n'est fusionné ni supprimé tout seul :
 * on regarde les deux fiches, puis on choisit « C'est un doublon » ou « Pas un doublon ».
 */
export const CrmDuplicates: CollectionConfig = {
  slug: 'crm-duplicates',
  labels: { singular: 'Doublon possible', plural: 'Doublons à examiner' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    defaultColumns: ['prospect', 'existing', 'reasons', 'status', 'createdAt'],
    description: 'Deux fiches qui semblent décrire le même établissement. À valider à la main.',
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
    afterChange: [auditChange('crm-duplicates')],
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
