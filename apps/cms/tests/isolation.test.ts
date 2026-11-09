/**
 * TESTS D'ISOLATION ENTRE CLIENTS
 *
 * Deux clients, A et B. On vérifie qu'un utilisateur de A ne peut JAMAIS lire,
 * créer, modifier ou supprimer quoi que ce soit chez B, même en envoyant
 * volontairement l'identifiant de B dans ses requêtes.
 *
 * Les appels passent par l'API de Payload avec `overrideAccess: false` et l'utilisateur
 * connecté : ce sont exactement les mêmes règles que pour les appels REST et GraphQL.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'

import type { Price, Tenant, User } from '@/payload-types'

let payload: Payload
let tenantA: Tenant
let tenantB: Tenant
let superAdmin: User
let adminA: User
let editorA: User
let adminB: User
let shared: User // membre de A (éditeur) ET de B (éditeur)
let priceA: Price
let priceB: Price

const ctx = { skipInvite: true }

/** Recharge un utilisateur tel qu'il serait connecté (avec ses clients et rôles). */
const asUser = async (user: User): Promise<User & { collection: 'users' }> => ({
  ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })),
  collection: 'users',
})

const as = async (user: User) => ({ user: await asUser(user), overrideAccess: false as const })

const pngFile = async (name = 'photo.png') => {
  const data = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ff0000' } }).png().toBuffer()
  return { data, mimetype: 'image/png', name, size: data.length }
}

beforeAll(async () => {
  payload = await getPayload({ config })

  tenantA = await payload.create({ collection: 'tenants', data: { name: 'Client A', slug: 'client-a' } })
  tenantB = await payload.create({ collection: 'tenants', data: { name: 'Client B', slug: 'client-b' } })

  const mk = (email: string, data: Partial<User>) =>
    payload.create({ collection: 'users', context: ctx, data: { email, password: 'motdepasse-test-123', roles: ['user'], ...data } as User })

  superAdmin = await mk('super@test.local', { roles: ['super-admin'] })
  adminA = await mk('admin-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['tenant-admin'] }] })
  editorA = await mk('editor-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['editor'] }] })
  adminB = await mk('admin-b@test.local', { tenants: [{ tenant: tenantB.id, roles: ['tenant-admin'] }] })
  shared = await mk('shared@test.local', {
    tenants: [
      { tenant: tenantA.id, roles: ['editor'] },
      { tenant: tenantB.id, roles: ['editor'] },
    ],
  })

  priceA = await payload.create({ collection: 'prices', data: { tenant: tenantA.id, name: 'Tarif A', price: 10 } })
  priceB = await payload.create({ collection: 'prices', data: { tenant: tenantB.id, name: 'Tarif B', price: 20 } })
  await payload.create({ collection: 'site-info', data: { tenant: tenantB.id, phone: '0600000000' } })
})

describe('Lecture', () => {
  it('un visiteur non connecté ne lit rien', async () => {
    await expect(payload.find({ collection: 'prices', overrideAccess: false })).rejects.toThrow()
  })

  it("l'admin A ne voit que les tarifs de A", async () => {
    const res = await payload.find({ collection: 'prices', ...(await as(adminA)) })
    expect(res.docs.map((d) => d.id)).toEqual([priceA.id])
  })

  it("l'admin A ne peut pas lire un tarif de B par son identifiant", async () => {
    await expect(payload.findByID({ collection: 'prices', id: priceB.id, ...(await as(adminA)) })).rejects.toThrow()
  })

  it("un filtre forcé sur le client B ne renvoie rien à l'admin A", async () => {
    const res = await payload.find({
      collection: 'prices',
      where: { tenant: { equals: tenantB.id } },
      ...(await as(adminA)),
    })
    expect(res.docs).toHaveLength(0)
  })

  it("l'admin A ne voit pas les informations pratiques de B", async () => {
    const res = await payload.find({ collection: 'site-info', ...(await as(adminA)) })
    expect(res.docs.every((d) => (typeof d.tenant === 'object' ? d.tenant?.id : d.tenant) === tenantA.id)).toBe(true)
  })

  it("l'admin A ne voit que son entreprise dans la liste des clients", async () => {
    const res = await payload.find({ collection: 'tenants', ...(await as(adminA)) })
    expect(res.docs.map((d) => d.id)).toEqual([tenantA.id])
  })

  it('le super admin voit tout', async () => {
    const res = await payload.find({ collection: 'prices', ...(await as(superAdmin)) })
    expect(res.docs.map((d) => d.id).sort()).toEqual([priceA.id, priceB.id].sort())
  })

  it("un membre de A et B voit les deux, et rien d'autre", async () => {
    const res = await payload.find({ collection: 'prices', ...(await as(shared)) })
    expect(res.docs.map((d) => d.id).sort()).toEqual([priceA.id, priceB.id].sort())
  })
})

describe('Écriture', () => {
  it("l'admin A ne peut pas créer un tarif chez B en envoyant tenant = B", async () => {
    await expect(
      payload.create({ collection: 'prices', data: { tenant: tenantB.id, name: 'Intrus', price: 1 }, ...(await as(adminA)) }),
    ).rejects.toThrow()
    const count = await payload.count({ collection: 'prices', where: { name: { equals: 'Intrus' } } })
    expect(count.totalDocs).toBe(0)
  })

  it("sans client précisé, le tarif est rattaché automatiquement au client de l'utilisateur", async () => {
    const doc = await payload.create({
      collection: 'prices',
      data: { name: 'Auto', price: 5 } as Price,
      ...(await as(adminA)),
    })
    const tenantID = typeof doc.tenant === 'object' ? doc.tenant?.id : doc.tenant
    expect(tenantID).toBe(tenantA.id)
  })

  it("l'admin A ne peut pas modifier un tarif de B", async () => {
    await expect(
      payload.update({ collection: 'prices', id: priceB.id, data: { price: 0 }, ...(await as(adminA)) }),
    ).rejects.toThrow()
    const fresh = await payload.findByID({ collection: 'prices', id: priceB.id })
    expect(fresh.price).toBe(20)
  })

  it("l'admin A ne peut pas modifier en masse les tarifs de B", async () => {
    const res = await payload.update({
      collection: 'prices',
      where: { tenant: { equals: tenantB.id } },
      data: { price: 0 },
      ...(await as(adminA)),
    })
    expect(res.docs).toHaveLength(0)
    const fresh = await payload.findByID({ collection: 'prices', id: priceB.id })
    expect(fresh.price).toBe(20)
  })

  it("l'admin A ne peut pas supprimer un tarif de B", async () => {
    await expect(payload.delete({ collection: 'prices', id: priceB.id, ...(await as(adminA)) })).rejects.toThrow()
    await expect(payload.findByID({ collection: 'prices', id: priceB.id })).resolves.toBeTruthy()
  })

  it("l'admin A ne peut pas déplacer son propre tarif vers B", async () => {
    await expect(
      payload.update({ collection: 'prices', id: priceA.id, data: { tenant: tenantB.id }, ...(await as(adminA)) }),
    ).rejects.toThrow()
    const fresh = await payload.findByID({ collection: 'prices', id: priceA.id, depth: 0 })
    expect(fresh.tenant).toBe(tenantA.id)
  })

  it("l'éditeur ne peut pas créer de page (réservé à l'admin client) mais peut écrire un article", async () => {
    await expect(
      payload.create({ collection: 'pages', data: { title: 'Page', tenant: tenantA.id }, ...(await as(editorA)) }),
    ).rejects.toThrow()
    const post = await payload.create({
      collection: 'posts',
      data: { title: 'Mon premier article', tenant: tenantA.id },
      ...(await as(editorA)),
    })
    expect(post.slug).toBe('mon-premier-article')
  })

  it('deux clients peuvent avoir la même adresse de page, mais pas deux fois chez le même client', async () => {
    const a = await payload.create({ collection: 'pages', data: { title: 'Accès', tenant: tenantA.id }, ...(await as(adminA)) })
    const b = await payload.create({ collection: 'pages', data: { title: 'Accès', tenant: tenantB.id }, ...(await as(adminB)) })
    expect(a.slug).toBe('acces')
    expect(b.slug).toBe('acces')
    // Chez le même client : une nouvelle page reçoit une adresse libre, une modification en double est refusée
    const again = await payload.create({ collection: 'pages', data: { title: 'Accès', tenant: tenantA.id }, ...(await as(adminA)) })
    expect(again.slug).toBe('acces-copie')
    await expect(payload.update({ collection: 'pages', id: again.id, data: { slug: 'acces' }, ...(await as(adminA)) })).rejects.toThrow()
  })
})

describe('Fiche client', () => {
  it("l'admin A ne peut pas modifier la fiche de B", async () => {
    await expect(
      payload.update({ collection: 'tenants', id: tenantB.id, data: { name: 'Piraté' }, ...(await as(adminA)) }),
    ).rejects.toThrow()
  })

  it("l'admin A modifie son téléphone mais pas son statut ni ses domaines", async () => {
    await payload.update({
      collection: 'tenants',
      id: tenantA.id,
      data: { phone: '0102030405', status: 'suspended', domains: [{ domain: 'pirate.example' }] },
      ...(await as(adminA)),
    })
    const fresh = await payload.findByID({ collection: 'tenants', id: tenantA.id })
    expect(fresh.phone).toBe('0102030405')
    expect(fresh.status).toBe('active')
    expect(fresh.domains ?? []).toHaveLength(0)
  })

  it("l'éditeur A ne peut pas modifier la fiche de son entreprise", async () => {
    await expect(
      payload.update({ collection: 'tenants', id: tenantA.id, data: { phone: '0000' }, ...(await as(editorA)) }),
    ).rejects.toThrow()
  })

  it('seul le super admin crée un client', async () => {
    await expect(
      payload.create({ collection: 'tenants', data: { name: 'X', slug: 'x' }, ...(await as(adminA)) }),
    ).rejects.toThrow()
  })
})

describe('Utilisateurs', () => {
  it("l'admin A ne voit pas les utilisateurs de B", async () => {
    const res = await payload.find({ collection: 'users', limit: 100, ...(await as(adminA)) })
    const emails = res.docs.map((u) => u.email)
    expect(emails).not.toContain('admin-b@test.local')
    expect(emails).not.toContain('super@test.local')
    expect(emails).toContain('editor-a@test.local')
  })

  it("l'éditeur A ne voit que lui-même", async () => {
    const res = await payload.find({ collection: 'users', ...(await as(editorA)) })
    expect(res.docs.map((u) => u.email)).toEqual(['editor-a@test.local'])
  })

  it("l'admin A ne peut pas créer un utilisateur chez B", async () => {
    await expect(
      payload.create({
        collection: 'users',
        context: ctx,
        data: { email: 'intrus@test.local', password: 'xxxxxxxxxx1', tenants: [{ tenant: tenantB.id, roles: ['tenant-admin'] }] } as User,
        ...(await as(adminA)),
      }),
    ).rejects.toThrow()
  })

  it("l'admin A ne peut pas créer de super administrateur", async () => {
    const created = await payload
      .create({
        collection: 'users',
        context: ctx,
        data: { email: 'faux-super@test.local', password: 'xxxxxxxxxx1', roles: ['super-admin'], tenants: [{ tenant: tenantA.id, roles: ['editor'] }] } as User,
        ...(await as(adminA)),
      })
      .catch(() => null)
    if (created) expect(created.roles).not.toContain('super-admin')
  })

  it("l'admin A ne peut pas s'ajouter au client B", async () => {
    await expect(
      payload.update({
        collection: 'users',
        id: adminA.id,
        data: { tenants: [{ tenant: tenantA.id, roles: ['tenant-admin'] }, { tenant: tenantB.id, roles: ['tenant-admin'] }] },
        ...(await as(adminA)),
      }),
    ).rejects.toThrow()
  })

  it("l'éditeur A ne peut pas se promouvoir administrateur", async () => {
    await payload
      .update({
        collection: 'users',
        id: editorA.id,
        data: { tenants: [{ tenant: tenantA.id, roles: ['tenant-admin'] }] },
        ...(await as(editorA)),
      })
      .catch(() => null)
    const fresh = await payload.findByID({ collection: 'users', id: editorA.id, depth: 0 })
    expect(fresh.tenants?.[0]?.roles).toEqual(['editor'])
  })

  it("quand l'admin A modifie un membre partagé, son appartenance à B est conservée", async () => {
    await payload.update({
      collection: 'users',
      id: shared.id,
      data: { tenants: [{ tenant: tenantA.id, roles: ['tenant-admin'] }] },
      ...(await as(adminA)),
    })
    const fresh = await payload.findByID({ collection: 'users', id: shared.id, depth: 0 })
    const byTenant = Object.fromEntries((fresh.tenants ?? []).map((t) => [t.tenant as number, t.roles]))
    expect(byTenant[tenantA.id]).toEqual(['tenant-admin'])
    expect(byTenant[tenantB.id]).toEqual(['editor'])
  })

  it("l'admin A ne peut pas supprimer l'admin B", async () => {
    await expect(payload.delete({ collection: 'users', id: adminB.id, ...(await as(adminA)) })).rejects.toThrow()
  })
})

describe('Médias', () => {
  it("le nom du fichier est remplacé par un nom aléatoire, et B ne peut pas lire l'image de A", async () => {
    const media = await payload.create({
      collection: 'media',
      data: { alt: 'Photo', tenant: tenantA.id },
      file: await pngFile('ma-boutique.png'),
      ...(await as(adminA)),
    })
    expect(media.filename).not.toContain('ma-boutique')
    expect(media.filename).toMatch(/^[0-9a-f-]{36}\.png$/)
    await expect(payload.findByID({ collection: 'media', id: media.id, ...(await as(adminB)) })).rejects.toThrow()
  })
})

describe('Support et journal', () => {
  it("une demande de support est rattachée au client et invisible pour B", async () => {
    const req = await payload.create({
      collection: 'support-requests',
      data: { type: 'bug', subject: 'Bug galerie', message: 'Les photos ne chargent pas' } as never,
      ...(await as(adminA)),
    })
    const tenantID = typeof req.tenant === 'object' ? req.tenant?.id : req.tenant
    expect(tenantID).toBe(tenantA.id)
    await expect(payload.findByID({ collection: 'support-requests', id: req.id, ...(await as(adminB)) })).rejects.toThrow()
    await expect(
      payload.update({ collection: 'support-requests', id: req.id, data: { status: 'resolved' }, ...(await as(adminA)) }),
    ).rejects.toThrow()
  })

  it('le journal enregistre les modifications et seul le super admin le lit', async () => {
    await expect(payload.find({ collection: 'audit-logs', ...(await as(adminA)) })).rejects.toThrow()
    const logs = await payload.find({ collection: 'audit-logs', ...(await as(superAdmin)), where: { targetCollection: { equals: 'prices' } } })
    expect(logs.totalDocs).toBeGreaterThan(0)
  })
})
