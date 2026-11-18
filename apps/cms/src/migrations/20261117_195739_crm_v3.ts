import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_settings" ADD COLUMN "auto_search" boolean DEFAULT true;
  ALTER TABLE "crm_settings" ADD COLUMN "include_breeders" boolean DEFAULT false;
  ALTER TABLE "crm_settings" ADD COLUMN "max_site_checks" numeric DEFAULT 60;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_settings" DROP COLUMN "auto_search";
  ALTER TABLE "crm_settings" DROP COLUMN "include_breeders";
  ALTER TABLE "crm_settings" DROP COLUMN "max_site_checks";`)
}
