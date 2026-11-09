'use client'

import { useAuth } from '@payloadcms/ui'
import React, { useCallback, useEffect, useState } from 'react'

import { api, qs, selectedTenant } from './admin/client'

type Cat = { id: number; name: string; tenant?: number | { id: number } | null }
const EVENT = 'articles-name-changed'
const DEFAULT = 'Articles'

/** Catégorie « Articles » du client choisi (son nom est celui de la rubrique, renommable). */
function useArticlesCategory() {
  const { user } = useAuth()
  const [cat, setCat] = useState<Cat | null>(null)
  const [tenant, setTenant] = useState<string | null>(null)
  const agency = Boolean((user as { roles?: string[] } | null)?.roles?.includes('super-admin'))

  const load = useCallback(async () => {
    if (!user) return
    const t = selectedTenant()
    setTenant(t)
    // Agence sans client choisi : plusieurs clients, pas de nom unique à afficher
    if (agency && !t) return setCat(null)
    const r = await api<{ docs: Cat[] }>(
      `/categories?${qs({ limit: 1, depth: 0, sort: 'order', 'where[usage][in]': 'articles', ...(t ? { 'where[tenant][equals]': t } : {}) })}`,
    ).catch(() => ({ docs: [] as Cat[] }))
    setCat(r.docs[0] ?? null)
  }, [user, agency])

  useEffect(() => {
    void load()
    window.addEventListener(EVENT, load)
    return () => window.removeEventListener(EVENT, load)
  }, [load])

  /** Demande le nouveau nom puis l'enregistre (crée la catégorie si le client n'en a pas encore). */
  const rename = useCallback(async () => {
    if (agency && !tenant) return alert('Choisissez d’abord un client dans le sélecteur « Client » en haut du menu : chaque client a son propre nom de rubrique.')
    const name = window.prompt('Nouveau nom de la rubrique (ex. Actualités, Nouvelles, Journal) :', cat?.name || DEFAULT)?.trim()
    if (!name || name === cat?.name) return
    try {
      if (cat) {
        await api(`/categories/${cat.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
      } else {
        await api('/categories', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, usage: ['articles'], order: 4, ...(tenant ? { tenant: Number(tenant) || tenant } : {}) }),
        })
      }
      window.dispatchEvent(new Event(EVENT))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Renommage impossible')
    }
  }, [agency, tenant, cat])

  return { name: cat?.name || DEFAULT, rename, canRename: !(agency && !tenant), ready: Boolean(user) }
}

const Pencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
)

/** En haut de la liste des articles : nom de la rubrique + crayon pour le changer. */
export const ArticlesNameBar: React.FC = () => {
  const { name, rename, canRename } = useArticlesCategory()
  return (
    <div className="arname">
      <span className="arname__label">Nom de la rubrique sur le site et dans le menu</span>
      <b>{name}</b>
      <button type="button" className="arname__btn" onClick={rename} title={canRename ? 'Renommer la rubrique' : 'Choisissez un client pour renommer'} aria-label="Renommer la rubrique">
        <Pencil />
      </button>
    </div>
  )
}

/**
 * Menu de gauche : affiche le nom choisi par le client à la place de « Articles »,
 * avec un petit crayon pour le renommer sans quitter la page.
 * Monté comme « provider » : il entoure l'interface et met à jour le lien du menu.
 */
export const ArticlesNameNav: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { name, rename, ready } = useArticlesCategory()

  useEffect(() => {
    if (!ready) return
    const apply = () => {
      const link = document.querySelector<HTMLAnchorElement>('#nav-posts, nav a[href="/admin/collections/posts"]')
      if (!link) return
      const label = link.querySelector<HTMLElement>('[class*="label"]') ?? link
      const textNode = [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
      if (textNode && textNode.textContent !== name) textNode.textContent = name
      if (!link.querySelector('.nav-rename')) {
        const btn = document.createElement('span')
        btn.className = 'nav-rename'
        btn.setAttribute('role', 'button')
        btn.setAttribute('tabindex', '0')
        btn.setAttribute('aria-label', 'Renommer la rubrique')
        btn.title = 'Renommer la rubrique'
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
        link.appendChild(btn)
      }
    }
    apply()
    const obs = new MutationObserver(apply)
    obs.observe(document.body, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [name, ready])

  useEffect(() => {
    const onClick = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (!t?.closest('.nav-rename')) return
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      e.stopPropagation()
      void rename()
    }
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onClick, true)
    return () => {
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onClick, true)
    }
  }, [rename])

  return <>{children}</>
}

export default ArticlesNameBar
