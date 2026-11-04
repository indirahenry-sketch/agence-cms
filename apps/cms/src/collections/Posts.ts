import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { uniqueSlugPerTenant } from '@/hooks/slug'
import { seoFields } from '@/fields/seo'

/** Renseigne l'auteur et la date de publication automatiquement. */
const setAuthorAndDate: CollectionBeforeChangeHook = ({ req, data, operation }) => {
  if (operation === 'create' && req.user && !data.author) data.author = req.user.id
  if (data._status === 'published' && !data.publishedAt) data.publishedAt = new Date().toISOString()
  return data
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Article', plural: 'Articles (blog)' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', '_status', 'publishedAt'], group: 'Contenus' },
  access: tenantCollectionAccess(),
  versions: { drafts: true, maxPerDoc: 20 },
  defaultSort: '-publishedAt',
  hooks: {
    beforeChange: [enforceTenant(), setAuthorAndDate],
    afterChange: [auditChange('posts')],
    afterDelete: [auditDelete('posts')],
  },
  fields: [
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
    { name: 'coverImage', label: 'Image de couverture', type: 'upload', relationTo: 'media' },
    { name: 'excerpt', label: 'Résumé (2-3 phrases)', type: 'textarea', localized: true },
    { name: 'content', label: 'Texte de l’article', type: 'richText', localized: true },
    {
      name: 'publishedAt',
      label: 'Date de publication',
      type: 'date',
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
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
