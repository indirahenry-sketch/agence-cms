import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Prospection v8 : Outlook et envoi automatique.
 * Ajouts seulement : statut « A répondu », choix « Envoi automatique » sur la fiche, réglages Outlook.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_crm_prospects_status" ADD VALUE IF NOT EXISTS 'a-repondu' BEFORE 'client';
  CREATE TYPE "public"."enum_crm_prospects_auto_send" AS ENUM('defaut', 'oui', 'non');
  CREATE TYPE "public"."enum_crm_settings_auto_send_scope" AS ENUM('choisis', 'tous');
  ALTER TABLE "crm_prospects" ADD COLUMN "auto_send" "enum_crm_prospects_auto_send" DEFAULT 'defaut';
  ALTER TABLE "crm_settings" ADD COLUMN "auto_send" boolean DEFAULT false;
  ALTER TABLE "crm_settings" ADD COLUMN "auto_send_scope" "enum_crm_settings_auto_send_scope" DEFAULT 'choisis' NOT NULL;
  ALTER TABLE "crm_settings" ADD COLUMN "auto_send_daily_cap" numeric DEFAULT 10 NOT NULL;
  ALTER TABLE "crm_settings" ADD COLUMN "auto_send_gap_minutes" numeric DEFAULT 20 NOT NULL;
  ALTER TABLE "crm_settings" ADD COLUMN "auto_send_relances" numeric DEFAULT 1 NOT NULL;
  ALTER TABLE "crm_settings" ADD COLUMN "reply_check" boolean DEFAULT true;
  ALTER TABLE "crm_settings" ADD COLUMN "outlook_email" varchar;
  ALTER TABLE "crm_settings" ADD COLUMN "outlook_connected_at" timestamp(3) with time zone;
  ALTER TABLE "crm_settings" ADD COLUMN "outlook_last_check" timestamp(3) with time zone;
  ALTER TABLE "crm_settings" ADD COLUMN "outlook_error" varchar;
  ALTER TABLE "crm_settings" ADD COLUMN "outlook_token" varchar;
  CREATE INDEX "crm_prospects_auto_send_idx" ON "crm_prospects" USING btree ("auto_send");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "crm_prospects" SET "status" = 'en-attente' WHERE "status" = 'a-repondu';
  DROP INDEX IF EXISTS "crm_prospects_auto_send_idx";
  ALTER TABLE "crm_prospects" DROP COLUMN IF EXISTS "auto_send";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "auto_send";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "auto_send_scope";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "auto_send_daily_cap";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "auto_send_gap_minutes";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "auto_send_relances";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "reply_check";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "outlook_email";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "outlook_connected_at";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "outlook_last_check";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "outlook_error";
  ALTER TABLE "crm_settings" DROP COLUMN IF EXISTS "outlook_token";
  DROP TYPE IF EXISTS "public"."enum_crm_prospects_auto_send";
  DROP TYPE IF EXISTS "public"."enum_crm_settings_auto_send_scope";`)
}
