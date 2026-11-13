import type { Payload } from 'payload'

import type { Service } from '@/payload-types'
import { createLegalPages } from '@/sites/legalPages'
import { describeError } from '@/lib/s3-check'

import { seedServices } from './seedContent'
import { seedArticles, seedGallery } from './seedImages'

export const SOURDUN_SLUG = 'centre-equestre-sourdun'

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
 * Client « Centre Équestre de Sourdun », d'après la dernière version de sa maquette
 * (accueil, cours et horaires, tarifs, réserver, blog).
 *
 * Gérés dans le CMS : nom, logo, coordonnées, activités, photos, articles, agenda, menus,
 * bannières et pop-ups. Planning des cours et grilles tarifaires restent dans la maquette.
 *
 * Sans risque et relançable : chaque étape ne crée que ce qui MANQUE (rien n'est écrasé).
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`.
 */
export async function importCentreEquestreSourdun(payload: Payload): Promise<void> {
  const existing = await payload.find({ collection: 'tenants', where: { slug: { equals: SOURDUN_SLUG } }, limit: 1, depth: 0, ...base })
  const tenantID = existing.docs[0]?.id ?? (await createTenant(payload))
  const step = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn()
    } catch (err) {
      payload.logger.error({ err }, `Centre Équestre de Sourdun : étape « ${name} » impossible : ${describeError(err)}`)
    }
  }
  await step('activités', () => ensureServices(payload, tenantID))
  await step('pages légales', async () => void (await createLegalPages(payload, tenantID)))
  await step('menus', () => ensureMenus(payload, tenantID))
  await step('photos', () => ensurePhotos(payload, tenantID))
  await step('articles', () => ensurePosts(payload, tenantID))
}

const countOf = async (payload: Payload, collection: 'services' | 'menus' | 'posts', tenantID: number) =>
  (await payload.count({ collection, where: { tenant: { equals: tenantID } }, overrideAccess: true })).totalDocs

async function createTenant(payload: Payload): Promise<number> {
  const contact = { email: 'c.e.sourdun@gmail.com', phone: '07 84 34 30 81' }
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Centre Équestre de Sourdun',
      slug: SOURDUN_SLUG,
      languages: ['fr'],
      ...contact,
      address: { street: '126 rue de Paris', postalCode: '77171', city: 'Sourdun', country: 'France' },
      theme: { primaryColor: '#3E9A1E', secondaryColor: '#E8C15A', font: 'playfair' },
      settings: { showBlog: true, showEvents: true, showPrices: true, showGallery: true },
      labels: ['Équestre', 'Maquette'],
    },
    ...base,
  })
  await payload.create({
    collection: 'site-info',
    data: {
      tenant: tenant.id,
      ...contact,
      address: {
        street: '126 rue de Paris',
        postalCode: '77171',
        city: 'Sourdun',
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Centre+%C3%A9questre+de+Sourdun+126+rue+de+Paris+77171+Sourdun',
      },
      socials: [{ network: 'facebook', url: 'https://www.facebook.com/CentreEquestreSourdun/' }],
    },
    ...base,
  })
  payload.logger.info('✔ Client « Centre Équestre de Sourdun » créé')
  return tenant.id
}

async function ensureServices(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'services', tenantID)) return
  for (const [i, s] of seedServices.entries()) {
    await payload.create({
      collection: 'services',
      data: {
        tenant: tenantID,
        title: s.title,
        summary: s.summary,
        points: s.points.map((text) => ({ text })),
        icon: s.icon as Service['icon'],
        audiences: s.for as NonNullable<Service['audiences']>,
        order: i + 1,
      },
      ...base,
    })
  }
}

async function ensureMenus(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'menus', tenantID)) return
  type A = 'top' | 'galerie' | 'horaires' | 'tarifs' | 'blog' | 'contact' | 'activites' | 'installations' | 'stages' | 'reserver'
  const anchor = (label: string, a: A) => ({ label, type: 'anchor' as const, anchor: a })
  await payload.create({
    collection: 'menus',
    data: {
      tenant: tenantID,
      name: 'Menu principal',
      location: 'main',
      items: [
        anchor('Accueil', 'top'),
        anchor('Photos', 'galerie'),
        anchor('Cours et horaires', 'horaires'),
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
        { label: 'Facebook', type: 'url', url: 'https://www.facebook.com/CentreEquestreSourdun/', newTab: true },
        { label: 'Réservations FFE', type: 'url', url: 'https://acces-equitation-sourdun.ffe.com', newTab: true },
      ],
    },
    ...base,
  })
}

const upload = (payload: Payload, tenantID: number, img: { mime: string; b64: string; alt: string; title?: string }, name: string, inGallery: boolean, category?: number) => {
  const data = Buffer.from(img.b64, 'base64')
  return payload.create({
    collection: 'media',
    data: { tenant: tenantID, alt: img.alt, title: img.title, inGallery, isPublic: true, ...(category ? { category } : {}) },
    file: { data, mimetype: img.mime, name, size: data.length },
    ...base,
  })
}

async function ensurePhotos(payload: Payload, tenantID: number) {
  const { docs: existing } = await payload.find({ collection: 'media', where: { tenant: { equals: tenantID } }, limit: 200, depth: 0, ...base })
  const haveAlt = new Set(existing.map((m) => m.alt))
  const missing = seedGallery.map((img, i) => ({ img, i })).filter(({ img }) => !haveAlt.has(img.alt))
  if (!missing.length) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['gallery'] } }] }, limit: 1, ...base })
  for (const { img, i } of missing) {
    await upload(payload, tenantID, { ...img, title: img.caption }, `photo-${i + 1}.jpg`, true, cats[0]?.id)
  }
  payload.logger.info('✔ Photos du Centre Équestre de Sourdun importées')
}

async function ensurePosts(payload: Payload, tenantID: number) {
  if (await countOf(payload, 'posts', tenantID)) return
  const { docs: cats } = await payload.find({ collection: 'categories', where: { and: [{ tenant: { equals: tenantID } }, { usage: { in: ['articles'] } }] }, limit: 1, ...base })
  for (const a of seedArticles) {
    const cover = a.b64 && a.mime ? await upload(payload, tenantID, { mime: a.mime, b64: a.b64, alt: a.titre }, `${a.id}.jpg`, false) : null
    const paragraphs = a.texte.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    await payload.create({
      collection: 'posts',
      data: {
        tenant: tenantID,
        title: a.titre,
        excerpt: paragraphs[0]?.slice(0, 200),
        content: rich(...paragraphs),
        category: cats[0]?.id,
        coverImage: cover?.id,
        _status: 'published',
        publishedAt: new Date(`${a.date}T12:00:00+01:00`).toISOString(),
      },
      ...base,
    })
  }
}
