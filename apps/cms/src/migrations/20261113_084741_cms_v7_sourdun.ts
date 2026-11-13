import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * V7 : maquette du Centre Équestre de Sourdun.
 * Nouveaux profils de services (enfant, cavalier, groupe, besoin adapté), nouvelles icônes
 * (groupe, balade, écurie) et nouvelles sections de menu (Activités, Cours et horaires, Réserver).
 * Ajouts seulement : rien n'est supprimé. (La colonne media._objectkey, gérée par le stockage S3,
 * est volontairement laissée de côté.)
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_services_audiences" ADD VALUE 'enfant';
  ALTER TYPE "public"."enum_services_audiences" ADD VALUE 'cavalier';
  ALTER TYPE "public"."enum_services_audiences" ADD VALUE 'groupe';
  ALTER TYPE "public"."enum_services_audiences" ADD VALUE 'adapte';
  ALTER TYPE "public"."enum_services_icon" ADD VALUE 'group';
  ALTER TYPE "public"."enum_services_icon" ADD VALUE 'trail';
  ALTER TYPE "public"."enum_services_icon" ADD VALUE 'barn';
  ALTER TYPE "public"."enum_menus_items_children_anchor" ADD VALUE 'activites' BEFORE 'tarifs';
  ALTER TYPE "public"."enum_menus_items_children_anchor" ADD VALUE 'horaires' BEFORE 'blog';
  ALTER TYPE "public"."enum_menus_items_children_anchor" ADD VALUE 'reserver' BEFORE 'blog';
  ALTER TYPE "public"."enum_menus_items_anchor" ADD VALUE 'activites' BEFORE 'tarifs';
  ALTER TYPE "public"."enum_menus_items_anchor" ADD VALUE 'horaires' BEFORE 'blog';
  ALTER TYPE "public"."enum_menus_items_anchor" ADD VALUE 'reserver' BEFORE 'blog';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "services_audiences" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_services_audiences";
  CREATE TYPE "public"."enum_services_audiences" AS ENUM('debutant', 'loisir', 'compet', 'proprio');
  ALTER TABLE "services_audiences" ALTER COLUMN "value" SET DATA TYPE "public"."enum_services_audiences" USING "value"::"public"."enum_services_audiences";
  ALTER TABLE "services" ALTER COLUMN "icon" SET DATA TYPE text;
  ALTER TABLE "services" ALTER COLUMN "icon" SET DEFAULT 'star'::text;
  DROP TYPE "public"."enum_services_icon";
  CREATE TYPE "public"."enum_services_icon" AS ENUM('person', 'medal', 'home', 'heart', 'chart', 'calendar', 'star');
  ALTER TABLE "services" ALTER COLUMN "icon" SET DEFAULT 'star'::"public"."enum_services_icon";
  ALTER TABLE "services" ALTER COLUMN "icon" SET DATA TYPE "public"."enum_services_icon" USING "icon"::"public"."enum_services_icon";
  ALTER TABLE "menus_items_children" ALTER COLUMN "anchor" SET DATA TYPE text;
  DROP TYPE "public"."enum_menus_items_children_anchor";
  CREATE TYPE "public"."enum_menus_items_children_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'actualites', 'contact');
  ALTER TABLE "menus_items_children" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_menus_items_children_anchor" USING "anchor"::"public"."enum_menus_items_children_anchor";
  ALTER TABLE "menus_items" ALTER COLUMN "anchor" SET DATA TYPE text;
  DROP TYPE "public"."enum_menus_items_anchor";
  CREATE TYPE "public"."enum_menus_items_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'actualites', 'contact');
  ALTER TABLE "menus_items" ALTER COLUMN "anchor" SET DATA TYPE "public"."enum_menus_items_anchor" USING "anchor"::"public"."enum_menus_items_anchor";`)
}
