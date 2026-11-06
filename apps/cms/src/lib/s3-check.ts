import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import type { Payload } from 'payload'

/** Résume une erreur S3 sur une seule ligne lisible dans les logs (nom, code HTTP, message). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  const code = (err as { Code?: string; code?: string }).Code ?? (err as { code?: string }).code
  return [err.name, code && code !== err.name ? code : null, status ? `HTTP ${status}` : null, err.message]
    .filter(Boolean)
    .join(' · ')
}

/** Pistes de correction selon l'erreur renvoyée par le stockage. */
function hint(text: string): string {
  if (/NoSuchBucket|NotFound|HTTP 404/i.test(text)) return 'le bucket S3_BUCKET n\'existe pas (vérifie le nom exact dans Supabase → Storage)'
  if (/InvalidAccessKeyId|HTTP 403|Forbidden|AccessDenied/i.test(text)) return 'clés refusées : utilise les clés « S3 access keys » de Supabase, en paire'
  if (/SignatureDoesNotMatch/i.test(text)) return 'S3_SECRET_ACCESS_KEY ne correspond pas à S3_ACCESS_KEY_ID, ou S3_REGION est fausse'
  if (/region|AuthorizationHeaderMalformed/i.test(text)) return 'S3_REGION doit être la région du projet Supabase (ex. eu-west-3)'
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(text)) return 'S3_ENDPOINT est mal écrit (https://<id>.storage.supabase.co/storage/v1/s3)'
  if (/ECONNREFUSED|ETIMEDOUT|Invalid URL/i.test(text)) return 'S3_ENDPOINT injoignable ou invalide'
  if (/HTTP 400/.test(text)) return 'requête refusée par Supabase : vérifie l\'identifiant du projet dans S3_ENDPOINT et S3_REGION'
  return 'vérifie les variables S3_ dans Render'
}

/**
 * Au démarrage : teste la connexion au stockage photo et écrit le résultat dans les logs,
 * avec la configuration (sans les secrets) et une piste de correction en cas d'échec.
 */
export async function checkS3(payload: Payload): Promise<boolean> {
  const bucket = process.env.S3_BUCKET
  if (!bucket) {
    payload.logger.warn('Stockage photo : S3_BUCKET vide, les fichiers vont sur le disque du serveur')
    return false
  }
  const endpoint = process.env.S3_ENDPOINT || ''
  const region = process.env.S3_REGION || 'auto'
  const keyId = process.env.S3_ACCESS_KEY_ID || ''
  const secret = process.env.S3_SECRET_ACCESS_KEY || ''
  let host = endpoint
  try {
    host = new URL(endpoint).host + new URL(endpoint).pathname
  } catch {
    /* affiché tel quel */
  }
  const summary = `bucket=${bucket} endpoint=${host || '(vide)'} region=${region} forcePathStyle=${process.env.S3_FORCE_PATH_STYLE === 'true'} clé=${keyId.length} car. secret=${secret.length} car.`
  const warnings: string[] = []
  if (keyId !== keyId.trim() || secret !== secret.trim() || bucket !== bucket.trim()) warnings.push('espace en trop au début ou à la fin d\'une variable')
  if (/^(eyJ|sb_)/.test(keyId) || /^(eyJ|sb_)/.test(secret)) warnings.push('ce sont des clés anon/service_role, pas des clés S3')
  if (region === 'auto' && /supabase/.test(endpoint)) warnings.push('S3_REGION doit être la région du projet Supabase, pas « auto »')
  if (process.env.S3_FORCE_PATH_STYLE !== 'true') warnings.push('S3_FORCE_PATH_STYLE doit valoir true pour Supabase')

  try {
    const client = new S3Client({
      endpoint,
      region,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    })
    await client.send(new HeadBucketCommand({ Bucket: bucket }))
    payload.logger.info(`✔ Stockage photo S3 joignable (${summary})`)
    if (warnings.length) payload.logger.warn(`Stockage photo S3 : attention, ${warnings.join(' ; ')}`)
    return true
  } catch (err) {
    const text = describeError(err)
    payload.logger.error(
      `✘ Stockage photo S3 inaccessible : ${text} → ${hint(text)}${warnings.length ? ` ; ${warnings.join(' ; ')}` : ''} (${summary})`,
    )
    return false
  }
}
