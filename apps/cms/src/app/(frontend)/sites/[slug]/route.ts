import config from '@payload-config'
import { getPayload } from 'payload'

import { renderSite } from '@/sites/render'

// Toujours relu à chaque visite : une modification dans le CMS apparaît immédiatement
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const html = await renderSite(payload, slug)
  if (!html) {
    return new Response('<!doctype html><meta charset="utf-8"><title>Site introuvable</title><p>Ce site n’existe pas ou n’est pas encore en ligne.</p>', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
