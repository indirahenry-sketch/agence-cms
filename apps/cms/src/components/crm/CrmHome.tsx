import type { AdminViewServerProps, Where } from 'payload'
import React from 'react'

import { extractID } from '@/access/roles'
import { CRM_STATUSES } from '@/crm/constants'

import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

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

/** Statuts qui supposent qu'on a déjà pris contact. */
const CONTACTED = new Set(['email-envoye', 'en-attente', 'relance', 'client', 'non-interesse'])
/** Statuts qui supposent une réponse du prospect. */
const ANSWERED = new Set(['client', 'non-interesse'])

const percent = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—')

const Tile = ({ href, label, value, hint, tone }: { href?: string; label: string; value: number | string; hint?: string; tone?: 'accent' | 'warn' }) => {
  const body = (
    <>
      <span className="crm__tile-value">{value}</span>
      <span className="crm__tile-label">{label}</span>
      {hint && <span className="crm__tile-hint">{hint}</span>}
    </>
  )
  const cls = `crm__tile${tone ? ` crm__tile--${tone}` : ''}${href ? '' : ' crm__tile--static'}`
  return href ? (
    <a className={cls} href={href}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/**
 * Tableau de bord de la prospection : /admin/prospection
 * Séparé du tableau de bord des sites clients, réservé au super admin.
 */
export const CrmHome = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req

  const now = new Date()
  const week = startOfWeekParis(now).toISOString()
  const soon = new Date(now.getTime() + 7 * 864e5).toISOString()
  const base = { overrideAccess: true, req } as const
  const followWhere: Where = { and: [{ nextFollowUpAt: { less_than_equal: soon } }, { doNotContact: { not_equals: true } }] }

  const [settings, prospects, replies, emailsSent, duplicates, upcoming, zones] = await Promise.all([
    payload.findGlobal({ slug: 'crm-settings', ...base }),
    payload.find({
      collection: 'crm-prospects',
      limit: 0,
      pagination: false,
      depth: 0,
      select: { status: true, websiteStatus: true, department: true, lastContactAt: true, createdAt: true, nextFollowUpAt: true, doNotContact: true },
      ...base,
    }),
    payload.find({ collection: 'crm-activities', where: { kind: { equals: 'reponse' } }, limit: 0, pagination: false, depth: 0, select: { prospect: true }, ...base }),
    payload.count({ collection: 'crm-activities', where: { kind: { equals: 'email-envoye' } }, ...base }),
    payload.count({ collection: 'crm-duplicates', where: { status: { equals: 'a-examiner' } }, ...base }),
    payload.find({ collection: 'crm-prospects', where: followWhere, sort: 'nextFollowUpAt', limit: 8, depth: 0, ...base }),
    payload.find({ collection: 'crm-zones', limit: 0, pagination: false, depth: 0, select: { label: true }, ...base }),
  ])

  const all = prospects.docs
  const answeredIds = new Set(replies.docs.map((a) => extractID(a.prospect)))
  const count = (fn: (p: (typeof all)[number]) => boolean) => all.filter(fn).length
  const contacted = count((p) => Boolean(p.lastContactAt) || CONTACTED.has(p.status ?? ''))
  const answered = count((p) => answeredIds.has(p.id) || ANSWERED.has(p.status ?? ''))
  const clients = count((p) => p.status === 'client')
  const thisWeek = count((p) => (p.createdAt ?? '') >= week)
  const toFollow = count((p) => !p.doNotContact && Boolean(p.nextFollowUpAt) && (p.nextFollowUpAt ?? '') <= soon)
  const prepared = count((p) => p.status === 'email-a-preparer' || p.status === 'brouillon-cree')
  const byStatus = CRM_STATUSES.map((s) => ({ ...s, n: count((p) => p.status === s.value) }))

  const zoneLabel = new Map(zones.docs.map((z) => [z.id, z.label ?? '']))
  const depCounts = new Map<number | null, number>()
  for (const p of all) {
    const d = extractID(p.department) as number | null
    depCounts.set(d, (depCounts.get(d) ?? 0) + 1)
  }
  const byDepartment = [...depCounts.entries()]
    .map(([id, n]) => ({ id, n, label: id === null ? 'Sans département' : (zoneLabel.get(id) ?? '?') }))
    .sort((a, b) => b.n - a.n)

  const target = settings?.weeklyTarget ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((thisWeek / target) * 100)) : 0
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Prospection" current="accueil" />

      <section className="crm__goal" aria-label="Objectif de la semaine">
        <div className="crm__goal-text">
          <b>
            {thisWeek} nouveau{thisWeek > 1 ? 'x' : ''} prospect{thisWeek > 1 ? 's' : ''} cette semaine
          </b>
          <span>
            Objectif : {target} · <a href="/admin/globals/crm-settings">modifier</a>
          </span>
        </div>
        <div className="crm__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </section>

      <section className="crm__tiles" aria-label="Prospects">
        <Tile href={LIST} label="Prospects au total" value={all.length} tone="accent" />
        <Tile href={filterHref('websiteStatus', 'equals', 'sans-site')} label="Sans site" value={count((p) => p.websiteStatus === 'sans-site')} hint="Offre : création" />
        <Tile href={filterHref('websiteStatus', 'equals', 'site-existant')} label="Avec un site" value={count((p) => p.websiteStatus === 'site-existant')} hint="Offre : refonte" />
        <Tile href="/admin/prospection/relances" label="À relancer sous 7 jours" value={toFollow} tone={toFollow ? 'warn' : undefined} />
        <Tile
          href="/admin/collections/crm-duplicates?where[status][equals]=a-examiner"
          label="Doublons à examiner"
          value={duplicates.totalDocs}
          tone={duplicates.totalDocs ? 'warn' : undefined}
        />
      </section>

      <section className="crm__tiles" aria-label="Résultats commerciaux">
        <Tile href={filterHref('status', 'in', 'email-a-preparer,brouillon-cree')} label="E-mails à préparer ou en brouillon" value={prepared} />
        <Tile href="/admin/collections/crm-activities?where[kind][equals]=email-envoye" label="E-mails envoyés" value={emailsSent.totalDocs} />
        <Tile label="Prospects contactés" value={contacted} />
        <Tile label="Réponses reçues" value={answered} hint={`Taux de réponse : ${percent(answered, contacted)}`} />
        <Tile href={filterHref('status', 'equals', 'client')} label="Clients convertis" value={clients} hint={`Taux de conversion : ${percent(clients, contacted)}`} tone="accent" />
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
          <h2>Par département</h2>
          {byDepartment.length ? (
            <ul className="crm__list">
              {byDepartment.map((d) => (
                <li key={String(d.id)}>
                  <a href={d.id === null ? `${LIST}?where[department][exists]=false` : filterHref('department', 'equals', String(d.id))}>
                    <span>{d.label}</span>
                    <b>{d.n}</b>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm__empty">Aucun prospect pour l’instant.</p>
          )}
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
          <p className="crm__more">
            <a href="/admin/prospection/relances">Voir le calendrier des relances →</a>
          </p>
        </section>

        <section className="crm__card">
          <h2>Raccourcis</h2>
          <ul className="crm__links">
            <li><a href={`${LIST}/create`}>+ Ajouter un prospect</a></li>
            <li><a href={LIST}>Tous les prospects</a></li>
            <li><a href="/admin/collections/crm-activities">Suivi des échanges</a></li>
            <li><a href="/admin/prospection/import">Importer / exporter (CSV)</a></li>
            <li><a href="/admin/collections/crm-zones?where[active][equals]=true">Zones actives</a></li>
            <li><a href="/admin/collections/crm-searches">Historique des recherches</a></li>
            <li><a href="/admin/collections/crm-optouts">Ne plus contacter</a></li>
            <li><a href="/admin/globals/crm-settings">Réglages (objectif)</a></li>
          </ul>
        </section>
      </div>
      <p className="crm__note">
        Contactés : prospects avec au moins un échange (appel, e-mail, relance…) ou un statut qui le suppose. Réponses : un échange « Réponse reçue »,
        ou le statut Client / Non intéressé.
      </p>
    </div>,
  )
}

export default CrmHome
