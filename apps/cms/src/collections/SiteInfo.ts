import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

const DAYS = [
  { label: 'Lundi', value: 'monday' },
  { label: 'Mardi', value: 'tuesday' },
  { label: 'Mercredi', value: 'wednesday' },
  { label: 'Jeudi', value: 'thursday' },
  { label: 'Vendredi', value: 'friday' },
  { label: 'Samedi', value: 'saturday' },
  { label: 'Dimanche', value: 'sunday' },
]

const timeField = (name: string, label: string) => ({
  name,
  label,
  type: 'text' as const,
  required: true,
  validate: (value: unknown) =>
    typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? true : 'Format attendu : 09:30',
  admin: { placeholder: '09:00' },
})

/**
 * Informations pratiques : UN seul document par client (« global par client »).
 * Le plugin multi-tenant l'affiche directement comme une page de réglages.
 */
export const SiteInfo: CollectionConfig = {
  slug: 'site-info',
  labels: { singular: 'Informations', plural: 'Informations' },
  admin: { group: 'Contenus' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('site-info')],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Horaires',
          fields: [
            {
              name: 'openingHours',
              label: 'Horaires d’ouverture',
              type: 'array',
              labels: { singular: 'Jour', plural: 'Jours' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'day', label: 'Jour', type: 'select', options: DAYS, required: true },
                    { name: 'closed', label: 'Fermé', type: 'checkbox', defaultValue: false },
                  ],
                },
                {
                  name: 'slots',
                  label: 'Créneaux',
                  type: 'array',
                  labels: { singular: 'Créneau', plural: 'Créneaux' },
                  admin: { condition: (_, sibling) => !sibling?.closed },
                  fields: [{ type: 'row', fields: [timeField('opens', 'Ouverture'), timeField('closes', 'Fermeture')] }],
                },
              ],
            },
            {
              name: 'closures',
              label: 'Fermetures exceptionnelles',
              type: 'array',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'from', label: 'Du', type: 'date', required: true, admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
                    { name: 'to', label: 'Au', type: 'date', required: true, admin: { date: { displayFormat: 'dd/MM/yyyy' } } },
                  ],
                },
                { name: 'reason', label: 'Motif', type: 'text', localized: true },
              ],
            },
          ],
        },
        {
          label: 'Coordonnées',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'phone', label: 'Téléphone', type: 'text' },
                { name: 'landline', label: 'Téléphone fixe', type: 'text', admin: { description: 'Facultatif : affiché à côté du portable.' } },
                { name: 'email', label: 'E-mail de contact', type: 'email' },
              ],
            },
            {
              name: 'address',
              label: 'Adresse affichée sur le site',
              type: 'group',
              fields: [
                { name: 'street', label: 'Rue', type: 'text' },
                {
                  type: 'row',
                  fields: [
                    { name: 'postalCode', label: 'Code postal', type: 'text' },
                    { name: 'city', label: 'Ville', type: 'text' },
                  ],
                },
                { name: 'mapsUrl', label: 'Lien Google Maps', type: 'text' },
              ],
            },
          ],
        },
        {
          label: 'Réseaux sociaux',
          fields: [
            {
              name: 'socials',
              label: 'Réseaux sociaux',
              type: 'array',
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'network',
                      label: 'Réseau',
                      type: 'select',
                      required: true,
                      options: ['facebook', 'instagram', 'tiktok', 'linkedin', 'youtube', 'x', 'google'].map((v) => ({
                        label: v.charAt(0).toUpperCase() + v.slice(1),
                        value: v,
                      })),
                    },
                    { name: 'url', label: 'Lien', type: 'text', required: true },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
