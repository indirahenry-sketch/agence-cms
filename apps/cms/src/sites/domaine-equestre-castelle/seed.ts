import type { Payload } from 'payload'

import type { Service, SiteInfo, Tenant } from '@/payload-types'
import { describeError } from '@/lib/s3-check'
import { createLegalPages } from '@/sites/legalPages'

import { castellePhotos } from './seedImages'

export const CASTELLE_SLUG = 'domaine-equestre-castelle'

const base = { overrideAccess: true, context: { skipInvite: true } } as const

/** Infos relevées sur le panneau du domaine et sur l'ancien site (poneyclubmontpellier.com). */
const CONTACT = {
  phone: '06 14 60 22 46',
  landline: '06 10 44 25 77',
  email: 'dedc34@yahoo.com',
  city: 'Saint-Jean-de-Védas',
  postalCode: '34430',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Domaine+Equestre+de+la+Castelle',
  facebook: 'https://www.facebook.com/profile.php?id=61554556564503',
}
const COLORS = { primaryColor: '#1F3F99', secondaryColor: '#D6B262' }
/** Couleurs par défaut d'une fiche client (jamais choisies par le client). */
const DEFAULT_COLORS = ['#1f4e79', '#f2c14e']

type S = { title: string; summary: string; points: string[]; icon: NonNullable<Service['icon']>; for: NonNullable<Service['audiences']> }
const SERVICES: S[] = [
  {
    title: 'Poney-club',
    summary: 'Les premiers pas à poney, dès 4 ans, avec les poneys du DEDC.',
    points: ['Cours collectifs et particuliers', 'Passage des galops', 'Spectacles des « graines de talents »'],
    icon: 'heart',
    for: ['enfant', 'debutant'],
  },
  {
    title: 'Cours d’équitation',
    summary: 'Toutes disciplines, pour progresser à son rythme, à poney comme à cheval.',
    points: ['Cours du soir pour adultes débutants et confirmés', 'Cours « Compétitions »', 'Manège couvert : cours maintenus par tous les temps'],
    icon: 'chart',
    for: ['debutant', 'loisir', 'cavalier'],
  },
  {
    title: 'Stages Equi’vacances',
    summary: 'Pendant les vacances scolaires, des journées ou des semaines d’équitation pour les enfants et les ados.',
    points: ['Dès 4 ans', 'À la journée ou à la semaine', 'Inscriptions auprès de Virginie'],
    icon: 'calendar',
    for: ['enfant', 'debutant', 'loisir'],
  },
  {
    title: 'Compétitions & événements',
    summary: 'Concours, journées à thème et fêtes du club tout au long de la saison.',
    points: ['Concours et journées à thème', 'Coaching en compétition', 'Photos et vidéos sur Facebook'],
    icon: 'medal',
    for: ['compet', 'cavalier'],
  },
  {
    title: 'Écurie de propriétaires',
    summary: 'Une pension soignée pour votre cheval, sur un domaine de 5 ha et 4 ha de prés.',
    points: ['Box sur copeaux ou sur paille, tapis antidérapants, sortie quotidienne au paddock', 'Paddock individuel avec abri ou paddock collectif', 'Balades au départ des écuries dans le Bois de Maurin'],
    icon: 'home',
    for: ['proprio'],
  },
  {
    title: 'Vente & demi-pension',
    summary: 'Chevaux et poneys à vendre, et des montures proposées en demi-pension.',
    points: ['Vente de chevaux et de poneys', 'Poneys et chevaux en demi-pension', 'Conseils pour trouver la bonne monture'],
    icon: 'star',
    for: ['cavalier', 'loisir', 'proprio'],
  },
  {
    title: 'Écurie relais · Cheval étape',
    summary: 'De passage dans la région ? Votre cheval passe la nuit chez nous, à 3 minutes de l’A709.',
    points: ['En box ou en paddock avec abri', 'Réservation par téléphone'],
    icon: 'barn',
    for: ['proprio'],
  },
]

/**
 * Domaine Équestre de la Castelle (DEDC), client créé depuis le CMS.
 *
 * Retrouve le client (identifiant ou nom contenant « castelle » / « dedc »), sinon le crée, puis
 * complète SEULEMENT ce qui manque : coordonnées, horaires, couleurs (si encore celles par défaut),
 * activités, grille tarifaire, menus, photos et pages légales. Rien n'est écrasé.
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`.
 */
let running: Promise<void> | null = null
/** Un seul import à la fois : deux démarrages simultanés créaient chaque onglet et chaque photo en double. */
export function importDomaineCastelle(payload: Payload): Promise<void> {
  running ??= runImport(payload).finally(() => {
    running = null
  })
  return running
}

async function runImport(payload: Payload): Promise<void> {
  const found = await payload.find({
    collection: 'tenants',
    where: { or: [{ slug: { like: 'castelle' } }, { slug: { like: 'dedc' } }, { name: { like: 'castelle' } }] },
    limit: 1,
    depth: 0,
    ...base,
  })
  const tenant = (found.docs[0] as Tenant | undefined) ?? (await createTenant(payload))
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      payload.logger.error({ err }, `Domaine de la Castelle : étape « ${name} » impossible : ${describeError(err)}`)
    }
  }
  await step('fiche client', () => completeTenant(payload, tenant))
  await step('informations', () => ensureSiteInfo(payload, tenant.id))
  await step('activités', () => ensureServices(payload, tenant.id))
  await step('tarifs', () => ensurePrices(payload, tenant.id))
  await step('menus', () => ensureMenus(payload, tenant.id))
  await step('photos', () => ensurePhotos(payload, tenant.id))
  await step('pages légales', async () => void (await createLegalPages(payload, tenant.id)))
}

const slug = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

const countOf = async (payload: Payload, collection: 'services' | 'menus', tenantID: number) =>
  (await payload.count({ collection, where: { tenant: { equals: tenantID } }, overrideAccess: true })).totalDocs

async function createTenant(payload: Payload): Promise<Tenant> {
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Domaine Équestre de la Castelle',
      slug: CASTELLE_SLUG,
      languages: ['fr'],
      email: CONTACT.email,
      phone: CONTACT.phone,
      landline: CONTACT.landline,
      address: { postalCode: CONTACT.postalCode, city: CONTACT.city, country: 'France' },
      theme: { ...COLORS },
      settings: { showBlog: true, showEvents: true, showPrices: true, showGallery: true },
      labels: ['Équestre', 'Maquette'],
    },
    ...base,
  })
  payload.logger.info('✔ Client « Domaine Équestre de la Castelle » créé')
  return tenant as Tenant
}

/** Complète les champs vides de la fiche client ; couleurs du domaine si la fiche a encore celles par défaut. */
async function completeTenant(payload: Payload, t: Tenant) {
  const data: Partial<Tenant> = {}
  if (!t.email) data.email = CONTACT.email
  if (!t.phone) data.phone = CONTACT.phone
  if (!t.landline && t.phone !== CONTACT.landline) data.landline = CONTACT.landline
  if (!t.address?.street && !t.address?.city) data.address = { ...t.address, postalCode: CONTACT.postalCode, city: CONTACT.city, country: 'France' }
  const primary = t.theme?.primaryColor?.toLowerCase()
  const secondary = t.theme?.secondaryColor?.toLowerCase()
  if ((!primary || DEFAULT_COLORS.includes(primary)) && (!secondary || DEFAULT_COLORS.includes(secondary))) data.theme = { ...t.theme, ...COLORS }
  if (Object.keys(data).length) await payload.update({ collection: 'tenants', id: t.id, data, ...base })
}

async function ensureSiteInfo(payload: Payload, tenantID: number) {
  const { docs } = await payload.find({ collection: 'site-info', where: { tenant: { equals: tenantID } }, limit: 1, depth: 0, ...base })
  const info = docs[0] as SiteInfo | undefined
  // Bureau ouvert tous les jours de 9h à 20h (ancien site, page Tarifs)
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
  const openingHours = days.map((day) => ({ day, slots: [{ opens: '09:00', closes: '20:00' }] }))
  const socials = [{ network: 'facebook' as const, url: CONTACT.facebook }]
  if (!info) {
    await payload.create({
      collection: 'site-info',
      data: {
        tenant: tenantID,
        phone: CONTACT.phone,
        landline: CONTACT.landline,
        email: CONTACT.email,
        address: { postalCode: CONTACT.postalCode, city: CONTACT.city, mapsUrl: CONTACT.mapsUrl },
        openingHours,
        socials,
      },
      ...base,
    })
    return
  }
  const data: Partial<SiteInfo> = {}
  if (!info.openingHours?.length) data.openingHours = openingHours
  if (!info.socials?.length) data.socials = socials
  if (!info.address?.mapsUrl) data.address = { ...info.address, mapsUrl: CONTACT.mapsUrl }
  if (Object.keys(data).length) await payload.update({ collection: 'site-info', id: info.id, data, ...base })
}

async function ensureServices(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'services', tenantID)) return
  for (const [i, s] of SERVICES.entries()) {
    await payload.create({
      collection: 'services',
      data: { tenant: tenantID, title: s.title, summary: s.summary, points: s.points.map((text) => ({ text })), icon: s.icon, audiences: s.for, order: i + 1 },
      ...base,
    })
  }
}

type P = { name: string; description?: string; price: number; unit?: string; displayPrice?: string; highlight?: boolean }
/** Grille 2026-2027 du poney-club (affiche « Tarifications du Poney-Club du DEDC ») et tarifs pensionnaires. */
const PRICE_GROUPS: { name: string; order: number; prices: P[] }[] = [
  {
    name: 'Cours & abonnements',
    order: 1,
    prices: [
      { name: 'Abonnement annuel « Enfant »', description: 'Cotisation et licence incluses, soit 16 € le cours', price: 749, unit: 'par an', highlight: true },
      { name: 'Abonnement annuel « Adulte »', description: 'Cotisation et licence incluses, soit 18 € le cours', price: 840, unit: 'par an' },
      { name: 'Carte 10 cours collectifs', description: 'Valable jusqu’à fin juin', price: 200, unit: 'les 10 cours' },
      { name: 'Cours particulier', description: 'Sur réservation', price: 30, unit: 'l’heure' },
      { name: 'Cours particulier en duo', description: 'Sur réservation', price: 50, unit: 'l’heure, pour deux' },
      { name: 'Demi-pension', description: '2 séances par semaine', price: 150, unit: 'par mois' },
    ],
  },
  {
    name: 'Adhésion & licence',
    order: 2,
    prices: [
      { name: 'Adhésion annuelle', description: '1er membre de la famille', price: 80, unit: 'par an' },
      { name: 'Adhésion annuelle, 2e membre', description: 'Même famille · gratuit à partir du 3e', price: 75, unit: 'par an' },
      { name: 'Licence enfant', description: 'Moins de 18 ans', price: 29, unit: 'par an' },
      { name: 'Licence adulte', price: 40, unit: 'par an' },
      { name: 'Licence compétition', description: 'Club : gratuite', price: 80, displayPrice: 'Amateur : 80 €', unit: 'par an' },
    ],
  },
  {
    name: 'Stages & loisirs',
    order: 3,
    prices: [
      { name: 'Stage à la demi-journée', description: 'Vacances scolaires', price: 30, unit: 'la demi-journée' },
      { name: 'Stage à la journée', description: 'Vacances scolaires', price: 60, unit: 'la journée' },
      { name: 'Semaine de stage', description: 'Adhérent · 300 € pour les non-adhérents', price: 250, unit: 'la semaine', highlight: true },
      { name: 'Promenade à poney', description: 'Mercredi et samedi, sur réservation', price: 15, unit: 'les 30 minutes' },
      { name: 'Anniversaire au poney-club', description: 'Sur réservation, 10 enfants minimum', price: 20, unit: 'par enfant' },
    ],
  },
  {
    name: 'Compétition',
    order: 4,
    prices: [
      { name: 'Concours interne', description: '1 parcours · 50 € les 2 parcours', price: 30, unit: 'l’engagement' },
      { name: 'Concours départemental', description: '1 parcours · 100 € les 2 parcours', price: 70, unit: 'l’engagement' },
      { name: 'Concours extérieur', description: 'Engagement et coaching', price: 0, displayPrice: 'Sur demande', unit: 'conditions au bureau' },
    ],
  },
  {
    name: 'Pensionnaires',
    order: 5,
    prices: [
      { name: 'Cours collectif', description: 'À partir de 4 cavaliers', price: 20, unit: 'le cours' },
      { name: 'Cours particulier', price: 30, unit: 'le cours' },
      { name: 'Cours particulier « Duo »', price: 50, unit: 'le cours' },
      { name: 'Carte 10 cours particuliers', price: 250, unit: 'les 10 cours' },
      { name: 'Travail du cheval', description: 'Par nos soins', price: 280, unit: 'par mois', highlight: true },
    ],
  },
  {
    name: 'Écurie relais',
    order: 6,
    prices: [
      { name: 'Première nuit', description: 'Box ou paddock avec abri', price: 50, unit: 'par cheval', highlight: true },
      { name: 'Nuit supplémentaire', description: 'Box ou paddock avec abri', price: 30, unit: 'par cheval et par nuit' },
    ],
  },
]

/** Nom comparable : sans accents, sans « & » ni « et », sans espaces. */
const tabKey = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bet\b|&/g, '').replace(/[^a-z0-9]+/g, '')

/**
 * Deux onglets de tarifs du même nom (ex. deux « Cours & abonnements ») : les tarifs du premier
 * passent à la suite dans le dernier, sauf ceux qui y sont déjà (même nom), puis le premier est supprimé.
 */
async function mergeDuplicateTabs(payload: Payload, tenantID: number) {
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['prices'] } }] }, sort: 'id', limit: 100, depth: 0, ...base })
  const byName = new Map<string, typeof cats>()
  for (const c of cats) byName.set(tabKey(c.name), [...(byName.get(tabKey(c.name)) ?? []), c])
  for (const group of byName.values()) {
    if (group.length < 2) continue
    const target = group[group.length - 1]
    const pricesOf = async (id: number) =>
      (await payload.find({ collection: 'prices', where: { and: [{ tenant: { equals: tenantID } }, { category: { equals: id } }] }, sort: '_order', limit: 200, depth: 0, ...base })).docs
    const have = new Set((await pricesOf(target.id)).map((p) => tabKey(p.name)))
    for (const source of group.slice(0, -1)) {
      for (const p of await pricesOf(source.id)) {
        if (!have.has(tabKey(p.name))) {
          // Recréé pour se placer à la fin de l'onglet gardé, avec ses valeurs actuelles
          await payload.create({
            collection: 'prices',
            data: { tenant: tenantID, category: target.id, name: p.name, description: p.description, price: p.price, unit: p.unit, isFrom: p.isFrom, displayPrice: p.displayPrice, highlight: p.highlight },
            ...base,
          })
          have.add(tabKey(p.name))
        }
        await payload.delete({ collection: 'prices', id: p.id, ...base })
      }
      await payload.delete({ collection: 'categories', id: source.id, ...base })
    }
  }
}

/**
 * Un onglet de tarifs par catégorie. Une catégorie qui existe déjà (même nom) n'est pas touchée :
 * seules les catégories manquantes sont ajoutées, avec leurs tarifs.
 */
async function ensurePrices(payload: Payload, tenantID: number) {
  await mergeDuplicateTabs(payload, tenantID)
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['prices'] } }] }, limit: 100, depth: 0, ...base })
  const used = new Set<number>()
  const { docs: existingPrices } = await payload.find({ collection: 'prices', where: { tenant: { equals: tenantID } }, limit: 500, depth: 0, ...base })
  for (const p of existingPrices) if (typeof p.category === 'number') used.add(p.category)
  // Catégorie par défaut de la fiche client (« Tarifs »), encore vide : réutilisée pour le premier onglet
  let spare = cats.find((c) => !used.has(c.id) && !PRICE_GROUPS.some((g) => tabKey(g.name) === tabKey(c.name)))
  let order = existingPrices.length
  for (const group of PRICE_GROUPS) {
    const same = cats.find((c) => tabKey(c.name) === tabKey(group.name))
    if (same) {
      // Onglet déjà en place : on ne recrée rien, on le range seulement à sa place s'il a été créé par l'import
      if (used.has(same.id)) {
        if (group.name === 'Écurie relais' && (same.order ?? 0) < group.order) await payload.update({ collection: 'categories', id: same.id, data: { order: group.order }, ...base })
        continue
      }
    }
    const category =
      same ??
      (spare
        ? await payload.update({ collection: 'categories', id: spare.id, data: { name: group.name, order: group.order }, ...base })
        : await payload.create({ collection: 'categories', data: { tenant: tenantID, name: group.name, usage: ['prices'], order: group.order }, ...base }))
    if (!same) spare = undefined
    for (const p of group.prices) {
      await payload.create({ collection: 'prices', data: { tenant: tenantID, category: category.id, order: ++order, ...p }, ...base })
    }
  }
}

/** Menus posés par les versions précédentes de l'import : remplacés seulement s'ils n'ont pas été modifiés. */
const OLD_MENUS = [
  ['Activités', 'Le domaine', 'Tarifs', 'Agenda', 'Photos', 'Contact'],
  ['Le domaine', 'Activités', 'Planning', 'Tarifs', 'Agenda', 'Photos', 'Contact'],
]
/**
 * Échange demandé : la vue aérienne de la carrière (avec le ciel) illustre « Le domaine »,
 * la vue de haut de toute la propriété va dans la galerie.
 */
const AERIAL_OUT = 'Vue aérienne du Domaine Équestre de la Castelle'
const AERIAL_IN = 'Le Domaine Équestre de la Castelle vu du ciel'

async function ensureMenus(payload: Payload, tenantID: number) {
  type A = 'top' | 'activites' | 'installations' | 'horaires' | 'tarifs' | 'blog' | 'galerie' | 'contact'
  const anchor = (label: string, a: A) => ({ label, type: 'anchor' as const, anchor: a })
  const items = [
    anchor('Le domaine', 'installations'),
    anchor('Activités', 'activites'),
    anchor('Tarifs', 'tarifs'),
    anchor('Agenda', 'blog'),
    anchor('Contact', 'contact'),
    anchor('Planning', 'horaires'),
    anchor('Galerie', 'galerie'),
  ]
  const { docs } = await payload.find({ collection: 'menus', where: { tenant: { equals: tenantID } }, sort: 'id', limit: 20, depth: 0, ...base })
  if (docs.length) {
    const mains = docs.filter((m) => m.location === 'main')
    // Menus principaux en double (deux démarrages simultanés) : on garde le premier, celui que le site affiche
    for (const extra of mains.slice(1)) await payload.delete({ collection: 'menus', id: extra.id, ...base })
    const main = mains[0]
    if (!main) return
    const current = main.items ?? []
    const labels = current.map((i) => i.label)
    if (OLD_MENUS.some((old) => labels.length === old.length && labels.every((l, i) => l === old[i]))) {
      // Menu posé par une version précédente de l'import et jamais modifié
      await payload.update({ collection: 'menus', id: main.id, data: { items }, ...base })
      return
    }
    // Menu modifié : on ajoute seulement Planning et Galerie s'ils manquent, sans toucher au reste
    const hasAnchor = (a: A) => current.some((i) => i.type === 'anchor' && i.anchor === a)
    const next = current.map((i) => (i.type === 'anchor' && i.anchor === 'galerie' && i.label === 'Photos' ? { ...i, label: 'Galerie' } : i))
    if (!hasAnchor('horaires')) next.push(anchor('Planning', 'horaires'))
    if (!hasAnchor('galerie')) next.push(anchor('Galerie', 'galerie'))
    if (next.length !== current.length || next.some((i, n) => i.label !== current[n].label)) {
      await payload.update({ collection: 'menus', id: main.id, data: { items: next }, ...base })
    }
    return
  }
  await payload.create({ collection: 'menus', data: { tenant: tenantID, name: 'Menu principal', location: 'main', items }, ...base })
  await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantID,
      name: 'Pied de page',
      location: 'footer',
      items: [{ label: 'Facebook', type: 'url', url: CONTACT.facebook, newTab: true }],
    },
    ...base,
  })
}

async function ensurePhotos(payload: Payload, tenantID: number) {
  const { docs: existing } = await payload.find({ collection: 'media', where: { tenant: { equals: tenantID } }, limit: 300, depth: 0, ...base })
  // Fait une seule fois : tant que l'ancienne vue est encore dans la galerie
  const out = existing.find((m) => m.alt === AERIAL_OUT && m.inGallery)
  if (out) {
    await payload.update({ collection: 'media', id: out.id, data: { inGallery: false }, ...base })
    const back = existing.find((m) => m.alt === AERIAL_IN && !m.inGallery)
    if (back) await payload.update({ collection: 'media', id: back.id, data: { inGallery: true }, ...base })
  }
  // Photos importées deux fois (même texte alternatif, parmi celles de l'import) : on garde la première
  const ours = new Set(castellePhotos.map((p) => p.alt))
  const seen = new Set<string>()
  for (const m of [...existing].sort((a, b) => a.id - b.id)) {
    if (!ours.has(m.alt)) continue
    if (seen.has(m.alt)) await payload.delete({ collection: 'media', id: m.id, ...base }).catch(() => undefined)
    else seen.add(m.alt)
  }
  const haveAlt = new Set(existing.map((m) => m.alt))
  const missing = castellePhotos.filter((p) => !haveAlt.has(p.alt))
  if (!missing.length) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['gallery'] } }] }, limit: 1, ...base })
  for (const img of missing) {
    const data = Buffer.from(img.b64, 'base64')
    await payload.create({
      collection: 'media',
      data: { tenant: tenantID, alt: img.alt, title: img.caption, inGallery: true, isPublic: true, ...(cats[0] ? { category: cats[0].id } : {}) },
      file: { data, mimetype: img.mime, name: `castelle-${slug(img.alt)}.jpg`, size: data.length },
      ...base,
    })
  }
  payload.logger.info('✔ Photos du Domaine de la Castelle importées')
}
