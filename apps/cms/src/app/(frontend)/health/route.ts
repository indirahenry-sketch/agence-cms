import config from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

/**
 * État du serveur : répond 200 si le CMS et la base répondent.
 * Sert au réveil automatique (lib/keepAwake.ts) et à tout outil de surveillance.
 * La petite requête en base garde aussi la base Supabase active (pause après 7 jours sans activité).
 */
export async function GET() {
  const started = Date.now()
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'tenants', overrideAccess: true })
    return Response.json({ ok: true, db: 'ok', ms: Date.now() - started }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ ok: false, db: 'error' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
}
