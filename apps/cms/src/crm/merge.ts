/**
 * Fusion de doublons : la fiche la PLUS COMPLÈTE est gardée et prend le dessus.
 * Elle est complétée avec ce que l'autre fiche a en plus (jamais rien d'écrasé), récupère
 * son historique (appels, e-mails, notes), puis l'autre fiche est retirée.
 *
 * Fusion automatique seulement quand c'est sûr : même SIREN, même nom + même commune,
 * même site ou même e-mail — et jamais si les deux fiches ont des SIREN différents.
 * Un simple téléphone en commun reste « à examiner » (un même gérant peut avoir deux structures).
 */
import type { Payload, PayloadRequest } from 'payload'

import type { CrmProspect } from '@/payload-types'

import { CRM_STATUSES } from './constants'
import { type DuplicateReason, findOptOut, flagDuplicates, reasonsBetween } from './dedupe'
import { emailKey, phoneKey } from './normalize'

type P = CrmProspect
/** Les clés de comparaison d'une fiche (null → absent). */
const keys = (p: P) => p as unknown as Parameters<typeof reasonsBetween>[0] & { id: number }
const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== ''
const relId = (v: unknown): number | null => (typeof v === 'object' && v !== null ? Number((v as { id: number }).id) : v == null ? null : Number(v))

/** Plus le score est haut, plus la fiche est complète. */
export const richness = (p: P, activities = 0): number => {
  let s = 0
  if (filled(p.phone)) s += 3
  if (filled(p.email)) s += 3
  for (const k of ['website', 'siren', 'address', 'postalCode', 'commune', 'otherNames', 'notes'] as const) if (filled(p[k])) s += 1
  if (p.type && p.type !== 'autre') s += 1
  s += (p.otherPhones?.length ?? 0) + (p.otherEmails?.length ?? 0) + (p.sources?.length ?? 0) * 0.1
  s += activities * 2
  return s
}

/** Fusion sans risque ? (sinon : « à examiner » à la main) */
export const isSafeMerge = (reasons: DuplicateReason[], a: P, b: P) => {
  if (a.sirenKey && b.sirenKey && a.sirenKey !== b.sirenKey) return false
  return reasons.some((r) => r === 'siren' || r === 'nom-commune' || r === 'site' || r === 'email')
}

const STATUS_ORDER: string[] = CRM_STATUSES.map((s) => s.value)
const mergedStatus = (a: P['status'], b: P['status']): P['status'] => {
  for (const stop of ['ferme', 'ne-plus-contacter', 'non-interesse', 'client'] as const) if (a === stop || b === stop) return stop
  return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b
}
const best = <T extends string>(order: T[], a?: T | null, b?: T | null): T | null | undefined => {
  if (!a) return b
  if (!b) return a
  return order.indexOf(a) <= order.indexOf(b) ? a : b
}

/** Ce que la fiche gardée reçoit de l'autre. Renvoie les données et la liste de ce qui a été repris. */
export const mergeData = (w: P, l: P): { data: Partial<P>; added: string[] } => {
  const data: Partial<P> = {}
  const added: string[] = []
  const take = <K extends keyof P>(k: K, label: string) => {
    if (!filled(w[k]) && filled(l[k])) {
      data[k] = l[k]
      added.push(label)
    }
  }
  take('commune', 'commune')
  take('address', 'adresse')
  take('postalCode', 'code postal')
  take('siren', 'SIREN')
  take('nextFollowUpAt', 'prochaine relance')
  if (!w.department && l.department) data.department = relId(l.department)
  if ((!w.type || w.type === 'autre') && l.type && l.type !== 'autre') {
    data.type = l.type
    added.push('type')
  }
  if ((!w.need || w.need === 'a-determiner') && l.need && l.need !== 'a-determiner') data.need = l.need
  if (!w.projectStatus && l.projectStatus) data.projectStatus = l.projectStatus
  if (!filled(w.website) && filled(l.website)) {
    data.website = l.website
    data.websiteStatus = 'site-existant'
    added.push('site')
  }
  data.priority = best(['haute', 'moyenne', 'basse'], w.priority, l.priority) ?? undefined
  data.verificationLevel = best(['verifie', 'partiel', 'a-verifier'], w.verificationLevel, l.verificationLevel) ?? undefined

  // Téléphones : le principal manquant est repris, sinon le numéro en plus va dans « Autres téléphones »
  const phones = [...(w.otherPhones ?? [])].map(({ number, label }) => ({ number, label }))
  const seenP = new Set([w.phone, ...phones.map((t) => t.number)].map((x) => phoneKey(x)).filter(Boolean))
  for (const t of [...(filled(l.phone) ? [{ number: l.phone!, label: null as string | null | undefined }] : []), ...(l.otherPhones ?? [])]) {
    const k = phoneKey(t.number)
    if (!k || seenP.has(k)) continue
    seenP.add(k)
    if (!filled(w.phone) && !data.phone) {
      data.phone = t.number
      data.phoneLevel = l.phoneLevel
    } else phones.push({ number: t.number, label: t.label ?? null })
    added.push(`tél. ${t.number}`)
  }
  if (phones.length !== (w.otherPhones?.length ?? 0)) data.otherPhones = phones

  const emails = [...(w.otherEmails ?? [])].map(({ address, label }) => ({ address, label }))
  const seenE = new Set([w.email, ...emails.map((e) => e.address)].map((x) => emailKey(x)).filter(Boolean))
  for (const e of [...(filled(l.email) ? [{ address: l.email!, label: null as string | null | undefined }] : []), ...(l.otherEmails ?? [])]) {
    const k = emailKey(e.address)
    if (!k || seenE.has(k)) continue
    seenE.add(k)
    if (!filled(w.email) && !data.email) {
      data.email = e.address
      data.emailLevel = l.emailLevel
    } else emails.push({ address: e.address, label: e.label ?? null })
    added.push(e.address)
  }
  if (emails.length !== (w.otherEmails?.length ?? 0)) data.otherEmails = emails

  // L'autre nom garde la trace du nom de la fiche retirée (utile pour les recherches)
  const names = [w.otherNames, l.otherNames, l.nameKey !== w.nameKey ? l.name : null]
    .flatMap((x) => String(x ?? '').split(/\s*[;,]\s*/))
    .map((x) => x.trim())
    .filter((x) => x && x.toLowerCase() !== w.name.toLowerCase())
  const uniqueNames = [...new Map(names.map((n) => [n.toLowerCase(), n])).values()].join(', ')
  if (uniqueNames !== (w.otherNames ?? '')) data.otherNames = uniqueNames || null

  if (filled(l.notes) && !String(w.notes ?? '').includes(String(l.notes).trim())) {
    data.notes = filled(w.notes) ? `${w.notes}\n${l.notes}` : l.notes
    added.push('notes')
  }
  const srcKey = (s: { label?: string | null; url?: string | null }) => s.url || s.label || ''
  const knownSrc = new Set((w.sources ?? []).map(srcKey))
  const extraSrc = (l.sources ?? []).filter((s) => !knownSrc.has(srcKey(s))).map(({ label, url, checkedAt }) => ({ label, url, checkedAt }))
  if (extraSrc.length) data.sources = [...(w.sources ?? []).map(({ label, url, checkedAt }) => ({ label, url, checkedAt })), ...extraSrc]

  const status = mergedStatus(w.status, l.status)
  if (status !== w.status) {
    data.status = status
    added.push('statut')
  }
  if (l.doNotContact && !w.doNotContact) data.doNotContact = true
  const dates = (a?: string | null, b?: string | null, pick: 'min' | 'max' = 'max') =>
    !a ? b : !b ? a : (pick === 'max' ? a > b : a < b) ? a : b
  data.lastContactAt = dates(w.lastContactAt, l.lastContactAt, 'max')
  data.discoveredAt = dates(w.discoveredAt, l.discoveredAt, 'min')
  return { data, added }
}

export type MergeResult = { keptId: number; keptName: string; removedId: number; removedName: string; added: string[] }

/** Fusionne deux fiches : la plus complète est gardée. */
export const mergeProspects = async (payload: Payload, aId: number, bId: number, req?: PayloadRequest): Promise<MergeResult> => {
  const base = { overrideAccess: true, depth: 0, req } as const
  const [a, b] = await Promise.all([
    payload.findByID({ collection: 'crm-prospects', id: aId, ...base }),
    payload.findByID({ collection: 'crm-prospects', id: bId, ...base }),
  ])
  const count = async (id: number) => (await payload.count({ collection: 'crm-activities', where: { prospect: { equals: id } }, overrideAccess: true, req })).totalDocs
  const [ra, rb] = [richness(a, await count(a.id)), richness(b, await count(b.id))]
  // La plus complète gagne ; à égalité, la plus ancienne
  const [w, l] = ra > rb || (ra === rb && a.id < b.id) ? [a, b] : [b, a]
  const { data, added } = mergeData(w, l)

  // 1. Historique déplacé sur la fiche gardée
  await payload.update({ collection: 'crm-activities', where: { prospect: { equals: l.id } }, data: { prospect: w.id }, ...base })

  // 2. Alertes de doublon : la paire fusionnée est gardée comme trace, les autres pointent vers la fiche gardée
  const { docs: dups } = await payload.find({
    collection: 'crm-duplicates',
    where: { or: [{ prospect: { equals: l.id } }, { existing: { equals: l.id } }] },
    limit: 0,
    pagination: false,
    ...base,
  })
  for (const d of dups) {
    const other = relId(d.prospect) === l.id ? relId(d.existing) : relId(d.prospect)
    if (other === w.id || other === l.id) {
      await payload.update({
        collection: 'crm-duplicates',
        id: d.id,
        data: { prospect: w.id, existing: w.id, status: 'doublon', note: `Fusionné : « ${l.name} » a été intégré à « ${w.name} », la fiche la plus complète.` },
        ...base,
        context: { merging: true },
      })
      continue
    }
    const pairExists = (
      await payload.count({
        collection: 'crm-duplicates',
        where: { or: [{ and: [{ prospect: { equals: w.id } }, { existing: { equals: other } }] }, { and: [{ prospect: { equals: other } }, { existing: { equals: w.id } }] }] },
        overrideAccess: true,
        req,
      })
    ).totalDocs
    if (pairExists) await payload.delete({ collection: 'crm-duplicates', id: d.id, ...base })
    else
      await payload.update({
        collection: 'crm-duplicates',
        id: d.id,
        data: relId(d.prospect) === l.id ? { prospect: w.id } : { existing: w.id },
        ...base,
        context: { merging: true },
      })
  }

  // 3. Fiche gardée complétée (sans re-signaler la fiche qu'on retire)
  const kept = await payload.update({ collection: 'crm-prospects', id: w.id, data, ...base, context: { skipCrmChecks: true } })
  // 4. Fiche la moins complète retirée
  await payload.delete({ collection: 'crm-prospects', id: l.id, ...base })

  // 5. Contrôles habituels sur la fiche gardée
  if (kept.status === 'ne-plus-contacter' && !(await findOptOut(payload, keys(kept), req))) {
    await payload.create({
      collection: 'crm-optouts',
      data: {
        label: kept.name,
        prospect: kept.id,
        nameKey: kept.nameKey,
        communeKey: kept.communeKey,
        phoneKey: kept.phoneKey,
        emailKey: kept.emailKey,
        domainKey: kept.domainKey,
        sirenKey: kept.sirenKey,
        reason: 'Statut « Ne plus contacter » sur la fiche',
      },
      overrideAccess: true,
      req,
    })
  }
  await flagDuplicates(payload, keys(kept), req)
  await payload.create({
    collection: 'crm-activities',
    data: {
      prospect: w.id,
      kind: 'note',
      date: new Date().toISOString(),
      summary: `Doublon fusionné : « ${l.name} » (fiche n° ${l.id}) a été intégré à cette fiche, plus complète.${added.length ? ` Repris : ${added.join(', ')}.` : ''}`,
    },
    ...base,
  })
  return { keptId: w.id, keptName: w.name, removedId: l.id, removedName: l.name, added }
}

/** Fusionne tous les doublons « à examiner » dont la correspondance est sûre. */
export const autoMergeDuplicates = async (payload: Payload, req?: PayloadRequest): Promise<MergeResult[]> => {
  const done: MergeResult[] = []
  const { docs } = await payload.find({ collection: 'crm-duplicates', where: { status: { equals: 'a-examiner' } }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req })
  for (const d of docs) {
    const [aId, bId] = [relId(d.prospect), relId(d.existing)]
    if (!aId || !bId || aId === bId) continue
    const [a, b] = await Promise.all([
      payload.findByID({ collection: 'crm-prospects', id: aId, depth: 0, overrideAccess: true, req }).catch(() => null),
      payload.findByID({ collection: 'crm-prospects', id: bId, depth: 0, overrideAccess: true, req }).catch(() => null),
    ])
    if (!a || !b) continue // déjà fusionnée plus haut
    if (!isSafeMerge(reasonsBetween(keys(a), keys(b)), a, b)) continue
    done.push(await mergeProspects(payload, a.id, b.id, req))
  }
  return done
}

/** Combien de doublons « à examiner » seraient fusionnés automatiquement. */
export const countSafeDuplicates = async (payload: Payload, req?: PayloadRequest) => {
  const { docs } = await payload.find({ collection: 'crm-duplicates', where: { status: { equals: 'a-examiner' } }, limit: 0, pagination: false, depth: 1, overrideAccess: true, req })
  return docs.filter((d) => typeof d.prospect === 'object' && typeof d.existing === 'object' && d.prospect && d.existing && isSafeMerge(reasonsBetween(keys(d.prospect), keys(d.existing)), d.prospect, d.existing)).length
}
