import type { Payload } from 'payload'

/**
 * Empêche le serveur gratuit de Render de s'endormir (il dort après 15 min sans visite,
 * puis met environ 1 minute à se réveiller : le client croit à une panne).
 *
 * Le serveur appelle sa propre adresse publique toutes les 10 minutes. La requête repasse par
 * l'entrée de Render, qui la compte comme une visite. Un seul service tourne en continu :
 * c'est inclus dans les 750 heures gratuites par mois.
 *
 * Actif automatiquement sur Render (variable RENDER_EXTERNAL_URL fournie par Render).
 * Pour le couper : KEEP_AWAKE=false. Ailleurs : KEEP_AWAKE_URL=https://ton-cms.fr
 */
const INTERVAL_MS = 10 * 60 * 1000

let started = false

export const startKeepAwake = (payload: Payload) => {
  if (started || process.env.KEEP_AWAKE === 'false') return
  const base = process.env.KEEP_AWAKE_URL || process.env.RENDER_EXTERNAL_URL
  if (!base) return
  started = true
  const url = `${base.replace(/\/$/, '')}/health`
  const ping = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      if (!res.ok) payload.logger.warn(`Réveil automatique : ${url} a répondu ${res.status}`)
    } catch (err) {
      payload.logger.warn({ err }, `Réveil automatique : ${url} injoignable`)
    }
  }
  const timer = setInterval(ping, INTERVAL_MS)
  timer.unref?.()
  payload.logger.info(`Réveil automatique actif : ${url} toutes les 10 minutes`)
}
