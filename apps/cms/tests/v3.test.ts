/**
 * TESTS DE LA VERSION 3 : suppression et archivage des clients, rôles rédacteur et lecteur,
 * publication programmée, thème générique, aperçu des brouillons, redirections, sitemap,
 * statistiques, export et duplication de client.
 */
import config from '@payload-config'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { normalizePath } from '@/collections/Redirects'
import { duplicateTenant, exportTenant } from '@/endpoints/tenantTools'
import { findRedirect } from '@/sites/http'
import { renderPage, renderPost, renderSite, siteURLs } from '@/sites/render'
import { recordVisit, sourceOf, statsSummary } from '@/sites/stats'
import type { Tenant, User } from '@/payload-types'

let payload: Payload
let shop: Tenant
let superAdmin: User
let writer: User
let viewer: User
let editor: User

const ctx = { skipInvite: true }
const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})
const mk = (email: string, data: Partial<User>) =>
  payload.create({ collection: 'users', context: ctx, data: { email, password: 'motdepasse-test-123', roles: ['user'], ...data } as User })
const rich = (text: string) => ({
  root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [{ type: 'paragraph', version: 1, direction: null, format: '', indent: 0, textFormat: 0, children: [{ type: 'text', version: 1, text, format: 0, detail: 0, mode: 'normal', style: '' }] }] },
})
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(async () => {
  payload = await getPayload({ config })
  superAdmin = await mk('super3@test.local', { roles: ['super-admin'] })
  shop = await payload.create({
    collection: 'tenants',
    data: { name: 'Boulangerie Lumière', slug: 'boulangerie-lumiere', tagline: 'Pain au levain depuis 1987', phone: '01 23 45 67 89', theme: { primaryColor: '#7A2E1F', secondaryColor: '#F4C95D', font: 'playfair' } },
  })
  writer = await mk('writer@test.local', { tenants: [{ tenant: shop.id, roles: ['writer'] }] })
  viewer = await mk('viewer@test.local', { tenants: [{ tenant: shop.id, roles: ['viewer'] }] })
  editor = await mk('editor3@test.local', { tenants: [{ tenant: shop.id, roles: ['editor'] }] })
  await payload.create({ collection: 'services', data: { tenant: shop.id, title: 'Commandes de gâteaux', summary: 'Pièces montées et entremets sur commande.' } })
  await payload.create({ collection: 'prices', data: { tenant: shop.id, name: 'Baguette tradition', price: 1.3 } })
})

describe('Rôles rédacteur et lecteur', () => {
  it('le rédacteur enregistre un brouillon mais ne peut pas publier', async () => {
    const draft = await payload.create({ collection: 'posts', data: { title: 'Nouveau pain', _status: 'draft' }, draft: true, ...(await as(writer)) })
    expect(draft._status).toBe('draft')
    await expect(
      payload.update({ collection: 'posts', id: draft.id, data: { _status: 'published' }, ...(await as(writer)) }),
    ).rejects.toThrow(/rédacteur/)
    await expect(payload.delete({ collection: 'posts', id: draft.id, ...(await as(writer)) })).rejects.toThrow()
    const pub = await payload.update({ collection: 'posts', id: draft.id, data: { _status: 'published' }, ...(await as(editor)) })
    expect(pub._status).toBe('published')
  })

  it('le lecteur consulte mais ne modifie rien', async () => {
    const list = await payload.find({ collection: 'prices', ...(await as(viewer)) })
    expect(list.totalDocs).toBe(1)
    await expect(payload.create({ collection: 'prices', data: { name: 'Croissant', price: 1.1 }, ...(await as(viewer)) })).rejects.toThrow()
    await expect(payload.update({ collection: 'prices', id: list.docs[0].id, data: { price: 9 }, ...(await as(viewer)) })).rejects.toThrow()
  })

  it('le lecteur peut quand même contacter l’agence', async () => {
    const req = await payload.create({ collection: 'support-requests', data: { subject: 'Question', message: 'Bonjour', type: 'question' } as never, ...(await as(viewer)) })
    expect(req.id).toBeTruthy()
  })
})

describe('Thème générique et publication programmée', () => {
  it('un client sans maquette a un site composé de ses contenus, à ses couleurs', async () => {
    const html = (await renderSite(payload, 'boulangerie-lumiere'))!
    expect(html).toContain('Boulangerie Lumière')
    expect(html).toContain('Pain au levain depuis 1987')
    expect(html).toContain('Commandes de gâteaux')
    expect(html).toContain('Baguette tradition')
    expect(html).toContain('--brand:#7A2E1F')
    expect(html).toContain('Playfair+Display')
    expect(html).toContain('"@type":"LocalBusiness"')
    expect(html).toContain('noindex')
  })

  it('un article à date future reste caché jusqu’à cette date', async () => {
    const future = new Date(Date.now() + 7 * 864e5).toISOString()
    await payload.create({ collection: 'posts', data: { tenant: shop.id, title: 'Galette des rois', slug: 'galette', excerpt: 'Bientôt', _status: 'published', publishedAt: future } })
    await payload.create({ collection: 'posts', data: { tenant: shop.id, title: 'Pain de Noël', slug: 'pain-de-noel', excerpt: 'Déjà là', content: rich('Recette du pain de Noël') as never, _status: 'published' } })
    const html = (await renderSite(payload, 'boulangerie-lumiere'))!
    expect(html).toContain('Pain de Noël')
    expect(html).not.toContain('Galette des rois')
    expect(await renderPost(payload, 'boulangerie-lumiere', 'galette')).toBeNull()
    const post = (await renderPost(payload, 'boulangerie-lumiere', 'pain-de-noel'))!
    expect(post).toContain('Recette du pain de Noël')
  })

  it('la page « accueil » remplace l’accueil automatique', async () => {
    await payload.create({
      collection: 'pages',
      data: { tenant: shop.id, title: 'Accueil', slug: 'accueil', _status: 'published', layout: [{ blockType: 'heading', text: 'Bienvenue au fournil' }] } as never,
    })
    const html = (await renderSite(payload, 'boulangerie-lumiere'))!
    expect(html).toContain('Bienvenue au fournil')
    expect(html).not.toContain('Commandes de gâteaux')
  })

  it('« visible sur Google » retire le noindex', async () => {
    await payload.update({ collection: 'tenants', id: shop.id, data: { indexable: true } })
    expect(await renderSite(payload, 'boulangerie-lumiere')).not.toContain('noindex')
    await payload.update({ collection: 'tenants', id: shop.id, data: { indexable: false } })
  })

  it('les liens n’ont pas de préfixe sur le domaine du client', async () => {
    const html = (await renderSite(payload, 'boulangerie-lumiere', { base: '' }))!
    expect(html).not.toContain('/sites/boulangerie-lumiere')
  })
})

describe('Aperçu, redirections, sitemap', () => {
  it('un brouillon n’est visible qu’en aperçu', async () => {
    const page = await payload.create({
      collection: 'pages',
      data: { tenant: shop.id, title: 'Nos horaires', slug: 'horaires', _status: 'draft', layout: [{ blockType: 'heading', text: 'Ouvert le dimanche' }] } as never,
      draft: true,
    })
    expect(await renderPage(payload, 'boulangerie-lumiere', 'horaires')).toBeNull()
    expect(await renderPage(payload, 'boulangerie-lumiere', '', { draftID: page.id })).toContain('Ouvert le dimanche')
    // Un brouillon d'un autre client n'est jamais affiché sur ce site
    const other = await payload.create({ collection: 'tenants', data: { name: 'Autre', slug: 'autre-client' } })
    expect(await renderPage(payload, 'autre-client', '', { draftID: page.id })).toBeNull()
    await payload.delete({ collection: 'tenants', id: other.id })
  })

  it('une ancienne adresse redirige vers la nouvelle', async () => {
    expect(normalizePath('https://www.ancien-site.fr/Nos-Tarifs/')).toBe('/nos-tarifs')
    await payload.create({ collection: 'redirects', data: { tenant: shop.id, from: '/Nos-Tarifs/', to: '/#tarifs', type: '301' } })
    const res = (await findRedirect(payload, 'boulangerie-lumiere', '/nos-tarifs', {}))!
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/sites/boulangerie-lumiere/#tarifs')
    const onDomain = (await findRedirect(payload, 'boulangerie-lumiere', '/nos-tarifs', { base: '' }))!
    expect(onDomain.headers.get('location')).toBe('/#tarifs')
    expect(await findRedirect(payload, 'boulangerie-lumiere', '/inconnue', {})).toBeNull()
  })

  it('le sitemap liste l’accueil, les pages et articles publiés uniquement', async () => {
    const data = (await siteURLs(payload, 'boulangerie-lumiere'))!
    const paths = data.paths.map((p) => p.path)
    expect(paths).toContain('')
    expect(paths).toContain('/blog/pain-de-noel')
    expect(paths).not.toContain('/blog/galette')
    expect(paths).not.toContain('/horaires')
  })
})

describe('Statistiques sans cookie', () => {
  const visit = (headers: Record<string, string>) => new Request('https://x.test/sites/boulangerie-lumiere', { headers })

  it('compte les vraies visites, ignore robots et personnes connectées', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'
    recordVisit(payload, visit({ 'user-agent': ua, referer: 'https://www.google.fr/' }), 'boulangerie-lumiere', '/')
    await wait(300)
    recordVisit(payload, visit({ 'user-agent': ua }), 'boulangerie-lumiere', '/')
    recordVisit(payload, visit({ 'user-agent': 'Googlebot/2.1' }), 'boulangerie-lumiere', '/')
    recordVisit(payload, visit({ 'user-agent': ua, cookie: 'payload-token=abc' }), 'boulangerie-lumiere', '/')
    recordVisit(payload, visit({ 'user-agent': ua, referer: 'https://x.test/admin' }), 'boulangerie-lumiere', '/')
    await wait(500)
    const s = await statsSummary(payload, [shop.id])
    expect(s.total).toBe(2)
    expect(s.sources.map(([k]) => k).sort()).toEqual(['Google', 'direct'])
    expect(sourceOf('https://l.facebook.com/x', 'site.fr')).toBe('Facebook')
  })

  it('un client ne lit pas les statistiques d’un autre', async () => {
    const res = await payload.find({ collection: 'site-stats', ...(await as(viewer)) })
    expect(res.docs.every((d) => (typeof d.tenant === 'object' ? d.tenant?.id : d.tenant) === shop.id)).toBe(true)
    await expect(payload.create({ collection: 'site-stats', data: { day: '2026-01-01', path: '/', views: 999 } as never, ...(await as(viewer)) })).rejects.toThrow()
  })
})

describe('Export, duplication, suppression et archivage', () => {
  const agencyReq = async (id: number, body?: unknown) => {
    const req = await createLocalReq({ user: { ...(await payload.findByID({ collection: 'users', id: superAdmin.id })), collection: 'users' } as never }, payload)
    req.routeParams = { id: String(id) }
    req.json = async () => body
    return req
  }

  it('exporte toutes les données du client sans mots de passe', async () => {
    const res = await exportTenant.handler(await agencyReq(shop.id))
    const data = await res.json()
    expect(data.tenant.slug).toBe('boulangerie-lumiere')
    expect(data.prices).toHaveLength(1)
    expect(JSON.stringify(data.users)).not.toMatch(/hash|salt|password/i)
  })

  it('refuse l’export à un client', async () => {
    const req = await agencyReq(shop.id)
    req.user = { ...(await payload.findByID({ collection: 'users', id: editor.id })), collection: 'users' } as never
    await expect(exportTenant.handler(req)).rejects.toThrow()
  })

  it('duplique la structure (pages en brouillon, sans photos ni articles)', async () => {
    const res = await duplicateTenant.handler(await agencyReq(shop.id, { name: 'Boulangerie Soleil' }))
    const { id, slug } = await res.json()
    expect(slug).toBe('boulangerie-soleil')
    const count = async (collection: 'pages' | 'posts' | 'services' | 'categories') =>
      (await payload.count({ collection, where: { tenant: { equals: id } } })).totalDocs
    expect(await count('services')).toBe(1)
    expect(await count('pages')).toBeGreaterThan(0)
    expect(await count('posts')).toBe(0)
    const original = (await payload.count({ collection: 'categories', where: { tenant: { equals: shop.id } } })).totalDocs
    expect(await count('categories')).toBe(original)
  })

  it('un client archivé : site hors ligne et connexion refusée', async () => {
    await payload.update({ collection: 'tenants', id: shop.id, data: { status: 'archived' } })
    expect(await renderSite(payload, 'boulangerie-lumiere')).toBeNull()
    await expect(payload.login({ collection: 'users', data: { email: 'writer@test.local', password: 'motdepasse-test-123' } })).rejects.toThrow()
    await payload.update({ collection: 'tenants', id: shop.id, data: { status: 'active' } })
  })

  it('supprimer un client supprime tous ses contenus et ses comptes', async () => {
    const shared = await mk('shared3@test.local', {
      tenants: [
        { tenant: shop.id, roles: ['editor'] },
        { tenant: (await payload.find({ collection: 'tenants', where: { slug: { equals: 'boulangerie-soleil' } } })).docs[0].id, roles: ['editor'] },
      ],
    })
    await payload.delete({ collection: 'tenants', id: shop.id })
    for (const collection of ['prices', 'services', 'posts', 'pages', 'redirects', 'categories', 'site-stats', 'support-requests'] as const) {
      const left = await payload.count({ collection, where: { or: [{ tenant: { equals: shop.id } }, { tenant: { exists: false } }] } })
      expect(left.totalDocs, collection).toBe(0)
    }
    expect(await payload.findByID({ collection: 'users', id: writer.id, disableErrors: true })).toBeNull()
    const kept = await payload.findByID({ collection: 'users', id: shared.id })
    expect(kept.tenants).toHaveLength(1)
  })
})
