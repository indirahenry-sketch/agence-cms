import type { Payload } from 'payload'

import { CRM_LAUNCH_DEPARTMENTS, FRENCH_DEPARTMENTS } from './constants'

/**
 * Crée les 101 départements dans « Zones de prospection » s'ils manquent.
 * Relançable sans risque : une zone existante (même modifiée à la main) n'est jamais touchée.
 * Les départements de lancement sont actifs dès leur création ; les autres, inactifs.
 */
export const ensureCrmZones = async (payload: Payload): Promise<number> => {
  const { docs } = await payload.find({
    collection: 'crm-zones',
    where: { country: { equals: 'France' } },
    limit: 0,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  })
  const known = new Set(docs.map((z) => z.code))
  let created = 0
  for (const dep of FRENCH_DEPARTMENTS) {
    if (known.has(dep.code)) continue
    await payload.create({
      collection: 'crm-zones',
      data: { ...dep, kind: 'departement', country: 'France', active: CRM_LAUNCH_DEPARTMENTS.includes(dep.code) },
      overrideAccess: true,
      context: { skipAudit: true },
    })
    created++
  }
  if (created) payload.logger.info(`Prospection : ${created} zone(s) ajoutée(s)`)
  return created
}
