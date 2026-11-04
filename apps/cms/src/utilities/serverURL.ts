import type { PayloadRequest } from 'payload'

/**
 * Adresse publique du CMS, pour les liens envoyés par e-mail.
 * - En production : PUBLIC_SERVER_URL (ex. https://cms.ton-agence.fr)
 * - Sinon : déduite de la requête (fonctionne aussi derrière un tunnel Cloudflare)
 */
export const getServerURL = (req?: PayloadRequest): string => {
  if (process.env.PUBLIC_SERVER_URL) return process.env.PUBLIC_SERVER_URL.replace(/\/$/, '')
  const headers = req?.headers
  const host = headers?.get('x-forwarded-host') ?? headers?.get('host')
  if (host) {
    const proto = headers?.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

export const escapeHTML = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
