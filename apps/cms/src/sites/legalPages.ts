import type { Payload, PayloadRequest } from 'payload'

import type { SiteInfo, Tenant } from '@/payload-types'

/**
 * Modèles de pages prêts à l'emploi : mentions légales, politique de confidentialité, contact.
 *
 * Créés en BROUILLON, pré-remplis avec la fiche du client : il complète les [crochets]
 * (SIRET, forme juridique…) puis publie. Les mentions légales sont obligatoires pour un
 * site professionnel en France (loi pour la confiance dans l'économie numérique, art. 6).
 * Une page dont l'adresse existe déjà chez ce client n'est jamais recréée ni écrasée.
 */
export const LEGAL_PAGE_SLUGS = ['mentions-legales', 'politique-de-confidentialite', 'contact'] as const

type Paragraph = string | { bold: string; text: string }

const textNode = (text: string, bold = false) => ({ type: 'text', text, format: bold ? 1 : 0, style: '', mode: 'normal', detail: 0, version: 1 })

/** Paragraphes → texte riche (Lexical). { bold, text } = un début en gras. */
const rich = (...paragraphs: Paragraph[]) => ({
  root: {
    type: 'root',
    format: '' as const,
    indent: 0,
    version: 1,
    direction: 'ltr' as const,
    children: paragraphs.map((p) => ({
      type: 'paragraph',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      textFormat: 0,
      children: typeof p === 'string' ? [textNode(p)] : [textNode(p.bold, true), textNode(` ${p.text}`)],
    })),
  },
})

const heading = (text: string) => ({ blockType: 'heading' as const, text, level: 'h2' as const })
const text = (...p: Paragraph[]) => ({ blockType: 'text' as const, content: rich(...p) })

export async function createLegalPages(
  payload: Payload,
  tenantOrID: Tenant | number,
  req?: Partial<PayloadRequest>,
): Promise<string[]> {
  const tenant =
    typeof tenantOrID === 'object' ? tenantOrID : ((await payload.findByID({ collection: 'tenants', id: tenantOrID, depth: 0, overrideAccess: true, req })) as Tenant)
  const { docs: infos } = await payload.find({ collection: 'site-info', where: { tenant: { equals: tenant.id } }, limit: 1, depth: 0, overrideAccess: true, req })
  const info = infos[0] as SiteInfo | undefined

  const name = tenant.name
  const email = info?.email || tenant.email || '[e-mail]'
  const phone = info?.phone || tenant.phone || '[téléphone]'
  const addr = info?.address?.street ? info.address : tenant.address
  const address = addr?.street ? `${addr.street}, ${[addr.postalCode, addr.city].filter(Boolean).join(' ')}` : '[adresse]'
  const telHref = phone.startsWith('[') ? '#contact' : `tel:${phone.replace(/[^\d+]/g, '')}`
  const mailHref = email.startsWith('[') ? '#contact' : `mailto:${email}`
  const year = new Date().getFullYear()

  const pages = [
    {
      slug: 'mentions-legales',
      title: 'Mentions légales',
      seo: { title: `Mentions légales · ${name}`, description: `Informations légales du site ${name}.` },
      layout: [
        heading('Éditeur du site'),
        text(
          { bold: name, text: `, ${address}.` },
          `Téléphone : ${phone}. E-mail : ${email}.`,
          'Forme juridique et capital : [à compléter]. SIRET : [à compléter]. RCS ou répertoire des métiers : [à compléter].',
          'Directeur ou directrice de la publication : [nom et prénom].',
        ),
        heading('Hébergement'),
        text('Hébergeur : [nom, adresse et téléphone de l’hébergeur, fournis par votre agence].'),
        heading('Propriété intellectuelle'),
        text(
          `Les textes, photos, logos et vidéos de ce site appartiennent à ${name} ou à leurs auteurs. Toute reproduction sans autorisation est interdite.`,
          `© ${year} ${name}.`,
        ),
        heading('Données personnelles'),
        text('Voir notre politique de confidentialité.'),
      ],
    },
    {
      slug: 'politique-de-confidentialite',
      title: 'Politique de confidentialité',
      seo: { title: `Politique de confidentialité · ${name}`, description: `Comment ${name} protège vos données personnelles.` },
      layout: [
        heading('En bref'),
        text(
          'Ce site ne dépose aucun cookie publicitaire ni de suivi : aucun bandeau de consentement n’est donc nécessaire.',
          'La fréquentation est mesurée de façon anonyme, sans cookie et sans conserver votre adresse IP.',
        ),
        heading('Données que vous nous transmettez'),
        text(
          `Quand vous nous écrivez (${email}) ou nous appelez, nous utilisons vos coordonnées uniquement pour vous répondre. Elles ne sont ni vendues ni transmises à des tiers.`,
          'Durée de conservation : [à compléter, par exemple 3 ans après notre dernier échange].',
        ),
        heading('Vos droits'),
        text(
          `Vous pouvez demander l’accès, la rectification ou la suppression de vos données en écrivant à ${email}.`,
          'Vous pouvez aussi adresser une réclamation à la CNIL (cnil.fr).',
        ),
        heading('Responsable du traitement'),
        text(`${name}, ${address}.`),
      ],
    },
    {
      slug: 'contact',
      title: 'Contact',
      seo: { title: `Contact · ${name}`, description: `Contacter ${name} : téléphone, e-mail et adresse.` },
      layout: [
        {
          blockType: 'section' as const,
          eyebrow: 'Nous contacter',
          title: 'Une question ? Écrivez-nous ou appelez-nous',
          content: rich({ bold: 'Téléphone :', text: phone }, { bold: 'E-mail :', text: email }, { bold: 'Adresse :', text: address }),
          background: 'card' as const,
          buttons: [
            { label: 'Appeler', url: telHref, style: 'primary' as const },
            { label: 'Envoyer un e-mail', url: mailHref, style: 'secondary' as const },
          ],
        },
      ],
    },
  ]

  const created: string[] = []
  for (const page of pages) {
    const { totalDocs } = await payload.count({
      collection: 'pages',
      where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: page.slug } }] },
      overrideAccess: true,
      req,
    })
    if (totalDocs) continue
    await payload.create({
      collection: 'pages',
      data: { tenant: tenant.id, ...page, _status: 'draft' },
      draft: true,
      overrideAccess: true,
      req,
    })
    created.push(page.title)
  }
  return created
}
