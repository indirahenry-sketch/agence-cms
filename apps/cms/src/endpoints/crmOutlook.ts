import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { canUseCrm } from '@/crm/access'
import { buildQueue, inSendingWindow, logSent, sentToday } from '@/crm/outlook/autoSend'
import { checkState, makeState } from '@/crm/outlook/crypto'
import { authorizeUrl, connectWithCode, disconnect, isConnected, loadSettings, outlookConfigured, redirectUri, sendMail, serverBase } from '@/crm/outlook/graph'
import { checkReplies } from '@/crm/outlook/replies'

/**
 * Outlook (super admin uniquement) :
 * - GET  /api/crm-outlook/connect     → page de connexion Microsoft
 * - GET  /api/crm-outlook/callback    → retour de Microsoft (code + state signé)
 * - POST /api/crm-outlook/disconnect  → oublie la boîte (et coupe l'envoi automatique)
 * - GET  /api/crm-outlook/status      → état, compteurs, prochains envois
 * - POST /api/crm-outlook/check       → lire les réponses maintenant
 * - POST /api/crm-outlook/send        → envoyer un e-mail préparé sur la fiche
 */
const guard = (req: PayloadRequest) => {
  if (!canUseCrm(req.user)) throw new APIError('Réservé à l’agence.', 403, undefined, true)
}
const PAGE = '/admin/prospection/envoi'

export const crmOutlookConnect: Endpoint = {
  path: '/crm-outlook/connect',
  method: 'get',
  handler: async (req) => {
    guard(req)
    if (!outlookConfigured()) return Response.redirect(`${serverBase(req.payload)}${PAGE}?outlook=config`, 302)
    return Response.redirect(authorizeUrl(req.payload, makeState(req.user!.id)), 302)
  },
}

export const crmOutlookCallback: Endpoint = {
  path: '/crm-outlook/callback',
  method: 'get',
  handler: async (req) => {
    const back = (q: string) => Response.redirect(`${serverBase(req.payload)}${PAGE}?outlook=${q}`, 302)
    if (!canUseCrm(req.user)) return back('session')
    const code = String(req.searchParams?.get('code') ?? '')
    const state = String(req.searchParams?.get('state') ?? '')
    if (!code || !checkState(state, req.user!.id)) return back(req.searchParams?.get('error') === 'access_denied' ? 'annule' : 'refuse')
    try {
      await connectWithCode(req.payload, code)
      return back('ok')
    } catch (e) {
      req.payload.logger.error({ err: e }, 'Prospection : connexion Outlook impossible')
      return back('erreur')
    }
  },
}

export const crmOutlookDisconnect: Endpoint = {
  path: '/crm-outlook/disconnect',
  method: 'post',
  handler: async (req) => {
    guard(req)
    await disconnect(req.payload)
    return Response.json({ ok: true })
  },
}

export const crmOutlookStatus: Endpoint = {
  path: '/crm-outlook/status',
  method: 'get',
  handler: async (req) => {
    guard(req)
    const s = await loadSettings(req.payload)
    const connected = await isConnected(req.payload)
    // Version légère (composeur d'e-mail) : seulement « connectée ou non »
    if (req.searchParams?.get('light') === '1') return Response.json({ connected, email: connected ? s.outlookEmail : null }, { headers: { 'cache-control': 'no-store' } })
    const queue = connected || s.autoSend ? await buildQueue(req.payload, s) : []
    const ready = queue.filter((i) => !('skip' in i.plan))
    const skipped = queue.filter((i) => 'skip' in i.plan && i.plan.skip !== 'Hors envoi automatique' && i.plan.skip !== 'Relance pas encore due' && i.plan.skip !== 'Relances automatiques déjà faites')
    return Response.json(
      {
        configured: outlookConfigured(),
        redirectUri: redirectUri(req.payload),
        connected,
        email: connected ? s.outlookEmail : null,
        connectedAt: s.outlookConnectedAt,
        lastCheck: s.outlookLastCheck,
        error: s.outlookError,
        settings: { autoSend: Boolean(s.autoSend), autoSendScope: s.autoSendScope, autoSendDailyCap: s.autoSendDailyCap, autoSendGapMinutes: s.autoSendGapMinutes, autoSendRelances: s.autoSendRelances, replyCheck: s.replyCheck !== false, followUpDays: s.followUpDays },
        sentToday: await sentToday(req.payload),
        inWindow: inSendingWindow(),
        next: ready.slice(0, 10).map((i) => ({ id: i.prospect.id, name: i.prospect.name, kind: 'skip' in i.plan ? '' : i.plan.kind, subject: 'skip' in i.plan ? '' : i.plan.subject })),
        readyCount: ready.length,
        skipped: skipped.slice(0, 20).map((i) => ({ id: i.prospect.id, name: i.prospect.name, reason: 'skip' in i.plan ? i.plan.skip : '' })),
        skippedCount: skipped.length,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  },
}

export const crmOutlookCheck: Endpoint = {
  path: '/crm-outlook/check',
  method: 'post',
  handler: async (req) => {
    guard(req)
    if (!(await isConnected(req.payload))) throw new APIError('Aucune boîte Outlook connectée.', 400, undefined, true)
    try {
      return Response.json(await checkReplies(req.payload))
    } catch (e) {
      throw new APIError((e as Error).message, 502, undefined, true)
    }
  },
}

const isEmail = (a: string) => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(a)

export const crmOutlookSend: Endpoint = {
  path: '/crm-outlook/send',
  method: 'post',
  handler: async (req) => {
    guard(req)
    const body = ((typeof req.json === 'function' ? await req.json().catch(() => ({})) : {}) ?? {}) as { prospect?: unknown; to?: unknown; subject?: unknown; body?: unknown; followUpDays?: unknown }
    const id = Number(body.prospect)
    const to = Array.isArray(body.to) ? body.to.map((a) => String(a).trim()).filter(Boolean) : []
    const subject = String(body.subject ?? '').trim()
    const text = String(body.body ?? '')
    if (!Number.isInteger(id) || !to.length || !text.trim()) throw new APIError('Destinataire et texte obligatoires.', 400, undefined, true)
    if (to.some((a) => !isEmail(a))) throw new APIError('Adresse e-mail invalide.', 400, undefined, true)
    const p = await req.payload.findByID({ collection: 'crm-prospects', id, depth: 0, overrideAccess: true })
    if (p.doNotContact) throw new APIError('Ce prospect ne veut plus être contacté.', 409, undefined, true)
    const known = [p.email, ...(p.otherEmails ?? []).map((e) => e.address)].filter(Boolean).map((a) => String(a).toLowerCase())
    if (to.some((a) => !known.includes(a.toLowerCase()))) throw new APIError('Seules les adresses de la fiche sont autorisées.', 400, undefined, true)
    try {
      await sendMail(req.payload, { to, subject, body: text })
    } catch (e) {
      throw new APIError((e as Error).message, 502, undefined, true)
    }
    const days = Number(body.followUpDays)
    await logSent(req.payload, p, {
      kind: ['email-envoye', 'en-attente', 'relance'].includes(p.status) ? 'relance' : 'premier',
      subject,
      to,
      auto: false,
      followUpDays: Number.isFinite(days) && days > 0 ? days : null,
    })
    return Response.json({ ok: true })
  },
}

export const crmOutlookEndpoints = [crmOutlookConnect, crmOutlookCallback, crmOutlookDisconnect, crmOutlookStatus, crmOutlookCheck, crmOutlookSend]
