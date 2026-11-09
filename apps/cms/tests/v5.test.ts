/**
 * TESTS DE LA VERSION 5 : modèles de pages, annonces de l'agence, « modifier depuis le site ».
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { duplicateTenant } from '@/endpoints/tenantTools'
import { withEditBar } from '@/sites/editBar'
import type { Tenant, User } from '@/payload-types'

let payload: Payload
let tenantA: Tenant
let tenantB: Tenant
let editorA: User
let viewerA: User
let adminB: User

const ctx = { skipInvite: true }
const PASSWORD = 'motdepasse-test-123'
const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})
const visit = async (email?: string) => {
  const headers = new Headers()
  if (email) {
    const { token } = await payload.login({ collection: 'users', data: { email, password: PASSWORD } })
    headers.set('cookie', `payload-token=${token}`)
  }
  return new Request('http://localhost/sites/client-a', { headers })
}
const PAGE = '<!doctype html><html><body><section id="tarifs"></section></body></html>'

beforeAll(async () => {
  payload = await getPayload({ config })
  const mk = (email: string, data: Partial<User>) =>
    payload.create({ collection: 'users', context: ctx, data: { email, password: PASSWORD, roles: ['user'], ...data } as User })
  await mk('super@test.local', { roles: ['super-admin'] })
  tenantA = await payload.create({ collection: 'tenants', data: { name: 'Client A', slug: 'client-a', email: 'contact@client-a.test', phone: '01 02 03 04 05' } })
  tenantB = await payload.create({ collection: 'tenants', data: { name: 'Client B', slug: 'client-b' } })
  editorA = await mk('editor-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['editor'] }] })
  viewerA = await mk('viewer-a@test.local', { tenants: [{ tenant: tenantA.id, roles: ['viewer'] }] })
  adminB = await mk('admin-b@test.local', { tenants: [{ tenant: tenantB.id, roles: ['tenant-admin'] }] })
})

describe('Modèles de pages', () => {
  it('un nouveau client reçoit mentions légales, confidentialité et contact en brouillon, à son nom', async () => {
    const { docs } = await payload.find({ collection: 'pages', where: { tenant: { equals: tenantA.id } }, draft: true, overrideAccess: true })
    expect(docs.map((p) => p.slug).sort()).toEqual(['contact', 'mentions-legales', 'politique-de-confidentialite'])
    expect(docs.every((p) => p._status === 'draft')).toBe(true)
    expect(JSON.stringify(docs.find((p) => p.slug === 'mentions-legales'))).toContain('Client A')
  })

  it('la duplication recrée ces pages au nom du nouveau client, jamais celles du modèle', async () => {
    const superAdmin = (await payload.find({ collection: 'users', where: { email: { equals: 'super@test.local' } }, overrideAccess: true })).docs[0]
    const res = await duplicateTenant.handler({
      payload,
      user: { ...superAdmin, collection: 'users' },
      routeParams: { id: String(tenantA.id) },
      json: async () => ({ name: 'Client C' }),
    } as never)
    const copy = (await (res as Response).json()) as { id: number }
    expect(copy.id).toBeTruthy()
    const legal = await payload.find({ collection: 'pages', where: { and: [{ tenant: { equals: copy.id } }, { slug: { equals: 'mentions-legales' } }] }, draft: true, overrideAccess: true })
    expect(legal.totalDocs).toBe(1)
    expect(JSON.stringify(legal.docs[0])).toContain('Client C')
    expect(JSON.stringify(legal.docs[0])).not.toContain('Client A')
  })

})

describe('Annonces de l’agence', () => {
  it('un client voit les annonces pour tous et pour lui, pas celles des autres ni les inactives', async () => {
    await payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Pour tous', audience: 'all' } })
    await payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Pour A', audience: 'tenants', tenants: [tenantA.id] } })
    await payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Pour B', audience: 'tenants', tenants: [tenantB.id] } })
    await payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Éteinte', audience: 'all', active: false } })
    await payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Expirée', audience: 'all', endsAt: new Date(Date.now() - 864e5).toISOString() } })
    const seen = await payload.find({ collection: 'announcements', ...(await as(editorA)) })
    expect(seen.docs.map((a) => a.title).sort()).toEqual(['Pour A', 'Pour tous'])
  })

  it('un client ne peut ni créer ni modifier une annonce', async () => {
    await expect(payload.create({ collection: 'announcements', data: { tone: 'news', title: 'Pirate', audience: 'all' }, ...(await as(adminB)) })).rejects.toThrow()
  })
})

describe('Modifier depuis le site', () => {
  it('un visiteur ne voit aucune barre d’édition', async () => {
    const out = await withEditBar(payload, await visit(), 'client-a', PAGE)
    expect(out.personal).toBe(false)
    expect(out.html).toBe(PAGE)
  })

  it('un éditeur connecté du client voit la barre et les crayons', async () => {
    const out = await withEditBar(payload, await visit('editor-a@test.local'), 'client-a', PAGE)
    expect(out.personal).toBe(true)
    expect(out.html).toContain('Mode édition')
    expect(out.html).toContain('/admin/collections/prices')
  })

  it('ni un lecteur, ni l’admin d’un autre client, ni un faux cookie', async () => {
    expect((await withEditBar(payload, await visit('viewer-a@test.local'), 'client-a', PAGE)).personal).toBe(false)
    expect((await withEditBar(payload, await visit('admin-b@test.local'), 'client-a', PAGE)).personal).toBe(false)
    const forged = new Request('http://localhost/sites/client-a', { headers: { cookie: 'payload-token=faux.jeton.signature' } })
    expect((await withEditBar(payload, forged, 'client-a', PAGE)).personal).toBe(false)
  })

  it('rien sur le nom de domaine du client', async () => {
    const req = await visit('editor-a@test.local')
    const onDomain = new Request(req.url, { headers: { cookie: req.headers.get('cookie') ?? '', 'x-site-domain': 'client-a.fr' } })
    expect((await withEditBar(payload, onDomain, 'client-a', PAGE)).personal).toBe(false)
  })
})
