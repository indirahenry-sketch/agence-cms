'use client'

import { useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React, { useEffect } from 'react'

import { isCrmPath } from './CrmBackLink'
import './crm.scss'

/** Menu de l'espace Prospection (remplace le menu du CMS quand on est dans la prospection). */
const CRM_MENU: { href: string; label: string; icon: string; match?: string }[] = [
  { href: '/admin/prospection', label: 'Tableau de bord', icon: '◎' },
  { href: '/admin/prospection/base', label: 'Base de prospection', icon: '☰' },
  { href: '/admin/prospection/recherche', label: 'Recherche', icon: '⌕' },
  { href: '/admin/prospection/relances', label: 'Relances', icon: '◷' },
  { href: '/admin/prospection/import', label: 'Importer / exporter', icon: '⇅' },
  { href: '/admin/collections/crm-email-templates', label: 'Modèles d’e-mails', icon: '✉' },
  { href: '/admin/collections/crm-activities', label: 'Suivi des échanges', icon: '✎' },
  { href: '/admin/collections/crm-duplicates?where[status][equals]=a-examiner', match: '/admin/collections/crm-duplicates', label: 'Doublons', icon: '⧉' },
  { href: '/admin/collections/crm-zones', label: 'Zones', icon: '⌖' },
  { href: '/admin/collections/crm-searches', label: 'Historique des recherches', icon: '↻' },
  { href: '/admin/collections/crm-optouts', label: 'Ne plus contacter', icon: '⊘' },
  { href: '/admin/globals/crm-settings', label: 'Réglages', icon: '⚙' },
]

const isActive = (path: string, item: (typeof CRM_MENU)[number]) => {
  const target = item.match ?? item.href
  return target === '/admin/prospection' ? path === target : path === target || path.startsWith(`${target}/`)
}

/**
 * Hors prospection : lien « Espace Prospection » en haut du menu (super admin seulement).
 * Dans la prospection : le menu de gauche devient celui du CRM (le menu du CMS est masqué).
 */
export const CrmNavLink: React.FC = () => {
  const { user } = useAuth<{ roles?: string[] | null }>()
  const path = usePathname() ?? ''
  const inCrm = isCrmPath(path)
  const allowed = Boolean(user?.roles?.includes('super-admin'))

  useEffect(() => {
    document.body.classList.toggle('crm-space', inCrm && allowed)
    return () => document.body.classList.remove('crm-space')
  }, [inCrm, allowed])

  if (!allowed) return null
  if (!inCrm)
    return (
      <a className="crm-navlink" href="/admin/prospection">
        <span aria-hidden>◎</span> Espace Prospection
      </a>
    )
  return (
    <div className="crm-sidemenu">
      <p className="crm-sidemenu__title">Prospection</p>
      {CRM_MENU.map((item) => (
        <a key={item.href} className={`nav__link crm-sidemenu__link${isActive(path, item) ? ' on' : ''}`} href={item.href}>
          <span aria-hidden>{item.icon}</span>
          {item.label}
        </a>
      ))}
    </div>
  )
}

export default CrmNavLink
