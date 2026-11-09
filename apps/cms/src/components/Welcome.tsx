import type { CollectionSlug, ServerProps, Where } from 'payload'
import React from 'react'

import { getTenantIDs, isSuperAdmin } from '@/access/roles'
import { audienceFilter } from '@/collections/Announcements'
import { getStorageStatus } from '@/lib/s3-check'
import { statsSummary } from '@/sites/stats'
import { safeHref } from '@/utilities/safeURL'

import { AnnouncementCards, type AnnouncementItem } from './AnnouncementCards'
import { LogoutLink } from './LogoutLink'
import { SitesBoard, type BoardSite } from './SitesBoard'
import { StorageAlert } from './StorageAlert'

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
  tag: <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01" />,
  chart: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
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

type Summary = Awaited<ReturnType<typeof statsSummary>>

/** Visites des 30 derniers jours : courbe en barres, pages les plus vues, provenance. */
const Visits = ({ stats }: { stats: Summary }) => {
  const max = Math.max(1, ...stats.series.map((p) => p.views))
  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  const label = (path: string) => (path === '/' ? 'Accueil' : decodeURIComponent(path))
  return (
    <div className="dash__visits">
      <div className="dash__visits-head">
        <span className="dash__chip dash__chip--blue">
          <Icon name="chart" />
        </span>
        <div>
          <span className="dash__label">Visites du site · 30 derniers jours</span>
          <strong className="dash__value">{stats.total.toLocaleString('fr-FR')}</strong>
        </div>
      </div>
      <svg className="dash__bars" viewBox={`0 0 ${stats.series.length * 10} 60`} preserveAspectRatio="none" role="img" aria-label="Visites par jour">
        {stats.series.map((p, i) => {
          const h = Math.max(p.views ? 3 : 1, (p.views / max) * 56)
          return (
            <rect key={p.day} x={i * 10 + 1} y={60 - h} width="8" height={h} rx="2" className={p.views ? '' : 'empty'}>
              <title>{`${fmt.format(new Date(`${p.day}T12:00:00`))} : ${p.views} visite${p.views > 1 ? 's' : ''}`}</title>
            </rect>
          )
        })}
      </svg>
      {stats.total > 0 ? (
        <div className="dash__visits-lists">
          <div>
            <h4>Pages les plus vues</h4>
            <ol>
              {stats.pages.map(([path, n]) => (
                <li key={path}>
                  <span>{label(path)}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4>D’où viennent les visiteurs</h4>
            <ol>
              {stats.sources.map(([src, n]) => (
                <li key={src}>
                  <span>{src === 'direct' ? 'Accès direct' : src}</span>
                  <b>{n}</b>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <p className="dash__muted">Aucune visite comptée pour l’instant. Les visites de l’agence et des personnes connectées ne sont pas comptées. Sans cookie : aucun bandeau de consentement nécessaire.</p>
      )}
    </div>
  )
}

type Tone = 'green' | 'blue' | 'orange' | 'violet' | 'pink'
const DAY = 864e5
const ago = (iso?: string | null) => {
  if (!iso) return null
  const d = Math.round((Date.now() - new Date(iso).getTime()) / DAY)
  return d <= 0 ? 'aujourd’hui' : d === 1 ? 'hier' : d < 30 ? `il y a ${d} jours` : d < 365 ? `il y a ${Math.round(d / 30)} mois` : `il y a ${Math.round(d / 365)} an(s)`
}
const inDays = (iso: string) => {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY)
  return d <= 0 ? 'aujourd’hui' : d === 1 ? 'demain' : `dans ${d} jours`
}

/** Carte d'une section du site avec son état (« À jour », « À relancer »…). */
const Section = ({ href, icon, tone, title, detail, badge, badgeTone }: { href: string; icon: string; tone: Tone; title: string; detail: string; badge: string; badgeTone: Tone }) => (
  <a className="sec" href={href}>
    <span className={`dash__chip dash__chip--${tone}`}>
      <Icon name={icon} />
    </span>
    <span className="sec__txt">
      <b>{title}</b>
      <span>{detail}</span>
    </span>
    <span className={`sec__badge sec__badge--${badgeTone}`}>{badge}</span>
  </a>
)

export const Welcome = async ({ payload, user }: ServerProps) => {
  if (!user) return null
  const since = new Date(Date.now() - 30 * DAY).toISOString()
  const admin = isSuperAdmin(user)
  const tenantIDs = getTenantIDs(user)
  const scope: Where = admin ? {} : { tenant: { in: tenantIDs } }
  const count = async (collection: CollectionSlug, where: Where = {}) =>
    (await payload.count({ collection, where: { and: [scope, where] }, overrideAccess: true })).totalDocs
  const both = async (collection: CollectionSlug, where: Where = {}) => ({
    value: await count(collection, where),
    recent: await count(collection, { and: [where, { createdAt: { greater_than: since } }] }),
  })
  const fullName = typeof user.name === 'string' ? user.name.trim() : ''
  const firstName = fullName ? ` ${fullName.split(/\s+/)[0]}` : ''
  // Sans nom renseigné : petit lien pour l'ajouter (il s'affichera ensuite après « Bonjour »)
  const hello = (
    <h2>
      Bonjour{firstName} 👋
      {!fullName && (
        <a className="dash__name-link" href={`/admin/collections/users/${user.id}`}>
          ✎ Ajouter mon prénom
        </a>
      )}
    </h2>
  )
  const stats = await statsSummary(payload, admin ? 'all' : tenantIDs).catch(() => null)

  // Dernière modification par client (journal d'audit)
  const { docs: logs } = await payload.find({
    collection: 'audit-logs',
    where: { and: [{ action: { not_equals: 'login' } }, ...(admin ? [] : [{ tenant: { in: tenantIDs } }])] },
    sort: '-createdAt',
    limit: 300,
    depth: 1,
    overrideAccess: true,
  })
  const lastByTenant = new Map<string, { at: string; by?: string }>()
  for (const l of logs) {
    const t = l.tenant ? String(typeof l.tenant === 'object' ? l.tenant.id : l.tenant) : null
    if (!t || lastByTenant.has(t)) continue
    const u = typeof l.user === 'object' && l.user ? l.user : null
    lastByTenant.set(t, { at: l.createdAt, by: u ? (String(u.id) === String(user.id) ? 'vous' : u.name || u.email) : undefined })
  }

  if (admin) {
    const liveAnnouncements = (await payload.count({ collection: 'announcements', where: audienceFilter([]), overrideAccess: true })).totalDocs
    const { docs: tenants } = await payload.find({ collection: 'tenants', depth: 0, limit: 200, pagination: false, overrideAccess: true })
    const board: BoardSite[] = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status || 'active',
      maintenance: Boolean(t.maintenance),
      domain: t.domains?.[0]?.domain,
      labels: (t.labels as string[] | null | undefined) ?? [],
      lastChange: lastByTenant.get(String(t.id))?.at ?? t.updatedAt,
      visits: stats ? (stats.byTenant.get(String(t.id)) ?? 0) : 0,
    }))
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
            {hello}
          </div>
          <div className="dash__actions">
            <a className="dash__btn" href="/admin/collections/announcements">Annonces aux clients{liveAnnouncements ? ` · ${liveAnnouncements}` : ''}</a>
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
        <StorageAlert status={getStorageStatus()} />
        {stats && <Visits stats={stats} />}
        <div className="dash__section-head">
          <h3>Tous les sites</h3>
          <span>{tenants.length} client{tenants.length > 1 ? 's' : ''}</span>
        </div>
        <SitesBoard sites={board} />
      </section>
    )
  }

  // ── Accueil client : « mon site en un coup d'œil » ──
  const { docs: tenants } = await payload.find({ collection: 'tenants', where: { id: { in: tenantIDs } }, depth: 0, limit: 10, overrideAccess: true })
  const site = tenants[0]
  const now = new Date().toISOString()
  const [photos, lastPhoto, nextEvents, upcoming, lastPost, prices, info, articlesCat] = await Promise.all([
    count('media', { inGallery: { equals: true } }),
    payload.find({ collection: 'media', where: { and: [scope, { inGallery: { equals: true } }] }, sort: '-createdAt', limit: 1, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'events', where: { and: [scope, { startsAt: { greater_than_equal: now } }] }, sort: 'startsAt', limit: 1, depth: 0, overrideAccess: true }),
    count('events', { startsAt: { greater_than_equal: now } }),
    payload.find({ collection: 'posts', where: { and: [scope, { _status: { equals: 'published' } }] }, sort: '-publishedAt', limit: 1, depth: 0, overrideAccess: true }),
    count('prices'),
    payload.find({ collection: 'site-info', where: scope, limit: 1, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'categories', where: { and: [scope, { usage: { in: ['articles'] } }] }, sort: 'order', limit: 1, depth: 0, overrideAccess: true }),
  ])
  const articlesName = articlesCat.docs[0]?.name || 'Articles'
  const last = site ? lastByTenant.get(String(site.id)) : undefined
  const online = site && (site.status ?? 'active') === 'active' && !site.maintenance
  const siteURL = site ? (site.domains?.[0]?.domain ? `https://${site.domains[0].domain}` : `/sites/${site.slug}`) : '#'
  const photoAge = lastPhoto.docs[0] ? (Date.now() - new Date(lastPhoto.docs[0].createdAt).getTime()) / DAY : Infinity
  const post = lastPost.docs[0]
  const postAge = post ? (Date.now() - new Date(post.publishedAt || post.createdAt).getTime()) / DAY : Infinity
  const next = nextEvents.docs[0]

  // Assistant d'accueil : 4 étapes, disparaît une fois tout rempli
  const steps = [
    { done: Boolean(site?.logo), label: 'Logo et couleurs', hint: 'Ajoutez votre logo : il apparaît en haut du site.', href: site ? `/admin/collections/tenants/${site.id}` : '#' },
    { done: Boolean(info.docs[0]?.openingHours?.length), label: 'Horaires', hint: 'Vos horaires s’affichent sur le site avec « Ouvert / Fermé ».', href: info.docs[0] ? `/admin/collections/site-info/${info.docs[0].id}` : '/admin/collections/site-info' },
    { done: photos >= 3, label: 'Trois photos', hint: 'Trois photos suffisent pour une belle galerie.', href: '/admin/collections/media' },
    { done: prices > 0, label: 'Premier tarif', hint: 'Indiquez au moins un prix pour vos visiteurs.', href: '/admin/collections/prices/create' },
  ]
  const doneCount = steps.filter((x) => x.done).length
  const current = steps.find((x) => !x.done)

  // Messages de l'agence pour ce client (ou pour tous les clients)
  const { docs: announcementDocs } = await payload.find({
    collection: 'announcements',
    where: audienceFilter(getTenantIDs(user)),
    sort: '-updatedAt',
    limit: 3,
    depth: 0,
    overrideAccess: true,
  })
  const announcements: AnnouncementItem[] = announcementDocs.map((a) => ({
    id: a.id,
    key: `${a.id}-${new Date(a.updatedAt).getTime()}`,
    title: a.title,
    text: a.text,
    tone: a.tone || 'news',
    buttonLabel: a.buttonLabel,
    buttonUrl: safeHref(a.buttonUrl) === '#' ? null : a.buttonUrl,
  }))

  const shortcuts = [
    { href: '/admin/collections/media', label: 'Ajouter des photos', icon: 'image' },
    { href: '/admin/collections/posts/create', label: 'Écrire un article', icon: 'file' },
    { href: '/admin/collections/events', label: 'Ajouter un événement', icon: 'calendar' },
    { href: '/admin/collections/prices', label: 'Modifier mes tarifs', icon: 'file' },
    { href: '/admin/collections/menus', label: 'Gérer le menu', icon: 'layout' },
    { href: '/admin/collections/promotions', label: 'Bannières et pop-ups', icon: 'layout' },
  ]

  return (
    <section className="dash">
      <header className="dash__head">
        <div>
          <p className="dash__eyebrow">{tenants.map((t) => t.name).join(' · ')}</p>
          {hello}
        </div>
        <div className="dash__actions">
          <a className="dash__btn" href="/admin/collections/support-requests/create">Contacter l’agence</a>
          <LogoutLink variant="button" />
        </div>
      </header>

      <AnnouncementCards items={announcements} />

      {current && (
        <div className="wizard">
          <div className="wizard__head">
            <div>
              <p className="dash__eyebrow">Bien démarrer · {doneCount} étape{doneCount > 1 ? 's' : ''} sur 4 faite{doneCount > 1 ? 's' : ''}</p>
              <h3>{current.label}</h3>
              <p className="dash__muted">{current.hint}</p>
            </div>
            <a className="dash__btn dash__btn--primary" href={current.href}>Continuer</a>
          </div>
          <ol className="wizard__steps">
            {steps.map((x, i) => (
              <li key={x.label} className={x.done ? 'done' : x === current ? 'now' : ''}>
                <a href={x.href}>
                  <span className="wizard__bar" />
                  <span>
                    {x.done ? '✓' : i + 1} · {x.label}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="glance">
        {site && (
          <article className="glance__site">
            <a className="glance__preview" href={siteURL} target="_blank" rel="noreferrer" aria-label="Ouvrir mon site">
              {online ? <iframe src={`/sites/${site.slug}`} title="Aperçu de mon site" loading="lazy" sandbox="allow-scripts" tabIndex={-1} /> : <span className="dash__placeholder">{site.maintenance ? 'Site en maintenance' : 'Site hors ligne'}</span>}
            </a>
            <div className="glance__foot">
              <span className={`dash__dot ${online ? '' : 'off'}`} />
              <div>
                <b>{online ? 'Votre site est en ligne' : site.maintenance ? 'Site en maintenance' : 'Site hors ligne'}</b>
                <small>{last ? `Dernière modification ${ago(last.at)}${last.by ? `, par ${last.by}` : ''}` : 'Pas encore de modification'}</small>
              </div>
              <a className="dash__btn dash__btn--primary" href={siteURL} target="_blank" rel="noreferrer">Voir mon site</a>
            </div>
          </article>
        )}
        <div className="glance__sections">
          <Section
            href="/admin/collections/media"
            icon="image"
            tone="green"
            title="Photos"
            detail={photos ? `${photos} en galerie · ajoutées ${ago(lastPhoto.docs[0]?.createdAt)}` : 'Aucune photo en galerie'}
            badge={photos === 0 ? 'À compléter' : photoAge > 120 ? 'À rafraîchir' : 'À jour'}
            badgeTone={photos === 0 || photoAge > 120 ? 'orange' : 'green'}
          />
          <Section
            href="/admin/collections/events"
            icon="calendar"
            tone="blue"
            title="Agenda"
            detail={next ? `Prochain : ${next.title} ${inDays(next.startsAt)}` : 'Aucun événement à venir'}
            badge={upcoming ? `${upcoming} à venir` : 'À compléter'}
            badgeTone={upcoming ? 'blue' : 'orange'}
          />
          <Section
            href="/admin/collections/posts"
            icon="file"
            tone="orange"
            title={articlesName}
            detail={post ? `Dernier article ${ago(post.publishedAt || post.createdAt)}` : 'Aucun article publié'}
            badge={postAge > 30 ? 'À relancer' : 'À jour'}
            badgeTone={postAge > 30 ? 'orange' : 'green'}
          />
          <Section
            href="/admin/collections/prices"
            icon="tag"
            tone="violet"
            title="Tarifs"
            detail={prices ? `${prices} tarif${prices > 1 ? 's' : ''}` : 'Aucun tarif'}
            badge={prices ? 'À jour' : 'À compléter'}
            badgeTone={prices ? 'green' : 'orange'}
          />
        </div>
      </div>

      {stats && <Visits stats={stats} />}

      <div className="dash__shortcuts dash__shortcuts--row">
        <h3>Raccourcis</h3>
        <div>
          {shortcuts.map((x) => (
            <a key={x.label} href={x.href}>
              <span className="dash__chip">
                <Icon name={x.icon} />
              </span>
              {x.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
