/**
 * Un seul code couleur par type, partout dans la prospection (calendriers, « À faire »,
 * fenêtre des tâches, activité récente). Les couleurs sont les pastels de crm.scss.
 * « En retard » ne change pas la couleur du type : il s'affiche en rouge à part (chiffre, contour).
 */
export type Tone = 'lav' | 'sky' | 'peach' | 'mint' | 'rose' | 'butter'

export const KIND_TONE: Record<string, Tone> = {
  relance: 'peach',
  appel: 'mint',
  email: 'sky',
  'email-envoye': 'sky',
  reponse: 'lav',
  rdv: 'rose',
  recherche: 'butter',
  note: 'butter',
  autre: 'lav',
}

export const KIND_ICON: Record<string, string> = {
  relance: '↻',
  appel: '☎',
  email: '✉',
  'email-envoye': '✉',
  reponse: '↩',
  rdv: '◷',
  recherche: '⌕',
  note: '✎',
  autre: '•',
}

export const toneOfKind = (kind?: string | null): Tone => KIND_TONE[kind ?? ''] ?? 'lav'

/** Légende commune des calendriers. */
export const KIND_LEGEND: { kind: string; label: string }[] = [
  { kind: 'relance', label: 'Relance' },
  { kind: 'appel', label: 'Appel' },
  { kind: 'email', label: 'E-mail' },
  { kind: 'recherche', label: 'Recherche' },
  { kind: 'rdv', label: 'Rendez-vous' },
  { kind: 'autre', label: 'Autre' },
]
