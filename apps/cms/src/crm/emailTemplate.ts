/**
 * Modèles d'e-mails : remplacement des champs {{nom}}, {{commune}}… par les informations du prospect.
 *
 * Rien n'est inventé : si une information manque sur la fiche, le champ est remplacé par
 * un repère visible (ex. « [site ?] ») pour que tu le complètes avant d'envoyer.
 */

import { CRM_TYPES } from './constants'

type ProspectLike = {
  name?: string | null
  commune?: string | null
  website?: string | null
  type?: string | null
}

/** Champs utilisables dans l'objet et le texte d'un modèle. */
export const TEMPLATE_VARIABLES = [
  { key: 'nom', label: 'Nom de la structure' },
  { key: 'commune', label: 'Commune' },
  { key: 'site', label: 'Adresse du site' },
  { key: 'type', label: 'Type d’établissement (écurie, haras…)' },
] as const

const valueOf = (key: string, p: ProspectLike): string => {
  switch (key) {
    case 'nom':
      return String(p.name ?? '').replace(/^exemple\s*·\s*/i, '').trim()
    case 'commune':
      return String(p.commune ?? '').trim()
    case 'site':
      return String(p.website ?? '')
        .trim()
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\/$/, '')
    case 'type':
      return (CRM_TYPES.find((t) => t.value === p.type)?.label ?? '').toLowerCase()
    default:
      return ''
  }
}

/** Remplace les champs connus ; un champ inconnu est laissé tel quel. */
export const fillTemplate = (text: string | null | undefined, p: ProspectLike): string =>
  String(text ?? '').replace(/\{\{\s*([a-zA-ZÀ-ÿ]+)\s*\}\}/g, (match, raw: string) => {
    const key = raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
    if (!TEMPLATE_VARIABLES.some((v) => v.key === key)) return match
    return valueOf(key, p) || `[${key} ?]`
  })

/** Lien « mailto: » qui ouvre un nouvel e-mail prérempli dans la messagerie de l'ordinateur (Outlook…). */
export const mailtoLink = (to: string[], subject: string, body: string): string => {
  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))}`]
  // Adresses laissées lisibles (certaines messageries ne décodent pas « %40 ») ; seuls ? & # sont retirés
  return `mailto:${to.map((a) => a.trim().replace(/[?&#\s]/g, '')).join(',')}?${params.join('&')}`
}
