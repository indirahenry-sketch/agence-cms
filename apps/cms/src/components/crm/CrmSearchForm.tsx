'use client'

import React, { useEffect, useMemo, useState } from 'react'

type Zone = { id: number; label: string; region: string }
type Search = { id: number; status: string; added?: number | null; target?: number | null; report?: string | null }

/** Formulaire « Lancer une recherche » + suivi en direct jusqu'à la fin. */
export const CrmSearchForm: React.FC<{ zones: Zone[]; remaining: number; target: number; runningSince: string | null }> = ({ zones, remaining, target, runningSince }) => {
  const [scope, setScope] = useState('all')
  const [count, setCount] = useState(String(remaining || target || 20))
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>(runningSince ? 'running' : 'idle')
  const [message, setMessage] = useState(runningSince ? 'Une recherche est en cours…' : '')
  const [result, setResult] = useState<Search | null>(null)

  const regions = useMemo(() => [...new Set(zones.map((z) => z.region).filter(Boolean))].sort(), [zones])

  // Suivi : on relit la dernière recherche toutes les 5 secondes
  useEffect(() => {
    if (state !== 'running') return
    const t = setInterval(async () => {
      const res = await fetch('/api/crm-searches?sort=-startedAt&limit=1&depth=0', { credentials: 'include' }).catch(() => null)
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
    const zoneIds = scope === 'all' ? undefined : scope.startsWith('r:') ? zones.filter((z) => z.region === scope.slice(2)).map((z) => z.id) : [Number(scope)]
    setState('running')
    setResult(null)
    setMessage('Recherche lancée. Elle prend en général 2 à 10 minutes : tu peux quitter cette page, le résultat sera dans l’historique.')
    const res = await fetch('/api/crm-search', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zoneIds, target: Number(count) }),
    }).catch(() => null)
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null)
      setState('error')
      setMessage(body?.errors?.[0]?.message ?? 'La recherche n’a pas pu démarrer.')
    }
  }

  if (!zones.length)
    return (
      <p className="cempty">
        Aucune zone active. <a href="/admin/collections/crm-zones">Active au moins un département</a>.
      </p>
    )

  return (
    <div className="crm__import">
      <div className="bfilters" style={{ padding: 0 }}>
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Zone" disabled={state === 'running'}>
          <option value="all">Toutes les zones actives ({zones.length})</option>
          {regions.map((r) => (
            <option key={r} value={`r:${r}`}>
              Région : {r}
            </option>
          ))}
          {zones.map((z) => (
            <option key={z.id} value={String(z.id)}>
              {z.label}
            </option>
          ))}
        </select>
        <label className="bfield bfield--inline">
          Nombre maximum
          <input type="number" min={1} max={1000} value={count} onChange={(e) => setCount(e.target.value)} disabled={state === 'running'} style={{ width: 90 }} />
        </label>
        <button type="button" className="bbtn bbtn--primary" onClick={launch} disabled={state === 'running' || !(Number(count) >= 1)}>
          {state === 'running' ? 'Recherche en cours…' : 'Lancer la recherche'}
        </button>
      </div>
      {message && <p className={state === 'error' ? 'berr' : 'cmuted'}>{message}</p>}
      {result && (
        <div className="crm__report" role="status">
          <p>
            <b>{result.status === 'terminee' ? `${result.added ?? 0} nouveau(x) prospect(s) ajouté(s).` : 'La recherche a échoué.'}</b>
          </p>
          {result.report && <pre className="breport">{result.report}</pre>}
          {(result.added ?? 0) > 0 && (
            <p>
              <a className="clink" href={`/admin/prospection/base?recherche=${result.id}`}>
                Voir les nouveaux prospects →
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default CrmSearchForm
