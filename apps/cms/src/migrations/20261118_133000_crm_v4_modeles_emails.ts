import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Prospection v4 :
 * - modèles d'e-mails (collection crm-email-templates) ;
 * - plusieurs téléphones et e-mails par prospect (otherPhones, otherEmails) ;
 * - historique : type « Complément des coordonnées » (valeur conservée au retour arrière).
 * Ajouts seulement : aucune donnée existante n'est modifiée.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_searches_trigger" ADD VALUE IF NOT EXISTS 'completion';
  CREATE TYPE "public"."enum_crm_email_templates_kind" AS ENUM('refonte', 'creation', 'relance', 'autre');
  CREATE TABLE "crm_prospects_other_phones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"number" varchar NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "crm_prospects_other_emails" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"address" varchar NOT NULL,
  	"label" varchar
  );
  
  CREATE TABLE "crm_email_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_crm_email_templates_kind" DEFAULT 'refonte' NOT NULL,
  	"subject" varchar,
  	"body" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_email_templates_id" integer;
  ALTER TABLE "crm_prospects_other_phones" ADD CONSTRAINT "crm_prospects_other_phones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_prospects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "crm_prospects_other_emails" ADD CONSTRAINT "crm_prospects_other_emails_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."crm_prospects"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "crm_prospects_other_phones_order_idx" ON "crm_prospects_other_phones" USING btree ("_order");
  CREATE INDEX "crm_prospects_other_phones_parent_id_idx" ON "crm_prospects_other_phones" USING btree ("_parent_id");
  CREATE INDEX "crm_prospects_other_emails_order_idx" ON "crm_prospects_other_emails" USING btree ("_order");
  CREATE INDEX "crm_prospects_other_emails_parent_id_idx" ON "crm_prospects_other_emails" USING btree ("_parent_id");
  CREATE INDEX "crm_email_templates_kind_idx" ON "crm_email_templates" USING btree ("kind");
  CREATE INDEX "crm_email_templates_updated_at_idx" ON "crm_email_templates" USING btree ("updated_at");
  CREATE INDEX "crm_email_templates_created_at_idx" ON "crm_email_templates" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_email_templates_fk" FOREIGN KEY ("crm_email_templates_id") REFERENCES "public"."crm_email_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_email_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_email_templates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_email_templates_fk";
  DROP INDEX "payload_locked_documents_rels_crm_email_templates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_email_templates_id";
  DROP TABLE "crm_prospects_other_phones" CASCADE;
  DROP TABLE "crm_prospects_other_emails" CASCADE;
  DROP TABLE "crm_email_templates" CASCADE;
  DROP TYPE "public"."enum_crm_email_templates_kind";`)
}
