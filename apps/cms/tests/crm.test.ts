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

import { commercialOf, statusForCommercial } from '@/crm/constants'
import { checkClosedProspects } from '@/crm/closed'
import { decodeCsv, parseCsv, toCsv } from '@/crm/csv'
import { loadTasks, monthCells } from '@/crm/followUps'
import { autoMergeDuplicates, mergeProspects } from '@/crm/merge'
import { fillTemplate, mailtoLink, OPT_OUT_LINE, outlookLink, withOptOut } from '@/crm/emailTemplate'
import { agendaKey, agendaUrl, buildIcs, parseTime } from '@/crm/agenda'
import { departmentFromPostalCode, importProspects, mapHeaders } from '@/crm/importExport'
import { communeKey, domainKey, emailKey, nameKey, phoneKey, sirenKey } from '@/crm/normalize'
import { ensureCrmZones } from '@/crm/zones'
import { crmAgenda, crmExport, crmImport, crmSearch } from '@/endpoints/crm'
import { runCrmSearch } from '@/crm/search/run'
import { isMondayAfter9Paris } from '@/crm/search/scheduler'
import { title } from '@/crm/search/sources'
import type { Tenant, User } from '@/payload-types'
import type { PayloadRequest } from 'payload'

let payload: Payload
let tenant: Tenant
let superAdmin: User
let clientAdmin: User

const ctx = { skipInvite: true }

const as = async (user: User) => ({
  user: { ...(await payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })), collection: 'users' as const },
  overrideAccess: false as const,
})

const CRM_COLLECTIONS = ['crm-prospects', 'crm-activities', 'crm-zones', 'crm-searches', 'crm-duplicates', 'crm-optouts', 'crm-email-templates', 'crm-tasks'] as const

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
    await expect(payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Intrus' }, ...opts })).rejects.toThrow()
    await expect(payload.findGlobal({ slug: 'crm-settings', ...opts })).rejects.toThrow()
    await expect(payload.updateGlobal({ slug: 'crm-settings', data: { weeklyTarget: 1 }, ...opts })).rejects.toThrow()
  })

  it('un administrateur client ne peut ni modifier ni supprimer une fiche existante', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Fiche secrète' } })
    const opts = await as(clientAdmin)
    await expect(payload.findByID({ collection: 'crm-prospects', id: p.id, ...opts })).rejects.toThrow()
    await expect(payload.update({ collection: 'crm-prospects', id: p.id, data: { name: 'Piraté' }, ...opts })).rejects.toThrow()
    await expect(payload.delete({ collection: 'crm-prospects', id: p.id, ...opts })).rejects.toThrow()
    const still = await payload.findByID({ collection: 'crm-prospects', id: p.id, overrideAccess: true })
    expect(still.name).toBe('Fiche secrète')
  })

  it('le super admin a accès à tout', async () => {
    const opts = await as(superAdmin)
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie du super admin' }, ...opts })
    expect(p.status).toBe('nouveau')
    const settings = await payload.updateGlobal({ slug: 'crm-settings', data: { weeklyTarget: 150 }, ...opts })
    expect(settings.weeklyTarget).toBe(150) // pas de plafond à 70
  })
})

describe('Rien n’est inventé', () => {
  it('une coordonnée vide est « Non trouvé », une coordonnée saisie est « À vérifier »', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie sans infos', phone: '04 67 00 00 00' } })
    expect(p.emailLevel).toBe('non-trouve')
    expect(p.phoneLevel).toBe('a-verifier')
  })

  it('le besoin découle du site Internet', async () => {
    const sans = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie A', websiteStatus: 'sans-site' } })
    const avec = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie B', website: 'https://ecurie-b.fr' } })
    expect(sans.need).toBe('creation')
    expect(avec.websiteStatus).toBe('site-existant')
    expect(avec.need).toBe('refonte')
  })
})

describe('Doublons', () => {
  it('signale le même téléphone écrit autrement, sans rien supprimer', async () => {
    const a = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Haras du Soleil', commune: 'Lunel', phone: '06 11 22 33 44' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Haras Soleil', commune: 'Lunel', phone: '+33611223344' } })
    const { docs } = await payload.find({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } }, depth: 0 })
    expect(docs).toHaveLength(1)
    expect(docs[0].existing).toBe(a.id)
    expect(docs[0].reasons).toEqual(expect.arrayContaining(['telephone', 'nom-commune']))
    expect(docs[0].status).toBe('a-examiner')
    // Les deux fiches existent toujours
    expect((await payload.count({ collection: 'crm-prospects', where: { id: { in: [a.id, b.id] } } })).totalDocs).toBe(2)
  })

  it('reconnaît le même nom dans la même commune', async () => {
    await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Les Écuries de la Garrigue', commune: 'Saint-Mathieu-de-Tréviers' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Ecurie Garrigue', commune: 'St Mathieu de Treviers' } })
    expect((await payload.count({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } } })).totalDocs).toBe(1)
  })

  it('ne signale pas deux structures différentes', async () => {
    await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Poney-club des Pins', commune: 'Sète' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Poney-club des Oliviers', commune: 'Sète' } })
    expect((await payload.count({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } } })).totalDocs).toBe(0)
  })
})

describe('Ne plus contacter', () => {
  it('mémorise un refus et l’applique à une fiche retrouvée plus tard', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Domaine des Refus', email: 'contact@refus.fr' } })
    await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'ne-plus-contacter' } })
    expect((await payload.count({ collection: 'crm-optouts', where: { emailKey: { equals: 'contact@refus.fr' } } })).totalDocs).toBe(1)

    // La fiche est supprimée… mais le refus reste
    await payload.delete({ collection: 'crm-prospects', id: p.id })
    expect((await payload.count({ collection: 'crm-optouts', where: { emailKey: { equals: 'contact@refus.fr' } } })).totalDocs).toBe(1)

    // Une nouvelle recherche retrouve l'établissement : il est bloqué d'office
    const again = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Domaine Refus', email: 'CONTACT@refus.fr' } })
    expect(again.status).toBe('ne-plus-contacter')
    expect(again.doNotContact).toBe(true)
  })
})

describe('Suivi', () => {
  it('la prochaine relance et le dernier contact remontent sur la fiche', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie Suivie' } })
    const followUp = new Date(Date.now() + 3 * 864e5).toISOString()
    await payload.create({ collection: 'crm-activities', data: { prospect: p.id, kind: 'email-envoye', date: new Date().toISOString(), summary: 'Premier e-mail', followUpAt: followUp } })
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

/* ------------------------------------------------------------------ */
/* ÉTAPE 2 : CSV, import, export                                       */
/* ------------------------------------------------------------------ */

describe('CSV', () => {
  it('écrit pour Excel (point-virgule, BOM) et se relit à l’identique', () => {
    const csv = toCsv(['Nom', 'Notes'], [['Écurie « Le Pré »', 'ligne 1\nligne 2 ; avec "guillemets"']])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(parseCsv(csv)).toEqual([
      ['Nom', 'Notes'],
      ['Écurie « Le Pré »', 'ligne 1\nligne 2 ; avec "guillemets"'],
    ])
  })
  it('devine le séparateur et ignore les lignes vides', () => {
    expect(parseCsv('nom,commune\r\nA,Sète\r\n\r\nB,Lunel\r\n')).toEqual([
      ['nom', 'commune'],
      ['A', 'Sète'],
      ['B', 'Lunel'],
    ])
  })
  it('relit un fichier Excel enregistré en Windows-1252', () => {
    const bytes = new Uint8Array([0x4e, 0x6f, 0x6d, 0x0a, 0xc9, 0x63, 0x75, 0x72, 0x69, 0x65]) // "Nom\nÉcurie"
    expect(parseCsv(decodeCsv(bytes))).toEqual([['Nom'], ['Écurie']])
  })
  it('reconnaît les intitulés usuels', () => {
    const cols = mapHeaders(['Nom de la structure', 'Téléphone', 'E-mail', 'Site internet', 'CP', 'Ville'])
    expect(cols).toEqual({ name: 0, phone: 1, email: 2, website: 3, postalCode: 4, commune: 5 })
  })
  it('déduit le département du code postal', () => {
    expect(departmentFromPostalCode('34000')).toBe('34')
    expect(departmentFromPostalCode('20000')).toBe('2A')
    expect(departmentFromPostalCode('20200')).toBe('2B')
    expect(departmentFromPostalCode('97400')).toBe('974')
    expect(departmentFromPostalCode('abc')).toBe('')
  })
})

describe('Import CSV', () => {
  const file = [
    ['Nom', 'Type', 'Commune', 'Code postal', 'Téléphone', 'E-mail', 'Site', 'Source'],
    ['Écurie Nouvelle', 'écurie', 'Montpellier', '34000', '04 99 00 00 01', 'contact@nouvelle.fr', '', 'https://annuaire.exemple/1'],
    ['Haras Soleil bis', 'haras', 'Lunel', '34400', '06.11.22.33.44', '', '', ''], // téléphone déjà connu
    ['Domaine Refus', '', '', '', '', 'contact@refus.fr', '', ''], // ne plus contacter
    ['', 'poney-club', 'Sète', '', '', '', '', ''], // sans nom
    ['Poney-club Neuf', 'poney club', 'Sète', '34200', '', 'pas-un-email', 'pas un site', ''],
    ['Ecurie Nouvelle', '', 'montpellier', '', '', '', '', ''], // doublon dans le fichier
  ]

  it('l’aperçu n’enregistre rien', async () => {
    const before = (await payload.count({ collection: 'crm-prospects' })).totalDocs
    const r = await importProspects(payload, file, { dryRun: true })
    expect(r.added).toBe(2)
    expect((await payload.count({ collection: 'crm-prospects' })).totalDocs).toBe(before)
  })

  it('importe sans doublon, sans « ne plus contacter », sans rien inventer', async () => {
    const r = await importProspects(payload, file, { dryRun: false })
    expect(r.total).toBe(6)
    expect(r.addedNames).toEqual(['Écurie Nouvelle', 'Poney-club Neuf'])
    expect(r.known.map((l) => l.line)).toEqual([3, 7])
    expect(r.optOut.map((l) => l.line)).toEqual([4])
    expect(r.rejected.map((l) => l.line)).toEqual([5])
    expect(r.warnings.map((w) => w.detail)).toEqual(expect.arrayContaining([expect.stringContaining('E-mail invalide'), expect.stringContaining('site invalide')]))

    const { docs } = await payload.find({ collection: 'crm-prospects', where: { search: { equals: r.searchId } }, depth: 1, sort: 'name' })
    expect(docs).toHaveLength(2)
    const neuf = docs.find((d) => d.name === 'Poney-club Neuf')!
    expect(neuf.status).toBe('a-verifier')
    expect(neuf.type).toBe('poney-club')
    expect(neuf.email ?? '').toBe('')
    expect(neuf.emailLevel).toBe('non-trouve')
    expect(typeof neuf.department === 'object' && neuf.department?.code).toBe('34')
    const nouvelle = docs.find((d) => d.name === 'Écurie Nouvelle')!
    expect(nouvelle.sources?.map((x) => x.url)).toContain('https://annuaire.exemple/1')

    const search = await payload.findByID({ collection: 'crm-searches', id: r.searchId! })
    expect(search).toMatchObject({ trigger: 'import', status: 'terminee', found: 6, added: 2, duplicates: 2, rejected: 2 })

    // Relancer le même fichier n'ajoute plus rien
    const again = await importProspects(payload, file, { dryRun: false })
    expect(again.added).toBe(0)
  })
})

describe('Export et import : réservés à l’agence', () => {
  const reqAs = async (user: User, extra: Partial<PayloadRequest> = {}) =>
    ({ payload, user: (await as(user)).user, searchParams: new URLSearchParams(), ...extra }) as unknown as PayloadRequest

  it('un client ne peut ni exporter ni importer', async () => {
    await expect(crmExport.handler(await reqAs(clientAdmin))).rejects.toThrow()
    await expect(crmImport.handler(await reqAs(clientAdmin, { arrayBuffer: async () => new TextEncoder().encode('Nom\nX').buffer }))).rejects.toThrow()
  })

  it('agenda : mauvaise clé refusée, bonne clé = tâches non faites', async () => {
    const bad = await crmAgenda.handler(await reqAs(clientAdmin, { routeParams: { key: 'nimporte-quoi.ics' } }))
    expect(bad.status).toBe(404)
    const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    const opts = await as(superAdmin)
    const todo = await payload.create({ collection: 'crm-tasks', data: { kind: 'appel', title: 'Agenda test à faire', date: `${day}T12:00:00.000Z`, time: '10h' }, ...opts })
    const done = await payload.create({ collection: 'crm-tasks', data: { kind: 'appel', title: 'Agenda test déjà fait', date: `${day}T12:00:00.000Z`, done: true }, ...opts })
    const res = await crmAgenda.handler(await reqAs(clientAdmin, { routeParams: { key: `${agendaKey()}.ics` } }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    const ics = await res.text()
    expect(ics).toContain('Agenda test à faire')
    expect(ics).not.toContain('Agenda test déjà fait')
    await payload.delete({ collection: 'crm-tasks', id: todo.id, ...opts })
    await payload.delete({ collection: 'crm-tasks', id: done.id, ...opts })
  })

  it('le super admin exporte un CSV lisible, « Non trouvé » compris', async () => {
    const res = await crmExport.handler(await reqAs(superAdmin))
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const rows = parseCsv(await res.text())
    expect(rows[0].slice(0, 5)).toEqual(['ID', 'Nom', 'Autre nom', 'Type', 'Commune'])
    const line = rows.find((r) => r[1] === 'Poney-club Neuf')!
    expect(line[rows[0].indexOf('E-mail')]).toBe('Non trouvé')
  })

  it('le super admin peut prévisualiser un import par l’API', async () => {
    const body = new TextEncoder().encode('Nom;Commune\nÉcurie API;Agde\n')
    const res = await crmImport.handler(
      await reqAs(superAdmin, { searchParams: new URLSearchParams('apercu=1'), arrayBuffer: async () => body.buffer as ArrayBuffer }),
    )
    const report = await res.json()
    expect(report).toMatchObject({ dryRun: true, total: 1, added: 1 })
  })
})

/* ------------------------------------------------------------------ */
/* BASE DE PROSPECTION : statut simplifié et statut du projet          */
/* ------------------------------------------------------------------ */

describe('Base de prospection', () => {
  it('regroupe les 11 statuts en 4 couleurs', () => {
    expect(commercialOf('nouveau')).toBe('a-contacter')
    expect(commercialOf('brouillon-cree')).toBe('a-contacter')
    expect(commercialOf('relance')).toBe('contacte')
    expect(commercialOf('client')).toBe('accepte')
    expect(commercialOf('ne-plus-contacter')).toBe('refuse')
    expect(commercialOf(undefined)).toBe('a-contacter')
  })

  it('garde le statut détaillé quand il est déjà dans le bon groupe', () => {
    expect(statusForCommercial('contacte', 'relance')).toBe('relance')
    expect(statusForCommercial('contacte', 'nouveau')).toBe('en-attente')
    expect(statusForCommercial('refuse', 'ne-plus-contacter')).toBe('ne-plus-contacter')
    expect(statusForCommercial('refuse', 'client')).toBe('non-interesse')
    expect(statusForCommercial('a-contacter', 'en-attente')).toBe('nouveau')
  })

  it('le super admin modifie statut, site et projet ; un client ne peut pas', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie du Tableau' } })
    const admin = await as(superAdmin)
    const updated = await payload.update({
      collection: 'crm-prospects',
      id: p.id,
      data: { status: statusForCommercial('accepte', p.status), websiteStatus: 'sans-site', projectStatus: 'en-cours', notes: 'Rappeler après les concours' },
      ...admin,
    })
    expect(updated).toMatchObject({ status: 'client', websiteStatus: 'sans-site', projectStatus: 'en-cours', need: 'creation', notes: 'Rappeler après les concours' })

    const client = await as(clientAdmin)
    await expect(payload.update({ collection: 'crm-prospects', id: p.id, data: { projectStatus: 'livre' }, ...client })).rejects.toThrow()
    expect((await payload.findByID({ collection: 'crm-prospects', id: p.id })).projectStatus).toBe('en-cours')
  })

  it('l’export contient le statut du projet', async () => {
    const res = await crmExport.handler((({ payload, user: { ...superAdmin, collection: 'users' }, searchParams: new URLSearchParams() }) as unknown) as PayloadRequest)
    const rows = parseCsv(await res.text())
    const col = rows[0].indexOf('Statut du projet')
    expect(col).toBeGreaterThan(-1)
    expect(rows.find((r) => r[1] === 'Écurie du Tableau')?.[col]).toBe('En cours')
  })
})

/* ------------------------------------------------------------------ */
/* ÉTAPE 4 : recherche automatique (sources simulées, aucun accès Internet) */
/* ------------------------------------------------------------------ */

const company = (siren: string, nom: string, extra: Record<string, unknown> = {}) => ({
  siren,
  nom_complet: nom,
  nom_raison_sociale: nom,
  nature_juridique: '5499',
  activite_principale: '93.19Z',
  nombre_etablissements_ouverts: 1,
  matching_etablissements: [{ code_postal: '34270', libelle_commune: 'SAINT-MATHIEU-DE-TREVIERS', adresse: '1 CHEMIN DES PINS 34270 SAINT-MATHIEU-DE-TREVIERS' }],
  ...extra,
})
const COMPANIES = [
  company('111111111', 'ECURIE DU SOLEIL LEVANT'),
  company('222222222', 'JEAN MARTIN', { activite_principale: '01.43Z', matching_etablissements: [{ code_postal: '34000', libelle_commune: 'MONTPELLIER' }] }),
  company('333333333', 'COMMUNE DE TRUC CENTRE EQUESTRE MUNICIPAL', { nature_juridique: '7210' }),
  company('444444444', 'HARAS GRANDE CHAINE', { nombre_etablissements_ouverts: 12 }),
  company('555555555', 'DOMAINE REFUS', { matching_etablissements: [{ code_postal: '34000', libelle_commune: 'MONTPELLIER' }] }),
]
const OSM = [
  { type: 'node', id: 1, tags: { name: 'Ecurie du Soleil Levant', 'addr:city': 'Saint-Mathieu-de-Tréviers', phone: '04 67 55 55 55' } },
  { type: 'node', id: 2, tags: { name: 'Domaine Refus', email: 'contact@refus.fr' } },
  { type: 'way', id: 3, tags: { name: 'Poney Club des Garrigues', 'addr:city': 'Viols-le-Fort', website: 'https://garrigues.test' } },
  { type: 'node', id: 4, tags: { name: 'Haras Soleil', phone: '+33611223344' } },
]
const fakeFetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes('recherche-entreprises')) return Response.json({ results: COMPANIES, total_pages: 1 })
  if (url.includes('interpreter')) return Response.json({ elements: OSM })
  if (url.endsWith('/robots.txt')) return new Response('', { status: 404 })
  if (url.startsWith('https://garrigues.test')) {
    return new Response('<html><a href="mailto:contact@garrigues.test">Écrire</a> 04 67 12 34 56</html>', { headers: { 'content-type': 'text/html' } })
  }
  return new Response('', { status: 404 })
}) as typeof fetch

describe('Recherche de prospects', () => {
  it('met les noms en forme sans inventer', () => {
    expect(title('ECURIE DU SOLEIL LEVANT')).toBe('Ecurie du Soleil Levant')
    expect(title('SAINT-MATHIEU-DE-TREVIERS')).toBe('Saint-Mathieu-de-Treviers')
  })

  it('la recherche du lundi part le lundi à partir de 9 h (heure de Paris)', () => {
    expect(isMondayAfter9Paris(new Date('2026-11-23T08:30:00Z'))).toBe(true) // lundi 9 h 30 à Paris
    expect(isMondayAfter9Paris(new Date('2026-11-23T07:30:00Z'))).toBe(false) // lundi 8 h 30
    expect(isMondayAfter9Paris(new Date('2026-11-24T09:00:00Z'))).toBe(false) // mardi
    expect(isMondayAfter9Paris(new Date('2026-06-22T07:05:00Z'))).toBe(true) // lundi 9 h 05, heure d’été
  })

  it('ajoute les nouvelles structures, écarte doublons, refus, public, réseaux et élevages', async () => {
    const zone = (await payload.find({ collection: 'crm-zones', where: { code: { equals: '34' } }, limit: 1 })).docs[0]
    await payload.updateGlobal({ slug: 'crm-settings', data: { includeBreeders: false, maxSiteChecks: 10 } })
    const id = await runCrmSearch(payload, { trigger: 'manuel', zoneIds: [zone.id], target: 5 }, fakeFetch)

    const search = await payload.findByID({ collection: 'crm-searches', id })
    expect(search).toMatchObject({ status: 'terminee', trigger: 'manuel', target: 5, added: 2, duplicates: 1, rejected: 4 })
    expect(search.report).toContain('Rien n’a été inventé')

    const { docs } = await payload.find({ collection: 'crm-prospects', where: { search: { equals: id } }, sort: 'name', depth: 0 })
    expect(docs.map((d) => d.name)).toEqual(['Ecurie du Soleil Levant', 'Poney Club des Garrigues'])

    const ecurie = docs[0]
    expect(ecurie).toMatchObject({ status: 'a-verifier', siren: '111111111', phone: '04 67 55 55 55', commune: 'Saint-Mathieu-de-Treviers', department: zone.id })
    expect(ecurie.email ?? '').toBe('')
    expect(ecurie.emailLevel).toBe('non-trouve')
    expect(ecurie.websiteStatus).toBe('a-verifier') // absent des sources ≠ « pas de site »
    expect(ecurie.sources?.map((x) => x.label)).toEqual(expect.arrayContaining(['Annuaire des entreprises (État)', 'OpenStreetMap']))

    const poney = docs[1]
    expect(poney).toMatchObject({ email: 'contact@garrigues.test', website: 'https://garrigues.test', websiteStatus: 'site-existant', type: 'poney-club' })
    expect(poney.sources?.map((x) => x.label)).toContain('Site de l’établissement')

    expect((await payload.findByID({ collection: 'crm-zones', id: zone.id })).lastSearchedAt).toBeTruthy()

    // Relancée : tout est déjà connu, rien n'est ajouté deux fois
    const again = await runCrmSearch(payload, { trigger: 'manuel', zoneIds: [zone.id], target: 5 }, fakeFetch)
    expect((await payload.findByID({ collection: 'crm-searches', id: again })).added).toBe(0)
  }, 60_000)

  it('un client ne peut pas lancer de recherche', async () => {
    const req = { payload, user: (await as(clientAdmin)).user, json: async () => ({}) } as unknown as PayloadRequest
    await expect(crmSearch.handler(req)).rejects.toThrow()
  })
})

/* ------------------------------------------------------------------ */
/* Autre nom, joignables uniquement, import qui complète                */
/* ------------------------------------------------------------------ */

describe('Autre nom et complément des fiches', () => {
  it('l’autre nom repère un doublon sous le nom d’usage', async () => {
    const legal = await payload.create({
      collection: 'crm-prospects',
      data: { status: 'nouveau', name: 'Écuries de la Payssière', otherNames: 'Haras des As', commune: 'Pézenas' },
    })
    expect(legal.altNameKey).toBe('as')
    const usage = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Haras des As', commune: 'Pezenas' } })
    const dup = await payload.find({ collection: 'crm-duplicates', where: { prospect: { equals: usage.id } }, depth: 0 })
    expect(dup.docs[0]?.existing).toBe(legal.id)
  })

  it('l’import complète une fiche par son ID sans rien remplacer', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'a-verifier', name: 'Écurie à compléter', website: 'https://deja-la.test' } })
    const rows = [
      ['ID', 'Nom', 'Autre nom', 'Téléphone', 'E-mail', 'Site', 'Source'],
      [String(p.id), 'Écurie à compléter', 'Le Petit Haras', '06 98 76 54 32', 'contact@petit-haras.test', 'https://autre-site.test', 'https://facebook.com/petitharas'],
    ]
    const preview = await importProspects(payload, rows, { dryRun: true, complete: true })
    expect(preview.completed).toHaveLength(1)
    expect((await payload.findByID({ collection: 'crm-prospects', id: p.id })).phone ?? '').toBe('')

    const r = await importProspects(payload, rows, { dryRun: false, complete: true })
    expect(r.added).toBe(0)
    expect(r.completed[0].detail).toContain('téléphone')
    const after = await payload.findByID({ collection: 'crm-prospects', id: p.id })
    expect(after).toMatchObject({ phone: '06 98 76 54 32', email: 'contact@petit-haras.test', otherNames: 'Le Petit Haras', website: 'https://deja-la.test' })
    expect(after.sources?.map((x) => x.url)).toContain('https://facebook.com/petitharas')

    // Sans la case « compléter », la ligne est seulement signalée comme déjà connue
    const plain = await importProspects(payload, rows, { dryRun: true })
    expect(plain.completed).toHaveLength(0)
    expect(plain.known).toHaveLength(1)
  })

  it('l’import complète par SIREN, avec autres téléphones / e-mails, et ignore « Non trouvé »', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'a-verifier', name: 'Cheval Malepère Test', commune: 'Villarzel', siren: '493893556', phone: '04 68 00 00 01' } })
    const rows = [
      ['Nom', 'Commune', 'SIREN', 'Téléphone', 'E-mail', 'Autres téléphones', 'Autres e-mails', 'Source', 'Remarque (non importée)'],
      ['Cheval Malepere', 'Villarzel du Razes', '493893556', '+33 6 76 84 41 25', 'Non trouvé', '+33 7 61 99 39 74 (2e numéro) ; 04 68 00 00 01', 'resa@malepere.test', 'https://exemple.test/fiche', 'à vérifier'],
    ]
    const r = await importProspects(payload, rows, { dryRun: false, complete: true })
    expect(r.added).toBe(0)
    expect(r.completed).toHaveLength(1)
    const after = await payload.findByID({ collection: 'crm-prospects', id: p.id, depth: 0 })
    expect(after.phone).toBe('04 68 00 00 01') // jamais remplacé
    expect(after.email ?? '').toBe('') // « Non trouvé » ignoré
    expect(after.otherPhones?.map((t) => [t.number, t.label])).toEqual([['+33 6 76 84 41 25', null], ['+33 7 61 99 39 74', '2e numéro']])
    expect(after.otherEmails?.map((e) => e.address)).toEqual(['resa@malepere.test'])
    const again = await importProspects(payload, rows, { dryRun: true, complete: true })
    expect(again.completed).toHaveLength(0)
  })

  it('« joignables uniquement » : une structure sans téléphone ni e-mail n’est pas ajoutée', async () => {
    const zone = (await payload.find({ collection: 'crm-zones', where: { code: { equals: '30' } }, limit: 1 })).docs[0]
    const lonely = (async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.includes('recherche-entreprises'))
        return Response.json({ results: [company('999999999', 'ECURIE SANS CONTACT', { matching_etablissements: [{ code_postal: '30000', libelle_commune: 'NIMES' }] })], total_pages: 1 })
      if (url.includes('interpreter')) return Response.json({ elements: [] })
      return new Response('', { status: 404 })
    }) as typeof fetch
    await payload.updateGlobal({ slug: 'crm-settings', data: { onlyReachable: true } })
    const a = await runCrmSearch(payload, { trigger: 'manuel', zoneIds: [zone.id], target: 5 }, lonely)
    const sa = await payload.findByID({ collection: 'crm-searches', id: a })
    expect(sa.added).toBe(0)
    expect(sa.report).toContain('sans téléphone ni e-mail')

    await payload.updateGlobal({ slug: 'crm-settings', data: { onlyReachable: false } })
    const b = await runCrmSearch(payload, { trigger: 'manuel', zoneIds: [zone.id], target: 5 }, lonely)
    expect((await payload.findByID({ collection: 'crm-searches', id: b })).added).toBe(1)
    await payload.updateGlobal({ slug: 'crm-settings', data: { onlyReachable: true } })
  }, 30_000)
})

describe('Modèles d’e-mails et coordonnées multiples', () => {
  it('personnalise un modèle sans rien inventer', () => {
    const p = { name: 'Écuries du Lac', commune: 'Sète', website: 'https://www.ecuries-du-lac.fr/', type: 'haras' }
    expect(fillTemplate('Bonjour {{nom}} à {{ commune }}, votre site {{site}} ({{type}})', p)).toBe('Bonjour Écuries du Lac à Sète, votre site ecuries-du-lac.fr (haras)')
    expect(fillTemplate('Site : {{site}}', { name: 'Sans site' })).toBe('Site : [site ?]')
    expect(fillTemplate('{{inconnu}} reste tel quel', p)).toBe('{{inconnu}} reste tel quel')
  })

  it('prépare un lien de messagerie avec objet et texte', () => {
    const link = mailtoLink(['a@b.fr', 'c@d.fr'], 'Objet é', 'Ligne 1\nLigne 2')
    expect(link.startsWith('mailto:a@b.fr,c@d.fr?subject=Objet%20%C3%A9&body=')).toBe(true)
    expect(link).toContain('Ligne%201%0D%0ALigne%202')
  })

  it('ajoute une seule fois la phrase de refus', () => {
    expect(withOptOut('Bonjour,\n\nCordialement\n')).toBe(`Bonjour,\n\nCordialement\n\n${OPT_OUT_LINE}`)
    expect(withOptOut(`Texte\n\n${OPT_OUT_LINE}`)).toBe(`Texte\n\n${OPT_OUT_LINE}`)
    expect(withOptOut('Pour vous désinscrire, répondez non.')).toBe('Pour vous désinscrire, répondez non.')
    expect(withOptOut('')).toBe('')
  })

  it('prépare un agenda lisible par Outlook', () => {
    expect(parseTime('14h30')).toEqual([14, 30])
    expect(parseTime('9h')).toEqual([9, 0])
    expect(parseTime('soir')).toBeNull()
    const ics = buildIcs(
      [
        { uid: 'tache-1', day: '2026-11-24', time: '14:30', title: 'Appel : Écuries, du Lac; test', url: 'https://cms.test/admin/prospection/base?fiche=1' },
        { uid: 'relance-p2', day: '2026-11-25', title: 'Relance : Haras ' + 'x'.repeat(120) },
      ],
      new Date('2026-11-23T10:00:00Z'),
    )
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20261124T143000\r\nDTEND;TZID=Europe/Paris:20261124T150000')
    expect(ics).toContain('SUMMARY:Appel : Écuries\\, du Lac\\; test')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261125\r\nDTEND;VALUE=DATE:20261126')
    for (const line of ics.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
    expect(agendaUrl('https://cms.test/')).toBe(`https://cms.test/api/crm-agenda/${agendaKey()}.ics`)
  })

  it('ouvre le brouillon dans Outlook (application ou web)', () => {
    const app = outlookLink('app', ['a@b.fr', 'c@d.fr'], 'Objet é', 'Ligne 1\nLigne 2')
    expect(app).toBe('ms-outlook://compose?to=a@b.fr,c@d.fr&subject=Objet%20%C3%A9&body=Ligne%201%0ALigne%202')
    const pro = outlookLink('pro', ['a@b.fr', 'c@d.fr'], 'Objet', 'Texte')
    expect(pro).toBe('https://outlook.office.com/mail/deeplink/compose?to=a%40b.fr;c%40d.fr&subject=Objet&body=Texte')
    expect(outlookLink('perso', ['a@b.fr'], 'O', 'T').startsWith('https://outlook.live.com/mail/0/deeplink/compose?to=a%40b.fr&')).toBe(true)
    expect(outlookLink('mailto', ['a@b.fr'], 'O', 'T').startsWith('mailto:a@b.fr?')).toBe(true)
  })

  it('enregistre un modèle et plusieurs téléphones / e-mails sur une fiche', async () => {
    const opts = await as(superAdmin)
    const t = await payload.create({
      collection: 'crm-email-templates',
      data: { name: 'Refonte – premier contact', kind: 'refonte', subject: 'Un nouveau site pour {{nom}} ?', body: 'Bonjour…' },
      ...opts,
    })
    expect(t.kind).toBe('refonte')

    const p = await payload.create({
      collection: 'crm-prospects',
      data: {
        status: 'nouveau',
        name: 'Domaine aux deux numéros',
        phone: '04 67 11 22 33',
        otherPhones: [{ number: '06 11 22 33 44', label: 'Portable du gérant' }],
        otherEmails: [{ address: 'gerant@deux-numeros.fr' }, { address: 'resa@deux-numeros.fr', label: 'Réservations' }],
      },
      ...opts,
    })
    const again = await payload.findByID({ collection: 'crm-prospects', id: p.id, depth: 0 })
    expect(again.otherPhones?.map((x) => x.number)).toEqual(['06 11 22 33 44'])
    expect(again.otherEmails?.map((x) => x.address)).toEqual(['gerant@deux-numeros.fr', 'resa@deux-numeros.fr'])
  })

  it('un client ne voit pas les modèles d’e-mails', async () => {
    const opts = await as(clientAdmin)
    await expect(payload.create({ collection: 'crm-email-templates', data: { name: 'Intrus', kind: 'autre' }, ...opts })).rejects.toThrow()
  })
})

describe('Doublons : la fiche la plus complète prend le dessus', () => {
  it('fusionne en gardant la fiche la plus complète, sans rien écraser, avec son historique', async () => {
    const poor = await payload.create({ collection: 'crm-prospects', data: { status: 'email-envoye', name: 'Écurie Fusion', commune: 'Gruissan', phone: '04 68 11 11 11', notes: 'Appelée en octobre' } })
    await payload.create({ collection: 'crm-activities', data: { prospect: poor.id, kind: 'appel', date: new Date().toISOString(), summary: 'Premier appel' } })
    const rich = await payload.create({
      collection: 'crm-prospects',
      data: { status: 'a-verifier', name: 'Ecurie Fusion', commune: 'Gruissan', phone: '06 22 22 22 22', email: 'contact@fusion.test', website: 'https://fusion.test', siren: '111222333', address: '1 chemin des Pins' },
    })
    const r = await mergeProspects(payload, poor.id, rich.id)
    expect(r.keptId).toBe(rich.id)
    await expect(payload.findByID({ collection: 'crm-prospects', id: poor.id })).rejects.toThrow()
    const kept = await payload.findByID({ collection: 'crm-prospects', id: rich.id, depth: 0 })
    expect(kept.phone).toBe('06 22 22 22 22') // jamais écrasé
    expect(kept.otherPhones?.map((t) => t.number)).toEqual(['04 68 11 11 11'])
    expect(kept.status).toBe('email-envoye') // le statut le plus avancé est gardé
    expect(kept.notes).toContain('Appelée en octobre')
    const acts = await payload.find({ collection: 'crm-activities', where: { prospect: { equals: rich.id } }, depth: 0 })
    expect(acts.docs.map((a) => a.summary).join(' | ')).toContain('Premier appel')
    expect(acts.docs.some((a) => a.summary.includes('Doublon fusionné'))).toBe(true)
  })

  it('« C’est un doublon » fusionne la paire ; un simple téléphone commun n’est pas fusionné automatiquement', async () => {
    const a = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Haras du Téléphone', commune: 'Bages', phone: '06 33 33 33 33' } })
    const b = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Poney Club Voisin', commune: 'Bages', phone: '06 33 33 33 33', email: 'voisin@test.test' } })
    const dup = (await payload.find({ collection: 'crm-duplicates', where: { prospect: { equals: b.id } }, depth: 0 })).docs[0]
    expect(dup?.reasons).toEqual(['telephone'])
    const merged = await autoMergeDuplicates(payload)
    expect(merged.some((m) => [m.keptId, m.removedId].includes(a.id))).toBe(false)

    await payload.update({ collection: 'crm-duplicates', id: dup.id, data: { status: 'doublon' } })
    await expect(payload.findByID({ collection: 'crm-prospects', id: a.id })).rejects.toThrow()
    const kept = await payload.findByID({ collection: 'crm-prospects', id: b.id, depth: 0 })
    expect(kept.otherNames).toContain('Haras du Téléphone')
  })

  it('deux SIREN différents ne sont jamais fusionnés automatiquement', async () => {
    const a = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Domaine Double', commune: 'Pexiora', siren: '444555666' } })
    await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Domaine Double', commune: 'Pexiora', siren: '777888999', email: 'double@test.test' } })
    await autoMergeDuplicates(payload)
    expect((await payload.findByID({ collection: 'crm-prospects', id: a.id })).id).toBe(a.id)
  })
})

describe('Calendrier : tâches du jour', () => {
  it('enregistre une tâche (avec ou sans prospect) et la place au bon jour', async () => {
    const p = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie du Calendrier', commune: 'Limoux' } })
    await payload.create({ collection: 'crm-tasks', data: { kind: 'appel', title: 'Appeler pour le devis', date: '2026-12-03T12:00:00.000Z', time: '14:30', prospect: p.id } })
    await payload.create({ collection: 'crm-tasks', data: { kind: 'recherche', title: 'Recherche Hérault', date: '2026-12-03T12:00:00.000Z' } })
    const tasks = await loadTasks(payload, undefined as never, monthCells(2026, 12))
    const day = tasks.filter((t) => t.day === '2026-12-03')
    expect(day.map((t) => t.title).sort()).toEqual(['Appeler pour le devis', 'Recherche Hérault'])
    expect(day.find((t) => t.kind === 'appel')?.prospectName).toBe('Écurie du Calendrier')
  })
})

describe('Entreprises qui n’existent plus', () => {
  it('passe en « N’existe plus » une entreprise cessée (SIREN), sans toucher aux autres', async () => {
    const closed = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Ancienne Écurie', siren: '111 111 111' } })
    const open = await payload.create({ collection: 'crm-prospects', data: { status: 'nouveau', name: 'Écurie Ouverte', siren: '222222222' } })
    const fetcher = (async (url: string | URL) => {
      const siren = new URL(String(url)).searchParams.get('q')
      const etat = siren === '111111111' ? 'C' : 'A'
      return new Response(JSON.stringify({ results: [{ siren, etat_administratif: etat, date_fermeture: etat === 'C' ? '2024-06-30' : null }] }), { status: 200 })
    }) as typeof fetch
    const r = await checkClosedProspects(payload, { ids: [closed.id, open.id], fetcher, pauseMs: 0 })
    expect(r.closed.map((c) => c.id)).toEqual([closed.id])
    const a = await payload.findByID({ collection: 'crm-prospects', id: closed.id, depth: 0 })
    expect(a.status).toBe('ferme')
    expect(a.doNotContact).toBe(true)
    const b = await payload.findByID({ collection: 'crm-prospects', id: open.id, depth: 0 })
    expect(b.status).toBe('nouveau')
    const notes = await payload.find({ collection: 'crm-activities', where: { prospect: { equals: closed.id } }, depth: 0 })
    expect(notes.docs[0]?.summary).toContain('Entreprise fermée')
    // pas ajoutée à la liste « ne plus contacter » (qui sert aux refus)
    expect((await payload.count({ collection: 'crm-optouts', where: { prospect: { equals: closed.id } } })).totalDocs).toBe(0)
  })
})
