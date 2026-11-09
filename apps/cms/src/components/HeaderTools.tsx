'use client'

import { useAuth, useTheme } from '@payloadcms/ui'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { api, qs, relative, remember, selectedTenant } from './admin/client'

type Notice = { id: string; kind: string; title: string; text: string; at: string; href: string }
type Hit = { group: string; label: string; sub?: string; href: string }

const ICON: Record<string, [string, string, string]> = {
  support: ['?', '#fdecf3', '#db2777'],
  client: ['+', '#f1ebfe', '#7c3aed'],
  user: ['@', '#e8f2fe', '#2563eb'],
  reply: ['↩', '#f1ebfe', '#7c3aed'],
  post: ['✓', '#e8f8ef', '#16a34a'],
  event: ['◷', '#e8f2fe', '#2563eb'],
}

/** Cloche : demandes de support, réponses de l'agence, articles mis en ligne, événements proches. */
const Bell: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notice[]>([])
  const [seen, setSeen] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api<{ items: Notice[] }>('/notifications')
      .then((r) => setItems(r.items))
      .catch(() => {})
  }, [])
  useEffect(() => {
    setSeen(Number(remember.get('notices-seen', '0')))
    load()
    const t = setInterval(load, 120_000)
    return () => clearInterval(t)
  }, [load])
  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const unread = items.filter((n) => new Date(n.at).getTime() > seen && new Date(n.at).getTime() <= Date.now()).length
  const markRead = () => {
    const t = Date.now()
    remember.set('notices-seen', String(t))
    setSeen(t)
  }

  return (
    <div className="htool" ref={box}>
      <button type="button" className="htool__btn" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ''}`} onClick={() => setOpen(!open)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && <span className="htool__count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif" role="dialog" aria-label="Notifications">
          <div className="notif__head">
            <b>Notifications</b>
            <button type="button" onClick={markRead}>Tout marquer lu</button>
          </div>
          <div className="notif__list">
            {items.map((n) => {
              const [ic, bg, fg] = ICON[n.kind] ?? ICON.client
              const isNew = new Date(n.at).getTime() > seen
              return (
                <a key={n.id} href={n.href} className={`notif__item${isNew ? ' new' : ''}`}>
                  <span className="notif__icon" style={{ background: bg, color: fg }}>
                    {ic}
                  </span>
                  <span className="notif__txt">
                    <b>{n.title}</b>
                    <span>{n.text}</span>
                  </span>
                  <small>{relative(n.at)}</small>
                </a>
              )
            })}
            {!items.length && <p className="notif__empty">Rien de nouveau ces deux dernières semaines.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

/** Recherche globale (Ctrl+K ou ⌘K) : pages, articles, tarifs, services, événements, photos, clients. */
const Search: React.FC<{ agency: boolean }> = ({ agency }) => {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 30)
  }, [open])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setHits([])
    const t = setTimeout(async () => {
      const tenant = selectedTenant()
      const sources: { group: string; col: string; field: string; sub?: (d: Record<string, unknown>) => string; skip?: boolean }[] = [
        { group: 'Pages', col: 'pages', field: 'title', sub: (d) => `/${d.slug ?? ''}` },
        { group: 'Articles', col: 'posts', field: 'title' },
        { group: 'Tarifs', col: 'prices', field: 'name', sub: (d) => `${d.price ?? ''} €` },
        { group: 'Services', col: 'services', field: 'title' },
        { group: 'Événements', col: 'events', field: 'title', sub: (d) => (d.startsAt ? new Date(String(d.startsAt)).toLocaleDateString('fr-FR') : '') },
        { group: 'Médiathèque', col: 'media', field: 'title' },
        { group: 'Clients', col: 'tenants', field: 'name', skip: !agency },
        { group: 'Utilisateurs', col: 'users', field: 'email', skip: !agency },
      ]
      const results = await Promise.all(
        sources
          .filter((s) => !s.skip)
          .map(async (s) => {
            const tenantFilter = tenant && !['tenants', 'users'].includes(s.col) ? { 'where[and][1][tenant][equals]': tenant } : {}
            const r = await api<{ docs: Record<string, unknown>[] }>(`/${s.col}?${qs({ limit: 5, depth: 0, [`where[and][0][${s.field}][like]`]: term, ...tenantFilter })}`).catch(() => ({ docs: [] }))
            return r.docs.map((d) => ({ group: s.group, label: String(d[s.field] ?? d.alt ?? d.filename ?? '—'), sub: s.sub?.(d), href: `/admin/collections/${s.col}/${d.id}` }))
          }),
      )
      setHits(results.flat())
      setActive(0)
    }, 220)
    return () => clearTimeout(t)
  }, [q, agency])

  const go = (h?: Hit) => h && (window.location.href = h.href)

  return (
    <>
      <button type="button" className="htool__search" onClick={() => setOpen(true)} aria-label="Rechercher (Ctrl+K)">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Rechercher…</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open && (
        <div className="kbar" role="dialog" aria-modal="true" aria-label="Recherche" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="kbar__box">
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Une page, un tarif, une photo, un client…"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, hits.length - 1)))
                if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
                if (e.key === 'Enter') go(hits[active])
              }}
            />
            <div className="kbar__list">
              {hits.map((h, i) => (
                <React.Fragment key={h.href}>
                  {(i === 0 || hits[i - 1].group !== h.group) && <p className="kbar__group">{h.group}</p>}
                  <a href={h.href} className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)}>
                    <span>{h.label}</span>
                    {h.sub && <small>{h.sub}</small>}
                  </a>
                </React.Fragment>
              ))}
              {q.trim().length >= 2 && !hits.length && <p className="kbar__empty">Aucun résultat pour « {q} ».</p>}
              {q.trim().length < 2 && <p className="kbar__empty">Tapez au moins 2 lettres. ↑ ↓ pour choisir, Entrée pour ouvrir.</p>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Bouton soleil / lune : thème clair ou sombre, retenu pour ce navigateur. */
const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme()
  const dark = theme === 'dark'
  return (
    <button type="button" className="htool__btn" aria-label={dark ? 'Passer en thème clair' : 'Passer en thème sombre'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
        </svg>
      )}
    </button>
  )
}

/** Outils de la barre du haut : recherche, notifications, thème. */
export const HeaderTools: React.FC = () => {
  const { user } = useAuth()
  if (!user) return null
  const agency = Boolean((user as { roles?: string[] }).roles?.includes('super-admin'))
  return (
    <div className="htools">
      <Search agency={agency} />
      <Bell />
      <ThemeToggle />
    </div>
  )
}

export default HeaderTools
