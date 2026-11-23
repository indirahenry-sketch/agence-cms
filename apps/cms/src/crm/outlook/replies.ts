import type { Payload } from 'payload'

import { loadSettings, messagesSince, type InboxMessage } from './graph'

/**
 * Lecture des réponses : seuls les messages venant d'une adresse de prospect sont retenus
 * (objet + 300 premiers caractères). Le reste de la boîte n'est ni copié ni gardé.
 */

/** Texte propre à la réponse, sans le message cité en dessous. */
export const ownText = (m: Pick<InboxMessage, 'uniqueBody' | 'bodyPreview'>) => {
  const raw = (m.uniqueBody?.content ?? m.bodyPreview ?? '').replace(/\r/g, '')
  const cut = raw.search(/^(?:>|-{2,}\s*Original|_{5,}|De\s?:|From\s?:|Envoyé\s?:|Le .{3,80} a écrit|On .{3,80} wrote)/im)
  return (cut >= 0 ? raw.slice(0, cut) : raw).replace(/\s+/g, ' ').trim()
}

/** Réponse courte qui demande d'arrêter (« STOP », « désinscription », « ne plus me contacter »…). */
export const isStopReply = (text: string) => {
  const t = text.trim()
  if (!t || t.length > 300) return false
  return /^\W*stop\b/i.test(t) || /\b(d[ée]sinscri\w*|unsubscribe|ne (plus )?(me |nous )?(contacter|[ée]crire|solliciter)|plus de (mail|message|sollicitation)s?|retirez[- ](moi|nous))\b/i.test(t)
}

export type ReplyResult = { checked: number; replies: number; stops: number; error?: string }

export const checkReplies = async (payload: Payload, now = new Date()): Promise<ReplyResult> => {
  const settings = await loadSettings(payload)
  const since = settings.outlookLastCheck || settings.outlookConnectedAt || new Date(now.getTime() - 864e5).toISOString()
  const messages = await messagesSince(payload, new Date(since).toISOString().replace(/\.\d{3}Z$/, 'Z'))
  const result: ReplyResult = { checked: messages.length, replies: 0, stops: 0 }
  if (!messages.length) {
    await payload.updateGlobal({ slug: 'crm-settings', data: { outlookLastCheck: now.toISOString(), outlookError: null }, overrideAccess: true, depth: 0 })
    return result
  }

  // Adresses connues → fiche (adresse principale et adresses supplémentaires)
  const prospects = await payload.find({
    collection: 'crm-prospects',
    where: { or: [{ email: { exists: true } }, { 'otherEmails.address': { exists: true } }] },
    select: { name: true, email: true, otherEmails: true, status: true },
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const byAddress = new Map<string, (typeof prospects.docs)[number]>()
  for (const p of prospects.docs) {
    for (const a of [p.email, ...(p.otherEmails ?? []).map((e) => e.address)]) if (a) byAddress.set(a.trim().toLowerCase(), p)
  }

  let watermark = since
  for (const m of messages) {
    if (m.receivedDateTime > watermark) watermark = m.receivedDateTime
    const from = m.from?.emailAddress?.address?.trim().toLowerCase()
    const p = from ? byAddress.get(from) : undefined
    if (!p) continue
    const text = ownText(m)
    const stop = isStopReply(text)
    result.replies++
    if (stop) result.stops++
    await payload.create({
      collection: 'crm-activities',
      data: {
        prospect: p.id,
        kind: 'reponse',
        summary: `${stop ? 'A demandé à ne plus être contacté' : 'Réponse reçue'} : « ${m.subject || 'sans objet'} » — ${text.slice(0, 300) || '(texte vide)'}`,
        date: m.receivedDateTime,
      },
      overrideAccess: true,
      depth: 0,
    })
    // Une réponse arrête les relances (automatiques ou non) jusqu'à ce que tu la traites
    const pending = await payload.find({ collection: 'crm-activities', where: { and: [{ prospect: { equals: p.id } }, { done: { not_equals: true } }, { followUpAt: { exists: true } }] }, limit: 50, depth: 0, overrideAccess: true })
    for (const a of pending.docs) await payload.update({ collection: 'crm-activities', id: a.id, data: { done: true }, overrideAccess: true, depth: 0 })
    const keep = ['client', 'ne-plus-contacter', 'ferme']
    if (stop) await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'ne-plus-contacter' }, overrideAccess: true, depth: 0 })
    else if (!keep.includes(p.status ?? '')) await payload.update({ collection: 'crm-prospects', id: p.id, data: { status: 'a-repondu' }, overrideAccess: true, depth: 0 })
  }
  await payload.updateGlobal({ slug: 'crm-settings', data: { outlookLastCheck: watermark, outlookError: null }, overrideAccess: true, depth: 0 })
  return result
}
