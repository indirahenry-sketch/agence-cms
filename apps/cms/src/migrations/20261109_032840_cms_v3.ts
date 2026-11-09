import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_redirects_type" AS ENUM('301', '302');
  ALTER TYPE "public"."enum_menus_items_children_anchor" ADD VALUE 'actualites' BEFORE 'contact';
  ALTER TYPE "public"."enum_menus_items_anchor" ADD VALUE 'actualites' BEFORE 'contact';
  ALTER TYPE "public"."enum_tenants_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_users_tenants_roles" ADD VALUE 'writer';
  ALTER TYPE "public"."enum_users_tenants_roles" ADD VALUE 'viewer';
  CREATE TABLE "redirects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"from" varchar NOT NULL,
  	"to" varchar NOT NULL,
  	"type" "enum_redirects_type" DEFAULT '301',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tenants_locales" (
  	"tagline" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "site_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"day" varchar NOT NULL,
  	"path" varchar NOT NULL,
  	"source" varchar DEFAULT 'direct',
  	"views" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "_posts_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "_pages_v" ADD COLUMN "autosave" boolean;
  ALTER TABLE "tenants" ADD COLUMN "indexable" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "redirects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "site_stats_id" integer;
  ALTER TABLE "redirects" ADD CONSTRAINT "redirects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tenants_locales" ADD CONSTRAINT "tenants_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_stats" ADD CONSTRAINT "site_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "redirects_tenant_idx" ON "redirects" USING btree ("tenant_id");
  CREATE INDEX "redirects_from_idx" ON "redirects" USING btree ("from");
  CREATE INDEX "redirects_updated_at_idx" ON "redirects" USING btree ("updated_at");
  CREATE INDEX "redirects_created_at_idx" ON "redirects" USING btree ("created_at");
  CREATE UNIQUE INDEX "tenants_locales_locale_parent_id_unique" ON "tenants_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tenants_locales_parent_id_idx" ON "tenants_locales" USING btree ("_parent_id");
  CREATE INDEX "site_stats_tenant_idx" ON "site_stats" USING btree ("tenant_id");
  CREATE INDEX "site_stats_day_idx" ON "site_stats" USING btree ("day");
  CREATE INDEX "site_stats_updated_at_idx" ON "site_stats" USING btree ("updated_at");
  CREATE INDEX "site_stats_created_at_idx" ON "site_stats" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_redirects_fk" FOREIGN KEY ("redirects_id") REFERENCES "public"."redirects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_site_stats_fk" FOREIGN KEY ("site_stats_id") REFERENCES "public"."site_stats"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_posts_v_autosave_idx" ON "_posts_v" USING btree ("autosave");
  CREATE INDEX "_pages_v_autosave_idx" ON "_pages_v" USING btree ("autosave");
  CREATE INDEX "payload_locked_documents_rels_redirects_id_idx" ON "payload_locked_documents_rels" USING btree ("redirects_id");
  CREATE INDEX "payload_locked_documents_rels_site_stats_id_idx" ON "payload_locked_documents_rels" USING btree ("site_stats_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "redirects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tenants_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "redirects" CASCADE;
  DROP TABLE "tenants_locales" CASCADE;
  DROP TABLE "site_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_redirects_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_site_stats_fk";
  
  ALTER TABLE "menus_items_children" ALTER COLUMN "anchor" SET DATA TYPE text;
  DROP TYPE "public"."enum_menus_items_children_anchor";
  CREATE TYPE "public"."enum_menus_items_children_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'contact');
  ALTER TABLE "menus_items_children" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_menus_items_children_anchor" USING "anchor"::"public"."enum_menus_items_children_anchor";
  ALTER TABLE "menus_items" ALTER COLUMN "anchor" SET DATA TYPE text;
  DROP TYPE "public"."enum_menus_items_anchor";
  CREATE TYPE "public"."enum_menus_items_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'contact');
  ALTER TABLE "menus_items" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_menus_items_anchor" USING "anchor"::"public"."enum_menus_items_anchor";
  ALTER TABLE "tenants" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "tenants" ALTER COLUMN "status" SET DEFAULT 'active'::text;
  DROP TYPE "public"."enum_tenants_status";
  CREATE TYPE "public"."enum_tenants_status" AS ENUM('active', 'suspended');
  ALTER TABLE "tenants" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."enum_tenants_status";
  ALTER TABLE "tenants" ALTER COLUMN "status" SET DATA TYPE "public"."enum_tenants_status" USING "status"::"public"."enum_tenants_status";
  ALTER TABLE "users_tenants_roles" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_tenants_roles";
  CREATE TYPE "public"."enum_users_tenants_roles" AS ENUM('tenant-admin', 'editor');
  ALTER TABLE "users_tenants_roles" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_tenants_roles" USING "value"::"public"."enum_users_tenants_roles";
  DROP INDEX "_posts_v_autosave_idx";
  DROP INDEX "_pages_v_autosave_idx";
  DROP INDEX "payload_locked_documents_rels_redirects_id_idx";
  DROP INDEX "payload_locked_documents_rels_site_stats_id_idx";
  ALTER TABLE "_posts_v" DROP COLUMN "autosave";
  ALTER TABLE "_pages_v" DROP COLUMN "autosave";
  ALTER TABLE "tenants" DROP COLUMN "indexable";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "redirects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "site_stats_id";
  DROP TYPE "public"."enum_redirects_type";`)
}
