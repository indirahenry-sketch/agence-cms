import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { extractID } from '@/access/roles'
import { CRM_ACTIVITY_KINDS, CRM_STATUSES, CRM_TYPES } from '@/crm/constants'
import { loadFollowUps, monthCells, parisDay, ymd } from '@/crm/followUps'
import { countSafeDuplicates } from '@/crm/merge'
import type { CrmProspect } from '@/payload-types'

import { CrmMergeButton } from './CrmMergeButton'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

const LIST = '/admin/collections/crm-prospects'
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

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
const percent = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : '—')
const initials = (name: string) =>
  name
    .replace(/^exemple\s*·\s*/i, '')
    .split(/[\s'’-]+/)
    .filter((w) => w.length > 2 || /^[A-ZÉ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

/** Couleurs pastel (voir crm.scss) : lavande, ciel, pêche, menthe, rose, beurre. */
type Tone = 'lav' | 'sky' | 'peach' | 'mint' | 'rose' | 'butter'
const TONES: Tone[] = ['lav', 'sky', 'peach', 'mint', 'rose', 'butter']
const toneOf = (s: string) => TONES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TONES.length]

/** Les grandes étapes du parcours d'un prospect, chacune regroupant plusieurs statuts. */
const PIPELINE: { label: string; tone: Tone; statuses: string[] }[] = [
  { label: 'À traiter', tone: 'lav', statuses: ['nouveau', 'a-verifier', 'qualifie'] },
  { label: 'E-mail', tone: 'sky', statuses: ['email-a-preparer', 'brouillon-cree', 'email-envoye', 'en-attente'] },
  { label: 'À relancer', tone: 'peach', statuses: ['relance'] },
  { label: 'Clients', tone: 'mint', statuses: ['client'] },
  { label: 'Perdus', tone: 'rose', statuses: ['non-interesse', 'ne-plus-contacter'] },
]
const STATUS_TONE: Record<string, Tone> = Object.fromEntries(PIPELINE.flatMap((s) => s.statuses.map((st) => [st, s.tone])))
const statusLabel = (v?: string | null) => CRM_STATUSES.find((s) => s.value === v)?.label ?? '—'
const typeLabel = (v?: string | null) => CRM_TYPES.find((t) => t.value === v)?.label ?? ''

const KIND_ICON: Record<string, string> = { note: '✎', appel: '☎', 'email-envoye': '✉', reponse: '↩', relance: '↻', rdv: '◷', autre: '•' }
const KIND_TONE: Record<string, Tone> = { note: 'butter', appel: 'mint', 'email-envoye': 'sky', reponse: 'lav', relance: 'peach', rdv: 'rose', autre: 'lav' }
const kindLabel = (v?: string | null) => CRM_ACTIVITY_KINDS.find((k) => k.value === v)?.label ?? ''

/** Statuts qui supposent qu'on a déjà pris contact / reçu une réponse. */
const CONTACTED = new Set(['email-envoye', 'en-attente', 'relance', 'client', 'non-interesse'])
const ANSWERED = new Set(['client', 'non-interesse'])

const ago = (iso: string, now: Date) => {
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  const min = Math.round((new Date(iso).getTime() - now.getTime()) / 60000)
  if (Math.abs(min) < 60) return rtf.format(min, 'minute')
  if (Math.abs(min) < 60 * 24) return rtf.format(Math.round(min / 60), 'hour')
  return rtf.format(Math.round(min / 1440), 'day')
}

/**
 * Tableau de bord de la prospection : /admin/prospection
 * Gauche : raccourcis et relances à faire · Centre : parcours, chiffres, derniers prospects
 * Droite : mini-calendrier des relances et activité récente.
 */
export const CrmHome = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req

  const now = new Date()
  const today = parisDay(now)
  const [y, m] = today.split('-').map(Number)
  const cells = monthCells(y, m)
  const week = startOfWeekParis(now).toISOString()
  const soon = new Date(now.getTime() + 7 * 864e5).toISOString()
  const base = { overrideAccess: true, req } as const

  const safeDuplicates = await countSafeDuplicates(payload, req)
  const [settings, prospects, replies, emailsSent, duplicates, recent, activity, zones, followUps] = await Promise.all([
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
    payload.find({ collection: 'crm-prospects', sort: '-createdAt', limit: 6, depth: 0, ...base }),
    payload.find({ collection: 'crm-activities', sort: '-updatedAt', limit: 7, depth: 1, ...base }),
    payload.find({ collection: 'crm-zones', limit: 0, pagination: false, depth: 0, select: { label: true }, ...base }),
    loadFollowUps(payload, req, cells),
  ])

  const all = prospects.docs
  const count = (fn: (p: (typeof all)[number]) => boolean) => all.filter(fn).length
  const answeredIds = new Set(replies.docs.map((a) => extractID(a.prospect)))
  const contacted = count((p) => Boolean(p.lastContactAt) || CONTACTED.has(p.status ?? ''))
  const answered = count((p) => answeredIds.has(p.id) || ANSWERED.has(p.status ?? ''))
  const clients = count((p) => p.status === 'client')
  const thisWeek = count((p) => (p.createdAt ?? '') >= week)
  const target = settings?.weeklyTarget ?? 0
  const pct = target > 0 ? Math.min(100, Math.round((thisWeek / target) * 100)) : 0

  const stages = PIPELINE.map((s) => ({ ...s, n: count((p) => s.statuses.includes(p.status ?? '')) }))
  const totalInStages = stages.reduce((a, s) => a + s.n, 0)

  // Relances à faire : en retard et à venir (7 jours)
  const todo = followUps.filter((f) => f.day <= parisDay(soon)).slice(0, 6)
  const perDay = new Map<string, number>()
  for (const f of followUps) perDay.set(f.day, (perDay.get(f.day) ?? 0) + 1)
  const late = followUps.filter((f) => f.day < today).length
  const dayLabel = (d: string) =>
    d === today ? 'Aujourd’hui' : d < today ? 'En retard' : new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))

  const zoneLabel = new Map(zones.docs.map((z) => [z.id, z.label ?? '']))
  const depCounts = new Map<number | null, number>()
  for (const p of all) {
    const d = extractID(p.department) as number | null
    depCounts.set(d, (depCounts.get(d) ?? 0) + 1)
  }
  const byDepartment = [...depCounts.entries()]
    .map(([id, n]) => ({ id, n, label: id === null ? 'Sans département' : (zoneLabel.get(id) ?? '?') }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 8)
  const maxDep = Math.max(1, ...byDepartment.map((d) => d.n))

  const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))

  return crmPage(
    props,
    <div className="crm crm--dash">
      <CrmHeader title="Prospection" current="accueil" />

      <div className="cdash">
        {/* ---------- Colonne gauche ---------- */}
        <aside className="cdash__left">
          <section className="ccard">
            <h2 className="ccard__title">Raccourcis</h2>
            <ul className="cnav">
              <li><a href={`${LIST}/create`}><i className="tone-lav">＋</i>Ajouter un prospect</a></li>
              <li><a href="/admin/prospection/base"><i className="tone-sky">☰</i>Base de prospection</a></li>
              <li><a href="/admin/prospection/relances"><i className="tone-peach">◷</i>Relances</a></li>
              <li><a href="/admin/collections/crm-activities"><i className="tone-mint">✎</i>Suivi des échanges</a></li>
              <li><a href="/admin/prospection/import"><i className="tone-butter">⇅</i>Importer / exporter</a></li>
              <li><a href="/admin/collections/crm-email-templates"><i className="tone-sky">✉</i>Modèles d’e-mails</a></li>
              <li><a href="/admin/collections/crm-zones?where[active][equals]=true"><i className="tone-lav">⌖</i>Zones actives</a></li>
              <li>
                <a href="/admin/collections/crm-duplicates?where[status][equals]=a-examiner">
                  <i className="tone-rose">⧉</i>Doublons{duplicates.totalDocs ? <b className="cbadge tone-rose">{duplicates.totalDocs}</b> : null}
                </a>
              </li>
              <li><a href="/admin/collections/crm-optouts"><i className="tone-rose">⊘</i>Ne plus contacter</a></li>
              <li><a href="/admin/globals/crm-settings"><i className="tone-sky">⚙</i>Réglages</a></li>
            </ul>
            <CrmMergeButton safe={safeDuplicates} />
          </section>

          <section className="ccard">
            <h2 className="ccard__title">
              À faire {late > 0 && <b className="cbadge tone-rose">{late} en retard</b>}
            </h2>
            {todo.length ? (
              <ul className="ctasks">
                {todo.map((t) => (
                  <li key={t.key}>
                    <span className={`cdot ${t.day < today ? 'tone-rose' : t.day === today ? 'tone-peach' : 'tone-lav'}`} />
                    <a href={`${LIST}/${t.prospectId}`}>
                      <b>{t.name}</b>
                      <small>
                        {t.kind ? kindLabel(t.kind) : 'Relance'} · {dayLabel(t.day)}
                      </small>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cempty">Rien à relancer cette semaine.</p>
            )}
          </section>
        </aside>

        {/* ---------- Centre ---------- */}
        <div className="cdash__main">
          <section className="ccard">
            <div className="ccard__row">
              <h2 className="ccard__title">Parcours des prospects</h2>
              <span className="cmuted">{all.length} au total</span>
            </div>
            <div className="cpipe">
              {stages.map((s) => (
                <a key={s.label} className="cpipe__stage" href={filterHref('status', 'in', s.statuses.join(','))}>
                  <span className="cpipe__label">{s.label}</span>
                  <span className="cpipe__n">{s.n}</span>
                  <span className={`cpipe__bar tone-${s.tone}`} style={{ opacity: s.n ? 1 : 0.45 }} />
                </a>
              ))}
            </div>
            {totalInStages > 0 && (
              <div className="cstack" aria-hidden>
                {stages
                  .filter((s) => s.n)
                  .map((s) => (
                    <span key={s.label} className={`tone-${s.tone}`} style={{ flexGrow: s.n }} />
                  ))}
              </div>
            )}
            <div className="ckpis">
              <div>
                <span className="cmuted">Nouveaux cette semaine</span>
                <b>
                  {thisWeek} <small>/ {target}</small>
                </b>
                <span className="cprogress">
                  <span style={{ width: `${pct}%` }} />
                </span>
              </div>
              <div>
                <span className="cmuted">E-mails envoyés</span>
                <b>{emailsSent.totalDocs}</b>
              </div>
              <div>
                <span className="cmuted">Taux de réponse</span>
                <b>{percent(answered, contacted)}</b>
              </div>
              <div>
                <span className="cmuted">Conversion</span>
                <b>{percent(clients, contacted)}</b>
              </div>
            </div>
          </section>

          <section className="ccard">
            <div className="ccard__row">
              <h2 className="ccard__title">Derniers prospects</h2>
              <a className="clink" href="/admin/prospection/base">
                Tout voir →
              </a>
            </div>
            {recent.docs.length ? (
              <table className="ctable">
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th className="hide-sm">Type</th>
                    <th>Statut</th>
                    <th className="hide-sm">Site</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.docs.map((p: CrmProspect) => (
                    <tr key={p.id}>
                      <td>
                        <a className="cwho" href={`/admin/prospection/base?fiche=${p.id}`}>
                          <span className={`cavatar tone-${toneOf(p.name)}`}>{initials(p.name) || '?'}</span>
                          <span>
                            <b>{p.name}</b>
                            <small>{p.commune || 'Commune non trouvée'}</small>
                          </span>
                        </a>
                      </td>
                      <td className="hide-sm cmuted">{typeLabel(p.type)}</td>
                      <td>
                        <span className={`cpill tone-${STATUS_TONE[p.status ?? ''] ?? 'lav'}`}>{statusLabel(p.status)}</span>
                      </td>
                      <td className="hide-sm">
                        {p.websiteStatus === 'sans-site' ? (
                          <span className="cpill tone-butter">Sans site</span>
                        ) : p.websiteStatus === 'site-existant' ? (
                          <span className="cpill tone-sky">Site</span>
                        ) : (
                          <span className="cmuted">?</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="cempty">
                Aucun prospect pour l’instant. <a href={`${LIST}/create`}>Ajouter le premier</a> ou <a href="/admin/prospection/import">importer un fichier</a>.
              </p>
            )}
          </section>

          {byDepartment.length > 0 && (
            <section className="ccard">
              <h2 className="ccard__title">Par département</h2>
              <ul className="cbars">
                {byDepartment.map((d, i) => (
                  <li key={String(d.id)}>
                    <a href={d.id === null ? `${LIST}?where[department][exists]=false` : filterHref('department', 'equals', String(d.id))}>
                      <span className="cbars__label">{d.label}</span>
                      <span className="cbars__track">
                        <span className={`tone-${TONES[i % TONES.length]}`} style={{ width: `${Math.max(6, (d.n / maxDep) * 100)}%` }} />
                      </span>
                      <b>{d.n}</b>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ---------- Colonne droite ---------- */}
        <aside className="cdash__right">
          <section className="ccard">
            <div className="ccard__row">
              <h2 className="ccard__title">{monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1)}</h2>
              <a className="clink" href="/admin/prospection/relances">
                Ouvrir →
              </a>
            </div>
            <div className="cmini">
              {DAYS.map((d, i) => (
                <span key={`${d}${i}`} className="cmini__dow">
                  {d}
                </span>
              ))}
              {cells.map((d) => {
                const k = ymd(d)
                const n = perDay.get(k) ?? 0
                const cls = ['cmini__day', d.getMonth() !== m - 1 && 'out', k === today && 'today', n > 0 && (k < today ? 'has tone-rose' : 'has tone-lav')].filter(Boolean).join(' ')
                return n > 0 ? (
                  <a key={k} className={cls} href="/admin/prospection/relances" title={`${n} relance${n > 1 ? 's' : ''}`}>
                    {d.getDate()}
                  </a>
                ) : (
                  <span key={k} className={cls}>
                    {d.getDate()}
                  </span>
                )
              })}
            </div>
            <p className="cmuted cmini__legend">
              <span className="cdot tone-lav" /> relance prévue <span className="cdot tone-rose" /> en retard
            </p>
          </section>

          <section className="ccard">
            <h2 className="ccard__title">Activité récente</h2>
            {activity.docs.length ? (
              <ul className="cfeed">
                {activity.docs.map((a) => {
                  const p = typeof a.prospect === 'object' ? (a.prospect as CrmProspect) : null
                  return (
                    <li key={a.id}>
                      <span className={`cfeed__icon tone-${KIND_TONE[a.kind] ?? 'lav'}`}>{KIND_ICON[a.kind] ?? '•'}</span>
                      <a href={p ? `${LIST}/${p.id}` : '/admin/collections/crm-activities'}>
                        <b>
                          {kindLabel(a.kind)}
                          {p ? ` · ${p.name}` : ''}
                        </b>
                        <small>{a.summary}</small>
                        <small className="cmuted">{ago(a.updatedAt, now)}</small>
                      </a>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="cempty">Aucun échange enregistré.</p>
            )}
          </section>
        </aside>
      </div>
    </div>,
  )
}

export default CrmHome
