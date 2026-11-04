import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { fr } from '@payloadcms/translations/languages/fr'
import path from 'path'
import { buildConfig, type FieldAccess } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { ADMIN_ONLY, getTenantIDs, isSuperAdmin } from './access/roles'
import { AuditLogs } from './collections/AuditLogs'
import { Categories } from './collections/Categories'
import { Events } from './collections/Events'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Prices } from './collections/Prices'
import { SiteInfo } from './collections/SiteInfo'
import { SupportRequests } from './collections/SupportRequests'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { migrations } from './migrations'

const dirname = path.dirname(fileURLToPath(import.meta.url))

if (!process.env.PAYLOAD_SECRET) {
  throw new Error('PAYLOAD_SECRET manquant : copie apps/cms/.env.example en apps/cms/.env et remplis-le.')
}

/** Seuls le super admin et l'admin client peuvent modifier la liste des clients d'un utilisateur. */
const canManageMemberships: FieldAccess = ({ req }) =>
  isSuperAdmin(req.user) || getTenantIDs(req.user, ADMIN_ONLY).length > 0

export default buildConfig({
  serverURL: process.env.PUBLIC_SERVER_URL || '',
  secret: process.env.PAYLOAD_SECRET,

  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · Espace de gestion' },
    importMap: { baseDir: path.resolve(dirname) },
    components: {
      beforeDashboard: ['@/components/Welcome#Welcome'],
    },
  },

  collections: [Tenants, Users, Media, Categories, Events, Prices, Pages, Posts, SiteInfo, SupportRequests, AuditLogs],

  // Langues du CONTENU des sites (français par défaut, anglais en second)
  localization: {
    locales: [
      { label: 'Français', code: 'fr' },
      { label: 'English', code: 'en' },
    ],
    defaultLocale: 'fr',
    fallback: true,
  },

  // Langue de l'INTERFACE d'administration
  i18n: {
    supportedLanguages: { fr, en },
    fallbackLanguage: 'fr',
  },

  editor: lexicalEditor(),

  // ── Base de données : PostgreSQL standard (Docker en dev, Supabase puis ton serveur en prod) ──
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI },
    migrationDir: path.resolve(dirname, 'migrations'),
    // En production, le schéma n'évolue QUE par les fichiers de migration (versionnés dans Git)
    push: process.env.NODE_ENV !== 'production' && process.env.DB_PUSH !== 'false',
    prodMigrations: migrations,
  }),

  // ── E-mails : SMTP standard (Mailpit en dev, Brevo en prod). Sans SMTP_HOST, ils s'affichent dans la console. ──
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
        defaultFromName: process.env.EMAIL_FROM_NAME || 'Espace de gestion',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        },
      })
    : undefined,

  sharp,

  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },

  plugins: [
    multiTenantPlugin({
      tenantsSlug: 'tenants',
      // Collections dont chaque document appartient à un client
      collections: {
        media: {},
        categories: {},
        events: {},
        prices: {},
        pages: {},
        posts: {},
        'site-info': { isGlobal: true },
        'support-requests': {},
      },
      // Liste « clients + rôle par client » sur chaque utilisateur
      tenantsArrayField: {
        includeDefaultField: true,
        arrayFieldAccess: { create: canManageMemberships, update: canManageMemberships },
        rowFields: [
          {
            name: 'roles',
            label: 'Rôle dans ce client',
            type: 'select',
            hasMany: true,
            required: true,
            defaultValue: ['editor'],
            options: [
              { label: 'Administrateur client', value: 'tenant-admin' },
              { label: 'Éditeur', value: 'editor' },
            ],
          },
        ],
      },
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
      tenantSelectorLabel: { fr: 'Client', en: 'Client' },
    }),

    // ── Fichiers : protocole S3 standard (MinIO en dev, Cloudflare R2 en prod, MinIO sur ton serveur plus tard) ──
    s3Storage({
      enabled: Boolean(process.env.S3_BUCKET),
      collections: { media: true },
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'auto',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],
})
