import config from '@payload-config'
import { getPayload } from 'payload'

import { isTenantInactive } from '@/access/roles'
import { internalToken } from '@/lib/internalToken'

export const dynamic = 'force-dynamic'

/** Correspondance « nom de domaine → client », lue par proxy.ts. Appel interne uniquement. */
export async function GET(req: Request) {
  if (req.headers.get('x-internal') !== internalToken()) return new Response('Introuvable', { status: 404 })
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tenants', limit: 0, depth: 0, overrideAccess: true, pagination: false })
  const map: Record<string, string> = {}
  for (const t of docs) {
    if (isTenantInactive(t)) continue
    for (const row of t.domains ?? []) {
      const host = normalizeHost(row.domain)
      if (host) map[host] = t.slug
    }
  }
  return Response.json(map, { headers: { 'cache-control': 'no-store' } })
}

const normalizeHost = (value: string) =>
  value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^www\./, '')
