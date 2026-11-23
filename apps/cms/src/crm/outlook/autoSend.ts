import type { Payload, Where } from 'payload'

import type { CrmEmailTemplate, CrmProspect, CrmSetting } from '@/payload-types'

import { fillTemplate, withOptOut } from '../emailTemplate'
import { isConnected, loadSettings, sendMail } from './graph'

/** Marque laissée dans l'historique : sert à compter les envois automatiques (plafond, écart, relances). */
export const AUTO_MARK = '(envoi automatique)'

/** Premier e-mail possible pour ces statuts (« À vérifier » seulement si le prospect est sur « Oui »). */
export const FIRST_STATUSES = ['nouveau', 'qualifie', 'email-a-preparer', 'brouillon-cree']
/** Relance possible pour ces statuts (jamais après une réponse : statut « A répondu »). */
export const FOLLOW_STATUSES = ['email-envoye', 'en-attente', 'relance']

type Prospect = Pick<CrmProspect, 'id' | 'name' | 'email' | 'status' | 'need' | 'websiteStatus' | 'autoSend' | 'doNotContact' | 'lastContactAt' | 'commune' | 'website' | 'type'>
type Template = Pick<CrmEmailTemplate, 'id' | 'kind' | 'subject' | 'body' | 'name'>
type Settings = Pick<CrmSetting, 'autoSendScope' | 'autoSendRelances' | 'followUpDays'>

export type Plan = { kind: 'premier' | 'relance'; subject: string; body: string; template: string } | { skip: string }

export const needOf = (p: Prospect): 'creation' | 'refonte' | null =>
  p.need === 'creation' || p.need === 'refonte' ? p.need : p.websiteStatus === 'site-existant' ? 'refonte' : p.websiteStatus === 'sans-site' ? 'creation' : null

/** Le prospect fait-il partie de l'envoi automatique ? (réglage général + choix sur la fiche) */
export const optedIn = (p: Prospect, scope: Settings['autoSendScope']) => {
  if (p.autoSend === 'non' || p.doNotContact) return false
  if (p.autoSend === 'oui') return true
  return scope === 'tous' && p.status !== 'a-verifier'
}

/** Ce qui partirait pour ce prospect maintenant, ou la raison pour laquelle rien ne part. */
export const planFor = (p: Prospect, templates: Template[], settings: Settings, autoRelancesSent: number, now = new Date()): Plan => {
  if (!optedIn(p, settings.autoSendScope)) return { skip: 'Hors envoi automatique' }
  if (!p.email?.trim()) return { skip: 'Pas d’adresse e-mail' }
  let kind: 'premier' | 'relance'
  let template: Template | undefined
  if (FIRST_STATUSES.includes(p.status) || (p.status === 'a-verifier' && p.autoSend === 'oui')) {
    kind = 'premier'
    const need = needOf(p)
    if (!need) return { skip: 'Besoin inconnu (création ou refonte ?)' }
    template = templates.find((t) => t.kind === need)
    if (!template) return { skip: `Pas de modèle « ${need === 'refonte' ? 'Refonte' : 'Création'} »` }
  } else if (FOLLOW_STATUSES.includes(p.status)) {
    kind = 'relance'
    if (autoRelancesSent >= (settings.autoSendRelances ?? 0)) return { skip: 'Relances automatiques déjà faites' }
    const last = p.lastContactAt ? new Date(p.lastContactAt).getTime() : 0
    if (!last || now.getTime() - last < (settings.followUpDays ?? 7) * 864e5) return { skip: 'Relance pas encore due' }
    template = templates.find((t) => t.kind === 'relance')
    if (!template) return { skip: 'Pas de modèle « Relance »' }
  } else return { skip: 'Statut non concerné' }
  const subject = fillTemplate(template.subject, p).trim()
  const body = withOptOut(fillTemplate(template.body, p))
  const missing = /\[(nom|commune|site|type) \?\]/.exec(`${subject} ${body}`)
  if (missing) return { skip: `Information manquante sur la fiche : ${missing[0]}` }
  if (!subject || !body.trim()) return { skip: 'Modèle vide' }
  return { kind, subject, body, template: template.name }
}

const parisParts = (d: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return { weekday: get('weekday'), hour: Number(get('hour')), day: `${get('year')}-${get('month')}-${get('day')}` }
}

/** Envois seulement en semaine, de 9 h à 18 h (heure de Paris) : plus naturel, et ce sont les heures où les structures lisent leurs e-mails. */
export const inSendingWindow = (now = new Date()) => {
  const { weekday, hour } = parisParts(now)
  return !['Sat', 'Sun'].includes(weekday) && hour >= 9 && hour < 18
}

/** Début de la journée (heure de Paris), en ISO. */
const startOfParisDay = (now: Date) => {
  const { day } = parisParts(now)
  const noon = new Date(`${day}T12:00:00Z`)
  const offset = Math.round((new Date(noon.toLocaleString('en-US', { timeZone: 'Europe/Paris' })).getTime() - new Date(noon.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()) / 36e5)
  return new Date(`${day}T00:00:00${offset >= 0 ? '+' : '-'}${String(Math.abs(offset)).padStart(2, '0')}:00`).toISOString()
}

const autoWhere = (extra: Where[] = []): Where => ({ and: [{ summary: { contains: AUTO_MARK } }, ...extra] })

export const sentToday = async (payload: Payload, now = new Date()) =>
  (await payload.count({ collection: 'crm-activities', where: autoWhere([{ date: { greater_than_equal: startOfParisDay(now) } }]), overrideAccess: true })).totalDocs

export type QueueItem = { prospect: Prospect; plan: Plan }

/** Prospects candidats, relances dues d'abord, puis premiers e-mails (les plus anciens d'abord). */
export const buildQueue = async (payload: Payload, settings: Settings, now = new Date(), limit = 300): Promise<QueueItem[]> => {
  const base = { overrideAccess: true, depth: 0, pagination: false } as const
  const where: Where = {
    and: [
      { doNotContact: { not_equals: true } },
      { email: { exists: true } },
      { autoSend: { not_equals: 'non' } },
      { status: { in: [...FIRST_STATUSES, ...FOLLOW_STATUSES, 'a-verifier'] } },
      ...(settings.autoSendScope === 'tous' ? [] : [{ autoSend: { equals: 'oui' } } as Where]),
    ],
  }
  const [prospects, templates] = await Promise.all([
    payload.find({ collection: 'crm-prospects', where, sort: 'createdAt', limit, ...base }),
    payload.find({ collection: 'crm-email-templates', sort: 'createdAt', limit: 100, ...base }),
  ])
  const ids = prospects.docs.map((p) => p.id)
  const relances = ids.length
    ? await payload.find({ collection: 'crm-activities', where: autoWhere([{ kind: { equals: 'relance' } }, { prospect: { in: ids } }]), limit: 0, select: { prospect: true }, ...base })
    : { docs: [] }
  const relCount = new Map<number, number>()
  for (const a of relances.docs) {
    const id = typeof a.prospect === 'object' ? a.prospect.id : a.prospect
    relCount.set(id, (relCount.get(id) ?? 0) + 1)
  }
  const items = prospects.docs.map((p) => ({ prospect: p as Prospect, plan: planFor(p as Prospect, templates.docs, settings, relCount.get(p.id) ?? 0, now) }))
  const rank = (i: QueueItem) => ('skip' in i.plan ? 2 : i.plan.kind === 'relance' ? 0 : 1)
  return items.sort((a, b) => rank(a) - rank(b))
}

/** Clôt les relances en cours, note l'envoi (relance suivante programmée) et met à jour le statut. */
export const logSent = async (
  payload: Payload,
  p: Pick<CrmProspect, 'id' | 'status'>,
  { kind, subject, to, auto, followUpDays }: { kind: 'premier' | 'relance'; subject: string; to: string[]; auto: boolean; followUpDays: number | null },
) => {
  const base = { overrideAccess: true, depth: 0 } as const
  const pending = await payload.find({
    collection: 'crm-activities',
    where: { and: [{ prospect: { equals: p.id } }, { done: { not_equals: true } }, { followUpAt: { exists: true } }] },
    limit: 50,
    ...base,
  })
  for (const a of pending.docs) await payload.update({ collection: 'crm-activities', id: a.id, data: { done: true }, ...base })
  const now = new Date()
  await payload.create({
    collection: 'crm-activities',
    data: {
      prospect: p.id,
      kind: kind === 'relance' ? 'relance' : 'email-envoye',
      summary: `E-mail envoyé${auto ? ` ${AUTO_MARK}` : ' depuis le CMS'} : « ${subject} » à ${to.join(', ')}`,
      date: now.toISOString(),
      followUpAt: followUpDays ? new Date(now.getTime() + followUpDays * 864e5).toISOString() : null,
    },
    ...base,
  })
  if (!['client', 'non-interesse', 'ne-plus-contacter', 'ferme', 'a-repondu'].includes(p.status ?? '')) {
    await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'en-attente' }, ...base })
  }
}

export type TickResult = { sent: number; reason?: string; prospect?: string }

/** Un passage du planificateur : envoie AU PLUS un e-mail, en respectant toutes les limites. */
export const autoSendTick = async (payload: Payload, now = new Date()): Promise<TickResult> => {
  const settings = await loadSettings(payload)
  if (!settings.autoSend) return { sent: 0, reason: 'Envoi automatique désactivé' }
  if (!(await isConnected(payload))) return { sent: 0, reason: 'Outlook non connecté' }
  if (!inSendingWindow(now)) return { sent: 0, reason: 'Hors horaires (semaine, 9 h – 18 h)' }
  if ((await sentToday(payload, now)) >= settings.autoSendDailyCap) return { sent: 0, reason: 'Plafond du jour atteint' }
  const last = await payload.find({ collection: 'crm-activities', where: autoWhere(), sort: '-date', limit: 1, depth: 0, overrideAccess: true })
  const lastAt = last.docs[0] ? new Date(last.docs[0].date).getTime() : 0
  if (now.getTime() - lastAt < settings.autoSendGapMinutes * 60000) return { sent: 0, reason: 'Écart minimum entre deux envois' }

  const next = (await buildQueue(payload, settings, now)).find((i) => !('skip' in i.plan))
  if (!next || 'skip' in next.plan) return { sent: 0, reason: 'Aucun e-mail à envoyer' }
  const { prospect: p, plan } = next
  const to = [p.email!.trim()]
  try {
    await sendMail(payload, { to, subject: plan.subject, body: plan.body })
  } catch (e) {
    const msg = (e as Error).message
    // Adresse refusée par Outlook : ce prospect sort de l'envoi automatique (sinon on réessaierait sans fin)
    if (/\(400\)/.test(msg)) {
      await payload.update({ collection: 'crm-prospects', id: p.id, data: { autoSend: 'non' }, overrideAccess: true, depth: 0 })
      await payload.create({ collection: 'crm-activities', data: { prospect: p.id, kind: 'note', summary: `Envoi automatique impossible : ${msg}`.slice(0, 500), date: now.toISOString() }, overrideAccess: true, depth: 0 })
    } else {
      await payload.updateGlobal({ slug: 'crm-settings', data: { outlookError: `${now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} : ${msg}`.slice(0, 300) }, overrideAccess: true, depth: 0 })
    }
    return { sent: 0, reason: msg, prospect: p.name }
  }
  await logSent(payload, p, { kind: plan.kind, subject: plan.subject, to, auto: true, followUpDays: settings.followUpDays })
  return { sent: 1, prospect: p.name }
}
