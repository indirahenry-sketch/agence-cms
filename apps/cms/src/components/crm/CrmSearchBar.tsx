'use client'

import React, { useEffect, useRef, useState } from 'react'

type Hit = { id: number; name: string; commune?: string | null; phone?: string | null; email?: string | null; status?: string | null }

/**
 * Barre de recherche du tableau de bord : nom, autre nom, commune, téléphone, e-mail, SIREN.
 * Un résultat ouvre la fiche ; « Entrée » ouvre la base filtrée sur ce texte.
 */
export const CrmSearchBar: React.FC = () => {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [active, setActive] = useState(-1)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setHits(null)
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ limit: '8', depth: '0', sort: 'name' })
      ;['name', 'otherNames', 'commune', 'phone', 'email', 'siren'].forEach((f, i) => params.set(`where[or][${i}][${f}][like]`, term))
      for (const f of ['name', 'commune', 'phone', 'email', 'status']) params.set(`select[${f}]`, 'true')
      const res = await fetch(`/api/crm-prospects?${params}`, { credentials: 'include' }).catch(() => null)
      const body = (await res?.json().catch(() => null)) as { docs?: Hit[] } | null
      setHits(body?.docs ?? [])
      setActive(-1)
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setHits(null)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const open = (h: Hit) => (window.location.href = `/admin/prospection/base?fiche=${h.id}`)
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (hits && active >= 0 && hits[active]) return open(hits[active])
    if (q.trim()) window.location.href = `/admin/prospection/base?q=${encodeURIComponent(q.trim())}`
  }

  return (
    <div className="csearch" ref={box}>
      <form onSubmit={submit} role="search">
        <span aria-hidden>⌕</span>
        <input
          type="search"
          value={q}
          placeholder="Rechercher un prospect : nom, commune, téléphone, e-mail…"
          aria-label="Rechercher un prospect"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (!hits?.length) return
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(hits.length - 1, a + 1)))
            if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(-1, a - 1)))
            if (e.key === 'Escape') setHits(null)
          }}
        />
      </form>
      {hits && (
        <ul className="csearch__hits">
          {hits.length ? (
            hits.map((h, i) => (
              <li key={h.id}>
                <button type="button" className={i === active ? 'on' : ''} onClick={() => open(h)}>
                  <b>{h.name}</b>
                  <small>{[h.commune, h.phone, h.email].filter(Boolean).join(' · ') || 'Aucune coordonnée'}</small>
                </button>
              </li>
            ))
          ) : (
            <li className="csearch__none">Aucun prospect trouvé.</li>
          )}
          {q.trim() && (
            <li>
              <a className="csearch__all" href={`/admin/prospection/base?q=${encodeURIComponent(q.trim())}`}>
                Voir tous les résultats dans la base →
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

export default CrmSearchBar
