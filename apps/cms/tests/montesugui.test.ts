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

  it('sans logo envoyé, le logo par défaut du haras s’affiche', () => {
    expect(html).toMatch(/<img class="logo" src="data:image\/svg\+xml,/)
  })
})
