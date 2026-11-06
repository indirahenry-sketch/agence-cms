import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { validateURL } from '@/utilities/safeURL'

/** Bannières (bandeau en haut du site) et pop-ups promotionnels, avec dates de diffusion. */
export const Promotions: CollectionConfig = {
  slug: 'promotions',
  labels: { singular: 'Bannière ou pop-up', plural: 'Bannières et pop-ups' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'kind', 'active', 'startsAt', 'endsAt'], group: 'Site' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('promotions')],
    afterDelete: [auditDelete('promotions')],
  },
  defaultSort: '-updatedAt',
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'kind',
          label: 'Type',
          type: 'select',
          required: true,
          defaultValue: 'banner',
          options: [
            { label: 'Bannière (bandeau en haut du site)', value: 'banner' },
            { label: 'Pop-up (fenêtre à l’ouverture)', value: 'popup' },
          ],
        },
        { name: 'active', label: 'Activée', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'title', label: 'Titre', type: 'text', localized: true, required: true },
    { name: 'text', label: 'Texte', type: 'textarea', localized: true },
    { name: 'image', label: 'Image (pop-up)', type: 'upload', relationTo: 'media', admin: { condition: (data) => data?.kind === 'popup' } },
    {
      type: 'row',
      fields: [
        { name: 'buttonLabel', label: 'Texte du bouton', type: 'text', localized: true },
        { name: 'buttonUrl', label: 'Lien du bouton', type: 'text', validate: validateURL, admin: { placeholder: '#contact ou https://…' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startsAt',
          label: 'Afficher à partir du',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
        },
        {
          name: 'endsAt',
          label: 'Jusqu’au',
          type: 'date',
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'style',
          label: 'Couleur',
          type: 'select',
          defaultValue: 'accent',
          options: [
            { label: 'Couleur d’accent', value: 'accent' },
            { label: 'Foncé', value: 'dark' },
            { label: 'Clair', value: 'light' },
          ],
        },
        {
          name: 'frequency',
          label: 'Fréquence du pop-up',
          type: 'select',
          defaultValue: 'session',
          options: [
            { label: 'Une fois par visite', value: 'session' },
            { label: 'Une seule fois', value: 'once' },
            { label: 'À chaque page', value: 'always' },
          ],
          admin: { condition: (data) => data?.kind === 'popup' },
        },
        {
          name: 'delay',
          label: 'Délai avant ouverture (secondes)',
          type: 'number',
          min: 0,
          max: 60,
          defaultValue: 3,
          admin: { condition: (data) => data?.kind === 'popup' },
        },
      ],
    },
  ],
}
