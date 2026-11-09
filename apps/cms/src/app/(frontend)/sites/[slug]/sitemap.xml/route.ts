import config from '@payload-config'
import { getPayload } from 'payload'

import { siteOptions } from '@/sites/http'
import { siteURLs } from '@/sites/render'
import { escapeHTML } from '@/utilities/serverURL'

export const dynamic = 'force-dynamic'

/** Plan du site pour Google : accueil, pages publiées, articles publiés. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const data = await siteURLs(payload, slug)
  if (!data) return new Response('Introuvable', { status: 404 })
  const opts = siteOptions(req)
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const origin = `${proto}://${host}${opts.base ?? `/sites/${slug}`}`
  const body = data.paths
    .map((p) => `<url><loc>${escapeHTML(origin + p.path || '/')}</loc><lastmod>${p.updatedAt.slice(0, 10)}</lastmod></url>`)
    .join('')
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  })
}
