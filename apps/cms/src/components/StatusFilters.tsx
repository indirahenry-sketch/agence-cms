'use client'

import React, { useEffect, useState } from 'react'

/** Filtres en un clic au-dessus des listes d'articles et de pages. */
export const StatusFilters: React.FC = () => {
  const [search, setSearch] = useState('')
  useEffect(() => setSearch(window.location.search), [])
  const now = new Date().toISOString()
  const filters = [
    { label: 'Tous', q: '' },
    { label: 'Publiés', q: `where[_status][equals]=published` },
    { label: 'Brouillons', q: `where[_status][equals]=draft` },
    { label: 'Programmés', q: `where[and][0][_status][equals]=published&where[and][1][publishedAt][greater_than]=${encodeURIComponent(now)}` },
  ]
  const current = (q: string) => {
    if (!q) return !/where/.test(decodeURIComponent(search))
    const key = q.split('&')[0].replace(/=.*/, '')
    return decodeURIComponent(search).includes(decodeURIComponent(key)) && decodeURIComponent(search).includes(q.includes('draft') ? 'draft' : 'published') && (q.includes('publishedAt') === decodeURIComponent(search).includes('publishedAt'))
  }
  return (
    <div className="status-filters" role="group" aria-label="Filtrer par statut">
      {filters.map((f) => (
        <a key={f.label} className={current(f.q) ? 'chip on' : 'chip'} href={`${typeof window !== 'undefined' ? window.location.pathname : ''}${f.q ? `?${f.q}` : ''}`}>
          {f.label}
        </a>
      ))}
    </div>
  )
}

export default StatusFilters
