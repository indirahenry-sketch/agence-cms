import type { Payload } from 'payload'

/**
 * Les sites de Poigny, Montesugui, Sourdun et la Castelle sont des MAQUETTES montrées en prospection.
 * Leurs coordonnées réelles sont remplacées par des coordonnées fictives (adresses e-mail en
 * « .example », domaine réservé qui n'existe pas ; numéros et rues inventés), pour que personne
 * n'appelle ni n'écrive aux vraies structures depuis une maquette.
 *
 * Au démarrage, chaque texte des fiches, informations, menus, pages, articles, événements, services,
 * tarifs, bannières et photos de ces clients est relu : seules les valeurs réelles connues ci-dessous
 * sont remplacées. Relançable sans risque (une fois remplacé, plus rien ne change).
 */
const phoneVariants = (real: string, fake: string): [string, string][] => {
  const d = real.replace(/\D/g, '')
  const f = fake.replace(/\D/g, '')
  const pairs = (n: string) => [n.replace(/(\d{2})(?=\d)/g, '$1 '), n, n.replace(/(\d{2})(?=\d)/g, '$1.'), `+33 ${n.slice(1, 2)} ${n.slice(2).replace(/(\d{2})(?=\d)/g, '$1 ')}`, `+33${n.slice(1)}`]
  const a = pairs(d)
  const b = pairs(f)
  return a.map((x, i) => [x, b[i]])
}

export const FICTIONAL: { slug: string; pairs: [string, string][] }[] = [
  {
    slug: 'ecuries-poigny',
    pairs: [
      ['https://www.google.com/maps/search/?api=1&query=24+route+de+la+Ferme+d%27Hennepont+77160+Poigny', 'https://www.google.com/maps/search/?api=1&query=Poigny+77160'],
      ["24 route de la Ferme d'Hennepont", '12 chemin des Prés'],
      ["route de la Ferme d'Hennepont", 'chemin des Prés'],
      ['ecuriespoigny@gmail.com', 'contact@ecuries-poigny.example'],
      ['Instagram @ecuries_poigny', 'Instagram'],
      ['https://www.instagram.com/ecuries_poigny', 'https://www.instagram.com/'],
      ...phoneVariants('06 27 67 92 88', '06 12 34 56 78'),
    ],
  },
  {
    slug: 'centre-equestre-sourdun',
    pairs: [
      ['https://www.google.com/maps/search/?api=1&query=Centre+%C3%A9questre+de+Sourdun+126+rue+de+Paris+77171+Sourdun', 'https://www.google.com/maps/search/?api=1&query=Sourdun+77171'],
      ['126 rue de Paris, quartier de Lattre de Tassigny,', '8 allée des Cavaliers,'],
      ['126 rue de Paris', '8 allée des Cavaliers'],
      ['c.e.sourdun@gmail.com', 'contact@centre-equestre-sourdun.example'],
      ['https://www.facebook.com/CentreEquestreSourdun/', 'https://www.facebook.com/'],
      ['https://www.facebook.com/CentreEquestreSourdun', 'https://www.facebook.com/'],
      ...phoneVariants('07 84 34 30 81', '07 12 34 56 78'),
    ],
  },
  {
    slug: 'castelle',
    pairs: [
      ['https://www.google.com/maps/search/?api=1&query=Domaine+Equestre+de+la+Castelle', 'https://www.google.com/maps/search/?api=1&query=Saint-Jean-de-V%C3%A9das+34430'],
      ['dedc34@yahoo.com', 'contact@domaine-castelle.example'],
      ['https://www.facebook.com/profile.php?id=61554556564503', 'https://www.facebook.com/'],
      ...phoneVariants('06 14 60 22 46', '06 23 45 67 89'),
      ...phoneVariants('06 10 44 25 77', '04 12 34 56 78'),
    ],
  },
  { slug: 'haras-montesugui', pairs: [['contact@haras-montesugui.fr', 'contact@haras-montesugui.example']] },
]

export const replaceAll = (s: string, pairs: [string, string][]) => pairs.reduce((acc, [a, b]) => acc.split(a).join(b), s)

const deepReplace = (v: unknown, pairs: [string, string][]): unknown => {
  if (typeof v === 'string') return replaceAll(v, pairs)
  if (Array.isArray(v)) return v.map((x) => deepReplace(x, pairs))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepReplace(x, pairs)]))
  return v
}

const SKIP = new Set(['id', 'createdAt', 'updatedAt', 'tenant', '_status', 'slug', 'url', 'filename', 'mimeType', 'filesize', 'width', 'height', 'sizes', 'focalX', 'focalY', 'thumbnailURL'])
const COLLECTIONS = ['site-info', 'menus', 'pages', 'posts', 'events', 'services', 'prices', 'promotions', 'media'] as const

/** Les données d'un client concerné (repéré comme les imports : identifiant ou nom). */
const matchTenant = (t: { slug?: string | null; name?: string | null }, slug: string) =>
  t.slug === slug || (slug === 'castelle' && /castelle|dedc/i.test(`${t.slug ?? ''} ${t.name ?? ''}`))

export const fictionalizeMockups = async (payload: Payload): Promise<number> => {
  const base = { overrideAccess: true, depth: 0, context: { skipInvite: true, skipAudit: true } } as const
  const tenants = await payload.find({ collection: 'tenants', limit: 0, pagination: false, ...base })
  let changed = 0
  for (const t of tenants.docs) {
    const target = FICTIONAL.find((f) => matchTenant(t, f.slug))
    if (!target) continue
    const fix = async (collection: 'tenants' | (typeof COLLECTIONS)[number], doc: Record<string, unknown>) => {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(doc)) {
        if (SKIP.has(k) || v === null || typeof v === 'number' || typeof v === 'boolean') continue
        const next = deepReplace(v, target.pairs)
        if (JSON.stringify(next) !== JSON.stringify(v)) data[k] = next
      }
      if (!Object.keys(data).length) return
      await payload.update({ collection, id: doc.id as number, data: data as never, ...base })
      changed++
    }
    await fix('tenants', t as unknown as Record<string, unknown>)
    for (const collection of COLLECTIONS) {
      const docs = await payload.find({ collection, where: { tenant: { equals: t.id } }, limit: 0, pagination: false, draft: true, ...base }).catch(() => ({ docs: [] }))
      for (const d of docs.docs) {
        try {
          await fix(collection, d as unknown as Record<string, unknown>)
        } catch (err) {
          payload.logger.warn({ err }, `Maquettes : ${collection} ${(d as { id: number }).id} non modifié`)
        }
      }
    }
  }
  if (changed) payload.logger.info(`Maquettes : coordonnées fictives appliquées (${changed} élément(s))`)
  return changed
}
