import type { Payload } from 'payload'

import { CRM_LAUNCH_DEPARTMENTS, FRENCH_DEPARTMENTS } from './constants'
import { COUNTRIES } from './countries'

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
  // Autres pays : zones créées inactives (on les active depuis Prospection → Zones)
  const others = await payload.find({ collection: 'crm-zones', where: { country: { not_equals: 'France' } }, limit: 0, depth: 0, pagination: false, overrideAccess: true })
  const knownOther = new Set(others.docs.map((z) => `${z.country}|${z.code}`))
  for (const c of COUNTRIES) {
    for (const zone of c.zones) {
      if (knownOther.has(`${c.name}|${zone.code}`)) continue
      await payload.create({
        collection: 'crm-zones',
        data: { code: zone.code, name: zone.name, region: zone.region, kind: c.whole ? 'pays' : 'autre', country: c.name, active: false },
        overrideAccess: true,
        context: { skipAudit: true },
      })
      created++
    }
  }
  if (created) payload.logger.info(`Prospection : ${created} zone(s) ajoutée(s)`)
  return created
}
