import type { CollectionSlug, Payload } from 'payload'

/** Collections avec corbeille (voir `trash: true` dans leur configuration). */
export const TRASH_COLLECTIONS = ['posts', 'pages', 'media', 'prices', 'services', 'events', 'promotions', 'menus'] as const satisfies readonly CollectionSlug[]

const DAYS = 30

/** Vide définitivement ce qui est dans la corbeille depuis plus de 30 jours (fichiers compris). */
export const purgeTrash = async (payload: Payload) => {
  const cutoff = new Date(Date.now() - DAYS * 864e5).toISOString()
  let total = 0
  for (const collection of TRASH_COLLECTIONS) {
    try {
      const { docs } = await payload.delete({ collection, where: { deletedAt: { less_than: cutoff } }, trash: true, overrideAccess: true })
      total += docs.length
    } catch (err) {
      payload.logger.warn({ err }, `Corbeille : nettoyage impossible (${collection})`)
    }
  }
  if (total) payload.logger.info(`Corbeille : ${total} élément(s) de plus de ${DAYS} jours supprimé(s)`)
  return total
}

let started = false
/** Au démarrage puis une fois par jour. */
export const startTrashPurge = (payload: Payload) => {
  if (started) return
  started = true
  void purgeTrash(payload)
  setInterval(() => void purgeTrash(payload), 24 * 3600 * 1000).unref?.()
}
