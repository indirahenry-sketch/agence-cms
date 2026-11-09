import type { Access, CollectionConfig, Where } from 'payload'

import { getTenantIDs, isSuperAdmin } from '@/access/roles'
import { superAdminOnly } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { validateURL } from '@/utilities/safeURL'

/**
 * Annonces de l'agence vers ses clients (« newsletter agence ») : nouveautés, promotions sur
 * les services (logo, flyers, retouches…), maintenance prévue. Écrites par le super admin,
 * affichées en haut du tableau de bord des clients visés, entre deux dates.
 */
export const ANNOUNCEMENT_TONES = [
  { label: 'Nouveauté', value: 'news' },
  { label: 'Offre', value: 'offer' },
  { label: 'Information', value: 'info' },
  { label: 'Important', value: 'warning' },
]

/** Un client ne lit que les annonces actives qui le concernent. */
const readAnnouncements: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  return audienceFilter(getTenantIDs(req.user))
}

/** Annonces actives, en cours de diffusion, pour tous les clients ou pour l'un de ceux-ci. */
export const audienceFilter = (tenantIDs: (number | string)[], now = new Date().toISOString()): Where => ({
  and: [
    { active: { equals: true } },
    { or: [{ startsAt: { exists: false } }, { startsAt: { less_than_equal: now } }] },
    { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than: now } }] },
    { or: [{ audience: { equals: 'all' } }, ...(tenantIDs.length ? [{ tenants: { in: tenantIDs } }] : [])] },
  ],
})

export const Announcements: CollectionConfig = {
  slug: 'announcements',
  labels: { singular: 'Annonce aux clients', plural: 'Annonces aux clients' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'tone', 'audience', 'active', 'startsAt', 'endsAt'],
    group: 'Agence',
    description: 'Messages affichés en haut du tableau de bord de vos clients : nouveautés, offres sur vos services, maintenance.',
    hidden: ({ user }) => !isSuperAdmin(user),
  },
  access: { read: readAnnouncements, create: superAdminOnly, update: superAdminOnly, delete: superAdminOnly },
  hooks: { afterChange: [auditChange('announcements')], afterDelete: [auditDelete('announcements')] },
  defaultSort: '-updatedAt',
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'tone', label: 'Type', type: 'select', defaultValue: 'news', required: true, options: ANNOUNCEMENT_TONES },
        { name: 'active', label: 'Activée', type: 'checkbox', defaultValue: true },
      ],
    },
    { name: 'title', label: 'Titre', type: 'text', required: true, admin: { placeholder: 'Nouveau : cartes de visite à −20 % ce mois-ci' } },
    { name: 'text', label: 'Message', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'buttonLabel', label: 'Texte du bouton', type: 'text', admin: { placeholder: 'J’en profite' } },
        {
          name: 'buttonUrl',
          label: 'Lien du bouton',
          type: 'text',
          validate: validateURL,
          admin: { placeholder: '/admin/collections/support-requests/create ou https://…' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'audience',
          label: 'Destinataires',
          type: 'select',
          required: true,
          defaultValue: 'all',
          options: [
            { label: 'Tous les clients', value: 'all' },
            { label: 'Clients choisis', value: 'tenants' },
          ],
        },
        {
          name: 'tenants',
          label: 'Clients',
          type: 'relationship',
          relationTo: 'tenants',
          hasMany: true,
          admin: { condition: (data) => data?.audience === 'tenants' },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'startsAt', label: 'Afficher à partir du', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } } },
        { name: 'endsAt', label: 'Jusqu’au', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } } },
      ],
    },
  ],
}
