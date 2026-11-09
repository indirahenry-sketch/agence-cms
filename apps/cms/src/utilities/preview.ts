import type { GeneratePreviewURL, LivePreviewConfig } from 'payload'

import { extractID } from '@/access/roles'
import { getServerURL } from '@/utilities/serverURL'

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

const slugCache = new Map<string, { slug: string; at: number }>()

/**
 * Adresse de l'aperçu en direct (écran partagé). Doit être ABSOLUE : Payload n'échange de messages
 * qu'avec la même origine. Appelée souvent (sauvegarde automatique) : l'identifiant court est mis en cache.
 */
export const livePreviewURL: NonNullable<LivePreviewConfig['url']> = async ({ data, collectionConfig, req }) => {
  const tenantID = extractID(data?.tenant)
  if (!tenantID || !data?.id || !collectionConfig) return null
  const key = String(tenantID)
  let slug = slugCache.get(key)?.at && Date.now() - slugCache.get(key)!.at < 60_000 ? slugCache.get(key)!.slug : ''
  if (!slug) {
    const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true, req, disableErrors: true })
    if (!tenant?.slug) return null
    slug = tenant.slug
    slugCache.set(key, { slug, at: Date.now() })
  }
  return `${getServerURL(req)}/sites/${encodeURIComponent(slug)}/apercu/${collectionConfig.slug}/${data.id}?live=1`
}
