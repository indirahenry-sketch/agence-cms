import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
import { generateNKeysBetween } from 'payload/shared'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tenants_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "posts" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "media" ADD COLUMN "_order" varchar;
  ALTER TABLE "media" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "services" ADD COLUMN "_order" varchar;
  ALTER TABLE "services" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "prices" ADD COLUMN "_order" varchar;
  ALTER TABLE "prices" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "events" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "pages" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_deleted_at" timestamp(3) with time zone;
  ALTER TABLE "menus" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "promotions" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "tenants" ADD COLUMN "maintenance" boolean DEFAULT false;
  ALTER TABLE "support_requests" ADD COLUMN "reply" varchar;
  ALTER TABLE "support_requests" ADD COLUMN "replied_at" timestamp(3) with time zone;
  ALTER TABLE "tenants_texts" ADD CONSTRAINT "tenants_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tenants_texts_order_parent" ON "tenants_texts" USING btree ("order","parent_id");
  CREATE INDEX "posts_deleted_at_idx" ON "posts" USING btree ("deleted_at");
  CREATE INDEX "_posts_v_version_version_deleted_at_idx" ON "_posts_v" USING btree ("version_deleted_at");
  CREATE INDEX "media__order_idx" ON "media" USING btree ("_order");
  CREATE INDEX "media_deleted_at_idx" ON "media" USING btree ("deleted_at");
  CREATE INDEX "services__order_idx" ON "services" USING btree ("_order");
  CREATE INDEX "services_deleted_at_idx" ON "services" USING btree ("deleted_at");
  CREATE INDEX "prices__order_idx" ON "prices" USING btree ("_order");
  CREATE INDEX "prices_deleted_at_idx" ON "prices" USING btree ("deleted_at");
  CREATE INDEX "events_deleted_at_idx" ON "events" USING btree ("deleted_at");
  CREATE INDEX "pages_deleted_at_idx" ON "pages" USING btree ("deleted_at");
  CREATE INDEX "_pages_v_version_version_deleted_at_idx" ON "_pages_v" USING btree ("version_deleted_at");
  CREATE INDEX "menus_deleted_at_idx" ON "menus" USING btree ("deleted_at");
  CREATE INDEX "promotions_deleted_at_idx" ON "promotions" USING btree ("deleted_at");`)

  // Ordre « glisser-déposer » des contenus existants : on reprend l'ordre actuel du site
  // (champ « ordre » pour tarifs et services, date d'ajout pour les photos).
  const backfill = [
    ['prices', sql`SELECT id FROM "prices" WHERE "_order" IS NULL ORDER BY "tenant_id", "order", "id"`],
    ['services', sql`SELECT id FROM "services" WHERE "_order" IS NULL ORDER BY "tenant_id", "order", "id"`],
    ['media', sql`SELECT id FROM "media" WHERE "_order" IS NULL ORDER BY "created_at", "id"`],
  ] as const
  for (const [table, query] of backfill) {
    const { rows } = (await db.execute(query)) as unknown as { rows: { id: number }[] }
    if (!rows.length) continue
    const keys = generateNKeysBetween(null, null, rows.length)
    for (const [i, row] of rows.entries()) {
      await db.execute(sql`UPDATE ${sql.identifier(table)} SET "_order" = ${keys[i]} WHERE "id" = ${row.id}`)
    }
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tenants_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tenants_texts" CASCADE;
  DROP INDEX "posts_deleted_at_idx";
  DROP INDEX "_posts_v_version_version_deleted_at_idx";
  DROP INDEX "media__order_idx";
  DROP INDEX "media_deleted_at_idx";
  DROP INDEX "services__order_idx";
  DROP INDEX "services_deleted_at_idx";
  DROP INDEX "prices__order_idx";
  DROP INDEX "prices_deleted_at_idx";
  DROP INDEX "events_deleted_at_idx";
  DROP INDEX "pages_deleted_at_idx";
  DROP INDEX "_pages_v_version_version_deleted_at_idx";
  DROP INDEX "menus_deleted_at_idx";
  DROP INDEX "promotions_deleted_at_idx";
  ALTER TABLE "posts" DROP COLUMN "deleted_at";
  ALTER TABLE "_posts_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "media" DROP COLUMN "_order";
  ALTER TABLE "media" DROP COLUMN "deleted_at";
  ALTER TABLE "services" DROP COLUMN "_order";
  ALTER TABLE "services" DROP COLUMN "deleted_at";
  ALTER TABLE "prices" DROP COLUMN "_order";
  ALTER TABLE "prices" DROP COLUMN "deleted_at";
  ALTER TABLE "events" DROP COLUMN "deleted_at";
  ALTER TABLE "pages" DROP COLUMN "deleted_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_deleted_at";
  ALTER TABLE "menus" DROP COLUMN "deleted_at";
  ALTER TABLE "promotions" DROP COLUMN "deleted_at";
  ALTER TABLE "tenants" DROP COLUMN "maintenance";
  ALTER TABLE "support_requests" DROP COLUMN "reply";
  ALTER TABLE "support_requests" DROP COLUMN "replied_at";`)
}
