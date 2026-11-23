/**
 * TESTS DU CLIENT « CENTRE ÉQUESTRE DE SOURDUN » : dernière version de sa maquette,
 * import relançable sans doublon, contenus du CMS affichés dans la maquette.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { importCentreEquestreSourdun, SOURDUN_SLUG } from '@/sites/centre-equestre-sourdun/seed'
import { renderSite } from '@/sites/render'

let payload: Payload
let html: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await importCentreEquestreSourdun(payload)
  html = (await renderSite(payload, SOURDUN_SLUG))!
})

describe('Centre Équestre de Sourdun', () => {
  it('le client est créé une seule fois, même si l’import est relancé', async () => {
    await importCentreEquestreSourdun(payload)
    const tenants = await payload.count({ collection: 'tenants', where: { slug: { equals: SOURDUN_SLUG } }, overrideAccess: true })
    expect(tenants.totalDocs).toBe(1)
    const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: SOURDUN_SLUG } }, depth: 0, overrideAccess: true })
    const id = docs[0].id
    expect((await payload.count({ collection: 'services', where: { tenant: { equals: id } }, overrideAccess: true })).totalDocs).toBe(7)
    expect((await payload.count({ collection: 'posts', where: { tenant: { equals: id } }, overrideAccess: true })).totalDocs).toBe(3)
  })

  it('le site utilise la maquette de Sourdun, sans repère {{…}} oublié', () => {
    expect(html).toContain('l’équitation pour tous.')
    expect(html).toContain('data-view="horaires"')
    expect(html).toContain('data-view="reserver"')
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('les contenus du CMS remplissent la maquette', () => {
    expect(html).toContain('Ferme pédagogique')
    expect(html).toContain('data-for="adapte groupe"')
    expect(html).toContain('Chasse au Père Noël')
    expect(html).toContain('07 84 34 30 81')
    expect(html).toContain('>Cours et horaires</a>')
    expect(html).toContain('data-v="horaires"')
    expect(html).toContain('Réservations FFE')
    expect(html).toMatch(/<figure class="pola r1" tabindex="0"><img src="\/sites\/centre-equestre-sourdun\/media\/\d+/)
  })
})
