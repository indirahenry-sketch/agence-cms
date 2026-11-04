import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { importEcuriesPoigny } from '../sites/ecuries-poigny/seed'

/**
 * Données (pas de changement de structure) : crée le client « Les Écuries de Poigny »
 * avec le contenu de la maquette V10, pour tester le site branché sur le CMS.
 * Ne fait rien si le client existe déjà.
 */
export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  await importEcuriesPoigny(payload, req)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Volontairement vide : on ne supprime jamais les données d'un client par une migration.
}
