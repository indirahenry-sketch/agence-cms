import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload'

import { extractID } from '@/access/roles'

const IGNORED_FIELDS = new Set(['updatedAt', 'createdAt', 'hash', 'salt', 'resetPasswordToken', 'resetPasswordExpiration', 'sessions'])

const changedFields = (doc: Record<string, unknown>, previous?: Record<string, unknown>): string[] => {
  if (!previous) return []
  return Object.keys(doc).filter(
    (key) => !IGNORED_FIELDS.has(key) && JSON.stringify(doc[key]) !== JSON.stringify(previous[key]),
  )
}

/**
 * Journal d'audit : qui a fait quoi, quand, sur quel client.
 * Écrit sans contrôle d'accès (c'est le système qui écrit) mais dans la même transaction.
 */
export const auditChange =
  (collectionSlug: string): CollectionAfterChangeHook =>
  async ({ req, doc, previousDoc, operation }) => {
    if (req.context?.skipAudit) return doc
    await req.payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      context: { skipAudit: true },
      data: {
        action: operation,
        targetCollection: collectionSlug,
        documentId: String(doc.id),
        tenant: (extractID(doc.tenant) as number | null) ?? undefined,
        user: (req.user?.id as number | undefined) ?? undefined,
        fields: operation === 'update' ? changedFields(doc, previousDoc).join(', ') : undefined,
      },
    })
    return doc
  }

export const auditDelete =
  (collectionSlug: string): CollectionAfterDeleteHook =>
  async ({ req, doc }) => {
    if (req.context?.skipAudit) return doc
    await req.payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      context: { skipAudit: true },
      data: {
        action: 'delete',
        targetCollection: collectionSlug,
        documentId: String(doc.id),
        tenant: (extractID(doc.tenant) as number | null) ?? undefined,
        user: (req.user?.id as number | undefined) ?? undefined,
      },
    })
    return doc
  }
