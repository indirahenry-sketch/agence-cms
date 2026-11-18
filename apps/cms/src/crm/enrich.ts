/**
 * « Compléter automatiquement » : pour les prospects DÉJÀ enregistrés qui ont un site mais pas
 * de téléphone ou pas d'e-mail, lit leur site (page d'accueil puis /contact, robots.txt respecté)
 * et remplit UNIQUEMENT les champs vides. Rien n'est écrasé ni inventé : une information trouvée
 * est « À vérifier », avec la source.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { CrmProspect } from '@/payload-types'

import { emailKey } from './normalize'
import { type Fetcher, fromWebsite } from './search/sources'

export const ENRICH_SOURCE = 'Site de l’établissement'

export type EnrichOutcome = 'complete' | 'rien-trouve' | 'site-injoignable' | 'deja-complet' | 'sans-site' | 'ne-plus-contacter'

const blank = (v?: string | null) => !String(v ?? '').trim()

/** Fiche à compléter : un site, pas « ne plus contacter », et un téléphone ou un e-mail manquant. */
export const needsEnrich = (p: Pick<CrmProspect, 'website' | 'phone' | 'email' | 'doNotContact'>) =>
  !blank(p.website) && !p.doNotContact && (blank(p.phone) || blank(p.email))

/** Complète une fiche. Renvoie ce qui s'est passé et ce qui a été ajouté. */
export const enrichProspect = async (
  payload: Payload,
  p: CrmProspect,
  { fetcher = fetch, req }: { fetcher?: Fetcher; req?: PayloadRequest } = {},
): Promise<{ outcome: EnrichOutcome; phone?: string; email?: string }> => {
  if (p.doNotContact) return { outcome: 'ne-plus-contacter' }
  if (blank(p.website)) return { outcome: 'sans-site' }
  if (!blank(p.phone) && !blank(p.email)) return { outcome: 'deja-complet' }

  const found = await fromWebsite(p.website!, fetcher)
  const data: Partial<CrmProspect> = {}
  if (blank(p.phone) && found.phone) data.phone = found.phone
  if (blank(p.email) && found.email && emailKey(found.email)) data.email = found.email
  if (!data.phone && !data.email) return { outcome: found.reachable ? 'rien-trouve' : 'site-injoignable' }

  const url = /^https?:\/\//i.test(p.website!) ? p.website! : `https://${p.website}`
  const sources = p.sources ?? []
  data.sources = sources.some((s) => s.url === url) ? sources : [...sources, { label: ENRICH_SOURCE, url, checkedAt: new Date().toISOString() }]
  await payload.update({ collection: 'crm-prospects', id: p.id, data, depth: 0, overrideAccess: true, req })
  return { outcome: 'complete', phone: data.phone ?? undefined, email: data.email ?? undefined }
}

let running = false
export const isEnrichRunning = () => running

/**
 * Complète toute la base (ou une liste de fiches), une fiche à la fois.
 * Le déroulé et le résultat apparaissent dans l'historique des recherches.
 */
export const runCrmEnrich = async (payload: Payload, { ids, fetcher = fetch }: { ids?: number[]; fetcher?: Fetcher } = {}): Promise<number> => {
  if (running) throw new Error('Un complément des coordonnées est déjà en cours.')
  running = true
  const base = { overrideAccess: true, depth: 0 } as const
  const search = await payload.create({
    collection: 'crm-searches',
    data: { trigger: 'completion', status: 'en-cours', startedAt: new Date().toISOString(), sources: 'Sites des établissements (page d’accueil et contact)' },
    ...base,
  })
  try {
    const { docs } = await payload.find({
      collection: 'crm-prospects',
      where: { and: [{ website: { exists: true } }, { doNotContact: { not_equals: true } }, ...(ids?.length ? [{ id: { in: ids } }] : [])] },
      limit: 0,
      pagination: false,
      sort: 'name',
      ...base,
    })
    const todo = docs.filter(needsEnrich)
    const done: string[] = []
    const nothing: string[] = []
    const unreachable: string[] = []
    for (const p of todo) {
      const r = await enrichProspect(payload, p, { fetcher }).catch(() => ({ outcome: 'site-injoignable' as const, phone: undefined, email: undefined }))
      if (r.outcome === 'complete') done.push(`${p.name} : ${[r.phone && `tél. ${r.phone}`, r.email].filter(Boolean).join(', ')}`)
      else if (r.outcome === 'rien-trouve') nothing.push(p.name)
      else if (r.outcome === 'site-injoignable') unreachable.push(p.name)
    }
    const list = (title: string, l: string[]) => (l.length ? [`${title} :`, ...l.map((x) => `- ${x}`)] : [])
    await payload.update({
      collection: 'crm-searches',
      id: search.id,
      data: {
        status: 'terminee',
        finishedAt: new Date().toISOString(),
        found: todo.length,
        added: done.length,
        report: [
          `${done.length} fiche(s) complétée(s) sur ${todo.length} à compléter (avec un site).`,
          'Les fiches sans site ne peuvent pas être complétées automatiquement : utilise « Chercher les coordonnées » sur la fiche.',
          ...list('Complétées (à vérifier)', done),
          ...list('Rien d’affiché sur le site', nothing),
          ...list('Site injoignable ou lecture refusée', unreachable),
        ].join('\n'),
      },
      ...base,
      context: { skipAudit: true },
    })
  } catch (err) {
    await payload
      .update({ collection: 'crm-searches', id: search.id, data: { status: 'echouee', finishedAt: new Date().toISOString(), report: String(err) }, ...base })
      .catch(() => {})
  } finally {
    running = false
  }
  return search.id
}
