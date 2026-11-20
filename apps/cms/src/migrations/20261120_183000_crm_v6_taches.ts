import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/** Prospection v6 : tâches du calendrier (collection crm-tasks). Ajouts seulement. */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_crm_tasks_kind" AS ENUM('relance', 'appel', 'email', 'recherche', 'rdv', 'autre');
  CREATE TABLE "crm_tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_crm_tasks_kind" DEFAULT 'relance' NOT NULL,
  	"title" varchar NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"time" varchar,
  	"done" boolean DEFAULT false,
  	"prospect_id" integer,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "crm_tasks_id" integer;
  ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_prospect_id_crm_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."crm_prospects"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "crm_tasks_kind_idx" ON "crm_tasks" USING btree ("kind");
  CREATE INDEX "crm_tasks_date_idx" ON "crm_tasks" USING btree ("date");
  CREATE INDEX "crm_tasks_done_idx" ON "crm_tasks" USING btree ("done");
  CREATE INDEX "crm_tasks_prospect_idx" ON "crm_tasks" USING btree ("prospect_id");
  CREATE INDEX "crm_tasks_updated_at_idx" ON "crm_tasks" USING btree ("updated_at");
  CREATE INDEX "crm_tasks_created_at_idx" ON "crm_tasks" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_crm_tasks_fk" FOREIGN KEY ("crm_tasks_id") REFERENCES "public"."crm_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_crm_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("crm_tasks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_crm_tasks_fk";
  DROP INDEX "payload_locked_documents_rels_crm_tasks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "crm_tasks_id";
  DROP TABLE "crm_tasks" CASCADE;
  DROP TYPE "public"."enum_crm_tasks_kind";`)
}
