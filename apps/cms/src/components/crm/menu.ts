import type { Tone } from '@/crm/tones'

/** Les liens de l'espace Prospection, avec la même icône et la même couleur partout (menu de gauche, onglets). */
export type CrmMenuItem = { key: string; href: string; label: string; icon: string; tone: Tone; match?: string }

export const CRM_MENU: CrmMenuItem[] = [
  { key: 'accueil', href: '/admin/prospection', label: 'Tableau de bord', icon: '◎', tone: 'lav' },
  { key: 'ajouter', href: '/admin/collections/crm-prospects/create', label: 'Ajouter un prospect', icon: '＋', tone: 'lav' },
  { key: 'base', href: '/admin/prospection/base', label: 'Base de prospection', icon: '☰', tone: 'sky' },
  { key: 'recherche', href: '/admin/prospection/recherche', label: 'Recherche', icon: '⌕', tone: 'butter' },
  { key: 'relances', href: '/admin/prospection/relances', label: 'Relances', icon: '◷', tone: 'peach' },
  { key: 'echanges', href: '/admin/collections/crm-activities', label: 'Suivi des échanges', icon: '✎', tone: 'mint' },
  { key: 'import', href: '/admin/prospection/import', label: 'Importer / exporter', icon: '⇅', tone: 'butter' },
  { key: 'envoi', href: '/admin/prospection/envoi', label: 'Outlook et envoi auto', icon: '✈', tone: 'peach' },
  { key: 'modeles', href: '/admin/collections/crm-email-templates', label: 'Modèles d’e-mails', icon: '✉', tone: 'sky' },
  { key: 'zones', href: '/admin/prospection/zones', label: 'Zones (carte)', icon: '⌖', tone: 'lav' },
  { key: 'doublons', href: '/admin/collections/crm-duplicates?where[status][equals]=a-examiner', match: '/admin/collections/crm-duplicates', label: 'Doublons', icon: '⧉', tone: 'rose' },
  { key: 'historique', href: '/admin/collections/crm-searches', label: 'Historique des recherches', icon: '↻', tone: 'mint' },
  { key: 'registre', href: '/admin/prospection/registre', label: 'Registre RGPD', icon: '§', tone: 'mint' },
  { key: 'optouts', href: '/admin/collections/crm-optouts', label: 'Ne plus contacter', icon: '⊘', tone: 'rose' },
  { key: 'reglages', href: '/admin/globals/crm-settings', label: 'Réglages', icon: '⚙', tone: 'sky' },
]

export const crmMenuItem = (key: string) => CRM_MENU.find((i) => i.key === key)!
