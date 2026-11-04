import type { CollectionConfig } from 'payload'

import { isSuperAdmin } from '@/access/roles'
import { superAdminOnly } from '@/access/tenantAccess'

/** Journal d'audit : en lecture seule, visible uniquement par le super admin. */
export const AuditLogs: CollectionConfig = {
  slug: 'audit-logs',
  labels: { singular: 'Entrée du journal', plural: 'Journal d’audit' },
  admin: {
    useAsTitle: 'targetCollection',
    defaultColumns: ['createdAt', 'action', 'targetCollection', 'documentId', 'tenant', 'user'],
    group: 'Agence',
    hidden: ({ user }) => !isSuperAdmin(user),
  },
  access: {
    read: superAdminOnly,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'action',
      type: 'select',
      required: true,
      options: [
        { label: 'Création', value: 'create' },
        { label: 'Modification', value: 'update' },
        { label: 'Suppression', value: 'delete' },
      ],
    },
    { name: 'targetCollection', label: 'Collection', type: 'text', required: true, index: true },
    { name: 'documentId', label: 'Document', type: 'text', required: true },
    { name: 'tenant', label: 'Client', type: 'relationship', relationTo: 'tenants', index: true },
    { name: 'user', label: 'Par', type: 'relationship', relationTo: 'users' },
    { name: 'fields', label: 'Champs modifiés', type: 'text' },
  ],
}
