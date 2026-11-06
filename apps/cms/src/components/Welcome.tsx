import type { CollectionSlug, ServerProps, Where } from 'payload'
import React from 'react'

import { getTenantIDs, isSuperAdmin } from '@/access/roles'
import { hasSiteTemplate } from '@/sites/render'

import { LogoutLink } from './LogoutLink'

import './welcome.scss'

/**
 * Tableau de bord (au-dessus des cartes de collections de Payload).
 * - Super admin : chiffres clés de l'agence, vignettes de tous les sites, raccourcis.
 * - Client : chiffres de son site, vignette « Voir mon site », raccourcis vers ce qu'il modifie le plus.
 */
type StatProps = { href: string; label: string; value: number; recent?: number; icon: string; tone?: 'violet' | 'green' | 'orange' | 'blue' | 'pink' }

const ICONS: Record<string, React.ReactNode> = {
  building: <path d="M4 22V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v18M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01" />,
  users: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />,
  image: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4M21 15l-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />,
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8" />,
  help: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.9 4.9l4.3 4.3M14.8 14.8l4.3 4.3M14.8 9.2l4.3-4.3M4.9 19.1l4.3-4.3" />,
  calendar: <path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18" />,
  layout: <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M9 21V9" />,
}

const Icon = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {ICONS[name]}
  </svg>
)

const Stat = ({ href, label, value, recent, icon, tone = 'violet' }: StatProps) => (
  <a className="dash__stat" href={href}>
    <span className={`dash__chip dash__chip--${tone}`}>
      <Icon name={icon} />
    </span>
    <span className="dash__label">{label}</span>
    <strong className="dash__value">{value.toLocaleString('fr-FR')}</strong>
    {recent !== undefined && (
      <span className="dash__sub">
        30 derniers jours <em className={recent > 0 ? 'up' : ''}>{recent > 0 ? `+${recent}` : '0'}</em>
      </span>
    )}
  </a>
)

type SiteCard = { id: number; name: string; slug: string; status?: string | null; domain?: string | null }

const Site = ({ site }: { site: SiteCard }) => {
  const url = site.domain ? `https://${site.domain}` : `/sites/${site.slug}`
  const live = hasSiteTemplate(site.slug)
  return (
    <article className="dash__site">
      <a className="dash__preview" href={live ? url : undefined} target="_blank" rel="noreferrer" aria-label={`Ouvrir le site ${site.name}`}>
        {live ? (
          <iframe src={`/sites/${site.slug}`} title={`Aperçu de ${site.name}`} loading="lazy" sandbox="allow-scripts" tabIndex={-1} />
        ) : (
          <span className="dash__placeholder">Site en préparation</span>
        )}
        {site.status === 'suspended' && <span className="dash__flag">Client suspendu</span>}
      </a>
      <div className="dash__site-body">
        <span className={`dash__dot ${site.status === 'suspended' ? 'off' : ''}`} />
        <div>
          <strong>{site.name}</strong>
          <small>{site.domain || (live ? `/sites/${site.slug}` : 'pas encore en ligne')}</small>
        </div>
        <a className="dash__mini" href={`/admin/collections/tenants/${site.id}`}>Fiche</a>
      </div>
    </article>
  )
}

export const Welcome = async ({ payload, user }: ServerProps) => {
  if (!user) return null
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const admin = isSuperAdmin(user)
  const tenantIDs = getTenantIDs(user)
  const scope: Where = admin ? {} : { tenant: { in: tenantIDs } }
  const count = async (collection: CollectionSlug, where: Where = {}) =>
    (await payload.count({ collection, where: { and: [scope, where] }, overrideAccess: true })).totalDocs
  const both = async (collection: CollectionSlug, where: Where = {}) => ({
    value: await count(collection, where),
    recent: await count(collection, { and: [where, { createdAt: { greater_than: since } }] }),
  })

  const { docs: tenants } = await payload.find({
    collection: 'tenants',
    where: admin ? {} : { id: { in: tenantIDs } },
    depth: 0,
    limit: 60,
    overrideAccess: true,
    select: { name: true, slug: true, status: true, domains: true },
  })
  const sites: SiteCard[] = tenants.map((t) => ({ id: t.id, name: t.name, slug: t.slug, status: t.status, domain: t.domains?.[0]?.domain }))
  const firstName = user.name ? ` ${String(user.name).split(' ')[0]}` : ''

  if (admin) {
    const [clients, users, media, posts, open] = await Promise.all([
      both('tenants'),
      both('users'),
      both('media'),
      both('posts', { _status: { equals: 'published' } }),
      count('support-requests', { status: { not_equals: 'resolved' } }),
    ])
    return (
      <section className="dash">
        <header className="dash__head">
          <div>
            <p className="dash__eyebrow">Vue d’ensemble</p>
            <h2>Bonjour{firstName} 👋</h2>
          </div>
          <div className="dash__actions">
            <a className="dash__btn dash__btn--primary" href="/admin/collections/tenants/create">+ Client</a>
            <a className="dash__btn" href="/admin/collections/users/create">+ Utilisateur</a>
            <LogoutLink variant="button" />
          </div>
        </header>
        <div className="dash__stats">
          <Stat href="/admin/collections/tenants" label="Clients" {...clients} icon="building" />
          <Stat href="/admin/collections/users" label="Utilisateurs" {...users} icon="users" tone="blue" />
          <Stat href="/admin/collections/media" label="Fichiers" {...media} icon="image" tone="green" />
          <Stat href="/admin/collections/posts" label="Articles publiés" {...posts} icon="file" tone="orange" />
          <Stat href="/admin/collections/support-requests?where[status][not_equals]=resolved" label="Demandes ouvertes" value={open} icon="help" tone="pink" />
        </div>
        <div className="dash__section-head">
          <h3>Sites</h3>
          <span>{sites.length} client{sites.length > 1 ? 's' : ''}</span>
        </div>
        <div className="dash__sites">
          {sites.map((s) => (
            <Site key={s.id} site={s} />
          ))}
        </div>
      </section>
    )
  }

  const [photos, posts, events, pages] = await Promise.all([
    both('media', { inGallery: { equals: true } }),
    both('posts'),
    count('events', { startsAt: { greater_than_equal: new Date().toISOString() } }),
    both('pages'),
  ])
  const shortcuts = [
    { href: '/admin/collections/prices', label: 'Modifier mes tarifs', icon: 'file' },
    { href: '/admin/collections/media/create', label: 'Ajouter des photos', icon: 'image' },
    { href: '/admin/collections/posts/create', label: 'Écrire un article', icon: 'file' },
    { href: '/admin/collections/events/create', label: 'Ajouter un événement', icon: 'calendar' },
    { href: '/admin/collections/menus', label: 'Gérer le menu', icon: 'layout' },
    { href: '/admin/collections/promotions', label: 'Bannières et pop-ups', icon: 'layout' },
  ]
  return (
    <section className="dash">
      <header className="dash__head">
        <div>
          <p className="dash__eyebrow">{sites.map((s) => s.name).join(' · ')}</p>
          <h2>Bonjour{firstName} 👋</h2>
        </div>
        <div className="dash__actions">
          <a className="dash__btn" href="/admin/collections/support-requests/create">Contacter l’agence</a>
          <LogoutLink variant="button" />
        </div>
      </header>
      <div className="dash__stats">
        <Stat href="/admin/collections/media?where[inGallery][equals]=true" label="Photos en galerie" {...photos} icon="image" tone="green" />
        <Stat href="/admin/collections/posts" label="Articles" {...posts} icon="file" tone="orange" />
        <Stat href="/admin/collections/events" label="Événements à venir" value={events} icon="calendar" tone="blue" />
        <Stat href="/admin/collections/pages" label="Pages" {...pages} icon="layout" />
      </div>
      <div className="dash__client">
        <div className="dash__sites dash__sites--one">
          {sites.map((s) => (
            <Site key={s.id} site={s} />
          ))}
        </div>
        <div className="dash__shortcuts">
          <h3>Raccourcis</h3>
          {shortcuts.map((s) => (
            <a key={s.href} href={s.href}>
              <span className="dash__chip">
                <Icon name={s.icon} />
              </span>
              {s.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
