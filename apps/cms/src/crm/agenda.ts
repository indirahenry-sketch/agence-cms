import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Payload, PayloadRequest } from 'payload'

import { CRM_TASK_KINDS } from './constants'
import { loadFollowUps, loadTasks } from './followUps'

/**
 * Abonnement aux relances et tâches de la prospection depuis un agenda (Outlook, Google, Apple).
 * Lecture seule. L'adresse contient une clé secrète tirée de CRM_AGENDA_KEY (ou, à défaut, de PAYLOAD_SECRET) :
 * changer CRM_AGENDA_KEY sur Render rend l'ancienne adresse inutilisable.
 */
const keySecret = () => process.env.CRM_AGENDA_KEY || process.env.PAYLOAD_SECRET || ''

export const agendaKey = (): string | null => {
  const secret = keySecret()
  return secret ? createHmac('sha256', secret).update('crm-agenda-v1').digest('hex').slice(0, 40) : null
}

export const isAgendaKey = (candidate: string): boolean => {
  const key = agendaKey()
  if (!key || candidate.length !== key.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(key))
}

export const agendaUrl = (serverURL: string): string | null => {
  const key = agendaKey()
  const base = serverURL.replace(/\/+$/, '')
  return key && base ? `${base}/api/crm-agenda/${key}.ics` : null
}

export type AgendaEvent = { uid: string; day: string; time?: string | null; title: string; description?: string; url?: string }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Coupe les lignes à 75 octets, comme le demande le format iCalendar. */
const fold = (line: string) => {
  const out: string[] = []
  let cur = ''
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
    }
    cur += ch
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** « 14:30 », « 14h30 », « 9h » → [14, 30] ; sinon null (journée entière). */
export const parseTime = (t?: string | null): [number, number] | null => {
  const m = /^\s*(\d{1,2})\s*[:hH]\s*(\d{2})?\s*$/.exec(t ?? '')
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? 0)
  return h < 24 && min < 60 ? [h, min] : null
}

const compact = (day: string) => day.replace(/-/g, '')
const pad = (n: number) => String(n).padStart(2, '0')
const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

const PARIS_TZ = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Paris',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

export const buildIcs = (events: AgendaEvent[], now = new Date()): string => {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agence CMS//Prospection//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Prospection',
    'X-WR-TIMEZONE:Europe/Paris',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...PARIS_TZ,
  ]
  for (const e of events) {
    const time = parseTime(e.time)
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@prospection`, `DTSTAMP:${stamp}`)
    if (time) {
      const [h, m] = time
      const endMin = h * 60 + m + 30
      const end = endMin < 24 * 60 ? `${compact(e.day)}T${pad(Math.floor(endMin / 60))}${pad(endMin % 60)}00` : `${compact(e.day)}T235900`
      lines.push(`DTSTART;TZID=Europe/Paris:${compact(e.day)}T${pad(h)}${pad(m)}00`, `DTEND;TZID=Europe/Paris:${end}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.day)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.day))}`, 'TRANSP:TRANSPARENT')
    }
    lines.push(`SUMMARY:${esc(e.title)}`)
    const desc = [e.description, e.url].filter(Boolean).join('\n')
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`)
    if (e.url) lines.push(`URL:${e.url}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Relances et tâches non faites, du mois dernier à l'an prochain. Jamais les prospects « Ne plus contacter ». */
export const loadAgendaEvents = async (payload: Payload, req: PayloadRequest, serverURL: string, now = new Date()): Promise<AgendaEvent[]> => {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31)
  const to = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  const [followUps, tasks] = await Promise.all([loadFollowUps(payload, req, [from, to]), loadTasks(payload, req, [from, to])])
  const base = serverURL.replace(/\/+$/, '')
  const fiche = (id: number) => (base ? `${base}/admin/prospection/base?fiche=${id}` : undefined)
  const kindLabel = (v: string) => CRM_TASK_KINDS.find((k) => k.value === v)?.label ?? v
  const events: AgendaEvent[] = []
  for (const t of tasks) {
    if (t.done) continue
    events.push({
      uid: `tache-${t.id}`,
      day: t.day,
      time: t.time,
      title: `${kindLabel(t.kind)} : ${t.title}${t.prospectName ? ` · ${t.prospectName}` : ''}`,
      url: t.prospectId ? fiche(t.prospectId) : base ? `${base}/admin/prospection/relances?mois=${t.day.slice(0, 7)}` : undefined,
    })
  }
  for (const f of followUps) {
    events.push({ uid: `relance-${f.key}`, day: f.day, title: `Relance : ${f.name}`, description: f.detail, url: fiche(f.prospectId) })
  }
  return events.sort((a, b) => a.day.localeCompare(b.day))
}
