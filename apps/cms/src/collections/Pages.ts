import type { Block, CollectionConfig } from 'payload'

import { ADMIN_ONLY } from '@/access/roles'
import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { onlyPublishersPublish } from '@/hooks/publishing'
import { previewURL } from '@/utilities/preview'
import { uniqueSlugPerTenant } from '@/hooks/slug'
import { seoFields } from '@/fields/seo'
import { validateURL } from '@/utilities/safeURL'

const BUTTON_STYLES = [
  { label: 'Principal', value: 'primary' },
  { label: 'Secondaire', value: 'secondary' },
]

const buttonFields = [
  { name: 'label', label: 'Texte du bouton', type: 'text' as const, localized: true, required: true },
  { name: 'url', label: 'Lien', type: 'text' as const, required: true, validate: validateURL, admin: { placeholder: '/contact, #tarifs ou https://…' } },
  { name: 'style', label: 'Style', type: 'select' as const, defaultValue: 'primary', options: BUTTON_STYLES },
]

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
  fields: buttonFields,
}

const HeadingBlock: Block = {
  slug: 'heading',
  labels: { singular: 'Titre', plural: 'Titres' },
  fields: [
    { name: 'eyebrow', label: 'Petit texte au-dessus (facultatif)', type: 'text', localized: true },
    { name: 'text', label: 'Titre', type: 'text', localized: true, required: true },
    {
      name: 'level',
      label: 'Niveau',
      type: 'select',
      defaultValue: 'h2',
      options: [
        { label: 'Grand titre (H2)', value: 'h2' },
        { label: 'Sous-titre (H3)', value: 'h3' },
      ],
    },
  ],
}

const SectionBlock: Block = {
  slug: 'section',
  labels: { singular: 'Section', plural: 'Sections' },
  fields: [
    { name: 'eyebrow', label: 'Petit texte au-dessus', type: 'text', localized: true },
    { name: 'title', label: 'Titre de la section', type: 'text', localized: true },
    { name: 'content', label: 'Texte', type: 'richText', localized: true },
    {
      type: 'row',
      fields: [
        { name: 'image', label: 'Image', type: 'upload', relationTo: 'media' },
        {
          name: 'imagePosition',
          label: 'Position de l’image',
          type: 'select',
          defaultValue: 'right',
          options: [
            { label: 'À droite', value: 'right' },
            { label: 'À gauche', value: 'left' },
          ],
        },
        {
          name: 'background',
          label: 'Fond',
          type: 'select',
          defaultValue: 'none',
          options: [
            { label: 'Aucun', value: 'none' },
            { label: 'Carte claire', value: 'card' },
            { label: 'Couleur d’accent', value: 'accent' },
          ],
        },
      ],
    },
    { name: 'buttons', label: 'Boutons', type: 'array', maxRows: 3, labels: { singular: 'Bouton', plural: 'Boutons' }, fields: buttonFields },
  ],
}

const ButtonsBlock: Block = {
  slug: 'buttons',
  labels: { singular: 'Groupe de boutons', plural: 'Groupes de boutons' },
  fields: [{ name: 'buttons', label: 'Boutons', type: 'array', minRows: 1, maxRows: 4, fields: buttonFields }],
}

const VideoBlock: Block = {
  slug: 'video',
  labels: { singular: 'Vidéo', plural: 'Vidéos' },
  fields: [
    { name: 'video', label: 'Vidéo (médiathèque)', type: 'upload', relationTo: 'media', required: true },
    { name: 'caption', label: 'Légende', type: 'text', localized: true },
  ],
}

export const Pages: CollectionConfig = {
  slug: 'pages',
  labels: { singular: 'Page', plural: 'Pages' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'slug', '_status', 'updatedAt'], group: 'Site', preview: previewURL('pages') },
  // Les éditeurs peuvent lire les pages, seuls les administrateurs clients les modifient
  access: { ...tenantCollectionAccess(ADMIN_ONLY), read: tenantCollectionAccess().read },
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 20 },
  hooks: {
    beforeChange: [enforceTenant(ADMIN_ONLY), onlyPublishersPublish],
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
      blocks: [HeadingBlock, TextBlock, SectionBlock, ImageBlock, VideoBlock, GalleryBlock, PricesBlock, EventsBlock, ButtonsBlock, ButtonBlock],
    },
    seoFields,
  ],
}
