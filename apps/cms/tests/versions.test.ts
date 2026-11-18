/**
 * TESTS DES ANCIENNES VERSIONS DE MAQUETTE : visibles seulement par le super-admin.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import type { User } from '@/payload-types'
import { withEditBar } from '@/sites/editBar'
import { archivedTemplate, SITE_VERSIONS } from '@/sites/versions'

let payload: Payload
const SLUG = 'castelle-versions'
const PASSWORD = 'motdepasse-test-123'
const PAGE = '<!doctype html><html><body><section id="tarifs"></section></body></html>'

const visit = async (email?: string, query = '?version=v2', extra: Record<string, string> = {}) => {
  const headers = new Headers(extra)
  if (email) {
    const { token } = await payload.login({ collection: 'users', data: { email, password: PASSWORD } })
    headers.set('cookie', `payload-token=${token}`)
  }
  return new Request(`http://localhost/sites/${SLUG}${query}`, { headers })
}

beforeAll(async () => {
  payload = await getPayload({ config })
  const tenant = await payload.create({ collection: 'tenants', data: { name: 'Castelle versions', slug: SLUG } })
  const mk = (email: string, data: Partial<User>) =>
    payload.create({ collection: 'users', context: { skipInvite: true }, data: { email, password: PASSWORD, roles: ['user'], ...data } as User })
  await mk('super-versions@test.local', { roles: ['super-admin'] })
  await mk('editor-versions@test.local', { tenants: [{ tenant: tenant.id, roles: ['editor'] }] })
})

describe('Anciennes versions des maquettes', () => {
  it('chaque version archivée se charge et contient une maquette complète', async () => {
    for (const list of Object.values(SITE_VERSIONS)) {
      for (const v of list) {
        const html = await v.load()
        expect(html.startsWith('<!doctype html>')).toBe(true)
        expect(html).not.toMatch(/__(BANNER|POSTER|VIDEO)__/)
      }
    }
  })

  it('le super-admin obtient la version demandée et voit le sélecteur', async () => {
    const req = await visit('super-versions@test.local')
    const archived = await archivedTemplate(payload, req, SLUG)
    expect(archived?.id).toBe('v2')
    const out = await withEditBar(payload, req, SLUG, PAGE, { version: 'v2' })
    expect(out.html).toContain('id="cmsVersion"')
    expect(out.html).toContain('<option value="v2" selected>')
  })

  it('un éditeur du client, un visiteur ou le domaine du client : version ignorée, pas de sélecteur', async () => {
    const editor = await visit('editor-versions@test.local')
    expect(await archivedTemplate(payload, editor, SLUG)).toBeNull()
    expect((await withEditBar(payload, editor, SLUG, PAGE)).html).not.toContain('cmsVersion')
    expect(await archivedTemplate(payload, await visit(), SLUG)).toBeNull()
    expect(await archivedTemplate(payload, await visit('super-versions@test.local', '?version=v2', { 'x-site-domain': 'castelle.fr' }), SLUG)).toBeNull()
  })

  it('une version inconnue ou absente affiche le site actuel', async () => {
    expect(await archivedTemplate(payload, await visit('super-versions@test.local', '?version=v99'), SLUG)).toBeNull()
    expect(await archivedTemplate(payload, await visit('super-versions@test.local', ''), SLUG)).toBeNull()
  })
})
