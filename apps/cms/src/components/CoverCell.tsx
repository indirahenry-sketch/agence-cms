'use client'

import type { DefaultCellComponentProps } from 'payload'
import React, { useEffect, useState } from 'react'

import { api } from './admin/client'

type Media = { id: number; url?: string | null; sizes?: { thumbnail?: { url?: string | null } }; alt?: string | null }

/** Miniature de couverture dans la liste des articles (carré neutre s'il n'y en a pas). */
export const CoverCell: React.FC<DefaultCellComponentProps> = ({ cellData, link, linkURL }) => {
  const [media, setMedia] = useState<Media | null>(typeof cellData === 'object' && cellData ? (cellData as Media) : null)
  useEffect(() => {
    if (typeof cellData === 'number') api<Media>(`/media/${cellData}?depth=0`).then(setMedia).catch(() => {})
  }, [cellData])
  const src = media?.sizes?.thumbnail?.url || media?.url
  const img = src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cover-cell" src={src} alt={media?.alt || ''} />
  ) : (
    <span className="cover-cell cover-cell--empty" aria-label="Pas d’image">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
      </svg>
    </span>
  )
  // 1re colonne de la liste : la miniature ouvre l'article (comme le titre)
  return link && linkURL ? (
    <a href={linkURL} className="cover-cell-link" aria-label="Ouvrir l’article">
      {img}
    </a>
  ) : (
    img
  )
}

export default CoverCell
