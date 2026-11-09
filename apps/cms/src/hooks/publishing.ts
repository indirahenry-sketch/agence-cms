import { APIError, type CollectionBeforeChangeHook } from 'payload'

import { extractID, hasTenantRole, isSuperAdmin, PUBLISHER_ROLES } from '@/access/roles'

/**
 * Le rédacteur enregistre des brouillons ; seuls l'éditeur, l'administrateur client et
 * l'agence mettent en ligne. Vérifié côté serveur, quel que soit le bouton utilisé.
 */
export const onlyPublishersPublish: CollectionBeforeChangeHook = ({ req, data, originalDoc }) => {
  const user = req.user
  if (!user || isSuperAdmin(user) || data._status !== 'published') return data
  const tenant = extractID(data.tenant ?? originalDoc?.tenant)
  if (tenant !== null && hasTenantRole(user, tenant, PUBLISHER_ROLES)) return data
  throw new APIError(
    'Votre rôle de rédacteur permet d’enregistrer des brouillons. Un éditeur ou l’administrateur publiera la mise en ligne.',
    403,
    undefined,
    true,
  )
}
