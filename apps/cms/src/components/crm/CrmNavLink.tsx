'use client'

import { useAuth } from '@payloadcms/ui'
import { usePathname } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import { isCrmPath } from './CrmBackLink'
import { CRM_MENU, type CrmMenuItem } from './menu'
import './crm.scss'

const isActive = (path: string, item: CrmMenuItem) => {
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

  const [duplicates, setDuplicates] = useState(0)
  useEffect(() => {
    if (!inCrm || !allowed) return
    fetch('/api/crm-duplicates?where[status][equals]=a-examiner&limit=0&depth=0', { credentials: 'include' })
      .then((r) => r.json())
      .then((r: { totalDocs?: number }) => setDuplicates(r.totalDocs ?? 0))
      .catch(() => {})
  }, [inCrm, allowed, path])
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
        <a key={item.key} className={`nav__link crm-sidemenu__link${isActive(path, item) ? ' on' : ''}`} href={item.href}>
          <i className={`tone-${item.tone}`} aria-hidden>
            {item.icon}
          </i>
          {item.label}
          {item.key === 'doublons' && duplicates > 0 && <b className="cbadge tone-rose">{duplicates}</b>}
        </a>
      ))}
    </div>
  )
}

export default CrmNavLink
