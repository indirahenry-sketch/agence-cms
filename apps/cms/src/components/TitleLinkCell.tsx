'use client'

import type { DefaultCellComponentProps } from 'payload'
import { useConfig } from '@payloadcms/ui'
import React from 'react'

/** Titre cliquable dans une liste : ouvre la fiche pour la modifier (utile quand le titre n'est pas la 1re colonne). */
export const TitleLinkCell: React.FC<DefaultCellComponentProps> = ({ cellData, collectionSlug, rowData }) => {
  const {
    config: {
      routes: { admin },
    },
  } = useConfig()
  const label = typeof cellData === 'string' && cellData.trim() ? cellData : 'Sans titre'
  return (
    <a href={`${admin}/collections/${collectionSlug}/${rowData.id}`} className="title-cell-link">
      {label}
    </a>
  )
}

export default TitleLinkCell
