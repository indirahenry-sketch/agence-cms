/**
 * Liens saisis par les clients (menus, boutons, bannières) : seules les adresses sûres sont acceptées.
 * Interdit notamment « javascript: », qui exécuterait du code dans le navigateur des visiteurs.
 */
const SAFE = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#|\?)/i

export const isSafeURL = (value: unknown): boolean => typeof value === 'string' && SAFE.test(value.trim())

/** Validation Payload pour un champ texte contenant un lien. */
export const validateURL = (value: unknown): true | string => {
  if (value === undefined || value === null || value === '') return true
  return isSafeURL(value) ? true : 'Lien non valide : commencez par https://, /, #, mailto: ou tel:'
}

/** Pour l'affichage : renvoie le lien s'il est sûr, sinon « # ». */
export const safeHref = (value: unknown): string => (isSafeURL(value) ? String(value).trim() : '#')
