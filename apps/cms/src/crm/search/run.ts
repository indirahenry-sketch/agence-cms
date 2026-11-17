import type { Payload, Where } from 'payload'

import type { CrmZone } from '@/payload-types'

import { findOptOut, matchConditions } from '../dedupe'
import { guessType } from '../importExport'
import { crmKeys, type CrmKeys } from '../normalize'
import { type Candidate, type EtatStats, type Fetcher, fromEtat, fromOsm, fromWebsite } from './sources'

export type SearchTrigger = 'manuel' | 'planifie'
export type SearchOptions = { trigger: SearchTrigger; zoneIds?: number[]; target?: number }

/** Lundi 0 h (heure de Paris) de la semaine en cours. */
export const startOfWeekParis = (now = new Date()) => {
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const shift = now.getTime() - paris.getTime()
  const monday = new Date(paris)
  monday.setDate(paris.getDate() - ((paris.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return new Date(monday.getTime() + shift)
}

let running = false
export const isSearchRunning = () => running

type Found = Candidate & { keys: CrmKeys; zone: CrmZone }

/** Deux candidats décrivent-ils le même établissement ? (même logique que les doublons du CRM) */
const sameKeys = (a: CrmKeys, b: CrmKeys) =>
  Boolean(
    (a.sirenKey && a.sirenKey === b.sirenKey) ||
      (a.phoneKey && a.phoneKey === b.phoneKey) ||
      (a.emailKey && a.emailKey === b.emailKey) ||
      (a.domainKey && a.domainKey === b.domainKey) ||
      (a.nameKey && a.nameKey === b.nameKey && ((a.communeKey && a.communeKey === b.communeKey) || !a.communeKey || !b.communeKey)),
  )

/** Fusionne deux fiches du même établissement : on complète, on n'écrase jamais. */
const merge = (a: Found, b: Candidate): Found => {
  const out = { ...a }
  for (const k of ['commune', 'postalCode', 'address', 'siren', 'phone', 'email', 'website', 'naf'] as const) if (!out[k] && b[k]) out[k] = b[k]
  out.equestrianName = a.equestrianName || b.equestrianName
  out.sources = [...a.sources, ...b.sources.filter((s) => !a.sources.some((x) => x.url === s.url))]
  out.keys = crmKeys(out)
  return out
}

/** Plus une fiche est complète, plus elle passe en premier. */
const score = (c: Found) => (c.email ? 8 : 0) + (c.website ? 4 : 0) + (c.phone ? 2 : 0) + (c.equestrianName ? 1 : 0)

/**
 * Lance une recherche : interroge les sources, écarte doublons et « ne plus contacter »,
 * ajoute au plus `target` nouveaux prospects « À vérifier ». Rien n'est inventé.
 * Renvoie l'identifiant de la recherche (historique). Une seule recherche à la fois.
 */
export const runCrmSearch = async (payload: Payload, opts: SearchOptions, fetcher: Fetcher = fetch): Promise<number> => {
  if (running) throw new Error('Une recherche est déjà en cours.')
  running = true
  const base = { overrideAccess: true, depth: 0 } as const
  const startedAt = new Date().toISOString()
  let searchId = 0
  try {
    const settings = await payload.findGlobal({ slug: 'crm-settings', ...base })
    const where: Where = opts.zoneIds?.length
      ? { id: { in: opts.zoneIds } }
      : { and: [{ active: { equals: true } }, { kind: { equals: 'departement' } }, { country: { equals: 'France' } }] }
    const zones = (await payload.find({ collection: 'crm-zones', where, limit: 0, pagination: false, ...base })).docs
      .filter((z) => z.kind === 'departement' && z.country === 'France')
      .sort((a, b) => String(a.lastSearchedAt ?? '').localeCompare(String(b.lastSearchedAt ?? '')))

    const thisWeek = (await payload.count({ collection: 'crm-prospects', where: { createdAt: { greater_than_equal: startOfWeekParis().toISOString() } }, overrideAccess: true })).totalDocs
    const target = Math.max(0, opts.target ?? (settings.weeklyTarget ?? 0) - thisWeek)

    const search = await payload.create({
      collection: 'crm-searches',
      data: {
        trigger: opts.trigger,
        status: 'en-cours',
        startedAt,
        target,
        zones: zones.map((z) => z.id),
        sources: 'Annuaire des entreprises (État), OpenStreetMap, sites des établissements',
      },
      ...base,
    })
    searchId = search.id

    const report: string[] = []
    const stats: EtatStats = { calls: 0, failures: 0, excludedPublic: 0, excludedNetwork: 0 }
    let found = 0
    let duplicates = 0
    let optOuts = 0
    let breeders = 0
    const fresh: Found[] = []

    if (!zones.length) report.push('Aucune zone active : rien à chercher. Activez des départements dans « Zones de prospection ».')
    if (target === 0) report.push(`Objectif de la semaine déjà atteint (${thisWeek} nouveaux prospects) : aucune recherche lancée.`)

    for (const zone of target > 0 ? zones : []) {
      // On s'arrête dès qu'on a assez de nouvelles fiches (les zones restantes passeront la prochaine fois)
      if (fresh.length >= target * 1.5) break
      const etat = await fromEtat(zone.code, fetcher, stats)
      const osm = await fromOsm(zone.code, fetcher)
      const pool: Found[] = []
      for (const c of [...etat, ...(osm ?? [])]) {
        const keys = crmKeys(c)
        const i = pool.findIndex((p) => sameKeys(p.keys, keys))
        if (i >= 0) pool[i] = merge(pool[i], c)
        else pool.push({ ...c, keys, zone })
      }
      let zoneNew = 0
      for (const c of pool) {
        if (!c.equestrianName && !settings.includeBreeders) {
          breeders++
          continue
        }
        if (await findOptOut(payload, c.keys)) {
          optOuts++
          continue
        }
        const or = matchConditions(c.keys)
        if (or.length && (await payload.count({ collection: 'crm-prospects', where: { or }, overrideAccess: true })).totalDocs) {
          duplicates++
          continue
        }
        if (fresh.some((f) => sameKeys(f.keys, c.keys))) {
          duplicates++
          continue
        }
        fresh.push(c)
        zoneNew++
      }
      found += pool.length
      report.push(`${zone.label ?? zone.code} : ${pool.length} structure(s) trouvée(s), ${zoneNew} nouvelle(s)${osm === null ? ' (OpenStreetMap indisponible)' : ''}`)
      await payload.update({
        collection: 'crm-zones',
        id: zone.id,
        data: { lastSearchedAt: new Date().toISOString(), searchCount: (zone.searchCount ?? 0) + 1 },
        ...base,
        context: { skipAudit: true },
      })
    }

    // Les plus complètes d'abord, puis complément par le site de l'établissement
    const chosen = fresh.sort((a, b) => score(b) - score(a)).slice(0, target)
    let siteChecks = 0
    let siteEmails = 0
    const maxChecks = settings.maxSiteChecks ?? 60
    for (const c of chosen) {
      if (c.website && (!c.email || !c.phone) && siteChecks < maxChecks) {
        siteChecks++
        const w = await fromWebsite(c.website, fetcher)
        if (w.email && !c.email) {
          c.email = w.email
          siteEmails++
        }
        if (w.phone && !c.phone) c.phone = w.phone
        if (w.email || w.phone) c.sources.push({ label: 'Site de l’établissement', url: /^https?:/.test(c.website) ? c.website : `https://${c.website}` })
      }
    }

    let added = 0
    const now = new Date().toISOString()
    for (const c of chosen) {
      try {
        await payload.create({
          collection: 'crm-prospects',
          data: {
            name: c.name,
            type: guessType(`${c.name} ${c.naf === '01.43Z' ? 'elevage' : ''}`) as never,
            commune: c.commune,
            postalCode: c.postalCode,
            address: c.address,
            department: c.zone.id,
            siren: c.siren,
            phone: c.phone,
            email: c.email,
            website: c.website,
            websiteStatus: c.website ? 'site-existant' : 'a-verifier',
            status: 'a-verifier',
            verificationLevel: 'a-verifier',
            priority: c.equestrianName ? 'moyenne' : 'basse',
            discoveredAt: now,
            search: searchId,
            sources: c.sources.map((s) => ({ label: s.label, url: s.url, checkedAt: now })),
          },
          ...base,
        })
        added++
      } catch (err) {
        payload.logger.warn({ err }, 'Prospection : une fiche n’a pas pu être créée')
      }
    }

    const withEmail = chosen.filter((c) => c.email).length
    const withPhone = chosen.filter((c) => c.phone).length
    report.unshift(
      `${added} nouveau(x) prospect(s) ajouté(s) sur un objectif de ${target}.`,
      `Avec e-mail : ${withEmail} (dont ${siteEmails} lu(s) sur le site) · avec téléphone : ${withPhone} · avec site : ${chosen.filter((c) => c.website).length}.`,
      added < target && target > 0 ? `Moins que l’objectif : les sources gratuites n’ont pas fourni plus de structures nouvelles et vérifiables. Rien n’a été inventé.` : '',
      `Écartés : ${duplicates} déjà connu(s), ${optOuts} « ne plus contacter », ${breeders} élevage(s) sans nom équestre${settings.includeBreeders ? '' : ' (réglage)'}, ${stats.excludedPublic} structure(s) publique(s), ${stats.excludedNetwork} réseau(x).`,
      '',
    )
    if (stats.failures) report.push(`Annuaire des entreprises : ${stats.failures} requête(s) en échec sur ${stats.calls}.`)

    await payload.update({
      collection: 'crm-searches',
      id: searchId,
      data: {
        status: 'terminee',
        finishedAt: new Date().toISOString(),
        found,
        added,
        duplicates,
        rejected: optOuts + breeders + stats.excludedPublic + stats.excludedNetwork,
        report: report.filter((l, i) => l || i < report.length - 1).join('\n'),
      },
      ...base,
    })
    payload.logger.info(`Prospection : recherche ${searchId} terminée, ${added} ajouté(s)`)
    return searchId
  } catch (err) {
    payload.logger.error({ err }, 'Prospection : recherche échouée')
    if (searchId) {
      await payload
        .update({
          collection: 'crm-searches',
          id: searchId,
          data: { status: 'echouee', finishedAt: new Date().toISOString(), report: `Erreur : ${err instanceof Error ? err.message : String(err)}` },
          ...base,
        })
        .catch(() => {})
    }
    throw err
  } finally {
    running = false
  }
}
