import crypto from 'crypto'

/**
 * Nom de fichier unique pour les photos envoyées par les imports des maquettes.
 * Sans lui, plusieurs clients envoyaient « photo-2.jpg » : deux fiches pouvaient se retrouver
 * sur le MÊME fichier du stockage, et l'envoi ou la suppression de l'une changeait la photo de l'autre.
 */
export const uniqueFileName = (site: string, name: string) => `${site}-${crypto.randomUUID()}-${name}`
