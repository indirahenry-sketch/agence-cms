// OUTIL TEMPORAIRE (étape 3) : mesure ce que les sources GRATUITES donnent sur un département.
// Rien n'est enregistré nulle part. Dépôt public : on n'affiche QUE des nombres, jamais un nom,
// un téléphone ou un e-mail.
const DEP = process.env.DEP || '34'
const UA = 'agence-cms-test-sources/1.0 (test ponctuel, contact via GitHub indirahenry-sketch)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = []
const say = (s) => {
  out.push(s)
  console.log(s)
}

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const EQUI = /equestr|equit|ecurie|haras|poney|cheval|chevaux|cavalier|attelage|dressage|ranch|western|horse|hippique|centaure|crin/
const STOP = new Set(['ecurie', 'ecuries', 'centre', 'equestre', 'equitation', 'poney', 'club', 'domaine', 'haras', 'elevage', 'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'sarl', 'earl', 'scea', 'sas', 'gaec', 'association'])
const nameKey = (s) => norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).join(' ')

/* ---------------- 1. API Recherche d'entreprises (État) ---------------- */
const NAF = ['01.43Z', '93.19Z', '85.51Z', '93.12Z', '01.62Z']
const companies = new Map()
let apiCalls = 0
let apiErrors = 0
const getJson = async (url, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } }).catch(() => null)
    apiCalls++
    if (r?.ok) return r.json()
    if (r?.status === 429) await sleep(2000)
    else await sleep(500)
  }
  apiErrors++
  return null
}
for (const naf of NAF) {
  let total = 0
  for (let page = 1; page <= 40; page++) {
    const u = `https://recherche-entreprises.api.gouv.fr/search?activite_principale=${naf}&departement=${DEP}&etat_administratif=A&per_page=25&page=${page}`
    const j = await getJson(u)
    await sleep(200) // 5 requêtes par seconde maximum
    if (!j?.results?.length) break
    total = j.total_results ?? total
    for (const c of j.results) {
      const etabs = (c.matching_etablissements ?? []).filter((e) => String(e.code_postal ?? '').startsWith(DEP) && e.etat_administratif !== 'F')
      const names = [c.nom_complet, c.nom_raison_sociale, ...(c.siege?.liste_enseignes ?? []), ...etabs.flatMap((e) => e.liste_enseignes ?? [])].join(' ')
      const equi = EQUI.test(norm(names))
      if (naf !== '01.43Z' && !equi) continue // hors élevage : on ne garde que les noms équestres
      if (!companies.has(c.siren)) companies.set(c.siren, { c, naf, etabs, equi })
    }
    if (page >= (j.total_pages ?? 1)) break
  }
  say(`API État · NAF ${naf} : ${total} entreprise(s) actives dans le ${DEP} (avant filtre)`)
}
// Recherche par mots-clés, toutes activités confondues
for (const q of ['equestre', 'ecurie', 'haras', 'poney', 'equitation']) {
  for (let page = 1; page <= 10; page++) {
    const j = await getJson(`https://recherche-entreprises.api.gouv.fr/search?q=${q}&departement=${DEP}&etat_administratif=A&per_page=25&page=${page}`)
    await sleep(200)
    if (!j?.results?.length) break
    for (const c of j.results) {
      if (companies.has(c.siren)) continue
      const names = [c.nom_complet, c.nom_raison_sociale, ...(c.siege?.liste_enseignes ?? [])].join(' ')
      if (!EQUI.test(norm(names))) continue
      companies.set(c.siren, { c, naf: c.activite_principale, etabs: c.matching_etablissements ?? [], equi: true })
    }
    if (page >= (j.total_pages ?? 1)) break
  }
}

let publicOrg = 0
let networks = 0
let ei = 0
let assoc = 0
let breedersOnly = 0
const kept = []
for (const { c, naf, etabs, equi } of companies.values()) {
  const nj = String(c.nature_juridique ?? '')
  if (nj.startsWith('7') || c.complements?.collectivite_territoriale || c.complements?.est_service_public) {
    publicOrg++
    continue
  }
  if ((c.nombre_etablissements_ouverts ?? 1) > 3) {
    networks++
    continue
  }
  if (c.complements?.est_entrepreneur_individuel) ei++
  if (c.complements?.est_association || nj.startsWith('92')) assoc++
  if (naf === '01.43Z' && !equi) breedersOnly++
  const e = etabs[0] ?? c.siege ?? {}
  kept.push({ key: nameKey([c.nom_complet, ...(c.siege?.liste_enseignes ?? [])].join(' ')), cp: String(e.code_postal ?? c.siege?.code_postal ?? ''), naf, equi })
}
say(`API État · total retenu : ${kept.length} structure(s) (doublons retirés)`)
say(`  dont éleveurs sans nom équestre (NAF 01.43Z) : ${breedersOnly}`)
say(`  dont entreprises individuelles : ${ei} · associations : ${assoc}`)
say(`  écartées : ${publicOrg} publique(s), ${networks} réseau(x) de plus de 3 établissements`)
say(`  appels API : ${apiCalls} (${apiErrors} en échec)`)

/* ---------------- 2. OpenStreetMap (Overpass) ---------------- */
const overpass = `[out:json][timeout:90];
area["ref:INSEE"="${DEP}"]["admin_level"="6"]->.d;
(
  nwr["leisure"="horse_riding"](area.d);
  nwr["sport"~"equestrian|horse_racing"](area.d);
  nwr["amenity"="stables"](area.d);
  nwr["building"="stable"]["name"](area.d);
  nwr["tourism"]["name"~"[Hh]aras|[Ee]curie|[Éé]curie|[Ee]questre|[Éé]questre|[Pp]oney"](area.d);
);
out tags center;`
let osm = []
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter']
for (const [i, host] of HOSTS.entries()) {
  if (i) await sleep(15000)
  const r = await fetch(host, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(overpass)}`, signal: AbortSignal.timeout(120000) }).catch(() => null)
  if (r?.ok) {
    osm = (await r.json()).elements ?? []
    break
  }
  say(`OSM : ${host.split('/')[2]} indisponible (HTTP ${r?.status ?? 'réseau'})`)
}
const named = osm.filter((e) => e.tags?.name)
const site = (t) => t.website || t['contact:website'] || t.url
const tel = (t) => t.phone || t['contact:phone'] || t['contact:mobile']
const mail = (t) => t.email || t['contact:email']
say(`OSM : ${osm.length} lieu(x) équestre(s), dont ${named.length} avec un nom`)
say(`  avec site : ${named.filter((e) => site(e.tags)).length} · avec téléphone : ${named.filter((e) => tel(e.tags)).length} · avec e-mail : ${named.filter((e) => mail(e.tags)).length}`)

/* ---------------- 3. Recoupement État × OSM ---------------- */
const osmKeys = new Set(named.map((e) => nameKey(e.tags.name)).filter(Boolean))
const both = kept.filter((k) => k.key && osmKeys.has(k.key)).length
say(`Recoupement : ${both} structure(s) trouvée(s) dans les deux sources (même nom)`)
const keptKeys = new Set(kept.map((k) => k.key))
const osmOnly = named.filter((e) => !keptKeys.has(nameKey(e.tags.name))).length
say(`  présentes seulement dans OSM : ${osmOnly}`)

/* ---------------- 4. Sites Internet : e-mail public sur la page ? ---------------- */
const sites = [...new Set(named.map((e) => site(e.tags)).filter(Boolean))].slice(0, 120)
let reachable = 0
let withEmail = 0
let blocked = 0
const MAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i
const allowed = async (origin, path) => {
  const r = await fetch(`${origin}/robots.txt`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }).catch(() => null)
  if (!r?.ok) return true
  const txt = await r.text()
  let applies = false
  for (const line of txt.split(/\r?\n/)) {
    const [k, ...v] = line.split(':')
    const val = v.join(':').trim()
    if (/^user-agent$/i.test(k.trim())) applies = val === '*'
    else if (applies && /^disallow$/i.test(k.trim()) && val && path.startsWith(val)) return false
  }
  return true
}
for (const raw of sites) {
  let url
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    continue
  }
  if (/facebook|instagram|google|pagesjaunes|linktr/.test(url.hostname)) continue
  if (!(await allowed(url.origin, '/'))) {
    blocked++
    continue
  }
  let found = false
  for (const path of [url.pathname || '/', '/contact']) {
    const r = await fetch(new URL(path, url.origin), { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(10000) }).catch(() => null)
    await sleep(1500) // lecture polie : une page à la fois
    if (!r?.ok) continue
    if (path === (url.pathname || '/')) reachable++
    const html = await r.text().catch(() => '')
    if (MAIL.test(html.replace(/\.(png|jpe?g|gif|webp|svg)/gi, ''))) {
      found = true
      break
    }
  }
  if (found) withEmail++
}
say(`Sites testés : ${sites.length} · joignables : ${reachable} · e-mail public trouvé : ${withEmail} · refusés par robots.txt : ${blocked}`)

/* ---------------- Estimation ---------------- */
const emailable = withEmail + named.filter((e) => mail(e.tags) && !site(e.tags)).length
say(`ESTIMATION ${DEP} : ~${kept.length + osmOnly} structures équestres repérables, dont ~${emailable} avec un e-mail public trouvé automatiquement`)
