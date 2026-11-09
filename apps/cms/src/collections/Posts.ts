import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { PUBLISHER_ROLES } from '@/access/roles'
import { tenantCollectionAccess, tenantWrite } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { onlyPublishersPublish } from '@/hooks/publishing'
import { previewURL } from '@/utilities/preview'
import { uniqueSlugPerTenant } from '@/hooks/slug'
import { seoFields } from '@/fields/seo'

import { categoriesOfType } from './Categories'

/** Renseigne l'auteur et la date de publication automatiquement. */
const setAuthorAndDate: CollectionBeforeChangeHook = ({ req, data, operation }) => {
  if (operation === 'create' && req.user && !data.author) data.author = req.user.id
  if (data._status === 'published' && !data.publishedAt) data.publishedAt = new Date().toISOString()
  return data
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  // Corbeille : les éléments supprimés restent 30 jours, avec « Restaurer »
  trash: true,
  labels: { singular: 'Article', plural: 'Articles' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['coverImage', 'title', 'category', 'statusBadge', 'modified'],
    group: 'Contenus',
    components: { beforeListTable: ['@/components/ArticlesName#ArticlesNameBar', '@/components/StatusFilters#StatusFilters'] },
    preview: previewURL('posts'),
  },
  // Le rédacteur crée et modifie, mais ne supprime pas un article (il n'a pas la main sur ce qui est en ligne)
  access: { ...tenantCollectionAccess(), delete: tenantWrite(PUBLISHER_ROLES) },
  // Brouillon enregistré automatiquement pendant la saisie
  versions: { drafts: { autosave: { interval: 2000 } }, maxPerDoc: 20 },
  defaultSort: '-publishedAt',
  hooks: {
    beforeChange: [enforceTenant(), onlyPublishersPublish, setAuthorAndDate],
    afterChange: [auditChange('posts')],
    afterDelete: [auditDelete('posts')],
  },
  fields: [
    {
      name: 'statusBadge',
      label: 'Statut',
      type: 'ui',
      admin: { components: { Cell: '@/components/StatusCell#StatusCell' } },
    },
    {
      name: 'modified',
      label: 'Modifié',
      type: 'ui',
      admin: { components: { Cell: '@/components/StatusCell#RelativeDateCell' } },
    },
    { name: 'title', label: 'Titre', type: 'text', localized: true, required: true },
    {
      name: 'slug',
      label: 'Adresse de l’article',
      type: 'text',
      localized: true,
      index: true,
      admin: { position: 'sidebar', description: 'Générée depuis le titre si vide.' },
      hooks: { beforeValidate: [uniqueSlugPerTenant('posts')] },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          label: 'Catégorie',
          type: 'relationship',
          relationTo: 'categories',
          filterOptions: categoriesOfType('articles'),
          admin: { description: 'Articles (actualités) ou Blog.' },
        },
        { name: 'tags', label: 'Tags', type: 'relationship', relationTo: 'tags', hasMany: true },
      ],
    },
    { name: 'coverImage', label: 'Image de couverture', type: 'upload', relationTo: 'media', admin: { components: { Cell: '@/components/CoverCell#CoverCell' } } },
    { name: 'excerpt', label: 'Résumé (2-3 phrases)', type: 'textarea', localized: true },
    { name: 'content', label: 'Texte de l’article', type: 'richText', localized: true },
    {
      name: 'publishedAt',
      label: 'Date de publication',
      type: 'date',
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' },
        description: 'Date future = publication programmée : l’article publié n’apparaît sur le site qu’à partir de cette date.',
      },
    },
    {
      name: 'author',
      label: 'Auteur',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar', readOnly: true },
    },
    seoFields,
  ],
}
