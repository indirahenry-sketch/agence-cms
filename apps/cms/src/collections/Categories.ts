import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { enforceTenant } from '@/hooks/enforceTenant'

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Catégorie', plural: 'Catégories' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'usage', 'order'], group: 'Contenus' },
  access: tenantCollectionAccess(),
  hooks: { beforeChange: [enforceTenant()] },
  defaultSort: 'order',
  fields: [
    { name: 'name', label: 'Nom', type: 'text', localized: true, required: true },
    {
      name: 'usage',
      label: 'Utilisée pour',
      type: 'select',
      hasMany: true,
      defaultValue: ['gallery'],
      options: [
        { label: 'Galerie photos', value: 'gallery' },
        { label: 'Tarifs', value: 'prices' },
      ],
    },
    { name: 'order', label: 'Ordre d’affichage', type: 'number', defaultValue: 0 },
  ],
}
