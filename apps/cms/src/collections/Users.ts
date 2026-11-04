import crypto from 'crypto'
import {
  Forbidden,
  type Access,
  type CollectionAfterChangeHook,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type CollectionConfig,
  type FieldAccess,
  type Where,
} from 'payload'

import { ADMIN_ONLY, extractID, getTenantIDs, isSuperAdmin, sameID } from '@/access/roles'
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
    beforeValidate: [randomPasswordForInvites],
    beforeChange: [protectMemberships],
    afterChange: [sendInvitation, auditChange('users')],
    afterDelete: [auditDelete('users')],
  },
  fields: [
    { name: 'name', label: 'Nom', type: 'text' },
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
