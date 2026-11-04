import crypto from 'crypto'
import path from 'path'
import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'

import { tenantCollectionAccess } from '@/access/tenantAccess'
import { auditChange, auditDelete } from '@/hooks/audit'
import { enforceTenant } from '@/hooks/enforceTenant'

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
  labels: { singular: 'Média', plural: 'Médias (photos)' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['filename', 'title', 'category', 'inGallery'],
    group: 'Contenus',
  },
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
    mimeTypes: ['image/*', 'application/pdf'],
    // Versions redimensionnées générées automatiquement
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800 },
      { name: 'hero', width: 1920 },
    ],
    adminThumbnail: 'thumbnail',
    focalPoint: true,
  },
  fields: [
    { name: 'alt', label: 'Texte alternatif (accessibilité)', type: 'text', localized: true, required: true },
    { name: 'title', label: 'Titre', type: 'text', localized: true },
    { name: 'description', label: 'Description', type: 'textarea', localized: true },
    { name: 'category', label: 'Catégorie', type: 'relationship', relationTo: 'categories' },
    {
      name: 'inGallery',
      label: 'Afficher dans la galerie du site',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar' },
    },
  ],
}
