'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import { api, qs, remember, selectedTenant } from './admin/client'

type MediaDoc = {
  id: number
  title?: string | null
  alt?: string | null
  filename?: string | null
  mimeType?: string | null
  url?: string | null
  inGallery?: boolean | null
  category?: number | { id: number } | null
  sizes?: { thumbnail?: { url?: string | null } }
}
type Category = { id: number; name: string; tenant?: number | { id: number } | null }

const IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/avif'
const VIDEOS = 'video/mp4,video/webm,video/quicktime'
const TYPES = [
  { key: 'all', label: 'Tout', where: {} },
  { key: 'image', label: 'Photos', where: { 'where[mimeType][in]': IMAGES } },
  { key: 'video', label: 'Vidéos', where: { 'where[mimeType][in]': VIDEOS } },
  { key: 'doc', label: 'Documents', where: { 'where[mimeType][not_in]': `${IMAGES},${VIDEOS}` } },
] as const

/**
 * Médiathèque en grille (au-dessus du tableau de Payload, qu'elle remplace quand « Grille » est choisi) :
 * aperçus, filtres par type et catégorie, envoi de plusieurs fichiers par glisser-déposer,
 * sélection multiple avec actions groupées.
 */
export const MediaGrid: React.FC = () => {
  const [mode, setMode] = useState<'grid' | 'table'>('grid')
  const [type, setType] = useState<string>('all')
  const [cat, setCat] = useState<number | null>(null)
  const [docs, setDocs] = useState<MediaDoc[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [cats, setCats] = useState<Category[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [busy, setBusy] = useState('')
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMode(remember.get('media-view', 'grid') === 'table' ? 'table' : 'grid')
  }, [])
  useEffect(() => {
    document.body.classList.toggle('media-grid-on', mode === 'grid')
    remember.set('media-view', mode)
    return () => document.body.classList.remove('media-grid-on')
  }, [mode])

  const tenantWhere = useCallback((): Record<string, string> => {
    const t = selectedTenant()
    return t ? { 'where[tenant][equals]': t } : {}
  }, [])

  const load = useCallback(async () => {
    const t = TYPES.find((x) => x.key === type)!
    const params = { limit: 120, depth: 0, sort: '_order', ...tenantWhere(), ...t.where, ...(cat ? { 'where[category][equals]': String(cat) } : {}) }
    const res = await api<{ docs: MediaDoc[] }>(`/media?${qs(params)}`)
    setDocs(res.docs)
    const c: Record<string, number> = {}
    await Promise.all(
      TYPES.map(async (x) => {
        const r = await api<{ totalDocs: number }>(`/media/count?${qs({ ...tenantWhere(), ...x.where })}`).catch(() => ({ totalDocs: 0 }))
        c[x.key] = r.totalDocs
      }),
    )
    setCounts(c)
  }, [type, cat, tenantWhere])

  useEffect(() => {
    load().catch(() => {})
  }, [load])
  useEffect(() => {
    api<{ docs: Category[] }>(`/categories?${qs({ limit: 50, depth: 0, 'where[usage][in]': 'gallery', ...tenantWhere() })}`)
      .then((r) => setCats(new Set(r.docs.map((c) => (typeof c.tenant === 'object' ? c.tenant?.id : c.tenant))).size > 1 ? [] : r.docs))
      .catch(() => {})
  }, [tenantWhere])

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    const tenant = selectedTenant()
    let done = 0
    for (const file of list) {
      setBusy(`Envoi ${done + 1}/${list.length}…`)
      const form = new FormData()
      form.append('file', file)
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Photo'
      form.append('_payload', JSON.stringify({ alt, title: alt, ...(tenant ? { tenant: Number(tenant) || tenant } : {}), ...(cat ? { category: cat } : {}) }))
      try {
        await api('/media', { method: 'POST', body: form })
        done++
      } catch (err) {
        alert(`${file.name} : ${err instanceof Error ? err.message : 'échec'}`)
      }
    }
    setBusy('')
    await load()
  }

  const bulk = async (data: Record<string, unknown>, label: string) => {
    if (!selected.length) return
    setBusy(label)
    try {
      await api(`/media?${qs({ 'where[id][in]': selected.join(',') })}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      })
      setSelected([])
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action impossible')
    } finally {
      setBusy('')
    }
  }

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="mgrid">
      <div className="mgrid__bar">
        <div className="seg" role="group" aria-label="Affichage">
          <button type="button" className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>
            ▦ Grille
          </button>
          <button type="button" className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>
            ☰ Tableau
          </button>
        </div>
        {mode === 'grid' && (
          <div className="chips">
            {TYPES.map((x) => (
              <button key={x.key} type="button" className={type === x.key && !cat ? 'chip on' : 'chip'} onClick={() => (setType(x.key), setCat(null))}>
                {x.label} · {counts[x.key] ?? '…'}
              </button>
            ))}
            {cats.map((c) => (
              <button key={c.id} type="button" className={cat === c.id ? 'chip on' : 'chip'} onClick={() => setCat(cat === c.id ? null : c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode === 'grid' && (
        <>
          <div
            className={`mgrid__drop${drag ? ' over' : ''}`}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              void upload(e.dataTransfer.files)
            }}
            onClick={() => input.current?.click()}
            role="button"
            tabIndex={0}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 16V4M6 10l6-6 6 6M4 20h16" />
            </svg>
            {busy || 'Glissez vos photos, vidéos ou documents ici (plusieurs à la fois), ou touchez pour choisir'}
            <input ref={input} type="file" multiple hidden accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods" onChange={(e) => e.target.files && void upload(e.target.files)} />
          </div>
          <div className="mgrid__tiles">
            {docs.map((m) => {
              const thumb = m.sizes?.thumbnail?.url || (m.mimeType?.startsWith('image/') ? m.url : null)
              const isSel = selected.includes(m.id)
              return (
                <div key={m.id} className={`mtile${isSel ? ' sel' : ''}`}>
                  <button type="button" className="mtile__check" aria-label={isSel ? 'Désélectionner' : 'Sélectionner'} onClick={() => toggle(m.id)}>
                    {isSel ? '✓' : ''}
                  </button>
                  <a href={`/admin/collections/media/${m.id}`} className="mtile__img">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={m.alt || ''} loading="lazy" />
                    ) : m.mimeType?.startsWith('video/') ? (
                      <span className="mtile__icon video">▶</span>
                    ) : (
                      <span className="mtile__icon doc">{(m.filename?.split('.').pop() || 'doc').toUpperCase()}</span>
                    )}
                    {m.inGallery && <span className="mtile__badge">Galerie</span>}
                  </a>
                  <span className="mtile__name">{m.title || m.alt || m.filename}</span>
                </div>
              )
            })}
            {!docs.length && <p className="mgrid__empty">Aucun fichier ici pour l’instant.</p>}
          </div>
          {selected.length > 0 && (
            <div className="mgrid__actions">
              <b>{selected.length} sélectionné{selected.length > 1 ? 's' : ''}</b>
              <button type="button" onClick={() => bulk({ inGallery: true }, 'Mise en galerie…')}>Mettre en galerie</button>
              <button type="button" onClick={() => bulk({ inGallery: false }, 'Retrait…')}>Retirer de la galerie</button>
              {cats.length > 0 && (
                <select defaultValue="" onChange={(e) => e.target.value && bulk({ category: Number(e.target.value) }, 'Catégorie…')} aria-label="Changer de catégorie">
                  <option value="">Changer de catégorie…</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="danger" onClick={() => confirm('Mettre ces fichiers à la corbeille (restaurables 30 jours) ?') && bulk({ deletedAt: new Date().toISOString() }, 'Corbeille…')}>
                Corbeille
              </button>
              <button type="button" onClick={() => setSelected([])}>Annuler</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MediaGrid
