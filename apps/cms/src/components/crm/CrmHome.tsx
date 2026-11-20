import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { extractID } from '@/access/roles'
import { CRM_ACTIVITY_KINDS, CRM_STATUSES, CRM_TASK_KINDS, CRM_TYPES } from '@/crm/constants'
import { loadFollowUps, loadTasks, monthCells, parisDay, ymd } from '@/crm/followUps'
import { countSafeDuplicates } from '@/crm/merge'
import { KIND_ICON, KIND_LEGEND, KIND_TONE, toneOfKind } from '@/crm/tones'
import type { CrmProspect } from '@/payload-types'

import { CrmDayTasks } from './CrmDayTasks'
import { CrmMergeButton } from './CrmMergeButton'
import { CrmSearchBar } from './CrmSearchBar'
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

const kindLabel = (v?: string | null) => CRM_ACTIVITY_KINDS.find((k) => k.value === v)?.label ?? ''
const taskKindLabel = (v?: string | null) => CRM_TASK_KINDS.find((k) => k.value === v)?.label ?? 'Tâche'
/** Évolution par rapport à la semaine dernière. */
const Delta = ({ now, before }: { now: number; before: number }) =>
  now === before ? <small className="cdelta">= sem. dernière</small> : <small className={`cdelta ${now > before ? 'up' : 'down'}`}>{now > before ? '▲' : '▼'} {Math.abs(now - before)} vs sem. dernière</small>

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

  const weekStart = startOfWeekParis(now)
  const weeksAgo = (n: number) => new Date(weekStart.getTime() - n * 7 * 864e5)
  const [safeDuplicates, tasks, recentActs, recentTasks] = await Promise.all([
    countSafeDuplicates(payload, req),
    loadTasks(payload, req, cells),
    payload.find({
      collection: 'crm-activities',
      where: { date: { greater_than_equal: weeksAgo(7).toISOString() } },
      select: { kind: true, date: true },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
    payload.find({
      collection: 'crm-tasks',
      where: { date: { greater_than_equal: weeksAgo(1).toISOString() } },
      select: { date: true, done: true },
      limit: 0,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      req,
    }),
  ])
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

  // À faire : relances (suivi des prospects) + tâches du calendrier non faites, en retard et 7 prochains jours
  type Todo = { key: string; day: string; kind: string; title: string; detail: string; href?: string }
  const allTodo: Todo[] = [
    ...followUps.map((f) => ({ key: f.key, day: f.day, kind: 'relance', title: f.name, detail: f.kind && f.kind !== 'relance' ? `Relance · ${kindLabel(f.kind)}` : 'Relance', href: `${LIST}/${f.prospectId}` })),
    ...tasks.filter((t) => !t.done).map((t) => ({ key: `t${t.id}`, day: t.day, kind: t.kind, title: t.title, detail: [taskKindLabel(t.kind), t.time, t.prospectName].filter(Boolean).join(' · ') })),
  ].sort((a, b) => a.day.localeCompare(b.day))
  const todo = allTodo.filter((t) => t.day <= parisDay(soon)).slice(0, 8)
  const late = allTodo.filter((t) => t.day < today).length
  // Calendrier : les types prévus chaque jour (une pastille de couleur par type)
  const kindsPerDay = new Map<string, Map<string, number>>()
  for (const t of allTodo) {
    const day = kindsPerDay.get(t.day) ?? new Map<string, number>()
    day.set(t.kind, (day.get(t.kind) ?? 0) + 1)
    kindsPerDay.set(t.day, day)
  }

  // Statistiques : 8 dernières semaines (lundi → dimanche, heure de Paris)
  const weekIndex = (iso: string) => Math.floor((weekStart.getTime() + 7 * 864e5 - new Date(iso).getTime()) / (7 * 864e5)) // 0 = cette semaine
  const perWeek = (kinds: string[]) => {
    const arr = Array.from({ length: 8 }, () => 0)
    for (const a of recentActs.docs) {
      const i = weekIndex(a.date)
      if (i >= 0 && i < 8 && kinds.includes(a.kind)) arr[i]++
    }
    return arr
  }
  const emailsW = perWeek(['email-envoye'])
  const callsW = perWeek(['appel'])
  const repliesW = perWeek(['reponse'])
  const meetingsW = perWeek(['rdv'])
  const tasksThisWeek = recentTasks.docs.filter((t) => weekIndex(t.date) === 0)
  const tasksDone = tasksThisWeek.filter((t) => t.done).length
  const chartMax = Math.max(1, ...emailsW, ...repliesW)
  const weekLabel = (i: number) => (i === 0 ? 'Cette sem.' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(weeksAgo(i)))
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
      <CrmSearchBar />
      <CrmDayTasks />

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
          <section className="ccard ccard--cal">
            <div className="ccard__row">
              <h2 className="ccard__title">{monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1)}</h2>
              <a className="clink" href="/admin/prospection/relances" aria-label="Ouvrir les relances">
                →
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
                const kinds = [...(kindsPerDay.get(k)?.entries() ?? [])]
                const total = kinds.reduce((a, [, n]) => a + n, 0)
                const cls = ['cmini__day', d.getMonth() !== m - 1 && 'out', k === today && 'today', total > 0 && 'has', total > 0 && k < today && 'late'].filter(Boolean).join(' ')
                const title = kinds.map(([kind, n]) => `${n} ${taskKindLabel(kind).toLowerCase()}`).join(', ')
                return (
                  <button key={k} type="button" className={cls} data-crm-day={k} title={title ? `${title}${k < today ? ' (en retard)' : ''} · cliquer pour voir ou ajouter` : 'Ajouter une tâche'}>
                    {d.getDate()}
                    {total > 0 && (
                      <span className="cmini__dots" aria-hidden>
                        {kinds.slice(0, 3).map(([kind]) => (
                          <i key={kind} className={`tone-${toneOfKind(kind)}`} />
                        ))}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="cmuted cmini__legend">
              {KIND_LEGEND.map((l) => (
                <span key={l.kind}>
                  <span className={`cdot tone-${toneOfKind(l.kind)}`} /> {l.label}
                </span>
              ))}
              <span className="cmini__late">12</span> en retard
            </p>
          </section>

          <section className="ccard ccard--todo">
            <h2 className="ccard__title">
              À faire {late > 0 && <b className="cbadge tone-rose">{late} en retard</b>}
            </h2>
            {todo.length ? (
              <ul className="ctasks">
                {todo.map((t) => (
                  <li key={t.key} className={t.day < today ? 'late' : ''}>
                    <span className={`cdot tone-${toneOfKind(t.kind)}`} />
                    {t.href ? (
                      <a href={t.href}>
                        <b>{t.title}</b>
                        <small>
                          {t.detail} · {dayLabel(t.day)}
                        </small>
                      </a>
                    ) : (
                      <button type="button" className="ctasks__open" data-crm-day={t.day}>
                        <b>{t.title}</b>
                        <small>
                          {t.detail} · {dayLabel(t.day)}
                        </small>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cempty">Rien de prévu cette semaine. Clique sur un jour du calendrier pour ajouter une tâche.</p>
            )}
          </section>

          <section className="ccard ccard--feed">
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

          <section className="ccard ccard--stats">
            <h2 className="ccard__title">Statistiques</h2>
            <div className="cstats">
              <div>
                <span className="cmuted">E-mails envoyés</span>
                <b>{emailsW[0]}</b>
                <Delta now={emailsW[0]} before={emailsW[1]} />
              </div>
              <div>
                <span className="cmuted">Appels</span>
                <b>{callsW[0]}</b>
                <Delta now={callsW[0]} before={callsW[1]} />
              </div>
              <div>
                <span className="cmuted">Réponses reçues</span>
                <b>{repliesW[0]}</b>
                <Delta now={repliesW[0]} before={repliesW[1]} />
              </div>
              <div>
                <span className="cmuted">Rendez-vous</span>
                <b>{meetingsW[0]}</b>
                <Delta now={meetingsW[0]} before={meetingsW[1]} />
              </div>
              <div>
                <span className="cmuted">Tâches faites</span>
                <b>
                  {tasksDone} <small>/ {tasksThisWeek.length}</small>
                </b>
                <small className="cdelta">cette semaine</small>
              </div>
              <div>
                <span className="cmuted">Deals finalisés</span>
                <b>{clients}</b>
                <small className="cdelta">clients signés</small>
              </div>
              <div>
                <span className="cmuted">Taux de réponse</span>
                <b>{percent(answered, contacted)}</b>
                <small className="cdelta">
                  {answered} / {contacted} contactés
                </small>
              </div>
              <div>
                <span className="cmuted">Conversion</span>
                <b>{percent(clients, contacted)}</b>
                <small className="cdelta">contactés → clients</small>
              </div>
            </div>
            <div className="cchart" role="img" aria-label="E-mails envoyés et réponses reçues, 8 dernières semaines">
              {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
                <div key={i} className="cchart__col" title={`${weekLabel(i)} : ${emailsW[i]} e-mail(s), ${repliesW[i]} réponse(s)`}>
                  <div className="cchart__bars">
                    <span className="tone-sky" style={{ height: `${(emailsW[i] / chartMax) * 100}%` }} />
                    <span className="tone-lav" style={{ height: `${(repliesW[i] / chartMax) * 100}%` }} />
                  </div>
                  <small>{i === 0 ? 'Cette sem.' : `S-${i}`}</small>
                </div>
              ))}
            </div>
            <p className="cmuted cmini__legend">
              <span>
                <span className="cdot tone-sky" /> E-mails envoyés
              </span>
              <span>
                <span className="cdot tone-lav" /> Réponses
              </span>
            </p>
          </section>
        </aside>
      </div>
    </div>,
  )
}

export default CrmHome
