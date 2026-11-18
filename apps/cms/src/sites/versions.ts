import type { Payload } from 'payload'

import { isSuperAdmin } from '@/access/roles'

import { templateKey } from './render'

/**
 * Anciennes versions des maquettes, visibles seulement par le super-admin.
 *
 * Adresse : /sites/<client>?version=v1 (le sélecteur « Version » de la barre « Mode édition »
 * y mène). Pour toute autre personne, le paramètre est ignoré : le site actuel s'affiche.
 * Les contenus (coordonnées, tarifs, photos…) sont ceux d'aujourd'hui, seule la maquette change.
 * Les fichiers ne sont chargés qu'au premier affichage d'une version.
 */
export type SiteVersion = { id: string; label: string; load: () => Promise<string> }

export const SITE_VERSIONS: Record<string, SiteVersion[]> = {
  'ecuries-poigny': [
    { id: 'v1', label: 'V1 · 4 nov.', load: async () => (await import('./ecuries-poigny/versions/v1')).template },
    { id: 'v2', label: 'V2 · 6 nov.', load: async () => (await import('./ecuries-poigny/versions/v2')).template },
  ],
  'haras-montesugui': [{ id: 'v1', label: 'V1 · 13 nov.', load: async () => (await import('./haras-montesugui/versions/v1')).template }],
  'domaine-equestre-castelle': [
    { id: 'v1', label: 'V1 · 14 nov.', load: async () => (await import('./domaine-equestre-castelle/versions/v1')).template },
    { id: 'v2', label: 'V2 · 14 nov.', load: async () => (await import('./domaine-equestre-castelle/versions/v2')).template },
    { id: 'v3', label: 'V3 · 14 nov.', load: async () => (await import('./domaine-equestre-castelle/versions/v3')).template },
  ],
}

const COOKIE = /(?:^|;\s*)payload-token=/

/** Vrai seulement pour un super-admin connecté, sur l'adresse /sites/… (jamais sur le domaine du client). */
export async function isSuperAdminVisit(payload: Payload, req: Request): Promise<boolean> {
  if (req.headers.get('x-site-domain') || !COOKIE.test(req.headers.get('cookie') ?? '')) return false
  try {
    const { user } = await payload.auth({ headers: req.headers })
    return isSuperAdmin(user)
  } catch {
    return false
  }
}

/** Maquette archivée demandée par ?version=…, ou null (paramètre absent, inconnu ou visiteur non autorisé). */
export async function archivedTemplate(payload: Payload, req: Request, siteSlug: string): Promise<{ id: string; template: string } | null> {
  const wanted = new URL(req.url).searchParams.get('version')
  if (!wanted || !(await isSuperAdminVisit(payload, req))) return null
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 0, overrideAccess: true })
  if (!docs[0]) return null
  const version = SITE_VERSIONS[templateKey(docs[0].slug, docs[0].name)]?.find((v) => v.id === wanted)
  if (!version) return null
  return { id: version.id, template: await version.load() }
}
