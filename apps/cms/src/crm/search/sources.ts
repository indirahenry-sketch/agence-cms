/**
 * Sources GRATUITES et autorisées de la recherche de prospects :
 * 1. API Recherche d'entreprises (État, data.gouv) : nom officiel, adresse, SIREN, activité.
 * 2. OpenStreetMap (Overpass) : lieux équestres, parfois avec site, téléphone, e-mail.
 * 3. Site de l'établissement : e-mail ou téléphone affichés publiquement (lecture polie,
 *    robots.txt respecté, une page à la fois).
 * Google Maps, Pages Jaunes et l'annuaire FFE ne sont JAMAIS lus automatiquement
 * (leurs conditions l'interdisent) : ils servent seulement à la vérification manuelle.
 */

export type Fetcher = typeof fetch
export const UA = 'EyeDesign-Prospection/1.0 (recherche hebdomadaire, sources publiques)'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Mots qui signalent une structure équestre dans un nom. */
export const EQUESTRIAN = /equestr|equit|ecurie|haras|poney|cheval|chevaux|cavalier|attelage|dressage|ranch|western|horse|hippique/

export type Candidate = {
  name: string
  commune?: string
  postalCode?: string
  address?: string
  siren?: string
  phone?: string
  email?: string
  website?: string
  naf?: string
  equestrianName: boolean
  sources: { label: string; url?: string }[]
}

/* ------------------------------------------------------------------ */
/* 1. API Recherche d'entreprises                                      */
/* ------------------------------------------------------------------ */

type ApiEtab = { code_postal?: string; libelle_commune?: string; adresse?: string; liste_enseignes?: string[] | null; etat_administratif?: string }
type ApiCompany = {
  siren: string
  nom_complet?: string
  nom_raison_sociale?: string
  nature_juridique?: string
  activite_principale?: string
  nombre_etablissements_ouverts?: number
  siege?: ApiEtab
  matching_etablissements?: ApiEtab[]
  complements?: { collectivite_territoriale?: unknown; est_service_public?: boolean }
}

const API = 'https://recherche-entreprises.api.gouv.fr/search'
/** Codes d'activité où l'on trouve les structures équestres. */
const NAF_ALL = ['01.43Z', '01.62Z'] // élevage de chevaux, soutien à l'élevage (pensions) : tous
const NAF_NAMED = ['93.19Z', '85.51Z'] // sport / enseignement : seulement les noms équestres
const KEYWORDS = ['equestre', 'ecurie', 'haras', 'poney', 'equitation', 'cheval']

const SMALL = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'sur', 'en', 'aux', 'au', 'sous'])
/** « ECURIE DU SOLEIL » → « Ecurie du Soleil » ; « SAINT-JEAN-DE-VEDAS » → « Saint-Jean-de-Vedas » */
export const title = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L}+)/gu, (m, sep: string, word: string, offset: number) =>
      sep + (offset > 0 && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)),
    )

export type EtatStats = { calls: number; failures: number; excludedPublic: number; excludedNetwork: number }

export const fromEtat = async (dep: string, fetcher: Fetcher, stats: EtatStats): Promise<Candidate[]> => {
  const found = new Map<string, ApiCompany>()
  const get = async (params: string) => {
    for (let i = 0; i < 3; i++) {
      stats.calls++
      const r = await fetcher(`${API}?${params}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) }).catch(() => null)
      await sleep(220) // 7 requêtes par seconde au maximum autorisées : on reste en dessous
      if (r?.ok) return (await r.json()) as { results?: ApiCompany[]; total_pages?: number }
      await sleep(r?.status === 429 ? 2000 : 600)
    }
    stats.failures++
    return null
  }
  const walk = async (base: string, maxPages: number, keep: (c: ApiCompany) => boolean) => {
    for (let page = 1; page <= maxPages; page++) {
      const j = await get(`${base}&departement=${dep}&etat_administratif=A&per_page=25&page=${page}`)
      if (!j?.results?.length) break
      for (const c of j.results) if (!found.has(c.siren) && keep(c)) found.set(c.siren, c)
      if (page >= (j.total_pages ?? 1)) break
    }
  }
  const named = (c: ApiCompany) => EQUESTRIAN.test(norm(allNames(c)))
  for (const naf of NAF_ALL) await walk(`activite_principale=${naf}`, 40, () => true)
  for (const naf of NAF_NAMED) await walk(`activite_principale=${naf}`, 40, named)
  for (const q of KEYWORDS) await walk(`q=${q}`, 10, named)

  const out: Candidate[] = []
  for (const c of found.values()) {
    const nj = String(c.nature_juridique ?? '')
    if (nj.startsWith('7') || c.complements?.collectivite_territoriale || c.complements?.est_service_public) {
      stats.excludedPublic++
      continue
    }
    if ((c.nombre_etablissements_ouverts ?? 1) > 3) {
      stats.excludedNetwork++
      continue
    }
    const e = (c.matching_etablissements ?? []).find((x) => String(x.code_postal ?? '').startsWith(dep.length === 3 ? dep : dep.slice(0, 2))) ?? c.siege ?? {}
    const enseigne = [...(e.liste_enseignes ?? []), ...(c.siege?.liste_enseignes ?? [])].find(Boolean)
    const raw = enseigne || c.nom_raison_sociale || c.nom_complet || ''
    if (!raw) continue
    out.push({
      name: title(raw),
      commune: e.libelle_commune ? title(e.libelle_commune) : undefined,
      postalCode: e.code_postal || undefined,
      address: e.adresse || undefined,
      siren: c.siren,
      naf: c.activite_principale,
      equestrianName: named(c),
      sources: [{ label: 'Annuaire des entreprises (État)', url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${c.siren}` }],
    })
  }
  return out
}

const allNames = (c: ApiCompany) =>
  [c.nom_complet, c.nom_raison_sociale, ...(c.siege?.liste_enseignes ?? []), ...(c.matching_etablissements ?? []).flatMap((e) => e.liste_enseignes ?? [])].join(' ')

/* ------------------------------------------------------------------ */
/* 2. OpenStreetMap                                                    */
/* ------------------------------------------------------------------ */

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter']

type OsmEl = { type: string; id: number; tags?: Record<string, string> }

export const fromOsm = async (dep: string, fetcher: Fetcher): Promise<Candidate[] | null> => {
  const q = `[out:json][timeout:90];
area["ref:INSEE"="${dep}"]["admin_level"="6"]->.d;
(
  nwr["leisure"="horse_riding"]["name"](area.d);
  nwr["sport"~"equestrian"]["name"](area.d);
  nwr["amenity"="stables"]["name"](area.d);
  nwr["name"~"[Hh]aras|[EeÉé]curie|[EeÉé]questre|[Pp]oney"]["leisure"](area.d);
);
out tags;`
  for (const [i, host] of OVERPASS.entries()) {
    if (i) await sleep(10_000)
    const r = await fetcher(host, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(120_000),
    }).catch(() => null)
    if (!r?.ok) continue
    const els = ((await r.json()) as { elements?: OsmEl[] }).elements ?? []
    return els
      .filter((e) => e.tags?.name)
      .map((e) => {
        const t = e.tags!
        return {
          name: t.name,
          commune: t['addr:city'] || undefined,
          postalCode: t['addr:postcode'] || undefined,
          address: [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ') || undefined,
          phone: t.phone || t['contact:phone'] || t['contact:mobile'] || undefined,
          email: t.email || t['contact:email'] || undefined,
          website: t.website || t['contact:website'] || t.url || undefined,
          equestrianName: true,
          sources: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/${e.type}/${e.id}` }],
        }
      })
  }
  return null // aucune instance disponible : la recherche continue sans OSM
}

/* ------------------------------------------------------------------ */
/* 3. Site de l'établissement                                          */
/* ------------------------------------------------------------------ */

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi
const BAD_EMAIL = /\.(png|jpe?g|gif|webp|svg)$|example\.|sentry|wixpress|domain\.|@2x|votre|your|nom@|email@|exemple/i
const PHONE = /(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}/

const robotsAllows = async (origin: string, fetcher: Fetcher) => {
  const r = await fetcher(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }).catch(() => null)
  if (!r?.ok) return true
  let applies = false
  for (const line of (await r.text()).split(/\r?\n/)) {
    const [k, ...v] = line.split(':')
    const key = k.trim().toLowerCase()
    const val = v.join(':').trim()
    if (key === 'user-agent') applies = val === '*' || /eyedesign/i.test(val)
    else if (applies && key === 'disallow' && (val === '/' || val === '/contact')) return false
  }
  return true
}

/** Lit la page d'accueil puis /contact ; renvoie l'e-mail et le téléphone affichés, sans rien deviner. */
export const fromWebsite = async (website: string, fetcher: Fetcher): Promise<{ email?: string; phone?: string; reachable: boolean }> => {
  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`)
  } catch {
    return { reachable: false }
  }
  if (/facebook|instagram|google|pagesjaunes|linktr|wix\.com$/.test(url.hostname)) return { reachable: false }
  if (!(await robotsAllows(url.origin, fetcher))) return { reachable: false }
  let reachable = false
  let phone: string | undefined
  for (const path of [url.pathname || '/', '/contact']) {
    const r = await fetcher(new URL(path, url.origin), { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10_000) }).catch(() => null)
    await sleep(1500)
    if (!r?.ok || !String(r.headers.get('content-type') ?? '').includes('html')) continue
    reachable = true
    const html = (await r.text().catch(() => '')).slice(0, 600_000)
    const mailto = /mailto:([^"'?\s>]+)/i.exec(html)?.[1]
    const emails = [mailto ? decodeURIComponent(mailto) : '', ...(html.match(EMAIL) ?? [])].filter((e) => e && !BAD_EMAIL.test(e))
    // On préfère une adresse du même domaine que le site
    const host = url.hostname.replace(/^www\./, '')
    const email = emails.find((e) => e.toLowerCase().endsWith(`@${host}`)) ?? emails[0]
    phone ??= PHONE.exec(html.replace(/<[^>]+>/g, ' '))?.[0]
    if (email) return { email: email.toLowerCase(), phone, reachable }
  }
  return { phone, reachable }
}
