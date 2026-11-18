'use client'

import React, { useEffect, useState } from 'react'

type Search = { id: number; status: string; added?: number | null; found?: number | null; report?: string | null }

/** Bouton « Compléter automatiquement » pour toute la base + suivi jusqu'à la fin. */
export const CrmEnrichForm: React.FC<{ toComplete: number; runningId: number | null }> = ({ toComplete, runningId }) => {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>(runningId ? 'running' : 'idle')
  const [message, setMessage] = useState(runningId ? 'Complément en cours…' : '')
  const [result, setResult] = useState<Search | null>(null)

  useEffect(() => {
    if (state !== 'running') return
    const t = setInterval(async () => {
      const res = await fetch('/api/crm-searches?where[trigger][equals]=completion&sort=-startedAt&limit=1&depth=0', { credentials: 'include' }).catch(() => null)
      const doc = ((await res?.json().catch(() => null)) as { docs?: Search[] } | null)?.docs?.[0]
      if (doc && doc.status !== 'en-cours') {
        setResult(doc)
        setState(doc.status === 'terminee' ? 'done' : 'error')
        setMessage('')
      }
    }, 5000)
    return () => clearInterval(t)
  }, [state])

  const launch = async () => {
    setState('running')
    setResult(null)
    setMessage(`Lecture des sites en cours (environ ${Math.max(1, Math.round((toComplete * 5) / 60))} min) : tu peux quitter cette page, le résultat sera dans l’historique.`)
    const res = await fetch('/api/crm-enrich', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null)
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null)
      setState('error')
      setMessage(body?.errors?.[0]?.message ?? 'Le complément n’a pas pu démarrer.')
    }
  }

  return (
    <div className="crm__import">
      <div className="brow">
        <button type="button" className="bbtn bbtn--primary" onClick={launch} disabled={state === 'running' || toComplete === 0}>
          {state === 'running' ? 'Complément en cours…' : `Compléter automatiquement (${toComplete} fiche${toComplete > 1 ? 's' : ''})`}
        </button>
      </div>
      {message && <p className={state === 'error' ? 'berr' : 'cmuted'}>{message}</p>}
      {result && (
        <div className="crm__report" role="status">
          <p>
            <b>{result.status === 'terminee' ? `${result.added ?? 0} fiche(s) complétée(s) sur ${result.found ?? 0}.` : 'Le complément a échoué.'}</b>
          </p>
          {result.report && <pre className="breport">{result.report}</pre>}
        </div>
      )}
    </div>
  )
}

export default CrmEnrichForm
