import type { Endpoint } from 'payload'

import { isSuperAdmin } from '@/access/roles'
import { checkS3, getStorageStatus } from '@/lib/s3-check'
import { importEcuriesPoigny } from '@/sites/ecuries-poigny/seed'

/**
 * POST /api/storage-check (agence uniquement) : refait le test du stockage photo
 * et, s'il passe, relance l'import des photos du site de démonstration (seules les manquantes sont envoyées).
 */
export const storageCheck: Endpoint = {
  path: '/storage-check',
  method: 'post',
  handler: async (req) => {
    if (!isSuperAdmin(req.user)) return Response.json({ message: 'Réservé à l’agence.' }, { status: 403 })
    const ok = await checkS3(req.payload)
    let imported = false
    if (ok && process.env.SKIP_DEMO_IMPORT !== 'true') {
      try {
        await importEcuriesPoigny(req.payload)
        imported = true
      } catch (err) {
        req.payload.logger.error({ err }, 'Import des Écuries de Poigny impossible')
      }
    }
    return Response.json({ status: getStorageStatus(), imported })
  },
}
