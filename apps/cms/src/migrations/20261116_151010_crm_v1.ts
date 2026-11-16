import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_prospects_type" AS ENUM('ecurie', 'ecurie-proprietaires', 'elevage', 'haras', 'centre-equestre', 'poney-club', 'domaine-equestre', 'structure-independante', 'autre');
  CREATE TYPE "public"."enum_crm_prospects_status" AS ENUM('nouveau', 'a-verifier', 'qualifie', 'email-a-preparer', 'brouillon-cree', 'email-envoye', 'en-attente', 'relance', 'client', 'non-interesse', 'ne-plus-contacter');
  CREATE TYPE "public"."enum_crm_prospects_priority" AS ENUM('haute', 'moyenne', 'basse');
  CREATE TYPE "public"."enum_crm_prospects_need" AS ENUM('creation', 'refonte', 'a-determiner');
  CREATE TYPE "public"."enum_crm_prospects_verification_level" AS ENUM('verifie', 'partiel', 'a-verifier');
  CREATE TYPE "public"."enum_crm_prospects_phone_level" AS ENUM('verifie', 'a-verifier', 'non-trouve');
  CREATE TYPE "public"."enum_crm_prospects_email_level" AS ENUM('verifie', 'a-verifier', 'non-trouve');
  CREATE TYPE "public"."enum_crm_prospects_website_status" AS ENUM('sans-site', 'site-existant', 'a-verifier');
  CREATE TYPE "public"."enum_crm_activities_kind" AS ENUM('note', 'appel', 'email-envoye', 'reponse', 'relance', 'rdv', 'autre');
  CREATE TYPE "public"."enum_crm_zones_kind" AS ENUM('departement', 'pays', 'autre');
  CREATE TYPE "public"."enum_crm_searches_trigger" AS ENUM('manuel', 'planifie', 'import');
  CREATE TYPE "public"."enum_crm_searches_status" AS ENUM('en-cours', 'terminee', 'echouee');
  CREATE TYPE "public"."enum_crm_duplicates_reasons" AS ENUM('nom-commune', 'telephone', 'email', 'site', 'siren');
  CREATE TYPE "public"."enum_crm_duplicates_status" AS ENUM('a-examiner', 'doublon', 'pas-doublon');
  CREATE TABLE "crm_prospects_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar,
  	"checked_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "crm_prospects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_crm_prospects_type",
  	"status" "enum_crm_prospects_status" DEFAULT 'nouveau' NOT NULL,
  	"priority" "enum_crm_prospects_priority" DEFAULT 'moyenne',
  	"commune" varchar,
  	"department_id" integer,
  	"address" varchar,
  	"postal_code" varchar,
  	"need" "enum_crm_prospects_need" DEFAULT 'a-determiner',
  	"verification_level" "enum_crm_prospects_verification_level" DEFAULT 'a-verifier',
  	"notes" varchar,
  	"phone" varchar,
  	"phone_level" "enum_crm_prospects_phone_level" DEFAULT 'non-trouve',
  	"email" varchar,
  	"email_level" "enum_crm_prospects_email_level" DEFAULT 'non-trouve',
  	"website" varchar,
  	"website_status" "enum_crm_prospects_website_status" DEFAULT 'a-verifier',
  	"siren" varchar,
  	"discovered_at" timestamp(3) with time zone,
  	"search_id" integer,
  	"next_follow_up_at" timestamp(3) with time zone,
  	"last_contact_at" timestamp(3) with time zone,
  	"do_not_contact" boolean DEFAULT false,
  	"name_key" varchar,
  	"commune_key" varchar,
  	"phone_key" varchar,
  	"email_key" varchar,
  	"domain_key" varchar,
  	"siren_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_activities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prospect_id" integer NOT NULL,
  	"kind" "enum_crm_activities_kind" DEFAULT 'note' NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"summary" varchar NOT NULL,
  	"follow_up_at" timestamp(3) with time zone,
  	"done" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_zones" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"code" varchar NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_crm_zones_kind" DEFAULT 'departement' NOT NULL,
  	"region" varchar,
  	"country" varchar DEFAULT 'France' NOT NULL,
  	"active" boolean DEFAULT false,
  	"label" varchar,
  	"last_searched_at" timestamp(3) with time zone,
  	"search_count" numeric DEFAULT 0,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_searches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"finished_at" timestamp(3) with time zone,
  	"trigger" "enum_crm_searches_trigger" DEFAULT 'manuel' NOT NULL,
  	"status" "enum_crm_searches_status" DEFAULT 'en-cours' NOT NULL,
  	"target" numeric,
  	"sources" varchar,
  	"found" numeric DEFAULT 0,
  	"added" numeric DEFAULT 0,
  	"duplicates" numeric DEFAULT 0,
  	"rejected" numeric DEFAULT 0,
  	"report" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_searches_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"crm_zones_id" integer
  );
  
  CREATE TABLE "crm_duplicates_reasons" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_crm_duplicates_reasons",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "crm_duplicates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prospect_id" integer NOT NULL,
  	"existing_id" integer NOT NULL,
  	"status" "enum_crm_duplicates_status" DEFAULT 'a-examiner' NOT NULL,
  	"decided_at" timestamp(3) with time zone,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_optouts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"email" varchar,
  	"phone" varchar,
  	"website" varchar,
  	"commune" varchar,
  	"reason" varchar,
  	"prospect_id" integer,
  	"name_key" varchar,
  	"commune_key" varchar,
  	"phone_key" varchar,
  	"email_key" varchar,
  	"domain_key" varchar,
  	"siren_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "crm_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"weekly_target" numeric DEFAULT 70 NOT NULL,
  	"follow_up_days" numeric DEFAULT 7 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_prospects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_activities_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_zones_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_searches_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_duplicates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_optouts_id" integer;
  ALTER TABLE "crm_prospects_sources" ADD CONSTRAINT "crm_prospects_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_prospects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_prospects" ADD CONSTRAINT "crm_prospects_department_id_crm_zones_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."crm_zones"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_prospects" ADD CONSTRAINT "crm_prospects_search_id_crm_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."crm_searches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_prospect_id_crm_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."crm_prospects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_searches_rels" ADD CONSTRAINT "crm_searches_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_searches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_searches_rels" ADD CONSTRAINT "crm_searches_rels_crm_zones_fk" FOREIGN KEY ("crm_zones_id") REFERENCES "public"."crm_zones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_duplicates_reasons" ADD CONSTRAINT "crm_duplicates_reasons_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."crm_duplicates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_duplicates" ADD CONSTRAINT "crm_duplicates_prospect_id_crm_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."crm_prospects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_duplicates" ADD CONSTRAINT "crm_duplicates_existing_id_crm_prospects_id_fk" FOREIGN KEY ("existing_id") REFERENCES "public"."crm_prospects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "crm_optouts" ADD CONSTRAINT "crm_optouts_prospect_id_crm_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."crm_prospects"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_prospects_sources_order_idx" ON "crm_prospects_sources" USING btree ("_order");
  CREATE INDEX "crm_prospects_sources_parent_id_idx" ON "crm_prospects_sources" USING btree ("_parent_id");
  CREATE INDEX "crm_prospects_type_idx" ON "crm_prospects" USING btree ("type");
  CREATE INDEX "crm_prospects_status_idx" ON "crm_prospects" USING btree ("status");
  CREATE INDEX "crm_prospects_priority_idx" ON "crm_prospects" USING btree ("priority");
  CREATE INDEX "crm_prospects_commune_idx" ON "crm_prospects" USING btree ("commune");
  CREATE INDEX "crm_prospects_department_idx" ON "crm_prospects" USING btree ("department_id");
  CREATE INDEX "crm_prospects_website_status_idx" ON "crm_prospects" USING btree ("website_status");
  CREATE INDEX "crm_prospects_search_idx" ON "crm_prospects" USING btree ("search_id");
  CREATE INDEX "crm_prospects_next_follow_up_at_idx" ON "crm_prospects" USING btree ("next_follow_up_at");
  CREATE INDEX "crm_prospects_do_not_contact_idx" ON "crm_prospects" USING btree ("do_not_contact");
  CREATE INDEX "crm_prospects_name_key_idx" ON "crm_prospects" USING btree ("name_key");
  CREATE INDEX "crm_prospects_commune_key_idx" ON "crm_prospects" USING btree ("commune_key");
  CREATE INDEX "crm_prospects_phone_key_idx" ON "crm_prospects" USING btree ("phone_key");
  CREATE INDEX "crm_prospects_email_key_idx" ON "crm_prospects" USING btree ("email_key");
  CREATE INDEX "crm_prospects_domain_key_idx" ON "crm_prospects" USING btree ("domain_key");
  CREATE INDEX "crm_prospects_siren_key_idx" ON "crm_prospects" USING btree ("siren_key");
  CREATE INDEX "crm_prospects_updated_at_idx" ON "crm_prospects" USING btree ("updated_at");
  CREATE INDEX "crm_prospects_created_at_idx" ON "crm_prospects" USING btree ("created_at");
  CREATE INDEX "crm_activities_prospect_idx" ON "crm_activities" USING btree ("prospect_id");
  CREATE INDEX "crm_activities_kind_idx" ON "crm_activities" USING btree ("kind");
  CREATE INDEX "crm_activities_date_idx" ON "crm_activities" USING btree ("date");
  CREATE INDEX "crm_activities_follow_up_at_idx" ON "crm_activities" USING btree ("follow_up_at");
  CREATE INDEX "crm_activities_updated_at_idx" ON "crm_activities" USING btree ("updated_at");
  CREATE INDEX "crm_activities_created_at_idx" ON "crm_activities" USING btree ("created_at");
  CREATE INDEX "crm_zones_code_idx" ON "crm_zones" USING btree ("code");
  CREATE INDEX "crm_zones_region_idx" ON "crm_zones" USING btree ("region");
  CREATE INDEX "crm_zones_country_idx" ON "crm_zones" USING btree ("country");
  CREATE INDEX "crm_zones_active_idx" ON "crm_zones" USING btree ("active");
  CREATE INDEX "crm_zones_updated_at_idx" ON "crm_zones" USING btree ("updated_at");
  CREATE INDEX "crm_zones_created_at_idx" ON "crm_zones" USING btree ("created_at");
  CREATE INDEX "crm_searches_updated_at_idx" ON "crm_searches" USING btree ("updated_at");
  CREATE INDEX "crm_searches_created_at_idx" ON "crm_searches" USING btree ("created_at");
  CREATE INDEX "crm_searches_rels_order_idx" ON "crm_searches_rels" USING btree ("order");
  CREATE INDEX "crm_searches_rels_parent_idx" ON "crm_searches_rels" USING btree ("parent_id");
  CREATE INDEX "crm_searches_rels_path_idx" ON "crm_searches_rels" USING btree ("path");
  CREATE INDEX "crm_searches_rels_crm_zones_id_idx" ON "crm_searches_rels" USING btree ("crm_zones_id");
  CREATE INDEX "crm_duplicates_reasons_order_idx" ON "crm_duplicates_reasons" USING btree ("order");
  CREATE INDEX "crm_duplicates_reasons_parent_idx" ON "crm_duplicates_reasons" USING btree ("parent_id");
  CREATE INDEX "crm_duplicates_prospect_idx" ON "crm_duplicates" USING btree ("prospect_id");
  CREATE INDEX "crm_duplicates_existing_idx" ON "crm_duplicates" USING btree ("existing_id");
  CREATE INDEX "crm_duplicates_status_idx" ON "crm_duplicates" USING btree ("status");
  CREATE INDEX "crm_duplicates_updated_at_idx" ON "crm_duplicates" USING btree ("updated_at");
  CREATE INDEX "crm_duplicates_created_at_idx" ON "crm_duplicates" USING btree ("created_at");
  CREATE INDEX "crm_optouts_prospect_idx" ON "crm_optouts" USING btree ("prospect_id");
  CREATE INDEX "crm_optouts_name_key_idx" ON "crm_optouts" USING btree ("name_key");
  CREATE INDEX "crm_optouts_commune_key_idx" ON "crm_optouts" USING btree ("commune_key");
  CREATE INDEX "crm_optouts_phone_key_idx" ON "crm_optouts" USING btree ("phone_key");
  CREATE INDEX "crm_optouts_email_key_idx" ON "crm_optouts" USING btree ("email_key");
  CREATE INDEX "crm_optouts_domain_key_idx" ON "crm_optouts" USING btree ("domain_key");
  CREATE INDEX "crm_optouts_siren_key_idx" ON "crm_optouts" USING btree ("siren_key");
  CREATE INDEX "crm_optouts_updated_at_idx" ON "crm_optouts" USING btree ("updated_at");
  CREATE INDEX "crm_optouts_created_at_idx" ON "crm_optouts" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_prospects_fk" FOREIGN KEY ("crm_prospects_id") REFERENCES "public"."crm_prospects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_activities_fk" FOREIGN KEY ("crm_activities_id") REFERENCES "public"."crm_activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_zones_fk" FOREIGN KEY ("crm_zones_id") REFERENCES "public"."crm_zones"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_searches_fk" FOREIGN KEY ("crm_searches_id") REFERENCES "public"."crm_searches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_duplicates_fk" FOREIGN KEY ("crm_duplicates_id") REFERENCES "public"."crm_duplicates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_optouts_fk" FOREIGN KEY ("crm_optouts_id") REFERENCES "public"."crm_optouts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_prospects_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_prospects_id");
  CREATE INDEX "payload_locked_documents_rels_crm_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_activities_id");
  CREATE INDEX "payload_locked_documents_rels_crm_zones_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_zones_id");
  CREATE INDEX "payload_locked_documents_rels_crm_searches_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_searches_id");
  CREATE INDEX "payload_locked_documents_rels_crm_duplicates_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_duplicates_id");
  CREATE INDEX "payload_locked_documents_rels_crm_optouts_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_optouts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "crm_prospects_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_prospects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_activities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_zones" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_searches" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_searches_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_duplicates_reasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_duplicates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_optouts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "crm_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "crm_prospects_sources" CASCADE;
  DROP TABLE "crm_prospects" CASCADE;
  DROP TABLE "crm_activities" CASCADE;
  DROP TABLE "crm_zones" CASCADE;
  DROP TABLE "crm_searches" CASCADE;
  DROP TABLE "crm_searches_rels" CASCADE;
  DROP TABLE "crm_duplicates_reasons" CASCADE;
  DROP TABLE "crm_duplicates" CASCADE;
  DROP TABLE "crm_optouts" CASCADE;
  DROP TABLE "crm_settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_prospects_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_activities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_zones_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_searches_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_duplicates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_optouts_fk";
  
  DROP INDEX "payload_locked_documents_rels_crm_prospects_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_activities_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_zones_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_searches_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_duplicates_id_idx";
  DROP INDEX "payload_locked_documents_rels_crm_optouts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_prospects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_activities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_zones_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_searches_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_duplicates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_optouts_id";
  DROP TYPE "public"."enum_crm_prospects_type";
  DROP TYPE "public"."enum_crm_prospects_status";
  DROP TYPE "public"."enum_crm_prospects_priority";
  DROP TYPE "public"."enum_crm_prospects_need";
  DROP TYPE "public"."enum_crm_prospects_verification_level";
  DROP TYPE "public"."enum_crm_prospects_phone_level";
  DROP TYPE "public"."enum_crm_prospects_email_level";
  DROP TYPE "public"."enum_crm_prospects_website_status";
  DROP TYPE "public"."enum_crm_activities_kind";
  DROP TYPE "public"."enum_crm_zones_kind";
  DROP TYPE "public"."enum_crm_searches_trigger";
  DROP TYPE "public"."enum_crm_searches_status";
  DROP TYPE "public"."enum_crm_duplicates_reasons";
  DROP TYPE "public"."enum_crm_duplicates_status";`)
}
