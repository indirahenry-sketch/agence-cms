import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

import { categoriesOfType } from './Categories'

export const SERVICE_ICONS = [
  { label: 'Personne', value: 'person' },
  { label: 'Médaille', value: 'medal' },
  { label: 'Maison', value: 'home' },
  { label: 'Cœur', value: 'heart' },
  { label: 'Progression', value: 'chart' },
  { label: 'Calendrier', value: 'calendar' },
  { label: 'Étoile', value: 'star' },
]

/** Prestations du client (cours, pension, soins…), affichées dans la section Services du site. */
export const Services: CollectionConfig = {
  slug: 'services',
  labels: { singular: 'Service', plural: 'Services' },
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'category'], group: 'Contenus' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('services')],
    afterDelete: [auditDelete('services')],
  },
  // Ordre par glisser-déposer dans la liste (poignée à gauche) ; corbeille de 30 jours
  orderable: true,
  trash: true,
  defaultSort: '_order',
  fields: [
    { name: 'title', label: 'Nom du service', type: 'text', localized: true, required: true },
    { name: 'summary', label: 'Phrase de présentation', type: 'textarea', localized: true },
    {
      name: 'points',
      label: 'Points forts',
      type: 'array',
      labels: { singular: 'Point', plural: 'Points' },
      fields: [{ name: 'text', label: 'Texte', type: 'text', localized: true, required: true }],
    },
    {
      type: 'row',
      fields: [
        { name: 'icon', label: 'Icône', type: 'select', options: SERVICE_ICONS, defaultValue: 'star' },
        { name: 'category', label: 'Catégorie', type: 'relationship', relationTo: 'categories', filterOptions: categoriesOfType('services') },
        { name: 'order', label: 'Ordre', type: 'number', defaultValue: 0, admin: { hidden: true } },
      ],
    },
    {
      name: 'audiences',
      label: 'Profils concernés (vide = tout le monde)',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'Je débute', value: 'debutant' },
        { label: 'Je monte en loisir', value: 'loisir' },
        { label: 'Je sors en concours', value: 'compet' },
        { label: 'J’ai mon cheval', value: 'proprio' },
      ],
      admin: { description: 'Sert au filtre « Trouve ce qui te correspond » du site.' },
    },
  ],
}
