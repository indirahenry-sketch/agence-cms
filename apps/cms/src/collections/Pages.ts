import type { Block, CollectionConfig } from 'payload'

import { ADMIN_ONLY } from '@/access/roles'
import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { uniqueSlugPerTenant } from '@/hooks/slug'
import { seoFields } from '@/fields/seo'

// Blocs qui composent une page : le client les empile dans l'ordre qu'il veut
const TextBlock: Block = {
  slug: 'text',
  labels: { singular: 'Texte', plural: 'Textes' },
  fields: [{ name: 'content', label: 'Texte', type: 'richText', localized: true }],
}

const ImageBlock: Block = {
  slug: 'image',
  labels: { singular: 'Image', plural: 'Images' },
  fields: [
    { name: 'image', label: 'Image', type: 'upload', relationTo: 'media', required: true },
    { name: 'caption', label: 'Légende', type: 'text', localized: true },
  ],
}

const GalleryBlock: Block = {
  slug: 'gallery',
  labels: { singular: 'Galerie', plural: 'Galeries' },
  fields: [
    { name: 'category', label: 'Catégorie à afficher (vide = toutes)', type: 'relationship', relationTo: 'categories' },
  ],
}

const PricesBlock: Block = {
  slug: 'priceList',
  labels: { singular: 'Liste de tarifs', plural: 'Listes de tarifs' },
  fields: [{ name: 'category', label: 'Catégorie (vide = toutes)', type: 'relationship', relationTo: 'categories' }],
}

const EventsBlock: Block = {
  slug: 'eventList',
  labels: { singular: 'Événements à venir', plural: 'Événements à venir' },
  fields: [{ name: 'limit', label: 'Nombre maximum', type: 'number', defaultValue: 3, min: 1, max: 20 }],
}

const ButtonBlock: Block = {
  slug: 'button',
  labels: { singular: 'Bouton', plural: 'Boutons' },
  fields: [
    { name: 'label', label: 'Texte du bouton', type: 'text', localized: true, required: true },
    { name: 'url', label: 'Lien', type: 'text', required: true },
  ],
}

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'], group: 'Contenus' },
  // Les éditeurs peuvent lire les pages, seuls les administrateurs clients les modifient
  access: { ...tenantCollectionAccess(ADMIN_ONLY), read: tenantCollectionAccess().read },
  versions: { drafts: true, maxPerDoc: 20 },
  hooks: {
    beforeChange: [enforceTenant(ADMIN_ONLY)],
    afterChange: [auditChange('pages')],
    afterDelete: [auditDelete('pages')],
  },
  fields: [
    { name: 'title', label: 'Titre', type: 'text', localized: true, required: true },
    {
      name: 'slug',
      label: 'Adresse de la page',
      type: 'text',
      localized: true,
      index: true,
      admin: { position: 'sidebar', description: 'Générée depuis le titre si vide. « accueil » = page d’accueil.' },
      hooks: { beforeValidate: [uniqueSlugPerTenant('pages')] },
    },
    {
      name: 'layout',
      label: 'Contenu de la page',
      type: 'blocks',
      blocks: [TextBlock, ImageBlock, GalleryBlock, PricesBlock, EventsBlock, ButtonBlock],
    },
    seoFields,
  ],
}
