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
 * activités, tarifs écurie relais, menus, photos et pages légales. Rien n'est écrasé.
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`.
 */
export async function importDomaineCastelle(payload: Payload): Promise<void> {
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

const countOf = async (payload: Payload, collection: 'services' | 'menus' | 'prices', tenantID: number) =>
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

/** Seuls tarifs connus : l'écurie relais. La grille des cours (2026-2027) est à saisir dans le CMS. */
async function ensurePrices(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'prices', tenantID)) return
  const name = 'Écurie relais'
  const { docs } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['prices'] } }] }, limit: 1, ...base })
  const category = docs[0]
    ? await payload.update({ collection: 'categories', id: docs[0].id, data: { name }, ...base })
    : await payload.create({ collection: 'categories', data: { tenant: tenantID, name, usage: ['prices'], order: 1 }, ...base })
  const prices = [
    { name: 'Première nuit', description: 'Box ou paddock avec abri', price: 50, unit: 'par cheval', highlight: true },
    { name: 'Nuit supplémentaire', description: 'Box ou paddock avec abri', price: 30, unit: 'par cheval et par nuit' },
  ]
  for (const [i, p] of prices.entries()) {
    await payload.create({ collection: 'prices', data: { tenant: tenantID, category: category.id, order: i + 1, ...p }, ...base })
  }
}

async function ensureMenus(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'menus', tenantID)) return
  type A = 'top' | 'activites' | 'installations' | 'tarifs' | 'blog' | 'galerie' | 'contact'
  const anchor = (label: string, a: A) => ({ label, type: 'anchor' as const, anchor: a })
  await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantID,
      name: 'Menu principal',
      location: 'main',
      items: [
        anchor('Activités', 'activites'),
        anchor('Le domaine', 'installations'),
        anchor('Tarifs', 'tarifs'),
        anchor('Agenda', 'blog'),
        anchor('Photos', 'galerie'),
        anchor('Contact', 'contact'),
      ],
    },
    ...base,
  })
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
  const haveAlt = new Set(existing.map((m) => m.alt))
  const missing = castellePhotos.filter((p) => !haveAlt.has(p.alt))
  if (!missing.length) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['gallery'] } }] }, limit: 1, ...base })
  for (const img of missing) {
    const data = Buffer.from(img.b64, 'base64')
    await payload.create({
      collection: 'media',
      data: { tenant: tenantID, alt: img.alt, title: img.caption, inGallery: true, isPublic: true, ...(cats[0] ? { category: cats[0].id } : {}) },
      file: { data, mimetype: img.mime, name: `castelle-${castellePhotos.indexOf(img) + 1}.jpg`, size: data.length },
      ...base,
    })
  }
  payload.logger.info('✔ Photos du Domaine de la Castelle importées')
}
