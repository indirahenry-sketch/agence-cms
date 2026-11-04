import { ValidationError, type FieldHook } from 'payload'

import { extractID } from '@/access/roles'

export const slugify = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

/**
 * Génère le slug à partir du titre s'il est vide, et vérifie qu'il est unique
 * POUR CE CLIENT (deux clients peuvent avoir chacun une page « contact »).
 */
export const uniqueSlugPerTenant =
  (collection: 'pages' | 'posts', sourceField = 'title'): FieldHook =>
  async ({ value, data, originalDoc, req, operation }) => {
    if (operation !== 'create' && operation !== 'update') return value

    const source = (data?.[sourceField] ?? originalDoc?.[sourceField]) as string | undefined
    const slug = slugify((value as string) || source || '')
    if (!slug) return value

    const tenantID = extractID(data?.tenant ?? originalDoc?.tenant)
    if (tenantID === null) return slug

    const existing = await req.payload.find({
      collection,
      overrideAccess: true,
      req,
      locale: req.locale ?? undefined,
      limit: 1,
      depth: 0,
      draft: true,
      where: {
        and: [
          { slug: { equals: slug } },
          { tenant: { equals: tenantID } },
          ...(originalDoc?.id ? [{ id: { not_equals: originalDoc.id } }] : []),
        ],
      },
    })

    if (existing.docs.length > 0) {
      throw new ValidationError({
        collection,
        errors: [{ path: 'slug', message: `L'adresse « ${slug} » est déjà utilisée pour ce client.` }],
      })
    }
    return slug
  }
