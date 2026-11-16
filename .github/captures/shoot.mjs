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
r = await shot(admin, '/admin/prospection', '02-prospection-accueil', { full: true })
check(r.text.includes('Prospection') && r.text.includes('cette semaine'), 'page /admin/prospection')
await shot(admin, '/admin/prospection', '03-prospection-accueil-sombre', { dark: true, full: true })
await shot(admin, '/admin/collections/crm-prospects', '04-liste-prospects')
await shot(admin, `/admin/collections/crm-prospects/${ids[1]}`, '05-fiche-prospect', { full: true })
await shot(admin, '/admin/collections/crm-zones?where[active][equals]=true', '06-zones-actives')
await shot(admin, '/admin/collections/crm-duplicates', '07-doublons')
await shot(admin, '/admin/globals/crm-settings', '08-reglages')

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
if (ids[0]) await shot(phone, `/admin/collections/crm-prospects/${ids[0]}`, '12-telephone-fiche', { full: true })
await wk.close()

console.log(log.join('\n'))
