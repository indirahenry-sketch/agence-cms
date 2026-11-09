import config from '@payload-config'
import { getPayload } from 'payload'

import { findRedirect, htmlResponse, notFoundPage, siteOptions } from '@/sites/http'
import { renderPost } from '@/sites/render'
import { recordVisit } from '@/sites/stats'

export const dynamic = 'force-dynamic'

/** Un article publié, sur sa propre page (ex. /sites/ecuries-poigny/blog/stage-de-noel). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; post: string }> }) {
  const { slug, post } = await params
  const payload = await getPayload({ config })
  const opts = siteOptions(req)
  const postSlug = decodeURIComponent(post)
  const html = await renderPost(payload, slug, postSlug, opts)
  if (html) {
    recordVisit(payload, req, slug, `/blog/${postSlug}`)
    return htmlResponse(html)
  }
  return (await findRedirect(payload, slug, `/blog/${postSlug}`, opts)) ?? notFoundPage()
}
