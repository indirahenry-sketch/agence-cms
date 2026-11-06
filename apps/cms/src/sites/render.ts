import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Payload } from 'payload'

import type { Category, Event, Media, Menu, Page, Post, Price, Promotion, Service, SiteInfo, Tenant } from '@/payload-types'
import { safeHref } from '@/utilities/safeURL'
import { escapeHTML } from '@/utilities/serverURL'

import { fallbackLogo, serviceIcons, template as poignyTemplate } from './ecuries-poigny/template'

/**
 * Sites publics des clients, servis par le CMS à l'adresse /sites/<identifiant>.
 *
 * Chaque client a une maquette HTML (son « thème ») avec des repères {{…}} remplis à chaque
 * visite avec SES contenus : coordonnées, horaires, menus, services, tarifs, photos, agenda,
 * articles, bannières et pop-ups. Les pages créées dans le CMS sont affichées à
 * /sites/<identifiant>/<adresse-de-la-page> avec l'en-tête et le pied de page du thème.
 *
 * Toutes les lectures se font côté serveur, filtrées sur l'id du client : un site ne peut
 * jamais afficher les données d'un autre client. Seuls les contenus publiés sont lus.
 */
const TEMPLATES: Record<string, string> = {
  'ecuries-poigny': poignyTemplate,
}

export const hasSiteTemplate = (slug: string) => Object.hasOwn(TEMPLATES, slug)

// ── Petits outils ──────────────────────────────────────────────────────

const DAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
const DAY_LABEL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DEFAULT_LINKS = [
  { label: 'Photos', anchor: 'galerie' },
  { label: 'Services', anchor: 'services' },
  { label: 'Tarifs', anchor: 'tarifs' },
  { label: 'Blog', anchor: 'blog' },
  { label: 'Contact', anchor: 'contact' },
]

const esc = (v: unknown) => escapeHTML(String(v ?? ''))
/** JSON sûr à placer dans une balise <script>. */
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)
const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/ /g, ' ')} €`
const toHours = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}
const fmtTime = (t: string) => {
  const [h, m] = t.split(':')
  return `${Number(h)}h${m === '00' ? '' : m}`
}
const slugify = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'onglet'
const isMedia = (v: unknown): v is Media => typeof v === 'object' && v !== null && 'filename' in v
const parisDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso))

/** Texte brut d'un champ « texte riche » (pour l'agenda et le blog de la maquette). */
const lexicalToText = (value: unknown): string => {
  const root = (value as { root?: { children?: unknown[] } } | null)?.root
  if (!root) return ''
  const walk = (node: { type?: string; text?: string; children?: unknown[] }): string =>
    node.type === 'text' ? (node.text ?? '') : node.type === 'linebreak' ? '\n' : (node.children ?? []).map((c) => walk(c as never)).join('')
  return (root.children ?? []).map((c) => walk(c as never)).filter(Boolean).join('\n\n')
}

// ── Lecture des contenus d'un client ─────────────────────────────────

type SiteData = {
  tenant: Tenant
  base: string
  info?: SiteInfo
  prices: Price[]
  photos: Media[]
  events: Event[]
  posts: Post[]
  services: Service[]
  menus: Menu[]
  promotions: Promotion[]
}

const read = { overrideAccess: true, locale: 'fr' as const, fallbackLocale: 'fr' as const }

async function loadTenant(payload: Payload, siteSlug: string): Promise<Tenant | null> {
  if (!hasSiteTemplate(siteSlug)) return null
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 1, ...read })
  const tenant = docs[0] as Tenant | undefined
  return tenant && tenant.status !== 'suspended' ? tenant : null
}

async function loadSite(payload: Payload, tenant: Tenant, full: boolean): Promise<SiteData> {
  const ofTenant = { tenant: { equals: tenant.id } }
  const settings = tenant.settings ?? {}
  const now = new Date().toISOString()
  const none = { docs: [] }
  const [info, prices, photos, events, posts, services, menus, promotions] = await Promise.all([
    payload.find({ collection: 'site-info', where: ofTenant, limit: 1, depth: 0, ...read }),
    full && settings.showPrices !== false
      ? payload.find({ collection: 'prices', where: ofTenant, sort: 'order', limit: 200, depth: 1, ...read })
      : none,
    full && settings.showGallery !== false
      ? payload.find({ collection: 'media', where: { and: [ofTenant, { inGallery: { equals: true } }] }, sort: 'createdAt', limit: 48, depth: 0, ...read })
      : none,
    full && settings.showEvents !== false
      ? payload.find({
          collection: 'events',
          where: { and: [ofTenant, { startsAt: { greater_than_equal: new Date(Date.now() - 62 * 864e5).toISOString() } }] },
          sort: 'startsAt',
          limit: 200,
          depth: 0,
          ...read,
        })
      : none,
    full && settings.showBlog !== false
      ? payload.find({
          collection: 'posts',
          where: { and: [ofTenant, { _status: { equals: 'published' } }] },
          sort: '-publishedAt',
          limit: 30,
          depth: 1,
          ...read,
        })
      : none,
    full ? payload.find({ collection: 'services', where: ofTenant, sort: 'order', limit: 50, depth: 0, ...read }) : none,
    payload.find({ collection: 'menus', where: ofTenant, limit: 10, depth: 1, ...read }),
    payload.find({
      collection: 'promotions',
      where: {
        and: [
          ofTenant,
          { active: { equals: true } },
          { or: [{ startsAt: { exists: false } }, { startsAt: { less_than_equal: now } }] },
          { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than: now } }] },
        ],
      },
      sort: '-updatedAt',
      limit: 4,
      depth: 1,
      ...read,
    }),
  ])
  return {
    tenant,
    base: `/sites/${tenant.slug}`,
    info: info.docs[0] as SiteInfo | undefined,
    prices: prices.docs as Price[],
    photos: photos.docs as Media[],
    events: events.docs as Event[],
    posts: posts.docs as Post[],
    services: services.docs as Service[],
    menus: menus.docs as Menu[],
    promotions: promotions.docs as Promotion[],
  }
}

const mediaURL = (d: SiteData, m: Media | number | null | undefined, size?: string) => {
  const id = typeof m === 'object' && m ? m.id : m
  return id ? `${d.base}/media/${id}${size ? `?size=${size}` : ''}` : ''
}

// ── Menus ────────────────────────────────────────────────────────────

type MenuLink = { label: string; type: string; page?: number | Page | null; anchor?: string | null; url?: string | null; newTab?: boolean | null }

const linkHref = (d: SiteData, l: MenuLink): string => {
  if (l.type === 'page') {
    const page = typeof l.page === 'object' && l.page ? l.page : null
    return page?.slug ? `${d.base}/${encodeURIComponent(page.slug)}` : d.base
  }
  if (l.type === 'anchor') return `${d.base}#${l.anchor || 'top'}`
  return safeHref(l.url)
}
const linkHTML = (d: SiteData, l: MenuLink, extra = '') => {
  const blogAttr = l.type === 'anchor' && l.anchor === 'blog' ? ' data-v="blog"' : ''
  const target = l.newTab ? ' target="_blank" rel="noopener"' : ''
  return `<a href="${esc(linkHref(d, l))}"${blogAttr}${target}${extra}>${esc(l.label)}</a>`
}

const menuOf = (d: SiteData, location: string) => d.menus.find((m) => m.location === location)

function navLinks(d: SiteData): string {
  const menu = menuOf(d, 'main')
  if (!menu?.items?.length) return DEFAULT_LINKS.map((l) => linkHTML(d, { ...l, type: 'anchor' })).join('')
  return menu.items
    .map((item) => {
      if (!item.children?.length) return linkHTML(d, item as MenuLink)
      const subs = item.children.map((c) => linkHTML(d, c as MenuLink)).join('')
      return `<span class="has-sub">${linkHTML(d, item as MenuLink, ' aria-haspopup="true"')}<span class="sub">${subs}</span></span>`
    })
    .join('')
}

function footerLinks(d: SiteData, insta?: string | null): string {
  const menu = menuOf(d, 'footer')
  const links = (menu?.items ?? []).flatMap((i) => [i, ...(i.children ?? [])]).map((l) => linkHTML(d, l as MenuLink))
  if (!links.length && insta) links.push(`<a href="${esc(safeHref(insta))}" target="_blank" rel="noopener">Instagram</a>`)
  return links.join(' · ')
}

// ── Bannières et pop-ups ─────────────────────────────────────────────

const PROMO_CSS = `<style>
.promo-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 14px;padding:10px 48px 10px 16px;position:relative;font:500 .95rem/1.35 var(--f-body,system-ui);text-align:center}
.promo-banner b{font-weight:700}.promo-banner a{font-weight:700;text-decoration:underline;text-underline-offset:3px;color:inherit}
.promo-accent{background:var(--paille,#E2B53C);color:var(--paille-ink,#222)}.promo-dark{background:var(--flot,#222);color:var(--flot-ink,#fff)}.promo-light{background:var(--card,#fff);color:var(--ink,#222);border-bottom:1px solid var(--line,#ddd)}
.promo-x{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:50%;border:0;background:transparent;color:inherit;font-size:1.2rem;cursor:pointer}
.promo-pop{position:fixed;inset:0;z-index:200;display:grid;place-items:center;padding:16px;background:rgba(20,24,12,.55)}
.promo-pop[hidden]{display:none}
.promo-card{position:relative;width:min(440px,100%);max-height:90vh;overflow:auto;background:var(--card,#fff);color:var(--ink,#222);border-radius:var(--r,20px);box-shadow:0 20px 60px rgba(0,0,0,.35)}
.promo-card img{display:block;width:100%;max-height:240px;object-fit:cover}.promo-card .pb{padding:22px;display:grid;gap:10px}
.promo-card h2{font-size:1.9rem}.promo-card p{color:var(--muted,#555)}.promo-card .btn{justify-self:start}
.promo-card .promo-x{top:10px;transform:none;background:var(--card,#fff);color:var(--ink,#222)}
.has-sub{position:relative;display:inline-flex}.has-sub .sub{display:none;position:absolute;top:100%;left:-12px;min-width:200px;padding:8px;background:var(--card,#fff);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.15);flex-direction:column;gap:2px;z-index:60}
.has-sub .sub a{padding:8px 12px;border-radius:10px}.has-sub:hover .sub,.has-sub:focus-within .sub{display:flex}
.foot-links a{margin-left:4px}
</style>`

function promoBanner(d: SiteData): string {
  const p = d.promotions.find((x) => x.kind === 'banner')
  if (!p) return ''
  const btn = p.buttonLabel && p.buttonUrl ? `<a href="${esc(safeHref(p.buttonUrl))}">${esc(p.buttonLabel)}</a>` : ''
  return `<div class="promo-banner promo-${esc(p.style || 'accent')}" id="promo-b-${p.id}" role="region" aria-label="Annonce"><b>${esc(p.title)}</b>${p.text ? `<span>${esc(p.text)}</span>` : ''}${btn}<button class="promo-x" type="button" aria-label="Fermer l’annonce" onclick="this.parentNode.remove()">×</button></div>`
}

function promoPopup(d: SiteData): string {
  const p = d.promotions.find((x) => x.kind === 'popup')
  if (!p) return ''
  const img = isMedia(p.image) ? `<img src="${esc(mediaURL(d, p.image, 'card'))}" alt="${esc(p.image.alt)}">` : ''
  const btn = p.buttonLabel && p.buttonUrl ? `<a class="btn primary" href="${esc(safeHref(p.buttonUrl))}" data-close>${esc(p.buttonLabel)}</a>` : ''
  const cfg = jsonForScript({ id: `promo-${p.id}-${new Date(p.updatedAt).getTime()}`, freq: p.frequency || 'session', delay: Math.max(0, Number(p.delay ?? 3)) })
  return `<div class="promo-pop" id="promoPop" hidden role="dialog" aria-modal="true" aria-labelledby="promoTitle"><div class="promo-card">${img}<div class="pb"><h2 id="promoTitle">${esc(p.title)}</h2>${p.text ? `<p>${esc(p.text)}</p>` : ''}${btn}</div><button class="promo-x" type="button" aria-label="Fermer" data-close>×</button></div></div>
<script>(function(){var c=${cfg},el=document.getElementById('promoPop');if(!el)return;
function get(s){try{return s.getItem(c.id)}catch(e){return null}}function set(s){try{s.setItem(c.id,'1')}catch(e){}}
var store=c.freq==='once'?window.localStorage:window.sessionStorage;if(c.freq!=='always'&&get(store))return;
function close(){el.hidden=true;if(c.freq!=='always')set(store)}
el.addEventListener('click',function(e){if(e.target===el||e.target.closest('[data-close]'))close()});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!el.hidden)close()});
setTimeout(function(){el.hidden=false},c.delay*1000)})();</script>`
}

// ── Valeurs communes à toutes les pages du site ──────────────────────

function commonValues(d: SiteData, title: string, description: string) {
  const { tenant, info } = d
  const addr = info?.address?.street ? info.address : tenant.address
  const insta = info?.socials?.find((s) => s.network === 'instagram')?.url
  const blogLink = d.posts.length || d.events.length || !hasRenderedData(d) ? `<a class="nav-blog" href="${esc(d.base)}#blog" data-v="blog">Blog</a>` : ''
  return {
    TITLE: esc(title),
    META_DESCRIPTION: esc(description),
    NAME: esc(tenant.name),
    CITY: esc(addr?.city || ''),
    YEAR: String(new Date().getFullYear()),
    HOME_URL: esc(d.base),
    LOGO_SRC: isMedia(tenant.logo) ? mediaURL(d, tenant.logo) : fallbackLogo,
    NAV_LINKS: navLinks(d),
    NAV_BLOG: tenant.settings?.showBlog === false ? '' : blogLink,
    FOOTER_LINKS: footerLinks(d, insta),
    PROMO_BANNER: promoBanner(d),
    PROMO_POPUP: promoPopup(d),
    EXTRA_HEAD: PROMO_CSS,
  }
}
const hasRenderedData = (d: SiteData) => d.prices.length + d.photos.length + d.services.length > 0

const fill = (html: string, values: Record<string, string>) => html.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => values[key] ?? '')

// ── Page d'accueil (la maquette complète) ────────────────────────────

export async function renderSite(payload: Payload, siteSlug: string): Promise<string | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  const d = await loadSite(payload, tenant, true)
  const { info } = d
  let html = TEMPLATES[siteSlug]

  // Coordonnées (les « Informations » priment sur la fiche client)
  const phone = info?.phone || tenant.phone || ''
  const email = info?.email || tenant.email || ''
  const addr = info?.address?.street ? info.address : tenant.address
  const addressHTML = [addr?.street, [addr?.postalCode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>')
  const mapsURL =
    safeHref(info?.address?.mapsUrl) !== '#'
      ? safeHref(info?.address?.mapsUrl)
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addr?.street, addr?.postalCode, addr?.city].filter(Boolean).join(' '))}`

  // Horaires
  const sched: Record<number, [number, number][]> = {}
  const hoursText: Record<number, string> = {}
  for (const row of info?.openingHours ?? []) {
    const day = DAY_INDEX[row.day]
    const slots = row.closed ? [] : (row.slots ?? [])
    sched[day] = slots.map((s) => [toHours(s.opens), toHours(s.closes)])
    hoursText[day] = slots.length ? slots.map((s) => `${fmtTime(s.opens)} – ${fmtTime(s.closes)}`).join(' · ') : 'Fermé'
  }
  const hoursRows = WEEK.map((day) => `<tr data-d="${day}"><td>${DAY_LABEL[day]}</td><td>${esc(hoursText[day] ?? 'Fermé')}</td></tr>`).join('')

  const insta = info?.socials?.find((s) => s.network === 'instagram')?.url

  // Galerie
  const tilts = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']
  const galleryHTML = d.photos
    .map(
      (m, i) =>
        `<figure class="pola ${tilts[i % tilts.length]}" tabindex="0"><img src="${mediaURL(d, m, 'card')}" data-full="${mediaURL(d, m, 'hero')}" alt="${esc(m.alt)}" loading="lazy"><figcaption>${esc(m.title || m.alt)}</figcaption></figure>`,
    )
    .join('\n')

  // Services
  const servicesHTML = d.services
    .map((s) => {
      const audiences = s.audiences?.length ? s.audiences.join(' ') : 'debutant loisir compet proprio'
      const points = (s.points ?? []).map((p) => `<li>${esc(p.text)}</li>`).join('')
      return `<article class="svc" data-for="${esc(audiences)}"><span class="tag">Pour toi</span><div class="ico">${serviceIcons[s.icon || ''] ?? serviceIcons.person}</div><h3>${esc(s.title)}</h3>${s.summary ? `<p>${esc(s.summary)}</p>` : ''}${points ? `<ul>${points}</ul>` : ''}</article>`
    })
    .join('\n')

  // Tarifs : un onglet par catégorie
  const groups = new Map<string, { name: string; order: number; items: Price[] }>()
  for (const p of d.prices) {
    const cat = typeof p.category === 'object' && p.category ? (p.category as Category) : null
    const key = cat ? String(cat.id) : 'autres'
    if (!groups.has(key)) groups.set(key, { name: cat?.name || 'Tarifs', order: cat?.order ?? 999, items: [] })
    groups.get(key)!.items.push(p)
  }
  const tabs = [...groups.values()].sort((a, b) => a.order - b.order)
  const amount = (p: Price) => p.displayPrice || (p.isFrom ? `dès ${euros(p.price)}` : euros(p.price))
  const tabID = (name: string, i: number) => `${slugify(name)}-${i}`
  const tabsHTML = tabs
    .map((g, i) => `<button id="t-${tabID(g.name, i)}" role="tab" data-t="${tabID(g.name, i)}" aria-selected="${i === 0}">${esc(g.name)}</button>`)
    .join('\n      ')
  const panelsHTML = tabs
    .map((g, i) => {
      const cards = g.items
        .map(
          (p) =>
            `<div class="prix-card${p.highlight ? ' star' : ''}">${p.description ? `<span class="unite">${esc(p.description)}</span>` : ''}<h3>${esc(p.name)}</h3><span class="montant">${esc(amount(p))}</span>${p.unit ? `<span class="unite">${esc(p.unit)}</span>` : ''}</div>`,
        )
        .join('\n      ')
      return `<div class="prix" data-panel="${tabID(g.name, i)}" role="tabpanel"${i === 0 ? '' : ' hidden'}>\n      ${cards}\n    </div>`
    })
    .join('\n    ')
  const yearly = tabs[0]?.items ?? []
  const simuHTML = [
    ...yearly.map((p, i) => `<option value="${p.price}"${i === 1 || yearly.length === 1 ? ' selected' : ''}>${esc(p.name)} · ${esc(amount(p))}</option>`),
    '<option value="0">Pas de cours à l’année</option>',
  ].join('\n          ')
  const stageDay = d.prices.find((p) => /^journ[ée]e de stage/i.test(p.name))?.price ?? 0

  // Stages : prochain stage de l'agenda, sinon le texte d'origine
  const nextStage = d.events.find((e) => e.type === 'stage' && new Date(e.endsAt || e.startsAt).getTime() >= Date.now())
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
  const stagesText = nextStage
    ? `<p>Prochain stage : <b>${esc(nextStage.title)}</b>, ${nextStage.endsAt && parisDate(nextStage.endsAt) !== parisDate(nextStage.startsAt) ? `du ${esc(dateFmt.format(new Date(nextStage.startsAt)))} au ${esc(dateFmt.format(new Date(nextStage.endsAt)))}` : `le ${esc(dateFmt.format(new Date(nextStage.startsAt)))}`}. ${esc(nextStage.description || '')} Toutes les dates sont dans l’agenda du blog.</p>`
    : `<p>Poney, cheval, débutant ou confirmé : les dates et le programme sont annoncés${insta ? ' sur Instagram et' : ''} par téléphone. Les places partent vite.</p>`

  // Agenda et articles (lus par le script de la maquette)
  const blog = {
    articles: d.posts.map((p) => ({
      id: String(p.id),
      titre: p.title,
      texte: lexicalToText(p.content) || p.excerpt || '',
      date: p.publishedAt ? parisDate(p.publishedAt) : parisDate(p.createdAt),
      ...(isMedia(p.coverImage) ? { image: mediaURL(d, p.coverImage, 'card') } : {}),
    })),
    evenements: d.events.map((e) => ({
      id: String(e.id),
      debut: parisDate(e.startsAt),
      fin: e.endsAt ? parisDate(e.endsAt) : parisDate(e.startsAt),
      type: e.type || 'autre',
      titre: e.title,
      horaires: e.hours || '',
      detail: e.description || '',
    })),
  }

  // Sections masquées si vides ou désactivées
  if (!d.photos.length) html = html.replace(/<!--GALLERY_START-->[\s\S]*?<!--GALLERY_END-->/, '')
  if (!d.prices.length) html = html.replace(/<!--PRICES_START-->[\s\S]*?<!--PRICES_END-->/, '')
  if (!d.services.length) html = html.replace(/<!--SERVICES_START-->[\s\S]*?<!--SERVICES_END-->/, '')
  if (!stageDay) html = html.replace(/<div class="simu">[\s\S]*?<\/div>\s*<\/div>\s*<p class="note">/, '<p class="note">')

  return fill(html, {
    ...commonValues(d, tenant.name, `${tenant.name}${addr?.city ? ` à ${addr.city}` : ''}`),
    GALLERY: galleryHTML,
    SERVICES: servicesHTML,
    PRICE_TABS: tabsHTML,
    PRICE_PANELS: panelsHTML,
    SIMU_OPTIONS: simuHTML,
    STAGE_DAY: String(stageDay),
    STAGES_TEXT: stagesText,
    STAGES_BUTTON: insta ? 'Voir sur Instagram' : 'Nous contacter',
    INSTAGRAM_URL: esc(insta ? safeHref(insta) : `${d.base}#contact`),
    PHONE: esc(phone),
    EMAIL: esc(email),
    EMAIL_JSON: jsonForScript(email),
    ADDRESS_HTML: addressHTML,
    MAPS_URL: esc(mapsURL),
    HOURS_ROWS: hoursRows,
    SCHED_JSON: jsonForScript(sched),
    BLOG_JSON: jsonForScript(blog),
  })
}

// ── Pages créées dans le CMS ─────────────────────────────────────────

const PAGE_CSS = `<style>
.cms-page{padding-block:clamp(32px,6vw,72px)}
.cms-page>.wrap{display:grid;gap:clamp(28px,4vw,48px)}
.cms-page h1{font-size:clamp(2.4rem,6vw,4.2rem)}
.cms-head{display:grid;gap:12px;max-width:760px}
.cms-prose{max-width:760px;display:grid;gap:14px;font-size:1.06rem;line-height:1.6}
.cms-prose h2,.cms-prose h3{margin-top:10px}.cms-prose img{border-radius:var(--r,18px)}.cms-prose blockquote{margin:0;padding-left:16px;border-left:4px solid var(--paille,#ccc)}
.cms-prose ul,.cms-prose ol{margin:0;padding-left:1.2em}
.cms-section{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:clamp(18px,4vw,44px);align-items:center;border-radius:var(--r,20px)}
.cms-section.left>.cms-media{order:-1}.cms-section.nomedia{grid-template-columns:1fr}
.cms-section.bg-card{background:var(--card,#fff);padding:clamp(20px,4vw,40px)}
.cms-section.bg-accent{background:var(--flot,#333);color:var(--flot-ink,#fff);padding:clamp(20px,4vw,40px)}
.cms-section.bg-accent .eyebrow,.cms-section.bg-accent .cms-prose{color:inherit}
.cms-section .txt{display:grid;gap:14px}.cms-media img,.cms-media video,.cms-figure img,.cms-figure video{width:100%;border-radius:var(--r,18px);display:block}
.cms-figure{margin:0;display:grid;gap:8px}.cms-figure figcaption{color:var(--muted,#666);font-size:.9rem}
.cms-btns{display:flex;flex-wrap:wrap;gap:12px}
.cms-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.cms-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:14px}
.cms-events{display:grid;gap:10px}.cms-events li{list-style:none;background:var(--card,#fff);border-radius:16px;padding:14px 16px}
.cms-events{padding:0;margin:0}
@media (max-width:760px){.cms-section{grid-template-columns:1fr}.cms-section.left>.cms-media{order:0}}
</style>`

type Block = NonNullable<Page['layout']>[number]

const richHTML = (d: SiteData, data: unknown): string => {
  if (!data || typeof data !== 'object') return ''
  try {
    return convertLexicalToHTML({
      data: data as never,
      disableContainer: true,
      converters: ({ defaultConverters }) => ({
        ...defaultConverters,
        // Images insérées dans le texte : servies par le point d'accès public du site
        upload: ({ node }) => {
          const m = (node as { value?: unknown }).value
          return isMedia(m) && m.mimeType?.startsWith('image/') ? `<img src="${esc(mediaURL(d, m, 'card'))}" alt="${esc(m.alt)}" loading="lazy">` : ''
        },
        // Liens : adresses sûres uniquement
        link: ({ node, nodesToHTML }) => {
          const f = (node as { fields?: { url?: string; newTab?: boolean } }).fields ?? {}
          return `<a href="${esc(safeHref(f.url))}"${f.newTab ? ' target="_blank" rel="noopener"' : ''}>${nodesToHTML({ nodes: (node as unknown as { children?: never[] }).children ?? [] }).join('')}</a>`
        },
      }),
    })
  } catch {
    return `<p>${esc(lexicalToText(data))}</p>`
  }
}

const buttonsHTML = (buttons: { label: string; url: string; style?: string | null }[] | null | undefined) =>
  buttons?.length
    ? `<div class="cms-btns">${buttons.map((b) => `<a class="btn${b.style === 'secondary' ? '' : ' primary'}" href="${esc(safeHref(b.url))}">${esc(b.label)}</a>`).join('')}</div>`
    : ''

const mediaTag = (d: SiteData, m: unknown) => {
  if (!isMedia(m)) return ''
  if (m.mimeType?.startsWith('video/')) return `<video src="${esc(mediaURL(d, m))}" controls playsinline preload="metadata"></video>`
  if (m.mimeType?.startsWith('image/')) return `<img src="${esc(mediaURL(d, m, 'card'))}" alt="${esc(m.alt)}" loading="lazy">`
  return `<a class="btn" href="${esc(mediaURL(d, m))}" target="_blank" rel="noopener">${esc(m.title || m.alt || 'Télécharger')}</a>`
}

async function blockHTML(payload: Payload, d: SiteData, b: Block): Promise<string> {
  switch (b.blockType) {
    case 'heading': {
      const tag = b.level === 'h3' ? 'h3' : 'h2'
      return `<div class="cms-head">${b.eyebrow ? `<p class="eyebrow">${esc(b.eyebrow)}</p>` : ''}<${tag}>${esc(b.text)}</${tag}></div>`
    }
    case 'text':
      return `<div class="cms-prose">${richHTML(d, b.content)}</div>`
    case 'section': {
      const media = mediaTag(d, b.image)
      const cls = ['cms-section', b.imagePosition === 'left' ? 'left' : '', media ? '' : 'nomedia', b.background && b.background !== 'none' ? `bg-${b.background}` : '']
        .filter(Boolean)
        .join(' ')
      return `<section class="${cls}" style="padding-block:clamp(20px,4vw,40px)"><div class="txt">${b.eyebrow ? `<p class="eyebrow">${esc(b.eyebrow)}</p>` : ''}${b.title ? `<h2>${esc(b.title)}</h2>` : ''}<div class="cms-prose">${richHTML(d, b.content)}</div>${buttonsHTML(b.buttons)}</div>${media ? `<div class="cms-media">${media}</div>` : ''}</section>`
    }
    case 'image':
    case 'video': {
      const m = b.blockType === 'image' ? b.image : b.video
      return `<figure class="cms-figure">${mediaTag(d, m)}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`
    }
    case 'buttons':
      return buttonsHTML(b.buttons)
    case 'button':
      return buttonsHTML([b])
    case 'gallery': {
      const cat = typeof b.category === 'object' && b.category ? b.category.id : b.category
      const { docs } = await payload.find({
        collection: 'media',
        where: { and: [{ tenant: { equals: d.tenant.id } }, { inGallery: { equals: true } }, ...(cat ? [{ category: { equals: cat } }] : [])] },
        limit: 48,
        depth: 0,
        ...read,
      })
      return `<div class="cms-grid">${(docs as Media[]).map((m) => `<img src="${esc(mediaURL(d, m, 'card'))}" alt="${esc(m.alt)}" loading="lazy">`).join('')}</div>`
    }
    case 'priceList': {
      const cat = typeof b.category === 'object' && b.category ? b.category.id : b.category
      const { docs } = await payload.find({
        collection: 'prices',
        where: { and: [{ tenant: { equals: d.tenant.id } }, ...(cat ? [{ category: { equals: cat } }] : [])] },
        sort: 'order',
        limit: 100,
        depth: 0,
        ...read,
      })
      return `<div class="prix">${(docs as Price[])
        .map(
          (p) =>
            `<div class="prix-card${p.highlight ? ' star' : ''}"><h3>${esc(p.name)}</h3><span class="montant">${esc(p.displayPrice || euros(p.price))}</span>${p.unit ? `<span class="unite">${esc(p.unit)}</span>` : ''}</div>`,
        )
        .join('')}</div>`
    }
    case 'eventList': {
      const { docs } = await payload.find({
        collection: 'events',
        where: { and: [{ tenant: { equals: d.tenant.id } }, { startsAt: { greater_than_equal: new Date().toISOString() } }] },
        sort: 'startsAt',
        limit: b.limit ?? 3,
        depth: 0,
        ...read,
      })
      const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
      return `<ul class="cms-events">${(docs as Event[]).map((e) => `<li><b>${esc(fmt.format(new Date(e.startsAt)))}</b> · ${esc(e.title)}${e.hours ? ` · ${esc(e.hours)}` : ''}</li>`).join('') || '<li>Aucun événement à venir.</li>'}</ul>`
    }
    default:
      return ''
  }
}

export async function renderPage(payload: Payload, siteSlug: string, pageSlug: string): Promise<string | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: pageSlug } }, { _status: { equals: 'published' } }] },
    limit: 1,
    depth: 2,
    ...read,
  })
  const page = docs[0] as Page | undefined
  if (!page) return null
  const d = await loadSite(payload, tenant, false)

  const tpl = TEMPLATES[siteSlug]
  const headEnd = tpl.indexOf('<div class="view" data-view="accueil">')
  const footStart = tpl.indexOf('<footer>')
  const footEnd = tpl.indexOf('</footer>') + '</footer>'.length
  if (headEnd < 0 || footStart < 0) return null

  const blocks = (await Promise.all((page.layout ?? []).map((b) => blockHTML(payload, d, b)))).join('\n')
  const body = `<main class="cms-page"><div class="wrap"><div class="cms-head"><h1>${esc(page.title)}</h1></div>${blocks}</div></main>`
  const values = {
    ...commonValues(d, page.seo?.title || `${page.title} · ${tenant.name}`, page.seo?.description || ''),
    EXTRA_HEAD: PROMO_CSS + PAGE_CSS,
  }
  return fill(`${tpl.slice(0, headEnd)}${body}\n${tpl.slice(footStart, footEnd)}\n{{PROMO_POPUP}}\n</body></html>`, values)
}
