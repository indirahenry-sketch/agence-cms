import type { Endpoint, Where } from 'payload'

import { getTenantIDs, isSuperAdmin } from '@/access/roles'

export type Notice = { id: string; kind: 'support' | 'client' | 'reply' | 'post' | 'event' | 'user'; title: string; text: string; at: string; href: string }

/**
 * GET /api/notifications : événements récents pour la cloche du CMS.
 * Agence : demandes de support, nouveaux clients et comptes.
 * Client : réponses de l'agence, articles programmés mis en ligne, événements des 3 prochains jours.
 * Rien n'est stocké : la liste est recalculée à chaque ouverture (lu / non lu est retenu par le navigateur).
 */
export const notifications: Endpoint = {
  path: '/notifications',
  method: 'get',
  handler: async (req) => {
    const user = req.user
    if (!user) return Response.json({ items: [] }, { status: 401 })
    const p = req.payload
    const week = new Date(Date.now() - 14 * 864e5).toISOString()
    const now = new Date().toISOString()
    const items: Notice[] = []
    const base = { overrideAccess: true, depth: 1, req } as const

    if (isSuperAdmin(user)) {
      const [support, tenants, users] = await Promise.all([
        p.find({ collection: 'support-requests', where: { createdAt: { greater_than: week } }, sort: '-createdAt', limit: 15, ...base }),
        p.find({ collection: 'tenants', where: { createdAt: { greater_than: week } }, sort: '-createdAt', limit: 5, ...base }),
        p.find({ collection: 'users', where: { and: [{ createdAt: { greater_than: week } }, { id: { not_equals: user.id } }] }, sort: '-createdAt', limit: 5, ...base }),
      ])
      for (const r of support.docs) {
        const t = typeof r.tenant === 'object' && r.tenant ? r.tenant.name : 'Client'
        items.push({ id: `s${r.id}`, kind: 'support', title: r.status === 'resolved' ? 'Demande résolue' : 'Nouvelle demande de support', text: `${t} : « ${r.subject} »`, at: r.createdAt, href: `/admin/collections/support-requests/${r.id}` })
      }
      for (const t of tenants.docs) items.push({ id: `t${t.id}`, kind: 'client', title: 'Nouveau client', text: t.name, at: t.createdAt, href: `/admin/collections/tenants/${t.id}` })
      for (const u of users.docs) items.push({ id: `u${u.id}`, kind: 'user', title: 'Nouveau compte', text: u.name || u.email, at: u.createdAt, href: `/admin/collections/users/${u.id}` })
    } else {
      const tenantIDs = getTenantIDs(user)
      const scope: Where = { tenant: { in: tenantIDs } }
      const soon = new Date(Date.now() + 3 * 864e5).toISOString()
      const [replies, posts, events] = await Promise.all([
        p.find({ collection: 'support-requests', where: { and: [scope, { or: [{ repliedAt: { greater_than: week } }, { and: [{ status: { equals: 'resolved' } }, { updatedAt: { greater_than: week } }] }] }] }, sort: '-updatedAt', limit: 10, ...base }),
        p.find({ collection: 'posts', where: { and: [scope, { _status: { equals: 'published' } }, { publishedAt: { greater_than: week } }, { publishedAt: { less_than_equal: now } }] }, sort: '-publishedAt', limit: 5, ...base }),
        p.find({ collection: 'events', where: { and: [scope, { startsAt: { greater_than_equal: now } }, { startsAt: { less_than: soon } }] }, sort: 'startsAt', limit: 5, ...base }),
      ])
      for (const r of replies.docs) items.push({ id: `r${r.id}-${r.repliedAt ?? r.updatedAt}`, kind: 'reply', title: r.reply ? 'Réponse de l’agence' : 'Demande résolue', text: r.reply ? `« ${r.subject} » : ${r.reply.slice(0, 90)}` : `« ${r.subject} »`, at: r.repliedAt || r.updatedAt, href: `/admin/collections/support-requests/${r.id}` })
      for (const po of posts.docs) items.push({ id: `p${po.id}`, kind: 'post', title: 'Article en ligne', text: po.title, at: po.publishedAt || po.updatedAt, href: `/admin/collections/posts/${po.id}` })
      for (const e of events.docs) items.push({ id: `e${e.id}`, kind: 'event', title: 'Événement bientôt', text: e.title, at: e.startsAt, href: `/admin/collections/events/${e.id}` })
    }
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    return Response.json({ items: items.slice(0, 20) }, { headers: { 'cache-control': 'no-store' } })
  },
}
