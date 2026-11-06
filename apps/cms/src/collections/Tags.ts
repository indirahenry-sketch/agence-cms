import type { CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

/** Mots-clés libres pour organiser articles et médias (ex. « concours », « poneys »). */
export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Tag', plural: 'Tags' },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'updatedAt'], group: 'Organisation' },
  access: tenantCollectionAccess(),
  hooks: {
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('tags')],
    afterDelete: [auditDelete('tags')],
  },
  defaultSort: 'name',
  fields: [{ name: 'name', label: 'Nom', type: 'text', localized: true, required: true }],
}
