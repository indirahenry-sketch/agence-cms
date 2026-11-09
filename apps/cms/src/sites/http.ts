import type { Payload } from 'payload'

import { normalizePath } from '@/collections/Redirects'
import type { RenderOptions } from './render'

/**
 * Outils communs aux routes des sites publics.
 *
 * `x-site-domain` est posé par proxy.ts (jamais par le navigateur : proxy.ts l'efface) quand
 * la visite arrive par le nom de domaine du client : les liens sont alors écrits sans le
 * préfixe /sites/<identifiant>.
 */
export const siteOptions = (req: Request): RenderOptions => (req.headers.get('x-site-domain') ? { base: '' } : {})

/** `personal` : page contenant la barre « Mode édition » d'un utilisateur connecté, jamais mise en cache. */
export const htmlResponse = (html: string, status = 200, personal = false) =>
  new Response(html, {
    // Site en maintenance : « indisponible temporairement » pour Google
    status: html.startsWith('<!doctype html><html lang="fr" data-maintenance>') ? 503 : status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': personal ? 'private, no-store' : 'no-cache',
      // Maquettes non référencées tant que le site n'est pas marqué « visible sur Google »
      ...(html.includes('content="noindex') ? { 'x-robots-tag': 'noindex, nofollow' } : {}),
    },
  })

export const notFoundPage = (message = 'Cette page n’existe pas ou n’est pas publiée.') =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable</title><body style="font:16px/1.5 system-ui;padding:40px 20px;max-width:560px;margin:auto"><h1>Page introuvable</h1><p>${message}</p><p><a href="./">Retour à l’accueil</a></p></body>`,
    { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } },
  )

/** Redirection enregistrée par le client pour cette ancienne adresse, s'il y en a une. */
export async function findRedirect(payload: Payload, siteSlug: string, path: string, opts: RenderOptions): Promise<Response | null> {
  const { docs: tenants } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = tenants[0]
  if (!tenant) return null
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { and: [{ tenant: { equals: tenant.id } }, { from: { equals: normalizePath(path) } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const r = docs[0]
  if (!r) return null
  const base = opts.base ?? `/sites/${siteSlug}`
  // Une destination interne (« /tarifs ») reste sur le site du client
  const to = r.to.startsWith('/') && !r.to.startsWith('//') ? `${base}${r.to === '/' ? '' : r.to}` || '/' : r.to
  return new Response(null, { status: r.type === '302' ? 302 : 301, headers: { location: to } })
}
