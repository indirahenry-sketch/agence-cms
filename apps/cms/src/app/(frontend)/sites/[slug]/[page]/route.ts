import config from '@payload-config'
import { getPayload } from 'payload'

import { findRedirect, htmlResponse, notFoundPage, siteOptions } from '@/sites/http'
import { renderPage } from '@/sites/render'
import { recordVisit } from '@/sites/stats'

export const dynamic = 'force-dynamic'

/** Une page créée dans le CMS (ex. /sites/ecuries-poigny/mentions-legales). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; page: string }> }) {
  const { slug, page } = await params
  const payload = await getPayload({ config })
  const opts = siteOptions(req)
  const pageSlug = decodeURIComponent(page)
  const html = await renderPage(payload, slug, pageSlug, opts)
  if (html) {
    recordVisit(payload, req, slug, `/${pageSlug}`)
    return htmlResponse(html)
  }
  return (await findRedirect(payload, slug, `/${pageSlug}`, opts)) ?? notFoundPage()
}
