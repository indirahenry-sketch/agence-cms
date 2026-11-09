import type { CollectionConfig, Validate } from 'payload'

import { ADMIN_ONLY } from '@/access/roles'
import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { validateURL } from '@/utilities/safeURL'

/** Normalise une ancienne adresse : « /ancienne-page » sans domaine, sans « / » final. */
export const normalizePath = (value: string): string => {
  let v = value.trim()
  try {
    if (/^https?:\/\//i.test(v)) v = new URL(v).pathname
  } catch {
    /* adresse invalide : gardée telle quelle */
  }
  v = '/' + v.replace(/^\/+/, '').replace(/\/+$/, '')
  return decodeURIComponent(v).toLowerCase()
}

const validateFrom: Validate = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Obligatoire'
  const v = normalizePath(value)
  if (v === '/') return 'La page d’accueil ne peut pas être redirigée.'
  return true
}

/**
 * Redirections : quand une page change d'adresse (ou après la reprise d'un ancien site),
 * les visiteurs et Google qui arrivent sur l'ancienne adresse sont envoyés vers la nouvelle.
 */
export const Redirects: CollectionConfig = {
  slug: 'redirects',
  labels: { singular: 'Redirection', plural: 'Redirections' },
  admin: {
    useAsTitle: 'from',
    defaultColumns: ['from', 'to', 'type', 'updatedAt'],
    group: 'Site',
    description: 'Ancienne adresse → nouvelle adresse. Utile après un changement d’adresse de page ou la reprise d’un ancien site.',
  },
  access: tenantCollectionAccess(ADMIN_ONLY),
  hooks: {
    beforeChange: [
      enforceTenant(ADMIN_ONLY),
      ({ data }) => {
        if (typeof data.from === 'string') data.from = normalizePath(data.from)
        return data
      },
    ],
    afterChange: [auditChange('redirects')],
    afterDelete: [auditDelete('redirects')],
  },
  fields: [
    {
      name: 'from',
      label: 'Ancienne adresse',
      type: 'text',
      required: true,
      index: true,
      validate: validateFrom,
      admin: { placeholder: '/ancienne-page', description: 'Le chemin seul, ex. /nos-tarifs (le domaine est ignoré).' },
    },
    {
      name: 'to',
      label: 'Nouvelle adresse',
      type: 'text',
      required: true,
      validate: validateURL,
      admin: { placeholder: '/tarifs ou https://…' },
    },
    {
      name: 'type',
      label: 'Type',
      type: 'select',
      defaultValue: '301',
      options: [
        { label: 'Définitive (301) — Google retient la nouvelle adresse', value: '301' },
        { label: 'Temporaire (302)', value: '302' },
      ],
    },
  ],
}
