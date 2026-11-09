import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_announcements_tone" AS ENUM('news', 'offer', 'info', 'warning');
  CREATE TYPE "public"."enum_announcements_audience" AS ENUM('all', 'tenants');
  CREATE TABLE "announcements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tone" "enum_announcements_tone" DEFAULT 'news' NOT NULL,
  	"active" boolean DEFAULT true,
  	"title" varchar NOT NULL,
  	"text" varchar,
  	"button_label" varchar,
  	"button_url" varchar,
  	"audience" "enum_announcements_audience" DEFAULT 'all' NOT NULL,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "announcements_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tenants_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "announcements_id" integer;
  ALTER TABLE "announcements_rels" ADD CONSTRAINT "announcements_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "announcements_rels" ADD CONSTRAINT "announcements_rels_tenants_fk" FOREIGN KEY ("tenants_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "announcements_updated_at_idx" ON "announcements" USING btree ("updated_at");
  CREATE INDEX "announcements_created_at_idx" ON "announcements" USING btree ("created_at");
  CREATE INDEX "announcements_rels_order_idx" ON "announcements_rels" USING btree ("order");
  CREATE INDEX "announcements_rels_parent_idx" ON "announcements_rels" USING btree ("parent_id");
  CREATE INDEX "announcements_rels_path_idx" ON "announcements_rels" USING btree ("path");
  CREATE INDEX "announcements_rels_tenants_id_idx" ON "announcements_rels" USING btree ("tenants_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_announcements_fk" FOREIGN KEY ("announcements_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_announcements_id_idx" ON "payload_locked_documents_rels" USING btree ("announcements_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "announcements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "announcements_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "announcements" CASCADE;
  DROP TABLE "announcements_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_announcements_fk";
  
  DROP INDEX "payload_locked_documents_rels_announcements_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "announcements_id";
  DROP TYPE "public"."enum_announcements_tone";
  DROP TYPE "public"."enum_announcements_audience";`)
}
