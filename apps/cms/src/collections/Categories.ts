import type { CollectionConfig, Where } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

/**
 * Types de catégories. Chaque client reçoit une catégorie par type à sa création,
 * qu'il peut RENOMMER librement (ex. « Photos » → « Nos chevaux ») et compléter.
 */
export const CATEGORY_TYPES = [
  { label: 'Photos', value: 'gallery' },
  { label: 'Services', value: 'services' },
  { label: 'Tarifs', value: 'prices' },
  { label: 'Articles (actualités)', value: 'articles' },
  { label: 'Blog', value: 'blog' },
] as const

export type CategoryType = (typeof CATEGORY_TYPES)[number]['value']

/** Filtre pour un champ « Catégorie » : ne propose que les catégories du bon type. */
export const categoriesOfType =
  (...types: CategoryType[]) =>
  (): Where => ({ usage: { in: types } })

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: { singular: 'Catégorie', plural: 'Catégories' },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'usage', 'order'],
    group: 'Organisation',
    description: 'Renommez librement vos catégories : le nouveau nom apparaît partout sur votre site.',
  },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('categories')],
    afterDelete: [auditDelete('categories')],
  },
  defaultSort: 'order',
  fields: [
    { name: 'name', label: 'Nom affiché', type: 'text', localized: true, required: true },
    {
      name: 'usage',
      label: 'Type',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['gallery'],
      options: [...CATEGORY_TYPES],
      admin: { description: 'Où cette catégorie est proposée (photos, services, tarifs, articles ou blog).' },
    },
    { name: 'description', label: 'Description (facultatif)', type: 'textarea', localized: true },
    { name: 'order', label: 'Ordre d’affichage', type: 'number', defaultValue: 0 },
  ],
}
