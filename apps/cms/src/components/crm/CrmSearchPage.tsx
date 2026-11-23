import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { isMondayAfter9Paris } from '@/crm/search/scheduler'
import { startOfWeekParis } from '@/crm/search/run'

import { CrmSearchForm } from './CrmSearchForm'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

const fmt = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(iso)) : '—'

/** Recherche de prospects : /admin/prospection/recherche */
export const CrmSearchPage = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const base = { overrideAccess: true, req, depth: 0 } as const
  const [settings, zones, searches, thisWeek] = await Promise.all([
    req.payload.findGlobal({ slug: 'crm-settings', ...base }),
    req.payload.find({ collection: 'crm-zones', where: { active: { equals: true } }, limit: 0, pagination: false, sort: 'code', ...base }),
    req.payload.find({ collection: 'crm-searches', sort: '-startedAt', limit: 8, ...base }),
    req.payload.count({ collection: 'crm-prospects', where: { createdAt: { greater_than_equal: startOfWeekParis().toISOString() } }, overrideAccess: true, req }),
  ])
  const target = settings.weeklyTarget ?? 0
  const remaining = Math.max(0, target - thisWeek.totalDocs)
  const running = searches.docs.find((s) => s.status === 'en-cours')

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Recherche de prospects" current="recherche" />
      <div className="crm__cols">
        <section className="ccard">
          <h2 className="ccard__title">Lancer une recherche</h2>
          <p className="cmuted">
            Cherche de nouvelles structures équestres dans les sources publiques gratuites (Annuaire des entreprises de l’État, OpenStreetMap, sites des
            établissements). Les nouveaux prospects arrivent au statut « À vérifier ». Les doublons et la liste « Ne plus contacter » sont respectés.
          </p>
          <CrmSearchForm
            zones={zones.docs.map((z) => ({ id: z.id, label: z.country && z.country !== 'France' ? `${z.country} · ${z.name}` : (z.label ?? z.code), region: z.region ?? '', country: z.country ?? 'France' }))}
            remaining={remaining}
            target={target}
            runningSince={running?.startedAt ?? null}
          />
        </section>

        <section className="ccard">
          <h2 className="ccard__title">Recherche automatique</h2>
          <p>
            {settings.autoSearch === false ? (
              <b>Désactivée.</b>
            ) : (
              <>
                <b>Chaque lundi à partir de 9 h</b>, jusqu’à l’objectif de la semaine ({target}).{' '}
                {isMondayAfter9Paris() ? 'Elle part au plus tard un quart d’heure après 9 h.' : ''}
              </>
            )}
          </p>
          <p className="cmuted">
            Cette semaine : {thisWeek.totalDocs} nouveau{thisWeek.totalDocs > 1 ? 'x' : ''} prospect{thisWeek.totalDocs > 1 ? 's' : ''}, il en reste {remaining} pour
            l’objectif. Zones actives : {zones.docs.length}. Élevages sans nom équestre : {settings.includeBreeders ? 'inclus' : 'mis de côté'}.
          </p>
          <p>
            <a className="clink" href="/admin/globals/crm-settings">
              Modifier les réglages →
            </a>{' '}
            ·{' '}
            <a className="clink" href="/admin/prospection/zones">
              Gérer les zones →
            </a>
          </p>
        </section>
      </div>

      <section className="ccard">
        <div className="ccard__row">
          <h2 className="ccard__title">Dernières recherches</h2>
          <a className="clink" href="/admin/collections/crm-searches">
            Tout l’historique →
          </a>
        </div>
        {searches.docs.length ? (
          <table className="ctable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Déclenchement</th>
                <th>État</th>
                <th>Ajoutés</th>
                <th className="hide-sm">Déjà connus</th>
                <th className="hide-sm">Écartés</th>
              </tr>
            </thead>
            <tbody>
              {searches.docs.map((s) => (
                <tr key={s.id}>
                  <td>
                    <a className="clink" href={`/admin/collections/crm-searches/${s.id}`}>
                      {fmt(s.startedAt)}
                    </a>
                  </td>
                  <td>{s.trigger === 'planifie' ? 'Lundi (auto)' : s.trigger === 'import' ? 'Import' : 'Manuel'}</td>
                  <td>
                    <span className={`cpill tone-${s.status === 'terminee' ? 'mint' : s.status === 'echouee' ? 'rose' : 'sky'}`}>
                      {s.status === 'terminee' ? 'Terminée' : s.status === 'echouee' ? 'Échouée' : 'En cours'}
                    </span>
                  </td>
                  <td>
                    <b>{s.added ?? 0}</b>
                    {s.target ? <span className="cmuted"> / {s.target}</span> : null}
                    {s.added ? (
                      <>
                        {' '}
                        <a className="clink" href={`/admin/prospection/base?recherche=${s.id}`}>
                          voir
                        </a>
                      </>
                    ) : null}
                  </td>
                  <td className="hide-sm">{s.duplicates ?? 0}</td>
                  <td className="hide-sm">{s.rejected ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="cempty">Aucune recherche pour l’instant.</p>
        )}
      </section>
    </div>,
  )
}

export default CrmSearchPage
