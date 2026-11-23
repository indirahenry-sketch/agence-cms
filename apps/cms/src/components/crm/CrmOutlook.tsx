import type { AdminViewServerProps } from 'payload'
import React from 'react'

import { CrmOutlookPanel } from './CrmOutlookPanel'
import { CrmHeader, crmAllowed, crmDenied, crmPage } from './template'

/** Outlook et envoi automatique : /admin/prospection/envoi */
export const CrmOutlook = async (props: AdminViewServerProps) => {
  if (!crmAllowed(props)) return crmDenied(props)
  const flag = String((props.searchParams?.outlook as string | undefined) ?? '')
  return crmPage(
    props,
    <div className="crm">
      <CrmHeader title="Outlook et envoi automatique" current="envoi" />
      <CrmOutlookPanel flag={flag} />
    </div>,
  )
}

export default CrmOutlook
