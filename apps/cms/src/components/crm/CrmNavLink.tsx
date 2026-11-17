'use client'

import { useAuth } from '@payloadcms/ui'
import React from 'react'

import './crm.scss'

/** Lien vers l'espace Prospection, en haut du menu, visible uniquement par le super admin. */
export const CrmNavLink: React.FC = () => {
  const { user } = useAuth<{ roles?: string[] | null }>()
  if (!user?.roles?.includes('super-admin')) return null
  return (
    <a className="crm-navlink" href="/admin/prospection">
      <span aria-hidden>◎</span> Espace Prospection
    </a>
  )
}

export default CrmNavLink
