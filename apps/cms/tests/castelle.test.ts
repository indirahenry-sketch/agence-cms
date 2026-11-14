/**
 * TESTS DU CLIENT « DOMAINE ÉQUESTRE DE LA CASTELLE » : client créé depuis le CMS (identifiant
 * libre), complété par l'import sans rien écraser, et affiché avec sa maquette sur mesure.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { importDomaineCastelle } from '@/sites/domaine-equestre-castelle/seed'
import { hasSiteTemplate, renderPage, renderSite } from '@/sites/render'

const SLUG = 'castelle-montpellier'
let payload: Payload
let tenantID: number
let html: string

beforeAll(async () => {
  payload = await getPayload({ config })
  // Comme une fiche créée à la main dans le CMS : couleurs par défaut, téléphone déjà saisi
  const t = await payload.create({
    collection: 'tenants',
    data: { name: 'Domaine Équestre De la Castelle', slug: SLUG, phone: '06 14 60 22 46', theme: { primaryColor: '#1F4E79', secondaryColor: '#F2C14E' } },
    overrideAccess: true,
    context: { skipInvite: true },
  })
  tenantID = t.id
  await importDomaineCastelle(payload)
  html = (await renderSite(payload, SLUG))!
})

describe('Domaine Équestre de la Castelle', () => {
  it('reconnaît le client créé dans le CMS, sans en créer un second, même si l’import est relancé', async () => {
    await importDomaineCastelle(payload)
    const all = await payload.count({ collection: 'tenants', where: { name: { like: 'castelle' } }, overrideAccess: true })
    expect(all.totalDocs).toBe(1)
    const of = { tenant: { equals: tenantID } }
    expect((await payload.count({ collection: 'services', where: of, overrideAccess: true })).totalDocs).toBe(7)
    expect((await payload.count({ collection: 'prices', where: of, overrideAccess: true })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'menus', where: of, overrideAccess: true })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'media', where: of, overrideAccess: true })).totalDocs).toBe(6)
  })

  it('complète la fiche sans écraser ce qui était saisi', async () => {
    const t = await payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true })
    expect(t.phone).toBe('06 14 60 22 46')
    expect(t.landline).toBe('06 10 44 25 77')
    expect(t.email).toBe('dedc34@yahoo.com')
    expect(t.theme?.primaryColor).toBe('#1F3F99')
  })

  it('le site utilise la maquette de la Castelle, sans repère {{…}} oublié', () => {
    expect(hasSiteTemplate({ slug: SLUG, name: 'x' })).toBe(true)
    expect(hasSiteTemplate({ slug: 'mon-club', name: 'Domaine Équestre de la Castelle' })).toBe(true)
    expect(hasSiteTemplate({ slug: 'boulangerie', name: 'Boulangerie' })).toBe(false)
    expect(html).toContain('Domaine Équestre</span><span class="gold-text">de la Castelle')
    expect(html).toContain('id="tabbar"')
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('les contenus du CMS remplissent la maquette', () => {
    expect(html).toContain('Écurie de propriétaires')
    expect(html).toContain('Première nuit')
    expect(html).toContain('06 10 44 25 77')
    expect(html).toContain('dedc34@yahoo.com')
    expect(html).toContain('>Le domaine</a>')
    expect(html).toMatch(new RegExp(`<figure class="pola r1" tabindex="0"><img src="/sites/${SLUG}/media/\\d+`))
  })

  it('les pages du client gardent l’en-tête et le pied de page de la maquette', async () => {
    const { docs } = await payload.find({ collection: 'pages', where: { tenant: { equals: tenantID } }, limit: 1, depth: 0, overrideAccess: true })
    await payload.update({ collection: 'pages', id: docs[0].id, data: { _status: 'published' }, overrideAccess: true })
    const page = await renderPage(payload, SLUG, docs[0].slug!)
    expect(page).toContain('class="head"')
    expect(page).toContain('class="foot"')
    expect(page).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })
})
