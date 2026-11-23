import { HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'

/**
 * Réparation des photos des maquettes dont le FICHIER a disparu du stockage (bucket vidé ou changé,
 * clés remplacées…) alors que la fiche existe encore dans la médiathèque : sur le site, l'image est cassée.
 * La fiche est retirée pour que l'import de la maquette renvoie la photo. Ne concerne que les photos
 * fournies par l'import (reconnues à leur texte alternatif), jamais celles envoyées par le client.
 */
let client: S3Client | null = null
const s3 = () =>
  (client ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
  }))

/** Le stockage répond-il ? Sinon on ne conclut jamais qu'un fichier manque (mauvaise clé ≠ fichier absent). */
async function storageReady(): Promise<boolean> {
  if (!process.env.S3_BUCKET) return true
  try {
    await s3().send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }))
    return true
  } catch {
    return false
  }
}

/** `false` seulement si le stockage répond clairement « ce fichier n'existe pas ». */
async function fileExists(m: { filename?: string | null; prefix?: string | null }): Promise<boolean> {
  if (!m.filename) return false
  try {
    if (process.env.S3_BUCKET) {
      await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path.posix.join(m.prefix || '', m.filename) }))
    } else {
      await fs.access(path.join(process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media'), path.basename(m.filename)))
    }
    return true
  } catch (err) {
    const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } }
    return !(e.name === 'NotFound' || e.name === 'NoSuchKey' || e.code === 'ENOENT' || e.$metadata?.httpStatusCode === 404)
  }
}

/** Retire les fiches des photos d'import (`alts`) de ce client dont le fichier n'est plus dans le stockage. Renvoie leur nombre. */
export async function dropSeedMediaWithoutFile(payload: Payload, tenantID: number, alts: string[]): Promise<number> {
  if (!alts.length || !(await storageReady())) return 0
  const { docs } = await payload.find({
    collection: 'media',
    where: { and: [{ tenant: { equals: tenantID } }, { alt: { in: alts } }] },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  })
  let removed = 0
  for (const m of docs) {
    if (await fileExists(m as { filename?: string | null; prefix?: string | null })) continue
    try {
      await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: { skipInvite: true } })
      removed++
    } catch (err) {
      payload.logger.warn({ err }, `Photo « ${m.alt} » : fiche sans fichier impossible à retirer`)
    }
  }
  if (removed) payload.logger.info(`✔ ${removed} photo(s) dont le fichier avait disparu du stockage : réimport en cours`)
  return removed
}
