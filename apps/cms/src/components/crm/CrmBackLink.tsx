'use client'

import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import './crm.scss'

/** Pages qui font partie de l'espace Prospection. */
export const isCrmPath = (path: string | null) =>
  Boolean(path && (path.startsWith('/admin/prospection') || path.startsWith('/admin/collections/crm-') || path.startsWith('/admin/globals/crm-')))

/**
 * - Dans la prospection : « Retour au CMS » tout en bas du menu de gauche.
 * - Partout (sauf l'accueil du CMS) : flèche ronde en bas à gauche pour revenir à la page précédente.
 */
export const CrmBackLink: React.FC = () => {
  const path = usePathname()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const inCrm = isCrmPath(path)
  const goBack = (e: React.MouseEvent) => {
    e.preventDefault()
    // Page précédente si on vient du site ; sinon, accueil de l'espace en cours
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) window.history.back()
    else window.location.href = inCrm ? '/admin/prospection' : '/admin'
  }
  return (
    <>
      {inCrm && (
        <a className="nav__link crm-back-nav" href="/admin">
          ← Retour au CMS
        </a>
      )}
      {mounted &&
        path !== '/admin' &&
        createPortal(
          <a className="crm-back-fab" href={inCrm ? '/admin/prospection' : '/admin'} onClick={goBack} aria-label="Page précédente" title="Page précédente">
            ←
          </a>,
          document.body,
        )}
    </>
  )
}

export default CrmBackLink
