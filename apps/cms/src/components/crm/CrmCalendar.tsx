import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { agendaUrl } from '@/crm/agenda'
import { CRM_TASK_KINDS } from '@/crm/constants'
import { loadFollowUps, loadTasks, monthCells, parisDay, ymd } from '@/crm/followUps'
import { KIND_LEGEND, toneOfKind } from '@/crm/tones'

import { CrmAgendaLink } from './CrmAgendaLink'
import { CrmDayTasks } from './CrmDayTasks'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const LIST = '/admin/collections/crm-prospects'

/**
 * Calendrier des relances : /admin/prospection/relances?mois=AAAA-MM
 * Chaque relance prévue (échange avec « Relancer le » non fait, ou date posée sur la fiche),
 * en rouge si elle est en retard. Les prospects « Ne plus contacter » n'y figurent jamais.
 */
export const CrmCalendar = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req

  const param = String((props.searchParams?.mois as string | undefined) ?? '')
  const today = parisDay(new Date())
  const [y, m] = /^\d{4}-\d{2}$/.test(param) ? param.split('-').map(Number) : today.split('-').map(Number).slice(0, 2)
  const month = new Date(y, m - 1, 1)
  const cells = monthCells(y, m)
  const [items, tasks] = await Promise.all([loadFollowUps(payload, req, cells), loadTasks(payload, req, cells)])
  const tasksByDay = new Map<string, typeof tasks>()
  for (const t of tasks) tasksByDay.set(t.day, [...(tasksByDay.get(t.day) ?? []), t])
  const kindLabel = (v: string) => CRM_TASK_KINDS.find((k) => k.value === v)?.label ?? v
  const byDay = new Map<string, typeof items>()
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i])

  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    return `/admin/prospection/relances?mois=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const title = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(month)
  const inMonth = items.filter((i) => i.day.startsWith(`${y}-${String(m).padStart(2, '0')}`)).sort((a, b) => a.day.localeCompare(b.day))
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const late = items.filter((i) => i.day < today).length
  const feed = agendaUrl(process.env.PUBLIC_SERVER_URL || payload.config.serverURL || '')

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Relances" current="relances" />
      <CrmDayTasks />
      <div className="ecal crm__cal">
        <div className="ecal__bar">
          <strong className="ecal__title">{title.charAt(0).toUpperCase() + title.slice(1)}</strong>
          <div className="ecal__nav">
            <a href={shift(-1)} aria-label="Mois précédent">‹</a>
            <a href="/admin/prospection/relances">Aujourd’hui</a>
            <a href={shift(1)} aria-label="Mois suivant">›</a>
          </div>
          <div className="ecal__legend">
            <span>{inMonth.length} relance{inMonth.length > 1 ? 's' : ''} ce mois-ci</span>
            {late > 0 && <span className="crm__late">{late} en retard</span>}
          </div>
          <p className="cmini__legend cmuted">
            {KIND_LEGEND.map((l) => (
              <span key={l.kind}>
                <span className={`cdot tone-${toneOfKind(l.kind)}`} /> {l.label}
              </span>
            ))}
            <span>
              <span className="cdot" style={{ background: '#e11d48' }} /> trait rouge = en retard
            </span>
          </p>
        </div>
        <div className="ecal__grid">
          {DAYS.map((d) => (
            <span key={d} className="ecal__dow">
              {d}
            </span>
          ))}
          {cells.map((d) => {
            const k = ymd(d)
            const list = byDay.get(k) ?? []
            const dayTasks = tasksByDay.get(k) ?? []
            const out = d.getMonth() !== m - 1
            const room = Math.max(0, 3 - dayTasks.length)
            return (
              <div key={k} className={`ecal__day${out ? ' out' : ''}${k === today ? ' today' : ''}`} data-crm-day={k} title="Cliquer pour voir ou ajouter une tâche">
                <span className="ecal__num">{d.getDate()}</span>
                {dayTasks.slice(0, 3).map((t) => (
                  <span key={`t${t.id}`} className={`ecal__ev crm__ev crm__ev--task tone-${toneOfKind(t.kind)}${t.done ? ' done' : ''}${!t.done && k < today ? ' is-late' : ''}`} data-crm-task={t.id} title={`${kindLabel(t.kind)}${t.prospectName ? ` · ${t.prospectName}` : ''}`}>
                    {t.time ? `${t.time} ` : ''}
                    {t.title}
                  </span>
                ))}
                {list.slice(0, room).map((i) => (
                  <a key={i.key} className={`ecal__ev crm__ev tone-${toneOfKind('relance')}${k < today ? ' is-late' : ''}`} href={`${LIST}/${i.prospectId}`} title={i.detail ? `${i.name} · ${i.detail}` : i.name}>
                    {i.name}
                  </a>
                ))}
                {list.length + dayTasks.length > 3 && <span className="ecal__more">+{list.length + dayTasks.length - 3}</span>}
              </div>
            )
          })}
        </div>
      </div>

      <section className="crm__card">
        <h2>Tâches du mois</h2>
        {tasks.filter((t) => t.day.startsWith(`${y}-${String(m).padStart(2, '0')}`)).length ? (
          <ul className="crm__list">
            {tasks
              .filter((t) => t.day.startsWith(`${y}-${String(m).padStart(2, '0')}`))
              .map((t) => (
                <li key={`t${t.id}`} data-crm-day={t.day} data-crm-task={t.id}>
                  <a href="#" className={t.done ? 'crm__done' : ''}>
                    <span>
                      {t.done ? '✓ ' : ''}
                      {t.title}
                      <small>
                        {' · '}
                        {kindLabel(t.kind)}
                        {t.prospectName ? ` · ${t.prospectName}` : ''}
                      </small>
                    </span>
                    <b className={!t.done && t.day < today ? 'crm__late' : ''}>
                      {fmt.format(new Date(`${t.day}T12:00:00Z`))}
                      {t.time ? ` ${t.time}` : ''}
                    </b>
                  </a>
                </li>
              ))}
          </ul>
        ) : (
          <p className="crm__empty">Aucune tâche ce mois-ci. Clique sur un jour du calendrier pour en ajouter une.</p>
        )}
      </section>

      <section className="crm__card">
        <h2>Relances du mois</h2>
        {inMonth.length ? (
          <ul className="crm__list">
            {inMonth.map((i) => (
              <li key={i.key}>
                <a href={`${LIST}/${i.prospectId}`}>
                  <span>
                    {i.name}
                    {i.detail ? <small> · {i.detail}</small> : null}
                  </span>
                  <b className={i.day < today ? 'crm__late' : ''}>{fmt.format(new Date(`${i.day}T12:00:00Z`))}</b>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crm__empty">Aucune relance prévue ce mois-ci.</p>
        )}
        <p className="crm__more">
          Pour ajouter une tâche (relance, appel, e-mail, recherche…) : clique sur un jour du calendrier. Les relances notées dans le suivi d’un prospect
          (« Relancer le ») s’affichent aussi ici ; coche « Relance faite » une fois l’appel ou l’e-mail fait.
        </p>
      </section>
      <section className="crm__card">
        <h2>Voir mes relances dans Outlook</h2>
        {feed ? (
          <>
            <p className="cmuted">
              Tes relances et tes tâches non faites apparaissent dans ton agenda, sur ordinateur, iPad et téléphone. Lecture seule : on les modifie ici. Mise à jour par Outlook toutes les quelques heures.
            </p>
            <CrmAgendaLink url={feed} />
            <ol className="crm__steps">
              <li>Ouvre Outlook sur le web (outlook.office.com ou outlook.live.com), puis Calendrier.</li>
              <li>« Ajouter un calendrier » → « S’abonner à partir du web » → colle l’adresse → nomme-le « Prospection ».</li>
              <li>Il apparaît ensuite tout seul dans l’application Outlook de l’iPad et du téléphone.</li>
            </ol>
            <p className="cmuted">Garde cette adresse pour toi : elle donne accès à la liste de tes relances. Pour la changer, ajoute ou modifie la variable CRM_AGENDA_KEY sur Render.</p>
          </>
        ) : (
          <p className="crm__empty">Adresse indisponible : la variable PUBLIC_SERVER_URL n’est pas renseignée sur le serveur.</p>
        )}
      </section>
    </div>,
  )
}

export default CrmCalendar
