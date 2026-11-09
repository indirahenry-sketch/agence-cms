import config from '@payload-config'
import { getPayload } from 'payload'

import { isTenantInactive } from '@/access/roles'
import { siteOptions } from '@/sites/http'

export const dynamic = 'force-dynamic'

/** Consignes aux moteurs de recherche : tout bloquer tant que le site n'est pas « visible sur Google ». */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = docs[0]
  const open = tenant && !isTenantInactive(tenant) && tenant.indexable
  const opts = siteOptions(req)
  const url = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const text = open
    ? `User-agent: *\nAllow: /\nSitemap: ${proto}://${host}${opts.base ?? `/sites/${slug}`}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n'
  return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
