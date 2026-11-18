import type { Payload, PayloadRequest } from 'payload'

import type { CrmProspect, CrmZone } from '@/payload-types'

import { CRM_INFO_LEVELS, CRM_NEEDS, CRM_PRIORITIES, CRM_PROJECT_STATUSES, CRM_STATUSES, CRM_TYPES, CRM_VERIFICATION_LEVELS, CRM_WEBSITE_STATUSES } from './constants'
import { findOptOut, matchConditions } from './dedupe'
import { crmKeys, domainKey, emailKey, phoneKey } from './normalize'

/* ------------------------------------------------------------------ */
/* EXPORT                                                              */
/* ------------------------------------------------------------------ */

const label = (list: readonly { label: string; value: string }[], v?: string | null) => list.find((o) => o.value === v)?.label ?? ''
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '')
const NOT_FOUND = 'Non trouvé'

/** Colonnes du fichier exporté (et du modèle d'import : mêmes intitulés). */
export const EXPORT_COLUMNS: { header: string; get: (p: CrmProspect) => unknown }[] = [
  { header: 'Nom', get: (p) => p.name },
  { header: 'Type', get: (p) => label(CRM_TYPES, p.type) },
  { header: 'Commune', get: (p) => p.commune },
  { header: 'Département', get: (p) => (typeof p.department === 'object' && p.department ? p.department.label : '') },
  { header: 'Adresse', get: (p) => p.address },
  { header: 'Code postal', get: (p) => p.postalCode },
  { header: 'Téléphone', get: (p) => p.phone || NOT_FOUND },
  { header: 'Fiabilité téléphone', get: (p) => label(CRM_INFO_LEVELS, p.phoneLevel) },
  { header: 'E-mail', get: (p) => p.email || NOT_FOUND },
  { header: 'Fiabilité e-mail', get: (p) => label(CRM_INFO_LEVELS, p.emailLevel) },
  { header: 'Autres téléphones', get: (p) => (p.otherPhones ?? []).map((t) => (t.label ? `${t.number} (${t.label})` : t.number)).join(' ; ') },
  { header: 'Autres e-mails', get: (p) => (p.otherEmails ?? []).map((e) => (e.label ? `${e.address} (${e.label})` : e.address)).join(' ; ') },
  { header: 'Site Internet', get: (p) => label(CRM_WEBSITE_STATUSES, p.websiteStatus) },
  { header: 'Adresse du site', get: (p) => p.website },
  { header: 'SIREN', get: (p) => p.siren },
  { header: 'Besoin', get: (p) => label(CRM_NEEDS, p.need) },
  { header: 'Statut', get: (p) => label(CRM_STATUSES, p.status) },
  { header: 'Priorité', get: (p) => label(CRM_PRIORITIES, p.priority) },
  { header: 'Statut du projet', get: (p) => label(CRM_PROJECT_STATUSES, p.projectStatus) },
  { header: 'Vérification', get: (p) => label(CRM_VERIFICATION_LEVELS, p.verificationLevel) },
  { header: 'Ne plus contacter', get: (p) => (p.doNotContact ? 'oui' : 'non') },
  { header: 'Prochaine relance', get: (p) => day(p.nextFollowUpAt) },
  { header: 'Dernier contact', get: (p) => day(p.lastContactAt) },
  { header: 'Découvert le', get: (p) => day(p.discoveredAt) },
  { header: 'Sources', get: (p) => (p.sources ?? []).map((s) => [s.label, s.url].filter(Boolean).join(' ')).join(' | ') },
  { header: 'Notes', get: (p) => p.notes },
]

/* ------------------------------------------------------------------ */
/* IMPORT                                                              */
/* ------------------------------------------------------------------ */

type ImportField =
  | 'name' | 'type' | 'commune' | 'department' | 'postalCode' | 'address' | 'phone' | 'email' | 'website' | 'siren' | 'source' | 'notes' | 'priority'
  | 'otherPhones' | 'otherEmails'

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Intitulés de colonnes reconnus (sans accents ni majuscules). */
const HEADERS: Record<ImportField, string[]> = {
  name: ['nom', 'nom de la structure', 'structure', 'etablissement', 'raison sociale', 'name', 'denomination'],
  type: ['type', 'type d etablissement', 'type de structure', 'categorie'],
  commune: ['commune', 'ville', 'localite', 'city'],
  department: ['departement', 'dept', 'dep', 'code departement'],
  postalCode: ['code postal', 'cp', 'postal'],
  address: ['adresse', 'adresse postale', 'address'],
  phone: ['telephone', 'tel', 'phone', 'telephone professionnel', 'telephone professionnel public', 'numero'],
  email: ['email', 'e mail', 'mail', 'courriel', 'adresse e mail', 'e mail professionnel', 'e mail professionnel public'],
  website: ['adresse du site', 'site', 'site internet', 'site web', 'url', 'website'],
  siren: ['siren', 'siret'],
  source: ['source', 'sources', 'lien source', 'url source'],
  notes: ['notes', 'note', 'commentaire', 'commentaires', 'remarques'],
  priority: ['priorite', 'priority'],
  otherPhones: ['autres telephones', 'autre telephone', 'telephone 2', 'tel 2', 'portable', 'mobile'],
  otherEmails: ['autres e mails', 'autres emails', 'autre e mail', 'autre email', 'e mail 2', 'email 2'],
}

/** « 06 11 22 33 44 (portable) ; 04 67 00 00 00 » → [{ value, label }] */
export const parseList = (v: string): { value: string; label?: string }[] =>
  v
    .split(/\s*[;\n]\s*/)
    .map((part) => /^(.*?)\s*(?:\(([^)]*)\))?\s*$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => Boolean(m && m[1]))
    .map((m) => ({ value: m[1].trim(), label: m[2]?.trim() || undefined }))
    .filter((x) => norm(x.value) !== 'non trouve')

export const mapHeaders = (header: string[]): Partial<Record<ImportField, number>> => {
  const out: Partial<Record<ImportField, number>> = {}
  header.forEach((h, i) => {
    const n = norm(h)
    for (const [field, names] of Object.entries(HEADERS) as [ImportField, string[]][]) {
      if (out[field] === undefined && names.includes(n)) out[field] = i
    }
  })
  return out
}

export const guessType = (v: string): string | undefined => {
  const n = norm(v)
  if (!n) return undefined
  const exact = CRM_TYPES.find((t) => norm(t.label) === n || t.value === n)
  if (exact) return exact.value
  if (n.includes('poney')) return 'poney-club'
  if (n.includes('haras')) return 'haras'
  if (n.includes('elevage') || n.includes('eleveur')) return 'elevage'
  if (n.includes('proprietaire')) return 'ecurie-proprietaires'
  if (n.includes('domaine')) return 'domaine-equestre'
  if (n.includes('centre') || n.includes('club')) return 'centre-equestre'
  if (n.includes('ecurie')) return 'ecurie'
  return 'autre'
}

/** Code de département à partir du code postal (Corse et outre-mer compris). */
export const departmentFromPostalCode = (cp: string): string => {
  const d = cp.replace(/\s/g, '')
  if (!/^\d{5}$/.test(d)) return ''
  if (d.startsWith('97')) return d.slice(0, 3)
  if (d.startsWith('20')) return Number(d) < 20200 ? '2A' : '2B'
  return d.slice(0, 2)
}

export type ImportLine = { line: number; name: string; detail: string }
export type ImportReport = {
  dryRun: boolean
  total: number
  added: number
  addedNames: string[]
  known: ImportLine[]
  optOut: ImportLine[]
  rejected: ImportLine[]
  warnings: ImportLine[]
  /** Fiches déjà enregistrées dont les champs vides ont été complétés par le fichier */
  completed: ImportLine[]
  searchId?: number
}

export const MAX_IMPORT_ROWS = 2000

type Extra = { value: string; label?: string }

/**
 * Ce qu'un fichier peut apporter à une fiche existante : seulement les champs vides.
 * Un téléphone ou un e-mail différent de celui déjà enregistré va dans « Autres téléphones / e-mails ».
 * Renvoie null s'il n'y a rien de nouveau.
 */
export const completeExisting = (
  existing: CrmProspect,
  file: { phone?: string; email?: string; website?: string; siren?: string; address?: string; postalCode?: string; extraPhones: Extra[]; extraEmails: Extra[] },
): { data: Partial<CrmProspect>; summary: string } | null => {
  const data: Partial<CrmProspect> = {}
  const added: string[] = []
  const blank = (v?: string | null) => !String(v ?? '').trim()
  for (const k of ['website', 'siren', 'address', 'postalCode'] as const) {
    if (file[k] && blank(existing[k])) {
      data[k] = file[k]
      added.push(k === 'website' ? 'site' : k === 'postalCode' ? 'code postal' : k === 'address' ? 'adresse' : 'SIREN')
    }
  }

  const phones = [...(existing.otherPhones ?? [])]
  const knownPhones = new Set([existing.phone, ...phones.map((t) => t.number)].map((v) => phoneKey(v)).filter(Boolean))
  for (const t of [...(file.phone ? [{ value: file.phone }] : []), ...file.extraPhones]) {
    const key = phoneKey(t.value)
    if (!key || knownPhones.has(key)) continue
    knownPhones.add(key)
    if (blank(existing.phone) && !data.phone) data.phone = t.value
    else phones.push({ number: t.value, label: t.label ?? null })
    added.push(`tél. ${t.value}`)
  }
  if (phones.length !== (existing.otherPhones ?? []).length) data.otherPhones = phones

  const emails = [...(existing.otherEmails ?? [])]
  const knownEmails = new Set([existing.email, ...emails.map((e) => e.address)].map((v) => emailKey(v)).filter(Boolean))
  for (const e of [...(file.email ? [{ value: file.email }] : []), ...file.extraEmails]) {
    const key = emailKey(e.value)
    if (!key || knownEmails.has(key)) continue
    knownEmails.add(key)
    if (blank(existing.email) && !data.email) data.email = e.value
    else emails.push({ address: e.value, label: e.label ?? null })
    added.push(e.value)
  }
  if (emails.length !== (existing.otherEmails ?? []).length) data.otherEmails = emails

  return added.length ? { data, summary: `ajouté ${added.join(', ')}` } : null
}

/**
 * Ajoute les lignes d'un CSV comme prospects « À vérifier ».
 * - jamais deux fois le même établissement : une ligne déjà connue (dans la base ou plus haut
 *   dans le fichier) n'est pas ajoutée, elle est listée dans le rapport ;
 * - un établissement de la liste « Ne plus contacter » n'est jamais ajouté ;
 * - rien n'est inventé : une valeur absente ou invalide reste vide (« Non trouvé ») ;
 * - en mode aperçu (dryRun), rien n'est enregistré.
 */
export const importProspects = async (
  payload: Payload,
  rows: string[][],
  { dryRun, req }: { dryRun: boolean; req?: PayloadRequest },
): Promise<ImportReport> => {
  const report: ImportReport = { dryRun, total: 0, added: 0, addedNames: [], known: [], optOut: [], rejected: [], warnings: [], completed: [] }
  const [header, ...lines] = rows
  if (!header) return report
  const cols = mapHeaders(header)
  if (cols.name === undefined) {
    report.rejected.push({ line: 1, name: '', detail: 'Colonne « Nom » introuvable dans la première ligne' })
    return report
  }
  report.total = lines.length

  const { docs: zones } = await payload.find({ collection: 'crm-zones', limit: 0, pagination: false, depth: 0, overrideAccess: true, req })
  const zoneBy = new Map<string, CrmZone>()
  for (const z of zones) {
    zoneBy.set(norm(z.code), z)
    zoneBy.set(norm(z.name), z)
  }

  const now = new Date().toISOString()
  let searchId: number | undefined
  if (!dryRun) {
    const search = await payload.create({
      collection: 'crm-searches',
      data: { trigger: 'import', status: 'en-cours', startedAt: now, sources: 'Import de fichier CSV', found: lines.length },
      overrideAccess: true,
      req,
    })
    searchId = search.id
    report.searchId = searchId
  }

  const seen = new Map<string, string>() // clé → nom de la première ligne du fichier
  const get = (r: string[], f: ImportField) => {
    const v = cols[f] === undefined ? '' : (r[cols[f] as number] ?? '').trim()
    return norm(v) === 'non trouve' ? '' : v // valeur écrite par l'export pour une information absente
  }

  for (const [i, r] of lines.entries()) {
    const line = i + 2
    const name = get(r, 'name')
    if (!name) {
      report.rejected.push({ line, name: '', detail: 'Nom absent' })
      continue
    }
    const warn = (detail: string) => report.warnings.push({ line, name, detail })

    let email = get(r, 'email')
    if (email && !emailKey(email)) {
      warn(`E-mail invalide ignoré (${email})`)
      email = ''
    }
    let website = get(r, 'website')
    if (website && !domainKey(website)) {
      warn(`Adresse de site invalide ignorée (${website})`)
      website = ''
    }
    const postalCode = get(r, 'postalCode')
    const depRaw = get(r, 'department') || departmentFromPostalCode(postalCode)
    const zone = depRaw ? (zoneBy.get(norm(depRaw)) ?? zoneBy.get(norm(depRaw.padStart(2, '0')))) : undefined
    if (depRaw && !zone) warn(`Département inconnu (${depRaw})`)
    const priority = CRM_PRIORITIES.find((p) => norm(p.label) === norm(get(r, 'priority')))?.value
    const source = get(r, 'source')
    const extraPhones = parseList(get(r, 'otherPhones'))
    const extraEmails = parseList(get(r, 'otherEmails')).filter((x) => {
      if (emailKey(x.value)) return true
      warn(`E-mail invalide ignoré (${x.value})`)
      return false
    })

    const data = {
      name,
      type: guessType(get(r, 'type')) as CrmProspect['type'],
      commune: get(r, 'commune') || undefined,
      department: zone?.id,
      postalCode: postalCode || undefined,
      address: get(r, 'address') || undefined,
      phone: get(r, 'phone') || undefined,
      email: email || undefined,
      website: website || undefined,
      siren: get(r, 'siren') || undefined,
      notes: get(r, 'notes') || undefined,
      priority: priority as CrmProspect['priority'],
    }
    const keys = crmKeys(data)

    // Doublon à l'intérieur du fichier
    const fileKeys = [
      keys.phoneKey && `t:${keys.phoneKey}`,
      keys.emailKey && `e:${keys.emailKey}`,
      keys.domainKey && `s:${keys.domainKey}`,
      keys.sirenKey && `n:${keys.sirenKey}`,
      keys.nameKey && keys.communeKey && `c:${keys.nameKey}|${keys.communeKey}`,
    ].filter(Boolean) as string[]
    const firstSeen = fileKeys.map((k) => seen.get(k)).find(Boolean)
    if (firstSeen) {
      report.known.push({ line, name, detail: `Déjà plus haut dans le fichier (${firstSeen})` })
      continue
    }

    if (await findOptOut(payload, keys, req)) {
      report.optOut.push({ line, name, detail: 'Dans la liste « Ne plus contacter »' })
      continue
    }
    const or = matchConditions(keys)
    const existing = or.length
      ? (await payload.find({ collection: 'crm-prospects', where: { or }, limit: 1, depth: 0, overrideAccess: true, req })).docs[0]
      : undefined
    if (existing) {
      // Fiche déjà connue : on COMPLÈTE ce qui est vide, on n'écrase jamais rien
      const update = completeExisting(existing, {
        phone: data.phone,
        email: data.email,
        website: data.website,
        siren: data.siren,
        address: data.address,
        postalCode: data.postalCode,
        extraPhones,
        extraEmails,
      })
      if (!update) {
        report.known.push({ line, name, detail: `Déjà enregistré : ${existing.name}` })
        continue
      }
      report.completed.push({ line, name, detail: `${existing.name} : ${update.summary}` })
      if (!dryRun) {
        const isUrl = /^https?:\/\//i.test(source)
        const sources = [
          ...(existing.sources ?? []),
          ...(source ? [{ label: isUrl ? 'Source indiquée dans le fichier' : source, url: isUrl ? source : undefined }] : []),
          { label: `Complément par import CSV du ${day(now)}` },
        ]
        await payload.update({ collection: 'crm-prospects', id: existing.id, data: { ...update.data, sources }, depth: 0, overrideAccess: true, req })
      }
      continue
    }

    for (const k of fileKeys) seen.set(k, name)
    if (!dryRun) {
      const isUrl = /^https?:\/\//i.test(source)
      const sources = [
        ...(source ? [{ label: isUrl ? 'Source indiquée dans le fichier' : source, url: isUrl ? source : undefined }] : []),
        { label: `Import CSV du ${day(now)}` },
      ]
      await payload.create({
        collection: 'crm-prospects',
        data: {
          ...data,
          otherPhones: extraPhones.map((t) => ({ number: t.value, label: t.label })),
          otherEmails: extraEmails.map((e) => ({ address: e.value, label: e.label })),
          status: 'a-verifier',
          verificationLevel: 'a-verifier',
          search: searchId,
          sources,
          discoveredAt: now,
        },
        overrideAccess: true,
        req,
      })
    }
    report.added++
    report.addedNames.push(name)
  }

  if (!dryRun && searchId) {
    const lines2 = (title: string, list: ImportLine[]) => (list.length ? [`${title} :`, ...list.map((l) => `- ligne ${l.line} ${l.name} : ${l.detail}`)] : [])
    await payload.update({
      collection: 'crm-searches',
      id: searchId,
      data: {
        status: 'terminee',
        finishedAt: new Date().toISOString(),
        added: report.added,
        duplicates: report.known.length,
        rejected: report.rejected.length + report.optOut.length,
        report: [
          `${report.added} ajouté(s) et ${report.completed.length} fiche(s) complétée(s) sur ${report.total} ligne(s).`,
          ...lines2('Complétés', report.completed),
          ...lines2('Déjà connus', report.known),
          ...lines2('Ne plus contacter', report.optOut),
          ...lines2('Écartés', report.rejected),
          ...lines2('Avertissements', report.warnings),
        ].join('\n'),
      },
      overrideAccess: true,
      req,
    })
  }
  return report
}

