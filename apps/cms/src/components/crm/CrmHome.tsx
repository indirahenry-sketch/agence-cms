import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps, Where } from 'payload'
import React from 'react'

import { CRM_STATUSES } from '@/crm/constants'
import { canUseCrm } from '@/crm/access'

import './crm.scss'

const LIST = '/admin/collections/crm-prospects'

/** Lundi 0 h (heure de Paris) de la semaine en cours, en date UTC. */
const startOfWeekParis = (now = new Date()) => {
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const shift = now.getTime() - paris.getTime()
  const monday = new Date(paris)
  monday.setDate(paris.getDate() - ((paris.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return new Date(monday.getTime() + shift)
}

const filterHref = (field: string, op: string, value: string) => `${LIST}?where[${field}][${op}]=${encodeURIComponent(value)}`

const Tile = ({ href, label, value, hint, tone }: { href: string; label: string; value: number | string; hint?: string; tone?: 'accent' | 'warn' }) => (
  <a className={`crm__tile${tone ? ` crm__tile--${tone}` : ''}`} href={href}>
    <span className="crm__tile-value">{value}</span>
    <span className="crm__tile-label">{label}</span>
    {hint && <span className="crm__tile-hint">{hint}</span>}
  </a>
)

/**
 * Page d'accueil de l'espace Prospection : /admin/prospection
 * Séparée du tableau de bord des sites clients, réservée au super admin.
 */
export const CrmHome = async ({ initPageResult, params, searchParams }: AdminViewServerProps) => {
  const { req } = initPageResult
  const { payload, user } = req
  const template = (children: React.ReactNode) => (
    <DefaultTemplate
      i18n={req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={payload}
      permissions={initPageResult.permissions}
      searchParams={searchParams}
      user={user || undefined}
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>{children}</Gutter>
    </DefaultTemplate>
  )

  if (!canUseCrm(user)) {
    return template(
      <div className="crm">
        <h1>Accès réservé</h1>
        <p>Cet espace est réservé à l’agence.</p>
        <a className="dash__btn" href="/admin">
          ← Retour
        </a>
      </div>,
    )
  }

  const now = new Date()
  const week = startOfWeekParis(now).toISOString()
  const soon = new Date(now.getTime() + 7 * 864e5).toISOString()
  const count = async (collection: 'crm-prospects' | 'crm-duplicates', where: Where = {}) =>
    (await payload.count({ collection, where, overrideAccess: true, req })).totalDocs

  const followWhere: Where = { and: [{ nextFollowUpAt: { less_than_equal: soon } }, { doNotContact: { not_equals: true } }] }
  const [settings, total, thisWeek, noSite, withSite, toFollow, duplicates, byStatus, upcoming] = await Promise.all([
    payload.findGlobal({ slug: 'crm-settings', overrideAccess: true, req }),
    count('crm-prospects'),
    count('crm-prospects', { createdAt: { greater_than_equal: week } }),
    count('crm-prospects', { websiteStatus: { equals: 'sans-site' } }),
    count('crm-prospects', { websiteStatus: { equals: 'site-existant' } }),
    count('crm-prospects', followWhere),
    count('crm-duplicates', { status: { equals: 'a-examiner' } }),
    Promise.all(CRM_STATUSES.map(async (s) => ({ ...s, n: await count('crm-prospects', { status: { equals: s.value } }) }))),
    payload.find({ collection: 'crm-prospects', where: followWhere, sort: 'nextFollowUpAt', limit: 8, depth: 0, overrideAccess: true, req }),
  ])
  const target = settings?.weeklyTarget ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((thisWeek / target) * 100)) : 0
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

  return template(
    <div className="crm">
      <header className="crm__head">
        <div>
          <p className="crm__kicker">Espace séparé des sites clients</p>
          <h1>Prospection</h1>
        </div>
        <a className="dash__btn" href="/admin">
          ← Retour au CMS
        </a>
      </header>

      <section className="crm__goal" aria-label="Objectif de la semaine">
        <div className="crm__goal-text">
          <b>
            {thisWeek} nouveau{thisWeek > 1 ? 'x' : ''} prospect{thisWeek > 1 ? 's' : ''} cette semaine
          </b>
          <span>
            Objectif : {target} ·{' '}
            <a href="/admin/globals/crm-settings">modifier</a>
          </span>
        </div>
        <div className="crm__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="crm__tiles">
        <Tile href={LIST} label="Prospects au total" value={total} tone="accent" />
        <Tile href={filterHref('websiteStatus', 'equals', 'sans-site')} label="Sans site" value={noSite} hint="Offre : création" />
        <Tile href={filterHref('websiteStatus', 'equals', 'site-existant')} label="Avec un site" value={withSite} hint="Offre : refonte" />
        <Tile href={filterHref('nextFollowUpAt', 'less_than_equal', soon)} label="À relancer sous 7 jours" value={toFollow} tone={toFollow ? 'warn' : undefined} />
        <Tile
          href="/admin/collections/crm-duplicates?where[status][equals]=a-examiner"
          label="Doublons à examiner"
          value={duplicates}
          tone={duplicates ? 'warn' : undefined}
        />
      </section>

      <div className="crm__cols">
        <section className="crm__card">
          <h2>Par statut</h2>
          <ul className="crm__list">
            {byStatus.map((s) => (
              <li key={s.value}>
                <a href={filterHref('status', 'equals', s.value)}>
                  <span>{s.label}</span>
                  <b>{s.n}</b>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="crm__card">
          <h2>Prochaines relances</h2>
          {upcoming.docs.length ? (
            <ul className="crm__list">
              {upcoming.docs.map((p) => (
                <li key={p.id}>
                  <a href={`${LIST}/${p.id}`}>
                    <span>
                      {p.name}
                      {p.commune ? <small> · {p.commune}</small> : null}
                    </span>
                    <b className={p.nextFollowUpAt && p.nextFollowUpAt < now.toISOString() ? 'crm__late' : ''}>
                      {p.nextFollowUpAt ? fmt.format(new Date(p.nextFollowUpAt)) : '—'}
                    </b>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm__empty">Aucune relance prévue dans les 7 prochains jours.</p>
          )}
        </section>

        <section className="crm__card">
          <h2>Raccourcis</h2>
          <ul className="crm__links">
            <li><a href={`${LIST}/create`}>+ Ajouter un prospect</a></li>
            <li><a href={LIST}>Tous les prospects</a></li>
            <li><a href="/admin/collections/crm-activities">Suivi des échanges</a></li>
            <li><a href="/admin/collections/crm-zones?where[active][equals]=true">Zones actives</a></li>
            <li><a href="/admin/collections/crm-searches">Historique des recherches</a></li>
            <li><a href="/admin/collections/crm-optouts">Ne plus contacter</a></li>
            <li><a href="/admin/globals/crm-settings">Réglages (objectif)</a></li>
          </ul>
        </section>
      </div>
    </div>,
  )
}

export default CrmHome
