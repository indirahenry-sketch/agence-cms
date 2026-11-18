import type { Payload, PayloadRequest, Where } from 'payload'

import type { CrmKeys } from './normalize'

export type DuplicateReason = 'nom-commune' | 'telephone' | 'email' | 'site' | 'siren'

/** Conditions « même établissement » à partir des clés renseignées (une clé vide ne compte jamais). */
export const matchConditions = (k: Partial<CrmKeys>): Where[] => {
  const or: Where[] = []
  if (k.phoneKey) or.push({ phoneKey: { equals: k.phoneKey } })
  if (k.emailKey) or.push({ emailKey: { equals: k.emailKey } })
  if (k.domainKey) or.push({ domainKey: { equals: k.domainKey } })
  if (k.sirenKey) or.push({ sirenKey: { equals: k.sirenKey } })
  if (k.nameKey && k.communeKey) or.push({ and: [{ nameKey: { equals: k.nameKey } }, { communeKey: { equals: k.communeKey } }] })
  return or
}

/**
 * Pour les PROSPECTS seulement : on compare aussi le nom avec l'« autre nom » déjà saisi
 * (ex. nom légal « Écuries de la Payssière », nom d'usage « Haras des As »).
 */
export const prospectMatchConditions = (k: Partial<CrmKeys>): Where[] => {
  const or = matchConditions(k)
  if (k.nameKey) or.push({ altNameKey: { equals: k.nameKey } })
  return or
}

/** Pourquoi deux fiches semblent être le même établissement. */
export const reasonsBetween = (a: Partial<CrmKeys>, b: Partial<CrmKeys>): DuplicateReason[] => {
  const r: DuplicateReason[] = []
  if (a.nameKey && a.communeKey && a.nameKey === b.nameKey && a.communeKey === b.communeKey) r.push('nom-commune')
  if (a.phoneKey && a.phoneKey === b.phoneKey) r.push('telephone')
  if (a.emailKey && a.emailKey === b.emailKey) r.push('email')
  if (a.domainKey && a.domainKey === b.domainKey) r.push('site')
  if (a.sirenKey && a.sirenKey === b.sirenKey) r.push('siren')
  return r
}

/** Le prospect correspond-il à une demande « ne plus contacter » ? */
export const findOptOut = async (payload: Payload, keys: Partial<CrmKeys>, req?: PayloadRequest) => {
  const or = matchConditions(keys)
  if (!or.length) return null
  const { docs } = await payload.find({ collection: 'crm-optouts', where: { or }, limit: 1, depth: 0, overrideAccess: true, req })
  return docs[0] ?? null
}

/**
 * Signale (sans rien bloquer ni supprimer) les fiches qui ressemblent à ce prospect.
 * Chaque paire n'est signalée qu'une fois ; la décision reste manuelle.
 */
export const flagDuplicates = async (payload: Payload, prospect: { id: number } & Partial<CrmKeys>, req?: PayloadRequest) => {
  const or = prospectMatchConditions(prospect)
  if (!or.length) return 0
  const { docs } = await payload.find({
    collection: 'crm-prospects',
    where: { and: [{ id: { not_equals: prospect.id } }, { or }] },
    limit: 20,
    depth: 0,
    overrideAccess: true,
    req,
  })
  let flagged = 0
  for (const other of docs) {
    const reasons = reasonsBetween(prospect, other as Partial<CrmKeys>)
    if (!reasons.length) continue
    const { totalDocs } = await payload.count({
      collection: 'crm-duplicates',
      where: {
        or: [
          { and: [{ prospect: { equals: prospect.id } }, { existing: { equals: other.id } }] },
          { and: [{ prospect: { equals: other.id } }, { existing: { equals: prospect.id } }] },
        ],
      },
      overrideAccess: true,
      req,
    })
    if (totalDocs) continue
    await payload.create({
      collection: 'crm-duplicates',
      data: { prospect: prospect.id, existing: other.id, reasons, status: 'a-examiner' },
      overrideAccess: true,
      req,
    })
    flagged++
  }
  return flagged
}
