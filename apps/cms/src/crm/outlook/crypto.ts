import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Clé tirée de PAYLOAD_SECRET : le jeton Outlook n'est jamais stocké en clair dans la base. */
const key = () => createHash('sha256').update(`crm-outlook:${process.env.PAYLOAD_SECRET ?? ''}`).digest()

export const encrypt = (plain: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export const decrypt = (packed?: string | null): string | null => {
  const [v, iv, tag, data] = String(packed ?? '').split('.')
  if (v !== 'v1' || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** « state » de la connexion Microsoft : signé, lié à l'utilisateur, valable 15 minutes (évite qu'un tiers branche SA boîte). */
const sign = (payload: string) => createHmac('sha256', key()).update(payload).digest('base64url')

export const makeState = (userId: number | string, now = Date.now()) => {
  const payload = `${userId}.${now}.${randomBytes(8).toString('base64url')}`
  return `${payload}.${sign(payload)}`
}

/** Utilisateur qui a lancé la connexion, si le « state » est authentique et a moins de 15 minutes ; sinon null. */
export const readState = (state: string, now = Date.now()): string | null => {
  const i = state.lastIndexOf('.')
  if (i < 0) return null
  const payload = state.slice(0, i)
  const sig = Buffer.from(state.slice(i + 1))
  const expected = Buffer.from(sign(payload))
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  const [uid, at] = payload.split('.')
  return now - Number(at) < 15 * 60 * 1000 && now >= Number(at) ? uid : null
}

export const checkState = (state: string, userId: number | string, now = Date.now()): boolean => readState(state, now) === String(userId)

/** Un « state » ne sert qu'une fois (mémoire du serveur, le temps de sa validité). */
const used = new Map<string, number>()
export const useStateOnce = (state: string, now = Date.now()): boolean => {
  for (const [k, at] of used) if (now - at > 20 * 60 * 1000) used.delete(k)
  if (used.has(state)) return false
  used.set(state, now)
  return true
}
