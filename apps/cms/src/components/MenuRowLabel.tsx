'use client'

import { useRowLabel } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

import { api } from './admin/client'

type Link = { label?: string; type?: 'page' | 'anchor' | 'url'; page?: number | { id: number; title?: string } | null; anchor?: string; url?: string; children?: unknown[] }

const ANCHORS: Record<string, string> = {
  top: 'Haut de page',
  galerie: 'Photos',
  services: 'Services',
  tarifs: 'Tarifs',
  installations: 'Installations',
  stages: 'Stages',
  blog: 'Blog',
  actualites: 'Actualités',
  contact: 'Contact',
}

/** Titre lisible de chaque lien du menu (« Tarifs · Section de l'accueil ») au lieu de « Lien 01 ». */
export const MenuRowLabel: React.FC = () => {
  const { data, rowNumber } = useRowLabel<Link>()
  const [pageTitle, setPageTitle] = useState('')
  const pageID = typeof data?.page === 'object' && data.page ? data.page.id : data?.page

  useEffect(() => {
    if (data?.type !== 'page' || !pageID) return setPageTitle('')
    if (typeof data.page === 'object' && data.page?.title) return setPageTitle(data.page.title)
    api<{ title?: string }>(`/pages/${pageID}?depth=0&draft=true`)
      .then((p) => setPageTitle(p.title ?? ''))
      .catch(() => setPageTitle(''))
  }, [data?.type, data?.page, pageID])

  const dest =
    data?.type === 'page'
      ? `Page · ${pageTitle || '…'}`
      : data?.type === 'anchor'
        ? `Section de l’accueil · ${ANCHORS[data.anchor ?? ''] ?? data.anchor ?? '—'}`
        : data?.url
          ? `↗ ${data.url}`
          : 'Adresse à compléter'
  const subs = Array.isArray(data?.children) ? data.children.length : 0
  return (
    <span className="menu-row">
      <b>{data?.label || `Lien ${String((rowNumber ?? 0) + 1).padStart(2, '0')}`}</b>
      <span className={`menu-row__dest menu-row__dest--${data?.type ?? 'url'}`}>{dest}</span>
      {subs > 0 && <span className="menu-row__subs">{subs} sous-lien{subs > 1 ? 's' : ''}</span>}
    </span>
  )
}

export default MenuRowLabel
