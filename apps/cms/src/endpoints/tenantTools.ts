import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { isSuperAdmin } from '@/access/roles'
import { TENANT_COLLECTIONS } from '@/hooks/tenantCleanup'

/**
 * Outils de l'agence sur une fiche client (super admin uniquement) :
 * - GET  /api/tenants/:id/export     → toutes les données du client dans un fichier JSON
 * - POST /api/tenants/:id/duplicate  → nouveau client reprenant la structure de celui-ci
 */

const guard = async (req: PayloadRequest) => {
  if (!isSuperAdmin(req.user)) throw new APIError('Réservé à l’agence.', 403, undefined, true)
  const id = req.routeParams?.id as string | undefined
  const tenant = id ? await req.payload.findByID({ collection: 'tenants', id, depth: 0, overrideAccess: true, req, disableErrors: true }) : null
  if (!tenant) throw new APIError('Client introuvable.', 404, undefined, true)
  return tenant
}

export const exportTenant: Endpoint = {
  path: '/:id/export',
  method: 'get',
  handler: async (req) => {
    const tenant = await guard(req)
    const data: Record<string, unknown[]> = {}
    for (const collection of TENANT_COLLECTIONS) {
      const { docs } = await req.payload.find({
        collection,
        where: { tenant: { equals: tenant.id } },
        limit: 0,
        pagination: false,
        depth: 0,
        locale: 'all',
        overrideAccess: true,
        req,
      })
      data[collection] = docs
    }
    const { docs: users } = await req.payload.find({
      collection: 'users',
      where: { 'tenants.tenant': { equals: tenant.id } },
      depth: 0,
      limit: 0,
      pagination: false,
      overrideAccess: true,
      req,
    })
    const body = {
      exportedAt: new Date().toISOString(),
      note: 'Export complet du client. Les fichiers (photos, vidéos) sont listés dans « media » ; chaque url se télécharge en étant connecté au CMS.',
      tenant,
      // Comptes : identité et rôles seulement, jamais les mots de passe
      users: users.map((u) => ({ email: u.email, name: u.name, tenants: u.tenants?.filter((t) => String(typeof t.tenant === 'object' ? t.tenant?.id : t.tenant) === String(tenant.id)) })),
      ...data,
    }
    const day = new Date().toISOString().slice(0, 10)
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="client-${tenant.slug}-${day}.json"`,
        'cache-control': 'no-store',
      },
    })
  },
}

/** Retire identifiants, dates et client d'un document, et les liens vers des fichiers (non copiés). */
const clean = (value: unknown, idMap: Map<string, number>): unknown => {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !(item && typeof item === 'object' && ['image', 'video'].includes((item as { blockType?: string }).blockType ?? '')))
      .map((item) => clean(item, idMap))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (['id', 'createdAt', 'updatedAt', 'tenant', '_status', 'author', 'publishedAt'].includes(k)) continue
      if (['image', 'video', 'logo', 'coverImage'].includes(k)) continue
      if ((k === 'category' || k === 'page') && v !== null && v !== undefined) {
        const mapped = idMap.get(`${k}:${v}`)
        if (mapped) out[k] = mapped
        continue
      }
      out[k] = clean(v, idMap)
    }
    return out
  }
  return value
}

export const duplicateTenant: Endpoint = {
  path: '/:id/duplicate',
  method: 'post',
  handler: async (req) => {
    const source = await guard(req)
    const body = (typeof req.json === 'function' ? await req.json().catch(() => ({})) : {}) as { name?: string; slug?: string }
    const name = body.name?.trim()
    const slug = (body.slug?.trim() || name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!name || !slug) throw new APIError('Indiquez le nom du nouveau client.', 400, undefined, true)
    const taken = await req.payload.count({ collection: 'tenants', where: { slug: { equals: slug } }, overrideAccess: true, req })
    if (taken.totalDocs) throw new APIError(`L’identifiant « ${slug} » est déjà utilisé.`, 400, undefined, true)

    const base = { overrideAccess: true, req, depth: 0 } as const
    const created = await req.payload.create({
      collection: 'tenants',
      data: { name, slug, status: 'active', theme: source.theme, settings: source.settings, languages: source.languages, tagline: source.tagline },
      context: { skipDefaultCategories: true },
      ...base,
    })
    const idMap = new Map<string, number>()
    const all = async <T extends (typeof TENANT_COLLECTIONS)[number]>(collection: T) =>
      (await req.payload.find({ collection, where: { tenant: { equals: source.id } }, limit: 0, pagination: false, ...base })).docs
    // Ordre : catégories et tags, puis ce qui les utilise ; pages avant les menus
    for (const cat of await all('categories')) {
      const c = await req.payload.create({ collection: 'categories', data: { ...(clean(cat, idMap) as object), tenant: created.id } as never, ...base })
      idMap.set(`category:${cat.id}`, c.id)
    }
    for (const collection of ['services', 'prices'] as const) {
      for (const doc of await all(collection)) {
        await req.payload.create({ collection, data: { ...(clean(doc, idMap) as object), tenant: created.id } as never, ...base })
      }
    }
    for (const page of await all('pages')) {
      const p = await req.payload.create({ collection: 'pages', data: { ...(clean(page, idMap) as object), tenant: created.id, _status: 'draft' } as never, draft: true, ...base })
      idMap.set(`page:${page.id}`, p.id)
    }
    for (const menu of await all('menus')) {
      await req.payload.create({ collection: 'menus', data: { ...(clean(menu, idMap) as object), tenant: created.id } as never, ...base })
    }
    return Response.json({ id: created.id, slug: created.slug, message: `Client « ${name} » créé. Pages copiées en brouillon, à relire avant publication.` })
  },
}
