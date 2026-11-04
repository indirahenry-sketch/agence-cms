import type { ServerProps } from 'payload'
import React from 'react'

import { getTenantIDs, isSuperAdmin } from '@/access/roles'
import { hasSiteTemplate } from '@/sites/render'

import './welcome.scss'

/**
 * Bandeau d'accueil du tableau de bord.
 * - Super admin : raccourcis de gestion de l'agence.
 * - Client : son entreprise, bouton « Voir mon site » et contact du support.
 */
export const Welcome = async ({ payload, user }: ServerProps) => {
  if (!user) return null

  if (isSuperAdmin(user)) {
    const sites = await payload.find({ collection: 'tenants', depth: 0, limit: 50, overrideAccess: true, select: { name: true, slug: true } })
    sites.docs = sites.docs.filter((t) => hasSiteTemplate(t.slug))
    const [tenants, openRequests] = await Promise.all([
      payload.count({ collection: 'tenants', overrideAccess: true }),
      payload.count({ collection: 'support-requests', overrideAccess: true, where: { status: { not_equals: 'resolved' } } }),
    ])
    return (
      <section className="welcome">
        <h2 className="welcome__title">Bonjour 👋</h2>
        <div className="welcome__stats">
          <a className="welcome__stat" href="/admin/collections/tenants">
            <strong>{tenants.totalDocs}</strong>
            <span>clients</span>
          </a>
          <a className="welcome__stat" href="/admin/collections/support-requests?where[status][not_equals]=resolved">
            <strong>{openRequests.totalDocs}</strong>
            <span>demandes de support ouvertes</span>
          </a>
        </div>
        <div className="welcome__actions">
          <a className="welcome__button" href="/admin/collections/tenants/create">+ Nouveau client</a>
          <a className="welcome__button welcome__button--ghost" href="/admin/collections/users/create">+ Inviter un utilisateur</a>
        </div>
        {sites.docs.length > 0 && (
          <p className="welcome__hint">
            Sites en ligne :{' '}
            {sites.docs.map((t, i) => (
              <React.Fragment key={t.id}>
                {i > 0 && ' · '}
                <a href={`/sites/${t.slug}`} target="_blank" rel="noreferrer">
                  {t.name} ↗
                </a>
              </React.Fragment>
            ))}
          </p>
        )}
      </section>
    )
  }

  const tenantIDs = getTenantIDs(user)
  const { docs: tenants } = await payload.find({
    collection: 'tenants',
    where: { id: { in: tenantIDs } },
    depth: 0,
    limit: 10,
    overrideAccess: false,
    user,
  })

  return (
    <section className="welcome">
      <h2 className="welcome__title">Bonjour{user.name ? ` ${user.name}` : ''} 👋</h2>
      {tenants.map((tenant) => {
        const domain = tenant.domains?.[0]?.domain
        return (
          <div className="welcome__tenant" key={tenant.id}>
            <p className="welcome__tenant-name">{tenant.name}</p>
            <div className="welcome__actions">
              {domain ? (
                <a className="welcome__button" href={`https://${domain}`} target="_blank" rel="noreferrer">
                  Voir mon site ↗
                </a>
              ) : hasSiteTemplate(tenant.slug) ? (
                <a className="welcome__button" href={`/sites/${tenant.slug}`} target="_blank" rel="noreferrer">
                  Voir mon site ↗
                </a>
              ) : (
                <span className="welcome__hint">Votre site sera bientôt en ligne.</span>
              )}
              <a className="welcome__button welcome__button--ghost" href="/admin/collections/support-requests/create">
                Contacter l’agence
              </a>
            </div>
          </div>
        )
      })}
    </section>
  )
}
