/**
 * TESTS DE L'ESPACE PROSPECTION (CRM)
 *
 * 1. Isolation : un compte client (même administrateur de son site) ne peut RIEN lire,
 *    créer, modifier ni supprimer dans le CRM. Le super admin, si.
 * 2. Rien n'est inventé : une information vide est « Non trouvé ».
 * 3. Doublons : signalés malgré des écritures différentes, jamais fusionnés tout seuls.
 * 4. « Ne plus contacter » : mémorisé, et appliqué à une fiche retrouvée plus tard.
 * 5. Zones : 101 départements, 8 actifs, création relançable sans doublon.
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import { communeKey, domainKey, emailKey, nameKey, phoneKey, sirenKey } from '@/crm/normalize'
import { ensureCrmZones } from '@/crm/zones'
import type { Tenant, User } from '@/payload-types'

let payload: Payload
let tenant: Tenant
let superAdmin: User
let clientAdmin: User

const ctx = { skipInvite: true }

const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})

const CRM_COLLECTIONS = ['crm-prospects', 'crm-activities', 'crm-zones', 'crm-searches', 'crm-duplicates', 'crm-optouts'] as const

beforeAll(async () => {
  payload = await getPayload({ config })
  tenant = await payload.create({ collection: 'tenants', data: { name: 'Client CRM', slug: 'client-crm' } })
  const mk = (email: string, data: Partial<User>) =>
    payload.create({ collection: 'users', context: ctx, data: { email, password: 'motdepasse-test-123', roles: ['user'], ...data } as User })
  superAdmin = await mk('super-crm@test.local', { roles: ['super-admin'] })
  clientAdmin = await mk('admin-crm@test.local', { tenants: [{ tenant: tenant.id, roles: ['tenant-admin'] }] })
})

describe('Clés de comparaison', () => {
  it('reconnaît un même nom écrit autrement', () => {
    expect(nameKey('Les Écuries de Poigny')).toBe(nameKey('ECURIE POIGNY'))
    expect(nameKey('Centre équestre')).toBe('centre equestre')
  })
  it('reconnaît une même commune', () => {
    expect(communeKey('Saint-Martin-de-Londres')).toBe(communeKey('st martin de londres'))
  })
  it('reconnaît un même téléphone', () => {
    expect(phoneKey('06 12 34 56 78')).toBe(phoneKey('+33 6 12 34 56 78'))
    expect(phoneKey('0033612345678')).toBe('612345678')
    expect(phoneKey('12')).toBe('')
  })
  it('reconnaît un même site, mais distingue deux pages Facebook', () => {
    expect(domainKey('https://www.ecurie-test.fr/contact')).toBe('ecurie-test.fr')
    expect(domainKey('ecurie-test.fr')).toBe('ecurie-test.fr')
    expect(domainKey('https://facebook.com/EcurieA')).not.toBe(domainKey('https://facebook.com/EcurieB'))
    expect(domainKey('pas un site')).toBe('')
  })
  it('normalise e-mail et SIREN', () => {
    expect(emailKey(' Contact@Ecurie.FR ')).toBe('contact@ecurie.fr')
    expect(emailKey('pas-un-email')).toBe('')
    expect(sirenKey('123 456 789 00012')).toBe('123456789')
  })
})

describe('Isolation : le CRM est invisible pour les clients', () => {
  it('un visiteur non connecté ne lit rien', async () => {
    for (const collection of CRM_COLLECTIONS) {
      await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow()
    }
  })

  it('un administrateur client ne peut ni lire ni créer', async () => {
    const opts = await as(clientAdmin)
    for (const collection of CRM_COLLECTIONS) {
      await expect(payload.find({ collection, ...opts })).rejects.toThrow()
    }
    await expect(payload.create({ collection: 'crm-prospects', data: { name: 'Intrus' }, ...opts })).rejects.toThrow()
    await expect(payload.findGlobal({ slug: 'crm-settings', ...opts })).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'crm-settings', data: { weeklyTarget: 1 }, ...opts })).rejects.toThrow()
  })

  it('un administrateur client ne peut ni modifier ni supprimer une fiche existante', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { name: 'Fiche secrète' } })
    const opts = await as(clientAdmin)
    await expect(payload.findByID({ collection: 'crm-prospects', id: p.id, ...opts })).rejects.toThrow()
    await expect(payload.update({ collection: 'crm-prospects', id: p.id, data: { name: 'Piraté' }, ...opts })).rejects.toThrow()
    await expect(payload.delete({ collection: 'crm-prospects', id: p.id, ...opts })).rejects.toThrow()
    const still = await payload.findByID({ collection: 'crm-prospects', id: p.id, overrideAccess: true })
    expect(still.name).toBe('Fiche secrète')
  })

  it('le super admin a accès à tout', async () => {
    const opts = await as(superAdmin)
    const p = await payload.create({ collection: 'crm-prospects', data: { name: 'Écurie du super admin' }, ...opts })
    expect(p.status).toBe('nouveau')
    const settings = await payload.updateGlobal({ slug: 'crm-settings', data: { weeklyTarget: 150 }, ...opts })
    expect(settings.weeklyTarget).toBe(150) // pas de plafond à 70
  })
})

describe('Rien n’est inventé', () => {
  it('une coordonnée vide est « Non trouvé », une coordonnée saisie est « À vérifier »', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { name: 'Écurie sans infos', phone: '04 67 00 00 00' } })
    expect(p.emailLevel).toBe('non-trouve')
    expect(p.phoneLevel).toBe('a-verifier')
  })

  it('le besoin découle du site Internet', async () => {
    const sans = await payload.create({ collection: 'crm-prospects', data: { name: 'Écurie A', websiteStatus: 'sans-site' } })
    const avec = await payload.create({ collection: 'crm-prospects', data: { name: 'Écurie B', website: 'https://ecurie-b.fr' } })
    expect(sans.need).toBe('creation')
    expect(avec.websiteStatus).toBe('site-existant')
    expect(avec.need).toBe('refonte')
  })
})

describe('Doublons', () => {
  it('signale le même téléphone écrit autrement, sans rien supprimer', async () => {
    const a = await payload.create({ collection: 'crm-prospects', data: { name: 'Haras du Soleil', commune: 'Lunel', phone: '06 11 22 33 44' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { name: 'Haras Soleil', commune: 'Lunel', phone: '+33611223344' } })
    const { docs } = await payload.find({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } }, depth: 0 })
    expect(docs).toHaveLength(1)
    expect(docs[0].existing).toBe(a.id)
    expect(docs[0].reasons).toEqual(expect.arrayContaining(['telephone', 'nom-commune']))
    expect(docs[0].status).toBe('a-examiner')
    // Les deux fiches existent toujours
    expect((await payload.count({ collection: 'crm-prospects', where: { id: { in: [a.id, b.id] } } })).totalDocs).toBe(2)
  })

  it('reconnaît le même nom dans la même commune', async () => {
    await payload.create({ collection: 'crm-prospects', data: { name: 'Les Écuries de la Garrigue', commune: 'Saint-Mathieu-de-Tréviers' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { name: 'Ecurie Garrigue', commune: 'St Mathieu de Treviers' } })
    expect((await payload.count({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } } })).totalDocs).toBe(1)
  })

  it('ne signale pas deux structures différentes', async () => {
    await payload.create({ collection: 'crm-prospects', data: { name: 'Poney-club des Pins', commune: 'Sète' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { name: 'Poney-club des Oliviers', commune: 'Sète' } })
    expect((await payload.count({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } } })).totalDocs).toBe(0)
  })
})

describe('Ne plus contacter', () => {
  it('mémorise un refus et l’applique à une fiche retrouvée plus tard', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { name: 'Domaine des Refus', email: 'contact@refus.fr' } })
    await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'ne-plus-contacter' } })
    expect((await payload.count({ collection: 'crm-optouts', where: { emailKey: { equals: 'contact@refus.fr' } } })).totalDocs).toBe(1)

    // La fiche est supprimée… mais le refus reste
    await payload.delete({ collection: 'crm-prospects', id: p.id })
    expect((await payload.count({ collection: 'crm-optouts', where: { emailKey: { equals: 'contact@refus.fr' } } })).totalDocs).toBe(1)

    // Une nouvelle recherche retrouve l'établissement : il est bloqué d'office
    const again = await payload.create({ collection: 'crm-prospects', data: { name: 'Domaine Refus', email: 'CONTACT@refus.fr' } })
    expect(again.status).toBe('ne-plus-contacter')
    expect(again.doNotContact).toBe(true)
  })
})

describe('Suivi', () => {
  it('la prochaine relance et le dernier contact remontent sur la fiche', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { name: 'Écurie Suivie' } })
    const followUp = new Date(Date.now() + 3 * 864e5).toISOString()
    await payload.create({ collection: 'crm-activities', data: { prospect: p.id, kind: 'email-envoye', summary: 'Premier e-mail', followUpAt: followUp } })
    const after = await payload.findByID({ collection: 'crm-prospects', id: p.id, depth: 0 })
    expect(after.nextFollowUpAt?.slice(0, 10)).toBe(followUp.slice(0, 10))
    expect(after.lastContactAt).toBeTruthy()
  })
})

describe('Zones', () => {
  it('crée les 101 départements, 8 actifs, sans doublon si on relance', async () => {
    expect(await ensureCrmZones(payload)).toBe(101)
    expect(await ensureCrmZones(payload)).toBe(0)
    expect((await payload.count({ collection: 'crm-zones' })).totalDocs).toBe(101)
    const { docs } = await payload.find({ collection: 'crm-zones', where: { active: { equals: true } }, limit: 0, pagination: false })
    expect(docs.map((z) => z.code).sort()).toEqual(['11', '13', '30', '31', '34', '66', '83', '84'])
    const herault = docs.find((z) => z.code === '34')
    expect(herault?.region).toBe('Occitanie')
    expect(herault?.label).toBe('34 · Hérault')
  })
})
