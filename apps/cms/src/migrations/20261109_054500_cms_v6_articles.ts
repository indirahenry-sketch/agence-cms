import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "categories_usage" ALTER COLUMN "value" SET DATA TYPE text;

  -- « Blog » fusionne dans « Articles » : une seule rubrique d'articles par client.
  -- 1. Pour chaque catégorie uniquement « blog » d'un client qui a déjà une catégorie « articles »,
  --    ses articles passent dans la catégorie « articles » (la première par ordre), puis elle est supprimée.
  CREATE TEMP TABLE _blog_merge AS
    SELECT b.id AS blog_id,
      (SELECT a.id FROM categories a JOIN categories_usage au ON au.parent_id = a.id AND au.value = 'articles'
        WHERE a.tenant_id IS NOT DISTINCT FROM b.tenant_id ORDER BY a."order", a.id LIMIT 1) AS articles_id
    FROM categories b
    WHERE EXISTS (SELECT 1 FROM categories_usage u WHERE u.parent_id = b.id AND u.value = 'blog')
      AND NOT EXISTS (SELECT 1 FROM categories_usage u WHERE u.parent_id = b.id AND u.value <> 'blog');
  DELETE FROM _blog_merge WHERE articles_id IS NULL;
  UPDATE "posts" p SET "category_id" = m.articles_id FROM _blog_merge m WHERE p."category_id" = m.blog_id;
  UPDATE "_posts_v" v SET "version_category_id" = m.articles_id FROM _blog_merge m WHERE v."version_category_id" = m.blog_id;
  DELETE FROM "categories" c USING _blog_merge m WHERE c.id = m.blog_id;
  DROP TABLE _blog_merge;

  -- 2. Ailleurs, « blog » devient « articles » (sans doublon si la catégorie avait les deux).
  DELETE FROM "categories_usage" u WHERE u.value = 'blog'
    AND EXISTS (SELECT 1 FROM categories_usage x WHERE x.parent_id = u.parent_id AND x.value = 'articles');
  UPDATE "categories_usage" SET "value" = 'articles' WHERE "value" = 'blog';

  -- 3. « Articles (actualités) » devient simplement « Articles ».
  UPDATE "categories_locales" SET "name" = 'Articles' WHERE "name" = 'Articles (actualités)';

  DROP TYPE "public"."enum_categories_usage";
  CREATE TYPE "public"."enum_categories_usage" AS ENUM('gallery', 'services', 'prices', 'articles');
  ALTER TABLE "categories_usage" ALTER COLUMN "value" SET DATA TYPE "public"."enum_categories_usage" USING "value"::"public"."enum_categories_usage";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_categories_usage" ADD VALUE 'blog';`)
}
