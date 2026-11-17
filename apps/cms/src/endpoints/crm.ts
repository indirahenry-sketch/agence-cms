import { APIError, type Endpoint, type PayloadRequest } from 'payload'

import { canUseCrm } from '@/crm/access'
import { decodeCsv, parseCsv, toCsv } from '@/crm/csv'
import { EXPORT_COLUMNS, importProspects, MAX_IMPORT_ROWS } from '@/crm/importExport'
import { isSearchRunning, runCrmSearch } from '@/crm/search/run'

/**
 * Prospection (super admin uniquement) :
 * - GET  /api/crm-export           → tous les prospects en CSV (Excel / Google Sheets)
 * - GET  /api/crm-export?modele=1  → fichier modèle vide, avec les bons intitulés
 * - POST /api/crm-import[?apercu=1] → corps = le fichier CSV ; aperçu = rien n'est enregistré
 *
 * Le fichier exporté contient des données personnelles : il se télécharge, il ne va jamais sur GitHub.
 */

const guard = (req: PayloadRequest) => {
  if (!canUseCrm(req.user)) throw new APIError('Réservé à l’agence.', 403, undefined, true)
}

const MAX_BYTES = 2 * 1024 * 1024

export const crmExport: Endpoint = {
  path: '/crm-export',
  method: 'get',
  handler: async (req) => {
    guard(req)
    const header = EXPORT_COLUMNS.map((c) => c.header)
    const modele = req.searchParams?.get('modele') === '1'
    const rows = modele
      ? []
      : (
          await req.payload.find({
            collection: 'crm-prospects',
            limit: 0,
            pagination: false,
            depth: 1,
            sort: 'name',
            overrideAccess: true,
            req,
          })
        ).docs.map((p) => EXPORT_COLUMNS.map((c) => c.get(p)))
    const day = new Date().toISOString().slice(0, 10)
    return new Response(toCsv(header, rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${modele ? 'modele-prospects' : `prospects-${day}`}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  },
}

export const crmImport: Endpoint = {
  path: '/crm-import',
  method: 'post',
  handler: async (req) => {
    guard(req)
    if (typeof req.arrayBuffer !== 'function') throw new APIError('Fichier manquant.', 400, undefined, true)
    const bytes = await req.arrayBuffer()
    if (!bytes.byteLength) throw new APIError('Le fichier est vide.', 400, undefined, true)
    if (bytes.byteLength > MAX_BYTES) throw new APIError('Fichier trop lourd (2 Mo maximum).', 413, undefined, true)
    const rows = parseCsv(decodeCsv(bytes))
    if (rows.length - 1 > MAX_IMPORT_ROWS) {
      throw new APIError(`Trop de lignes (${rows.length - 1}). Maximum ${MAX_IMPORT_ROWS} par fichier : coupez-le en plusieurs.`, 413, undefined, true)
    }
    const dryRun = req.searchParams?.get('apercu') === '1'
    const report = await importProspects(req.payload, rows, { dryRun, req })
    return Response.json(report)
  },
}

/**
 * POST /api/crm-search  { zoneIds?: number[], target?: number }
 * Lance une recherche en arrière-plan (elle dure quelques minutes) et répond tout de suite.
 * Le résultat apparaît dans « Historique des recherches ».
 */
export const crmSearch: Endpoint = {
  path: '/crm-search',
  method: 'post',
  handler: async (req) => {
    guard(req)
    if (isSearchRunning()) throw new APIError('Une recherche est déjà en cours. Attends qu’elle se termine.', 409, undefined, true)
    const body = ((typeof req.json === 'function' ? await req.json().catch(() => ({})) : {}) ?? {}) as { zoneIds?: unknown; target?: unknown }
    const zoneIds = Array.isArray(body.zoneIds) ? body.zoneIds.map(Number).filter((n) => Number.isInteger(n) && n > 0) : undefined
    const target = body.target === undefined || body.target === null || body.target === '' ? undefined : Number(body.target)
    if (target !== undefined && (!Number.isInteger(target) || target < 1 || target > 1000)) {
      throw new APIError('Nombre de prospects invalide (entre 1 et 1000).', 400, undefined, true)
    }
    const payload = req.payload
    void runCrmSearch(payload, { trigger: 'manuel', zoneIds, target }).catch(() => {}) // erreur notée dans l'historique
    return Response.json({ started: true }, { status: 202 })
  },
}
