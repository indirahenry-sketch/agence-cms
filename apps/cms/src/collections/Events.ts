import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Événement', plural: 'Événements' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'startsAt', 'location'], group: 'Contenus' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('events')],
    afterDelete: [auditDelete('events')],
  },
  defaultSort: '-startsAt',
  fields: [
    { name: 'title', label: 'Titre', type: 'text', localized: true, required: true },
    { name: 'description', label: 'Description', type: 'textarea', localized: true },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          label: 'Début (date et heure)',
          type: 'date',
          required: true,
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } },
        },
        {
          name: 'endsAt',
          label: 'Fin (facultatif)',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm', timeFormat: 'HH:mm' } },
        },
      ],
    },
    { name: 'location', label: 'Lieu', type: 'text' },
    { name: 'image', label: 'Photo', type: 'upload', relationTo: 'media' },
  ],
}
