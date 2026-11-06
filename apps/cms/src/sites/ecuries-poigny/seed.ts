import type { Payload } from 'payload'

import { CATEGORY_TYPES } from '@/collections/Categories'
import { describeError } from '@/lib/s3-check'

import { seedEvents, seedServices } from './seedContent'
import { seedGallery, seedLogo } from './seedImages'

export const POIGNY_SLUG = 'ecuries-poigny'

const base = { overrideAccess: true, context: { skipInvite: true } } as const

/** Paragraphes → texte riche (format Lexical). */
const rich = (...paragraphs: string[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((text) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      children: [{ type: 'text', text, format: 0, style: '', mode: 'normal', detail: 0, version: 1 }],
    })),
  },
})

/**
 * Client de démonstration « Les Écuries de Poigny », d'après la V10 (agenda + blog) :
 * fiche, horaires, catégories, tarifs, services, agenda, menus, photos, une bannière,
 * un article et une page d'exemple.
 *
 * Sans risque et relançable : chaque étape ne crée que ce qui MANQUE pour ce client
 * (rien n'est écrasé). Un client créé avec une version précédente est donc complété.
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`.
 */
export async function importEcuriesPoigny(payload: Payload): Promise<void> {
  const existing = await payload.find({ collection: 'tenants', where: { slug: { equals: POIGNY_SLUG } }, limit: 1, depth: 0, ...base })
  const tenantID = existing.docs[0]?.id ?? (await createTenant(payload))
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      payload.logger.error({ err }, `Écuries de Poigny : étape « ${name} » impossible : ${describeError(err)}`)
    }
  }
  await step('catégories', () => ensureCategories(payload, tenantID))
  await step('tarifs', () => ensurePrices(payload, tenantID))
  await step('services', () => ensureServices(payload, tenantID))
  await step('agenda', () => ensureEvents(payload, tenantID))
  await step('page', () => ensurePage(payload, tenantID))
  await step('menus', () => ensureMenus(payload, tenantID))
  await step('article', () => ensurePost(payload, tenantID))
  await step('bannière', () => ensurePromotions(payload, tenantID))
  await step('photos', () => ensurePhotos(payload, tenantID))
}

const countOf = async (payload: Payload, collection: 'categories' | 'prices' | 'services' | 'events' | 'menus' | 'posts' | 'promotions' | 'media' | 'pages', tenantID: number) =>
  (await payload.count({ collection, where: { tenant: { equals: tenantID } }, overrideAccess: true })).totalDocs

async function createTenant(payload: Payload): Promise<number> {
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Les Écuries de Poigny',
      slug: POIGNY_SLUG,
      languages: ['fr'],
      email: 'ecuriespoigny@gmail.com',
      phone: '06 27 67 92 88',
      address: { street: "24 route de la Ferme d'Hennepont", postalCode: '77160', city: 'Poigny', country: 'France' },
      theme: { primaryColor: '#4C6E2A', secondaryColor: '#EDC655', font: 'playfair' },
      settings: { showBlog: true, showEvents: true, showPrices: true, showGallery: true },
    },
    ...base,
  })
  const weekday = { slots: [{ opens: '08:00', closes: '18:00' }] }
  await payload.create({
    collection: 'site-info',
    data: {
      tenant: tenant.id,
      phone: '06 27 67 92 88',
      email: 'ecuriespoigny@gmail.com',
      address: {
        street: "24 route de la Ferme d'Hennepont",
        postalCode: '77160',
        city: 'Poigny',
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=24+route+de+la+Ferme+d%27Hennepont+77160+Poigny',
      },
      openingHours: [
        { day: 'monday', ...weekday },
        { day: 'tuesday', ...weekday },
        { day: 'wednesday', ...weekday },
        { day: 'thursday', ...weekday },
        { day: 'friday', ...weekday },
        { day: 'saturday', slots: [{ opens: '08:00', closes: '12:00' }] },
        { day: 'sunday', closed: true },
      ],
      socials: [{ network: 'instagram', url: 'https://www.instagram.com/ecuries_poigny' }],
    },
    ...base,
  })
  payload.logger.info('✔ Client « Les Écuries de Poigny » créé')
  return tenant.id
}

/** Une catégorie par type (Photos, Services, Tarifs, Articles, Blog), renommable par le client. */
async function ensureCategories(payload: Payload, tenantID: number) {
  for (const [i, type] of CATEGORY_TYPES.entries()) {
    const { totalDocs } = await payload.count({
      collection: 'categories',
      where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: [type.value] } }] },
      overrideAccess: true,
    })
    if (totalDocs) continue
    await payload.create({
      collection: 'categories',
      data: { tenant: tenantID, name: type.label.replace(' (actualités)', ''), usage: [type.value], order: i + 1 },
      ...base,
    })
  }
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
        { name: 'Cours cheval', description: 'Ados et adultes', price: 825, displayPrice: '810–840 €', unit: 'par saison' },
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
  // La catégorie par défaut « Tarifs » devient le premier onglet
  const { docs: defaults } = await payload.find({
    collection: 'categories',
    where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['prices'] } }] },
    limit: 1,
    ...base,
  })
  let order = 0
  for (const [i, group] of groups.entries()) {
    const category =
      i === 0 && defaults[0]
        ? await payload.update({ collection: 'categories', id: defaults[0].id, data: { name: group.name, order: 1 }, ...base })
        : await payload.create({ collection: 'categories', data: { tenant: tenantID, name: group.name, usage: ['prices'], order: i + 1 }, ...base })
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
        summary: s.summary,
        points: s.points.map((text) => ({ text })),
        icon: icons[i] ?? 'star',
        audiences: s.for as ('debutant' | 'loisir' | 'compet' | 'proprio')[],
        order: i + 1,
      },
      ...base,
    })
  }
  // Mise à niveau d'un client créé avant le blog : on l'active (la V10 a une page Blog)
  await payload.update({ collection: 'tenants', id: tenantID, data: { settings: { showBlog: true, showEvents: true, showPrices: true, showGallery: true } }, ...base })
}

async function ensureEvents(payload: Payload, tenantID: number) {
  const { totalDocs } = await payload.count({ collection: 'events', where: { and: [{ tenant: { equals: tenantID } }, { type: { exists: true } }] }, overrideAccess: true })
  if (totalDocs) return
  for (const e of seedEvents) {
    await payload.create({
      collection: 'events',
      data: {
        tenant: tenantID,
        title: e.titre,
        description: e.detail,
        type: e.type as 'stage',
        hours: e.horaires,
        startsAt: new Date(`${e.debut}T09:00:00+01:00`).toISOString(),
        endsAt: e.fin && e.fin !== e.debut ? new Date(`${e.fin}T17:00:00+01:00`).toISOString() : undefined,
        location: 'Les Écuries de Poigny',
      },
      ...base,
    })
  }
}

async function ensurePage(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'pages', tenantID)) return
  await payload.create({
    collection: 'pages',
    data: {
      tenant: tenantID,
      title: 'Mentions légales',
      slug: 'mentions-legales',
      _status: 'published',
      layout: [
        { blockType: 'heading', eyebrow: 'Informations', text: 'Éditeur du site', level: 'h2' },
        {
          blockType: 'text',
          content: rich(
            "Les Écuries de Poigny, 24 route de la Ferme d'Hennepont, 77160 Poigny. Téléphone : 06 27 67 92 88. E-mail : ecuriespoigny@gmail.com.",
            'Page d’exemple créée dans le CMS : modifiez-la ou dupliquez-la depuis le menu Pages.',
          ),
        },
        {
          blockType: 'section',
          eyebrow: 'Exemple de section',
          title: 'Une question ?',
          content: rich('Les sections combinent un titre, un texte, une image et jusqu’à trois boutons.'),
          background: 'card',
          buttons: [{ label: 'Nous contacter', url: '/sites/ecuries-poigny#contact', style: 'primary' }],
        },
      ],
      seo: { title: 'Mentions légales · Les Écuries de Poigny', description: 'Informations légales du site des Écuries de Poigny.' },
    },
    ...base,
  })
}

async function ensureMenus(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'menus', tenantID)) return
  const { docs: pages } = await payload.find({ collection: 'pages', where: { and: [{ tenant: { equals: tenantID } }, { slug: { equals: 'mentions-legales' } }] }, limit: 1, ...base })
  const anchor = (label: string, a: 'galerie' | 'services' | 'tarifs' | 'blog' | 'contact' | 'installations' | 'stages') => ({ label, type: 'anchor' as const, anchor: a })
  await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantID,
      name: 'Menu principal',
      location: 'main',
      items: [
        anchor('Photos', 'galerie'),
        { ...anchor('Services', 'services'), children: [anchor('Installations', 'installations'), anchor('Stages', 'stages')] },
        anchor('Tarifs', 'tarifs'),
        anchor('Blog', 'blog'),
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
      items: [
        { label: 'Instagram @ecuries_poigny', type: 'url', url: 'https://www.instagram.com/ecuries_poigny', newTab: true },
        ...(pages[0] ? [{ label: 'Mentions légales', type: 'page' as const, page: pages[0].id }] : []),
      ],
    },
    ...base,
  })
}

async function ensurePost(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'posts', tenantID)) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['blog'] } }] }, limit: 1, ...base })
  await payload.create({
    collection: 'posts',
    data: {
      tenant: tenantID,
      title: 'Bienvenue sur le blog de l’écurie',
      excerpt: 'Les nouvelles du club, les photos des stages et des concours.',
      content: rich(
        'Retrouvez ici les nouvelles du club, les photos des stages et des concours, et tous les rendez-vous à venir dans l’agenda.',
        'Article d’exemple créé dans le CMS : modifiez-le ou supprimez-le depuis le menu Articles et blog.',
      ),
      category: cats[0]?.id,
      _status: 'published',
      publishedAt: new Date().toISOString(),
    },
    ...base,
  })
}

async function ensurePromotions(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'promotions', tenantID)) return
  await payload.create({
    collection: 'promotions',
    data: {
      tenant: tenantID,
      kind: 'banner',
      active: true,
      title: 'Stage de Noël du 21 au 23 décembre',
      text: 'Tous niveaux, poney et cheval.',
      buttonLabel: 'Voir l’agenda',
      buttonUrl: '#blog',
      style: 'accent',
    },
    ...base,
  })
  await payload.create({
    collection: 'promotions',
    data: {
      tenant: tenantID,
      kind: 'popup',
      active: false,
      title: 'Portes ouvertes',
      text: 'Exemple de pop-up : cochez « Activée » pour l’afficher à l’ouverture du site.',
      buttonLabel: 'Nous contacter',
      buttonUrl: '#contact',
      frequency: 'session',
      delay: 3,
    },
    ...base,
  })
}

/** Logo et photos de la galerie. En cas d'échec, le site garde son logo intégré et masque la galerie. */
async function ensurePhotos(payload: Payload, tenantID: number) {
  // Ne renvoie que ce qui manque : un import interrompu (stockage en panne) est repris sans doublon
  const { docs: existing } = await payload.find({ collection: 'media', where: { tenant: { equals: tenantID } }, limit: 200, depth: 0, ...base })
  const haveAlt = new Set(existing.map((m) => m.alt))
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, ...base })
  const missing = seedGallery.map((img, i) => ({ img, i })).filter(({ img }) => !haveAlt.has(img.alt))
  if (tenant.logo && !missing.length) return
  const upload = async (img: { mime: string; b64: string; alt: string; caption?: string }, name: string, inGallery: boolean) => {
    const data = Buffer.from(img.b64, 'base64')
    return payload.create({
      collection: 'media',
      data: { tenant: tenantID, alt: img.alt, title: inGallery ? img.caption || img.alt : undefined, inGallery, isPublic: true },
      file: { data, mimetype: img.mime, name, size: data.length },
      ...base,
    })
  }
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['gallery'] } }] }, limit: 1, ...base })
  if (!tenant.logo) {
    const logo = existing.find((m) => m.alt === seedLogo.alt) ?? (await upload(seedLogo, 'logo.png', false))
    await payload.update({ collection: 'tenants', id: tenantID, data: { logo: logo.id }, ...base })
  }
  for (const { img, i } of missing) {
    const m = await upload(img, `photo-${i + 1}.jpg`, true)
    if (cats[0]) await payload.update({ collection: 'media', id: m.id, data: { category: cats[0].id }, ...base })
  }
  payload.logger.info('✔ Photos des Écuries de Poigny importées')
}
