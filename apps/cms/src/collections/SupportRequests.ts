import type { Access, CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, FieldAccess } from 'payload'

import { ALL_TENANT_ROLES, isSuperAdmin } from '@/access/roles'
import { superAdminOnly, tenantCreate, tenantRead } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'
import { escapeHTML, getServerURL } from '@/utilities/serverURL'

const TYPES = [
  { label: 'Signaler un bug ou un problème', value: 'bug' },
  { label: 'Être rappelé', value: 'callback' },
  { label: 'Poser une question', value: 'question' },
  { label: 'Demande commerciale', value: 'commercial' },
]

const superAdminField: FieldAccess = ({ req }) => isSuperAdmin(req.user)

const setRequester: CollectionBeforeChangeHook = ({ req, data, operation }) => {
  if (operation === 'create' && req.user) {
    data.requester = req.user.id
    if (!isSuperAdmin(req.user)) data.status = 'new'
  }
  return data
}

/** Prévient l'agence par e-mail à chaque nouvelle demande. */
const notifyAgency: CollectionAfterChangeHook = async ({ req, doc, operation }) => {
  if (operation !== 'create' || !process.env.AGENCY_EMAIL) return doc
  const type = TYPES.find((t) => t.value === doc.type)?.label ?? doc.type
  const link = `${getServerURL(req)}/admin/collections/support-requests/${doc.id}`
  try {
    await req.payload.sendEmail({
      to: process.env.AGENCY_EMAIL,
      subject: `[Support] ${type} : ${doc.subject}`,
      html: `
        <p><strong>${escapeHTML(type)}</strong> de ${escapeHTML(req.user?.email ?? 'inconnu')}</p>
        ${doc.phone ? `<p>Téléphone : ${escapeHTML(doc.phone)}</p>` : ''}
        <p>${escapeHTML(doc.message ?? '').replace(/\n/g, '<br>')}</p>
        <p><a href="${link}">Voir la demande dans le CMS</a></p>
      `,
    })
  } catch (error) {
    // La demande est enregistrée même si l'e-mail échoue
    req.payload.logger.error({ err: error, msg: 'E-mail de support non envoyé' })
  }
  return doc
}

/** La capture d'écran jointe à une demande reste privée : jamais servie sur le site public. */
const keepScreenshotPrivate: CollectionAfterChangeHook = async ({ req, doc }) => {
  const id = typeof doc.screenshot === 'object' && doc.screenshot ? doc.screenshot.id : doc.screenshot
  if (id) await req.payload.update({ collection: 'media', id, data: { isPublic: false, inGallery: false }, overrideAccess: true, req, context: { skipAudit: true } })
  return doc
}

const updateOnlyAgency: Access = superAdminOnly

export const SupportRequests: CollectionConfig = {
  slug: 'support-requests',
  labels: { singular: 'Demande au support', plural: 'Support' },
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['subject', 'type', 'status', 'createdAt'],
    group: 'Agence',
    description: 'Un bug, une question, besoin d’être rappelé ? Écrivez-nous ici.',
  },
  access: {
    read: tenantRead,
    create: tenantCreate(ALL_TENANT_ROLES),
    update: updateOnlyAgency,
    delete: superAdminOnly,
  },
  hooks: {
    beforeChange: [enforceTenant(ALL_TENANT_ROLES), setRequester],
    afterChange: [keepScreenshotPrivate, notifyAgency, auditChange('support-requests')],
    afterDelete: [auditDelete('support-requests')],
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'type', label: 'Type de demande', type: 'select', options: TYPES, required: true, defaultValue: 'bug' },
    { name: 'subject', label: 'Sujet', type: 'text', required: true },
    { name: 'message', label: 'Message', type: 'textarea', required: true },
    {
      name: 'phone',
      label: 'Téléphone pour vous rappeler',
      type: 'text',
      admin: { condition: (data) => data?.type === 'callback' },
    },
    { name: 'screenshot', label: 'Capture d’écran (facultatif)', type: 'upload', relationTo: 'media' },
    {
      name: 'status',
      label: 'Statut',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'Reçue', value: 'new' },
        { label: 'En cours', value: 'in-progress' },
        { label: 'Résolue', value: 'resolved' },
      ],
      // Le client ne voit pas ce champ en créant sa demande ; il le voit ensuite pour suivre son traitement
      admin: { position: 'sidebar', condition: (data, _sibling, { user }) => isSuperAdmin(user) || Boolean(data?.id) },
      access: { update: superAdminField },
    },
    {
      name: 'reply',
      label: 'Réponse de l’agence',
      type: 'textarea',
      admin: { position: 'sidebar', condition: (data, _sibling, { user }) => isSuperAdmin(user) || Boolean(data?.reply) },
      access: { update: superAdminField, create: superAdminField },
    },
    {
      name: 'repliedAt',
      label: 'Répondu le',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.repliedAt) },
      hooks: {
        beforeChange: [({ siblingData, originalDoc, value }) => (siblingData.reply && siblingData.reply !== originalDoc?.reply ? new Date().toISOString() : value)],
      },
    },
    {
      name: 'requester',
      label: 'Demandée par',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar', readOnly: true, condition: (data) => Boolean(data?.id) },
    },
  ],
}
