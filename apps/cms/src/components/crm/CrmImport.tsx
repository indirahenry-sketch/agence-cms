import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { CrmImportForm } from './CrmImportForm'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/** Import et export CSV des prospects : /admin/prospection/import */
export const CrmImport = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const total = (await props.initPageResult.req.payload.count({ collection: 'crm-prospects', overrideAccess: true, req: props.initPageResult.req })).totalDocs

  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Importer / exporter" current="import" />

      <div className="crm__cols">
        <section className="crm__card">
          <h2>Exporter</h2>
          <p>
            Tous les prospects ({total}) dans un fichier CSV, qui s’ouvre avec Excel, Numbers ou Google Sheets. Une information introuvable y est écrite
            « Non trouvé ».
          </p>
          <p>
            <a className="dash__btn" href="/api/crm-export">
              ↓ Télécharger les prospects
            </a>
          </p>
          <p>
            <a className="dash__btn" href="/api/crm-export?reserve=1">
              ↓ Télécharger les fiches à compléter
            </a>
          </p>
          <p className="cmuted">Seulement les prospects sans téléphone ni e-mail : à envoyer à Claude pour une recherche approfondie.</p>
          <p className="crm__warn">
            Ce fichier contient des coordonnées de personnes : garde-le pour toi, ne l’envoie pas par e-mail à n’importe qui et ne le mets jamais sur
            GitHub.
          </p>
        </section>

        <section className="crm__card">
          <h2>Importer</h2>
          <p>
            Ajoute des prospects depuis un fichier CSV. Chaque ligne arrive au statut « À vérifier ». Une ligne déjà connue ou dans la liste « Ne plus
            contacter » n’est jamais ajoutée. Commence par « Vérifier » : rien n’est enregistré tant que tu n’as pas cliqué sur « Importer ».
          </p>
          <p>
            <a href="/api/crm-export?modele=1">Télécharger un modèle de fichier</a> (seule la colonne « Nom » est obligatoire).
          </p>
          <CrmImportForm />
        </section>
      </div>
    </div>,
  )
}

export default CrmImport
