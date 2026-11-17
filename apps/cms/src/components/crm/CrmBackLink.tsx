'use client'

import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import './crm.scss'

/** Pages qui font partie de l'espace Prospection. */
export const isCrmPath = (path: string | null) =>
  Boolean(path && (path.startsWith('/admin/prospection') || path.startsWith('/admin/collections/crm-') || path.startsWith('/admin/globals/crm-')))

/**
 * « Retour au CMS », seulement dans l'espace Prospection :
 * - tout en bas du menu ☰ ;
 * - une flèche ronde fixée en bas à gauche de l'écran (au-dessus de la barre du téléphone).
 */
export const CrmBackLink: React.FC = () => {
  const path = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!isCrmPath(path)) return null
  return (
    <>
      <a className="nav__link crm-back-nav" href="/admin">
        ← Retour au CMS
      </a>
      {mounted &&
        createPortal(
          <a className="crm-back-fab" href="/admin" aria-label="Retour au CMS" title="Retour au CMS">
            ←
          </a>,
          document.body,
        )}
    </>
  )
}

export default CrmBackLink
