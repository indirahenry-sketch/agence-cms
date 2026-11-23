import type { Payload } from 'payload'

import { autoSendTick } from './autoSend'
import { isConnected, loadSettings, outlookConfigured } from './graph'
import { checkReplies } from './replies'

/**
 * Toutes les 5 minutes (le CMS reste éveillé sur Render) :
 * - lecture des réponses des prospects (au plus toutes les 10 minutes) ;
 * - au plus UN envoi automatique, si activé, dans les limites réglées.
 * Ne fait rien tant qu'Outlook n'est pas configuré et connecté. CRM_OUTLOOK_JOBS=false pour tout couper.
 */
const TICK_MS = 5 * 60 * 1000
let started = false
let running = false

export const outlookTick = async (payload: Payload, now = new Date()) => {
  if (running || !outlookConfigured() || !(await isConnected(payload))) return
  running = true
  try {
    const settings = await loadSettings(payload)
    const last = settings.outlookLastCheck ? new Date(settings.outlookLastCheck).getTime() : 0
    if (settings.replyCheck !== false && now.getTime() - last >= 10 * 60000) {
      try {
        await checkReplies(payload, now)
      } catch (err) {
        payload.logger.error({ err }, 'Prospection : lecture des réponses Outlook impossible')
      }
    }
    await autoSendTick(payload, now)
  } catch (err) {
    payload.logger.error({ err }, 'Prospection : envoi automatique impossible')
  } finally {
    running = false
  }
}

export const startOutlookScheduler = (payload: Payload) => {
  if (started || process.env.CRM_OUTLOOK_JOBS === 'false' || process.env.NODE_ENV === 'test') return
  started = true
  const timer = setInterval(() => void outlookTick(payload), TICK_MS)
  timer.unref?.()
  setTimeout(() => void outlookTick(payload), 90_000).unref?.()
}
