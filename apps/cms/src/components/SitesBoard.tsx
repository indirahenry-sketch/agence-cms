'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

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

/** Menu « ⋮ » d'une carte : modifier, ouvrir, dupliquer, exporter, maintenance, statut, supprimer. */
const SiteMenu: React.FC<{ site: BoardSite; onViewAs: () => void }> = ({ site, onViewAs }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | TouchEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const call = async (path: string, init: RequestInit, done?: (data: Record<string, unknown>) => void) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/tenants/${site.id}${path}`, { credentials: 'include', ...init })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || `Erreur ${res.status}`)
      if (done) done(data)
      else window.location.reload()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy(false)
      setOpen(false)
    }
  }
  const patch = (data: Record<string, unknown>) =>
    call('', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })

  const duplicate = () => {
    const name = window.prompt(`Nom du nouveau client (la structure de « ${site.name} » sera copiée : pages, menus, catégories, services, tarifs) :`)
    if (!name?.trim()) return
    void call('/duplicate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }, (d) => {
      window.location.href = `/admin/collections/tenants/${d.id}`
    })
  }
  const remove = () => {
    const typed = window.prompt(
      `Supprimer définitivement « ${site.name} » ?\n\nSes pages, photos, articles, tarifs et comptes liés seront effacés. Conseil : exportez ses données avant.\n\nTapez le nom du client pour confirmer :`,
    )
    if (typed === null) return
    if (typed.trim().toLowerCase() !== site.name.trim().toLowerCase()) return alert('Le nom ne correspond pas : rien n’a été supprimé.')
    void call('', { method: 'DELETE' })
  }

  const items: ({ label: string; icon: string; danger?: boolean } & ({ href: string; blank?: boolean } | { run: () => void }))[] = [
    { label: 'Modifier la fiche', icon: '✎', href: `/admin/collections/tenants/${site.id}` },
    { label: 'Ouvrir le site', icon: '↗', href: site.domain ? `https://${site.domain.replace(/^https?:\/\//, '')}` : `/sites/${site.slug}`, blank: true },
    { label: 'Voir comme le client', icon: '◉', run: onViewAs },
    { label: 'Dupliquer comme modèle', icon: '⧉', run: duplicate },
    { label: 'Exporter les données', icon: '⤓', href: `/api/tenants/${site.id}/export` },
    { label: site.maintenance ? 'Remettre en ligne' : 'Mode maintenance', icon: '⚙', run: () => patch({ maintenance: !site.maintenance }) },
    site.status === 'active'
      ? { label: 'Suspendre le client', icon: '⏸', run: () => confirm(`Suspendre « ${site.name} » ? Son site passe hors ligne et ses comptes sont bloqués (contenus conservés).`) && patch({ status: 'suspended' }) }
      : { label: 'Réactiver le client', icon: '▶', run: () => patch({ status: 'active' }) },
    ...(site.status !== 'archived' ? [{ label: 'Archiver', icon: '▣', run: () => confirm(`Archiver « ${site.name} » ? Il sera masqué du tableau de bord (filtre « Archivés » pour le retrouver).`) && patch({ status: 'archived' }) }] : []),
    { label: 'Supprimer', icon: '🗑', danger: true, run: remove },
  ]

  return (
    <div className={`smenu${open ? ' open' : ''}`} ref={box}>
      <button type="button" className="smenu__btn" aria-label={`Options pour ${site.name}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>
        {busy ? '…' : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        )}
      </button>
      {open && (
        <div className="smenu__list" role="menu">
          {items.map((it) =>
            'href' in it ? (
              <a key={it.label} role="menuitem" href={it.href} target={it.blank ? '_blank' : undefined} rel={it.blank ? 'noreferrer' : undefined} className={it.danger ? 'danger' : ''}>
                <span aria-hidden>{it.icon}</span>
                {it.label}
              </a>
            ) : (
              <button key={it.label} type="button" role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => (setOpen(false), it.run())}>
                <span aria-hidden>{it.icon}</span>
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
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
              <SiteMenu site={s} onViewAs={() => viewAs(s.id)} />
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
