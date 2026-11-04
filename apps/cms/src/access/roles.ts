/**
 * Rôles et appartenance aux clients.
 *
 * - Un utilisateur a un rôle global : "super-admin" (toi) ou "user" (tout le monde).
 * - Un "user" est rattaché à un ou plusieurs clients (tenants), avec un rôle PAR client :
 *     "tenant-admin" = administrateur client, "editor" = éditeur.
 *
 * Toutes les décisions d'accès partent de l'utilisateur connecté (req.user),
 * jamais d'une valeur envoyée par le navigateur.
 */

export type TenantRole = 'tenant-admin' | 'editor'

export const ALL_TENANT_ROLES: TenantRole[] = ['tenant-admin', 'editor']
export const ADMIN_ONLY: TenantRole[] = ['tenant-admin']

type IDValue = number | string

type Membership = {
  tenant?: IDValue | { id: IDValue } | null
  roles?: TenantRole[] | null
}

export type AppUser = {
  id: IDValue
  email?: string
  roles?: string[] | null
  tenants?: Membership[] | null
}

/** Renvoie l'identifiant d'une relation, qu'elle soit déjà « peuplée » (objet) ou non (nombre). */
export const extractID = (value: unknown): IDValue | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object' && 'id' in (value as object)) {
    return (value as { id: IDValue }).id
  }
  if (typeof value === 'number' || typeof value === 'string') return value
  return null
}

/** Compare deux identifiants sans se faire piéger par "12" vs 12. */
export const sameID = (a: unknown, b: unknown): boolean => {
  const x = extractID(a)
  const y = extractID(b)
  return x !== null && y !== null && String(x) === String(y)
}

export const isSuperAdmin = (user: unknown): boolean =>
  Boolean((user as AppUser | null)?.roles?.includes('super-admin'))

/**
 * Identifiants des clients de l'utilisateur.
 * @param roles si précisé, ne garde que les clients où l'utilisateur a l'un de ces rôles.
 */
export const getTenantIDs = (user: unknown, roles?: TenantRole[]): IDValue[] => {
  const u = user as AppUser | null
  if (!u?.tenants) return []
  const ids: IDValue[] = []
  for (const membership of u.tenants) {
    const id = extractID(membership?.tenant)
    if (id === null) continue
    if (roles && !membership.roles?.some((r) => roles.includes(r))) continue
    if (!ids.some((existing) => sameID(existing, id))) ids.push(id)
  }
  return ids
}

export const hasTenantRole = (user: unknown, tenantID: unknown, roles: TenantRole[]): boolean =>
  getTenantIDs(user, roles).some((id) => sameID(id, tenantID))
