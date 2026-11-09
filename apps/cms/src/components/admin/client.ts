'use client'

/** Client sélectionné dans le sélecteur « Client » du CMS (cookie du plugin multi-tenant). */
export const selectedTenant = (): string | null => {
  const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)payload-tenant=([^;]+)/) : null
  return m ? decodeURIComponent(m[1]) : null
}

/** Appel de l'API du CMS avec la session de l'utilisateur. */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || `Erreur ${res.status}`)
  return data as T
}

/** Construit une requête « where » de Payload en paramètres d'adresse. */
export const qs = (params: Record<string, string | number | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

/** « il y a 2 jours », « dans 5 jours ». */
export const relative = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 864e5],
    ['month', 30 * 864e5],
    ['week', 7 * 864e5],
    ['day', 864e5],
    ['hour', 36e5],
    ['minute', 6e4],
  ]
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit)
  return 'à l’instant'
}

/** Mémorise un choix d'affichage (grille / tableau…) dans ce navigateur. */
export const remember = {
  get: (key: string, fallback: string) => {
    try {
      return localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  },
  set: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* navigation privée */
    }
  },
}
