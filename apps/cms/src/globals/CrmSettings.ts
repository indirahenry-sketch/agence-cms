import type { GlobalConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmHidden, crmOnly } from '@/crm/access'

/** Réglages de la prospection : c'est toi qui fixes l'objectif, sans plafond imposé. */
export const CrmSettings: GlobalConfig = {
  slug: 'crm-settings',
  label: 'Réglages de prospection',
  admin: { group: CRM_GROUP, hidden: crmHidden },
  access: { read: crmOnly, update: crmOnly },
  fields: [
    {
      name: 'weeklyTarget',
      label: 'Objectif de nouveaux prospects par semaine',
      type: 'number',
      required: true,
      defaultValue: 70,
      min: 0,
      admin: {
        description: 'Le nombre que tu veux. La recherche s’arrête à cet objectif, et n’ajoute jamais de fiche inventée pour l’atteindre.',
      },
    },
    {
      name: 'followUpDays',
      label: 'Relancer après (jours sans réponse)',
      type: 'number',
      required: true,
      defaultValue: 7,
      min: 1,
    },
  ],
}
