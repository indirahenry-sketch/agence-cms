import { HeadBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import fs from 'fs/promises'
import path from 'path'
import type { Payload } from 'payload'

/**
 * Réparation des photos des maquettes dont le FICHIER a disparu du stockage ou a été remplacé par celui
 * d'une autre image (bucket vidé ou changé, clés remplacées…) alors que la fiche existe encore dans la médiathèque : sur le site, l'image est cassée.
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

type StoredFile = { filename?: string | null; filesize?: number | null }
type SeedMedia = StoredFile & { prefix?: string | null; sizes?: Record<string, StoredFile | null | undefined> | null }

/**
 * `false` seulement si le stockage répond clairement « ce fichier n'existe pas »,
 * ou si le fichier stocké n'a pas la taille enregistrée dans la fiche : c'est alors le fichier
 * d'une AUTRE image (ex. le logo à la place d'une photo), donc la photo affichée est fausse.
 */
async function fileOk(m: StoredFile, prefix?: string | null): Promise<boolean> {
  if (!m.filename) return false
  try {
    let size: number | undefined
    if (process.env.S3_BUCKET) {
      const head = await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path.posix.join(prefix || '', m.filename) }))
      size = head.ContentLength
    } else {
      size = (await fs.stat(path.join(process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media'), path.basename(m.filename)))).size
    }
    return !(m.filesize && size && size !== m.filesize)
  } catch (err) {
    const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } }
    return !(e.name === 'NotFound' || e.name === 'NoSuchKey' || e.code === 'ENOENT' || e.$metadata?.httpStatusCode === 404)
  }
}

/** L'original et chaque version redimensionnée sont-ils présents et bien les bons fichiers ? */
async function filesOk(m: SeedMedia): Promise<boolean> {
  if (!(await fileOk(m, m.prefix))) return false
  for (const variant of Object.values(m.sizes ?? {})) {
    if (variant?.filename && !(await fileOk(variant, m.prefix))) return false
  }
  return true
}

/** Retire les fiches des photos d'import (`alts`) de ce client dont le fichier manque ou n'est pas le bon. Renvoie leur nombre. */
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
    if (await filesOk(m as SeedMedia)) continue
    // Prudence : si une autre fiche (corbeille comprise) pointe vers le même fichier, la suppression
    // effacerait aussi SON fichier (ex. le logo). On laisse alors la fiche et on le signale.
    const shared = await payload.count({
      collection: 'media',
      where: { and: [{ filename: { equals: m.filename } }, { id: { not_equals: m.id } }] },
      trash: true,
      overrideAccess: true,
    })
    if (shared.totalDocs) {
      payload.logger.warn(`Photo « ${m.alt} » : fichier faux mais partagé avec une autre fiche, à remplacer à la main dans la médiathèque`)
      continue
    }
    try {
      await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: { skipInvite: true } })
      removed++
    } catch (err) {
      payload.logger.warn({ err }, `Photo « ${m.alt} » : fiche sans fichier impossible à retirer`)
    }
  }
  if (removed) payload.logger.info(`✔ ${removed} photo(s) dont le fichier avait disparu ou était faux : réimport en cours`)
  return removed
}
