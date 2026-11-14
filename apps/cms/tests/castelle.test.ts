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
    expect((await payload.count({ collection: 'prices', where: of, overrideAccess: true })).totalDocs).toBe(26)
    expect((await payload.count({ collection: 'menus', where: of, overrideAccess: true })).totalDocs).toBe(2)
    expect((await payload.count({ collection: 'media', where: of, overrideAccess: true })).totalDocs).toBe(8)
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
    expect(html).toContain('Abonnement annuel « Enfant »')
    expect(html).toContain('>Cours &amp; abonnements</button>')
    expect(html).toContain('id="calGrid"')
    expect(html).toContain('Planning des cours 2026-2027')
    expect(html).toContain('>Planning</a>')
    expect(html).toContain('>Galerie</a>')
    expect(html).toContain('Le Poney du DEDC')
    expect(html).toContain('06 10 44 25 77')
    expect(html).toContain('dedc34@yahoo.com')
    expect(html).toContain('>Le domaine</a>')
    expect(html).toMatch(new RegExp(`<figure class="pola r1" tabindex="0"><img src="/sites/${SLUG}/media/\\d+`))
  })

  it('deux onglets « Cours & abonnements » : le premier passe à la suite dans le second', async () => {
    const of = { tenant: { equals: tenantID } }
    const { docs } = await payload.find({ collection: 'categories', where: { and: [of, { name: { equals: 'Cours & abonnements' } }] }, depth: 0, overrideAccess: true })
    const first = docs[0]
    // On simule le doublon : un second onglet du même nom, avec un tarif en commun et un tarif en plus
    const second = await payload.create({ collection: 'categories', data: { tenant: tenantID, name: 'Cours et abonnements', usage: ['prices'], order: 1 }, overrideAccess: true })
    await payload.create({ collection: 'prices', data: { tenant: tenantID, category: second.id, name: 'Demi-pension', price: 150 }, overrideAccess: true })
    await payload.create({ collection: 'prices', data: { tenant: tenantID, category: second.id, name: 'Tarif du second onglet', price: 12 }, overrideAccess: true })
    await importDomaineCastelle(payload)
    const after = await payload.find({ collection: 'categories', where: { and: [of, { usage: { in: ['prices'] } }] }, depth: 0, limit: 50, overrideAccess: true })
    expect(after.docs.filter((c) => /^Cours (&|et) abonnements$/.test(c.name)).map((c) => c.id)).toEqual([second.id])
    expect(after.docs.some((c) => c.id === first.id)).toBe(false)
    const page = (await renderSite(payload, SLUG))!
    expect(page.indexOf('Tarif du second onglet')).toBeLessThan(page.indexOf('Abonnement annuel « Enfant »'))
    expect(page.match(/<h3>Demi-pension<\/h3>/g)?.length).toBe(1)
    expect((await payload.count({ collection: 'prices', where: of, overrideAccess: true })).totalDocs).toBe(27)
  })

  it('remplace le menu de démonstration hérité d’une duplication du Haras de Montesugui', async () => {
    const { docs } = await payload.find({ collection: 'menus', where: { and: [{ tenant: { equals: tenantID } }, { location: { equals: 'main' } }] }, depth: 0, overrideAccess: true })
    const a = (label: string, anchor: 'galerie' | 'services' | 'tarifs' | 'blog' | 'contact') => ({ label, type: 'anchor' as const, anchor })
    await payload.update({ collection: 'menus', id: docs[0].id, data: { items: [a('Le haras', 'galerie'), a('Prestations', 'services'), a('Tarifs', 'tarifs'), a('Actualités', 'blog'), a('Contact', 'contact')] }, overrideAccess: true })
    await importDomaineCastelle(payload)
    const page = (await renderSite(payload, SLUG))!
    expect(page).toContain('>Planning</a>')
    expect(page).toContain('>Galerie</a>')
    expect(page).not.toContain('>Le haras</a>')
  })

  it('sans photo dans le CMS, la galerie de la maquette reste affichée', async () => {
    const { docs } = await payload.find({ collection: 'media', where: { tenant: { equals: tenantID } }, limit: 50, depth: 0, overrideAccess: true })
    for (const m of docs) await payload.update({ collection: 'media', id: m.id, data: { inGallery: false }, overrideAccess: true })
    const bare = (await renderSite(payload, SLUG))!
    expect(bare).toContain('id="galerie"')
    expect(bare).toContain('<figure class="pola r1" tabindex="0"><img src="data:image/jpeg;base64,')
    for (const m of docs) await payload.update({ collection: 'media', id: m.id, data: { inGallery: true }, overrideAccess: true })
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
