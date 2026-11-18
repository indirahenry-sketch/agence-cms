import type { CollectionConfig } from 'payload'

import { CRM_GROUP } from '@/crm/constants'
import { crmAccess, crmHidden } from '@/crm/access'
import { auditChange, auditDelete } from '@/hooks/audit'

/**
 * Historique des recherches : quand, où, avec quelles sources, et combien de résultats.
 * Rempli par la recherche automatique (étape 4) ; consultable dès maintenant.
 */
export const CrmSearches: CollectionConfig = {
  slug: 'crm-searches',
  labels: { singular: 'Recherche', plural: 'Historique des recherches' },
  admin: {
    group: CRM_GROUP,
    hidden: crmHidden,
    useAsTitle: 'title',
    defaultColumns: ['title', 'trigger', 'status', 'found', 'added', 'duplicates', 'rejected'],
    description: 'Chaque recherche lancée (le lundi ou à la main) et son résultat réel : rien n’est gonflé.',
  },
  access: crmAccess,
  defaultSort: '-startedAt',
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const started = data.startedAt ?? originalDoc?.startedAt
        const kind = (data.trigger ?? originalDoc?.trigger) === 'completion' ? 'Complément des coordonnées' : 'Recherche'
        if (started) data.title = `${kind} du ${new Date(started).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}`
        return data
      },
    ],
    afterChange: [auditChange('crm-searches')],
    afterDelete: [auditDelete('crm-searches')],
  },
  fields: [
    { name: 'title', type: 'text', admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        {
          name: 'startedAt',
          label: 'Lancée le',
          type: 'date',
          required: true,
          defaultValue: () => new Date().toISOString(),
          admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } },
        },
        { name: 'finishedAt', label: 'Terminée le', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime', displayFormat: 'dd/MM/yyyy HH:mm' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'trigger',
          label: 'Déclenchement',
          type: 'select',
          required: true,
          defaultValue: 'manuel',
          options: [
            { label: 'Manuel', value: 'manuel' },
            { label: 'Planifié (lundi)', value: 'planifie' },
            { label: 'Import de fichier', value: 'import' },
            { label: 'Complément des coordonnées', value: 'completion' },
          ],
        },
        {
          name: 'status',
          label: 'État',
          type: 'select',
          required: true,
          defaultValue: 'en-cours',
          options: [
            { label: 'En cours', value: 'en-cours' },
            { label: 'Terminée', value: 'terminee' },
            { label: 'Échouée', value: 'echouee' },
          ],
        },
        { name: 'target', label: 'Objectif', type: 'number', min: 0 },
      ],
    },
    { name: 'zones', label: 'Zones', type: 'relationship', relationTo: 'crm-zones', hasMany: true },
    { name: 'sources', label: 'Sources consultées', type: 'text', admin: { placeholder: 'Annuaire des entreprises, OpenStreetMap…' } },
    {
      type: 'row',
      fields: [
        { name: 'found', label: 'Trouvés', type: 'number', defaultValue: 0, min: 0 },
        { name: 'added', label: 'Ajoutés', type: 'number', defaultValue: 0, min: 0 },
        { name: 'duplicates', label: 'Doublons', type: 'number', defaultValue: 0, min: 0 },
        { name: 'rejected', label: 'Écartés', type: 'number', defaultValue: 0, min: 0 },
      ],
    },
    { name: 'report', label: 'Rapport', type: 'textarea' },
  ],
}
