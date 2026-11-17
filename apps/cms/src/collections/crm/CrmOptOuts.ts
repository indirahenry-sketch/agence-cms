import type { CollectionConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { crmKeys } from '@/crm/normalize'
import { auditChange, auditDelete } from '@/hooks/audit'

/**
 * Liste « Ne plus contacter » : conservée même si la fiche du prospect est supprimée,
 * pour qu'un établissement qui a refusé ne soit JAMAIS recontacté, même retrouvé
 * plus tard par une nouvelle recherche. On ne garde que le strict nécessaire.
 */
export const CrmOptOuts: CollectionConfig = {
  slug: 'crm-optouts',
  labels: { singular: 'Demande « ne plus contacter »', plural: 'Ne plus contacter' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'label',
    defaultColumns: ['label', 'reason', 'createdAt'],
    description: 'Établissements à ne plus jamais solliciter. Ajoutés automatiquement, ou à la main (e-mail, téléphone, site).',
  },
  access: crmAccess,
  defaultSort: '-createdAt',
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        // Saisie manuelle : on calcule les clés à partir des champs lisibles
        const d = { ...(originalDoc ?? {}), ...data }
        const keys = crmKeys({ name: d.label, commune: d.commune, phone: d.phone, email: d.email, website: d.website })
        for (const [k, v] of Object.entries(keys)) if (v && !data[k]) data[k] = v
        return data
      },
    ],
    afterChange: [auditChange('crm-optouts')],
    afterDelete: [auditDelete('crm-optouts')],
  },
  fields: [
    { name: 'label', label: 'Établissement', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'email', label: 'E-mail', type: 'text' },
        { name: 'phone', label: 'Téléphone', type: 'text' },
        { name: 'website', label: 'Site', type: 'text' },
        { name: 'commune', label: 'Commune', type: 'text' },
      ],
    },
    { name: 'reason', label: 'Motif', type: 'text' },
    { name: 'prospect', label: 'Fiche d’origine', type: 'relationship', relationTo: 'crm-prospects', admin: { readOnly: true } },
    ...(['nameKey', 'communeKey', 'phoneKey', 'emailKey', 'domainKey', 'sirenKey'] as const).map((name) => ({
      name,
      type: 'text' as const,
      index: true,
      admin: { hidden: true },
    })),
  ],
}
