import type { Access } from 'payload'

import { isSuperAdmin } from '@/access/roles'

/**
 * Qui peut utiliser l'espace Prospection (CRM) ?
 * Aujourd'hui : le super admin uniquement. Les clients des sites n'y ont JAMAIS accès.
 * Plus tard (rôle « membre de l'agence »), c'est la seule fonction à modifier.
 */
export const canUseCrm = (user: unknown): boolean => isSuperAdmin(user)

export const crmOnly: Access = ({ req }) => canUseCrm(req.user)

/** Jeu de règles commun à toutes les collections du CRM. */
export const crmAccess = { read: crmOnly, create: crmOnly, update: crmOnly, delete: crmOnly }

/** Menu : les collections du CRM sont invisibles pour tous les autres comptes. */
export const crmHidden = ({ user }: { user: unknown }) => !canUseCrm(user)
