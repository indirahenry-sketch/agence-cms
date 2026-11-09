import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

import { categoriesOfType } from './Categories'

export const Prices: CollectionConfig = {
  slug: 'prices',
  labels: { singular: 'Tarif', plural: 'Tarifs' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'price', 'category'], group: 'Contenus' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('prices')],
    afterDelete: [auditDelete('prices')],
  },
  // Ordre par glisser-déposer dans la liste (poignée à gauche) ; corbeille de 30 jours
  orderable: true,
  trash: true,
  defaultSort: '_order',
  fields: [
    { name: 'name', label: 'Nom de la prestation', type: 'text', localized: true, required: true },
    { name: 'description', label: 'Description', type: 'textarea', localized: true },
    {
      type: 'row',
      fields: [
        { name: 'price', label: 'Prix (€)', type: 'number', min: 0, required: true, admin: { step: 0.01 } },
        { name: 'unit', label: 'Unité', type: 'text', localized: true, admin: { placeholder: 'par personne, l’heure…' } },
        { name: 'isFrom', label: '« À partir de »', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'displayPrice',
          label: 'Prix affiché (facultatif)',
          type: 'text',
          localized: true,
          admin: { placeholder: '810–840 €', description: 'Remplace le prix sur le site, pour une fourchette par exemple.' },
        },
        { name: 'highlight', label: 'Mettre en avant sur le site', type: 'checkbox', defaultValue: false },
      ],
    },
    { name: 'category', label: 'Catégorie (onglet sur le site)', type: 'relationship', relationTo: 'categories', filterOptions: categoriesOfType('prices') },
    { name: 'order', label: 'Ordre d’affichage', type: 'number', defaultValue: 0, admin: { hidden: true } },
  ],
}
