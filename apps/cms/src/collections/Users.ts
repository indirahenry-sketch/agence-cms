import crypto from 'crypto'
import {
  Forbidden,
  type Access,
  type CollectionAfterChangeHook,
  type CollectionAfterLoginHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeDeleteHook,
  type CollectionBeforeLoginHook,
  type CollectionBeforeOperationHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type FieldAccess,
  type Where,
} from 'payload'

import { ADMIN_ONLY, extractID, getTenantIDs, INACTIVE_STATUSES, isSuperAdmin, sameID } from '@/access/roles'
import { auditChange, auditDelete } from '@/hooks/audit'
import { escapeHTML, getServerURL } from '@/utilities/serverURL'

type MembershipRow = { tenant?: unknown; roles?: string[] | null; id?: string | null }

const isSelf = (req: { user?: { id?: unknown } | null }, id?: unknown) =>
  Boolean(req.user && id !== undefined && sameID(req.user.id, id))

// ── Accès ────────────────────────────────────────────────────────────

/** Lire : soi-même, le super admin, ou l'admin client pour les membres de ses clients. */
const readUsers: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  const adminTenants = getTenantIDs(req.user, ADMIN_ONLY)
  const self: Where = { id: { equals: req.user.id } }
  if (!adminTenants.length) return self
  return { or: [self, { 'tenants.tenant': { in: adminTenants } }] }
}

/** Créer (inviter) : super admin, ou admin client (vérification fine dans le hook). */
const createUsers: Access = ({ req }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  return getTenantIDs(req.user, ADMIN_ONLY).length > 0
}

/** Modifier : soi-même, le super admin, ou l'admin client pour les membres de ses clients. */
const updateUsers: Access = ({ req, id }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user) || isSelf(req, id)) return true
  const adminTenants = getTenantIDs(req.user, ADMIN_ONLY)
  return adminTenants.length ? { 'tenants.tenant': { in: adminTenants } } : false
}

/** Supprimer : super admin, ou admin client pour les membres de ses clients (jamais soi-même). */
const deleteUsers: Access = ({ req, id }) => {
  if (!req.user) return false
  if (isSuperAdmin(req.user)) return true
  if (isSelf(req, id)) return false
  const adminTenants = getTenantIDs(req.user, ADMIN_ONLY)
  return adminTenants.length ? { 'tenants.tenant': { in: adminTenants } } : false
}

const superAdminField: FieldAccess = ({ req }) => isSuperAdmin(req.user)

// ── Hooks ────────────────────────────────────────────────────────────

/** Un compte invité reçoit un mot de passe aléatoire : il choisira le sien via le lien d'invitation. */
const randomPasswordForInvites: CollectionBeforeValidateHook = ({ data, operation }) => {
  if (operation === 'create' && data && !data.password) {
    data.password = crypto.randomBytes(24).toString('base64url')
  }
  return data
}

/**
 * Le tout premier compte créé (écran « Créer le premier utilisateur » d'une base vide)
 * devient automatiquement super administrateur. Ne s'applique plus jamais ensuite.
 */
const firstUserIsSuperAdmin: CollectionBeforeChangeHook = async ({ req, data, operation }) => {
  if (operation !== 'create' || req.user) return data
  const { totalDocs } = await req.payload.count({ collection: 'users', overrideAccess: true, req })
  if (totalDocs === 0) data.roles = ['super-admin']
  return data
}

/**
 * Protège la liste des clients d'un utilisateur :
 * un admin client ne peut ajouter/retirer QUE ses propres clients,
 * et ne peut jamais toucher aux appartenances d'un utilisateur à d'autres clients.
 */
const protectMemberships: CollectionBeforeChangeHook = ({ req, data, operation, originalDoc }) => {
  const user = req.user
  if (!user || isSuperAdmin(user)) return data

  // Personne d'autre que le super admin ne peut donner le rôle super admin
  if (data.roles && data.roles.includes('super-admin')) throw new Forbidden(req.t)

  if (data.tenants === undefined) return data

  const adminTenants = getTenantIDs(user, ADMIN_ONLY)
  const requested = (data.tenants ?? []) as MembershipRow[]
  const original = (originalDoc?.tenants ?? []) as MembershipRow[]
  const managed = (row: MembershipRow) => adminTenants.some((id) => sameID(id, row.tenant))

  // Toute ligne demandée doit concerner un client que j'administre
  for (const row of requested) {
    if (!managed(row)) {
      // ...sauf si la ligne existait déjà à l'identique (je ne la modifie pas)
      const unchanged = original.some(
        (o) => sameID(o.tenant, row.tenant) && JSON.stringify([...(o.roles ?? [])].sort()) === JSON.stringify([...(row.roles ?? [])].sort()),
      )
      if (!unchanged) throw new Forbidden(req.t)
    }
  }

  // Les appartenances à des clients que je n'administre pas sont conservées telles quelles
  const preserved = original.filter((o) => !managed(o) && !requested.some((r) => sameID(r.tenant, o.tenant)))
  data.tenants = [...requested, ...preserved].map((row) => ({ ...row, tenant: extractID(row.tenant) }))

  if (operation === 'create' && data.tenants.length === 0) throw new Forbidden(req.t)
  return data
}

/**
 * Comptes partagés entre plusieurs clients : un admin client ne gère QUE l'appartenance
 * de la personne à ses propres clients. Il ne peut ni changer son mot de passe, ni son
 * e-mail, ni son nom, ni supprimer le compte, dès qu'elle appartient aussi à un client
 * qu'il n'administre pas (ou qu'elle est super admin). Sinon, l'admin du client A
 * pourrait prendre le compte d'un administrateur du client B.
 */
const managesWholeAccount = (manager: unknown, target: { roles?: string[] | null; tenants?: MembershipRow[] | null }) => {
  if (isSuperAdmin(manager)) return true
  if (isSuperAdmin(target)) return false
  const adminTenants = getTenantIDs(manager, ADMIN_ONLY)
  return (target.tenants ?? []).every((row) => adminTenants.some((id) => sameID(id, row.tenant)))
}

const protectSharedAccounts: CollectionBeforeOperationHook = async ({ args, operation, req }) => {
  if (operation !== 'update' && operation !== 'updateByID') return args
  const data = args.data as { password?: string; email?: string; name?: string } | undefined
  const { id, where } = args as { id?: number | string; where?: Where }
  if (!req.user || isSuperAdmin(req.user) || !data) return args
  if (!(data.password || data.email !== undefined || data.name !== undefined)) return args
  // Cible(s) de la modification : par identifiant, ou toutes celles du filtre (modification en masse)
  const targets = id
    ? [await req.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req, disableErrors: true })]
    : (await req.payload.find({ collection: 'users', where, depth: 0, limit: 0, overrideAccess: true, req })).docs
  for (const target of targets) {
    if (!target || isSelf(req, target.id) || managesWholeAccount(req.user, target)) continue
    const touchesAccount =
      Boolean(data.password) ||
      (data.email !== undefined && data.email !== target.email) ||
      (data.name !== undefined && data.name !== target.name)
    if (touchesAccount) throw new Forbidden(req.t)
  }
  return args
}

const protectSharedAccountsDelete: CollectionBeforeDeleteHook = async ({ req, id }) => {
  if (!req.user || isSuperAdmin(req.user)) return
  const target = await req.payload.findByID({ collection: 'users', id, depth: 0, overrideAccess: true, req, disableErrors: true })
  if (target && !managesWholeAccount(req.user, target)) throw new Forbidden(req.t)
}

/** Un compte dont tous les clients sont suspendus ne peut plus se connecter. */
const blockSuspendedTenants: CollectionBeforeLoginHook = async ({ req, user }) => {
  if (isSuperAdmin(user)) return user
  const ids = getTenantIDs(user)
  if (!ids.length) return user
  const { totalDocs } = await req.payload.count({
    collection: 'tenants',
    where: { and: [{ id: { in: ids } }, { status: { not_in: [...INACTIVE_STATUSES] } }] },
    overrideAccess: true,
    req,
  })
  if (totalDocs === 0) throw new Forbidden(req.t)
  return user
}

/** Journal : chaque connexion réussie est enregistrée. */
const logLogin: CollectionAfterLoginHook = async ({ req, user }) => {
  try {
    await req.payload.create({
      collection: 'audit-logs',
      overrideAccess: true,
      req,
      context: { skipAudit: true },
      data: { action: 'login', targetCollection: 'users', documentId: String(user.id), user: user.id as number },
    })
  } catch (err) {
    req.payload.logger.error({ err }, 'Connexion non journalisée')
  }
  return user
}

/** Envoie l'e-mail d'invitation : un lien pour choisir son mot de passe (prouve aussi l'adresse). */
const sendInvitation: CollectionAfterChangeHook = async ({ req, doc, operation, context }) => {
  if (operation !== 'create' || context?.skipInvite) return doc
  if (!req.user) return doc // compte créé par un script : pas d'invitation

  const token = await req.payload.forgotPassword({
    collection: 'users',
    data: { email: doc.email },
    disableEmail: true,
    req,
  })
  const link = `${getServerURL(req)}/admin/reset/${token}`
  const inviter = escapeHTML(req.user.email ?? "l'agence")

  await req.payload.sendEmail({
    to: doc.email,
    subject: 'Votre accès à votre espace client',
    html: `
      <p>Bonjour${doc.name ? ' ' + escapeHTML(doc.name) : ''},</p>
      <p>${inviter} vous a créé un accès à l'espace de gestion de votre site internet.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#1F4E79;color:#fff;border-radius:6px;text-decoration:none">Choisir mon mot de passe</a></p>
      <p>Ce lien est valable 24 heures. Si vous n'attendiez pas cet e-mail, ignorez-le.</p>
    `,
  })
  return doc
}

// ── Collection ───────────────────────────────────────────────────────

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Utilisateur', plural: 'Utilisateurs' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'roles', 'updatedAt'],
    group: 'Agence',
  },
  auth: {
    // Verrouillage du compte après 5 échecs, pendant 10 minutes
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    // Session de 8 heures
    tokenExpiration: 8 * 60 * 60,
    cookies: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    },
    forgotPassword: {
      expiration: 24 * 60 * 60 * 1000,
      generateEmailSubject: () => 'Réinitialisation de votre mot de passe',
      generateEmailHTML: (args) => {
        const link = `${getServerURL(args?.req)}/admin/reset/${args?.token}`
        return `
          <p>Bonjour,</p>
          <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
          <p><a href="${link}">Choisir un nouveau mot de passe</a></p>
          <p>Ce lien est valable 24 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
        `
      },
    },
  },
  access: {
    read: readUsers,
    create: createUsers,
    update: updateUsers,
    delete: deleteUsers,
    // Seuls les membres connectés accèdent à l'admin, et un compte de client suspendu reste bloqué ailleurs
    admin: ({ req }) => Boolean(req.user),
  },
  hooks: {
    // Vérifié avant toute opération (le mot de passe n'est plus visible une fois haché)
    beforeOperation: [protectSharedAccounts],
    beforeValidate: [randomPasswordForInvites],
    beforeChange: [firstUserIsSuperAdmin, protectMemberships],
    beforeDelete: [protectSharedAccountsDelete],
    beforeLogin: [blockSuspendedTenants],
    afterLogin: [logLogin],
    afterChange: [sendInvitation, auditChange('users')],
    afterDelete: [auditDelete('users')],
  },
  fields: [
    { name: 'name', label: 'Prénom et nom', type: 'text', admin: { description: 'Le prénom s’affiche après « Bonjour » sur le tableau de bord.' } },
    {
      name: 'roles',
      label: 'Rôle global',
      type: 'select',
      hasMany: true,
      defaultValue: ['user'],
      required: true,
      saveToJWT: true,
      options: [
        { label: 'Super administrateur', value: 'super-admin' },
        { label: 'Utilisateur', value: 'user' },
      ],
      admin: { position: 'sidebar' },
      access: { create: superAdminField, update: superAdminField },
    },
    // Le champ « tenants » (clients + rôle par client) est ajouté par le plugin multi-tenant.
  ],
}
