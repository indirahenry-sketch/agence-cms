import type { Field } from 'payload'

/** Champs SEO communs aux pages et articles. */
export const seoFields: Field = {
  name: 'seo',
  label: 'Référencement (SEO)',
  type: 'group',
  admin: { position: 'sidebar' },
  fields: [
    { name: 'title', label: 'Titre pour Google', type: 'text', localized: true, maxLength: 70 },
    { name: 'description', label: 'Description pour Google', type: 'textarea', localized: true, maxLength: 160 },
    { name: 'image', label: 'Image de partage', type: 'upload', relationTo: 'media' },
  ],
}
