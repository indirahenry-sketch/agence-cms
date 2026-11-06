import type { CollectionConfig, Field } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { validateURL } from '@/utilities/safeURL'

export const MENU_LOCATIONS = [
  { label: 'Menu principal (en haut)', value: 'main' },
  { label: 'Menu secondaire', value: 'secondary' },
  { label: 'Pied de page', value: 'footer' },
]

/** Un lien de menu : vers une page du site, une section de l'accueil ou une adresse. */
const linkFields: Field[] = [
  {
    type: 'row',
    fields: [
      { name: 'label', label: 'Texte du lien', type: 'text', localized: true, required: true },
      {
        name: 'type',
        label: 'Destination',
        type: 'select',
        required: true,
        defaultValue: 'page',
        options: [
          { label: 'Une page du site', value: 'page' },
          { label: 'Une section de l’accueil', value: 'anchor' },
          { label: 'Une adresse (lien externe)', value: 'url' },
        ],
      },
    ],
  },
  {
    name: 'page',
    label: 'Page',
    type: 'relationship',
    relationTo: 'pages',
    admin: { condition: (_, sibling) => sibling?.type === 'page' },
  },
  {
    name: 'anchor',
    label: 'Section',
    type: 'select',
    options: [
      { label: 'Haut de page', value: 'top' },
      { label: 'Photos', value: 'galerie' },
      { label: 'Services', value: 'services' },
      { label: 'Tarifs', value: 'tarifs' },
      { label: 'Installations', value: 'installations' },
      { label: 'Stages', value: 'stages' },
      { label: 'Blog', value: 'blog' },
      { label: 'Contact', value: 'contact' },
    ],
    admin: { condition: (_, sibling) => sibling?.type === 'anchor' },
  },
  {
    name: 'url',
    label: 'Adresse',
    type: 'text',
    validate: validateURL,
    admin: { placeholder: 'https://…', condition: (_, sibling) => sibling?.type === 'url' },
  },
  { name: 'newTab', label: 'Ouvrir dans un nouvel onglet', type: 'checkbox', defaultValue: false },
]

/** Menus de navigation : l'ordre des liens se change par glisser-déposer. */
export const Menus: CollectionConfig = {
  slug: 'menus',
  labels: { singular: 'Menu', plural: 'Menus' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'location', 'updatedAt'], group: 'Site' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('menus')],
    afterDelete: [auditDelete('menus')],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', label: 'Nom du menu', type: 'text', required: true },
        { name: 'location', label: 'Emplacement', type: 'select', required: true, defaultValue: 'main', options: MENU_LOCATIONS },
      ],
    },
    {
      name: 'items',
      label: 'Liens',
      type: 'array',
      labels: { singular: 'Lien', plural: 'Liens' },
      admin: { description: 'Faites glisser les liens pour changer leur ordre.' },
      fields: [
        ...linkFields,
        {
          name: 'children',
          label: 'Sous-menu',
          type: 'array',
          labels: { singular: 'Sous-lien', plural: 'Sous-liens' },
          fields: linkFields,
        },
      ],
    },
  ],
}
