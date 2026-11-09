import type { Payload, Where } from 'payload'

/**
 * Compte une visite d'un site public, sans cookie et sans conserver l'adresse IP.
 * Ignorés : robots, aperçus du tableau de bord, et les personnes connectées au CMS
 * (l'agence et le client lui-même ne gonflent pas les chiffres).
 * Ne ralentit jamais la page : l'écriture se fait après la réponse et ses erreurs sont ignorées.
 */
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|monitor|uptime|curl|wget|python|headless|lighthouse|pingdom/i

const parisDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())

export const sourceOf = (referer: string | null, ownHost: string | null): string => {
  if (!referer) return 'direct'
  try {
    const host = new URL(referer).hostname.replace(/^www\./, '')
    if (ownHost && host === ownHost.replace(/^www\./, '').replace(/:\d+$/, '')) return 'interne'
    if (/(^|\.)google\./.test(host)) return 'Google'
    if (/(^|\.)(facebook|fb)\.com$|(^|\.)l\.facebook/.test(host)) return 'Facebook'
    if (/instagram\.com$/.test(host)) return 'Instagram'
    if (/bing\.com$/.test(host)) return 'Bing'
    return host.slice(0, 80)
  } catch {
    return 'direct'
  }
}

export function recordVisit(payload: Payload, req: Request, siteSlug: string, path: string): void {
  if (process.env.SITE_STATS === 'false') return
  const ua = req.headers.get('user-agent') ?? ''
  const referer = req.headers.get('referer')
  if (!ua || BOTS.test(ua)) return
  if ((req.headers.get('cookie') ?? '').includes('payload-token=')) return
  if (referer && /\/admin(\/|$)/.test(new URL(referer, 'http://x').pathname)) return
  if (req.headers.get('purpose') === 'prefetch' || req.headers.get('sec-purpose')?.includes('prefetch')) return

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
  const source = sourceOf(referer, host)
  const day = parisDay()

  void (async () => {
    try {
      const { docs: tenants } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 0, overrideAccess: true })
      const tenant = tenants[0]?.id
      if (!tenant) return
      const where: Where = { and: [{ tenant: { equals: tenant } }, { day: { equals: day } }, { path: { equals: path } }, { source: { equals: source } }] }
      const { docs } = await payload.find({ collection: 'site-stats', where, limit: 1, depth: 0, overrideAccess: true })
      if (docs[0]) {
        await payload.update({ collection: 'site-stats', id: docs[0].id, data: { views: (docs[0].views ?? 0) + 1 }, overrideAccess: true })
      } else {
        await payload.create({ collection: 'site-stats', data: { tenant, day, path, source, views: 1 }, overrideAccess: true })
      }
    } catch {
      /* une statistique perdue n'est pas grave */
    }
  })()
}

/** Résumé pour le tableau de bord : visites des 30 derniers jours, par jour, page et provenance. */
export async function statsSummary(payload: Payload, tenantIDs: (number | string)[] | 'all', days = 30) {
  const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - (days - 1) * 864e5))
  const where: Where = tenantIDs === 'all' ? { day: { greater_than_equal: since } } : { and: [{ tenant: { in: tenantIDs } }, { day: { greater_than_equal: since } }] }
  const { docs } = await payload.find({ collection: 'site-stats', where, limit: 5000, depth: 0, overrideAccess: true, pagination: false })
  const byDay = new Map<string, number>()
  const byPath = new Map<string, number>()
  const bySource = new Map<string, number>()
  const byTenant = new Map<string, number>()
  let total = 0
  for (const r of docs) {
    const v = r.views ?? 0
    total += v
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + v)
    byPath.set(r.path, (byPath.get(r.path) ?? 0) + v)
    if (r.source !== 'interne') bySource.set(r.source || 'direct', (bySource.get(r.source || 'direct') ?? 0) + v)
    const t = String(typeof r.tenant === 'object' && r.tenant ? r.tenant.id : r.tenant)
    byTenant.set(t, (byTenant.get(t) ?? 0) + v)
  }
  const series: { day: string; views: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() - i * 864e5))
    series.push({ day, views: byDay.get(day) ?? 0 })
  }
  const top = (m: Map<string, number>, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  return { total, series, pages: top(byPath), sources: top(bySource), byTenant }
}
