/**
 * « Clés de comparaison » pour repérer les doublons malgré des écritures différentes :
 *   « Les Écuries de Poigny » et « ECURIE POIGNY »         → même nom
 *   « 06 12 34 56 78 » et « +33 6 12 34 56 78 »            → même téléphone
 *   « https://www.ecurie.fr/contact » et « ecurie.fr »     → même site
 * Ces fonctions sont pures (aucun accès à la base) et testées dans tests/crm.test.ts.
 */

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

const basic = (s: string | null | undefined) =>
  stripAccents(String(s ?? ''))
    .toLowerCase()
    .replace(/['’`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Mots trop courants dans les noms de structures pour aider à les distinguer. */
const NAME_STOPWORDS = new Set([
  'ecurie', 'ecuries', 'centre', 'centres', 'equestre', 'equestres', 'equitation', 'poney', 'poneys', 'club', 'clubs',
  'domaine', 'haras', 'elevage', 'elevages', 'pension', 'pensions', 'cheval', 'chevaux', 'ferme', 'ranch',
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'en', 'a', 'au', 'aux',
  'sarl', 'eurl', 'sas', 'sasu', 'earl', 'scea', 'gaec', 'sci', 'ei', 'eirl', 'association', 'asso',
])

/** Nom de structure réduit à ses mots distinctifs (« Les Écuries de Poigny » → « poigny »). */
export const nameKey = (name: string | null | undefined): string => {
  const words = basic(name).split(' ').filter(Boolean)
  const kept = words.filter((w) => !NAME_STOPWORDS.has(w))
  // Si le nom n'est fait QUE de mots courants (« Centre équestre »), on garde le nom complet
  return (kept.length ? kept : words).join(' ')
}

/** Commune normalisée (« Saint-Martin-de-Londres » = « st martin de londres »). */
export const communeKey = (commune: string | null | undefined): string =>
  basic(commune)
    .split(' ')
    .map((w) => (w === 'st' ? 'saint' : w === 'ste' ? 'sainte' : w))
    .join(' ')

/** Téléphone : seulement les 9 derniers chiffres (ignore 0, +33, 0033, espaces, points). */
export const phoneKey = (phone: string | null | undefined): string => {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : ''
}

export const emailKey = (email: string | null | undefined): string => {
  const e = String(email ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''
}

/** Sites partagés par tout le monde : on compare alors aussi la page (facebook.com/mon-ecurie). */
const SHARED_HOSTS = new Set([
  'facebook.com', 'm.facebook.com', 'fr-fr.facebook.com', 'instagram.com', 'linktr.ee', 'pagesjaunes.fr', 'google.com', 'sites.google.com',
])

export const domainKey = (url: string | null | undefined): string => {
  let raw = String(url ?? '').trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  try {
    const u = new URL(raw)
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    if (!host.includes('.')) return ''
    if (SHARED_HOSTS.has(host)) {
      const first = u.pathname.split('/').filter(Boolean)[0]
      return first ? `${host}/${first.toLowerCase()}` : ''
    }
    return host
  } catch {
    return ''
  }
}

/** SIREN : 9 chiffres (un SIRET de 14 chiffres est ramené à son SIREN). */
export const sirenKey = (siren: string | null | undefined): string => {
  const digits = String(siren ?? '').replace(/\D/g, '')
  return digits.length === 9 || digits.length === 14 ? digits.slice(0, 9) : ''
}

export type CrmKeys = { nameKey: string; communeKey: string; phoneKey: string; emailKey: string; domainKey: string; sirenKey: string }

export const crmKeys = (d: {
  name?: string | null
  commune?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  siren?: string | null
}): CrmKeys => ({
  nameKey: nameKey(d.name),
  communeKey: communeKey(d.commune),
  phoneKey: phoneKey(d.phone),
  emailKey: emailKey(d.email),
  domainKey: domainKey(d.website),
  sirenKey: sirenKey(d.siren),
})
