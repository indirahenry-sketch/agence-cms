import type { Payload } from 'payload'

import { CONTENT_ROLES, hasTenantRole, isSuperAdmin } from '@/access/roles'

/**
 * « Modifier depuis le site » : quand un utilisateur CONNECTÉ au CMS (et autorisé à modifier
 * ce client) visite son site, une barre et des crayons apparaissent sur chaque section ;
 * un clic ouvre directement le bon écran du CMS. Les visiteurs ne voient rien.
 *
 * Fonctionne à l'adresse /sites/<client> (même origine que le CMS, donc même cookie de
 * session). Sur le nom de domaine du client, le cookie n'existe pas : rien n'est ajouté.
 * La page n'affiche que des liens : toutes les modifications passent par le CMS et ses droits.
 */
export type EditContext = { collection?: 'pages' | 'posts'; slug?: string }

const COOKIE = /(?:^|;\s*)payload-token=/

/** Sections du site → écran du CMS (maquette Poigny et thème générique). */
const TARGETS: [selector: string, label: string, href: string][] = [
  ['.promo-banner', 'Bannière', '/admin/collections/promotions'],
  ['nav .links, .site-nav, header nav', 'Menu', '/admin/collections/menus'],
  ['#galerie', 'Photos', '/admin/collections/media'],
  ['#services, #activites', 'Services', '/admin/collections/services'],
  ['#tarifs', 'Tarifs', '/admin/collections/prices'],
  ['#stages', 'Agenda', '/admin/collections/events'],
  ['#calGrid', 'Agenda', '/admin/collections/events'],
  ['#posts, #actualites', 'Articles', '/admin/collections/posts'],
  ['#contact', 'Coordonnées et horaires', '/admin/collections/site-info'],
  ['footer', 'Pied de page', '/admin/collections/menus'],
]

export async function withEditBar(payload: Payload, req: Request, siteSlug: string, html: string, ctx: EditContext = {}): Promise<{ html: string; personal: boolean }> {
  // Pas sur le domaine du client, ni dans une vignette ou un aperçu affiché en iframe (tableau de bord)
  if (req.headers.get('x-site-domain') || req.headers.get('sec-fetch-dest') === 'iframe' || !COOKIE.test(req.headers.get('cookie') ?? '')) {
    return { html, personal: false }
  }
  let user: unknown
  try {
    ;({ user } = await payload.auth({ headers: req.headers }))
  } catch {
    return { html, personal: false }
  }
  if (!user) return { html, personal: false }
  const { docs } = await payload.find({ collection: 'tenants', where: { slug: { equals: siteSlug } }, limit: 1, depth: 0, overrideAccess: true })
  const tenant = docs[0]
  if (!tenant || !(isSuperAdmin(user) || hasTenantRole(user, tenant.id, CONTENT_ROLES))) return { html, personal: false }

  // « Modifier cette page » : la page ou l'article affiché, sinon l'accueil (tableau de bord)
  let pageHref = '/admin'
  let pageLabel = 'Tableau de bord'
  if (ctx.collection && ctx.slug) {
    const found = await payload.find({
      collection: ctx.collection,
      where: { and: [{ tenant: { equals: tenant.id } }, { slug: { equals: ctx.slug } }] },
      limit: 1,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    if (found.docs[0]) {
      pageHref = `/admin/collections/${ctx.collection}/${found.docs[0].id}`
      pageLabel = ctx.collection === 'pages' ? 'Modifier cette page' : 'Modifier cet article'
    }
  }

  const config = JSON.stringify({ targets: TARGETS }).replace(/</g, '\\u003c')
  const bar = `
<style>
.cms-edit-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:6px;padding:6px;border-radius:999px;background:#1e1b39;color:#fff;font:600 13px/1 system-ui,-apple-system,sans-serif;box-shadow:0 12px 34px rgba(30,27,57,.35);max-width:calc(100vw - 24px);flex-wrap:wrap;justify-content:center}
.cms-edit-bar span{padding:0 10px;opacity:.75;font-weight:500}
.cms-edit-bar a,.cms-edit-bar button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border-radius:999px;border:0;background:#2e2a52;color:#fff;font:inherit;text-decoration:none;cursor:pointer}
.cms-edit-bar a.main{background:#7c3aed}.cms-edit-bar a:hover,.cms-edit-bar button:hover{filter:brightness(1.15)}
.cms-pen{position:absolute;top:10px;right:10px;z-index:2147482999;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;background:#7c3aed;color:#fff !important;font:600 12px/1 system-ui,-apple-system,sans-serif;text-decoration:none !important;box-shadow:0 6px 16px rgba(124,58,237,.35);opacity:.92}
.cms-pen:hover{opacity:1}.cms-pen svg{width:14px;height:14px}
.cms-edit-on [data-cms-edit]{outline:2px dashed rgba(124,58,237,.45);outline-offset:-2px}
html.cms-edit-off .cms-pen{display:none}html.cms-edit-off [data-cms-edit]{outline:0}
</style>
<div class="cms-edit-bar" role="region" aria-label="Mode édition">
<span>Mode édition · ${escapeHTML(tenant.name)}</span>
<a class="main" href="${pageHref}">${pageLabel}</a>
<a href="/admin">Tableau de bord</a>
<button type="button" id="cmsEditToggle" aria-pressed="true">Masquer les crayons</button>
</div>
<script>(function(){var c=${config},pen='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
document.documentElement.classList.add('cms-edit-on');var seen=[];
c.targets.forEach(function(t){var el=document.querySelector(t[0]);if(!el||seen.indexOf(el)>-1)return;seen.push(el);
if(getComputedStyle(el).position==='static')el.style.position='relative';el.setAttribute('data-cms-edit','');
var a=document.createElement('a');a.className='cms-pen';a.href=t[2];if(el.offsetHeight<90){a.style.top='calc(100% + 6px)'}a.innerHTML=pen+'<span></span>';a.lastChild.textContent='Modifier · '+t[1];el.appendChild(a)});
var b=document.getElementById('cmsEditToggle'),h=document.documentElement;
b.addEventListener('click',function(){var off=h.classList.toggle('cms-edit-off');b.setAttribute('aria-pressed',String(!off));b.textContent=off?'Afficher les crayons':'Masquer les crayons'})})();</script>
`
  const at = html.lastIndexOf('</body>')
  return { html: at >= 0 ? html.slice(0, at) + bar + html.slice(at) : html + bar, personal: true }
}

const escapeHTML = (v: string) => v.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
