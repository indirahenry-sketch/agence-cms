import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * Ancienne migration de données, gardée vide pour l'historique.
 * L'import des Écuries de Poigny se fait désormais au démarrage (onInit de payload.config.ts),
 * hors transaction de migration, pour qu'un échec d'envoi de photo n'annule pas la fiche.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
