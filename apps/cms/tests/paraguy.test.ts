/**
 * TESTS DE LA MAQUETTE « LES ÉCURIES DE PARAGUY » : copie fictive des Écuries de Poigny
 * (même maquette), sans le vrai nom, le vrai logo ni les vraies coordonnées. Poigny n'est pas touché.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { importEcuriesParaguy, PARAGUY_SLUG } from '@/sites/ecuries-paraguy/seed'
import { template as poignyTemplate } from '@/sites/ecuries-poigny/template'
import { renderSite } from '@/sites/render'

let payload: Payload
let html: string

beforeAll(async () => {
  payload = await getPayload({ config })
  await importEcuriesParaguy(payload)
  html = (await renderSite(payload, PARAGUY_SLUG))!
})

describe('Les Écuries de Paraguy', () => {
  it('est créée une seule fois, avec son logo et ses photos, même si l’import est relancé', async () => {
    const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: PARAGUY_SLUG } }, depth: 1, overrideAccess: true })
    expect(docs).toHaveLength(1)
    expect(docs[0].name).toBe('Les Écuries de Paraguy')
    const logo = docs[0].logo
    expect(typeof logo === 'object' && logo?.alt).toBe('Logo des Écuries de Paraguy')
    const before = (await payload.count({ collection: 'media', where: { tenant: { equals: docs[0].id } }, overrideAccess: true })).totalDocs
    await importEcuriesParaguy(payload)
    expect((await payload.count({ collection: 'tenants', where: { slug: { equals: PARAGUY_SLUG } }, overrideAccess: true })).totalDocs).toBe(1)
    expect((await payload.count({ collection: 'media', where: { tenant: { equals: docs[0].id } }, overrideAccess: true })).totalDocs).toBe(before)
  })

  it('affiche le nom et les coordonnées fictifs, jamais les vrais', () => {
    expect(html).toContain('Les Écuries de Paraguy')
    expect(html).toContain('PARAGUY')
    expect(html).toContain('contact@ecuries-paraguy.example')
    for (const real of ['ecuriespoigny@gmail.com', '06 27 67 92 88', 'Hennepont', 'curies de Poigny', 'ecuries_poigny', '>POIGNY<']) expect(html).not.toContain(real)
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/)
  })

  it('la maquette des Écuries de Poigny reste intacte', () => {
    expect(poignyTemplate).toContain('>POIGNY</text>')
    expect(poignyTemplate).toContain('curies de Poigny')
  })
})
