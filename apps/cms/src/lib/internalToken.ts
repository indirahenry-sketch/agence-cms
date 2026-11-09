import crypto from 'crypto'

/** Jeton des appels internes du serveur à lui-même (dérivé de PAYLOAD_SECRET, jamais envoyé au navigateur). */
export const internalToken = () => crypto.createHash('sha256').update(`domaines:${process.env.PAYLOAD_SECRET ?? ''}`).digest('hex')
