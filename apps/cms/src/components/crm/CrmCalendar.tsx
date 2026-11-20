import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { CRM_TASK_KINDS } from '@/crm/constants'
import { loadFollowUps, loadTasks, monthCells, parisDay, ymd } from '@/crm/followUps'

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
                  <span key={`t${t.id}`} className={`ecal__ev crm__ev crm__ev--task${t.done ? ' done' : ''}`} data-crm-task={t.id} title={`${kindLabel(t.kind)}${t.prospectName ? ` · ${t.prospectName}` : ''}`}>
                    {t.time ? `${t.time} ` : ''}
                    {t.title}
                  </span>
                ))}
                {list.slice(0, room).map((i) => (
                  <a key={i.key} className={`ecal__ev crm__ev${k < today ? ' crm__ev--late' : ''}`} href={`${LIST}/${i.prospectId}`} title={i.detail ? `${i.name} · ${i.detail}` : i.name}>
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
    </div>,
  )
}

export default CrmCalendar
