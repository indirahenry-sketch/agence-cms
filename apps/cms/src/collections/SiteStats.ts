import type { CollectionConfig } from 'payload'

import { tenantRead } from '@/access/tenantAccess'

/**
 * Mesure d'audience SANS cookie ni adresse IP (pas de bandeau de consentement nécessaire) :
 * un compteur par jour, par page et par provenance (site d'où vient le visiteur).
 * Écrit uniquement par le serveur (sites/stats.ts), lu dans le tableau de bord.
 */
export const SiteStats: CollectionConfig = {
  slug: 'site-stats',
  labels: { singular: 'Statistique', plural: 'Statistiques' },
  admin: { hidden: true, useAsTitle: 'path' },
  access: {
    read: tenantRead,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'day', label: 'Jour', type: 'text', required: true, index: true },
    { name: 'path', label: 'Page', type: 'text', required: true },
    { name: 'source', label: 'Provenance', type: 'text', defaultValue: 'direct' },
    { name: 'views', label: 'Visites', type: 'number', defaultValue: 0 },
  ],
}
