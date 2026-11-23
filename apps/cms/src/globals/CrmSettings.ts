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
      name: 'onlyReachable',
      label: 'N’ajouter que les prospects joignables (téléphone ou e-mail trouvé)',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Recommandé. Décoché : les structures sans contact sont aussi ajoutées, et vont dans la réserve « À compléter ».' },
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
      type: 'collapsible',
      label: 'Outlook et envoi automatique',
      admin: { description: 'Se règle plus simplement depuis Prospection → Outlook et envoi auto.' },
      fields: [
        { name: 'autoSend', label: 'Envoi automatique activé', type: 'checkbox', defaultValue: false },
        {
          name: 'autoSendScope',
          label: 'Prospects concernés',
          type: 'select',
          required: true,
          defaultValue: 'choisis',
          options: [
            { label: 'Seulement ceux que je choisis (« Oui » sur la fiche)', value: 'choisis' },
            { label: 'Tous, sauf ceux mis sur « Non »', value: 'tous' },
          ],
        },
        { name: 'autoSendDailyCap', label: 'Maximum d’e-mails automatiques par jour', type: 'number', required: true, defaultValue: 10, min: 1, max: 50 },
        { name: 'autoSendGapMinutes', label: 'Écart minimum entre deux envois (minutes)', type: 'number', required: true, defaultValue: 20, min: 5, max: 240 },
        { name: 'autoSendRelances', label: 'Relances automatiques sans réponse', type: 'number', required: true, defaultValue: 1, min: 0, max: 3 },
        { name: 'replyCheck', label: 'Repérer les réponses des prospects dans Outlook', type: 'checkbox', defaultValue: true },
        { name: 'outlookEmail', label: 'Boîte Outlook connectée', type: 'text', admin: { readOnly: true } },
        { name: 'outlookConnectedAt', label: 'Connectée le', type: 'date', admin: { readOnly: true } },
        { name: 'outlookLastCheck', label: 'Dernière lecture des réponses', type: 'date', admin: { readOnly: true } },
        { name: 'outlookError', label: 'Dernière erreur Outlook', type: 'text', admin: { readOnly: true } },
        // Jeton de connexion, chiffré ; jamais renvoyé par l'API
        { name: 'outlookToken', type: 'text', hidden: true },
      ],
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
