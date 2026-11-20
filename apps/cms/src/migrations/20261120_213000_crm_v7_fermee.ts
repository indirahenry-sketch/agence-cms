import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Prospection v7 : statut « N'existe plus (fermée) » pour les entreprises qui ont cessé. */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_prospects_status" ADD VALUE IF NOT EXISTS 'ferme';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Une valeur d'énumération ne se retire pas simplement en PostgreSQL : les fiches « fermées »
  // repassent en « Non intéressé » et la valeur reste déclarée (sans effet).
  await db.execute(sql`
   UPDATE "crm_prospects" SET "status" = 'non-interesse' WHERE "status" = 'ferme';`)
}
