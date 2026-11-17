import type { CollectionConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { auditChange, auditDelete } from '@/hooks/audit'

/**
 * Zones de prospection : un département (ou plus tard un pays entier).
 * Les 101 départements sont créés automatiquement (crm/zones.ts) ; les 8 de lancement sont actifs.
 * Activer, désactiver ou ajouter une zone se fait ici, sans toucher au code.
 * « Toute une région » ou « toute la France » = toutes les zones actives de cette région / de ce pays.
 */
export const CrmZones: CollectionConfig = {
  slug: 'crm-zones',
  labels: { singular: 'Zone de prospection', plural: 'Zones de prospection' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'label',
    defaultColumns: ['label', 'region', 'country', 'active', 'lastSearchedAt', 'searchCount'],
    listSearchableFields: ['name', 'code', 'region'],
    description: 'Départements où chercher des prospects. Cochez « Active » pour inclure une zone dans les recherches.',
    pagination: { defaultLimit: 100 },
  },
  access: crmAccess,
  defaultSort: 'code',
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (data) data.label = [data.code, data.name].filter(Boolean).join(' · ')
        return data
      },
    ],
    afterChange: [auditChange('crm-zones')],
    afterDelete: [auditDelete('crm-zones')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'code', label: 'Code', type: 'text', required: true, index: true, admin: { width: '25%', placeholder: '34' } },
        { name: 'name', label: 'Nom', type: 'text', required: true, admin: { width: '75%', placeholder: 'Hérault' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          label: 'Type de zone',
          type: 'select',
          required: true,
          defaultValue: 'departement',
          options: [
            { label: 'Département', value: 'departement' },
            { label: 'Pays entier', value: 'pays' },
            { label: 'Autre zone', value: 'autre' },
          ],
        },
        { name: 'region', label: 'Région', type: 'text', index: true },
        { name: 'country', label: 'Pays', type: 'text', required: true, defaultValue: 'France', index: true },
      ],
    },
    { name: 'active', label: 'Active (incluse dans les recherches)', type: 'checkbox', defaultValue: false, index: true },
    { name: 'label', type: 'text', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'lastSearchedAt', label: 'Dernière recherche', type: 'date', admin: { readOnly: true, date: { displayFormat: 'dd/MM/yyyy HH:mm' } } },
        { name: 'searchCount', label: 'Nombre de recherches', type: 'number', defaultValue: 0, admin: { readOnly: true } },
      ],
    },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ],
}
