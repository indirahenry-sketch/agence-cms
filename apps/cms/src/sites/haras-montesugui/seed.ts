import type { Payload } from 'payload'

import { createLegalPages } from '@/sites/legalPages'
import { describeError } from '@/lib/s3-check'

import { seedEvents, seedServices } from '../ecuries-poigny/seedContent'
import { seedGallery } from '../ecuries-poigny/seedImages'

import { montesuguiPhotos } from './seedImages'

export const MONTESUGUI_SLUG = 'haras-montesugui'

const base = { overrideAccess: true, context: { skipInvite: true } } as const

/**
 * Client « Haras de Montesugui » : duplication de la V10 des Écuries de Poigny avec un habillage
 * classique (bordeaux, ivoire et or, vouvoiement). Coordonnées à compléter dans la fiche client.
 *
 * Sans risque et relançable : chaque étape ne crée que ce qui MANQUE pour ce client (rien n'est écrasé).
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`.
 */
export async function importHarasMontesugui(payload: Payload): Promise<void> {
  const existing = await payload.find({ collection: 'tenants', where: { slug: { equals: MONTESUGUI_SLUG } }, limit: 1, depth: 0, ...base })
  const tenantID = existing.docs[0]?.id ?? (await createTenant(payload))
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      payload.logger.error({ err }, `Haras de Montesugui : étape « ${name} » impossible : ${describeError(err)}`)
    }
  }
  await step('coordonnées provisoires', () => clearPlaceholderInfo(payload, tenantID))
  await step('tarifs', () => ensurePrices(payload, tenantID))
  await step('services', () => ensureServices(payload, tenantID))
  await step('agenda', () => ensureEvents(payload, tenantID))
  await step('pages légales', async () => void (await createLegalPages(payload, tenantID)))
  await step('menus', () => ensureMenus(payload, tenantID))
  await step('lien Galerie', () => renameGalleryLink(payload, tenantID))
  await step('photos', () => ensurePhotos(payload, tenantID))
}

/** Valeurs provisoires mises à la création : elles ne doivent jamais masquer celles de la fiche client. */
const PLACEHOLDERS = { phone: '06 00 00 00 00', email: 'contact@haras-montesugui.fr', street: 'Adresse à compléter' }

/**
 * Les « Informations » priment sur la fiche client. Les premières versions de l'import y mettaient
 * les coordonnées provisoires : modifier la fiche client ne changeait alors rien sur le site.
 * On efface ces valeurs provisoires (et seulement elles) : la fiche client reprend la main.
 */
async function clearPlaceholderInfo(payload: Payload, tenantID: number) {
  const { docs } = await payload.find({ collection: 'site-info', where: { tenant: { equals: tenantID } }, limit: 1, depth: 0, ...base })
  const info = docs[0]
  if (!info) return
  const data: Record<string, unknown> = {}
  if (info.phone === PLACEHOLDERS.phone) data.phone = null
  if (info.email === PLACEHOLDERS.email) data.email = null
  if (info.address?.street === PLACEHOLDERS.street) data.address = { ...info.address, street: null }
  if (!Object.keys(data).length) return
  await payload.update({ collection: 'site-info', id: info.id, data, ...base })
  payload.logger.info('✔ Haras de Montesugui : coordonnées provisoires retirées des Informations')
}

const countOf = async (payload: Payload, collection: 'prices' | 'services' | 'events' | 'menus' | 'media', tenantID: number) =>
  (await payload.count({ collection, where: { tenant: { equals: tenantID } }, overrideAccess: true })).totalDocs

async function createTenant(payload: Payload): Promise<number> {
  const contact = { email: PLACEHOLDERS.email, phone: PLACEHOLDERS.phone }
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Haras de Montesugui',
      slug: MONTESUGUI_SLUG,
      languages: ['fr'],
      ...contact,
      address: { street: PLACEHOLDERS.street, country: 'France' },
      theme: { primaryColor: '#74231E', secondaryColor: '#B8913A', font: 'playfair' },
      settings: { showBlog: true, showEvents: true, showPrices: true, showGallery: true },
      labels: ['Équestre', 'Maquette'],
    },
    ...base,
  })
  const weekday = { slots: [{ opens: '08:00', closes: '18:00' }] }
  await payload.create({
    collection: 'site-info',
    data: {
      tenant: tenant.id,
      openingHours: [
        { day: 'monday', ...weekday },
        { day: 'tuesday', ...weekday },
        { day: 'wednesday', ...weekday },
        { day: 'thursday', ...weekday },
        { day: 'friday', ...weekday },
        { day: 'saturday', slots: [{ opens: '08:00', closes: '12:00' }] },
        { day: 'sunday', closed: true },
      ],
    },
    ...base,
  })
  payload.logger.info('✔ Client « Haras de Montesugui » créé')
  return tenant.id
}

/** Catégorie de tarifs du client (créée par la fiche client) ou nouvelle. */
async function priceCategory(payload: Payload, tenantID: number, name: string, order: number, reuseDefault: boolean) {
  if (reuseDefault) {
    const { docs } = await payload.find({
      collection: 'categories',
      where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['prices'] } }] },
      limit: 1,
      ...base,
    })
    if (docs[0]) return payload.update({ collection: 'categories', id: docs[0].id, data: { name, order }, ...base })
  }
  return payload.create({ collection: 'categories', data: { tenant: tenantID, name, usage: ['prices'], order }, ...base })
}

async function ensurePrices(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'prices', tenantID)) return
  type P = { name: string; description: string; price: number; unit: string; displayPrice?: string; highlight?: boolean }
  const groups: { name: string; prices: P[] }[] = [
    {
      name: 'Cours et abonnements',
      prices: [
        { name: 'Baby poney', description: 'Les plus petits', price: 450, unit: 'par saison' },
        { name: 'Poney / double poney', description: 'Enfants', price: 660, unit: 'par saison' },
        { name: 'Cours cheval', description: 'Adolescents et adultes', price: 825, displayPrice: '810–840 €', unit: 'par saison' },
        { name: 'Abonnement compétition', description: 'Concours', price: 1350, unit: 'par saison', highlight: true },
      ],
    },
    {
      name: 'Pensions',
      prices: [
        { name: 'Pension pré', description: 'Au grand air', price: 250, unit: 'par mois' },
        { name: 'Pension box', description: 'La plus demandée', price: 420, unit: 'par mois', highlight: true },
        { name: 'Pension débourrage', description: 'Jeunes chevaux', price: 630, unit: 'par mois' },
      ],
    },
    {
      name: 'Stages et animations',
      prices: [
        { name: 'Demi-journée de stage', description: 'Vacances', price: 35, unit: 'la demi-journée' },
        { name: 'Journée de stage', description: 'Vacances', price: 52, displayPrice: '50–55 €', unit: 'la journée', highlight: true },
        { name: 'Événements spéciaux', description: 'Ex. Cheval de Pâques', price: 10, displayPrice: '10 / 15 €', unit: 'adhérent / non-adhérent' },
      ],
    },
  ]
  let order = 0
  for (const [i, group] of groups.entries()) {
    const category = await priceCategory(payload, tenantID, group.name, i + 1, i === 0)
    for (const p of group.prices) {
      await payload.create({ collection: 'prices', data: { tenant: tenantID, category: category.id, order: ++order, ...p }, ...base })
    }
  }
}

async function ensureServices(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'services', tenantID)) return
  const icons = ['person', 'medal', 'home', 'heart', 'chart', 'calendar'] as const
  for (const [i, s] of seedServices.entries()) {
    await payload.create({
      collection: 'services',
      data: {
        tenant: tenantID,
        title: s.title,
        summary: s.summary.replace('pour toute la communauté', 'tout au long de l’année'),
        points: s.points.map((text) => ({ text })),
        icon: icons[i] ?? 'star',
        audiences: s.for as ('debutant' | 'loisir' | 'compet' | 'proprio')[],
        order: i + 1,
      },
      ...base,
    })
  }
}

async function ensureEvents(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'events', tenantID)) return
  for (const e of seedEvents) {
    await payload.create({
      collection: 'events',
      data: {
        tenant: tenantID,
        title: e.titre.replace('du club', 'du haras'),
        description: e.detail.replace('du club', 'du haras'),
        type: e.type as 'stage',
        hours: e.horaires,
        startsAt: new Date(`${e.debut}T09:00:00+01:00`).toISOString(),
        endsAt: e.fin && e.fin !== e.debut ? new Date(`${e.fin}T17:00:00+01:00`).toISOString() : undefined,
        location: 'Haras de Montesugui',
      },
      ...base,
    })
  }
}

/** Le lien « Le haras » ouvre désormais la page Galerie : on le renomme (seulement s'il n'a pas été modifié). */
async function renameGalleryLink(payload: Payload, tenantID: number) {
  const { docs } = await payload.find({ collection: 'menus', where: { and: [{ tenant: { equals: tenantID } }, { location: { equals: 'main' } }] }, limit: 1, depth: 0, ...base })
  const menu = docs[0]
  if (!menu?.items?.some((it) => it.label === 'Le haras' && it.anchor === 'galerie')) return
  const items = menu.items.map((it) => (it.label === 'Le haras' && it.anchor === 'galerie' ? { ...it, label: 'Galerie' } : it))
  await payload.update({ collection: 'menus', id: menu.id, data: { items }, ...base })
}

async function ensureMenus(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'menus', tenantID)) return
  const anchor = (label: string, a: 'galerie' | 'services' | 'tarifs' | 'blog' | 'contact' | 'installations' | 'stages') => ({ label, type: 'anchor' as const, anchor: a })
  await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantID,
      name: 'Menu principal',
      location: 'main',
      items: [
        anchor('Galerie', 'galerie'),
        { ...anchor('Prestations', 'services'), children: [anchor('Installations', 'installations'), anchor('Stages', 'stages')] },
        anchor('Tarifs', 'tarifs'),
        anchor('Actualités', 'blog'),
        anchor('Contact', 'contact'),
      ],
    },
    ...base,
  })
  // Pas de lien « Mentions légales » au pied de page tant que la page (brouillon, à compléter) n'est pas publiée
}

/** Vues aériennes de Poigny : elles montrent un autre domaine, on ne les reprend pas. */
const POIGNY_SKIPPED = new Set(['Le domaine vu du ciel', 'Au milieu des champs'])

/**
 * Photos du haras en tête de galerie, puis photos de démonstration de la maquette d'origine
 * (à remplacer au fil de l'eau par celles du client).
 */
async function ensurePhotos(payload: Payload, tenantID: number) {
  const { docs: existing } = await payload.find({ collection: 'media', where: { tenant: { equals: tenantID } }, limit: 200, depth: 0, ...base })
  const haveAlt = new Set(existing.map((m) => m.alt))
  const photos = [...montesuguiPhotos, ...seedGallery.filter((img) => !POIGNY_SKIPPED.has(img.alt))]
  const missing = photos.map((img, i) => ({ img, i })).filter(({ img }) => !haveAlt.has(img.alt))
  if (!missing.length) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['gallery'] } }] }, limit: 1, ...base })
  for (const { img, i } of missing) {
    const data = Buffer.from(img.b64, 'base64')
    await payload.create({
      collection: 'media',
      data: { tenant: tenantID, alt: img.alt, title: img.caption || img.alt, inGallery: true, isPublic: true, ...(cats[0] ? { category: cats[0].id } : {}) },
      file: { data, mimetype: img.mime, name: `photo-${i + 1}.jpg`, size: data.length },
      ...base,
    })
  }
  payload.logger.info('✔ Photos du Haras de Montesugui importées')
}
