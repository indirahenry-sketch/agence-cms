import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { CrmBaseTable } from './CrmBaseTable'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/**
 * Base de prospection : /admin/prospection/base
 * Tous les prospects dans un tableau modifiable sur place (statuts, catégorie de site, projet),
 * compteurs, filtres, et fiche individuelle en panneau latéral.
 */
export const CrmBase = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Base de prospection" current="base" />
      <CrmBaseTable />
    </div>,
  )
}

export default CrmBase
