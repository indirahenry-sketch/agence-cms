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
import { Announcements } from './collections/Announcements'
import { AuditLogs } from './collections/AuditLogs'
import { Categories } from './collections/Categories'
import { Events } from './collections/Events'
import { Media } from './collections/Media'
import { Menus } from './collections/Menus'
import { Pages } from './collections/Pages'
import { Posts } from './collections/Posts'
import { Prices } from './collections/Prices'
import { Promotions } from './collections/Promotions'
import { Redirects } from './collections/Redirects'
import { Services } from './collections/Services'
import { SiteInfo } from './collections/SiteInfo'
import { SiteStats } from './collections/SiteStats'
import { SupportRequests } from './collections/SupportRequests'
import { Tags } from './collections/Tags'
import { Tenants } from './collections/Tenants'
import { Users } from './collections/Users'
import { CrmActivities } from './collections/crm/CrmActivities'
import { CrmDuplicates } from './collections/crm/CrmDuplicates'
import { CrmEmailTemplates } from './collections/crm/CrmEmailTemplates'
import { CrmTasks } from './collections/crm/CrmTasks'
import { CrmOptOuts } from './collections/crm/CrmOptOuts'
import { CrmProspects } from './collections/crm/CrmProspects'
import { CrmSearches } from './collections/crm/CrmSearches'
import { CrmZones } from './collections/crm/CrmZones'
import { startCrmScheduler } from './crm/search/scheduler'
import { ensureCrmZones } from './crm/zones'
import { CrmSettings } from './globals/CrmSettings'
import { migrations } from './migrations'
import { removeOrphans } from './hooks/tenantCleanup'
import { startKeepAwake } from './lib/keepAwake'
import { startTrashPurge } from './lib/trashPurge'
import { checkS3 } from './lib/s3-check'
import { crmCheckClosed, crmExport, crmImport, crmMergeDuplicates, crmSearch } from './endpoints/crm'
import { notifications } from './endpoints/notifications'
import { storageCheck } from './endpoints/storage'
import { readableErrors } from './hooks/readableErrors'
import { livePreviewURL } from './utilities/preview'
import { importEcuriesPoigny } from './sites/ecuries-poigny/seed'
import { importHarasMontesugui } from './sites/haras-montesugui/seed'
import { importCentreEquestreSourdun } from './sites/centre-equestre-sourdun/seed'
import { importDomaineCastelle } from './sites/domaine-equestre-castelle/seed'

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
    // Thème clair par défaut, sombre au choix (bouton soleil / lune) ; styles dans app/(payload)/custom.scss
    theme: 'all',
    importMap: { baseDir: path.resolve(dirname) },
    components: {
      beforeDashboard: ['@/components/Welcome#Welcome'],
      beforeNavLinks: ['@/components/crm/CrmNavLink#CrmNavLink'],
      afterNavLinks: ['@/components/LogoutLink#LogoutLink', '@/components/crm/CrmBackLink#CrmBackLink'],
      // Espace Prospection (CRM) : page séparée du tableau de bord des sites clients
      views: {
        prospection: { Component: '@/components/crm/CrmHome#CrmHome', path: '/prospection', exact: true },
        prospectionBase: { Component: '@/components/crm/CrmBase#CrmBase', path: '/prospection/base' },
        prospectionRelances: { Component: '@/components/crm/CrmCalendar#CrmCalendar', path: '/prospection/relances' },
        prospectionImport: { Component: '@/components/crm/CrmImport#CrmImport', path: '/prospection/import' },
        prospectionRecherche: { Component: '@/components/crm/CrmSearchPage#CrmSearchPage', path: '/prospection/recherche' },
      },
      actions: ['@/components/HeaderTools#HeaderTools'],
      providers: ['@/components/MobileBar#MobileBar', '@/components/ArticlesName#ArticlesNameNav'],
    },
    // Aperçu en direct : écran partagé formulaire / site, rechargé à chaque sauvegarde automatique
    livePreview: {
      collections: ['pages', 'posts'],
      breakpoints: [
        { label: 'Téléphone', name: 'mobile', width: 390, height: 844 },
        { label: 'Tablette', name: 'tablet', width: 820, height: 1180 },
        { label: 'Ordinateur', name: 'desktop', width: 1366, height: 860 },
      ],
      url: livePreviewURL,
    },
  },

  endpoints: [notifications, storageCheck, crmExport, crmImport, crmSearch, crmMergeDuplicates, crmCheckClosed],

  // Messages d'erreur compréhensibles au lieu de « Something went wrong »
  hooks: { afterError: [readableErrors] },

  collections: [
    // Contenus
    Posts, Media, Services, Prices, Events, SiteInfo,
    // Site
    Pages, Menus, Promotions, Redirects,
    // Organisation
    Categories, Tags,
    // Agence
    Tenants, Users, SupportRequests, Announcements, AuditLogs, SiteStats,
    // Prospection (CRM) : espace séparé, jamais rattaché à un client (hors plugin multi-tenant)
    CrmProspects, CrmActivities, CrmZones, CrmSearches, CrmDuplicates, CrmOptOuts, CrmEmailTemplates, CrmTasks,
  ],

  globals: [CrmSettings],

  // Envois de fichiers : 50 Mo maximum (photos, vidéos courtes, documents)
  upload: {
    limits: { fileSize: 50 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: 'Fichier trop lourd : 50 Mo maximum.',
  },

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

  // Au démarrage : crée les clients « Les Écuries de Poigny », « Haras de Montesugui » et « Centre Équestre de Sourdun » s'ils n'existent pas
  onInit: async (payload) => {
    if (process.env.NODE_ENV !== 'production') return
    startKeepAwake(payload)
    await removeOrphans(payload)
    startTrashPurge(payload)
    // Diagnostic du stockage photo, écrit en clair dans les logs (configuration sans les secrets + erreur exacte)
    await checkS3(payload)
    // Prospection : les 101 départements (8 actifs au lancement), créés une seule fois
    await ensureCrmZones(payload).catch((err) => payload.logger.error({ err }, 'Zones de prospection non créées'))
    // Prospection : recherche automatique chaque lundi à 9 h (heure de Paris)
    startCrmScheduler(payload)
    if (process.env.SKIP_DEMO_IMPORT === 'true') return
    try {
      await importEcuriesPoigny(payload)
    } catch (err) {
      payload.logger.error({ err }, 'Import des Écuries de Poigny impossible')
    }
    try {
      await importHarasMontesugui(payload)
    } catch (err) {
      payload.logger.error({ err }, 'Import du Haras de Montesugui impossible')
    }
    try {
      await importCentreEquestreSourdun(payload)
    } catch (err) {
      payload.logger.error({ err }, 'Import du Centre Équestre de Sourdun impossible')
    }
    try {
      await importDomaineCastelle(payload)
    } catch (err) {
      payload.logger.error({ err }, 'Import du Domaine Équestre de la Castelle impossible')
    }
  },

  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },

  plugins: [
    multiTenantPlugin({
      tenantsSlug: 'tenants',
      // Remplacé par hooks/tenantCleanup.ts, qui supprime les contenus AVANT la fiche client
      cleanupAfterTenantDelete: false,
      // Collections dont chaque document appartient à un client
      collections: {
        media: {},
        categories: {},
        events: {},
        prices: {},
        pages: {},
        posts: {},
        services: {},
        menus: {},
        promotions: {},
        redirects: {},
        'site-stats': {},
        tags: {},
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
              { label: 'Éditeur (modifie et publie)', value: 'editor' },
              { label: 'Rédacteur (brouillons, sans publier)', value: 'writer' },
              { label: 'Lecteur (consultation seule)', value: 'viewer' },
            ],
          },
        ],
      },
      userHasAccessToAllTenants: (user) => isSuperAdmin(user),
      // La liste « Clients » montre toujours tous les clients, même quand un client est choisi dans le sélecteur
      useTenantsListFilter: false,
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
