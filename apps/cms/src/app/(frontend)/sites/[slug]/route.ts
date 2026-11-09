import config from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, notFoundPage, siteOptions } from '@/sites/http'
import { renderSite } from '@/sites/render'
import { recordVisit } from '@/sites/stats'
import { withEditBar } from '@/sites/editBar'

// Toujours relu à chaque visite : une modification dans le CMS apparaît immédiatement
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const html = await renderSite(payload, slug, siteOptions(req))
  if (!html) return notFoundPage('Ce site n’existe pas ou n’est pas encore en ligne.')
  recordVisit(payload, req, slug, '/')
  const edit = await withEditBar(payload, req, slug, html)
  return htmlResponse(edit.html, 200, edit.personal)
}
