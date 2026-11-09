'use client'

import React, { useState } from 'react'

import type { StorageStatus } from '@/lib/s3-check'

/** Bandeau rouge sur le tableau de bord de l'agence quand les photos ne peuvent pas être enregistrées. */
export const StorageAlert: React.FC<{ status: StorageStatus | null }> = ({ status: initial }) => {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!status || (status.ok && status.mode === 's3')) return msg ? <p className="salert salert--ok">{msg}</p> : null

  const retest = async () => {
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch('/api/storage-check', { method: 'POST', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || `Erreur ${res.status}`)
      setStatus(data.status)
      if (data.status?.ok) setMsg(`✓ Stockage des photos opérationnel${data.imported ? ', photos du site de démonstration importées' : ''}. Rechargez la page.`)
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Test impossible')
    } finally {
      setBusy(false)
    }
  }

  const disk = status.ok && status.mode === 'disk'
  return (
    <div className={`salert${disk ? ' salert--warn' : ''}`} role="alert">
      <div>
        <b>{disk ? 'Photos stockées sur le serveur (temporaire)' : 'Les photos ne peuvent pas être enregistrées'}</b>
        {disk ? (
          <p>{status.warnings[0]}</p>
        ) : (
          <>
            <p>
              C’est pour ça que l’ajout d’images affiche une erreur et que les photos du site n’arrivent pas dans le CMS. À corriger dans Render → <i>Environment</i> : {status.hint}.
            </p>
            {status.warnings.length > 0 && <p>À vérifier aussi : {status.warnings.join(' ; ')}.</p>}
            <details>
              <summary>Détail technique</summary>
              <code>{status.error}</code>
            </details>
          </>
        )}
        {msg && <p className="salert__msg">{msg}</p>}
      </div>
      {!disk && (
        <button type="button" className="dash__btn" onClick={retest} disabled={busy}>
          {busy ? 'Test en cours…' : 'Tester à nouveau'}
        </button>
      )}
    </div>
  )
}

export default StorageAlert
