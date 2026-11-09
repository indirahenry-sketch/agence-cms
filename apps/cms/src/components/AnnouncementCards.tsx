'use client'

import React, { useEffect, useState } from 'react'

/** Annonces de l'agence en haut du tableau de bord client ; « Masquer » est retenu sur cet appareil. */
export type AnnouncementItem = { id: number; key: string; title: string; text?: string | null; tone: string; buttonLabel?: string | null; buttonUrl?: string | null }

const TONE_LABEL: Record<string, string> = { news: 'Nouveauté', offer: 'Offre', info: 'Information', warning: 'Important' }
const STORE = 'cms-hidden-announcements'

const readHidden = (): string[] => {
  try {
    return JSON.parse(window.localStorage.getItem(STORE) || '[]')
  } catch {
    return []
  }
}

export const AnnouncementCards: React.FC<{ items: AnnouncementItem[] }> = ({ items }) => {
  const [hidden, setHidden] = useState<string[] | null>(null)
  useEffect(() => setHidden(readHidden()), [])
  if (hidden === null) return null
  const visible = items.filter((a) => !hidden.includes(a.key))
  if (!visible.length) return null
  const hide = (key: string) => {
    const next = [...hidden, key]
    setHidden(next)
    try {
      window.localStorage.setItem(STORE, JSON.stringify(next.slice(-50)))
    } catch {
      /* stockage indisponible : masqué jusqu'au rechargement */
    }
  }
  return (
    <div className="annonces" aria-label="Messages de votre agence">
      {visible.map((a) => (
        <article key={a.key} className={`annonce annonce--${a.tone}`}>
          <span className="annonce__tag">{TONE_LABEL[a.tone] ?? 'Agence'}</span>
          <div className="annonce__body">
            <strong>{a.title}</strong>
            {a.text && <p>{a.text}</p>}
          </div>
          {a.buttonLabel && a.buttonUrl && (
            <a className="dash__btn dash__btn--primary" href={a.buttonUrl}>
              {a.buttonLabel}
            </a>
          )}
          <button type="button" className="annonce__x" aria-label="Masquer ce message" onClick={() => hide(a.key)}>
            ×
          </button>
        </article>
      ))}
    </div>
  )
}

export default AnnouncementCards
