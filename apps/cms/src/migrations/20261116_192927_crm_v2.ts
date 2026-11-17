import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_prospects_project_status" AS ENUM('a-faire', 'en-cours', 'en-livraison', 'livre');
  ALTER TABLE "crm_prospects" ADD COLUMN "project_status" "enum_crm_prospects_project_status";
  CREATE INDEX "crm_prospects_project_status_idx" ON "crm_prospects" USING btree ("project_status");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "crm_prospects_project_status_idx";
  ALTER TABLE "crm_prospects" DROP COLUMN "project_status";
  DROP TYPE "public"."enum_crm_prospects_project_status";`)
}
