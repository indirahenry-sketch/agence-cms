import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** V8 : téléphone fixe (facultatif) dans la fiche client et les Informations. (media._objectkey, géré par le stockage S3, laissé de côté.) */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_info" ADD COLUMN "landline" varchar;
  ALTER TABLE "tenants" ADD COLUMN "landline" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "site_info" DROP COLUMN "landline";
  ALTER TABLE "tenants" DROP COLUMN "landline";`)
}
