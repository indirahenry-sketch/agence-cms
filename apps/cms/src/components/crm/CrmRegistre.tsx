import type { AdminViewServerProps, Where } from 'payload'
import React from 'react'

import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/** Durée de conservation recommandée par la CNIL pour un prospect sans réponse : 3 ans après le dernier contact. */
const KEEP_YEARS = 3

/**
 * Registre RGPD de la prospection : /admin/prospection/registre
 * Ce que l'agence garde, pourquoi, combien de temps, et les fiches à revoir. Ne supprime rien tout seul.
 */
export const CrmRegistre = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const { req } = props.initPageResult
  const { payload } = req
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - KEEP_YEARS)
  const iso = cutoff.toISOString()
  const old: Where = {
    and: [
      { doNotContact: { not_equals: true } },
      { or: [{ lastContactAt: { less_than: iso } }, { and: [{ lastContactAt: { exists: false } }, { createdAt: { less_than: iso } }] }] },
    ],
  }
  const base = { overrideAccess: true, req } as const
  const [total, optouts, stale] = await Promise.all([
    payload.count({ collection: 'crm-prospects', ...base }),
    payload.count({ collection: 'crm-optouts', ...base }),
    payload.count({ collection: 'crm-prospects', where: old, ...base }),
  ])
  const staleHref =
    '/admin/collections/crm-prospects?' +
    [
      'where[and][0][doNotContact][not_equals]=true',
      `where[and][1][or][0][lastContactAt][less_than]=${encodeURIComponent(iso)}`,
      'where[and][1][or][1][and][0][lastContactAt][exists]=false',
      `where[and][1][or][1][and][1][createdAt][less_than]=${encodeURIComponent(iso)}`,
    ].join('&')
  const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' }).format(cutoff)

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Registre RGPD" current="registre" />
      <div className="creg">
        <section className="crm__card">
          <h2>En ce moment</h2>
          <div className="creg__nums">
            <a href="/admin/prospection/base">
              <b>{total.totalDocs}</b> prospects enregistrés
            </a>
            <a href="/admin/collections/crm-optouts">
              <b>{optouts.totalDocs}</b> « Ne plus contacter »
            </a>
            <a href={staleHref}>
              <b>{stale.totalDocs}</b> sans contact depuis {KEEP_YEARS} ans
            </a>
          </div>
          <p className="cmuted" style={{ marginTop: 10 }}>
            {stale.totalDocs
              ? `Fiches sans échange depuis le ${dateFr} : à supprimer ou à recontacter. Rien n’est supprimé automatiquement.`
              : `Aucune fiche à revoir : toutes ont eu un contact après le ${dateFr}, ou sont trop récentes.`}
          </p>
        </section>

        <section className="crm__card">
          <h2>Traitement : prospection commerciale des structures équestres</h2>
          <dl>
            <dt>Responsable</dt>
            <dd>Eye Design (l’agence), seule utilisatrice de cet espace.</dd>
            <dt>But</dt>
            <dd>Proposer la création ou la refonte de sites internet à des écuries, centres équestres, poney-clubs, haras et élevages.</dd>
            <dt>Base légale</dt>
            <dd>Intérêt légitime de l’agence. Prospection par e-mail entre professionnels : permise sans accord préalable si le message concerne leur métier et permet de refuser.</dd>
            <dt>Données gardées</dt>
            <dd>
              Nom de la structure, adresse, commune, SIREN, type d’activité, téléphone, e-mail et site <strong>publics et professionnels</strong>, notes, échanges et relances. Aucune donnée
              sensible, aucune donnée de la vie privée.
            </dd>
            <dt>Sources</dt>
            <dd>Annuaire des entreprises de l’État, OpenStreetMap, site internet de la structure, saisie manuelle. Chaque coordonnée garde sa source.</dd>
            <dt>Qui y a accès</dt>
            <dd>Toi seule (super admin). Hébergement : Render (serveur) et Supabase (base). Sauvegardes chiffrées. Tes relances, si tu t’abonnes à l’agenda : ton Outlook.</dd>
            <dt>Durée</dt>
            <dd>
              {KEEP_YEARS} ans après le dernier contact sans réponse, puis suppression. Une fiche « Ne plus contacter » est réduite au minimum (nom, e-mail, téléphone) et gardée
              pour ne jamais recontacter la personne.
            </dd>
            <dt>Droit de refus</dt>
            <dd>Chaque e-mail préparé se termine par une phrase qui permet de répondre « STOP ». Dès qu’une personne refuse : bouton « Ne plus contacter » sur sa fiche.</dd>
            <dt>Autres droits</dt>
            <dd>Accès, correction ou suppression sur simple demande par e-mail : réponse sous un mois. Export de sa fiche possible depuis « Importer / exporter ».</dd>
          </dl>
        </section>

        <section className="crm__card">
          <h2>Bonnes pratiques</h2>
          <ul className="crm__steps">
            <li>Écrire uniquement à l’adresse professionnelle publique, jamais à une adresse personnelle trouvée ailleurs.</li>
            <li>Toujours signer avec le nom de l’agence et un moyen de te joindre.</li>
            <li>Pas d’envoi groupé : chaque e-mail part un par un depuis Outlook.</li>
            <li>Une fois par an, ouvrir cette page et traiter les fiches « sans contact depuis {KEEP_YEARS} ans ».</li>
          </ul>
          <p className="cmuted">Résumé des règles publiées par la CNIL sur la prospection commerciale. En cas de doute, la CNIL (cnil.fr) reste la référence.</p>
        </section>
      </div>
    </div>,
  )
}

export default CrmRegistre
