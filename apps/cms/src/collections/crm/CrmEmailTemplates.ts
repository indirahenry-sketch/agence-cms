import type { CollectionConfig } from 'payload'

import { crmAccess, crmHidden } from '@/crm/access'
import { CRM_GROUP, CRM_TEMPLATE_KINDS } from '@/crm/constants'
import { TEMPLATE_VARIABLES } from '@/crm/emailTemplate'
import { auditChange, auditDelete } from '@/hooks/audit'

const VARIABLES_HELP = `Champs remplis automatiquement avec la fiche du prospect : ${TEMPLATE_VARIABLES.map((v) => `{{${v.key}}} (${v.label})`).join(', ')}.`

/** Mails types de prospection (refonte, création de site, relance…), utilisables depuis la fiche d'un prospect. */
export const CrmEmailTemplates: CollectionConfig = {
  slug: 'crm-email-templates',
  labels: { singular: 'Modèle d’e-mail', plural: 'Modèles d’e-mails' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'name',
    defaultColumns: ['name', 'kind', 'subject', 'updatedAt'],
    description: `Tes mails types. Depuis la fiche d’un prospect, choisis un modèle : il est personnalisé, puis tu le copies ou l’ouvres dans ta messagerie. Rien n’est envoyé automatiquement. ${VARIABLES_HELP}`,
  },
  access: crmAccess,
  defaultSort: 'name',
  hooks: {
    afterChange: [auditChange('crm-email-templates')],
    afterDelete: [auditDelete('crm-email-templates')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', label: 'Nom du modèle', type: 'text', required: true, admin: { width: '60%', placeholder: 'Ex. : Refonte – premier contact' } },
        { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'refonte', options: [...CRM_TEMPLATE_KINDS], index: true, admin: { width: '40%' } },
      ],
    },
    { name: 'subject', label: 'Objet', type: 'text', admin: { placeholder: 'Ex. : Un nouveau site pour {{nom}} ?' } },
    {
      name: 'body',
      label: 'Texte de l’e-mail',
      type: 'textarea',
      admin: { rows: 16, description: VARIABLES_HELP },
    },
  ],
}
