import type { GeneratePreviewURL } from 'payload'

import { extractID } from '@/access/roles'

/**
 * Bouton « Aperçu » des pages et articles : ouvre le site avec le BROUILLON en cours,
 * visible seulement par un membre connecté du client (voir la route /sites/<client>/apercu).
 */
export const previewURL =
  (collection: 'pages' | 'posts'): GeneratePreviewURL =>
  async (doc, { req }) => {
    const tenantID = extractID(doc?.tenant)
    if (!tenantID || !doc?.id) return null
    const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!tenant?.slug) return null
    return `/sites/${encodeURIComponent(tenant.slug)}/apercu/${collection}/${doc.id}`
  }
