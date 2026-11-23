import type { Payload } from 'payload'

import { decrypt, encrypt } from './crypto'

/**
 * Microsoft Graph (Outlook) : connexion de la boîte, envoi, lecture des réponses.
 * À régler une fois sur Render : MS_CLIENT_ID et MS_CLIENT_SECRET (application enregistrée sur portal.azure.com,
 * comptes « tout annuaire + comptes Microsoft personnels », adresse de retour = <adresse du CMS>/api/crm-outlook/callback).
 * Sans ces variables, rien ne se connecte et rien n'est envoyé.
 */
export const SCOPES = 'offline_access User.Read Mail.Send Mail.Read'
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'

export const serverBase = (payload: Payload) => (process.env.PUBLIC_SERVER_URL || payload.config.serverURL || '').replace(/\/+$/, '')
export const redirectUri = (payload: Payload) => `${serverBase(payload)}/api/crm-outlook/callback`
export const outlookConfigured = () => Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)

export const authorizeUrl = (payload: Payload, state: string) =>
  `${AUTH}/authorize?${new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID ?? '',
    response_type: 'code',
    redirect_uri: redirectUri(payload),
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account',
  })}`

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; error?: string; error_description?: string }

const tokenRequest = async (payload: Payload, params: Record<string, string>): Promise<TokenResponse> => {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID ?? '', client_secret: process.env.MS_CLIENT_SECRET ?? '', redirect_uri: redirectUri(payload), scope: SCOPES, ...params }),
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !json.access_token) throw new Error(`Connexion Microsoft refusée : ${json.error_description?.split('\n')[0] || json.error || res.status}`)
  return json
}

let cache: { token: string; until: number } | null = null
export const resetTokenCache = () => {
  cache = null
}

const saveSettings = (payload: Payload, data: Record<string, unknown>) =>
  payload.updateGlobal({ slug: 'crm-settings', data, overrideAccess: true, depth: 0, context: { skipAudit: true } })

/** Échange le code reçu au retour de Microsoft, puis mémorise la boîte et le jeton chiffré. */
export const connectWithCode = async (payload: Payload, code: string) => {
  const t = await tokenRequest(payload, { grant_type: 'authorization_code', code })
  cache = { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 }
  const me = (await graph(payload, '/me')) as { mail?: string | null; userPrincipalName?: string }
  const email = me.mail || me.userPrincipalName || ''
  await saveSettings(payload, {
    outlookToken: t.refresh_token ? encrypt(t.refresh_token) : null,
    outlookEmail: email,
    outlookConnectedAt: new Date().toISOString(),
    outlookLastCheck: new Date().toISOString(),
    outlookError: null,
  })
  return email
}

export const disconnect = async (payload: Payload) => {
  cache = null
  await saveSettings(payload, { outlookToken: null, outlookEmail: null, outlookConnectedAt: null, outlookError: null, autoSend: false })
}

export const loadSettings = (payload: Payload) => payload.findGlobal({ slug: 'crm-settings', overrideAccess: true, depth: 0, showHiddenFields: true })

export const isConnected = async (payload: Payload) => outlookConfigured() && Boolean(decrypt((await loadSettings(payload)).outlookToken))

/** Jeton d'accès valide (renouvelé au besoin ; le nouveau jeton de renouvellement est re-chiffré). */
export const accessToken = async (payload: Payload): Promise<string> => {
  if (cache && cache.until > Date.now()) return cache.token
  if (!outlookConfigured()) throw new Error('Outlook n’est pas configuré sur le serveur (MS_CLIENT_ID / MS_CLIENT_SECRET).')
  const refresh = decrypt((await loadSettings(payload)).outlookToken)
  if (!refresh) throw new Error('Aucune boîte Outlook connectée.')
  try {
    const t = await tokenRequest(payload, { grant_type: 'refresh_token', refresh_token: refresh })
    cache = { token: t.access_token, until: Date.now() + (t.expires_in - 120) * 1000 }
    if (t.refresh_token && t.refresh_token !== refresh) await saveSettings(payload, { outlookToken: encrypt(t.refresh_token) })
    return t.access_token
  } catch (e) {
    await saveSettings(payload, { outlookError: `${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} : ${(e as Error).message}`.slice(0, 300) })
    throw e
  }
}

export const graph = async (payload: Payload, path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
  const token = await accessToken(payload)
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } })
  if (res.status === 401) cache = null
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
    throw new Error(`Outlook a refusé (${res.status}) : ${err.error?.message ?? res.statusText}`)
  }
  return res.status === 202 || res.status === 204 ? null : res.json()
}

/** Envoie un e-mail texte depuis la boîte connectée (copie gardée dans « Éléments envoyés »). */
export const sendMail = (payload: Payload, { to, subject, body }: { to: string[]; subject: string; body: string }) =>
  graph(payload, '/me/sendMail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { subject, body: { contentType: 'Text', content: body }, toRecipients: to.map((address) => ({ emailAddress: { address } })) },
      saveToSentItems: true,
    }),
  })

export type InboxMessage = { id: string; subject?: string; receivedDateTime: string; from?: { emailAddress?: { address?: string; name?: string } }; bodyPreview?: string; uniqueBody?: { content?: string } }

/** Messages reçus après une date (toutes les boîtes, courrier indésirable compris), du plus ancien au plus récent. */
export const messagesSince = async (payload: Payload, sinceIso: string): Promise<InboxMessage[]> => {
  const out: InboxMessage[] = []
  let url: string | null =
    `/me/messages?${new URLSearchParams({
      $filter: `receivedDateTime gt ${sinceIso}`,
      $orderby: 'receivedDateTime asc',
      $select: 'id,subject,receivedDateTime,from,bodyPreview,uniqueBody',
      $top: '50',
    })}`
  for (let page = 0; url && page < 10; page++) {
    const res = (await graph(payload, url, { headers: { Prefer: 'outlook.body-content-type="text"' } })) as { value: InboxMessage[]; '@odata.nextLink'?: string }
    out.push(...res.value)
    url = res['@odata.nextLink'] ?? null
  }
  return out
}
