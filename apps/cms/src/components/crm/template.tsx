import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { canUseCrm } from '@/crm/access'

import { crmMenuItem } from './menu'

import '../welcome.scss'
import './crm.scss'

/** Cadre commun des pages de l'espace Prospection (menu du CMS + marges). */
export const crmPage = ({ initPageResult, params, searchParams }: AdminViewServerProps, children: React.ReactNode) => {
  const { req } = initPageResult
  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={req.payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={req.user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{children}</Gutter>
    </DefaultTemplate>
  )
}

/** Page affichée à tout compte qui n'a pas accès à la prospection. */
export const crmDenied = (props: AdminViewServerProps) =>
  crmPage(
    props,
    <div className="crm">
      <h1>Accès réservé</h1>
      <p>Cet espace est réservé à l’agence.</p>
      <a className="dash__btn" href="/admin">
        ← Retour
      </a>
    </div>,
  )

export const crmAllowed = (props: AdminViewServerProps) => canUseCrm(props.initPageResult.req.user)

/** En-tête commun : titre + navigation entre les pages de la prospection. */
/** Onglets en haut des pages de la prospection (sur le tableau de bord : « Ajouter un prospect » au lieu de Recherche et Relances). */
const TABS = ['accueil', 'base', 'recherche', 'relances', 'import', 'modeles']
const DASHBOARD_TABS = ['accueil', 'base', 'ajouter', 'import', 'modeles']

export const CrmHeader = ({ title, current }: { title: string; current: 'accueil' | 'base' | 'recherche' | 'relances' | 'import' | 'zones' | 'registre' }) => (
  <header className="crm__head">
    <div>
      <p className="crm__kicker">Espace séparé des sites clients</p>
      <h1>{title}</h1>
    </div>
    <nav className="crm__tabs" aria-label="Prospection">
      {(current === 'accueil' ? DASHBOARD_TABS : TABS).map((key) => {
        const item = crmMenuItem(key)
        return (
          <a key={key} className={current === key ? 'on' : ''} href={item.href}>
            <i className={`tone-${item.tone}`} aria-hidden>
              {item.icon}
            </i>
            {item.label}
          </a>
        )
      })}
    </nav>
  </header>
)
