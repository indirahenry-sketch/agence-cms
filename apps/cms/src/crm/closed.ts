/**
 * Entreprises qui n'existent plus : vérification par le SIREN dans l'Annuaire des entreprises
 * (API publique recherche-entreprises.api.gouv.fr). Une entreprise « cessée » passe au statut
 * « N'existe plus (fermée) », avec une note de suivi et la source. Rien n'est supprimé.
 */
import type { Payload, PayloadRequest } from 'payload'

import type { CrmProspect } from '@/payload-types'

import type { Fetcher } from './search/sources'

const API = 'https://recherche-entreprises.api.gouv.fr/search'
const sirenOf = (v?: string | null) => String(v ?? '').replace(/\D/g, '').slice(0, 9)

export type ClosedCheck = { state: 'fermee' | 'active' | 'introuvable' | 'erreur'; closedOn?: string | null }

/** État de l'entreprise d'après son SIREN. */
export const checkSiren = async (siren: string, fetcher: Fetcher = fetch): Promise<ClosedCheck> => {
  const s = sirenOf(siren)
  if (s.length !== 9) return { state: 'introuvable' }
  try {
    const res = await fetcher(`${API}?q=${s}&per_page=1`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return { state: 'erreur' }
    const j = (await res.json()) as { results?: { siren: string; etat_administratif?: string; date_fermeture?: string | null }[] }
    const hit = j.results?.find((r) => r.siren === s)
    if (!hit) return { state: 'introuvable' }
    return hit.etat_administratif === 'C' ? { state: 'fermee', closedOn: hit.date_fermeture ?? null } : { state: 'active' }
  } catch {
    return { state: 'erreur' }
  }
}

/** Passe la fiche en « N'existe plus » avec une note qui explique pourquoi. */
export const markClosed = async (payload: Payload, p: Pick<CrmProspect, 'id' | 'name' | 'siren'>, closedOn: string | null | undefined, req?: PayloadRequest) => {
  const when = closedOn ? new Intl.DateTimeFormat('fr-FR').format(new Date(closedOn)) : null
  await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'ferme' }, depth: 0, overrideAccess: true, req })
  await payload.create({
    collection: 'crm-activities',
    data: {
      prospect: p.id,
      kind: 'note',
      date: new Date().toISOString(),
      summary: `Entreprise fermée${when ? ` le ${when}` : ''} d'après l'Annuaire des entreprises (SIREN ${sirenOf(p.siren)}) : passée en « N'existe plus ». https://annuaire-entreprises.data.gouv.fr/entreprise/${sirenOf(p.siren)}`,
    },
    depth: 0,
    overrideAccess: true,
    req,
  })
}

/** Vérifie les fiches qui ont un SIREN (hors « N'existe plus ») et marque celles qui sont fermées. */
export const checkClosedProspects = async (
  payload: Payload,
  { ids, fetcher = fetch, req, pauseMs = 200 }: { ids?: number[]; fetcher?: Fetcher; req?: PayloadRequest; pauseMs?: number } = {},
) => {
  const { docs } = await payload.find({
    collection: 'crm-prospects',
    where: { and: [{ siren: { exists: true } }, { status: { not_equals: 'ferme' } }, ...(ids?.length ? [{ id: { in: ids } }] : [])] },
    select: { name: true, siren: true },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    req,
  })
  const result = { checked: 0, closed: [] as { id: number; name: string; closedOn?: string | null }[], errors: 0 }
  for (const p of docs) {
    if (sirenOf(p.siren).length !== 9) continue
    const r = await checkSiren(p.siren!, fetcher)
    result.checked++
    if (r.state === 'erreur') result.errors++
    if (r.state === 'fermee') {
      await markClosed(payload, p as CrmProspect, r.closedOn, req)
      result.closed.push({ id: p.id, name: p.name, closedOn: r.closedOn })
    }
    if (pauseMs) await new Promise((ok) => setTimeout(ok, pauseMs)) // l'API publique limite le débit
  }
  return result
}
