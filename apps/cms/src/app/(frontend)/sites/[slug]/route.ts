import config from '@payload-config'
import { getPayload } from 'payload'

import { htmlResponse, notFoundPage, siteOptions } from '@/sites/http'
import { renderSite } from '@/sites/render'
import { recordVisit } from '@/sites/stats'
import { withEditBar } from '@/sites/editBar'
import { archivedTemplate } from '@/sites/versions'

// Toujours relu à chaque visite : une modification dans le CMS apparaît immédiatement
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })
  // ?version=v1 : ancienne maquette, pour le super-admin seulement (ignoré pour tout le monde sinon)
  const archived = await archivedTemplate(payload, req, slug)
  const html = await renderSite(payload, slug, { ...siteOptions(req), ...(archived ? { template: archived.template } : {}) })
  if (!html) return notFoundPage('Ce site n’existe pas ou n’est pas encore en ligne.')
  if (!archived) recordVisit(payload, req, slug, '/')
  const edit = await withEditBar(payload, req, slug, html, { version: archived?.id })
  return htmlResponse(edit.html, 200, edit.personal || Boolean(archived))
}
