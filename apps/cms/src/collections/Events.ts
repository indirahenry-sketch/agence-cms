import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

export const Events: CollectionConfig = {
  slug: 'events',
  labels: { singular: 'Événement', plural: 'Événements' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'startsAt', 'location'],
    group: 'Contenus',
    components: { beforeListTable: ['@/components/EventCalendar#EventCalendar'] },
  },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('events')],
    afterDelete: [auditDelete('events')],
  },
  trash: true,
  defaultSort: '-startsAt',
  fields: [
    { name: 'title', label: 'Titre', type: 'text', localized: true, required: true },
    { name: 'description', label: 'Détail', type: 'textarea', localized: true },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          label: 'Type',
          type: 'select',
          defaultValue: 'stage',
          options: [
            { label: 'Stage', value: 'stage' },
            { label: 'Galops', value: 'galop' },
            { label: 'Concours', value: 'concours' },
            { label: 'Fête du club', value: 'fete' },
            { label: 'Atelier', value: 'atelier' },
            { label: 'Autre', value: 'autre' },
          ],
          admin: { description: 'Couleur dans le calendrier du site.' },
        },
        { name: 'hours', label: 'Horaires affichés', type: 'text', localized: true, admin: { placeholder: '9h – 17h' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          label: 'Début (date et heure)',
          type: 'date',
          required: true,
          // Clic sur un jour du calendrier → ce jour-là, 9 h (heure de Paris)
          defaultValue: ({ req }) => {
            const day = req?.searchParams?.get('date')
            return day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T09:00:00+01:00`).toISOString() : undefined
          },
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
