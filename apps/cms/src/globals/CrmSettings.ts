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
      name: 'autoSearch',
      label: 'Recherche automatique chaque lundi à 9 h',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Cherche de nouveaux prospects dans les zones actives, jusqu’à l’objectif de la semaine.' },
    },
    {
      name: 'includeBreeders',
      label: 'Inclure les élevages sans nom équestre',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Éleveurs de chevaux dont le nom ne contient ni « écurie », ni « haras », ni « équestre »… Souvent des particuliers, rarement joignables.' },
    },
    {
      name: 'maxSiteChecks',
      label: 'Sites à lire par recherche (pour trouver un e-mail)',
      type: 'number',
      defaultValue: 60,
      min: 0,
      max: 300,
      admin: { description: 'Lecture polie : une page à la fois. Plus le nombre est grand, plus la recherche est longue.' },
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
