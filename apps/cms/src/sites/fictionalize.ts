import type { Payload } from 'payload'

/**
 * Maquettes montrées en prospection : structures FICTIVES.
 * - « Les Écuries de Paraguy » est une COPIE fictive de Poigny (sites/ecuries-paraguy) ; Poigny
 *   reste intact (vrai nom, vrai logo, vraies coordonnées) pour être démarché.
 * - « Domaine Équestre de la Castelle » devient « Domaine Équestre del Caraminho »
 *   (identifiant domaine-equestre-del-caraminho ; le sigle DEDC reste valable).
 * - Coordonnées réelles remplacées par des coordonnées fictives : e-mails en « .example » (domaine
 *   réservé qui n'existe pas), numéros et rues inventés, réseaux sociaux génériques.
 * Poigny et Sourdun ne sont PAS concernés pour l'instant (maquettes envoyées aux structures elles-mêmes).
 *
 * Au démarrage (avant les imports), chaque texte des fiches, informations, menus, pages, articles,
 * événements, services, tarifs, bannières et photos de ces clients est relu : seules les valeurs
 * réelles connues ci-dessous sont remplacées. Relançable sans risque.
 */
const phoneVariants = (real: string, fake: string): [string, string][] => {
  const forms = (n: string) => [n.replace(/(\d{2})(?=\d)/g, '$1 '), n, n.replace(/(\d{2})(?=\d)/g, '$1.'), `+33 ${n.slice(1, 2)} ${n.slice(2).replace(/(\d{2})(?=\d)/g, '$1 ')}`, `+33${n.slice(1)}`]
  const a = forms(real.replace(/\D/g, ''))
  const b = forms(fake.replace(/\D/g, ''))
  return a.map((x, i) => [x, b[i]])
}

type Mockup = {
  key: string
  match: (t: { slug?: string | null; name?: string | null }) => boolean
  rename?: { name: string; slug: string; oldLogoAlt?: string }
  pairs: [string, string][]
}

export const FICTIONAL: Mockup[] = [
  {
    key: 'caraminho',
    match: (t) => /castelle|dedc|caraminho/i.test(`${t.slug ?? ''} ${t.name ?? ''}`),
    rename: { name: 'Domaine Équestre del Caraminho', slug: 'domaine-equestre-del-caraminho' },
    pairs: [
      ['https://www.google.com/maps/search/?api=1&query=Domaine+Equestre+de+la+Castelle', 'https://www.google.com/maps/search/?api=1&query=Saint-Jean-de-V%C3%A9das+34430'],
      ['maps.google.com/maps?q=Domaine%20equestre%20de%20la%20Castelle', 'maps.google.com/maps?q=Saint-Jean-de-V%C3%A9das%2034430'],
      ['dedc34@yahoo.com', 'contact@domaine-caraminho.example'],
      ['https://www.facebook.com/profile.php?id=61554556564503', 'https://www.facebook.com/'],
      ...phoneVariants('06 14 60 22 46', '06 23 45 67 89'),
      ...phoneVariants('06 10 44 25 77', '04 12 34 56 78'),
      ['De la Castelle', 'del Caraminho'],
      ['de la Castelle', 'del Caraminho'],
      ['à la Castelle', 'au Caraminho'],
      ['la Castelle', 'le Caraminho'],
      ['CASTELLE', 'CARAMINHO'],
      ['Castelle', 'Caraminho'],
    ],
  },
  { key: 'montesugui', match: (t) => t.slug === 'haras-montesugui', pairs: [['contact@haras-montesugui.fr', 'contact@haras-montesugui.example']] },
]

export const replaceAll = (s: string, pairs: [string, string][]) => pairs.reduce((acc, [a, b]) => acc.split(a).join(b), s)

const deepReplace = (v: unknown, pairs: [string, string][]): unknown => {
  if (typeof v === 'string') return replaceAll(v, pairs)
  if (Array.isArray(v)) return v.map((x) => deepReplace(x, pairs))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepReplace(x, pairs)]))
  return v
}

const SKIP = new Set(['id', 'createdAt', 'updatedAt', 'tenant', '_status', 'slug', 'url', 'filename', 'mimeType', 'filesize', 'width', 'height', 'sizes', 'focalX', 'focalY', 'thumbnailURL', 'logo', 'domains'])
const COLLECTIONS = ['site-info', 'menus', 'pages', 'posts', 'events', 'services', 'prices', 'promotions', 'media'] as const

/** Renomme les maquettes et remplace leurs vraies coordonnées. Renvoie le nombre d'éléments modifiés. */
export const fictionalizeMockups = async (payload: Payload): Promise<number> => {
  const base = { overrideAccess: true, depth: 0, context: { skipInvite: true, skipAudit: true } } as const
  const tenants = await payload.find({ collection: 'tenants', limit: 0, pagination: false, ...base })
  let changed = 0
  for (const t of tenants.docs) {
    const target = FICTIONAL.find((f) => f.match(t))
    if (!target) continue
    const pairs = [...target.pairs]

    // 1. Nom et identifiant (adresse /sites/…) ; les liens internes suivent
    if (target.rename && (t.slug !== target.rename.slug || t.name !== target.rename.name)) {
      const taken = t.slug !== target.rename.slug && (await payload.count({ collection: 'tenants', where: { slug: { equals: target.rename.slug } }, overrideAccess: true })).totalDocs > 0
      const slug = taken ? t.slug : target.rename.slug
      if (slug !== t.slug) pairs.unshift([`/sites/${t.slug}/`, `/sites/${slug}/`], [`/sites/${t.slug}#`, `/sites/${slug}#`], [`/sites/${t.slug}"`, `/sites/${slug}"`])
      await payload.update({ collection: 'tenants', id: t.id, data: { name: target.rename.name, slug }, ...base })
      changed++
      if (slug !== t.slug) pairs.push([`/sites/${t.slug}`, `/sites/${slug}`])
    }

    // 2. Ancien logo portant le vrai nom : retiré (l'import remet le logo fictif)
    if (target.rename?.oldLogoAlt && t.logo) {
      const logo = await payload.findByID({ collection: 'media', id: typeof t.logo === 'object' ? t.logo.id : t.logo, ...base, disableErrors: true })
      if (logo?.alt === target.rename.oldLogoAlt) {
        await payload.update({ collection: 'tenants', id: t.id, data: { logo: null }, ...base })
        await payload.delete({ collection: 'media', id: logo.id, ...base }).catch((err) => payload.logger.warn({ err }, 'Maquettes : ancien logo non supprimé'))
        changed++
      }
    }

    // 3. Textes : coordonnées et noms
    const fix = async (collection: 'tenants' | (typeof COLLECTIONS)[number], doc: Record<string, unknown>) => {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(doc)) {
        if (SKIP.has(k) || (collection === 'tenants' && k === 'name') || v === null || typeof v === 'number' || typeof v === 'boolean') continue
        const next = deepReplace(v, pairs)
        if (JSON.stringify(next) !== JSON.stringify(v)) data[k] = next
      }
      if (!Object.keys(data).length) return
      await payload.update({ collection, id: doc.id as number, data: data as never, ...base })
      changed++
    }
    await fix('tenants', (await payload.findByID({ collection: 'tenants', id: t.id, ...base })) as unknown as Record<string, unknown>)
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
  if (changed) payload.logger.info(`Maquettes : noms et coordonnées fictifs appliqués (${changed} élément(s))`)
  return changed
}
