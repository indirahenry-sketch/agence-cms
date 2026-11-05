import type { Payload } from 'payload'

import { seedGallery, seedLogo } from './seedImages'

export const POIGNY_SLUG = 'ecuries-poigny'

/**
 * Crée le client « Les Écuries de Poigny » avec le contenu de la maquette V10 :
 * fiche, horaires, catégories et tarifs, logo et photos de la galerie.
 *
 * Sans risque : ne recrée jamais un client existant. Si les photos manquent
 * (stockage indisponible au premier essai), elles sont réessayées au démarrage suivant.
 *
 * Lancé au démarrage du CMS (onInit) et par `pnpm seed`. Chaque enregistrement a sa
 * propre transaction : un échec d'envoi de photo n'annule pas la fiche du client.
 */
export async function importEcuriesPoigny(payload: Payload): Promise<void> {
  const base = { overrideAccess: true, context: { skipInvite: true } } as const

  const existing = await payload.find({ collection: 'tenants', where: { slug: { equals: POIGNY_SLUG } }, limit: 1, depth: 0, ...base })
  if (existing.docs.length) {
    const tenant = existing.docs[0]
    const { totalDocs } = await payload.count({ collection: 'media', where: { tenant: { equals: tenant.id } }, overrideAccess: true })
    if (totalDocs === 0) await importPhotos(payload, tenant.id)
    return
  }

  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Les Écuries de Poigny',
      slug: POIGNY_SLUG,
      languages: ['fr'],
      email: 'ecuriespoigny@gmail.com',
      phone: '06 27 67 92 88',
      address: { street: "24 route de la Ferme d'Hennepont", postalCode: '77160', city: 'Poigny', country: 'France' },
      theme: { primaryColor: '#4C6E2A', secondaryColor: '#EDC655', font: 'playfair' },
      settings: { showBlog: false, showEvents: true, showPrices: true, showGallery: true },
    },
    ...base,
  })

  const weekday = { slots: [{ opens: '08:00', closes: '18:00' }] }
  await payload.create({
    collection: 'site-info',
    data: {
      tenant: tenant.id,
      phone: '06 27 67 92 88',
      email: 'ecuriespoigny@gmail.com',
      address: {
        street: "24 route de la Ferme d'Hennepont",
        postalCode: '77160',
        city: 'Poigny',
        mapsUrl: 'https://www.google.com/maps/search/?api=1&query=24+route+de+la+Ferme+d%27Hennepont+77160+Poigny',
      },
      openingHours: [
        { day: 'monday', ...weekday },
        { day: 'tuesday', ...weekday },
        { day: 'wednesday', ...weekday },
        { day: 'thursday', ...weekday },
        { day: 'friday', ...weekday },
        { day: 'saturday', slots: [{ opens: '08:00', closes: '12:00' }] },
        { day: 'sunday', closed: true },
      ],
      socials: [{ network: 'instagram', url: 'https://www.instagram.com/ecuries_poigny' }],
    },
    ...base,
  })

  // Catégories de tarifs (= onglets de la section Tarifs) et tarifs
  type P = { name: string; description: string; price: number; unit: string; displayPrice?: string; highlight?: boolean }
  const groups: { name: string; prices: P[] }[] = [
    {
      name: 'Cours et abonnements',
      prices: [
        { name: 'Baby poney', description: 'Les plus petits', price: 450, unit: 'par saison' },
        { name: 'Poney / double poney', description: 'Enfants', price: 660, unit: 'par saison' },
        { name: 'Cours cheval', description: 'Ados et adultes', price: 825, displayPrice: '810–840 €', unit: 'par saison' },
        { name: 'Abonnement compétition', description: 'Concours', price: 1350, unit: 'par saison', highlight: true },
      ],
    },
    {
      name: 'Pensions',
      prices: [
        { name: 'Pension pré', description: 'Au grand air', price: 250, unit: 'par mois' },
        { name: 'Pension box', description: 'La plus demandée', price: 420, unit: 'par mois', highlight: true },
        { name: 'Pension débourrage', description: 'Jeunes chevaux', price: 630, unit: 'par mois' },
      ],
    },
    {
      name: 'Stages et animations',
      prices: [
        { name: 'Demi-journée de stage', description: 'Vacances', price: 35, unit: 'la demi-journée' },
        { name: 'Journée de stage', description: 'Vacances', price: 52, displayPrice: '50–55 €', unit: 'la journée', highlight: true },
        { name: 'Événements spéciaux', description: 'Ex. Cheval de Pâques', price: 10, displayPrice: '10 / 15 €', unit: 'adhérent / non-adhérent' },
      ],
    },
  ]
  let order = 0
  for (const [i, group] of groups.entries()) {
    const category = await payload.create({
      collection: 'categories',
      data: { tenant: tenant.id, name: group.name, usage: ['prices'], order: i + 1 },
      ...base,
    })
    for (const p of group.prices) {
      await payload.create({
        collection: 'prices',
        data: { tenant: tenant.id, category: category.id, order: ++order, ...p },
        ...base,
      })
    }
  }

  payload.logger.info('✔ Client « Les Écuries de Poigny » créé avec son contenu')
  await importPhotos(payload, tenant.id)
}

/** Logo et photos de la galerie. En cas d'échec, le site garde son logo intégré et masque la galerie. */
async function importPhotos(payload: Payload, tenantID: number | string): Promise<void> {
  const base = { overrideAccess: true } as const
  const upload = async (img: { mime: string; b64: string; alt: string }, name: string, inGallery: boolean) => {
    const data = Buffer.from(img.b64, 'base64')
    return payload.create({
      collection: 'media',
      data: { tenant: tenantID as number, alt: img.alt, title: inGallery ? img.alt : undefined, inGallery },
      file: { data, mimetype: img.mime, name, size: data.length },
      ...base,
    })
  }
  try {
    const logo = await upload(seedLogo, 'logo.png', false)
    await payload.update({ collection: 'tenants', id: tenantID, data: { logo: logo.id }, ...base })
    for (const [i, img] of seedGallery.entries()) await upload(img, `photo-${i + 1}.jpg`, true)
    payload.logger.info('✔ Photos des Écuries de Poigny importées')
  } catch (err) {
    payload.logger.error({ err }, 'Import des photos des Écuries de Poigny impossible : vérifie les variables S3_ (stockage Supabase)')
  }
}
