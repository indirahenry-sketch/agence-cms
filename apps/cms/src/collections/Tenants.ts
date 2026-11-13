import type { Access, AccessResult, CollectionAfterChangeHook, CollectionConfig, Field, FieldAccess, Validate } from 'payload'

import { ADMIN_ONLY, ALL_TENANT_ROLES, extractID, getTenantIDs, INACTIVE_STATUSES, isSuperAdmin, sameID } from '@/access/roles'
import { superAdminOnly } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { deleteTenantContent } from '@/hooks/tenantCleanup'
import { addLegalPages, duplicateTenant, exportTenant } from '@/endpoints/tenantTools'

import type { Tenant } from '@/payload-types'
import { createLegalPages } from '@/sites/legalPages'

import { CATEGORY_TYPES } from './Categories'

/** Un client ne voit que sa (ou ses) entreprise(s). */
const readTenants: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const ids = getTenantIDs(req.user, ALL_TENANT_ROLES)
  return ids.length ? { id: { in: ids } } : false
}

/** L'administrateur client peut modifier sa fiche (logo, coordonnées, couleurs). */
const updateTenants: Access = ({ req }): AccessResult => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const ids = getTenantIDs(req.user, ADMIN_ONLY)
  return ids.length ? { and: [{ id: { in: ids } }, { status: { not_in: [...INACTIVE_STATUSES] } }] } : false
}

/** Le logo doit être une image de CE client (pas celle d'un autre). */
const logoOfSameTenant: Validate = async (value, { req, id }) => {
  const mediaID = extractID(value)
  if (mediaID === null) return true
  const media = await req.payload.findByID({ collection: 'media', id: mediaID, depth: 0, overrideAccess: true, req, disableErrors: true })
  if (!media) return 'Image introuvable'
  if (id === undefined || !sameID(media.tenant, id)) return 'Choisissez une image de la médiathèque de ce client.'
  return true
}

/** Crée les catégories par défaut d'un nouveau client (renommables ensuite). */
const createDefaultCategories: CollectionAfterChangeHook = async ({ req, doc, operation, context }) => {
  if (operation !== 'create' || context?.skipDefaultCategories) return doc
  for (const [i, type] of CATEGORY_TYPES.entries()) {
    await req.payload.create({
      collection: 'categories',
      data: { tenant: doc.id, name: type.label.replace(' (actualités)', ''), usage: [type.value], order: i + 1 },
      overrideAccess: true,
      req,
    })
  }
  // Modèles de pages (mentions légales, confidentialité, contact), en brouillon
  await createLegalPages(req.payload, doc as Tenant, req)
  return doc
}

const isHex: Validate = (value) => !value || /^#[0-9a-f]{6}$/i.test(String(value)) || 'Format attendu : # suivi de 6 caractères, ex. #1F4E79'
const colorField = (name: string, label: string, defaultValue: string, description: string) => ({
  name,
  label,
  type: 'text' as const,
  defaultValue,
  validate: isHex,
  admin: { description, components: { Field: '@/components/ColorField#ColorField' } },
})

/** Couleurs et police du site (onglet « Logo et couleurs »). */
const THEME_GROUP: Field = {
  name: 'theme',
  label: 'Couleurs et police',
  type: 'group',
  fields: [
    {
      type: 'row',
      fields: [
        colorField('primaryColor', 'Couleur principale', '#1F4E79', 'Boutons, liens, bandeaux.'),
        colorField('secondaryColor', 'Couleur secondaire', '#F2C14E', 'Touches d’accent (badges, soulignés).'),
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
  endpoints: [exportTenant, duplicateTenant, addLegalPages],
  hooks: {
    beforeDelete: [deleteTenantContent],
    afterChange: [createDefaultCategories, auditChange('tenants')],
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
        { label: 'Archivé', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Suspendu ou archivé : site hors ligne et comptes du client bloqués, contenus conservés. Archivé : client terminé, masqué du tableau de bord.',
      },
      access: { update: superAdminField, create: superAdminField },
    },
    {
      name: 'maintenance',
      label: 'Mode maintenance',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Les visiteurs voient « Site en travaux » ; vous et le client continuez à travailler dans le CMS.' },
      access: { update: superAdminField, create: superAdminField },
    },
    {
      name: 'labels',
      label: 'Étiquettes (agence)',
      type: 'text',
      hasMany: true,
      admin: { position: 'sidebar', description: 'Pour trier vos clients : Équestre, Payé, Devis… Visibles par l’agence seulement.', condition: (_d, _s, { user }) => isSuperAdmin(user) },
      access: { read: superAdminField, update: superAdminField, create: superAdminField },
    },
    {
      name: 'agencyTools',
      type: 'ui',
      admin: {
        position: 'sidebar',
        condition: (data) => Boolean(data?.id),
        components: { Field: '@/components/TenantTools#TenantTools' },
      },
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
          label: 'Logo et couleurs',
          description: 'Le logo s’affiche en haut du site ; les couleurs habillent les boutons, titres et liens.',
          fields: [
            { name: 'logo', label: 'Logo', type: 'upload', relationTo: 'media', validate: logoOfSameTenant },
            THEME_GROUP,
          ],
        },
        {
          label: 'Coordonnées',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'email', label: 'E-mail', type: 'email' },
                { name: 'phone', label: 'Téléphone', type: 'text' },
                { name: 'landline', label: 'Téléphone fixe', type: 'text', admin: { description: 'Facultatif : affiché à côté du portable.' } },
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
              name: 'tagline',
              label: 'Accroche du site',
              type: 'text',
              localized: true,
              admin: { description: 'Une phrase sous le nom, en haut de l’accueil (ex. « Boulangerie artisanale depuis 1987 »).' },
            },
            {
              name: 'indexable',
              label: 'Site visible sur Google',
              type: 'checkbox',
              defaultValue: false,
              access: { update: superAdminField, create: superAdminField },
              admin: { description: 'À cocher une fois le site validé et branché sur son domaine. Décoché : maquette non référencée.' },
            },
            {
              name: 'domains',
              label: 'Noms de domaine',
              type: 'array',
              admin: { description: 'Ex. www.boulangerie-dupont.fr. Le premier est l’adresse principale.' },
              access: { update: superAdminField, create: superAdminField },
              fields: [{ name: 'domain', label: 'Domaine', type: 'text', required: true }],
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
