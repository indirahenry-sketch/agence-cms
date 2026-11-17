import type { Payload } from 'payload'

import { isSearchRunning, runCrmSearch, startOfWeekParis } from './run'

/**
 * Recherche automatique du LUNDI (à partir de 9 h, heure de Paris).
 * Le CMS est maintenu éveillé sur Render (lib/keepAwake.ts) : il vérifie tous les quarts d'heure
 * si la recherche de la semaine a déjà eu lieu. Aucun ordinateur allumé n'est nécessaire.
 * Désactivable dans « Réglages de prospection », ou par la variable CRM_AUTO_SEARCH=false.
 */
const CHECK_MS = 15 * 60 * 1000
let started = false

export const isMondayAfter9Paris = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(now)
  const weekday = parts.find((p) => p.type === 'weekday')?.value
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  return weekday === 'Mon' && hour >= 9
}

/** Vrai si la recherche planifiée de la semaine doit partir maintenant. */
export const weeklySearchDue = async (payload: Payload, now = new Date()) => {
  if (!isMondayAfter9Paris(now) || isSearchRunning()) return false
  const settings = await payload.findGlobal({ slug: 'crm-settings', overrideAccess: true, depth: 0 })
  if (settings.autoSearch === false) return false
  const done = await payload.count({
    collection: 'crm-searches',
    where: { and: [{ trigger: { equals: 'planifie' } }, { startedAt: { greater_than_equal: startOfWeekParis(now).toISOString() } }] },
    overrideAccess: true,
  })
  return done.totalDocs === 0
}

export const startCrmScheduler = (payload: Payload) => {
  if (started || process.env.CRM_AUTO_SEARCH === 'false') return
  started = true
  const tick = async () => {
    try {
      if (await weeklySearchDue(payload)) await runCrmSearch(payload, { trigger: 'planifie' })
    } catch (err) {
      payload.logger.error({ err }, 'Prospection : recherche du lundi impossible')
    }
  }
  const timer = setInterval(tick, CHECK_MS)
  timer.unref?.()
  setTimeout(tick, 60_000).unref?.() // premier contrôle une minute après le démarrage
  payload.logger.info('Prospection : recherche automatique du lundi active')
}
