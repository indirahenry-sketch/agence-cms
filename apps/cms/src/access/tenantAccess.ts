import type { Access, Where } from 'payload'

import { ALL_TENANT_ROLES, CONTENT_ROLES, getTenantIDs, INACTIVE_STATUSES, isSuperAdmin, type TenantRole } from './roles'

/**
 * Règles d'accès réutilisées par toutes les collections « par client ».
 *
 * Une règle renvoie soit true/false, soit un filtre (Where) que Payload ajoute
 * à CHAQUE requête en base. Un client ne peut donc jamais lister, lire, modifier
 * ou supprimer un document dont le champ `tenant` n'est pas l'un des siens.
 */

const tenantFilter = (ids: (number | string)[]): Where => ({ tenant: { in: ids } })

/** Écriture : jamais sur les contenus d'un client suspendu ou archivé (sauf super admin). */
const activeTenantFilter = (ids: (number | string)[]): Where => ({
  and: [{ tenant: { in: ids } }, { 'tenant.status': { not_in: [...INACTIVE_STATUSES] } }],
})

/** Lecture : tout membre du client (admin, éditeur, rédacteur, lecteur). */
export const tenantRead: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const ids = getTenantIDs(req.user, ALL_TENANT_ROLES)
  return ids.length ? tenantFilter(ids) : false
}

/**
 * Création : il suffit d'avoir le bon rôle dans AU MOINS un client.
 * Le client exact est ensuite imposé et vérifié par le hook `enforceTenant`.
 */
export const tenantCreate =
  (roles: TenantRole[] = CONTENT_ROLES): Access =>
  ({ req }) => {
    if (!req.user) return false
    if (isSuperAdmin(req.user)) return true
    return getTenantIDs(req.user, roles).length > 0
  }

/** Modification / suppression : uniquement les documents des clients où l'on a le bon rôle. */
export const tenantWrite =
  (roles: TenantRole[] = CONTENT_ROLES): Access =>
  ({ req }) => {
    if (!req.user) return false
    if (isSuperAdmin(req.user)) return true
    const ids = getTenantIDs(req.user, roles)
    return ids.length ? activeTenantFilter(ids) : false
  }

export const superAdminOnly: Access = ({ req }) => isSuperAdmin(req.user)

export const authenticated: Access = ({ req }) => Boolean(req.user)

/** Raccourci : jeu complet de règles pour une collection de contenu. */
export const tenantCollectionAccess = (writeRoles: TenantRole[] = CONTENT_ROLES) => ({
  read: tenantRead,
  create: tenantCreate(writeRoles),
  update: tenantWrite(writeRoles),
  delete: tenantWrite(writeRoles),
})
