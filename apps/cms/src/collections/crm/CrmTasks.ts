import type { CollectionConfig } from 'payload'

import { crmAccess, crmHidden } from '@/crm/access'
import { CRM_GROUP, CRM_TASK_KINDS } from '@/crm/constants'
import { auditChange, auditDelete } from '@/hooks/audit'

/** Tâches du calendrier : relance, appel, envoi d'e-mail, recherche… avec ou sans prospect. */
export const CrmTasks: CollectionConfig = {
  slug: 'crm-tasks',
  labels: { singular: 'Tâche', plural: 'Tâches' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'title',
    defaultColumns: ['date', 'title', 'kind', 'prospect', 'done'],
    description: 'Tes tâches à faire. Le plus simple : clique sur un jour du calendrier (tableau de bord ou Relances).',
  },
  access: crmAccess,
  defaultSort: 'date',
  hooks: {
    afterChange: [auditChange('crm-tasks')],
    afterDelete: [auditDelete('crm-tasks')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'relance', options: [...CRM_TASK_KINDS], index: true, admin: { width: '40%' } },
        { name: 'title', label: 'À faire', type: 'text', required: true, admin: { width: '60%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'date', label: 'Jour', type: 'date', required: true, index: true, admin: { width: '40%', date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' } } },
        { name: 'time', label: 'Heure', type: 'text', admin: { width: '20%', placeholder: '14:30' } },
        { name: 'done', label: 'Fait', type: 'checkbox', defaultValue: false, index: true, admin: { width: '40%' } },
      ],
    },
    { name: 'prospect', label: 'Prospect (facultatif)', type: 'relationship', relationTo: 'crm-prospects', index: true },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
}
