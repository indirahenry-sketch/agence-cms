import config from '@payload-config'
import { getPayload } from 'payload'

import { renderPage } from '@/sites/render'

export const dynamic = 'force-dynamic'

/** Une page créée dans le CMS (ex. /sites/ecuries-poigny/mentions-legales). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const payload = await getPayload({ config })
  const html = await renderPage(payload, slug, decodeURIComponent(page))
  if (!html) {
    return new Response('<!doctype html><meta charset="utf-8"><title>Page introuvable</title><p>Cette page n’existe pas ou n’est pas publiée.</p>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-robots-tag': 'noindex, nofollow', 'x-content-type-options': 'nosniff' },
  })
}
