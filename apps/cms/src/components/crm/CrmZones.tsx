import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { extractID } from '@/access/roles'

import { CrmZonesMap, type ZoneRow } from './CrmZonesMap'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/** Zones de prospection : /admin/prospection/zones — carte de France cliquable de tous les départements. */
export const CrmZones = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req
  const base = { overrideAccess: true, req, limit: 0, pagination: false, depth: 0 } as const
  const [zones, prospects] = await Promise.all([
    payload.find({ collection: 'crm-zones', sort: 'code', ...base }),
    payload.find({ collection: 'crm-prospects', select: { department: true }, ...base }),
  ])
  const counts = new Map<number, number>()
  for (const p of prospects.docs) {
    const id = extractID(p.department) as number | null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const rows: ZoneRow[] = zones.docs
    .filter((z) => z.kind === 'departement')
    .map((z) => ({ id: z.id, code: z.code, name: z.name, region: z.region ?? '', active: Boolean(z.active), prospects: counts.get(z.id) ?? 0 }))

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Zones" current="zones" />
      <CrmZonesMap zones={rows} />
    </div>,
  )
}

export default CrmZones
