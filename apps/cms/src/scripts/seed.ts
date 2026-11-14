/**
 * Initialise la base : crée ton compte super administrateur et un client de démonstration.
 * Lancement : pnpm seed   (sans risque : ne recrée rien qui existe déjà)
 */
import 'dotenv/config'
import config from '@payload-config'
import { getPayload } from 'payload'

import { importEcuriesPoigny } from '../sites/ecuries-poigny/seed'
import { importHarasMontesugui } from '../sites/haras-montesugui/seed'
import { importCentreEquestreSourdun } from '../sites/centre-equestre-sourdun/seed'
import { importDomaineCastelle } from '../sites/domaine-equestre-castelle/seed'

const payload = await getPayload({ config })

const email = process.env.SEED_ADMIN_EMAIL
const password = process.env.SEED_ADMIN_PASSWORD
if (!email || !password) {
  payload.logger.error('Renseigne SEED_ADMIN_EMAIL et SEED_ADMIN_PASSWORD dans apps/cms/.env')
  process.exit(1)
}

const ctx = { skipInvite: true }

const admins = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
if (admins.docs.length === 0) {
  await payload.create({
    collection: 'users',
    context: ctx,
    data: { email, password, name: 'Super admin', roles: ['super-admin'] },
  })
  payload.logger.info(`✔ Super administrateur créé : ${email}`)
} else {
  payload.logger.info(`• Le super administrateur ${email} existe déjà`)
}

const demo = await payload.find({ collection: 'tenants', where: { slug: { equals: 'demo' } }, limit: 1 })
if (demo.docs.length === 0) {
  const tenant = await payload.create({
    collection: 'tenants',
    data: {
      name: 'Boulangerie Démo',
      slug: 'demo',
      languages: ['fr', 'en'],
      email: 'contact@demo.test',
      phone: '01 23 45 67 89',
      address: { street: '1 rue de la Paix', postalCode: '91130', city: 'Ris-Orangis', country: 'France' },
      theme: { primaryColor: '#8B4513', secondaryColor: '#F5DEB3', font: 'playfair' },
    },
  })
  await payload.create({
    collection: 'site-info',
    data: {
      tenant: tenant.id,
      phone: '01 23 45 67 89',
      openingHours: [
        { day: 'tuesday', slots: [{ opens: '07:00', closes: '13:00' }, { opens: '15:00', closes: '19:30' }] },
        { day: 'sunday', slots: [{ opens: '07:30', closes: '13:00' }] },
        { day: 'monday', closed: true },
      ],
    },
  })
  await payload.create({
    collection: 'prices',
    data: { tenant: tenant.id, name: 'Baguette tradition', price: 1.3, order: 1 },
  })
  await payload.create({
    collection: 'users',
    context: ctx,
    data: {
      email: 'client@demo.test',
      password: 'demo-client-2026',
      name: 'Client démo',
      roles: ['user'],
      tenants: [{ tenant: tenant.id, roles: ['tenant-admin'] }],
    },
  })
  payload.logger.info('✔ Client de démonstration créé (connexion : client@demo.test / demo-client-2026)')
}

// Site réel de démonstration : Les Écuries de Poigny (voir /sites/ecuries-poigny)
await importEcuriesPoigny(payload)

// Haras de Montesugui : duplication classique de la maquette Poigny (voir /sites/haras-montesugui)
await importHarasMontesugui(payload)

// Centre Équestre de Sourdun : dernière version de sa maquette (voir /sites/centre-equestre-sourdun)
await importCentreEquestreSourdun(payload)

// Domaine Équestre de la Castelle : client créé depuis le CMS, complété ici (voir /sites/<identifiant>)
await importDomaineCastelle(payload)

process.exit(0)
