import type { Payload } from 'payload'

import type { Category, Event, Media, Price, SiteInfo, Tenant } from '@/payload-types'
import { escapeHTML } from '@/utilities/serverURL'

import { fallbackLogo, template as poignyTemplate } from './ecuries-poigny/template'

/**
 * Sites publics des clients, servis par le CMS lui-même à l'adresse /sites/<identifiant>.
 *
 * Chaque client a sa maquette (HTML) avec des repères {{…}} que l'on remplit ici à partir
 * de SES contenus. Les lectures se font côté serveur, toujours filtrées sur l'id du client :
 * un site ne peut jamais afficher les données d'un autre client, et aucune clé n'est
 * envoyée au navigateur. Seuls des contenus destinés au public sont lus.
 */
const TEMPLATES: Record<string, string> = {
  'ecuries-poigny': poignyTemplate,
}

export const hasSiteTemplate = (slug: string) => Object.hasOwn(TEMPLATES, slug)

const DAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const DAY_LABEL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const WEEK = [1, 2, 3, 4, 5, 6, 0]

const esc = (v: unknown) => escapeHTML(String(v ?? ''))
/** JSON sûr à placer dans une balise <script>. */
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c')
const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' ')} €`
const toHours = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}
const fmtTime = (t: string) => {
  const [h, m] = t.split(':')
  return `${Number(h)}h${m === '00' ? '' : m}`
}
const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tarifs'

const isMedia = (v: unknown): v is Media => typeof v === 'object' && v !== null && 'filename' in v

export async function renderSite(payload: Payload, siteSlug: string): Promise<string | null> {
  const template = TEMPLATES[siteSlug]
  if (!template) return null

  const read = { overrideAccess: true, locale: 'fr' as const, fallbackLocale: 'fr' as const }
  const { docs: tenants } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 1, ...read })
  const tenant = tenants[0] as Tenant | undefined
  if (!tenant || tenant.status === 'suspended') return null

  const ofTenant = { tenant: { equals: tenant.id } }
  const settings = tenant.settings ?? {}
  const [infoRes, priceRes, galleryRes, eventRes] = await Promise.all([
    payload.find({ collection: 'site-info', where: ofTenant, limit: 1, depth: 0, ...read }),
    settings.showPrices === false
      ? null
      : payload.find({ collection: 'prices', where: ofTenant, sort: 'order', limit: 200, depth: 1, ...read }),
    settings.showGallery === false
      ? null
      : payload.find({ collection: 'media', where: { and: [ofTenant, { inGallery: { equals: true } }] }, sort: 'createdAt', limit: 48, depth: 0, ...read }),
    settings.showEvents === false
      ? null
      : payload.find({
          collection: 'events',
          where: { and: [ofTenant, { startsAt: { greater_than_equal: new Date(Date.now() - 864e5).toISOString() } }] },
          sort: 'startsAt',
          limit: 6,
          depth: 0,
          ...read,
        }),
  ])
  const info = infoRes.docs[0] as SiteInfo | undefined
  const mediaURL = (id: number | string, size?: string) => `/sites/${siteSlug}/media/${id}${size ? `?size=${size}` : ''}`

  // ── Coordonnées (les « Informations » priment sur la fiche client) ──
  const phone = info?.phone || tenant.phone || ''
  const email = info?.email || tenant.email || ''
  const addr = info?.address?.street ? info.address : tenant.address
  const city = addr?.city || ''
  const addressHTML = [addr?.street, [addr?.postalCode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>')
  const mapsURL =
    info?.address?.mapsUrl ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addr?.street, addr?.postalCode, addr?.city].filter(Boolean).join(' '))}`

  // ── Horaires ──
  const sched: Record<number, [number, number][]> = {}
  const hoursText: Record<number, string> = {}
  for (const row of info?.openingHours ?? []) {
    const d = DAY_INDEX[row.day]
    const slots = row.closed ? [] : (row.slots ?? [])
    sched[d] = slots.map((s) => [toHours(s.opens), toHours(s.closes)])
    hoursText[d] = slots.length ? slots.map((s) => `${fmtTime(s.opens)} – ${fmtTime(s.closes)}`).join(' · ') : 'Fermé'
  }
  const hoursRows = WEEK.map((d) => `<tr data-d="${d}"><td>${DAY_LABEL[d]}</td><td>${esc(hoursText[d] ?? 'Fermé')}</td></tr>`).join('')

  // ── Réseaux ──
  const insta = info?.socials?.find((s) => s.network === 'instagram')?.url
  const instaHandle = insta?.match(/instagram\.com\/([^/?#]+)/)?.[1]

  // ── Logo ──
  const logo = tenant.logo
  const logoSrc = isMedia(logo) ? mediaURL(logo.id) : fallbackLogo

  // ── Galerie ──
  const photos = (galleryRes?.docs ?? []) as Media[]
  const tilts = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
  const galleryHTML = photos
    .map((m, i) => {
      const caption = m.title || m.alt
      return `<figure class="pola ${tilts[i % tilts.length]}" tabindex="0"><img src="${mediaURL(m.id, 'card')}" data-full="${mediaURL(m.id, 'hero')}" alt="${esc(m.alt)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`
    })
    .join('\n')

  // ── Tarifs : un onglet par catégorie ──
  const prices = (priceRes?.docs ?? []) as Price[]
  const groups = new Map<string, { name: string; order: number; items: Price[] }>()
  for (const p of prices) {
    const cat = typeof p.category === 'object' && p.category ? (p.category as Category) : null
    const key = cat ? String(cat.id) : 'autres'
    if (!groups.has(key)) groups.set(key, { name: cat?.name || 'Tarifs', order: cat?.order ?? 999, items: [] })
    groups.get(key)!.items.push(p)
  }
  const tabs = [...groups.values()].sort((a, b) => a.order - b.order)
  const amount = (p: Price) => p.displayPrice || (p.isFrom ? `dès ${euros(p.price)}` : euros(p.price))
  const tabsHTML = tabs
    .map((g, i) => {
      const id = `${slug(g.name)}-${i}`
      return `<button id="t-${id}" role="tab" data-t="${id}" aria-selected="${i === 0}">${esc(g.name)}</button>`
    })
    .join('\n      ')
  const panelsHTML = tabs
    .map((g, i) => {
      const id = `${slug(g.name)}-${i}`
      const cards = g.items
        .map(
          (p) =>
            `<div class="prix-card${p.highlight ? ' star' : ''}">${p.description ? `<span class="unite">${esc(p.description)}</span>` : ''}<h3>${esc(p.name)}</h3><span class="montant">${esc(amount(p))}</span>${p.unit ? `<span class="unite">${esc(p.unit)}</span>` : ''}</div>`,
        )
        .join('\n      ')
      return `<div class="prix" data-panel="${id}" role="tabpanel"${i === 0 ? '' : ' hidden'}>\n      ${cards}\n    </div>`
    })
    .join('\n    ')
  const yearly = tabs[0]?.items ?? []
  const simuHTML = [
    ...yearly.map((p, i) => `<option value="${p.price}"${i === 1 || yearly.length === 1 ? ' selected' : ''}>${esc(p.name)} · ${esc(amount(p))}</option>`),
    '<option value="0">Pas de cours à l’année</option>',
  ].join('\n          ')
  const stageDay = prices.find((p) => /^journ[ée]e de stage/i.test(p.name))?.price ?? 0

  // ── Stages : prochains événements, sinon le texte d'origine ──
  const events = (eventRes?.docs ?? []) as Event[]
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
  const stagesHTML = events.length
    ? `<p>Les prochaines dates :</p><ul style="margin:8px 0 0;padding-left:1.1em;display:grid;gap:4px">${events
        .map((e) => `<li><b>${esc(dateFmt.format(new Date(e.startsAt)))}</b> · ${esc(e.title)}${e.description ? ` — ${esc(e.description)}` : ''}</li>`)
        .join('')}</ul>`
    : `<p>Poney, cheval, débutant ou confirmé : les dates et le programme sont annoncés${insta ? ' sur Instagram et' : ''} par téléphone. Les places partent vite.</p>`

  let html = template
  // Sections masquées si vides ou désactivées dans la fiche client
  if (!photos.length) html = html.replace(/<!--GALLERY_START-->[\s\S]*?<!--GALLERY_END-->/, '')
  if (!prices.length) html = html.replace(/<!--PRICES_START-->[\s\S]*?<!--PRICES_END-->/, '')
  // La simulation n'a de sens qu'avec un prix de journée de stage
  if (!stageDay) html = html.replace(/<div class="simu">[\s\S]*?<\/div>\s*<\/div>\s*<p class="note">/, '<p class="note">')

  const values: Record<string, string> = {
    TITLE: esc(tenant.name),
    NAME: esc(tenant.name),
    CITY: esc(city),
    YEAR: String(new Date().getFullYear()),
    LOGO_SRC: logoSrc,
    NAV_PHOTOS: photos.length ? '<a href="#galerie">Photos</a>' : '',
    NAV_TARIFS: prices.length ? '<a href="#tarifs">Tarifs</a>' : '',
    GALLERY: galleryHTML,
    PRICE_TABS: tabsHTML,
    PRICE_PANELS: panelsHTML,
    SIMU_OPTIONS: simuHTML,
    STAGE_DAY: String(stageDay),
    STAGES_TEXT: stagesHTML,
    INSTAGRAM_URL: esc(insta || '#contact'),
    INSTAGRAM_LABEL: insta ? `Instagram${instaHandle ? ` @${esc(instaHandle)}` : ''}` : 'Contact',
    PHONE: esc(phone),
    EMAIL: esc(email),
    EMAIL_JSON: jsonForScript(email),
    ADDRESS_HTML: addressHTML,
    MAPS_URL: esc(mapsURL),
    HOURS_ROWS: hoursRows,
    SCHED_JSON: jsonForScript(sched),
  }
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => values[key] ?? m)
}
