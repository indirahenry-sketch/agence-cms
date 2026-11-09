'use client'

import type { DefaultCellComponentProps } from 'payload'
import React from 'react'

import { relative } from './admin/client'

/** Pastille de statut dans les listes : Publié, Brouillon ou Programmé (date de publication future). */
export const StatusCell: React.FC<DefaultCellComponentProps> = ({ rowData }) => {
  const status = rowData?._status as string | undefined
  const at = rowData?.publishedAt as string | undefined
  const scheduled = status === 'published' && at && new Date(at).getTime() > Date.now()
  const [cls, label] = scheduled ? ['sched', 'Programmé'] : status === 'published' ? ['pub', 'Publié'] : ['draft', 'Brouillon']
  return (
    <span className={`pill pill--${cls}`} title={scheduled ? `En ligne ${relative(at)}` : undefined}>
      {label}
    </span>
  )
}

/** Date relative (« il y a 2 jours ») avec la date exacte au survol. */
export const RelativeDateCell: React.FC<DefaultCellComponentProps> = ({ rowData }) => {
  const at = (rowData?.updatedAt as string | undefined) ?? undefined
  return <span title={at ? new Date(at).toLocaleString('fr-FR') : ''}>{relative(at)}</span>
}

export default StatusCell
