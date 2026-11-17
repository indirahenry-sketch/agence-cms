import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { loadFollowUps, monthCells, parisDay, ymd } from '@/crm/followUps'

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
  const items = await loadFollowUps(payload, req, cells)
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
            const out = d.getMonth() !== m - 1
            return (
              <div key={k} className={`ecal__day${out ? ' out' : ''}${k === today ? ' today' : ''}`}>
                <span className="ecal__num">{d.getDate()}</span>
                {list.slice(0, 3).map((i) => (
                  <a key={i.key} className={`ecal__ev crm__ev${k < today ? ' crm__ev--late' : ''}`} href={`${LIST}/${i.prospectId}`} title={i.detail ? `${i.name} · ${i.detail}` : i.name}>
                    {i.name}
                  </a>
                ))}
                {list.length > 3 && <span className="ecal__more">+{list.length - 3}</span>}
              </div>
            )
          })}
        </div>
      </div>

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
          Pour prévoir une relance : sur la fiche du prospect, onglet « Suivi », ajoutez un échange avec une date « Relancer le ». Cochez « Relance faite »
          une fois l’appel ou l’e-mail fait.
        </p>
      </section>
    </div>,
  )
}

export default CrmCalendar
