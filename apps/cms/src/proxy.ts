import { NextResponse, type NextRequest } from 'next/server'

import { internalToken } from '@/lib/internalToken'

/**
 * Sites des clients sur LEUR nom de domaine.
 *
 * Quand une visite arrive sur www.client.fr (domaine saisi dans la fiche client et pointé
 * vers ce serveur), l'adresse est servie en interne par /sites/<client>/… :
 *   www.client.fr/            → /sites/<client>
 *   www.client.fr/tarifs      → /sites/<client>/tarifs
 *   www.client.fr/media/12    → /sites/<client>/media/12
 * L'espace de gestion (/admin) et l'API ne sont JAMAIS accessibles par le domaine d'un client.
 * L'adresse du CMS lui-même (Render, localhost…) n'est pas concernée.
 */
type Cache = { at: number; map: Record<string, string> }
let cache: Cache | null = null
const TTL = 60_000

const hostOf = (value: string | undefined | null) => {
  if (!value) return ''
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const isCmsHost = (host: string) =>
  !host ||
  host === 'localhost' ||
  /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
  host.endsWith('.onrender.com') ||
  host.endsWith('.trycloudflare.com') ||
  host === hostOf(process.env.PUBLIC_SERVER_URL) ||
  host === hostOf(process.env.RENDER_EXTERNAL_URL)

async function domainMap(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.map
  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/sites-domaines`, {
      headers: { 'x-internal': internalToken() },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    })
    cache = { at: Date.now(), map: res.ok ? await res.json() : {} }
  } catch {
    cache = { at: Date.now(), map: cache?.map ?? {} }
  }
  return cache.map
}

export async function proxy(req: NextRequest) {
  // Cet en-tête n'est posé que par ce fichier : on efface toute valeur venue du navigateur
  const headers = new Headers(req.headers)
  headers.delete('x-site-domain')
  const pass = () => NextResponse.next({ request: { headers } })

  const raw = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim().toLowerCase()
  const host = raw.replace(/:\d+$/, '')
  if (isCmsHost(host)) return pass()

  const slug = (await domainMap())[host.replace(/^www\./, '')]
  if (!slug) return pass()

  const path = req.nextUrl.pathname
  if (path === '/health') return pass()
  if (path === '/admin' || path.startsWith('/admin/') || path === '/api' || path.startsWith('/api/') || path.startsWith('/sites-domaines')) {
    return new NextResponse('Introuvable', { status: 404 })
  }
  // Ancienne adresse /sites/<client>/… : renvoyée vers l'adresse courte du domaine
  const prefix = `/sites/${slug}`
  if (path === prefix || path.startsWith(`${prefix}/`)) {
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https'
    const url = new URL(`${proto}://${raw}`)
    url.pathname = path.slice(prefix.length) || '/'
    url.search = req.nextUrl.search
    return NextResponse.redirect(url, 308)
  }
  const url = req.nextUrl.clone()
  url.pathname = `${prefix}${path === '/' ? '' : path}`
  headers.set('x-site-domain', host)
  return NextResponse.rewrite(url, { request: { headers } })
}

export const config = {
  // Fichiers techniques de Next.js exclus
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
