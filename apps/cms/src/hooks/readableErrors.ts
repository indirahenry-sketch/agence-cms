import type { AfterErrorHook } from 'payload'

import { isSuperAdmin } from '@/access/roles'
import { describeError, hint } from '@/lib/s3-check'

const S3_ERROR = /S3|NoSuchBucket|InvalidAccessKeyId|SignatureDoesNotMatch|AccessDenied|AuthorizationHeaderMalformed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|PermanentRedirect|XAmz/i

/**
 * Remplace le « Something went wrong » de Payload par une explication en français
 * quand l'erreur est connue (stockage photo, image illisible, fichier trop lourd).
 * L'agence voit aussi le détail technique, pour corriger sans ouvrir les logs.
 */
export const readableErrors: AfterErrorHook = ({ error, req }) => {
  const status = (error as { status?: number }).status ?? 500
  if (status < 500) return
  const text = describeError(error)
  const agency = isSuperAdmin(req.user)
  let message: string | null = null
  if (S3_ERROR.test(text) || S3_ERROR.test(String((error as { name?: string }).name))) {
    message = agency
      ? `Envoi impossible : le stockage des photos (Supabase) refuse l’enregistrement. Piste : ${hint(text)}. Détail : ${text.slice(0, 220)}`
      : 'Envoi impossible pour le moment : le stockage des photos ne répond pas. Réessayez un peu plus tard, ou prévenez l’agence avec « Contacter l’agence ».'
  } else if (/sharp|Input buffer|unsupported image|heif|Input file/i.test(text)) {
    message = 'Cette image n’a pas pu être lue. Essayez en JPEG ou PNG (sur iPhone : Réglages → Appareil photo → Formats → « Le plus compatible »).'
  } else if (/ENOMEM|heap|memory/i.test(text)) {
    message = 'Image trop lourde pour être traitée par le serveur. Essayez une photo plus petite (moins de 10 Mo).'
  } else if (agency) {
    message = `Erreur du serveur : ${text.slice(0, 220)}`
  }
  if (!message) return
  return { response: { errors: [{ message }], message }, status }
}
