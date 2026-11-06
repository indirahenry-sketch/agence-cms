import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_services_audiences" AS ENUM('debutant', 'loisir', 'compet', 'proprio');
  CREATE TYPE "public"."enum_services_icon" AS ENUM('person', 'medal', 'home', 'heart', 'chart', 'calendar', 'star');
  CREATE TYPE "public"."enum_events_type" AS ENUM('stage', 'galop', 'concours', 'fete', 'atelier', 'autre');
  CREATE TYPE "public"."enum_pages_blocks_heading_level" AS ENUM('h2', 'h3');
  CREATE TYPE "public"."enum_pages_blocks_section_buttons_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum_pages_blocks_section_image_position" AS ENUM('right', 'left');
  CREATE TYPE "public"."enum_pages_blocks_section_background" AS ENUM('none', 'card', 'accent');
  CREATE TYPE "public"."enum_pages_blocks_buttons_buttons_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum_pages_blocks_button_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum__pages_v_blocks_heading_level" AS ENUM('h2', 'h3');
  CREATE TYPE "public"."enum__pages_v_blocks_section_buttons_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum__pages_v_blocks_section_image_position" AS ENUM('right', 'left');
  CREATE TYPE "public"."enum__pages_v_blocks_section_background" AS ENUM('none', 'card', 'accent');
  CREATE TYPE "public"."enum__pages_v_blocks_buttons_buttons_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum__pages_v_blocks_button_style" AS ENUM('primary', 'secondary');
  CREATE TYPE "public"."enum_menus_items_children_type" AS ENUM('page', 'anchor', 'url');
  CREATE TYPE "public"."enum_menus_items_children_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'contact');
  CREATE TYPE "public"."enum_menus_items_type" AS ENUM('page', 'anchor', 'url');
  CREATE TYPE "public"."enum_menus_items_anchor" AS ENUM('top', 'galerie', 'services', 'tarifs', 'installations', 'stages', 'blog', 'contact');
  CREATE TYPE "public"."enum_menus_location" AS ENUM('main', 'secondary', 'footer');
  CREATE TYPE "public"."enum_promotions_kind" AS ENUM('banner', 'popup');
  CREATE TYPE "public"."enum_promotions_style" AS ENUM('accent', 'dark', 'light');
  CREATE TYPE "public"."enum_promotions_frequency" AS ENUM('session', 'once', 'always');
  ALTER TYPE "public"."enum_categories_usage" ADD VALUE 'services' BEFORE 'prices';
  ALTER TYPE "public"."enum_categories_usage" ADD VALUE 'articles';
  ALTER TYPE "public"."enum_categories_usage" ADD VALUE 'blog';
  ALTER TYPE "public"."enum_audit_logs_action" ADD VALUE 'login';
  CREATE TABLE "posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "media_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"tags_id" integer
  );
  
  CREATE TABLE "services_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "services_points_locales" (
  	"text" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "services_audiences" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_services_audiences",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"icon" "enum_services_icon" DEFAULT 'star',
  	"category_id" integer,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "services_locales" (
  	"title" varchar NOT NULL,
  	"summary" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "pages_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" "enum_pages_blocks_heading_level" DEFAULT 'h2',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_heading_locales" (
  	"eyebrow" varchar,
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_section_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"style" "enum_pages_blocks_section_buttons_style" DEFAULT 'primary'
  );
  
  CREATE TABLE "pages_blocks_section_buttons_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"image_position" "enum_pages_blocks_section_image_position" DEFAULT 'right',
  	"background" "enum_pages_blocks_section_background" DEFAULT 'none',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_section_locales" (
  	"eyebrow" varchar,
  	"title" varchar,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_video_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_buttons_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"style" "enum_pages_blocks_buttons_buttons_style" DEFAULT 'primary'
  );
  
  CREATE TABLE "pages_blocks_buttons_buttons_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "pages_blocks_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_heading" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"level" "enum__pages_v_blocks_heading_level" DEFAULT 'h2',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_heading_locales" (
  	"eyebrow" varchar,
  	"text" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_section_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"style" "enum__pages_v_blocks_section_buttons_style" DEFAULT 'primary',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_section_buttons_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_section" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"image_position" "enum__pages_v_blocks_section_image_position" DEFAULT 'right',
  	"background" "enum__pages_v_blocks_section_background" DEFAULT 'none',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_section_locales" (
  	"eyebrow" varchar,
  	"title" varchar,
  	"content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_video_locales" (
  	"caption" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_buttons_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"style" "enum__pages_v_blocks_buttons_buttons_style" DEFAULT 'primary',
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_buttons_buttons_locales" (
  	"label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_pages_v_blocks_buttons" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "menus_items_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_menus_items_children_type" DEFAULT 'page' NOT NULL,
  	"page_id" integer,
  	"anchor" "enum_menus_items_children_anchor",
  	"url" varchar,
  	"new_tab" boolean DEFAULT false
  );
  
  CREATE TABLE "menus_items_children_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "menus_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_menus_items_type" DEFAULT 'page' NOT NULL,
  	"page_id" integer,
  	"anchor" "enum_menus_items_anchor",
  	"url" varchar,
  	"new_tab" boolean DEFAULT false
  );
  
  CREATE TABLE "menus_items_locales" (
  	"label" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" varchar NOT NULL
  );
  
  CREATE TABLE "menus" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"name" varchar NOT NULL,
  	"location" "enum_menus_location" DEFAULT 'main' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "promotions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"kind" "enum_promotions_kind" DEFAULT 'banner' NOT NULL,
  	"active" boolean DEFAULT true,
  	"image_id" integer,
  	"button_url" varchar,
  	"starts_at" timestamp(3) with time zone,
  	"ends_at" timestamp(3) with time zone,
  	"style" "enum_promotions_style" DEFAULT 'accent',
  	"frequency" "enum_promotions_frequency" DEFAULT 'session',
  	"delay" numeric DEFAULT 3,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "promotions_locales" (
  	"title" varchar NOT NULL,
  	"text" varchar,
  	"button_label" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "tags" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tenant_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tags_locales" (
  	"name" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "is_public" boolean DEFAULT true;
  ALTER TABLE "categories_locales" ADD COLUMN "description" varchar;
  ALTER TABLE "events" ADD COLUMN "type" "enum_events_type" DEFAULT 'stage';
  ALTER TABLE "events_locales" ADD COLUMN "hours" varchar;
  ALTER TABLE "pages_blocks_button" ADD COLUMN "style" "enum_pages_blocks_button_style" DEFAULT 'primary';
  ALTER TABLE "_pages_v_blocks_button" ADD COLUMN "style" "enum__pages_v_blocks_button_style" DEFAULT 'primary';
  ALTER TABLE "posts" ADD COLUMN "category_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_category_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "services_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "menus_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "promotions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tags_id" integer;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_points" ADD CONSTRAINT "services_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_points_locales" ADD CONSTRAINT "services_points_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_audiences" ADD CONSTRAINT "services_audiences_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services" ADD CONSTRAINT "services_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "services_locales" ADD CONSTRAINT "services_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_heading" ADD CONSTRAINT "pages_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_heading_locales" ADD CONSTRAINT "pages_blocks_heading_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_heading"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_section_buttons" ADD CONSTRAINT "pages_blocks_section_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_section_buttons_locales" ADD CONSTRAINT "pages_blocks_section_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_section_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_section" ADD CONSTRAINT "pages_blocks_section_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_section" ADD CONSTRAINT "pages_blocks_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_section_locales" ADD CONSTRAINT "pages_blocks_section_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_video" ADD CONSTRAINT "pages_blocks_video_video_id_media_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "pages_blocks_video" ADD CONSTRAINT "pages_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_video_locales" ADD CONSTRAINT "pages_blocks_video_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_video"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_buttons_buttons" ADD CONSTRAINT "pages_blocks_buttons_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_buttons_buttons_locales" ADD CONSTRAINT "pages_blocks_buttons_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_buttons_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_buttons" ADD CONSTRAINT "pages_blocks_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_heading" ADD CONSTRAINT "_pages_v_blocks_heading_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_heading_locales" ADD CONSTRAINT "_pages_v_blocks_heading_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_heading"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section_buttons" ADD CONSTRAINT "_pages_v_blocks_section_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section_buttons_locales" ADD CONSTRAINT "_pages_v_blocks_section_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_section_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section" ADD CONSTRAINT "_pages_v_blocks_section_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section" ADD CONSTRAINT "_pages_v_blocks_section_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section_locales" ADD CONSTRAINT "_pages_v_blocks_section_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_section"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_video" ADD CONSTRAINT "_pages_v_blocks_video_video_id_media_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_video" ADD CONSTRAINT "_pages_v_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_video_locales" ADD CONSTRAINT "_pages_v_blocks_video_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_video"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_buttons_buttons" ADD CONSTRAINT "_pages_v_blocks_buttons_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_buttons_buttons_locales" ADD CONSTRAINT "_pages_v_blocks_buttons_buttons_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_buttons_buttons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_buttons" ADD CONSTRAINT "_pages_v_blocks_buttons_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_children" ADD CONSTRAINT "menus_items_children_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menus_items_children" ADD CONSTRAINT "menus_items_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_children_locales" ADD CONSTRAINT "menus_items_children_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items_children"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items" ADD CONSTRAINT "menus_items_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "menus_items" ADD CONSTRAINT "menus_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus_items_locales" ADD CONSTRAINT "menus_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."menus_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "menus" ADD CONSTRAINT "menus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "promotions" ADD CONSTRAINT "promotions_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "promotions_locales" ADD CONSTRAINT "promotions_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tags_locales" ADD CONSTRAINT "tags_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_rels_order_idx" ON "posts_rels" USING btree ("order");
  CREATE INDEX "posts_rels_parent_idx" ON "posts_rels" USING btree ("parent_id");
  CREATE INDEX "posts_rels_path_idx" ON "posts_rels" USING btree ("path");
  CREATE INDEX "posts_rels_tags_id_idx" ON "posts_rels" USING btree ("tags_id");
  CREATE INDEX "_posts_v_rels_order_idx" ON "_posts_v_rels" USING btree ("order");
  CREATE INDEX "_posts_v_rels_parent_idx" ON "_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_posts_v_rels_path_idx" ON "_posts_v_rels" USING btree ("path");
  CREATE INDEX "_posts_v_rels_tags_id_idx" ON "_posts_v_rels" USING btree ("tags_id");
  CREATE INDEX "media_rels_order_idx" ON "media_rels" USING btree ("order");
  CREATE INDEX "media_rels_parent_idx" ON "media_rels" USING btree ("parent_id");
  CREATE INDEX "media_rels_path_idx" ON "media_rels" USING btree ("path");
  CREATE INDEX "media_rels_tags_id_idx" ON "media_rels" USING btree ("tags_id");
  CREATE INDEX "services_points_order_idx" ON "services_points" USING btree ("_order");
  CREATE INDEX "services_points_parent_id_idx" ON "services_points" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "services_points_locales_locale_parent_id_unique" ON "services_points_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "services_points_locales_parent_id_idx" ON "services_points_locales" USING btree ("_parent_id");
  CREATE INDEX "services_audiences_order_idx" ON "services_audiences" USING btree ("order");
  CREATE INDEX "services_audiences_parent_idx" ON "services_audiences" USING btree ("parent_id");
  CREATE INDEX "services_tenant_idx" ON "services" USING btree ("tenant_id");
  CREATE INDEX "services_category_idx" ON "services" USING btree ("category_id");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  CREATE UNIQUE INDEX "services_locales_locale_parent_id_unique" ON "services_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "services_locales_parent_id_idx" ON "services_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_heading_order_idx" ON "pages_blocks_heading" USING btree ("_order");
  CREATE INDEX "pages_blocks_heading_parent_id_idx" ON "pages_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_heading_path_idx" ON "pages_blocks_heading" USING btree ("_path");
  CREATE UNIQUE INDEX "pages_blocks_heading_locales_locale_parent_id_unique" ON "pages_blocks_heading_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_heading_locales_parent_id_idx" ON "pages_blocks_heading_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_section_buttons_order_idx" ON "pages_blocks_section_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_section_buttons_parent_id_idx" ON "pages_blocks_section_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_section_buttons_locales_locale_parent_id_unique" ON "pages_blocks_section_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_section_buttons_locales_parent_id_idx" ON "pages_blocks_section_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_section_order_idx" ON "pages_blocks_section" USING btree ("_order");
  CREATE INDEX "pages_blocks_section_parent_id_idx" ON "pages_blocks_section" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_section_path_idx" ON "pages_blocks_section" USING btree ("_path");
  CREATE INDEX "pages_blocks_section_image_idx" ON "pages_blocks_section" USING btree ("image_id");
  CREATE UNIQUE INDEX "pages_blocks_section_locales_locale_parent_id_unique" ON "pages_blocks_section_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_section_locales_parent_id_idx" ON "pages_blocks_section_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_video_order_idx" ON "pages_blocks_video" USING btree ("_order");
  CREATE INDEX "pages_blocks_video_parent_id_idx" ON "pages_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_video_path_idx" ON "pages_blocks_video" USING btree ("_path");
  CREATE INDEX "pages_blocks_video_video_idx" ON "pages_blocks_video" USING btree ("video_id");
  CREATE UNIQUE INDEX "pages_blocks_video_locales_locale_parent_id_unique" ON "pages_blocks_video_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_video_locales_parent_id_idx" ON "pages_blocks_video_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_buttons_buttons_order_idx" ON "pages_blocks_buttons_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_buttons_buttons_parent_id_idx" ON "pages_blocks_buttons_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_blocks_buttons_buttons_locales_locale_parent_id_unique" ON "pages_blocks_buttons_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "pages_blocks_buttons_buttons_locales_parent_id_idx" ON "pages_blocks_buttons_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_buttons_order_idx" ON "pages_blocks_buttons" USING btree ("_order");
  CREATE INDEX "pages_blocks_buttons_parent_id_idx" ON "pages_blocks_buttons" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_buttons_path_idx" ON "pages_blocks_buttons" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_heading_order_idx" ON "_pages_v_blocks_heading" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_heading_parent_id_idx" ON "_pages_v_blocks_heading" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_heading_path_idx" ON "_pages_v_blocks_heading" USING btree ("_path");
  CREATE UNIQUE INDEX "_pages_v_blocks_heading_locales_locale_parent_id_unique" ON "_pages_v_blocks_heading_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_heading_locales_parent_id_idx" ON "_pages_v_blocks_heading_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_section_buttons_order_idx" ON "_pages_v_blocks_section_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_section_buttons_parent_id_idx" ON "_pages_v_blocks_section_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_section_buttons_locales_locale_parent_id_uni" ON "_pages_v_blocks_section_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_section_buttons_locales_parent_id_idx" ON "_pages_v_blocks_section_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_section_order_idx" ON "_pages_v_blocks_section" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_section_parent_id_idx" ON "_pages_v_blocks_section" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_section_path_idx" ON "_pages_v_blocks_section" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_section_image_idx" ON "_pages_v_blocks_section" USING btree ("image_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_section_locales_locale_parent_id_unique" ON "_pages_v_blocks_section_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_section_locales_parent_id_idx" ON "_pages_v_blocks_section_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_video_order_idx" ON "_pages_v_blocks_video" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_video_parent_id_idx" ON "_pages_v_blocks_video" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_video_path_idx" ON "_pages_v_blocks_video" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_video_video_idx" ON "_pages_v_blocks_video" USING btree ("video_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_video_locales_locale_parent_id_unique" ON "_pages_v_blocks_video_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_video_locales_parent_id_idx" ON "_pages_v_blocks_video_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_buttons_buttons_order_idx" ON "_pages_v_blocks_buttons_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_buttons_buttons_parent_id_idx" ON "_pages_v_blocks_buttons_buttons" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_pages_v_blocks_buttons_buttons_locales_locale_parent_id_uni" ON "_pages_v_blocks_buttons_buttons_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_pages_v_blocks_buttons_buttons_locales_parent_id_idx" ON "_pages_v_blocks_buttons_buttons_locales" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_buttons_order_idx" ON "_pages_v_blocks_buttons" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_buttons_parent_id_idx" ON "_pages_v_blocks_buttons" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_buttons_path_idx" ON "_pages_v_blocks_buttons" USING btree ("_path");
  CREATE INDEX "menus_items_children_order_idx" ON "menus_items_children" USING btree ("_order");
  CREATE INDEX "menus_items_children_parent_id_idx" ON "menus_items_children" USING btree ("_parent_id");
  CREATE INDEX "menus_items_children_page_idx" ON "menus_items_children" USING btree ("page_id");
  CREATE UNIQUE INDEX "menus_items_children_locales_locale_parent_id_unique" ON "menus_items_children_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "menus_items_children_locales_parent_id_idx" ON "menus_items_children_locales" USING btree ("_parent_id");
  CREATE INDEX "menus_items_order_idx" ON "menus_items" USING btree ("_order");
  CREATE INDEX "menus_items_parent_id_idx" ON "menus_items" USING btree ("_parent_id");
  CREATE INDEX "menus_items_page_idx" ON "menus_items" USING btree ("page_id");
  CREATE UNIQUE INDEX "menus_items_locales_locale_parent_id_unique" ON "menus_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "menus_items_locales_parent_id_idx" ON "menus_items_locales" USING btree ("_parent_id");
  CREATE INDEX "menus_tenant_idx" ON "menus" USING btree ("tenant_id");
  CREATE INDEX "menus_updated_at_idx" ON "menus" USING btree ("updated_at");
  CREATE INDEX "menus_created_at_idx" ON "menus" USING btree ("created_at");
  CREATE INDEX "promotions_tenant_idx" ON "promotions" USING btree ("tenant_id");
  CREATE INDEX "promotions_image_idx" ON "promotions" USING btree ("image_id");
  CREATE INDEX "promotions_updated_at_idx" ON "promotions" USING btree ("updated_at");
  CREATE INDEX "promotions_created_at_idx" ON "promotions" USING btree ("created_at");
  CREATE UNIQUE INDEX "promotions_locales_locale_parent_id_unique" ON "promotions_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "promotions_locales_parent_id_idx" ON "promotions_locales" USING btree ("_parent_id");
  CREATE INDEX "tags_tenant_idx" ON "tags" USING btree ("tenant_id");
  CREATE INDEX "tags_updated_at_idx" ON "tags" USING btree ("updated_at");
  CREATE INDEX "tags_created_at_idx" ON "tags" USING btree ("created_at");
  CREATE UNIQUE INDEX "tags_locales_locale_parent_id_unique" ON "tags_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "tags_locales_parent_id_idx" ON "tags_locales" USING btree ("_parent_id");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_category_id_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_menus_fk" FOREIGN KEY ("menus_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_promotions_fk" FOREIGN KEY ("promotions_id") REFERENCES "public"."promotions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tags_fk" FOREIGN KEY ("tags_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_category_idx" ON "posts" USING btree ("category_id");
  CREATE INDEX "_posts_v_version_version_category_idx" ON "_posts_v" USING btree ("version_category_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");
  CREATE INDEX "payload_locked_documents_rels_menus_id_idx" ON "payload_locked_documents_rels" USING btree ("menus_id");
  CREATE INDEX "payload_locked_documents_rels_promotions_id_idx" ON "payload_locked_documents_rels" USING btree ("promotions_id");
  CREATE INDEX "payload_locked_documents_rels_tags_id_idx" ON "payload_locked_documents_rels" USING btree ("tags_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "media_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_points" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_points_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_audiences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_heading_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_section_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_section_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_section_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_video" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_video_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_buttons_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_buttons_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_heading" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_heading_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_video" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_video_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_buttons_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_buttons_buttons_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_buttons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus_items_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus_items_children_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "menus" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "promotions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "promotions_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tags_locales" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_rels" CASCADE;
  DROP TABLE "_posts_v_rels" CASCADE;
  DROP TABLE "media_rels" CASCADE;
  DROP TABLE "services_points" CASCADE;
  DROP TABLE "services_points_locales" CASCADE;
  DROP TABLE "services_audiences" CASCADE;
  DROP TABLE "services" CASCADE;
  DROP TABLE "services_locales" CASCADE;
  DROP TABLE "pages_blocks_heading" CASCADE;
  DROP TABLE "pages_blocks_heading_locales" CASCADE;
  DROP TABLE "pages_blocks_section_buttons" CASCADE;
  DROP TABLE "pages_blocks_section_buttons_locales" CASCADE;
  DROP TABLE "pages_blocks_section" CASCADE;
  DROP TABLE "pages_blocks_section_locales" CASCADE;
  DROP TABLE "pages_blocks_video" CASCADE;
  DROP TABLE "pages_blocks_video_locales" CASCADE;
  DROP TABLE "pages_blocks_buttons_buttons" CASCADE;
  DROP TABLE "pages_blocks_buttons_buttons_locales" CASCADE;
  DROP TABLE "pages_blocks_buttons" CASCADE;
  DROP TABLE "_pages_v_blocks_heading" CASCADE;
  DROP TABLE "_pages_v_blocks_heading_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_section_buttons" CASCADE;
  DROP TABLE "_pages_v_blocks_section_buttons_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_section" CASCADE;
  DROP TABLE "_pages_v_blocks_section_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_video" CASCADE;
  DROP TABLE "_pages_v_blocks_video_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_buttons_buttons" CASCADE;
  DROP TABLE "_pages_v_blocks_buttons_buttons_locales" CASCADE;
  DROP TABLE "_pages_v_blocks_buttons" CASCADE;
  DROP TABLE "menus_items_children" CASCADE;
  DROP TABLE "menus_items_children_locales" CASCADE;
  DROP TABLE "menus_items" CASCADE;
  DROP TABLE "menus_items_locales" CASCADE;
  DROP TABLE "menus" CASCADE;
  DROP TABLE "promotions" CASCADE;
  DROP TABLE "promotions_locales" CASCADE;
  DROP TABLE "tags" CASCADE;
  DROP TABLE "tags_locales" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT "posts_category_id_categories_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_category_id_categories_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_services_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_menus_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_promotions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tags_fk";
  
  ALTER TABLE "categories_usage" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_categories_usage";
  CREATE TYPE "public"."enum_categories_usage" AS ENUM('gallery', 'prices');
  ALTER TABLE "categories_usage" ALTER COLUMN "value" SET DATA TYPE "public"."enum_categories_usage" USING "value"::"public"."enum_categories_usage";
  ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DATA TYPE text;
  DROP TYPE "public"."enum_audit_logs_action";
  CREATE TYPE "public"."enum_audit_logs_action" AS ENUM('create', 'update', 'delete');
  ALTER TABLE "audit_logs" ALTER COLUMN "action" SET DATA TYPE "public"."enum_audit_logs_action" USING "action"::"public"."enum_audit_logs_action";
  DROP INDEX "posts_category_idx";
  DROP INDEX "_posts_v_version_version_category_idx";
  DROP INDEX "payload_locked_documents_rels_services_id_idx";
  DROP INDEX "payload_locked_documents_rels_menus_id_idx";
  DROP INDEX "payload_locked_documents_rels_promotions_id_idx";
  DROP INDEX "payload_locked_documents_rels_tags_id_idx";
  ALTER TABLE "posts" DROP COLUMN "category_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_category_id";
  ALTER TABLE "media" DROP COLUMN "is_public";
  ALTER TABLE "events" DROP COLUMN "type";
  ALTER TABLE "events_locales" DROP COLUMN "hours";
  ALTER TABLE "pages_blocks_button" DROP COLUMN "style";
  ALTER TABLE "_pages_v_blocks_button" DROP COLUMN "style";
  ALTER TABLE "categories_locales" DROP COLUMN "description";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "services_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "menus_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "promotions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tags_id";
  DROP TYPE "public"."enum_services_audiences";
  DROP TYPE "public"."enum_services_icon";
  DROP TYPE "public"."enum_events_type";
  DROP TYPE "public"."enum_pages_blocks_heading_level";
  DROP TYPE "public"."enum_pages_blocks_section_buttons_style";
  DROP TYPE "public"."enum_pages_blocks_section_image_position";
  DROP TYPE "public"."enum_pages_blocks_section_background";
  DROP TYPE "public"."enum_pages_blocks_buttons_buttons_style";
  DROP TYPE "public"."enum_pages_blocks_button_style";
  DROP TYPE "public"."enum__pages_v_blocks_heading_level";
  DROP TYPE "public"."enum__pages_v_blocks_section_buttons_style";
  DROP TYPE "public"."enum__pages_v_blocks_section_image_position";
  DROP TYPE "public"."enum__pages_v_blocks_section_background";
  DROP TYPE "public"."enum__pages_v_blocks_buttons_buttons_style";
  DROP TYPE "public"."enum__pages_v_blocks_button_style";
  DROP TYPE "public"."enum_menus_items_children_type";
  DROP TYPE "public"."enum_menus_items_children_anchor";
  DROP TYPE "public"."enum_menus_items_type";
  DROP TYPE "public"."enum_menus_items_anchor";
  DROP TYPE "public"."enum_menus_location";
  DROP TYPE "public"."enum_promotions_kind";
  DROP TYPE "public"."enum_promotions_style";
  DROP TYPE "public"."enum_promotions_frequency";`)
}
