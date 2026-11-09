/**
 * TESTS DE L'INTERFACE V4 : corbeille, ordre par glisser-déposer, mode maintenance,
 * notifications, réponse de l'agence.
 */
import config from '@payload-config'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { notifications } from '@/endpoints/notifications'
import { purgeTrash } from '@/lib/trashPurge'
import { renderSite } from '@/sites/render'
import type { Tenant, User } from '@/payload-types'

let payload: Payload
let shop: Tenant
let superAdmin: User
let editor: User
let other: User

const ctx = { skipInvite: true }
const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})
const mk = (email: string, data: Partial<User>) =>
  payload.create({ collection: 'users', context: ctx, data: { email, password: 'motdepasse-test-123', roles: ['user'], ...data } as User })
const reqFor = async (user: User) =>
  createLocalReq({ user: { ...(await payload.findByID({ collection: 'users', id: user.id })), collection: 'users' } as never }, payload)

beforeAll(async () => {
  payload = await getPayload({ config })
  superAdmin = await mk('super4@test.local', { roles: ['super-admin'] })
  shop = await payload.create({ collection: 'tenants', data: { name: 'Fleuriste Iris', slug: 'fleuriste-iris' } })
  const otherShop = await payload.create({ collection: 'tenants', data: { name: 'Garage Max', slug: 'garage-max' } })
  editor = await mk('editor4@test.local', { tenants: [{ tenant: shop.id, roles: ['editor'] }] })
  other = await mk('other4@test.local', { tenants: [{ tenant: otherShop.id, roles: ['tenant-admin'] }] })
})

describe('Corbeille', () => {
  it('un tarif mis à la corbeille disparaît du site et se restaure', async () => {
    const p = await payload.create({ collection: 'prices', data: { tenant: shop.id, name: 'Bouquet du jour', price: 25 } })
    await payload.update({ collection: 'prices', id: p.id, data: { deletedAt: new Date().toISOString() }, ...(await as(editor)) })
    expect((await payload.find({ collection: 'prices', where: { tenant: { equals: shop.id } } })).totalDocs).toBe(0)
    expect(await renderSite(payload, 'fleuriste-iris')).not.toContain('Bouquet du jour')
    const trashed = await payload.find({ collection: 'prices', trash: true, where: { deletedAt: { exists: true } } })
    expect(trashed.totalDocs).toBe(1)
    await payload.update({ collection: 'prices', id: p.id, trash: true, data: { deletedAt: null }, ...(await as(editor)) })
    expect(await renderSite(payload, 'fleuriste-iris')).toContain('Bouquet du jour')
  })

  it('la corbeille est vidée après 30 jours', async () => {
    const p = await payload.create({ collection: 'services', data: { tenant: shop.id, title: 'Livraison' } })
    await payload.update({ collection: 'services', id: p.id, data: { deletedAt: new Date(Date.now() - 31 * 864e5).toISOString() } })
    await purgeTrash(payload)
    expect(await payload.findByID({ collection: 'services', id: p.id, trash: true, disableErrors: true })).toBeNull()
  })

  it('un autre client ne voit pas la corbeille de ce client', async () => {
    const p = await payload.create({ collection: 'events', data: { tenant: shop.id, title: 'Atelier bouquets', startsAt: new Date().toISOString() } })
    await payload.update({ collection: 'events', id: p.id, data: { deletedAt: new Date().toISOString() } })
    const seen = await payload.find({ collection: 'events', trash: true, ...(await as(other)) })
    expect(seen.docs.some((d) => d.id === p.id)).toBe(false)
  })
})

describe('Ordre par glisser-déposer', () => {
  it('le site suit l’ordre choisi dans la liste', async () => {
    const a = await payload.create({ collection: 'services', data: { tenant: shop.id, title: 'Mariages' } })
    const b = await payload.create({ collection: 'services', data: { tenant: shop.id, title: 'Deuils' } })
    let html = (await renderSite(payload, 'fleuriste-iris'))!
    expect(html.indexOf('Mariages')).toBeLessThan(html.indexOf('Deuils'))
    // Déplacer « Deuils » avant « Mariages » (ce que fait la poignée de la liste)
    await payload.update({ collection: 'services', id: b.id, data: { _order: 'Zz' } as never })
    await payload.update({ collection: 'services', id: a.id, data: { _order: 'a5' } as never })
    html = (await renderSite(payload, 'fleuriste-iris'))!
    expect(html.indexOf('Deuils')).toBeLessThan(html.indexOf('Mariages'))
  })
})

describe('Mode maintenance', () => {
  it('les visiteurs voient « site en travaux », réservé à l’agence', async () => {
    await expect(payload.update({ collection: 'tenants', id: shop.id, data: { maintenance: true }, ...(await as(editor)) })).rejects.toThrow()
    await payload.update({ collection: 'tenants', id: shop.id, data: { maintenance: true } })
    const html = (await renderSite(payload, 'fleuriste-iris'))!
    expect(html).toContain('data-maintenance')
    expect(html).toContain('peau neuve')
    await payload.update({ collection: 'tenants', id: shop.id, data: { maintenance: false } })
  })
})

describe('Notifications et réponse de l’agence', () => {
  it('l’agence voit les nouvelles demandes ; le client voit la réponse', async () => {
    const r = await payload.create({ collection: 'support-requests', data: { subject: 'Changer la photo', message: 'Merci', type: 'question' } as never, ...(await as(editor)) })
    const agency = await (await notifications.handler(await reqFor(superAdmin))).json()
    expect(agency.items.some((n: { title: string }) => n.title === 'Nouvelle demande de support')).toBe(true)
    // Le client ne peut pas écrire la réponse lui-même
    await expect(payload.update({ collection: 'support-requests', id: r.id, data: { reply: 'Je me réponds' }, ...(await as(editor)) })).rejects.toThrow()
    await payload.update({ collection: 'support-requests', id: r.id, data: { reply: 'C’est fait !' }, ...(await as(superAdmin)) })
    const mine = await (await notifications.handler(await reqFor(editor))).json()
    expect(mine.items[0].title).toBe('Réponse de l’agence')
    const theirs = await (await notifications.handler(await reqFor(other))).json()
    expect(theirs.items).toHaveLength(0)
  })
})
