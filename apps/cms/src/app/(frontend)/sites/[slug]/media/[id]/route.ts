import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import config from '@payload-config'
import fs from 'fs/promises'
import path from 'path'
import { getPayload } from 'payload'

import { sameID } from '@/access/roles'
import type { Media, Tenant } from '@/payload-types'

/**
 * Photos des sites publics.
 *
 * Le stockage des fichiers reste privé : ce point d'accès ne sert QUE les images qu'un client
 * a rendues publiques (photos « dans la galerie », logo, photos d'événements), et uniquement
 * sur le site de ce client. Toute autre image répond « introuvable ».
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

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params
  if (!/^\d+$/.test(id)) return notFound()
  const payload = await getPayload({ config })

  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = docs[0] as Tenant | undefined
  if (!tenant || tenant.status === 'suspended') return notFound()

  const media = (await payload.findByID({ collection: 'media', id, depth: 0, overrideAccess: true, disableErrors: true })) as Media | null
  if (!media || !sameID(media.tenant, tenant.id)) return notFound()

  let isPublic = Boolean(media.inGallery) || sameID(tenant.logo, media.id)
  if (!isPublic) {
    const used = await payload.count({ collection: 'events', where: { and: [{ tenant: { equals: tenant.id } }, { image: { equals: media.id } }] }, overrideAccess: true })
    isPublic = used.totalDocs > 0
  }
  if (!isPublic) return notFound()

  // Version redimensionnée demandée (si elle existe), sinon l'original
  const size = new URL(req.url).searchParams.get('size')
  const variant = size && SIZES.has(size) ? media.sizes?.[size as 'card'] : undefined
  const filename = variant?.filename || media.filename
  const mimeType = variant?.mimeType || media.mimeType || 'application/octet-stream'
  if (!filename) return notFound()

  const headers = { 'content-type': mimeType, 'cache-control': 'public, max-age=86400' }
  try {
    if (process.env.S3_BUCKET) {
      const prefix = (media as Media & { prefix?: string | null }).prefix || ''
      const obj = await getS3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: path.posix.join(prefix, filename) }))
      if (!obj.Body) return notFound()
      return new Response(obj.Body.transformToWebStream(), { headers })
    }
    const dir = process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media')
    const data = await fs.readFile(path.join(dir, path.basename(filename)))
    return new Response(new Uint8Array(data), { headers })
  } catch {
    return notFound()
  }
}
