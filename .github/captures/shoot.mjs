// OUTIL TEMPORAIRE : captures de l'espace Prospection sur une base jetable (données fictives).
// Retiré avant la fusion dans main.
import { chromium, devices, webkit } from 'playwright'
import fs from 'node:fs'

const BASE = 'http://localhost:3000'
const OUT = process.env.OUT || 'captures'
const { CAP_EMAIL, CAP_PASS, CLIENT_EMAIL, CLIENT_PASS } = process.env
fs.mkdirSync(OUT, { recursive: true })
const log = []
// Le compte-rendu est écrit même si le script s'arrête en route
process.on('exit', () => fs.writeFileSync(`${OUT}/verifications.txt`, log.join('\n') + '\n'))
const check = (ok, msg) => {
  log.push(`${ok ? 'OK ' : 'ÉCHEC'} ${msg}`)
  if (!ok) process.exitCode = 1
}

// Le cookie de session est « Secure » en production : sur http://localhost on passe le jeton nous-mêmes
const tokens = new WeakMap()
const api = async (ctx, method, path, data) => {
  const token = tokens.get(ctx)
  const headers = token ? { Authorization: `JWT ${token}` } : {}
  const res = await ctx.request.fetch(`${BASE}/api${path}`, { method, data, headers, failOnStatusCode: false })
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { status: res.status(), body }
}
const login = async (ctx, email, password) => {
  const r = await api(ctx, 'POST', '/users/login', { email, password })
  if (!r.body?.token) log.push(`   (connexion sans jeton : HTTP ${r.status} ${Object.keys(r.body ?? {}).join(',')})`)
  if (r.body?.token) {
    tokens.set(ctx, r.body.token)
    await ctx.addCookies([{ name: 'payload-token', value: r.body.token, url: BASE }])
  }
  return r
}

// 1. Super admin (premier compte) + données d'exemple
const browser = await chromium.launch()
const admin = await browser.newContext({ viewport: { width: 1366, height: 900 } })
check((await api(admin, 'POST', '/users/first-register', { email: CAP_EMAIL, password: CAP_PASS, name: 'Test Agence' })).status < 300, 'premier compte créé')
check((await login(admin, CAP_EMAIL, CAP_PASS)).status === 200, 'connexion super admin')

const zr = await api(admin, 'GET', '/crm-zones?limit=200&depth=0')
log.push(`   (zones : HTTP ${zr.status} ${zr.body?.errors?.[0]?.message ?? ''})`)
const zones = zr.body?.docs ?? []
check(zones.length === 101, `101 zones créées au démarrage (${zones.length})`)
check(zones.filter((z) => z.active).length === 8, '8 zones actives')
const z = (code) => zones.find((x) => x.code === code)?.id

const soon = (d) => new Date(Date.now() + d * 864e5).toISOString()
const ex = [
  { name: 'Exemple · Écurie des Pins', type: 'ecurie', commune: 'Lunel', department: z('34'), phone: '04 67 00 00 01', websiteStatus: 'sans-site', priority: 'haute', status: 'qualifie' },
  { name: 'Exemple · Haras du Mistral', type: 'haras', commune: 'Arles', department: z('13'), website: 'https://haras-exemple.test', email: 'contact@haras-exemple.test', status: 'email-envoye' },
  { name: 'Exemple · Poney-club des Oliviers', type: 'poney-club', commune: 'Nîmes', department: z('30'), status: 'nouveau' },
  { name: 'Exemple · Domaine de la Garrigue', type: 'domaine-equestre', commune: 'Saint-Mathieu-de-Tréviers', department: z('34'), websiteStatus: 'sans-site', status: 'relance' },
  { name: 'Exemple · Centre équestre du Lac', type: 'centre-equestre', commune: 'Carcassonne', department: z('11'), status: 'non-interesse' },
  { name: 'Exemple · Ecurie Pins', type: 'ecurie', commune: 'Lunel', department: z('34'), phone: '+33 4 67 00 00 01', status: 'nouveau' },
]
const ids = []
for (const p of ex) {
  const r = await api(admin, 'POST', '/crm-prospects', p)
  if (!r.body?.doc?.id) log.push(`   (création : HTTP ${r.status} ${JSON.stringify(r.body?.errors ?? r.body).slice(0, 200)})`)
  ids.push(r.body?.doc?.id)
}
check(ids.every(Boolean), 'prospects d’exemple créés')
await api(admin, 'POST', '/crm-activities', { prospect: ids[1], kind: 'email-envoye', summary: 'Présentation Eye Design envoyée', followUpAt: soon(2) })
await api(admin, 'POST', '/crm-activities', { prospect: ids[3], kind: 'appel', summary: 'Messagerie, rappeler', followUpAt: soon(-1) })
await api(admin, 'PATCH', `/crm-prospects/${ids[4]}`, { status: 'ne-plus-contacter' })
await api(admin, 'POST', '/crm-activities', { prospect: ids[1], kind: 'reponse', summary: 'Intéressé, rappeler en décembre', followUpAt: soon(9) })
await api(admin, 'PATCH', `/crm-prospects/${ids[0]}`, { status: 'client' })
await api(admin, 'POST', '/crm-activities', { prospect: ids[0], kind: 'appel', summary: 'Devis accepté' })
const dups = (await api(admin, 'GET', '/crm-duplicates?depth=0')).body?.docs ?? []
check(dups.length === 1, `1 doublon signalé (${dups.length})`)

// 2. Compte client (administrateur d'un site) : ne doit RIEN voir
const tenant = (await api(admin, 'POST', '/tenants', { name: 'Client Test', slug: 'client-test' })).body?.doc
await api(admin, 'POST', '/users', {
  email: CLIENT_EMAIL,
  password: CLIENT_PASS,
  roles: ['user'],
  tenants: [{ tenant: tenant?.id, roles: ['tenant-admin'] }],
})
const client = await browser.newContext({ viewport: { width: 1366, height: 900 } })
check((await login(client, CLIENT_EMAIL, CLIENT_PASS)).status === 200, 'connexion compte client')
for (const c of ['crm-prospects', 'crm-zones', 'crm-activities', 'crm-optouts', 'crm-duplicates', 'crm-searches']) {
  const r = await api(client, 'GET', `/${c}`)
  check(r.status === 403 || (r.body?.docs?.length ?? 0) === 0 && r.status >= 400, `client refusé sur /api/${c} (HTTP ${r.status})`)
}
check((await api(client, 'GET', '/globals/crm-settings')).status === 403, 'client refusé sur les réglages')

// 3. Captures
const shot = async (ctx, path, file, opts = {}) => {
  const page = await ctx.newPage()
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  if (opts.dark) {
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await page.waitForTimeout(300)
  }
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: opts.full ?? false })
  const text = await page.locator('body').innerText()
  await page.close()
  return { status: res?.status(), text }
}

let r = await shot(admin, '/admin', '01-cms-accueil-lien')
check(r.text.includes('Espace Prospection'), 'lien « Espace Prospection » dans le menu du super admin')
check(!r.text.includes('Retour au CMS'), 'pas de « Retour au CMS » dans le CMS lui-même')
{
  const page = await admin.newPage()
  await page.goto(`${BASE}/admin/prospection`, { waitUntil: 'networkidle' })
  check((await page.locator('.crm-back-fab').count()) === 1, 'flèche « Retour au CMS » en bas à gauche')
  check((await page.locator('a.crm-back-nav').count()) === 1, '« Retour au CMS » dans le menu ☰')
  await page.locator('.crm-back-fab').click()
  await page.waitForURL(/\/admin\/?$/, { timeout: 15000 })
  check(true, 'la flèche ramène au tableau de bord du CMS')
  // Menu ☰ ouvert, pour voir « Retour au CMS » tout en bas
  await page.goto(`${BASE}/admin/collections/crm-prospects`, { waitUntil: 'networkidle' })
  check((await page.locator('.crm-back-fab').count()) === 1, 'flèche aussi sur la liste des prospects')
  const burger = page.locator('button[aria-label*="menu" i], .nav-toggler, .hamburger').first()
  if (await burger.count()) await burger.click().catch(() => {})
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/18-menu-retour-cms.png` })
  await page.close()
}
r = await shot(admin, '/admin/prospection', '02-prospection-accueil', { full: true })
check(r.text.includes('Prospection') && r.text.includes('cette semaine'), 'page /admin/prospection')
await shot(admin, '/admin/prospection', '03-prospection-accueil-sombre', { dark: true, full: true })
await shot(admin, '/admin/collections/crm-prospects', '04-liste-prospects')
// ---------- Base de prospection ----------
{
  const page = await admin.newPage()
  await page.goto(`${BASE}/admin/prospection/base`, { waitUntil: 'networkidle' })
  await page.locator('.btable').waitFor({ timeout: 15000 })
  const txt = await page.locator('.bcounts').innerText()
  check(/Prospects/.test(txt) && /Sites livrés/.test(txt), 'compteurs de la Base de prospection')
  await page.screenshot({ path: `${OUT}/20-base-prospection.png`, fullPage: true })

  // Statut commercial changé directement dans le tableau
  const row = page.locator('tr', { hasText: 'Exemple · Poney-club des Oliviers' })
  await row.locator('select[aria-label^="Statut commercial"]').selectOption('contacte')
  await page.getByText('Enregistré : Exemple · Poney-club des Oliviers').waitFor({ timeout: 10000 })
  const saved = (await api(admin, 'GET', `/crm-prospects/${ids[2]}?depth=0`)).body
  check(saved?.status === 'en-attente', `statut changé dans le tableau et enregistré (${saved?.status})`)
  await row.locator('select[aria-label^="Statut du projet"]').selectOption('en-cours')
  await page.waitForTimeout(1200)
  check((await api(admin, 'GET', `/crm-prospects/${ids[2]}?depth=0`)).body?.projectStatus === 'en-cours', 'statut du projet enregistré depuis le tableau')

  // Cases à cocher + action groupée
  await page.locator('tr', { hasText: 'Exemple · Haras du Mistral' }).locator('.bcol-check input').check()
  await page.locator('tr', { hasText: 'Exemple · Écurie des Pins' }).first().locator('.bcol-check input').check()
  await page.locator('.bbulk select[aria-label^="Changer le statut du projet"]').selectOption('livre')
  await page.getByText(/Statut du projet : 2 prospects mis à jour/).waitFor({ timeout: 15000 })
  const livres = (await api(admin, 'GET', '/crm-prospects?where[projectStatus][equals]=livre&depth=0')).body?.totalDocs
  check(livres === 2, `action groupée : 2 sites « Livré » (${livres})`)
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.btable').waitFor()
  check((await page.locator('.bcounts').innerText()).includes('2\nSites livrés'), 'compteur « Sites livrés » à jour après rechargement')

  // Filtres
  await page.locator('.bfilters select[aria-label="Statut commercial"]').selectOption('contacte')
  const shown = await page.locator('.btable tbody tr').count()
  check(shown >= 1, `filtre statut commercial (${shown} ligne(s))`)
  await page.screenshot({ path: `${OUT}/21-base-filtre.png` })
  await page.getByRole('button', { name: 'Effacer les filtres' }).click()

  // Fiche latérale : notes + échange avec relance
  await page.locator('tr', { hasText: 'Exemple · Domaine de la Garrigue' }).locator('.bname').click()
  await page.locator('.bfiche__panel').waitFor()
  await page.locator('.btextarea').fill('Propriétaire très sympathique, préfère être appelée le matin.')
  await page.getByRole('button', { name: 'Enregistrer les notes' }).click()
  await page.getByText('Enregistré ✓').waitFor({ timeout: 10000 })
  await page.locator('.badd input[type=text]').fill('Devis envoyé par e-mail')
  await page.locator('.badd input[type=date]').fill(new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10))
  await page.locator('.badd button[type=submit]').click()
  await page.locator('.bhist', { hasText: 'Devis envoyé par e-mail' }).waitFor({ timeout: 10000 })
  const g = (await api(admin, 'GET', `/crm-prospects/${ids[3]}?depth=0`)).body
  check(g?.notes?.includes('le matin'), 'notes enregistrées depuis la fiche')
  check(Boolean(g?.nextFollowUpAt), 'relance enregistrée depuis la fiche')
  await page.screenshot({ path: `${OUT}/22-base-fiche.png` })
  await page.close()
}
r = await shot(admin, '/admin/prospection/recherche', '25-recherche-avant', { full: true })
check(r.text.includes('Lancer la recherche') && r.text.includes('Chaque lundi'), 'page Recherche')
{
  const page = await admin.newPage()
  await page.goto(`${BASE}/admin/prospection/base?fiche=${ids[2]}`, { waitUntil: 'networkidle' })
  await page.locator('.bcoords').waitFor({ timeout: 15000 })
  check((await page.locator('.blookup a').count()) >= 3, 'liens « Chercher les coordonnées »')
  await page.locator('.bcoords input[type=tel]').fill('04 66 00 00 99')
  await page.locator('.bcoords input[type=email]').fill('contact@oliviers-exemple.test')
  await page.getByRole('button', { name: 'Enregistrer les coordonnées' }).click()
  await page.waitForTimeout(1500)
  const pr = (await api(admin, 'GET', `/crm-prospects/${ids[2]}?depth=0`)).body
  check(pr?.email === 'contact@oliviers-exemple.test' && pr?.phone === '04 66 00 00 99', 'coordonnées saisies depuis la fiche')
  await page.locator('.bcoords').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/26-fiche-coordonnees.png` })
  await page.close()
}
r = await shot(admin, '/admin/prospection/relances', '13-calendrier-relances', { full: true })
check(r.text.includes('Relances du mois') && r.text.includes('Haras du Mistral'), 'calendrier des relances')
r = await shot(admin, '/admin/prospection/import', '14-import-export', { full: true })
check(r.text.includes('Télécharger les prospects'), 'page import / export')
// Export CSV
const exp = await admin.request.fetch(`${BASE}/api/crm-export`, { headers: { Authorization: `JWT ${tokens.get(admin)}` }, failOnStatusCode: false })
const csv = await exp.text()
check(exp.status() === 200 && csv.includes('Exemple · Haras du Mistral') && csv.includes('Non trouvé'), `export CSV (HTTP ${exp.status()})`)
// Import : aperçu puis import réel, depuis la page, comme un utilisateur
fs.writeFileSync('/tmp/import.csv', '\uFEFFNom;Type;Commune;Code postal;Téléphone\nÉcurie Importée;écurie;Agde;34300;04 67 11 11 11\nExemple · Ecurie Pins;écurie;Lunel;;04 67 00 00 01\n')
{
  const page = await admin.newPage()
  await page.goto(`${BASE}/admin/prospection/import`, { waitUntil: 'networkidle' })
  await page.setInputFiles('input[type=file]', '/tmp/import.csv')
  await page.getByRole('button', { name: /Vérifier/ }).click()
  await page.getByText('Aperçu : 1 prospect').waitFor({ timeout: 15000 })
  await page.getByText(/Déjà connus/).click()
  await page.screenshot({ path: `${OUT}/15-import-apercu.png`, fullPage: true })
  await page.getByRole('button', { name: /Importer 1 prospect/ }).click()
  await page.getByText('1 prospect ajouté sur 2 lignes').waitFor({ timeout: 15000 })
  check(true, 'import depuis la page : aperçu puis 1 ajouté, 1 déjà connu')
  await page.close()
}

await shot(admin, `/admin/collections/crm-prospects/${ids[1]}`, '05-fiche-prospect', { full: true })
await shot(admin, '/admin/collections/crm-zones?where[active][equals]=true', '06-zones-actives')
await shot(admin, '/admin/collections/crm-duplicates', '07-doublons')
await shot(admin, '/admin/globals/crm-settings', '08-reglages')

{
  const ce = await api(client, 'GET', '/crm-export')
  check(ce.status === 403, `export refusé au client (HTTP ${ce.status})`)
  const ci = await client.request.fetch(`${BASE}/api/crm-import`, { method: 'POST', data: 'Nom\nIntrus', headers: { Authorization: `JWT ${tokens.get(client)}`, 'Content-Type': 'text/csv' }, failOnStatusCode: false })
  check(ci.status() === 403, `import refusé au client (HTTP ${ci.status()})`)
  r = await shot(client, '/admin/prospection/base', '16b-client-base')
  check(r.text.includes('Accès réservé'), 'Base de prospection refusée au client')
  r = await shot(client, '/admin/prospection/relances', '16-client-relances')
  check(r.text.includes('Accès réservé'), 'calendrier refusé au client')
}
r = await shot(client, '/admin', '09-client-accueil')
check(!r.text.includes('Espace Prospection') && !r.text.includes('Prospection (CRM)'), 'aucun lien Prospection pour le client')
r = await shot(client, '/admin/prospection', '10-client-acces-refuse')
check(r.text.includes('Accès réservé'), 'page Prospection refusée au client')
await browser.close()

// Téléphone (Safari / iPhone)
const wk = await webkit.launch()
const phone = await wk.newContext({ ...devices['iPhone 13'] })
await login(phone, CAP_EMAIL, CAP_PASS)
await shot(phone, '/admin/prospection', '11-telephone-prospection', { full: true })
await shot(phone, '/admin/prospection/base', '23-telephone-base', { full: true })
{
  const page = await phone.newPage()
  await page.goto(`${BASE}/admin/prospection/base?fiche=${ids[1]}`, { waitUntil: 'networkidle' })
  await page.locator('.bfiche__panel').waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/24-telephone-fiche.png` })
  await page.close()
}
await shot(phone, '/admin/prospection/relances', '17-telephone-relances', { full: true })
if (ids[0]) await shot(phone, `/admin/collections/crm-prospects/${ids[0]}`, '12-telephone-fiche', { full: true }).catch(() => log.push('   (capture iPhone de la fiche complète ignorée : délai dépassé)'))
await wk.close()

// ---------- VRAIE recherche sur le 34 (sources réelles), uniquement des nombres ----------
{
  const z34 = z('34')
  const t0 = Date.now()
  const st = await api(admin, 'POST', '/crm-search', { zoneIds: [z34], target: 25 })
  check(st.status === 202, `recherche lancée (HTTP ${st.status})`)
  const busy = await api(admin, 'POST', '/crm-search', { zoneIds: [z34], target: 5 })
  check(busy.status === 409, `seconde recherche refusée pendant la première (HTTP ${busy.status})`)
  let doc = null
  for (let i = 0; i < 160; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    doc = (await api(admin, 'GET', '/crm-searches?sort=-startedAt&limit=1&depth=0')).body?.docs?.[0]
    if (doc && doc.status !== 'en-cours') break
  }
  check(doc?.status === 'terminee', `recherche réelle terminée en ${Math.round((Date.now() - t0) / 1000)} s (${doc?.status})`)
  log.push(`   trouvés ${doc?.found} · ajoutés ${doc?.added}/${doc?.target} · déjà connus ${doc?.duplicates} · écartés ${doc?.rejected}`)
  for (const l of String(doc?.report ?? '').split('\n').slice(0, 4)) if (l) log.push(`   ${l}`)
  const added = (await api(admin, 'GET', `/crm-prospects?where[search][equals]=${doc?.id}&limit=100&depth=0`)).body?.docs ?? []
  const withSrc = added.filter((p) => (p.sources ?? []).length > 0).length
  check(added.length === doc?.added && withSrc === added.length, `chaque prospect ajouté a ses sources (${withSrc}/${added.length})`)
  check(added.every((p) => p.status === 'a-verifier'), 'tous les prospects ajoutés sont « À vérifier »')
  log.push(`   avec e-mail ${added.filter((p) => p.email).length} · avec téléphone ${added.filter((p) => p.phone).length} · avec site ${added.filter((p) => p.website).length} · avec SIREN ${added.filter((p) => p.siren).length}`)
  await shot(admin, '/admin/prospection/recherche', '27-recherche-apres')
}

console.log(log.join('\n'))
