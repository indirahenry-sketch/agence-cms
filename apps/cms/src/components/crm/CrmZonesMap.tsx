'use client'

import React, { useMemo, useState } from 'react'

import { FRANCE_DEPARTMENTS_MAP, FRANCE_MAP_OVERSEAS_BOXES, FRANCE_MAP_VIEWBOX, FRANCE_MAP_ZOOM, type MapDepartment } from '@/crm/franceMap'

export type ZoneRow = { id: number; code: string; name: string; region: string; active: boolean; prospects: number }

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Carte de France des zones de prospection : clic sur un département = l'activer / le désactiver
 * pour les recherches. Liste à côté (recherche, régions entières).
 */
export const CrmZonesMap: React.FC<{ zones: ZoneRow[]; country?: string; unit?: string; units?: string }> = ({ zones: initial, country = 'France', unit = 'département', units = 'départements' }) => {
  const france = country === 'France'
  const plural = (n: number) => (n > 1 ? units : unit)
  const [zones, setZones] = useState(initial)
  const [hover, setHover] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [region, setRegion] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const byCode = useMemo(() => new Map(zones.map((z) => [z.code, z])), [zones])
  const regions = useMemo(() => [...new Set(zones.map((z) => z.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')), [zones])
  const activeCount = zones.filter((z) => z.active).length

  const say = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }
  const patch = async (path: string, active: boolean) => {
    const res = await fetch(`/api/crm-zones${path}`, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active }) })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.errors?.[0]?.message ?? 'Enregistrement impossible')
  }
  const toggle = async (code: string) => {
    const z = byCode.get(code)
    if (!z) return say(`${code} absent des zones.`)
    const active = !z.active
    setZones((list) => list.map((x) => (x.id === z.id ? { ...x, active } : x)))
    try {
      await patch(`/${z.id}`, active)
      say(`${z.code} · ${z.name} ${active ? 'activé' : 'désactivé'}`)
    } catch (e) {
      setZones((list) => list.map((x) => (x.id === z.id ? { ...x, active: !active } : x)))
      say(e instanceof Error ? e.message : 'Erreur')
    }
  }
  const setMany = async (filter: (z: ZoneRow) => boolean, active: boolean, label: string) => {
    const ids = zones.filter((z) => filter(z) && z.active !== active).map((z) => z.id)
    if (!ids.length) return say('Rien à changer.')
    if (!active && ids.length > 5 && !window.confirm(`Désactiver ${ids.length} ${units} (${label}) ?`)) return
    setBusy(true)
    const before = zones
    setZones((list) => list.map((z) => (ids.includes(z.id) ? { ...z, active } : z)))
    try {
      const qs = ids.map((id, i) => `where[id][in][${i}]=${id}`).join('&')
      await patch(`?${qs}`, active)
      say(`${label} : ${ids.length} ${plural(ids.length)} ${active ? 'activé' : 'désactivé'}${ids.length > 1 ? 's' : ''}`)
    } catch (e) {
      setZones(before)
      say(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const fill = (code: string) => {
    const z = byCode.get(code)
    if (!z) return 'zmap__dep zmap__dep--none'
    return `zmap__dep${z.active ? ' on' : ''}${z.prospects ? ' has' : ''}${region && z.region === region ? ' inregion' : ''}${hover === code ? ' hover' : ''}`
  }
  const renderDep = (d: MapDepartment, keyPrefix = '') => {
    const z = byCode.get(d.code)
    return (
      <path
        key={keyPrefix + d.code}
        d={d.d}
        className={fill(d.code)}
        onClick={() => toggle(d.code)}
        onMouseEnter={() => setHover(d.code)}
        onMouseLeave={() => setHover((h) => (h === d.code ? null : h))}
        role="button"
        aria-pressed={Boolean(z?.active)}
        aria-label={`${d.code} ${d.name}${z?.active ? ', active' : ''}`}
      >
        <title>{`${d.code} · ${d.name}${z ? ` — ${z.active ? 'active' : 'inactive'} · ${z.prospects} prospect${z.prospects > 1 ? 's' : ''}` : ''}`}</title>
      </path>
    )
  }

  const hovered = hover ? byCode.get(hover) : null
  const list = zones.filter((z) => (!region || z.region === region) && (!q.trim() || norm(`${z.code} ${z.name} ${z.region}`).includes(norm(q.trim()))))

  return (
    <div className="zmap">
      <section className="ccard zmap__card">
        <div className="ccard__row">
          <h2 className="ccard__title">
            {activeCount} {plural(activeCount)} actif{activeCount > 1 ? 's' : ''} sur {zones.length}
          </h2>
          <span className="cmuted zmap__hint">Clique sur {unit === 'pays' ? 'le pays' : `un${unit === 'province' ? 'e' : ''} ${unit}`} pour l’activer ou le désactiver</span>
        </div>
        {!france ? (
          <div className="ztiles">
            {regions.map((r) => (
              <div key={r} className="ztiles__group">
                {regions.length > 1 && <h3>{r}</h3>}
                <div className="ztiles__grid">
                  {zones
                    .filter((z) => z.region === r)
                    .map((z) => (
                      <button key={z.id} type="button" className={`ztile${z.active ? ' on' : ''}${z.prospects ? ' has' : ''}`} aria-pressed={z.active} onClick={() => toggle(z.code)}>
                        <b>{z.name}</b>
                        <small>
                          {z.active ? 'active' : 'inactive'}
                          {z.prospects ? ` · ${z.prospects} prospect${z.prospects > 1 ? 's' : ''}` : ''}
                        </small>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="zmap__wrap">
          <svg viewBox={FRANCE_MAP_VIEWBOX} className="zmap__svg" role="group" aria-label="Carte des départements">
            {FRANCE_MAP_OVERSEAS_BOXES.map((b) => (
              <rect key={b.code} x={b.x} y={b.y} width={b.w} height={b.h} rx={8} className="zmap__box" />
            ))}
            <rect x={FRANCE_MAP_ZOOM.box.x} y={FRANCE_MAP_ZOOM.box.y} width={FRANCE_MAP_ZOOM.box.w} height={FRANCE_MAP_ZOOM.box.h} rx={8} className="zmap__box" />
            <text x={FRANCE_MAP_ZOOM.box.x + 6} y={FRANCE_MAP_ZOOM.box.y - 6} className="zmap__label">
              {FRANCE_MAP_ZOOM.label}
            </text>
            {FRANCE_DEPARTMENTS_MAP.map((d) => renderDep(d))}
            {FRANCE_MAP_ZOOM.departments.map((d) => renderDep(d, 'z'))}
          </svg>
          <div className="zmap__info" aria-live="polite">
            {hovered ? (
              <>
                <b>
                  {hovered.code} · {hovered.name}
                </b>
                <span>
                  {hovered.region} · {hovered.active ? 'active' : 'inactive'} · {hovered.prospects} prospect{hovered.prospects > 1 ? 's' : ''}
                </span>
              </>
            ) : (
              <span className="cmuted">Survole un département</span>
            )}
          </div>
        </div>
        )}
        <p className="cmuted zmap__legend">
          <span>
            <i className="zmap__sw on" /> active (incluse dans les recherches)
          </span>
          <span>
            <i className="zmap__sw" /> inactive
          </span>
          <span>
            <i className="zmap__sw has" /> a déjà des prospects
          </span>
        </p>
        {toast && <p className="bok zmap__toast">{toast}</p>}
      </section>

      <section className="ccard zmap__side">
        <h2 className="ccard__title">{units.charAt(0).toUpperCase() + units.slice(1)}</h2>
        {zones.length > 1 && <input className="zmap__search" type="search" placeholder={france ? 'Rechercher : 34, Hérault, Occitanie…' : 'Rechercher…'} value={q} onChange={(e) => setQ(e.target.value)} />}
        <div className="zmap__regions" hidden={zones.length < 2}>
          <select value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Région">
            <option value="">Toutes les régions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {region ? (
            <>
              <button type="button" className="bbtn" disabled={busy} onClick={() => setMany((z) => z.region === region, true, region)}>
                Activer la région
              </button>
              <button type="button" className="bbtn bbtn--ghost" disabled={busy} onClick={() => setMany((z) => z.region === region, false, region)}>
                Désactiver
              </button>
            </>
          ) : (
            <>
              {!france && (
                <button type="button" className="bbtn" disabled={busy || activeCount === zones.length} onClick={() => setMany(() => true, true, country)}>
                  Tout activer
                </button>
              )}
              <button type="button" className="bbtn bbtn--ghost" disabled={busy || !activeCount} onClick={() => setMany(() => true, false, france ? 'toute la France' : country)}>
                Tout désactiver
              </button>
            </>
          )}
        </div>
        <ul className="zmap__list">
          {list.map((z) => (
            <li key={z.id} className={hover === z.code ? 'hover' : ''} onMouseEnter={() => setHover(z.code)} onMouseLeave={() => setHover(null)}>
              <label>
                <input type="checkbox" checked={z.active} onChange={() => toggle(z.code)} />
                {france && <b>{z.code}</b>} {z.name}
              </label>
              {z.prospects > 0 && (
                <a className="cmuted" href={`/admin/prospection/base?dep=${z.id}`} title="Voir les prospects">
                  {z.prospects}
                </a>
              )}
            </li>
          ))}
        </ul>
        <a className="clink" href="/admin/collections/crm-zones">
          Liste détaillée des zones →
        </a>
      </section>
    </div>
  )
}

export default CrmZonesMap
