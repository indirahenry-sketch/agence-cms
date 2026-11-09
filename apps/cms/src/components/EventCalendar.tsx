'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { api, qs, remember, selectedTenant } from './admin/client'

type EventDoc = { id: number; title: string; type?: string | null; startsAt: string; endsAt?: string | null; hours?: string | null }

/** Mêmes couleurs que l'agenda des sites. */
export const EVENT_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  stage: { bg: '#fdf4dc', fg: '#a16207', label: 'Stage' },
  galop: { bg: '#e8f2fe', fg: '#1d4ed8', label: 'Galops' },
  concours: { bg: '#fdecec', fg: '#b91c1c', label: 'Concours' },
  fete: { bg: '#f5ecfe', fg: '#7e22ce', label: 'Fête' },
  atelier: { bg: '#e8f8ef', fg: '#15803d', label: 'Atelier' },
  autre: { bg: '#f1f0f6', fg: '#4a4566', label: 'Autre' },
}

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * Agenda en vue calendrier (au-dessus de la liste des événements, qu'il remplace quand
 * « Calendrier » est choisi) : mois coloré par type, clic sur un jour pour créer un événement ce jour-là.
 */
export const EventCalendar: React.FC = () => {
  const [mode, setMode] = useState<'cal' | 'list'>('cal')
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [events, setEvents] = useState<EventDoc[]>([])

  useEffect(() => setMode(remember.get('events-view', 'cal') === 'list' ? 'list' : 'cal'), [])
  useEffect(() => {
    document.body.classList.toggle('events-cal-on', mode === 'cal')
    remember.set('events-view', mode)
    return () => document.body.classList.remove('events-cal-on')
  }, [mode])

  const cells = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7 // lundi = 0
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset)
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month])

  const load = useCallback(async () => {
    const from = cells[0]
    const to = new Date(cells[41].getFullYear(), cells[41].getMonth(), cells[41].getDate() + 1)
    const t = selectedTenant()
    const res = await api<{ docs: EventDoc[] }>(
      `/events?${qs({
        limit: 300,
        depth: 0,
        sort: 'startsAt',
        'where[and][0][startsAt][less_than]': to.toISOString(),
        'where[and][1][or][0][startsAt][greater_than_equal]': from.toISOString(),
        'where[and][1][or][1][endsAt][greater_than_equal]': from.toISOString(),
        ...(t ? { 'where[and][2][tenant][equals]': t } : {}),
      })}`,
    )
    setEvents(res.docs)
  }, [cells])

  useEffect(() => {
    if (mode === 'cal') load().catch(() => {})
  }, [load, mode])

  const byDay = useMemo(() => {
    const map = new Map<string, EventDoc[]>()
    for (const e of events) {
      const s = new Date(e.startsAt)
      const end = e.endsAt ? new Date(e.endsAt) : s
      for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= end; d.setDate(d.getDate() + 1)) {
        const k = ymd(d)
        map.set(k, [...(map.get(k) ?? []), e])
      }
    }
    return map
  }, [events])

  const today = ymd(new Date())
  const title = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="ecal">
      <div className="ecal__bar">
        <div className="seg" role="group" aria-label="Affichage">
          <button type="button" className={mode === 'cal' ? 'on' : ''} onClick={() => setMode('cal')}>
            ▦ Calendrier
          </button>
          <button type="button" className={mode === 'list' ? 'on' : ''} onClick={() => setMode('list')}>
            ☰ Liste
          </button>
        </div>
        {mode === 'cal' && (
          <>
            <strong className="ecal__title">{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
            <div className="ecal__nav">
              <button type="button" onClick={() => shift(-1)} aria-label="Mois précédent">‹</button>
              <button type="button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Aujourd’hui</button>
              <button type="button" onClick={() => shift(1)} aria-label="Mois suivant">›</button>
            </div>
            <div className="ecal__legend">
              {Object.entries(EVENT_COLORS)
                .filter(([k]) => k !== 'autre')
                .map(([k, c]) => (
                  <span key={k}>
                    <b style={{ color: c.fg }}>●</b> {c.label}
                  </span>
                ))}
            </div>
          </>
        )}
      </div>
      {mode === 'cal' && (
        <div className="ecal__grid">
          {DAYS.map((d) => (
            <span key={d} className="ecal__dow">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const k = ymd(d)
            const list = byDay.get(k) ?? []
            const out = d.getMonth() !== month.getMonth()
            return (
              <div key={k} className={`ecal__day${out ? ' out' : ''}${k === today ? ' today' : ''}`}>
                <a className="ecal__num" href={`/admin/collections/events/create?date=${k}`} title="Ajouter un événement ce jour-là">
                  {d.getDate()}
                  <span className="ecal__add">+</span>
                </a>
                {list.slice(0, 3).map((e) => {
                  const c = EVENT_COLORS[e.type || 'autre'] ?? EVENT_COLORS.autre
                  return (
                    <a key={`${e.id}-${k}`} className="ecal__ev" href={`/admin/collections/events/${e.id}`} style={{ background: c.bg, color: c.fg }} title={`${e.title}${e.hours ? ` · ${e.hours}` : ''}`}>
                      {e.title}
                    </a>
                  )
                })}
                {list.length > 3 && <span className="ecal__more">+{list.length - 3}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default EventCalendar
