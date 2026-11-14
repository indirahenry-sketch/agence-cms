import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Payload } from 'payload'

import { isTenantInactive } from '@/access/roles'
import type { Category, Event, Media, Menu, Page, Post, Price, Promotion, Service, SiteInfo, Tenant } from '@/payload-types'
import { safeHref } from '@/utilities/safeURL'
import { escapeHTML } from '@/utilities/serverURL'

import { fallbackLogo, serviceIcons, template as poignyTemplate } from './ecuries-poigny/template'
import { fallbackLogo as montesuguiLogo, template as montesuguiTemplate } from './haras-montesugui/template'
import { extraServiceIcons, fallbackLogo as sourdunLogo, template as sourdunTemplate } from './centre-equestre-sourdun/template'
import { fallbackGallery as castelleGallery } from './domaine-equestre-castelle/galleryFallback'
import { fallbackLogo as castelleLogo, template as castelleTemplate } from './domaine-equestre-castelle/template'

/**
 * Sites publics des clients, servis par le CMS à l'adresse /sites/<identifiant>.
 *
 * Un client peut avoir une maquette HTML sur mesure (son « thème ») avec des repères {{…}} remplis à chaque
 * visite avec SES contenus : coordonnées, horaires, menus, services, tarifs, photos, agenda,
 * articles, bannières et pop-ups. Les pages créées dans le CMS sont affichées à
 * /sites/<identifiant>/<adresse-de-la-page> avec l'en-tête et le pied de page du thème.
 *
 * Un client SANS maquette utilise le thème générique (plus bas) : ses couleurs, sa police et
 * son logo, la page « accueil » s'il en a créé une, sinon un accueil composé automatiquement
 * à partir de ses contenus. Aucun code à écrire pour un nouveau client.
 *
 * Sur un nom de domaine du client (www.client.fr), les adresses n'ont plus le préfixe
 * /sites/<identifiant> : c'est l'option `base` (voir proxy.ts).
 *
 * Toutes les lectures se font côté serveur, filtrées sur l'id du client : un site ne peut
 * jamais afficher les données d'un autre client. Seuls les contenus publiés sont lus.
 */
const TEMPLATES: Record<string, string> = {
  'ecuries-poigny': poignyTemplate,
  'haras-montesugui': montesuguiTemplate,
  'centre-equestre-sourdun': sourdunTemplate,
  'domaine-equestre-castelle': castelleTemplate,
}

/** Icônes des services, toutes maquettes confondues. */
const ICONS: Record<string, string> = { ...serviceIcons, ...extraServiceIcons }

/** Logo affiché tant que le client n'a pas choisi le sien. */
const TEMPLATE_LOGOS: Record<string, string> = {
  'haras-montesugui': montesuguiLogo,
  'centre-equestre-sourdun': sourdunLogo,
  'domaine-equestre-castelle': castelleLogo,
}

/** Petits textes générés par le CMS qui suivent le ton de la maquette (tutoiement / vouvoiement). */
/** Photos de la maquette, affichées tant que le client n'a coché aucune photo « Afficher dans la galerie ». */
const TEMPLATE_GALLERIES: Record<string, { src: string; alt: string; caption: string }[]> = {
  'domaine-equestre-castelle': castelleGallery,
}

const TEMPLATE_TEXTS: Record<string, { forYou: string; blog: string }> = {
  'haras-montesugui': { forYou: 'Pour vous', blog: 'Actualités' },
  'domaine-equestre-castelle': { forYou: 'Pour vous', blog: 'Agenda' },
}

/**
 * Maquette d'un client. Le Domaine Équestre de la Castelle a été créé depuis le CMS : sa maquette
 * s'applique quel que soit l'identifiant court choisi, tant qu'il contient « castelle » ou « dedc ».
 */
export const templateKey = (slug: string, name?: string | null) =>
  Object.hasOwn(TEMPLATES, slug) ? slug : /castelle|dedc/i.test(`${slug} ${name ?? ''}`) ? 'domaine-equestre-castelle' : slug
const keyOf = (t: Pick<Tenant, 'slug' | 'name'>) => templateKey(t.slug, t.name)

const textsOf = (t: Pick<Tenant, 'slug' | 'name'>) => TEMPLATE_TEXTS[keyOf(t)] ?? { forYou: 'Pour toi', blog: 'Blog' }

export const hasSiteTemplate = (t: Pick<Tenant, 'slug' | 'name'>) => Object.hasOwn(TEMPLATES, keyOf(t))

/**
 * Couleurs d'origine des maquettes sur mesure. Tant que le client garde ces couleurs, le dessin
 * d'origine est intact ; s'il en choisit d'autres dans « Logo et couleurs », elles remplacent
 * la couleur principale (boutons, bandeaux) et la couleur d'accent de la maquette.
 */
const TEMPLATE_COLORS: Record<string, { primary: string; secondary: string; vars: { primary: string[]; secondary: string[] } }> = {
  'ecuries-poigny': { primary: '#4C6E2A', secondary: '#EDC655', vars: { primary: ['--flot', '--pre'], secondary: ['--paille'] } },
  'haras-montesugui': { primary: '#74231E', secondary: '#B8913A', vars: { primary: ['--bdx', '--flot', '--pre'], secondary: ['--or', '--paille'] } },
  'centre-equestre-sourdun': { primary: '#3E9A1E', secondary: '#E8C15A', vars: { primary: ['--flot', '--pre'], secondary: ['--paille'] } },
  'domaine-equestre-castelle': { primary: '#1F3F99', secondary: '#D6B262', vars: { primary: ['--flot'], secondary: ['--paille'] } },
}

function templateThemeCSS(t: Tenant): string {
  const base = TEMPLATE_COLORS[keyOf(t)]
  if (!base) return ''
  const primary = t.theme?.primaryColor && HEX.test(t.theme.primaryColor) ? t.theme.primaryColor : base.primary
  const secondary = t.theme?.secondaryColor && HEX.test(t.theme.secondaryColor) ? t.theme.secondaryColor : base.secondary
  const decl: string[] = []
  if (primary.toLowerCase() !== base.primary.toLowerCase()) {
    for (const v of base.vars.primary) decl.push(`${v}:${primary}`)
    decl.push(`--flot-ink:${inkOn(primary)}`)
  }
  if (secondary.toLowerCase() !== base.secondary.toLowerCase()) {
    for (const v of base.vars.secondary) decl.push(`${v}:${secondary}`)
    decl.push(`--paille-ink:${inkOn(secondary)}`)
  }
  return decl.length ? `<style>:root{${decl.join(';')}}</style>` : ''
}

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

export type RenderOptions = {
  /** Préfixe des liens : /sites/<identifiant> par défaut, '' sur le domaine du client. */
  base?: string
}

async function loadTenant(payload: Payload, siteSlug: string): Promise<Tenant | null> {
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 1, ...read })
  const tenant = docs[0] as Tenant | undefined
  return tenant && !isTenantInactive(tenant) ? tenant : null
}

async function loadSite(payload: Payload, tenant: Tenant, full: boolean, opts: RenderOptions = {}): Promise<SiteData> {
  const ofTenant = { tenant: { equals: tenant.id } }
  const settings = tenant.settings ?? {}
  const now = new Date().toISOString()
  const none = { docs: [] }
  const [info, prices, photos, events, posts, services, menus, promotions] = await Promise.all([
    payload.find({ collection: 'site-info', where: ofTenant, limit: 1, depth: 0, ...read }),
    full && settings.showPrices !== false
      ? payload.find({ collection: 'prices', where: ofTenant, sort: '_order', limit: 200, depth: 1, ...read })
      : none,
    full && settings.showGallery !== false
      ? payload.find({ collection: 'media', where: { and: [ofTenant, { inGallery: { equals: true } }] }, sort: '_order', limit: 48, depth: 0, ...read })
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
          // Une date de publication future = article programmé, pas encore visible
          where: {
            and: [ofTenant, { _status: { equals: 'published' } }, { or: [{ publishedAt: { exists: false } }, { publishedAt: { less_than_equal: now } }] }],
          },
          sort: '-publishedAt',
          limit: 30,
          depth: 1,
          ...read,
        })
      : none,
    full ? payload.find({ collection: 'services', where: ofTenant, sort: '_order', limit: 50, depth: 0, ...read }) : none,
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
    base: opts.base ?? `/sites/${tenant.slug}`,
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
    return page?.slug ? `${d.base}/${encodeURIComponent(page.slug)}` : d.base || '/'
  }
  if (l.type === 'anchor') return `${d.base || '/'}#${l.anchor || 'top'}`
  return safeHref(l.url)
}
const linkHTML = (d: SiteData, l: MenuLink, extra = '') => {
  // Sections qui sont des « pages » dans certaines maquettes (lien souligné quand la page est ouverte)
  const view = l.type === 'anchor' ? (l.anchor === 'top' ? 'accueil' : l.anchor) : ''
  const blogAttr = view && ['accueil', 'blog', 'galerie', 'horaires', 'tarifs', 'reserver'].includes(view) ? ` data-v="${view}"` : ''
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

// ── Bandeau de coordonnées (haut de page) ────────────────────────────

const TOPBAR_ICONS = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
}
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`

/** Téléphone fixe, portable, e-mail et adresse (seulement ceux qui sont renseignés), séparés par un filet. */
function topbarHTML(c: { landline: string; phone: string; email: string; address: string; mapsURL: string }): string {
  const items = [
    c.landline && `<a class="tb-item" href="${esc(telHref(c.landline))}">${TOPBAR_ICONS.phone}<span>${esc(c.landline)}</span></a>`,
    c.phone && c.phone !== c.landline && `<a class="tb-item" href="${esc(telHref(c.phone))}">${TOPBAR_ICONS.phone}<span>${esc(c.phone)}</span></a>`,
    c.email && `<a class="tb-item" href="mailto:${esc(c.email)}">${TOPBAR_ICONS.mail}<span>${esc(c.email)}</span></a>`,
    c.address && `<a class="tb-item tb-adr" href="${esc(c.mapsURL)}" target="_blank" rel="noopener">${TOPBAR_ICONS.pin}<span>${esc(c.address)}</span></a>`,
  ].filter(Boolean)
  return items.join('')
}

// ── Valeurs communes à toutes les pages du site ──────────────────────

function commonValues(d: SiteData, title: string, description: string) {
  const { tenant, info } = d
  const addr = info?.address?.street ? info.address : tenant.address
  const addrQuery = [addr?.street, addr?.postalCode, addr?.city].filter(Boolean).join(' ')
  const topbar = topbarHTML({
    landline: info?.landline || tenant.landline || '',
    phone: info?.phone || tenant.phone || '',
    email: info?.email || tenant.email || '',
    address: [addr?.street, [addr?.postalCode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).join(' – '),
    mapsURL: safeHref(info?.address?.mapsUrl) !== '#' ? safeHref(info?.address?.mapsUrl) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrQuery)}`,
  })
  const insta = info?.socials?.find((s) => s.network === 'instagram')?.url
  const blogLink = d.posts.length || d.events.length || !hasRenderedData(d) ? `<a class="nav-blog" href="${esc(d.base || '/')}#blog" data-v="blog">${esc(textsOf(tenant).blog)}</a>` : ''
  return {
    TITLE: esc(title),
    META_DESCRIPTION: esc(description),
    NAME: esc(tenant.name),
    CITY: esc(addr?.city || ''),
    YEAR: String(new Date().getFullYear()),
    HOME_URL: esc(d.base || '/'),
    TOPBAR: topbar,
    LOGO_SRC: isMedia(tenant.logo) ? mediaURL(d, tenant.logo) : (TEMPLATE_LOGOS[keyOf(tenant)] ?? fallbackLogo),
    NAV_LINKS: navLinks(d),
    NAV_BLOG: tenant.settings?.showBlog === false ? '' : blogLink,
    FOOTER_LINKS: footerLinks(d, insta),
    PROMO_BANNER: promoBanner(d),
    PROMO_POPUP: promoPopup(d),
    EXTRA_HEAD: PROMO_CSS + seoHead(d, title, description),
  }
}

/** Domaine principal du client (pour les adresses absolues : partage, Google). */
const mainDomain = (t: Tenant) => t.domains?.[0]?.domain?.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || ''

/** Balises de partage (Facebook, WhatsApp…) et de référencement. */
function seoHead(d: SiteData, title: string, description: string): string {
  const domain = mainDomain(d.tenant)
  const logo = isMedia(d.tenant.logo) && domain ? `https://${domain}/media/${d.tenant.logo.id}` : ''
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(d.tenant.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : '',
    logo ? `<meta property="og:image" content="${esc(logo)}">` : '',
    `<meta name="twitter:card" content="summary">`,
  ].join('')
}

/** Fiche « établissement local » lue par Google (nom, coordonnées, horaires). */
function localBusinessJSON(d: SiteData): string {
  const { tenant, info } = d
  const addr = info?.address?.street ? info.address : tenant.address
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const hours = (info?.openingHours ?? []).flatMap((row) =>
    row.closed ? [] : (row.slots ?? []).map((sl) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: days[DAY_INDEX[row.day]], opens: sl.opens, closes: sl.closes })),
  )
  const domain = mainDomain(tenant)
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: tenant.name,
    ...(domain ? { url: `https://${domain}` } : {}),
    ...((info?.phone || tenant.phone) ? { telephone: info?.phone || tenant.phone } : {}),
    ...((info?.email || tenant.email) ? { email: info?.email || tenant.email } : {}),
    ...(addr?.street || addr?.city
      ? { address: { '@type': 'PostalAddress', streetAddress: addr?.street || undefined, postalCode: addr?.postalCode || undefined, addressLocality: addr?.city || undefined, addressCountry: 'FR' } }
      : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {}),
    ...(info?.socials?.length ? { sameAs: info.socials.map((x) => x.url) } : {}),
  }
  return `<script type="application/ld+json">${jsonForScript(data)}</script>`
}

/**
 * Dernière étape de toute page : un site marqué « visible sur Google » perd la balise
 * noindex des maquettes (laissée sinon, pour qu'une maquette ne soit pas référencée).
 */
const finalize = (d: SiteData, html: string) =>
  d.tenant.indexable ? html.replace(/<meta name="robots" content="noindex, nofollow">/g, '') : html
const hasRenderedData = (d: SiteData) => d.prices.length + d.photos.length + d.services.length > 0

const fill = (html: string, values: Record<string, string>) => html.replace(/\{\{([A-Z_]+)\}\}/g, (m, key: string) => values[key] ?? '')

// ── Page d'accueil (la maquette complète) ────────────────────────────

/** Page « site en travaux » (mode maintenance du client). Le marqueur data-maintenance donne un statut 503. */
export const maintenancePage = (t: Tenant) =>
  `<!doctype html><html lang="fr" data-maintenance><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(t.name)} · bientôt de retour</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.6 system-ui,sans-serif;background:#f6f4ef;color:#222;text-align:center;padding:24px}h1{font-size:clamp(1.8rem,6vw,2.6rem);margin:0 0 8px}</style></head><body><main><h1>${esc(t.name)}</h1><p>Notre site fait peau neuve. Revenez très bientôt !</p>${t.phone ? `<p><a href="tel:${esc(t.phone.replace(/\s/g, ''))}">${esc(t.phone)}</a></p>` : ''}</main></body></html>`

export async function renderSite(payload: Payload, siteSlug: string, opts: RenderOptions = {}): Promise<string | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  if (tenant.maintenance) return maintenancePage(tenant)
  if (!hasSiteTemplate(tenant)) return renderGenericHome(payload, tenant, opts)
  const d = await loadSite(payload, tenant, true, opts)
  const { info } = d
  let html = TEMPLATES[keyOf(tenant)]

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
  let galleryHTML = d.photos
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
      return `<article class="svc" data-for="${esc(audiences)}"><span class="tag">${esc(textsOf(tenant).forYou)}</span><div class="ico">${ICONS[s.icon || ''] ?? ICONS.person}</div><h3>${esc(s.title)}</h3>${s.summary ? `<p>${esc(s.summary)}</p>` : ''}${points ? `<ul>${points}</ul>` : ''}</article>`
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
  const builtIn = tenant.settings?.showGallery === false ? undefined : TEMPLATE_GALLERIES[keyOf(tenant)]
  if (!d.photos.length && builtIn?.length) {
    galleryHTML = builtIn
      .map((p, i) => `<figure class="pola ${tilts[i % tilts.length]}" tabindex="0"><img src="${p.src}" data-full="${p.src}" alt="${esc(p.alt)}" loading="lazy"><figcaption>${esc(p.caption)}</figcaption></figure>`)
      .join('\n')
  } else if (!d.photos.length) html = html.replace(/<!--GALLERY_START-->[\s\S]*?<!--GALLERY_END-->/, '')
  if (!d.prices.length) html = html.replace(/<!--PRICES_START-->[\s\S]*?<!--PRICES_END-->/, '')
  if (!d.services.length) html = html.replace(/<!--SERVICES_START-->[\s\S]*?<!--SERVICES_END-->/, '')
  if (!stageDay) html = html.replace(/<div class="simu">[\s\S]*?<\/div>\s*<\/div>\s*<p class="note">/, '<p class="note">')

  const common = commonValues(d, tenant.name, `${tenant.name}${addr?.city ? ` à ${addr.city}` : ''}`)
  return finalize(d, fill(html, {
    ...common,
    EXTRA_HEAD: common.EXTRA_HEAD + localBusinessJSON(d) + templateThemeCSS(tenant),
    GALLERY: galleryHTML,
    SERVICES: servicesHTML,
    PRICE_TABS: tabsHTML,
    PRICE_PANELS: panelsHTML,
    SIMU_OPTIONS: simuHTML,
    STAGE_DAY: String(stageDay),
    STAGES_TEXT: stagesText,
    STAGES_BUTTON: insta ? 'Voir sur Instagram' : 'Nous contacter',
    INSTAGRAM_URL: esc(insta ? safeHref(insta) : `${d.base || '/'}#contact`),
    PHONE: esc(phone),
    EMAIL: esc(email),
    EMAIL_JSON: jsonForScript(email),
    ADDRESS_HTML: addressHTML,
    MAPS_URL: esc(mapsURL),
    HOURS_ROWS: hoursRows,
    SCHED_JSON: jsonForScript(sched),
    BLOG_JSON: jsonForScript(blog),
  }))
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
        sort: '_order',
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
        sort: '_order',
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

/** Habille un contenu avec l'en-tête et le pied de page du thème du client. */
function inShell(d: SiteData, body: string, title: string, description: string, extraHead = ''): string | null {
  const tpl = TEMPLATES[keyOf(d.tenant)] ?? GENERIC_TEMPLATE
  const headEnd = tpl.indexOf('<div class="view" data-view="accueil">')
  const footStart = tpl.search(/<footer[\s>]/)
  const footEnd = tpl.indexOf('</footer>') + '</footer>'.length
  if (headEnd < 0 || footStart < 0) return null
  const common = commonValues(d, title, description)
  const values = {
    ...common,
    ...genericValues(d),
    EXTRA_HEAD: common.EXTRA_HEAD + PAGE_CSS + extraHead,
  }
  return finalize(d, fill(`${tpl.slice(0, headEnd)}${body}\n${tpl.slice(footStart, footEnd)}\n{{PROMO_POPUP}}\n</body></html>`, values))
}

/** Contenu d'une page (ses blocs), sans l'habillage. */
async function pageBody(payload: Payload, d: SiteData, page: Page, withTitle = true): Promise<string> {
  const blocks = (await Promise.all((page.layout ?? []).map((b) => blockHTML(payload, d, b)))).join('\n')
  return `<main class="cms-page"><div class="wrap">${withTitle ? `<div class="cms-head"><h1>${esc(page.title)}</h1></div>` : ''}${blocks}</div></main>`
}

/**
 * Une page créée dans le CMS. Avec `draft`, la dernière version enregistrée (même non
 * publiée) est affichée : réservé à l'aperçu, après vérification de l'utilisateur.
 */
export async function renderPage(
  payload: Payload,
  siteSlug: string,
  pageSlug: string,
  opts: RenderOptions & { draftID?: number | string } = {},
): Promise<string | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  if (tenant.maintenance && opts.draftID === undefined) return maintenancePage(tenant)
  let page: Page | undefined
  if (opts.draftID !== undefined) {
    const doc = await payload.findByID({ collection: 'pages', id: opts.draftID, draft: true, depth: 2, disableErrors: true, ...read })
    page = doc && sameTenant(doc.tenant, tenant.id) ? (doc as Page) : undefined
  } else {
    const { docs } = await payload.find({
      collection: 'pages',
      where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: pageSlug } }, { _status: { equals: 'published' } }] },
      limit: 1,
      depth: 2,
      ...read,
    })
    page = docs[0] as Page | undefined
  }
  if (!page) return null
  const d = await loadSite(payload, tenant, false, opts)
  return inShell(d, await pageBody(payload, d, page), page.seo?.title || `${page.title} · ${tenant.name}`, page.seo?.description || '')
}

const sameTenant = (value: unknown, id: number) => (typeof value === 'object' && value ? (value as { id: number }).id : value) === id

/** Un article du blog, sur sa propre page (lien partageable). */
export async function renderPost(
  payload: Payload,
  siteSlug: string,
  postSlug: string,
  opts: RenderOptions & { draftID?: number | string } = {},
): Promise<string | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  if (tenant.maintenance && opts.draftID === undefined) return maintenancePage(tenant)
  let post: Post | undefined
  if (opts.draftID !== undefined) {
    const doc = await payload.findByID({ collection: 'posts', id: opts.draftID, draft: true, depth: 1, disableErrors: true, ...read })
    post = doc && sameTenant(doc.tenant, tenant.id) ? (doc as Post) : undefined
  } else {
    const now = new Date().toISOString()
    const { docs } = await payload.find({
      collection: 'posts',
      where: {
        and: [
          { tenant: { equals: tenant.id } },
          { slug: { equals: postSlug } },
          { _status: { equals: 'published' } },
          { or: [{ publishedAt: { exists: false } }, { publishedAt: { less_than_equal: now } }] },
        ],
      },
      limit: 1,
      depth: 1,
      ...read,
    })
    post = docs[0] as Post | undefined
  }
  if (!post) return null
  const d = await loadSite(payload, tenant, false, opts)
  const date = post.publishedAt || post.createdAt
  const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
  const cover = isMedia(post.coverImage) ? `<figure class="cms-figure"><img src="${esc(mediaURL(d, post.coverImage, 'hero'))}" alt="${esc(post.coverImage.alt)}"></figure>` : ''
  const body = `<main class="cms-page"><div class="wrap"><div class="cms-head"><p class="eyebrow">${esc(dateFmt.format(new Date(date)))}</p><h1>${esc(post.title)}</h1>${post.excerpt ? `<p class="cms-lead">${esc(post.excerpt)}</p>` : ''}</div>${cover}<div class="cms-prose">${richHTML(d, post.content)}</div><p><a class="btn" href="${esc(d.base || '/')}">← Retour au site</a></p></div></main>`
  return inShell(d, body, post.seo?.title || `${post.title} · ${tenant.name}`, post.seo?.description || post.excerpt || '')
}

/** Adresses publiques d'un site (pour le sitemap). */
export async function siteURLs(payload: Payload, siteSlug: string): Promise<{ tenant: Tenant; paths: { path: string; updatedAt: string }[] } | null> {
  const tenant = await loadTenant(payload, siteSlug)
  if (!tenant) return null
  const ofTenant = { tenant: { equals: tenant.id } }
  const now = new Date().toISOString()
  const [pages, posts] = await Promise.all([
    payload.find({ collection: 'pages', where: { and: [ofTenant, { _status: { equals: 'published' } }] }, limit: 500, depth: 0, select: { slug: true, updatedAt: true }, ...read }),
    payload.find({
      collection: 'posts',
      where: { and: [ofTenant, { _status: { equals: 'published' } }, { or: [{ publishedAt: { exists: false } }, { publishedAt: { less_than_equal: now } }] }] },
      limit: 500,
      depth: 0,
      select: { slug: true, updatedAt: true },
      ...read,
    }),
  ])
  return {
    tenant,
    paths: [
      { path: '', updatedAt: tenant.updatedAt },
      ...pages.docs.filter((p) => p.slug && p.slug !== 'accueil').map((p) => ({ path: `/${encodeURIComponent(p.slug!)}`, updatedAt: p.updatedAt })),
      ...posts.docs.filter((p) => p.slug).map((p) => ({ path: `/blog/${encodeURIComponent(p.slug!)}`, updatedAt: p.updatedAt })),
    ],
  }
}



// ── Thème générique (clients sans maquette sur mesure) ───────────────

const FONTS: Record<string, { href: string; head: string; body: string }> = {
  inter: { href: 'family=Inter:wght@400;500;700;800', head: "'Inter',system-ui,sans-serif", body: "'Inter',system-ui,sans-serif" },
  playfair: {
    href: 'family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;700',
    head: "'Playfair Display',Georgia,serif",
    body: "'Inter',system-ui,sans-serif",
  },
  poppins: { href: 'family=Poppins:wght@400;500;600;700', head: "'Poppins',system-ui,sans-serif", body: "'Poppins',system-ui,sans-serif" },
  merriweather: {
    href: 'family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;600;700',
    head: "'Merriweather',Georgia,serif",
    body: "'Source Sans 3',system-ui,sans-serif",
  },
}

const HEX = /^#[0-9a-f]{6}$/i
/** Couleur du texte lisible sur un fond donné (noir ou blanc). */
const inkOn = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#14161a' : '#ffffff'
}
/** Mélange une couleur avec du blanc (teintes de fond). */
const tint = (hex: string, amount: number) =>
  '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount) + 255 * amount).toString(16).padStart(2, '0')).join('')

function themeCSS(t: Tenant): { css: string; fontLink: string } {
  const primary = HEX.test(t.theme?.primaryColor ?? '') ? t.theme!.primaryColor! : '#1F4E79'
  const accent = HEX.test(t.theme?.secondaryColor ?? '') ? t.theme!.secondaryColor! : '#F2C14E'
  const font = FONTS[t.theme?.font ?? 'inter'] ?? FONTS.inter
  return {
    fontLink: `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${font.href}&display=swap">`,
    css: `:root{--brand:${primary};--brand-ink:${inkOn(primary)};--brand-soft:${tint(primary, 0.9)};--accent:${accent};--accent-ink:${inkOn(accent)};--flot:${primary};--flot-ink:${inkOn(primary)};--paille:${accent};--paille-ink:${inkOn(accent)};--f-head:${font.head};--f-body:${font.body}}`,
  }
}

const GENERIC_CSS = `
*,*::before,*::after{box-sizing:border-box}
:root{color-scheme:light;--ink:#16181d;--muted:#5d6470;--bg:#fbfaf7;--card:#ffffff;--line:#e7e4dc;--r:18px}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 1rem/1.6 var(--f-body);-webkit-font-smoothing:antialiased}
img,video{max-width:100%;height:auto}
a{color:inherit}
h1,h2,h3{font-family:var(--f-head);line-height:1.12;margin:0;letter-spacing:-.01em}
h1{font-size:clamp(2.3rem,7vw,4rem)}h2{font-size:clamp(1.7rem,4.4vw,2.6rem)}h3{font-size:1.2rem}
p{margin:0}
.wrap{width:min(1120px,100% - 32px);margin-inline:auto}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;font-weight:700;color:var(--brand)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border-radius:999px;border:1.5px solid currentColor;font-weight:700;text-decoration:none;transition:transform .15s}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:var(--brand);border-color:var(--brand);color:var(--brand-ink)}
.g-head{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.g-bar{display:flex;align-items:center;gap:16px;min-height:66px}
.g-brand{display:flex;align-items:center;gap:10px;font:700 1.12rem/1.1 var(--f-head);text-decoration:none;margin-right:auto}
.g-brand img{height:42px;width:auto;border-radius:8px}
.g-nav{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.g-nav>a,.g-nav .has-sub>a{padding:8px 12px;border-radius:999px;text-decoration:none;font-weight:600;font-size:.95rem}
.g-nav>a:hover,.g-nav .has-sub>a:hover{background:var(--brand-soft)}
.g-burger{display:none;width:44px;height:44px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:1.3rem;color:var(--ink)}
@media (max-width:820px){.g-burger{display:block}.g-nav{display:none;position:absolute;left:0;right:0;top:100%;flex-direction:column;align-items:stretch;padding:10px 16px 16px;background:var(--bg);border-bottom:1px solid var(--line)}.nav-open .g-nav{display:flex}.g-nav .has-sub{flex-direction:column}.g-nav .has-sub .sub{display:flex;position:static;box-shadow:none;padding:0 0 0 12px;background:none}}
.g-hero{position:relative;color:var(--brand-ink);background:var(--brand);overflow:hidden}
.g-hero.has-img{color:#fff;background:#111}
.g-hero .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.55}
.g-hero .wrap{position:relative;display:grid;gap:18px;padding-block:clamp(72px,14vw,150px);max-width:820px;margin-left:max(16px,calc((100% - 1120px)/2))}
.g-hero .eyebrow{color:inherit;opacity:.9}.g-hero p.lead{font-size:clamp(1.05rem,2.4vw,1.3rem);max-width:600px}
.g-hero .btn:not(.primary){color:inherit}
.g-hero.has-img .btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
.g-sec{padding-block:clamp(48px,8vw,96px)}
.g-sec.alt{background:var(--brand-soft)}
.g-sec .wrap{display:grid;gap:clamp(22px,3vw,34px)}
.g-sec header{display:grid;gap:8px;max-width:720px}
.g-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.g-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:22px;display:grid;gap:10px;align-content:start}
.g-card ul{margin:0;padding-left:1.1em;color:var(--muted)}.g-card p{color:var(--muted)}
.g-card a.more{font-weight:700;color:var(--brand);text-decoration:none}
.g-card img{width:calc(100% + 44px);margin:-22px -22px 4px;aspect-ratio:16/10;object-fit:cover;border-radius:var(--r) var(--r) 0 0;max-width:none}
.prix{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.prix-card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:20px;display:grid;gap:4px}
.prix-card.star{border:2px solid var(--brand)}.prix-card h3{font-size:1.05rem}
.montant{font:800 1.6rem/1.2 var(--f-head);color:var(--brand)}.unite{color:var(--muted);font-size:.9rem}
.g-cat{display:grid;gap:12px}.g-cat+.g-cat{margin-top:18px}
.g-contact{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
.g-hours{width:100%;border-collapse:collapse}.g-hours td{padding:7px 0;border-bottom:1px solid var(--line)}.g-hours td+td{text-align:right;color:var(--muted)}
.g-hours tr.today td{font-weight:700;color:var(--ink)}
.g-foot{background:#14161a;color:#e8e8e8;padding-block:40px}
.g-foot-grid{display:grid;gap:14px}.g-foot p,.g-foot small{color:#b9bcc3}.g-foot a{color:#fff}
.cms-lead{font-size:1.15rem;color:var(--muted)}
`

const GENERIC_TEMPLATE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>{{TITLE}}</title><meta name="description" content="{{META_DESCRIPTION}}">{{FAVICON}}{{FONT_LINK}}<style>{{THEME_CSS}}${GENERIC_CSS}</style>{{EXTRA_HEAD}}</head><body>{{PROMO_BANNER}}<header class="g-head"><div class="wrap g-bar"><a class="g-brand" href="{{HOME_URL}}">{{LOGO_TAG}}<span>{{NAME}}</span></a><button class="g-burger" type="button" aria-label="Ouvrir le menu" onclick="document.body.classList.toggle('nav-open')">☰</button><nav class="g-nav" aria-label="Menu principal">{{NAV_LINKS}}</nav></div></header>
<div class="view" data-view="accueil">{{HOME_BODY}}</div>
<footer class="g-foot"><div class="wrap g-foot-grid"><strong>{{NAME}}</strong><p>{{FOOT_CONTACT}}</p><div class="foot-links">{{FOOTER_LINKS}}</div><small>© {{YEAR}} {{NAME}}</small></div></footer>
{{PROMO_POPUP}}</body></html>`

/** Valeurs propres au thème générique (sans effet sur une maquette sur mesure). */
function genericValues(d: SiteData): Record<string, string> {
  const { css, fontLink } = themeCSS(d.tenant)
  const { tenant, info } = d
  const addr = info?.address?.street ? info.address : tenant.address
  const phone = info?.phone || tenant.phone
  const email = info?.email || tenant.email
  const contact = [
    [addr?.street, [addr?.postalCode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join(', '),
    phone ? `<a href="tel:${esc(phone.replace(/\s/g, ''))}">${esc(phone)}</a>` : '',
    email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const logo = isMedia(tenant.logo)
  const values: Record<string, string> = {
    THEME_CSS: css,
    FONT_LINK: fontLink,
    LOGO_TAG: logo ? `<img src="${esc(mediaURL(d, tenant.logo as Media))}" alt="">` : '',
    FAVICON: logo ? `<link rel="icon" href="${esc(mediaURL(d, tenant.logo as Media))}">` : '',
    FOOT_CONTACT: contact,
  }
  // Menu principal par défaut : les sections présentes sur l'accueil générique
  if (!menuOf(d, 'main')?.items?.length && !hasSiteTemplate(tenant)) {
    const links = [
      d.services.length && ['Services', 'services'],
      d.prices.length && ['Tarifs', 'tarifs'],
      d.photos.length && ['Photos', 'galerie'],
      (d.events.length || d.posts.length) && ['Actualités', 'actualites'],
      ['Contact', 'contact'],
    ].filter(Boolean) as [string, string][]
    values.NAV_LINKS = links.map(([label, anchor]) => `<a href="${esc(d.base || '/')}#${anchor}">${esc(label)}</a>`).join('')
  }
  return values
}

/** Accueil d'un client sans maquette : sa page « accueil », sinon un accueil composé de ses contenus. */
async function renderGenericHome(payload: Payload, tenant: Tenant, opts: RenderOptions): Promise<string | null> {
  const d = await loadSite(payload, tenant, true, opts)
  const { info } = d
  const addr = info?.address?.street ? info.address : tenant.address
  const description = tenant.tagline || `${tenant.name}${addr?.city ? ` à ${addr.city}` : ''}`

  const { docs } = await payload.find({
    collection: 'pages',
    where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: 'accueil' } }, { _status: { equals: 'published' } }] },
    limit: 1,
    depth: 2,
    ...read,
  })
  const home = docs[0] as Page | undefined
  if (home?.layout?.length) {
    return inShell(d, await pageBody(payload, d, home, false), home.seo?.title || tenant.name, home.seo?.description || description, localBusinessJSON(d))
  }

  const phone = info?.phone || tenant.phone
  const email = info?.email || tenant.email
  const heroImg = d.photos[0]
  const sections: string[] = []

  sections.push(`<section class="g-hero${heroImg ? ' has-img' : ''}">${heroImg ? `<img class="bg" src="${esc(mediaURL(d, heroImg, 'hero'))}" alt="">` : ''}<div class="wrap">${addr?.city ? `<p class="eyebrow">${esc(addr.city)}</p>` : ''}<h1>${esc(tenant.name)}</h1>${tenant.tagline ? `<p class="lead">${esc(tenant.tagline)}</p>` : ''}<div class="cms-btns"><a class="btn primary" href="#contact">Nous contacter</a>${phone ? `<a class="btn" href="tel:${esc(phone.replace(/\s/g, ''))}">${esc(phone)}</a>` : ''}</div></div></section>`)

  if (d.services.length) {
    const cards = d.services
      .map((sv) => `<article class="g-card"><h3>${esc(sv.title)}</h3>${sv.summary ? `<p>${esc(sv.summary)}</p>` : ''}${sv.points?.length ? `<ul>${sv.points.map((pt) => `<li>${esc(pt.text)}</li>`).join('')}</ul>` : ''}</article>`)
      .join('')
    sections.push(`<section class="g-sec" id="services"><div class="wrap"><header><p class="eyebrow">Ce que nous proposons</p><h2>Services</h2></header><div class="g-cards">${cards}</div></div></section>`)
  }

  if (d.prices.length) {
    const groups = new Map<string, { name: string; order: number; items: Price[] }>()
    for (const pr of d.prices) {
      const cat = typeof pr.category === 'object' && pr.category ? (pr.category as Category) : null
      const key = cat ? String(cat.id) : 'autres'
      if (!groups.has(key)) groups.set(key, { name: cat?.name || 'Tarifs', order: cat?.order ?? 999, items: [] })
      groups.get(key)!.items.push(pr)
    }
    const cats = [...groups.values()].sort((a, b) => a.order - b.order)
    const amount = (pr: Price) => pr.displayPrice || (pr.isFrom ? `dès ${euros(pr.price)}` : euros(pr.price))
    const html = cats
      .map(
        (g) =>
          `<div class="g-cat">${cats.length > 1 ? `<h3>${esc(g.name)}</h3>` : ''}<div class="prix">${g.items
            .map((pr) => `<div class="prix-card${pr.highlight ? ' star' : ''}"><h3>${esc(pr.name)}</h3><span class="montant">${esc(amount(pr))}</span>${pr.unit ? `<span class="unite">${esc(pr.unit)}</span>` : ''}${pr.description ? `<span class="unite">${esc(pr.description)}</span>` : ''}</div>`)
            .join('')}</div></div>`,
      )
      .join('')
    sections.push(`<section class="g-sec alt" id="tarifs"><div class="wrap"><header><p class="eyebrow">Tarifs</p><h2>Nos prix</h2></header>${html}</div></section>`)
  }

  if (d.photos.length) {
    sections.push(`<section class="g-sec" id="galerie"><div class="wrap"><header><p class="eyebrow">En images</p><h2>Photos</h2></header><div class="cms-grid">${d.photos.map((m) => `<img src="${esc(mediaURL(d, m, 'card'))}" alt="${esc(m.alt)}" loading="lazy">`).join('')}</div></div></section>`)
  }

  const upcoming = d.events.filter((e) => new Date(e.endsAt || e.startsAt).getTime() >= Date.now()).slice(0, 6)
  if (upcoming.length || d.posts.length) {
    const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
    const events = upcoming.length
      ? `<h3>À venir</h3><ul class="cms-events">${upcoming.map((e) => `<li><b>${esc(fmt.format(new Date(e.startsAt)))}</b> · ${esc(e.title)}${e.hours ? ` · ${esc(e.hours)}` : ''}${e.description ? `<br><span class="unite">${esc(e.description)}</span>` : ''}</li>`).join('')}</ul>`
      : ''
    const posts = d.posts.length
      ? `<div class="g-cards">${d.posts
          .slice(0, 6)
          .map(
            (po) =>
              `<article class="g-card">${isMedia(po.coverImage) ? `<img src="${esc(mediaURL(d, po.coverImage, 'card'))}" alt="${esc(po.coverImage.alt)}" loading="lazy">` : ''}<h3>${esc(po.title)}</h3>${po.excerpt ? `<p>${esc(po.excerpt)}</p>` : ''}${po.slug ? `<a class="more" href="${esc(d.base)}/blog/${encodeURIComponent(po.slug)}">Lire l’article →</a>` : ''}</article>`,
          )
          .join('')}</div>`
      : ''
    sections.push(`<section class="g-sec alt" id="actualites"><div class="wrap"><header><p class="eyebrow">Actualités</p><h2>Les nouvelles</h2></header>${events}${posts}</div></section>`)
  }

  // Contact et horaires
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getDay()
  const hours = info?.openingHours?.length
    ? `<div class="g-card"><h3>Horaires</h3><table class="g-hours">${WEEK.map((day) => {
        const row = info.openingHours!.find((r) => DAY_INDEX[r.day] === day)
        const text = !row || row.closed || !row.slots?.length ? 'Fermé' : row.slots.map((sl) => `${fmtTime(sl.opens)} – ${fmtTime(sl.closes)}`).join(' · ')
        return `<tr${day === today ? ' class="today"' : ''}><td>${DAY_LABEL[day]}</td><td>${esc(text)}</td></tr>`
      }).join('')}</table></div>`
    : ''
  const mapsURL =
    safeHref(info?.address?.mapsUrl) !== '#'
      ? safeHref(info?.address?.mapsUrl)
      : addr?.street || addr?.city
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([addr?.street, addr?.postalCode, addr?.city].filter(Boolean).join(' '))}`
        : ''
  const coords = `<div class="g-card"><h3>Nous joindre</h3>${addr?.street || addr?.city ? `<p>${[addr?.street, [addr?.postalCode, addr?.city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>')}</p>` : ''}<div class="cms-btns">${phone ? `<a class="btn primary" href="tel:${esc(phone.replace(/\s/g, ''))}">Appeler</a>` : ''}${email ? `<a class="btn" href="mailto:${esc(email)}">Écrire</a>` : ''}${mapsURL ? `<a class="btn" href="${esc(mapsURL)}" target="_blank" rel="noopener">Itinéraire</a>` : ''}</div>${info?.socials?.length ? `<p>${info.socials.map((so) => `<a href="${esc(safeHref(so.url))}" target="_blank" rel="noopener">${esc(so.network.charAt(0).toUpperCase() + so.network.slice(1))}</a>`).join(' · ')}</p>` : ''}</div>`
  sections.push(`<section class="g-sec" id="contact"><div class="wrap"><header><p class="eyebrow">Contact</p><h2>Venir nous voir</h2></header><div class="g-contact">${coords}${hours}</div></div></section>`)

  return inShell(d, sections.join('\n'), tenant.name, description, localBusinessJSON(d))
}
