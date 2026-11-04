import { Forbidden, type CollectionBeforeChangeHook } from 'payload'

import { ALL_TENANT_ROLES, extractID, getTenantIDs, isSuperAdmin, sameID, type TenantRole } from '@/access/roles'

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
  (roles: TenantRole[] = ALL_TENANT_ROLES): CollectionBeforeChangeHook =>
  ({ req, data, operation, originalDoc }) => {
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
    return data
  }
