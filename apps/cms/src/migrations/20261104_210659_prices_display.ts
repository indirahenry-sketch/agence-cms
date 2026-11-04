import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "prices" ADD COLUMN "highlight" boolean DEFAULT false;
  ALTER TABLE "prices_locales" ADD COLUMN "display_price" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "prices" DROP COLUMN "highlight";
  ALTER TABLE "prices_locales" DROP COLUMN "display_price";`)
}
