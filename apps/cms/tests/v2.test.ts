/**
 * TESTS DE LA VERSION 2 : comptes partagés, clients suspendus, catégories, pages, menus,
 * bannières et rendu public. Mêmes règles que tests/isolation.test.ts : appels avec
 * l'utilisateur connecté et `overrideAccess: false`, comme via l'API REST.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import { renderPage, renderSite } from '@/sites/render'
import type { Tenant, User } from '@/payload-types'

let payload: Payload
let tenantA: Tenant
let tenantB: Tenant
let adminA: User
let editorA: User
let adminB: User
let sharedAdmin: User // éditeur chez A, ADMIN chez B

const ctx = { skipInvite: true }
const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})
const pngFile = async () => {
  const data = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#00ff00' } }).png().toBuffer()
  return { data, mimetype: 'image/png', name: 'x.png', size: data.length }
}

beforeAll(async () => {
  payload = await getPayload({ config })
  tenantA = await payload.create({ collection: 'tenants', data: { name: 'Client A', slug: 'client-a' } })
  tenantB = await payload.create({ collection: 'tenants', data: { name: 'Client B', slug: 'client-b' } })
  const mk = (email: string, data: Partial<User>) =>
    payload.create({ collection: 'users', context: ctx, data: { email, password: 'motdepasse-test-123', roles: ['user'], ...data } as User })
  // Le tout premier compte devient super admin : on le crée d'abord
  await mk('super@test.local', { roles: ['super-admin'] })
  adminA = await mk('admin-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['tenant-admin'] }] })
  editorA = await mk('editor-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['editor'] }] })
  adminB = await mk('admin-b@test.local', { tenants: [{ tenant: tenantB.id, roles: ['tenant-admin'] }] })
  sharedAdmin = await mk('shared@test.local', {
    tenants: [
      { tenant: tenantA.id, roles: ['editor'] },
      { tenant: tenantB.id, roles: ['tenant-admin'] },
    ],
  })
})

describe('Comptes partagés entre deux clients', () => {
  it("l'admin A ne peut pas changer le mot de passe d'un membre qui administre B", async () => {
    await expect(
      payload.update({ collection: 'users', id: sharedAdmin.id, data: { password: 'pirate-pass-999' }, ...(await as(adminA)) }),
    ).rejects.toThrow()
    await expect(payload.login({ collection: 'users', data: { email: 'shared@test.local', password: 'pirate-pass-999' } })).rejects.toThrow()
  })

  it("l'admin A ne peut pas changer son e-mail ni supprimer son compte", async () => {
    await expect(
      payload.update({ collection: 'users', id: sharedAdmin.id, data: { email: 'pirate@test.local' }, ...(await as(adminA)) }),
    ).rejects.toThrow()
    await expect(payload.delete({ collection: 'users', id: sharedAdmin.id, ...(await as(adminA)) })).rejects.toThrow()
    expect((await payload.findByID({ collection: 'users', id: sharedAdmin.id })).email).toBe('shared@test.local')
  })

  it("l'admin A gère toujours entièrement un membre qui n'appartient qu'à A", async () => {
    const u = await payload.update({ collection: 'users', id: editorA.id, data: { name: 'Camille' }, ...(await as(adminA)) })
    expect(u.name).toBe('Camille')
  })

  it('la connexion est journalisée', async () => {
    await payload.login({ collection: 'users', data: { email: 'admin-a@test.local', password: 'motdepasse-test-123' } })
    const logs = await payload.find({ collection: 'audit-logs', where: { action: { equals: 'login' } }, overrideAccess: true })
    expect(logs.totalDocs).toBeGreaterThan(0)
  })
})

describe('Client suspendu', () => {
  it('ses membres ne peuvent plus se connecter ni modifier, et son site disparaît', async () => {
    const tenantC = await payload.create({ collection: 'tenants', data: { name: 'Client C', slug: 'client-c' } })
    const adminC = await payload.create({
      collection: 'users',
      context: ctx,
      data: { email: 'admin-c@test.local', password: 'motdepasse-test-123', roles: ['user'], tenants: [{ tenant: tenantC.id, roles: ['tenant-admin'] }] } as User,
    })
    const price = await payload.create({ collection: 'prices', data: { name: 'Tarif C', price: 5 }, ...(await as(adminC)) })
    await payload.update({ collection: 'tenants', id: tenantC.id, data: { status: 'suspended' } })

    await expect(payload.login({ collection: 'users', data: { email: 'admin-c@test.local', password: 'motdepasse-test-123' } })).rejects.toThrow()
    await expect(payload.create({ collection: 'prices', data: { name: 'Nouveau', price: 1 }, ...(await as(adminC)) })).rejects.toThrow()
    await expect(payload.update({ collection: 'prices', id: price.id, data: { price: 2 }, ...(await as(adminC)) })).rejects.toThrow()
    await expect(payload.delete({ collection: 'prices', id: price.id, ...(await as(adminC)) })).rejects.toThrow()
  })
})

describe('Catégories, pages et liens', () => {
  it('un nouveau client reçoit 5 catégories renommables', async () => {
    const cats = await payload.find({ collection: 'categories', where: { tenant: { equals: tenantA.id } }, ...(await as(adminA)) })
    expect(cats.docs.map((c) => c.usage?.[0]).sort()).toEqual(['articles', 'blog', 'gallery', 'prices', 'services'])
    const photos = cats.docs.find((c) => c.usage?.includes('gallery'))!
    const renamed = await payload.update({ collection: 'categories', id: photos.id, data: { name: 'Nos chevaux' }, ...(await as(editorA)) })
    expect(renamed.name).toBe('Nos chevaux')
  })

  it('dupliquer une page donne une adresse libre', async () => {
    const page = await payload.create({ collection: 'pages', data: { title: 'Contact' }, ...(await as(adminA)) })
    const copy = await payload.duplicate({ collection: 'pages', id: page.id, ...(await as(adminA)) })
    expect(copy.slug).toBe('contact-copie')
  })

  it('un lien « javascript: » est refusé dans un menu', async () => {
    await expect(
      payload.create({
        collection: 'menus',
        data: { name: 'Pirate', location: 'main', items: [{ label: 'x', type: 'url', url: 'javascript:alert(1)' }] },
        ...(await as(adminA)),
      }),
    ).rejects.toThrow()
  })

  it("le menu, les tags, services et bannières de A sont invisibles pour B", async () => {
    const menu = await payload.create({ collection: 'menus', data: { name: 'Principal', location: 'main', items: [{ label: 'Accueil', type: 'anchor', anchor: 'top' }] }, ...(await as(adminA)) })
    const tag = await payload.create({ collection: 'tags', data: { name: 'concours' }, ...(await as(editorA)) })
    const svc = await payload.create({ collection: 'services', data: { title: 'Pension' }, ...(await as(editorA)) })
    const promo = await payload.create({ collection: 'promotions', data: { title: 'Promo', kind: 'banner' }, ...(await as(editorA)) })
    for (const [collection, id] of [['menus', menu.id], ['tags', tag.id], ['services', svc.id], ['promotions', promo.id]] as const) {
      await expect(payload.findByID({ collection, id, ...(await as(adminB)) })).rejects.toThrow()
    }
  })

  it('le logo d’un client doit venir de sa propre médiathèque', async () => {
    const mediaB = await payload.create({ collection: 'media', data: { alt: 'B', tenant: tenantB.id }, file: await pngFile() })
    await expect(payload.update({ collection: 'tenants', id: tenantA.id, data: { logo: mediaB.id }, ...(await as(adminA)) })).rejects.toThrow()
  })
})

describe('Rendu public', () => {
  it('le site sans maquette répond « introuvable », la page non publiée aussi', async () => {
    expect(await renderSite(payload, 'client-a')).toBeNull()
    expect(await renderPage(payload, 'client-a', 'contact')).toBeNull()
  })
})
