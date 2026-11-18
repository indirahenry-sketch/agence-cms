'use client'

import React, { useState } from 'react'

type Line = { line: number; name: string; detail: string }
type Report = {
  dryRun: boolean
  total: number
  added: number
  addedNames: string[]
  known: Line[]
  optOut: Line[]
  rejected: Line[]
  warnings: Line[]
  completed?: Line[]
  searchId?: number
}

const Lines = ({ title, list }: { title: string; list: Line[] }) =>
  list.length ? (
    <details className="crm__report-group">
      <summary>
        {title} ({list.length})
      </summary>
      <ul>
        {list.map((l) => (
          <li key={`${l.line}-${l.detail}`}>
            Ligne {l.line}
            {l.name ? ` · ${l.name}` : ''} : {l.detail}
          </li>
        ))}
      </ul>
    </details>
  ) : null

/** Formulaire d'import : « Vérifier » (aperçu, rien n'est enregistré) puis « Importer ». */
export const CrmImportForm: React.FC = () => {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<Report | null>(null)

  const send = async (dryRun: boolean) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/crm-import${dryRun ? '?apercu=1' : ''}`, {
        method: 'POST',
        body: file,
        credentials: 'include',
        headers: { 'Content-Type': 'text/csv' },
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.errors?.[0]?.message ?? `Erreur ${res.status}`)
      setReport(body as Report)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crm__import">
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null)
          setReport(null)
          setError('')
        }}
      />
      <div className="crm__import-actions">
        <button type="button" className="dash__btn" disabled={!file || busy} onClick={() => send(true)}>
          Vérifier (sans rien ajouter)
        </button>
        <button type="button" className="dash__btn dash__btn--primary" disabled={!file || busy || !report?.dryRun || report.added + (report.completed?.length ?? 0) === 0} onClick={() => send(false)}>
          Importer{' '}
          {report?.dryRun
            ? [report.added && `${report.added} nouveau${report.added > 1 ? 'x' : ''}`, report.completed?.length && `${report.completed.length} complément${report.completed.length > 1 ? 's' : ''}`]
                .filter(Boolean)
                .join(' + ')
            : ''}
        </button>
      </div>
      {busy && <p className="crm__empty">Traitement en cours…</p>}
      {error && <p className="crm__error">{error}</p>}
      {report && (
        <div className="crm__report" role="status">
          <p>
            <b>
              {report.dryRun
                ? `Aperçu : ${report.added} nouveau(x) prospect(s) et ${report.completed?.length ?? 0} fiche(s) existante(s) complétée(s), sur ${report.total} ligne${report.total > 1 ? 's' : ''}.`
                : `${report.added} prospect(s) ajouté(s) et ${report.completed?.length ?? 0} fiche(s) complétée(s), sur ${report.total} ligne${report.total > 1 ? 's' : ''}.`}
            </b>
          </p>
          <Lines title={report.dryRun ? 'Seraient ajoutés' : 'Ajoutés'} list={report.addedNames.map((name, i) => ({ line: i + 1, name, detail: 'nouveau' }))} />
          <Lines title={report.dryRun ? 'Fiches existantes qui seraient complétées' : 'Fiches existantes complétées'} list={report.completed ?? []} />
          <Lines title="Déjà connus, rien de nouveau" list={report.known} />
          <Lines title="Ne plus contacter (non ajoutés)" list={report.optOut} />
          <Lines title="Lignes écartées" list={report.rejected} />
          <Lines title="Avertissements" list={report.warnings} />
          {!report.dryRun && report.searchId && (
            <p>
              <a href={`/admin/collections/crm-prospects?where[search][equals]=${report.searchId}`}>Voir les prospects importés →</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default CrmImportForm
