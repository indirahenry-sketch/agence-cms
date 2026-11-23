'use client'

import React, { useState } from 'react'

/** Adresse d'abonnement à copier dans Outlook (ou Google / Apple). */
export const CrmAgendaLink = ({ url }: { url: string }) => {
  const [done, setDone] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setDone('Adresse copiée ✓')
    } catch {
      setDone('Sélectionne l’adresse et copie-la à la main.')
    }
  }
  return (
    <div className="cagenda">
      <input className="cagenda__url" type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Adresse de l’agenda" />
      <div className="cagenda__row">
        <button type="button" className="cagenda__btn" onClick={copy}>
          Copier l’adresse
        </button>
        <a className="cagenda__btn cagenda__btn--ghost" href={url.replace(/^https?:/, 'webcal:')}>
          Ouvrir dans le Calendrier Apple
        </a>
        {done && <span className="cmuted">{done}</span>}
      </div>
    </div>
  )
}
