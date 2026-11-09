'use client'

import { useAuth, useDocumentInfo } from '@payloadcms/ui'
import React, { useState } from 'react'

/**
 * Encadré « Outils de l'agence » sur la fiche d'un client (super admin seulement) :
 * voir le site, exporter toutes ses données, dupliquer le client comme modèle.
 */
export const TenantTools: React.FC = () => {
  const { user } = useAuth()
  const { id, savedDocumentData } = useDocumentInfo()
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const isAgency = Boolean((user as { roles?: string[] } | null)?.roles?.includes('super-admin'))
  const slug = (savedDocumentData as { slug?: string } | undefined)?.slug
  if (!id) return null

  const duplicate = async () => {
    const name = window.prompt('Nom du nouveau client (sa structure sera copiée : pages, menus, catégories, services, tarifs) :')
    if (!name?.trim()) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/tenants/${id}/duplicate`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.errors?.[0]?.message || data?.message || 'Échec de la duplication')
      setMsg(data.message)
      window.location.href = `/admin/collections/tenants/${data.id}`
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Échec de la duplication')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tenant-tools">
      <p className="tenant-tools__title">{isAgency ? 'Outils de l’agence' : 'Mon site'}</p>
      {slug && (
        <a className="tenant-tools__btn" href={`/sites/${slug}`} target="_blank" rel="noreferrer">
          Voir le site ↗
        </a>
      )}
      {isAgency && (
        <>
          <a className="tenant-tools__btn" href={`/api/tenants/${id}/export`}>
            Exporter les données (JSON)
          </a>
          <button className="tenant-tools__btn" type="button" onClick={duplicate} disabled={busy}>
            {busy ? 'Duplication…' : 'Dupliquer comme modèle'}
          </button>
        </>
      )}
      {msg && <p className="tenant-tools__msg">{msg}</p>}
    </div>
  )
}

export default TenantTools
