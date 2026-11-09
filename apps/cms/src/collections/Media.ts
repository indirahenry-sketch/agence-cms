import crypto from 'crypto'
import path from 'path'
import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

import { categoriesOfType } from './Categories'

/**
 * Remplace le nom du fichier envoyé par un nom aléatoire :
 * impossible de deviner l'adresse d'une image d'un autre client.
 */
const randomFilename: CollectionBeforeOperationHook = ({ operation, req }) => {
  if ((operation === 'create' || operation === 'update') && req.file) {
    const ext = path.extname(req.file.name).toLowerCase().replace(/[^.a-z0-9]/g, '')
    req.file.name = `${crypto.randomUUID()}${ext}`
  }
}

export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Média', plural: 'Médiathèque' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['filename', 'title', 'mimeType', 'category', 'inGallery'],
    group: 'Contenus',
    description: 'Photos, vidéos (MP4, WebM, MOV) et documents (PDF, Word, Excel, PowerPoint). 50 Mo maximum par fichier.',
    components: { beforeListTable: ['@/components/MediaGrid#MediaGrid'] },
  },
  // Ordre de la galerie par glisser-déposer, corbeille de 30 jours
  orderable: true,
  trash: true,
  access: tenantCollectionAccess(),
  hooks: {
    beforeOperation: [randomFilename],
    beforeChange: [enforceTenant()],
    afterChange: [auditChange('media')],
    afterDelete: [auditDelete('media')],
  },
  upload: {
    // Sans stockage S3 (S3_BUCKET vide), les fichiers vont dans ce dossier du serveur
    staticDir: process.env.MEDIA_DIR || path.resolve(process.cwd(), 'media'),
    // Le type réel du fichier est vérifié (un fichier déguisé est refusé). Pas de SVG : il peut contenir du code.
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
    ],
    // Versions redimensionnées générées automatiquement
    imageSizes: [
      // Recadrées autour du point focal choisi par le client (le point important reste visible)
      { name: 'thumbnail', width: 400, height: 300 },
      { name: 'card', width: 800 },
      { name: 'hero', width: 1920 },
    ],
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    // Recadrer et tourner l'image sans quitter le CMS
    crop: true,
    // Envoi de plusieurs fichiers à la fois (glisser-déposer)
    bulkUpload: true,
  },
  fields: [
    { name: 'alt', label: 'Texte alternatif (accessibilité)', type: 'text', localized: true, required: true },
    { name: 'title', label: 'Titre', type: 'text', localized: true },
    { name: 'description', label: 'Description', type: 'textarea', localized: true },
    {
      type: 'row',
      fields: [
        { name: 'category', label: 'Catégorie', type: 'relationship', relationTo: 'categories', filterOptions: categoriesOfType('gallery') },
        { name: 'tags', label: 'Tags', type: 'relationship', relationTo: 'tags', hasMany: true },
      ],
    },
    {
      name: 'isPublic',
      label: 'Utilisable sur le site public',
      type: 'checkbox',
      defaultValue: true,
      admin: { position: 'sidebar', description: 'Décochez pour un fichier interne (il ne sera jamais affiché sur le site).' },
    },
    {
      name: 'inGallery',
      label: 'Afficher dans la galerie du site',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
  ],
}
