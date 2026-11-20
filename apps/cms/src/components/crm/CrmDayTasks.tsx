'use client'

import { useRouter } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { CRM_TASK_KINDS } from '@/crm/constants'
import { toneOfKind } from '@/crm/tones'

type Task = { id: number; title: string; kind: string; time?: string | null; done?: boolean | null; prospect?: { id: number; name: string } | number | null }
type Hit = { id: number; name: string; commune?: string | null }

const kindLabel = (v: string) => CRM_TASK_KINDS.find((k) => k.value === v)?.label ?? v
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? 'Erreur')
  return body as T
}
const dayRange = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  return { from: new Date(d.getTime() - 864e5 / 2).toISOString(), to: new Date(d.getTime() + 1.5 * 864e5).toISOString() }
}

/**
 * Clic sur un jour du calendrier (élément avec data-crm-day="AAAA-MM-JJ") : fenêtre pour voir
 * les tâches de ce jour et en ajouter (relance, appel, e-mail, recherche…), avec ou sans prospect.
 */
export const CrmDayTasks: React.FC = () => {
  const router = useRouter()
  const [day, setDay] = useState<string | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [kind, setKind] = useState<string>('relance')
  const [title, setTitle] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [prospect, setProspect] = useState<Hit | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const titleTouched = useRef(false)

  const load = useCallback(async (d: string) => {
    const { from, to } = dayRange(d)
    const q = new URLSearchParams({ 'where[and][0][date][greater_than_equal]': from, 'where[and][1][date][less_than]': to, depth: '1', limit: '50', sort: 'time' })
    const r = await api<{ docs: (Task & { date: string })[] }>(`/crm-tasks?${q}`)
    const paris = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso))
    setTasks(r.docs.filter((t) => paris(t.date) === d))
  }, [])

  // Ouvre la fenêtre au clic sur un jour (sauf clic sur un lien vers une fiche)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const cell = target.closest<HTMLElement>('[data-crm-day]')
      if (!cell || (target.closest('a') && !target.closest('[data-crm-task]'))) return
      e.preventDefault()
      const d = cell.dataset.crmDay!
      setDay(d)
      setTasks(null)
      setKind('relance')
      setTitle(kindLabel('relance'))
      titleTouched.current = false
      setTime('')
      setNotes('')
      setQuery('')
      setHits([])
      setProspect(null)
      setError('')
      load(d).catch((err) => setError(err.message))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [load])

  // Recherche de prospect (facultatif)
  useEffect(() => {
    if (prospect || query.trim().length < 2) return setHits([])
    const t = setTimeout(() => {
      const q = new URLSearchParams({ 'where[name][like]': query.trim(), limit: '8', depth: '0', 'select[name]': 'true', 'select[commune]': 'true', sort: 'name' })
      api<{ docs: Hit[] }>(`/crm-prospects?${q}`)
        .then((r) => setHits(r.docs))
        .catch(() => setHits([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, prospect])

  useEffect(() => {
    if (!day) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDay(null)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [day])

  if (!day) return null
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Indique ce qu’il y a à faire.')
    if (time && !/^\d{1,2}[:h]\d{2}$/.test(time.trim())) return setError('Heure au format 14:30.')
    setBusy(true)
    setError('')
    try {
      await api('/crm-tasks', {
        method: 'POST',
        body: JSON.stringify({ kind, title: title.trim(), date: `${day}T12:00:00.000Z`, time: time.trim().replace('h', ':') || null, notes: notes.trim() || null, prospect: prospect?.id ?? null }),
      })
      setTitle(kindLabel(kind))
      titleTouched.current = false
      setTime('')
      setNotes('')
      setProspect(null)
      setQuery('')
      await load(day)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }
  const toggle = async (t: Task) => {
    await api(`/crm-tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.done }) }).catch((err) => setError(err.message))
    await load(day)
    router.refresh()
  }
  const remove = async (t: Task) => {
    if (!window.confirm(`Supprimer « ${t.title} » ?`)) return
    await api(`/crm-tasks/${t.id}`, { method: 'DELETE' }).catch((err) => setError(err.message))
    await load(day)
    router.refresh()
  }

  return (
    <div className="ctask__backdrop" onClick={(e) => e.target === e.currentTarget && setDay(null)}>
      <div className="ctask" role="dialog" aria-modal="true" aria-label={`Tâches du ${label}`}>
        <div className="ctask__head">
          <h2>{label.charAt(0).toUpperCase() + label.slice(1)}</h2>
          <button type="button" className="bbtn bbtn--ghost" onClick={() => setDay(null)} aria-label="Fermer">
            ✕
          </button>
        </div>

        {tasks === null ? (
          <p className="cmuted">Chargement…</p>
        ) : tasks.length ? (
          <ul className="ctask__list">
            {tasks.map((t) => {
              const p = typeof t.prospect === 'object' && t.prospect ? t.prospect : null
              return (
                <li key={t.id} className={t.done ? 'done' : ''}>
                  <label>
                    <span className={`cdot tone-${toneOfKind(t.kind)}`} aria-hidden />
                    <input type="checkbox" checked={Boolean(t.done)} onChange={() => toggle(t)} />
                    <span>
                      <b>{t.time ? `${t.time} · ` : ''}{t.title}</b>
                      <small>
                        {kindLabel(t.kind)}
                        {p ? (
                          <>
                            {' · '}
                            <a href={`/admin/prospection/base?fiche=${p.id}`}>{p.name}</a>
                          </>
                        ) : null}
                      </small>
                    </span>
                  </label>
                  <button type="button" className="bbtn bbtn--ghost" onClick={() => remove(t)} aria-label="Supprimer" title="Supprimer">
                    🗑
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="cmuted">Rien de prévu ce jour-là.</p>
        )}

        <form className="ctask__form" onSubmit={add}>
          <h3>Ajouter une tâche</h3>
          <div className="ctask__kinds" role="radiogroup" aria-label="Type">
            {CRM_TASK_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={kind === k.value}
                className={kind === k.value ? 'on' : ''}
                onClick={() => {
                  setKind(k.value)
                  if (!titleTouched.current) setTitle(k.label)
                }}
              >
                <span className={`cdot tone-${toneOfKind(k.value)}`} aria-hidden />
                {k.label}
              </button>
            ))}
          </div>
          <label className="bfield">
            À faire
            <input
              type="text"
              value={title}
              onChange={(e) => {
                titleTouched.current = true
                setTitle(e.target.value)
              }}
            />
          </label>
          <div className="ctask__row">
            <label className="bfield ctask__time">
              Heure (facultatif)
              <input type="text" inputMode="numeric" placeholder="14:30" value={time} onChange={(e) => setTime(e.target.value)} />
            </label>
            <div className="bfield ctask__who">
              Prospect (facultatif)
              {prospect ? (
                <span className="ctask__picked">
                  {prospect.name}
                  {prospect.commune ? ` · ${prospect.commune}` : ''}
                  <button type="button" className="bbtn bbtn--ghost" onClick={() => setProspect(null)} aria-label="Retirer le prospect">
                    ✕
                  </button>
                </span>
              ) : (
                <>
                  <input type="text" placeholder="Nom de la structure…" value={query} onChange={(e) => setQuery(e.target.value)} />
                  {hits.length > 0 && (
                    <ul className="ctask__hits">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setProspect(h)
                              setHits([])
                            }}
                          >
                            {h.name}
                            {h.commune ? <small> · {h.commune}</small> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </div>
          <label className="bfield">
            Notes (facultatif)
            <textarea className="btextarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {error && <p className="berr">{error}</p>}
          <div className="brow">
            <button type="submit" className="bbtn bbtn--primary" disabled={busy}>
              {busy ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CrmDayTasks
