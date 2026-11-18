import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_prospects" ADD COLUMN "other_names" varchar;
  ALTER TABLE "crm_prospects" ADD COLUMN "alt_name_key" varchar;
  ALTER TABLE "crm_settings" ADD COLUMN "only_reachable" boolean DEFAULT true;
  CREATE INDEX "crm_prospects_alt_name_key_idx" ON "crm_prospects" USING btree ("alt_name_key");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "crm_prospects_alt_name_key_idx";
  ALTER TABLE "crm_prospects" DROP COLUMN "other_names";
  ALTER TABLE "crm_prospects" DROP COLUMN "alt_name_key";
  ALTER TABLE "crm_settings" DROP COLUMN "only_reachable";`)
}
