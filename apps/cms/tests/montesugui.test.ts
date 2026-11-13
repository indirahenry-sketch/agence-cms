/**
 * TESTS DU CLIENT « HARAS DE MONTESUGUI » : maquette classique dupliquée de Poigny,
 * import relançable sans doublon, contenus du CMS affichés dans la maquette.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { importHarasMontesugui, MONTESUGUI_SLUG } from '@/sites/haras-montesugui/seed'
import { renderSite } from '@/sites/render'

let payload: Payload
let html: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await importHarasMontesugui(payload)
  html = (await renderSite(payload, MONTESUGUI_SLUG))!
})

describe('Haras de Montesugui', () => {
  it('le client est créé une seule fois, même si l’import est relancé', async () => {
    await importHarasMontesugui(payload)
    const tenants = await payload.count({ collection: 'tenants', where: { slug: { equals: MONTESUGUI_SLUG } }, overrideAccess: true })
    expect(tenants.totalDocs).toBe(1)
    const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: MONTESUGUI_SLUG } }, depth: 0, overrideAccess: true })
    const prices = await payload.count({ collection: 'prices', where: { tenant: { equals: docs[0].id } }, overrideAccess: true })
    expect(prices.totalDocs).toBe(10)
  })

  it('le site utilise la maquette classique, sans aucun repère {{…}} oublié', () => {
    expect(html).toContain('Haras de Montesugui')
    expect(html).toContain('La tradition, <em>au service du cheval.</em>')
    expect(html).toContain('Cormorant+Garamond')
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/)
    expect(html).not.toContain('__BANNER__')
    expect(html).not.toContain('__VIDEO__')
    expect(html).not.toContain('Poigny')
  })

  it('les contenus du CMS remplissent la maquette (tarifs, services, agenda, coordonnées)', () => {
    expect(html).toContain('Pension box')
    expect(html).toContain('Accompagnement en compétition')
    expect(html).toContain('<span class="tag">Pour vous</span>')
    expect(html).toContain('Fête de Noël du haras')
    expect(html).toContain('06 00 00 00 00')
    expect(html).toContain('>Actualités</a>')
  })

  it('les photos du haras ouvrent la galerie, sans les vues aériennes de Poigny', () => {
    const gallery = html.slice(html.indexOf('<div class="galerie">'), html.indexOf('<!--GALLERY_END-->'))
    expect(gallery.indexOf('Le haras vu du ciel')).toBeGreaterThan(-1)
    expect(gallery.indexOf('Le haras vu du ciel')).toBeLessThan(gallery.indexOf('Au manège'))
    expect(gallery).toContain('L&#39;allée des boxes')
    expect(gallery).not.toContain('Le domaine vu du ciel')
  })

  it('sans logo envoyé, le logo par défaut du haras s’affiche', () => {
    expect(html).toMatch(/<img class="logo" src="data:image\/svg\+xml,/)
  })

  it('modifier les coordonnées dans la fiche client change le site (même pour un client créé par une ancienne version)', async () => {
    const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: MONTESUGUI_SLUG } }, depth: 0, overrideAccess: true })
    const id = docs[0].id
    // État laissé par la première version de l'import : coordonnées provisoires dans les « Informations »
    const { docs: infos } = await payload.find({ collection: 'site-info', where: { tenant: { equals: id } }, depth: 0, overrideAccess: true })
    await payload.update({ collection: 'site-info', id: infos[0].id, data: { phone: '06 00 00 00 00', email: 'contact@haras-montesugui.fr', address: { street: 'Adresse à compléter' } }, overrideAccess: true })
    await payload.update({
      collection: 'tenants',
      id,
      data: { phone: '06 11 22 33 44', landline: '01 64 00 11 22', email: 'bonjour@montesugui.test', address: { street: '3 allée des Tilleuls', postalCode: '77000', city: 'Melun' } },
      overrideAccess: true,
    })
    await importHarasMontesugui(payload) // lancé à chaque démarrage du CMS
    const page = (await renderSite(payload, MONTESUGUI_SLUG))!
    expect(page).toContain('01 64 00 11 22')
    expect(page).toContain('bonjour@montesugui.test')
    expect(page).toContain('3 allée des Tilleuls')
    expect(page).not.toContain('06 00 00 00 00')
    expect(page).not.toContain('Adresse à compléter')
    // Bandeau du haut : fixe, portable, e-mail et adresse
    const topbar = page.slice(page.indexOf('<div class="topbar">'), page.indexOf('<nav class="nav"'))
    expect(topbar.indexOf('01 64 00 11 22')).toBeLessThan(topbar.indexOf('06 11 22 33 44'))
    expect(topbar).toContain('href="tel:0164001122"')
    expect(topbar).toContain('bonjour@montesugui.test')
    expect(topbar).toContain('3 allée des Tilleuls – 77000 Melun')
  })
})
