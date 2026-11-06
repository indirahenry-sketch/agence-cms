import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import config from '@payload-config'
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'

import { sameID } from '@/access/roles'
import type { Media, Tenant } from '@/payload-types'

/**
 * Fichiers des sites publics (photos, vidéos, documents).
 *
 * Le stockage reste privé : ce point d'accès ne sert QUE les fichiers d'un client marqués
 * « utilisable sur le site public » (ou sa galerie et son logo), et uniquement sur le site
 * de ce client. Les captures jointes au support sont toujours privées.
 * Les vidéos sont servies par morceaux (en-tête Range), indispensable pour Safari sur iPhone.
 */
const SIZES = new Set(['thumbnail', 'card', 'hero'])

let s3: S3Client | null = null
const getS3 = () =>
  (s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID || '', secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '' },
  }))

const notFound = () => new Response('Introuvable', { status: 404 })

/** « bytes=0-1023 » → [0, 1023] dans les limites du fichier, sinon null. */
const parseRange = (header: string | null, size: number): [number, number] | null => {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || !size) return null
  let start = m[1] === '' ? NaN : Number(m[1])
  let end = m[2] === '' ? size - 1 : Number(m[2])
  if (Number.isNaN(start)) {
    start = Math.max(0, size - end)
    end = size - 1
  }
  if (start > end || start >= size) return null
  return [start, Math.min(end, size - 1)]
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  if (!/^\d+$/.test(id)) return notFound()
  const payload = await getPayload({ config })

  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = docs[0] as Tenant | undefined
  if (!tenant || tenant.status === 'suspended') return notFound()

  const media = (await payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true, disableErrors: true })) as Media | null
  if (!media || !sameID(media.tenant, tenant.id)) return notFound()
  const isPublic = media.isPublic !== false || Boolean(media.inGallery) || sameID(tenant.logo, media.id)
  if (!isPublic) return notFound()

  // Version redimensionnée demandée (images), sinon l'original
  const size = new URL(req.url).searchParams.get('size')
  const variant = size && SIZES.has(size) ? media.sizes?.[size as 'card'] : undefined
  const filename = variant?.filename || media.filename
  const mimeType = variant?.mimeType || media.mimeType || 'application/octet-stream'
  const total = (variant?.filesize ?? media.filesize) || 0
  if (!filename) return notFound()

  const isInline = /^(image|video)\//.test(mimeType) || mimeType === 'application/pdf'
  const headers: Record<string, string> = {
    'content-type': mimeType,
    'cache-control': 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
    'accept-ranges': 'bytes',
    'content-disposition': `${isInline ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
  }
  const range = parseRange(req.headers.get('range'), total)

  try {
    if (process.env.S3_BUCKET) {
      const prefix = (media as Media & { prefix?: string | null }).prefix || ''
      const obj = await getS3().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: path.posix.join(prefix, filename),
          ...(range ? { Range: `bytes=${range[0]}-${range[1]}` } : {}),
        }),
      )
      if (!obj.Body) return notFound()
      if (range) {
        headers['content-range'] = `bytes ${range[0]}-${range[1]}/${total}`
        headers['content-length'] = String(range[1] - range[0] + 1)
        return new Response(obj.Body.transformToWebStream(), { status: 206, headers })
      }
      if (obj.ContentLength) headers['content-length'] = String(obj.ContentLength)
      return new Response(obj.Body.transformToWebStream(), { headers })
    }
    const dir = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')
    const data = await fs.readFile(path.join(dir, path.basename(filename)))
    if (range) {
      headers['content-range'] = `bytes ${range[0]}-${range[1]}/${data.length}`
      return new Response(new Uint8Array(data.subarray(range[0], range[1] + 1)), { status: 206, headers })
    }
    return new Response(new Uint8Array(data), { headers })
  } catch {
    return notFound()
  }
}
