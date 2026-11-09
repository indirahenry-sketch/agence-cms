'use client'

import { useAuth, useNav } from '@payloadcms/ui'
import React, { useEffect, useState } from 'react'

/**
 * Barre de navigation en bas de l'écran sur téléphone : Accueil, Photos, « + », Agenda, Plus.
 * Le « + » propose d'ajouter une photo, un article ou un événement en un geste.
 * Montée comme « provider » : elle entoure toute l'interface du CMS.
 */
export const MobileBar: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth()
  const { setNavOpen, navOpen } = useNav()
  const [path, setPath] = useState('')
  const [sheet, setSheet] = useState(false)
  useEffect(() => setPath(window.location.pathname), [])

  const tabs = [
    { href: '/admin', label: 'Accueil', icon: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />, on: path === '/admin' || path === '/admin/' },
    { href: '/admin/collections/media', label: 'Photos', icon: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />, on: path.startsWith('/admin/collections/media') },
    { href: '/admin/collections/events', label: 'Agenda', icon: <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18" />, on: path.startsWith('/admin/collections/events') },
  ]
  return (
    <>
      {children}
      {user && !path.startsWith('/admin/login') && (
        <>
          <nav className="mbar" aria-label="Navigation rapide">
            {tabs.slice(0, 2).map((t) => (
              <a key={t.href} href={t.href} className={t.on ? 'on' : ''}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                  {t.icon}
                </svg>
                {t.label}
              </a>
            ))}
            <button type="button" className="mbar__plus" aria-label="Ajouter" onClick={() => setSheet(!sheet)}>
              +
            </button>
            <a href={tabs[2].href} className={tabs[2].on ? 'on' : ''}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                {tabs[2].icon}
              </svg>
              {tabs[2].label}
            </a>
            <button type="button" className={navOpen ? 'on' : ''} onClick={() => setNavOpen(!navOpen)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Plus
            </button>
          </nav>
          {sheet && (
            <div className="msheet" onClick={() => setSheet(false)} role="presentation">
              <div className="msheet__box" role="dialog" aria-label="Ajouter">
                <a href="/admin/collections/media">📷 Ajouter des photos</a>
                <a href="/admin/collections/posts/create">📝 Écrire un article</a>
                <a href="/admin/collections/events/create">📅 Ajouter un événement</a>
                <a href="/admin/collections/prices/create">🏷️ Ajouter un tarif</a>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )
}

export default MobileBar
