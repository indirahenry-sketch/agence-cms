import type { Payload, PayloadRequest } from 'payload'

import type { CrmProspect } from '@/payload-types'

/** Jour « AAAA-MM-JJ » à l'heure de Paris. */
export const parisDay = (d: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(d))
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export type FollowUp = { key: string; day: string; prospectId: number; name: string; detail?: string; kind?: string }

/** Les 42 jours (6 semaines, lundi en premier) affichés pour un mois donné. */
export const monthCells = (y: number, m: number) => {
  const first = new Date(y, m - 1, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(y, m - 1, 1 - offset + i))
}

/**
 * Relances prévues entre deux dates : échanges « Relancer le » non faits, et dates posées
 * directement sur une fiche. Jamais les prospects « Ne plus contacter ».
 */
export const loadFollowUps = async (payload: Payload, req: PayloadRequest, cells: Date[]): Promise<FollowUp[]> => {
  const first = cells[0]
  const last = cells[cells.length - 1]
  const from = new Date(Date.UTC(first.getFullYear(), first.getMonth(), first.getDate() - 1)).toISOString()
  const to = new Date(Date.UTC(last.getFullYear(), last.getMonth(), last.getDate() + 2)).toISOString()
  const base = { overrideAccess: true, req, limit: 0, pagination: false } as const

  const [activities, prospects] = await Promise.all([
    payload.find({
      collection: 'crm-activities',
      where: { and: [{ followUpAt: { greater_than_equal: from } }, { followUpAt: { less_than: to } }, { done: { not_equals: true } }] },
      depth: 1,
      sort: 'followUpAt',
      ...base,
    }),
    payload.find({
      collection: 'crm-prospects',
      where: { and: [{ nextFollowUpAt: { greater_than_equal: from } }, { nextFollowUpAt: { less_than: to } }, { doNotContact: { not_equals: true } }] },
      depth: 0,
      sort: 'nextFollowUpAt',
      ...base,
    }),
  ])

  const items: FollowUp[] = []
  for (const a of activities.docs) {
    const p = typeof a.prospect === 'object' ? (a.prospect as CrmProspect) : null
    if (!p || p.doNotContact || !a.followUpAt) continue
    items.push({ key: `a${a.id}`, day: parisDay(a.followUpAt), prospectId: p.id, name: p.name, detail: a.summary, kind: a.kind })
  }
  for (const p of prospects.docs) {
    if (!p.nextFollowUpAt) continue
    const day = parisDay(p.nextFollowUpAt)
    if (!items.some((i) => i.prospectId === p.id && i.day === day)) items.push({ key: `p${p.id}`, day, prospectId: p.id, name: p.name, detail: p.commune ?? undefined })
  }
  return items.sort((a, b) => a.day.localeCompare(b.day))
}

export type DayTask = { id: number; day: string; title: string; kind: string; time?: string | null; done: boolean; prospectId?: number | null; prospectName?: string | null }

/** Tâches du calendrier entre deux dates (faites ou non). */
export const loadTasks = async (payload: Payload, req: PayloadRequest, cells: Date[]): Promise<DayTask[]> => {
  const first = cells[0]
  const last = cells[cells.length - 1]
  const from = new Date(Date.UTC(first.getFullYear(), first.getMonth(), first.getDate() - 1)).toISOString()
  const to = new Date(Date.UTC(last.getFullYear(), last.getMonth(), last.getDate() + 2)).toISOString()
  const { docs } = await payload.find({
    collection: 'crm-tasks',
    where: { and: [{ date: { greater_than_equal: from } }, { date: { less_than: to } }] },
    depth: 1,
    sort: 'date',
    limit: 0,
    pagination: false,
    overrideAccess: true,
    req,
  })
  return docs.map((t) => {
    const p = typeof t.prospect === 'object' && t.prospect ? (t.prospect as CrmProspect) : null
    return { id: t.id, day: parisDay(t.date), title: t.title, kind: t.kind, time: t.time, done: Boolean(t.done), prospectId: p?.id ?? (typeof t.prospect === 'number' ? t.prospect : null), prospectName: p?.name ?? null }
  })
}
