import { Forbidden, type CollectionBeforeChangeHook, type PayloadRequest } from 'payload'

import { CONTENT_ROLES, extractID, getTenantIDs, isSuperAdmin, isTenantInactive, sameID, type TenantRole } from '@/access/roles'

/**
 * Deuxième verrou d'isolation, exécuté côté serveur avant chaque enregistrement.
 *
 * - Création : le client vient de l'utilisateur connecté. Si le navigateur envoie un
 *   autre client que les siens, la requête est refusée.
 * - Modification : impossible de déplacer un document vers un autre client.
 *
 * Les scripts système (seed, imports) passent sans utilisateur et ne sont pas concernés.
 */
export const enforceTenant =
  (roles: TenantRole[] = CONTENT_ROLES): CollectionBeforeChangeHook =>
  async ({ req, data, operation, originalDoc }) => {
    const user = req.user
    if (!user) return data

    if (operation === 'create') {
      if (isSuperAdmin(user)) {
        if (!extractID(data.tenant)) {
          throw new Forbidden(req.t)
        }
        return data
      }

      const allowed = getTenantIDs(user, roles)
      let tenantID = extractID(data.tenant)

      // Un utilisateur qui n'a qu'un client n'a pas besoin de le choisir
      if (tenantID === null && allowed.length === 1) tenantID = allowed[0]

      if (tenantID === null || !allowed.some((id) => sameID(id, tenantID))) {
        throw new Forbidden(req.t)
      }

      await assertTenantActive(req, tenantID)
      data.tenant = tenantID
      return data
    }

    // operation === 'update'
    const originalTenant = extractID(originalDoc?.tenant)
    if (data.tenant !== undefined && !sameID(data.tenant, originalTenant)) {
      if (!isSuperAdmin(user)) throw new Forbidden(req.t)
    }
    if (!isSuperAdmin(user) && !getTenantIDs(user, roles).some((id) => sameID(id, originalTenant))) {
      throw new Forbidden(req.t)
    }
    if (!isSuperAdmin(user) && originalTenant !== null) await assertTenantActive(req, originalTenant)
    return data
  }

/** Un client suspendu ne peut plus rien modifier (ses contenus restent intacts). */
const assertTenantActive = async (req: PayloadRequest, tenantID: number | string) => {
  const tenant = await req.payload.findByID({ collection: 'tenants', id: tenantID, depth: 0, overrideAccess: true, req, disableErrors: true })
  if (isTenantInactive(tenant)) throw new Forbidden(req.t)
}
