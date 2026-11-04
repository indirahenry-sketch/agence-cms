import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { ADMIN_ONLY, ALL_TENANT_ROLES, getTenantIDs, isSuperAdmin } from '@/access/roles'
import { superAdminOnly } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'

/** Un client ne voit que sa (ou ses) entreprise(s). */
const readTenants: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const ids = getTenantIDs(req.user, ALL_TENANT_ROLES)
  return ids.length ? { id: { in: ids } } : false
}

/** L'administrateur client peut modifier sa fiche (logo, coordonnées, couleurs). */
const updateTenants: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const ids = getTenantIDs(req.user, ADMIN_ONLY)
  return ids.length ? { id: { in: ids } } : false
}

/** Champs techniques : modifiables par le super admin uniquement. */
const superAdminField: FieldAccess = ({ req }) => isSuperAdmin(req.user)

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  labels: { singular: 'Client', plural: 'Clients' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'status', 'updatedAt'],
    group: 'Agence',
  },
  access: {
    read: readTenants,
    create: superAdminOnly,
    update: updateTenants,
    delete: superAdminOnly,
  },
  hooks: {
    afterChange: [auditChange('tenants')],
    afterDelete: [auditDelete('tenants')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', label: "Nom de l'entreprise", type: 'text', required: true },
        {
          name: 'slug',
          label: 'Identifiant court',
          type: 'text',
          required: true,
          unique: true,
          index: true,
          admin: { description: 'Minuscules et tirets, ex. boulangerie-dupont. Sert à l’adresse de prévisualisation.' },
          access: { update: superAdminField },
        },
      ],
    },
    {
      name: 'status',
      label: 'Statut',
      type: 'select',
      defaultValue: 'active',
      options: [
        { label: 'Actif', value: 'active' },
        { label: 'Suspendu', value: 'suspended' },
      ],
      admin: { position: 'sidebar' },
      access: { update: superAdminField, create: superAdminField },
    },
    {
      name: 'languages',
      label: 'Langues du site',
      type: 'select',
      hasMany: true,
      defaultValue: ['fr'],
      options: [
        { label: 'Français', value: 'fr' },
        { label: 'English', value: 'en' },
      ],
      admin: { position: 'sidebar' },
      access: { update: superAdminField, create: superAdminField },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Coordonnées',
          fields: [
            { name: 'logo', label: 'Logo', type: 'upload', relationTo: 'media' },
            {
              type: 'row',
              fields: [
                { name: 'email', label: 'E-mail', type: 'email' },
                { name: 'phone', label: 'Téléphone', type: 'text' },
              ],
            },
            {
              name: 'address',
              label: 'Adresse',
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
                { name: 'country', label: 'Pays', type: 'text', defaultValue: 'France' },
              ],
            },
          ],
        },
        {
          label: 'Site et domaine',
          fields: [
            {
              name: 'domains',
              label: 'Noms de domaine',
              type: 'array',
              admin: { description: 'Ex. www.boulangerie-dupont.fr. Le premier est l’adresse principale.' },
              access: { update: superAdminField, create: superAdminField },
              fields: [{ name: 'domain', label: 'Domaine', type: 'text', required: true }],
            },
            {
              name: 'theme',
              label: 'Thème',
              type: 'group',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'primaryColor', label: 'Couleur principale', type: 'text', defaultValue: '#1F4E79', admin: { description: 'Format #RRGGBB' } },
                    { name: 'secondaryColor', label: 'Couleur secondaire', type: 'text', defaultValue: '#F2C14E' },
                  ],
                },
                {
                  name: 'font',
                  label: 'Police',
                  type: 'select',
                  defaultValue: 'inter',
                  options: [
                    { label: 'Inter (moderne)', value: 'inter' },
                    { label: 'Playfair Display (élégante)', value: 'playfair' },
                    { label: 'Poppins (arrondie)', value: 'poppins' },
                    { label: 'Merriweather (classique)', value: 'merriweather' },
                  ],
                },
              ],
            },
            {
              name: 'settings',
              label: 'Paramètres du site',
              type: 'group',
              fields: [
                { name: 'showBlog', label: 'Afficher le blog', type: 'checkbox', defaultValue: true },
                { name: 'showEvents', label: 'Afficher les événements', type: 'checkbox', defaultValue: true },
                { name: 'showPrices', label: 'Afficher les tarifs', type: 'checkbox', defaultValue: true },
                { name: 'showGallery', label: 'Afficher la galerie', type: 'checkbox', defaultValue: true },
              ],
            },
          ],
        },
      ],
    },
  ],
}
