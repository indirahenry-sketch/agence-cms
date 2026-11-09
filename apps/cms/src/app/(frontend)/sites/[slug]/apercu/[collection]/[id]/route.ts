import config from '@payload-config'
import { headers } from 'next/headers'
import { getPayload } from 'payload'

import { getTenantIDs, isSuperAdmin, sameID } from '@/access/roles'
import { htmlResponse, notFoundPage, siteOptions } from '@/sites/http'
import { renderPage, renderPost } from '@/sites/render'

export const dynamic = 'force-dynamic'

/**
 * Aperçu d'un brouillon (bouton « Aperçu » des pages et articles).
 * Réservé à un utilisateur CONNECTÉ, membre du client (ou à l'agence) : les visiteurs
 * et les autres clients reçoivent une page introuvable.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; collection: string; id: string }> }) {
  const { slug, collection, id } = await params
  if (!/^\d+$/.test(id) || (collection !== 'pages' && collection !== 'posts')) return notFoundPage()
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })
  if (!user) return notFoundPage('Connectez-vous à l’espace de gestion pour voir cet aperçu.')
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = docs[0]
  if (!tenant || (!isSuperAdmin(user) && !getTenantIDs(user).some((t) => sameID(t, tenant.id)))) return notFoundPage()

  const render = collection === 'pages' ? renderPage : renderPost
  const html = await render(payload, slug, '', { ...siteOptions(req), draftID: id })
  if (!html) return notFoundPage()
  const banner =
    '<div style="position:sticky;top:0;z-index:999;background:#6d28d9;color:#fff;font:600 14px/1.4 system-ui;padding:8px 14px;text-align:center">Aperçu du brouillon — non visible des visiteurs</div>'
  const res = htmlResponse(html.replace(/<body([^>]*)>/, `<body$1>${banner}`))
  res.headers.set('x-robots-tag', 'noindex, nofollow')
  res.headers.set('cache-control', 'private, no-store')
  return res
}
