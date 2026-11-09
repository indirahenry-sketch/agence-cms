'use client'

import React, { useMemo, useState } from 'react'

import { relative } from './admin/client'

export type BoardSite = {
  id: number
  name: string
  slug: string
  status: string
  maintenance: boolean
  domain?: string | null
  labels: string[]
  lastChange?: string | null
  visits: number
}

const FLAGS: Record<string, [string, string]> = {
  maintenance: ['Mode maintenance', '#2563eb'],
  suspended: ['Client suspendu', '#e11d48'],
  archived: ['Client archivé', '#6b7280'],
}

/**
 * Vue « tous les sites » de l'agence : recherche, filtres par étiquette et par statut,
 * tri, bandeaux d'état, et « Voir comme le client » (le CMS filtré sur ce client).
 */
export const SitesBoard: React.FC<{ sites: BoardSite[] }> = ({ sites }) => {
  const [q, setQ] = useState('')
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState<'recent' | 'name' | 'visits'>('recent')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const allLabels = useMemo(() => [...new Set(sites.flatMap((s) => s.labels))].sort((a, b) => a.localeCompare(b, 'fr')), [sites])
  const state = (s: BoardSite) => (s.status !== 'active' ? s.status : s.maintenance ? 'maintenance' : 'active')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return sites
      .filter((s) => !term || [s.name, s.slug, s.domain ?? '', ...s.labels].some((v) => v.toLowerCase().includes(term)))
      .filter((s) => !label || s.labels.includes(label))
      .filter((s) => (status ? state(s) === status : s.status !== 'archived'))
      .sort((a, b) =>
        sort === 'name'
          ? a.name.localeCompare(b.name, 'fr')
          : sort === 'visits'
            ? b.visits - a.visits
            : new Date(b.lastChange ?? 0).getTime() - new Date(a.lastChange ?? 0).getTime(),
      )
  }, [sites, q, label, status, sort])

  const viewAs = (id: number) => {
    document.cookie = `payload-tenant=${id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
    window.location.href = '/admin'
  }

  return (
    <div className="board">
      <div className="board__bar">
        <label className="board__search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un site, un client, un domaine…" aria-label="Rechercher un site" />
        </label>
        <a className="dash__btn dash__btn--primary" href="/admin/collections/tenants/create">
          + Client
        </a>
      </div>
      <div className="board__filters">
        <select value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Étiquette">
          <option value="">Toutes les étiquettes</option>
          {allLabels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Statut">
          <option value="">Statut : en activité</option>
          <option value="active">En ligne</option>
          <option value="maintenance">Maintenance</option>
          <option value="suspended">Suspendus</option>
          <option value="archived">Archivés</option>
        </select>
        <span className="board__grow" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Tri">
          <option value="recent">Modifiés récemment</option>
          <option value="name">Nom</option>
          <option value="visits">Visites</option>
        </select>
        <div className="seg" role="group" aria-label="Affichage">
          <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} aria-label="Grille">
            ▦
          </button>
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} aria-label="Liste">
            ☰
          </button>
        </div>
      </div>
      <div className={view === 'grid' ? 'board__grid' : 'board__list'}>
        {list.map((s) => {
          const st = state(s)
          const flag = FLAGS[st]
          const online = st === 'active'
          return (
            <article key={s.id} className="bsite">
              {view === 'grid' && (
                <a className="bsite__thumb" href={`/sites/${s.slug}`} target="_blank" rel="noreferrer" aria-label={`Ouvrir le site ${s.name}`}>
                  {st !== 'suspended' && st !== 'archived' ? <iframe src={`/sites/${s.slug}`} title={`Aperçu de ${s.name}`} loading="lazy" sandbox="allow-scripts" tabIndex={-1} /> : null}
                  {flag && (
                    <span className="bsite__flag" style={{ background: flag[1] }}>
                      {flag[0]}
                    </span>
                  )}
                </a>
              )}
              <div className="bsite__body">
                <div className="bsite__title">
                  <span className={`dash__dot ${online ? '' : 'off'}`} style={st === 'maintenance' ? { background: '#2563eb' } : undefined} />
                  <b>{s.name}</b>
                  {view === 'list' && flag && <span className="bsite__tag bsite__tag--flag">{flag[0]}</span>}
                </div>
                <small>
                  {s.domain || `/sites/${s.slug}`} · {s.lastChange ? `modifié ${relative(s.lastChange)}` : 'pas encore modifié'} · {s.visits} visite{s.visits > 1 ? 's' : ''}
                </small>
                {s.labels.length > 0 && (
                  <div className="bsite__tags">
                    {s.labels.map((l) => (
                      <button type="button" key={l} className="bsite__tag" onClick={() => setLabel(l)}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
                <div className="bsite__actions">
                  <button type="button" className="bsite__as" onClick={() => viewAs(s.id)}>
                    Voir comme le client
                  </button>
                  <a className="dash__mini" href={`/admin/collections/tenants/${s.id}`}>
                    Fiche
                  </a>
                </div>
              </div>
            </article>
          )
        })}
        {!list.length && <p className="dash__muted">Aucun site ne correspond.</p>}
      </div>
    </div>
  )
}

export default SitesBoard
