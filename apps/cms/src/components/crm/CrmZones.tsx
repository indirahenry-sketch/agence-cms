import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { extractID } from '@/access/roles'
import { COUNTRIES, FRANCE } from '@/crm/countries'

import { CrmZonesMap, type ZoneRow } from './CrmZonesMap'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/**
 * Zones de prospection : /admin/prospection/zones?pays=Belgique
 * France : carte cliquable des départements. Autres pays : provinces, cantons ou états par région.
 */
export const CrmZones = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req
  const asked = String((props.searchParams?.pays as string | undefined) ?? FRANCE.name)
  const country = COUNTRIES.find((c) => c.name === asked) ?? FRANCE
  const base = { overrideAccess: true, req, limit: 0, pagination: false, depth: 0 } as const
  const [zones, prospects, active] = await Promise.all([
    payload.find({ collection: 'crm-zones', where: { country: { equals: country.name } }, sort: 'code', ...base }),
    payload.find({ collection: 'crm-prospects', select: { department: true }, ...base }),
    payload.find({ collection: 'crm-zones', where: { active: { equals: true } }, select: { country: true }, ...base }),
  ])
  const counts = new Map<number, number>()
  for (const p of prospects.docs) {
    const id = extractID(p.department) as number | null
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const activeBy = new Map<string, number>()
  for (const z of active.docs) activeBy.set(z.country ?? '', (activeBy.get(z.country ?? '') ?? 0) + 1)
  const rows: ZoneRow[] = zones.docs
    .filter((z) => (country.name === FRANCE.name ? z.kind === 'departement' : true))
    .map((z) => ({ id: z.id, code: z.code, name: z.name, region: z.region ?? '', active: Boolean(z.active), prospects: counts.get(z.id) ?? 0 }))
  const tabs = [FRANCE, ...COUNTRIES]

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Zones" current="zones" />
      <nav className="zcountries" aria-label="Pays">
        {tabs.map((c) => {
          const n = activeBy.get(c.name) ?? 0
          return (
            <a key={c.name} href={`/admin/prospection/zones?pays=${encodeURIComponent(c.name)}`} className={c.name === country.name ? 'on' : ''} aria-current={c.name === country.name ? 'page' : undefined}>
              <span aria-hidden>{c.flag}</span> {c.name}
              {n > 0 && <b>{n}</b>}
            </a>
          )
        })}
      </nav>
      {country.name !== FRANCE.name && (
        <p className="cmuted zcountries__note">
          Hors de France, la recherche utilise OpenStreetMap et le site des établissements (l’annuaire de l’État ne couvre que la France) : moins de fiches, et surtout celles déjà
          présentes sur la carte. {'language' in country && country.language !== 'fr' ? 'Pense à un modèle d’e-mail dans la langue du pays.' : ''}
        </p>
      )}
      <CrmZonesMap key={country.name} zones={rows} country={country.name} unit={country.unit} units={country.units} />
    </div>,
  )
}

export default CrmZones
