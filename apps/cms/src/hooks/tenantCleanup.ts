import type { CollectionBeforeDeleteHook, CollectionSlug, Payload, PayloadRequest } from 'payload'

import { isSuperAdmin, sameID } from '@/access/roles'

/**
 * Collections dont chaque document appartient à un client.
 * (Même liste que la configuration du plugin multi-tenant dans payload.config.ts.)
 */
export const TENANT_COLLECTIONS = [
  'menus',
  'promotions',
  'pages',
  'posts',
  'services',
  'prices',
  'events',
  'redirects',
  'site-stats',
  'site-info',
  'support-requests',
  'categories',
  'tags',
  // En dernier : les médias (les autres contenus y font référence). Supprimés un par un
  // par Payload, ce qui efface aussi les fichiers du stockage.
  'media',
] as const satisfies readonly CollectionSlug[]

/**
 * Suppression d'un client : AVANT que la fiche disparaisse, on supprime tous ses contenus
 * et fichiers, puis on retire le client des comptes. Les comptes qui n'appartenaient qu'à
 * ce client sont supprimés aussi (ils ne donneraient plus accès à rien).
 *
 * Le nettoyage du plugin s'exécutait APRÈS la suppression : la base avait déjà vidé le lien
 * vers le client, il ne retrouvait donc rien et laissait des contenus orphelins.
 * Le journal d'audit est conservé (historique).
 */
export const deleteTenantContent: CollectionBeforeDeleteHook = async ({ req, id }) => {
  for (const collection of TENANT_COLLECTIONS) {
    // trash: true → supprime aussi ce qui était dans la corbeille
    await req.payload.delete({ collection, where: { tenant: { equals: id } }, overrideAccess: true, req, trash: true })
  }
  const { docs: members } = await req.payload.find({
    collection: 'users',
    where: { 'tenants.tenant': { equals: id } },
    depth: 0,
    limit: 0,
    overrideAccess: true,
    req,
  })
  for (const member of members) {
    const rest = (member.tenants ?? []).filter((row) => !sameID(row.tenant, id))
    if (!rest.length && !isSuperAdmin(member)) {
      await req.payload.delete({ collection: 'users', id: member.id, overrideAccess: true, req })
    } else {
      await req.payload.update({
        collection: 'users',
        id: member.id,
        data: { tenants: rest.map((row) => ({ ...row, tenant: typeof row.tenant === 'object' ? row.tenant?.id : row.tenant })) },
        overrideAccess: true,
        req,
        context: { skipInvite: true },
      })
    }
  }
}

/**
 * Contenus sans client (laissés par les anciennes suppressions) : supprimés au démarrage,
 * fichiers compris. Invisibles des clients, ils encombraient la base et le stockage.
 */
export const removeOrphans = async (payload: Payload, req?: Partial<PayloadRequest>) => {
  let total = 0
  for (const collection of TENANT_COLLECTIONS) {
    try {
      const { docs } = await payload.delete({ collection, where: { tenant: { exists: false } }, overrideAccess: true, req, trash: true })
      total += docs.length
    } catch (err) {
      payload.logger.warn({ err }, `Nettoyage des contenus orphelins impossible (${collection})`)
    }
  }
  if (total) payload.logger.info(`Nettoyage : ${total} contenu(s) sans client supprimé(s)`)
  return total
}
