'use client'

import React, { useState } from 'react'

type Merged = { keptName: string; removedName: string; added: string[] }

/** « Fusionner les doublons sûrs » : la fiche la plus complète prend le dessus. */
export const CrmMergeButton: React.FC<{ safe: number }> = ({ safe }) => {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [merged, setMerged] = useState<Merged[]>([])
  const [error, setError] = useState('')
  if (!safe && state === 'idle') return null

  const run = async () => {
    setState('busy')
    try {
      const res = await fetch('/api/crm-merge-duplicates', { method: 'POST', credentials: 'include' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? 'La fusion a échoué.')
      setMerged(body.merged ?? [])
      setState('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La fusion a échoué.')
      setState('error')
    }
  }

  return (
    <div className="cmerge">
      {state !== 'done' && (
        <>
          <p className="cmuted">
            {safe} doublon{safe > 1 ? 's' : ''} sûr{safe > 1 ? 's' : ''} (même SIREN, même nom et commune, même site ou e-mail). La fiche la plus complète est
            gardée et reprend ce que l’autre a en plus, sans rien écraser.
          </p>
          <button type="button" className="bbtn bbtn--primary" disabled={state === 'busy'} onClick={run}>
            {state === 'busy' ? 'Fusion en cours…' : `Fusionner ${safe > 1 ? `les ${safe} doublons` : 'le doublon'}`}
          </button>
        </>
      )}
      {state === 'error' && <p className="berr">{error}</p>}
      {state === 'done' && (
        <div role="status">
          <p className="bok">{merged.length} fiche{merged.length > 1 ? 's' : ''} fusionnée{merged.length > 1 ? 's' : ''} ✓</p>
          <ul className="cmerge__list">
            {merged.map((m) => (
              <li key={`${m.removedName}-${m.keptName}`}>
                « {m.removedName} » → <b>{m.keptName}</b>
                {m.added.length ? <span className="cmuted"> (repris : {m.added.join(', ')})</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default CrmMergeButton
