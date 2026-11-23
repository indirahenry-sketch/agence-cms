'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { CRM_ACTIVITY_KINDS, CRM_COMMERCIAL, CRM_PROJECT_STATUSES, CRM_TEMPLATE_KINDS, CRM_TYPES, commercialOf, statusForCommercial, type CrmCommercial } from '@/crm/constants'
import { fillTemplate, MAIL_VIA_OPTIONS, outlookLink, withOptOut, type MailVia } from '@/crm/emailTemplate'

import { api, qs } from '../admin/client'

/* ------------------------------------------------------------------ */
/* Types (sous-ensemble des champs utilisés ici)                       */
/* ------------------------------------------------------------------ */

type Prospect = {
  id: number
  name: string
  otherNames?: string | null
  type?: string | null
  commune?: string | null
  department?: number | null
  address?: string | null
  postalCode?: string | null
  phone?: string | null
  email?: string | null
  otherPhones?: ExtraPhone[] | null
  otherEmails?: ExtraEmail[] | null
  website?: string | null
  websiteStatus?: string | null
  need?: string | null
  siren?: string | null
  status?: string | null
  projectStatus?: string | null
  notes?: string | null
  nextFollowUpAt?: string | null
  lastContactAt?: string | null
  doNotContact?: boolean | null
  search?: number | null
  sources?: { label?: string | null; url?: string | null }[] | null
}
type ExtraPhone = { id?: string | null; number: string; label?: string | null }
type ExtraEmail = { id?: string | null; address: string; label?: string | null }
type EmailTemplate = { id: number; name: string; kind: string; subject?: string | null; body?: string | null }
type Zone = { id: number; code: string; name: string; label?: string | null }
type Activity = { id: number; kind: string; date: string; summary: string; followUpAt?: string | null; done?: boolean | null }

const SITE = [
  { value: 'site-existant', label: 'Site internet existant', tone: 'sky' },
  { value: 'sans-site', label: 'Site internet inexistant', tone: 'butter' },
] as const
const PROJECT_TONE: Record<string, string> = { 'a-faire': 'lav', 'en-cours': 'sky', 'en-livraison': 'peach', livre: 'mint' }
const COMMERCIAL_TONE = Object.fromEntries(CRM_COMMERCIAL.map((c) => [c.value, c.tone])) as Record<CrmCommercial, string>
const COMMERCIAL_DOT: Record<CrmCommercial, string> = { 'a-contacter': '🟠', contacte: '🔵', accepte: '🟢', refuse: '🔴', ferme: '⚫' }

const typeLabel = (v?: string | null) => CRM_TYPES.find((t) => t.value === v)?.label ?? ''
const kindLabel = (v?: string | null) => CRM_ACTIVITY_KINDS.find((k) => k.value === v)?.label ?? v ?? ''
const norm = (s?: string | null) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
const parisDay = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso)) : '')
const frDate = (iso?: string | null, withTime = false) =>
  iso
    ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}), timeZone: 'Europe/Paris' }).format(
        new Date(iso),
      )
    : ''
/** « 2026-11-20 » saisi dans un champ date → 9 h (heure de Paris) ce jour-là, en ISO. */
const dayToIso = (day: string) => (day ? new Date(`${day}T09:00:00${parisOffset(day)}`).toISOString() : null)
const parisOffset = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`)
  const paris = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Paris' }))
  const h = Math.round((paris.getTime() - new Date(d.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()) / 36e5)
  return `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`
}

const NotFound = () => <span className="bmuted">Non trouvé</span>
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`
/** Statuts « avant le premier e-mail » : préparer un e-mail fait passer le prospect à « Brouillon créé ». */
const BEFORE_DRAFT = new Set(['nouveau', 'a-verifier', 'qualifie', 'email-a-preparer'])

/* ------------------------------------------------------------------ */
/* Menus déroulants colorés (utilisés dans le tableau et la fiche)     */
/* ------------------------------------------------------------------ */

const CommercialSelect = ({ p, onChange, disabled }: { p: Prospect; onChange: (v: CrmCommercial) => void; disabled?: boolean }) => {
  const c = commercialOf(p.status)
  return (
    <select
      className={`bsel tone-${COMMERCIAL_TONE[c]}`}
      value={c}
      disabled={disabled}
      aria-label={`Statut commercial de ${p.name}`}
      onChange={(e) => onChange(e.target.value as CrmCommercial)}
    >
      {CRM_COMMERCIAL.map((o) => (
        <option key={o.value} value={o.value}>
          {COMMERCIAL_DOT[o.value]} {o.label}
        </option>
      ))}
    </select>
  )
}

const SiteSelect = ({ p, onChange, disabled, short }: { p: Prospect; onChange: (v: string) => void; disabled?: boolean; short?: boolean }) => {
  const known = SITE.find((s) => s.value === p.websiteStatus)
  return (
    <select
      className={`bsel tone-${known?.tone ?? 'none'}`}
      value={known?.value ?? ''}
      disabled={disabled}
      aria-label={`Site internet de ${p.name}`}
      onChange={(e) => onChange(e.target.value)}
    >
      {!known && <option value="">À vérifier</option>}
      {SITE.map((o) => (
        <option key={o.value} value={o.value}>
          {short ? o.label.replace('internet ', '') : o.label}
        </option>
      ))}
    </select>
  )
}

const ProjectSelect = ({ p, onChange, disabled }: { p: Prospect; onChange: (v: string | null) => void; disabled?: boolean }) => (
  <select
    className={`bsel tone-${PROJECT_TONE[p.projectStatus ?? ''] ?? 'none'}`}
    value={p.projectStatus ?? ''}
    disabled={disabled}
    aria-label={`Statut du projet de ${p.name}`}
    onChange={(e) => onChange(e.target.value || null)}
  >
    <option value="">— Aucun projet</option>
    {CRM_PROJECT_STATUSES.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
)

/* ------------------------------------------------------------------ */
/* Compléter les coordonnées (vérification manuelle)                   */
/* ------------------------------------------------------------------ */

/** Liens de vérification : ouverts par toi, jamais lus automatiquement par le CRM. */
const lookupLinks = (p: Prospect) => {
  const q = [p.name.replace(/^exemple\s*·\s*/i, ''), p.commune].filter(Boolean).join(' ')
  const alt = p.otherNames ? [p.otherNames, p.commune].filter(Boolean).join(' ') : ''
  return [
    ...(alt ? [{ label: `Google Maps (${p.otherNames})`, url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alt)}` }] : []),
    { label: 'Facebook', url: `https://www.google.com/search?q=${encodeURIComponent(`site:facebook.com ${alt || q}`)}` },
    { label: 'Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` },
    { label: 'Recherche Google', url: `https://www.google.com/search?q=${encodeURIComponent(`"${p.name.replace(/^exemple\s*·\s*/i, '')}" ${p.commune ?? ''} équestre`)}` },
    { label: 'Annuaire FFE', url: `https://www.google.com/search?q=${encodeURIComponent(`site:ffe.com ${q}`)}` },
    ...(p.siren ? [{ label: 'Annuaire des entreprises', url: `https://annuaire-entreprises.data.gouv.fr/entreprise/${p.siren.replace(/\D/g, '').slice(0, 9)}` }] : []),
  ]
}

const NameForm = ({ p, busy, onPatch }: { p: Prospect; busy: boolean; onPatch: (data: Partial<Prospect>) => Promise<boolean> }) => {
  const [v, setV] = useState({ name: p.name, otherNames: p.otherNames ?? '' })
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setV({ name: p.name, otherNames: p.otherNames ?? '' })
    setSaved(false)
  }, [p.id, p.name, p.otherNames])
  const changed = v.name.trim() !== p.name || v.otherNames.trim() !== (p.otherNames ?? '')
  return (
    <div className="bcoords__grid bnames">
      <label className="bfield">
        Nom
        <input type="text" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </label>
      <label className="bfield">
        Autre nom / nom d’usage
        <input type="text" value={v.otherNames} placeholder="Ex. Haras des As" onChange={(e) => setV({ ...v, otherNames: e.target.value })} />
      </label>
      <div className="brow">
        <button
          type="button"
          className="bbtn"
          disabled={busy || !changed || !v.name.trim()}
          onClick={async () => setSaved(await onPatch({ name: v.name.trim(), otherNames: v.otherNames.trim() || null }))}
        >
          Enregistrer le nom
        </button>
        {saved && !changed && <span className="bok">Enregistré ✓</span>}
      </div>
    </div>
  )
}

type Row = { value: string; label: string }
const phoneRows = (p: Prospect): Row[] => (p.otherPhones ?? []).map((t) => ({ value: t.number ?? '', label: t.label ?? '' }))
const emailRows = (p: Prospect): Row[] => (p.otherEmails ?? []).map((e) => ({ value: e.address ?? '', label: e.label ?? '' }))
const sameRows = (a: Row[], b: Row[]) => JSON.stringify(a.filter((r) => r.value.trim())) === JSON.stringify(b.filter((r) => r.value.trim()))

/** Liste de numéros ou d'adresses en plus du principal (ajout / suppression sur place). */
const ExtraList = ({
  title,
  addLabel,
  type,
  placeholder,
  rows,
  onChange,
}: {
  title: string
  addLabel: string
  type: 'tel' | 'email'
  placeholder: string
  rows: Row[]
  onChange: (rows: Row[]) => void
}) => (
  <div className="bextra">
    <span className="bextra__title">{title}</span>
    {rows.map((r, i) => (
      <div key={i} className="bextra__row">
        <input
          type={type}
          value={r.value}
          placeholder={type === 'tel' ? 'Numéro' : 'Adresse e-mail'}
          aria-label={`${title} n° ${i + 1}`}
          onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
        />
        <input
          type="text"
          value={r.label}
          placeholder={placeholder}
          aria-label={`Précision n° ${i + 1}`}
          onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
        />
        <button type="button" className="bbtn bbtn--ghost" aria-label="Retirer" title="Retirer" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
          ✕
        </button>
      </div>
    ))}
    <button type="button" className="bbtn bbtn--ghost bextra__add" onClick={() => onChange([...rows, { value: '', label: '' }])}>
      ＋ {addLabel}
    </button>
  </div>
)

const CoordsForm = ({ p, busy, onPatch }: { p: Prospect; busy: boolean; onPatch: (data: Partial<Prospect>) => Promise<boolean> }) => {
  const [v, setV] = useState({ phone: p.phone ?? '', email: p.email ?? '', website: p.website ?? '' })
  const [phones, setPhones] = useState<Row[]>(phoneRows(p))
  const [emails, setEmails] = useState<Row[]>(emailRows(p))
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setV({ phone: p.phone ?? '', email: p.email ?? '', website: p.website ?? '' })
    setPhones(phoneRows(p))
    setEmails(emailRows(p))
    setSaved(false)
  }, [p.id, p.phone, p.email, p.website, JSON.stringify(phoneRows(p)), JSON.stringify(emailRows(p))]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed =
    v.phone !== (p.phone ?? '') ||
    v.email !== (p.email ?? '') ||
    v.website !== (p.website ?? '') ||
    !sameRows(phones, phoneRows(p)) ||
    !sameRows(emails, emailRows(p))
  const emailBad = [v.email, ...emails.map((e) => e.value)].some((e) => e.trim() !== '' && !EMAIL_RE.test(e.trim()))
  const save = async () => {
    const extraPhones = phones.filter((r) => r.value.trim()).map((r) => ({ number: r.value.trim(), label: r.label.trim() || null }))
    const extraEmails = emails.filter((r) => r.value.trim()).map((r) => ({ address: r.value.trim(), label: r.label.trim() || null }))
    const data: Partial<Prospect> = {
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      website: v.website.trim() || null,
      otherPhones: extraPhones,
      otherEmails: extraEmails,
    }
    // Pas de numéro principal ? Le premier numéro ajouté le devient (idem pour l'e-mail).
    if (!data.phone && extraPhones.length) data.phone = extraPhones.shift()!.number
    if (!data.email && extraEmails.length) data.email = extraEmails.shift()!.address
    if (data.website && p.websiteStatus !== 'site-existant') data.websiteStatus = 'site-existant'
    setSaved(await onPatch(data))
  }
  return (
    <div className="bcoords">
      <h4>Chercher les coordonnées</h4>
      <div className="blookup">
        {lookupLinks(p).map((l) => (
          <a key={l.label} className="bbtn" href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
      <p className="bmuted">Ouvre une source, vérifie, puis recopie ici. N’inscris que ce qui est affiché publiquement.</p>
      <div className="bcoords__grid">
        <label className="bfield">
          Téléphone
          <input type="tel" value={v.phone} placeholder="Non trouvé" onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </label>
        <label className="bfield">
          E-mail
          <input type="email" value={v.email} placeholder="Non trouvé" onChange={(e) => setV({ ...v, email: e.target.value })} />
        </label>
        <label className="bfield">
          Site internet
          <input type="url" value={v.website} placeholder="Non trouvé" onChange={(e) => setV({ ...v, website: e.target.value })} />
        </label>
      </div>
      <ExtraList title="Autres téléphones" addLabel="Ajouter un téléphone" type="tel" placeholder="Portable, secrétariat…" rows={phones} onChange={setPhones} />
      <ExtraList title="Autres e-mails" addLabel="Ajouter un e-mail" type="email" placeholder="Gérant, réservations…" rows={emails} onChange={setEmails} />
      {emailBad && <p className="berr">Adresse e-mail invalide.</p>}
      <div className="brow">
        <button type="button" className="bbtn bbtn--primary" disabled={busy || !changed || emailBad} onClick={save}>
          Enregistrer les coordonnées
        </button>
        {saved && !changed && <span className="bok">Enregistré ✓</span>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Préparer un e-mail à partir d'un modèle                             */
/* ------------------------------------------------------------------ */

const kindOfTemplate = (v?: string | null) => CRM_TEMPLATE_KINDS.find((k) => k.value === v)?.label ?? ''

/**
 * Choisit un modèle, le personnalise avec la fiche, puis le copie ou l'ouvre dans la messagerie.
 * Rien n'est envoyé par le CMS : c'est toi qui relis et envoies.
 */
const MAIL_VIA_KEY = 'crm-mail-via'

const EmailComposer = ({ p, templates, busy, onPatch }: { p: Prospect; templates: EmailTemplate[] | null; busy: boolean; onPatch: (data: Partial<Prospect>) => Promise<boolean> }) => {
  const addresses = useMemo(() => [p.email, ...(p.otherEmails ?? []).map((e) => e.address)].filter((a): a is string => Boolean(a && a.trim())), [p.email, p.otherEmails])
  const suggested = useMemo(() => {
    if (!templates?.length) return null
    return templates.find((t) => t.kind === p.need) ?? templates[0]
  }, [templates, p.need])
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [to, setTo] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [done, setDone] = useState('')
  // Choix de la messagerie mémorisé sur cet appareil (Outlook application par défaut)
  const [via, setVia] = useState<MailVia>('app')
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MAIL_VIA_KEY)
      if (MAIL_VIA_OPTIONS.some((o) => o.value === saved)) setVia(saved as MailVia)
    } catch {
      /* stockage indisponible : on garde l'application Outlook */
    }
  }, [])
  const chooseVia = (v: MailVia) => {
    setVia(v)
    try {
      window.localStorage.setItem(MAIL_VIA_KEY, v)
    } catch {
      /* rien : le choix vaut pour cette session */
    }
  }

  const apply = useCallback(
    (t: EmailTemplate | null | undefined) => {
      setTemplateId(t?.id ?? null)
      setSubject(t ? fillTemplate(t.subject, p) : '')
      setBody(t ? withOptOut(fillTemplate(t.body, p)) : '')
      setDone('')
    },
    [p],
  )

  // Nouvelle fiche ou modèles chargés : on repart du modèle conseillé
  useEffect(() => {
    apply(suggested)
  }, [p.id, suggested]) // eslint-disable-line react-hooks/exhaustive-deps

  // Destinataire : l'adresse principale par défaut ; on garde le choix tant que les adresses existent
  useEffect(() => {
    setTo((current) => {
      const kept = current.filter((a) => addresses.includes(a))
      return kept.length ? kept : addresses.slice(0, 1)
    })
  }, [p.id, addresses.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const markDraft = async () => {
    if (p.status && BEFORE_DRAFT.has(p.status)) await onPatch({ status: 'brouillon-cree' })
  }
  const copy = async () => {
    const text = subject ? `Objet : ${subject}\n\n${body}` : body
    try {
      await navigator.clipboard.writeText(text)
      setDone('Copié ✓ Colle-le dans Outlook.')
      await markDraft()
    } catch {
      setDone('Copie impossible : sélectionne le texte et copie-le à la main.')
    }
  }
  const open = async () => {
    const link = outlookLink(via, to, subject, body)
    if (via === 'pro' || via === 'perso') {
      // Outlook web : nouvel onglet, la fiche reste ouverte ici
      if (!window.open(link, '_blank', 'noopener')) window.location.href = link
    } else {
      window.location.href = link
    }
    setDone(via === 'mailto' ? 'Ouvert dans ta messagerie ✓ Relis puis envoie.' : 'Ouvert dans Outlook ✓ Relis puis envoie.')
    await markDraft()
  }
  const missing = /\[(nom|commune|site|type) \?\]/.test(`${subject} ${body}`)

  if (templates === null) return <p className="bmuted">Chargement des modèles…</p>
  if (!templates.length)
    return (
      <p className="bmuted">
        Aucun modèle pour l’instant. <a href="/admin/collections/crm-email-templates/create">Créer un modèle d’e-mail</a>
      </p>
    )

  return (
    <div className="bmail">
      <div className="bmail__grid">
        <label className="bfield">
          Modèle
          <select value={templateId ?? ''} onChange={(e) => apply(templates.find((t) => t.id === Number(e.target.value)))}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {kindOfTemplate(t.kind) ? `· ${kindOfTemplate(t.kind)}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="bmail__dest">
          <span className="bextra__title">Destinataire{addresses.length > 1 ? 's' : ''}</span>
          {addresses.length ? (
            <div className="bmail__to">
              {addresses.map((a) => (
                <label key={a} className="bcheck">
                  <input type="checkbox" checked={to.includes(a)} onChange={(e) => setTo(e.target.checked ? [...to, a] : to.filter((x) => x !== a))} />
                  {a}
                </label>
              ))}
            </div>
          ) : (
            <span className="bmuted">Aucune adresse : ajoute-la dans les coordonnées, ou copie le texte.</span>
          )}
        </div>
      </div>
      <label className="bfield">
        Objet
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      <label className="bfield">
        Texte (modifiable avant envoi)
        <textarea className="btextarea" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
      </label>
      {missing && <p className="bwarn">Il manque une information sur la fiche : complète les passages entre crochets avant d’envoyer.</p>}
      <div className="brow">
        <button type="button" className="bbtn" disabled={busy || !body.trim()} onClick={copy}>
          Copier le texte
        </button>
        <button type="button" className="bbtn bbtn--primary" disabled={busy || !to.length || !body.trim()} onClick={open}>
          {via === 'mailto' ? 'Ouvrir dans ma messagerie' : 'Ouvrir dans Outlook'}
        </button>
        <label className="bmail__via">
          via
          <select value={via} onChange={(e) => chooseVia(e.target.value as MailVia)}>
            {MAIL_VIA_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {done && <span className="bok">{done}</span>}
      </div>
      <p className="bmuted">
        La phrase « répondez STOP » est ajoutée en fin de texte : elle permet au prospect de refuser (règle de la CNIL). Rien n’est envoyé par le CMS. Le prospect passe en « Brouillon créé » ; une fois l’e-mail parti, note-le dans l’historique.{' '}
        <a href="/admin/collections/crm-email-templates">Gérer les modèles</a>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Entreprise fermée ? (Annuaire des entreprises, par le SIREN)         */
/* ------------------------------------------------------------------ */

type ClosedResult = { checked: number; closed: { id: number; name: string; closedOn?: string | null }[]; errors: number }
const checkClosed = (id?: number) =>
  api<ClosedResult>('/crm-check-closed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id ? { id } : {}) })

const ClosedCheckButton = ({ p, onReload }: { p: Prospect; onReload: () => Promise<void> }) => {
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setMsg(''), [p.id])
  return (
    <div className="brow">
      <button
        type="button"
        className="bbtn bbtn--ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            const r = await checkClosed(p.id)
            if (r.closed.length) {
              setMsg('Fermée : passée en « N’existe plus ».')
              await onReload()
            } else setMsg(r.errors ? 'Annuaire injoignable, réessaie plus tard.' : 'Toujours en activité ✓')
          } catch (e) {
            setMsg(e instanceof Error ? e.message : 'Erreur')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Vérification…' : 'Existe-t-elle encore ?'}
      </button>
      {msg && <span className="bmuted">{msg}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fiche individuelle (panneau latéral)                                */
/* ------------------------------------------------------------------ */

const Fiche = ({
  p,
  zone,
  onClose,
  onPatch,
  onReload,
  busy,
  templates,
}: {
  p: Prospect
  zone?: Zone
  templates: EmailTemplate[] | null
  onClose: () => void
  onPatch: (data: Partial<Prospect>) => Promise<boolean>
  onReload: () => Promise<void>
  busy: boolean
}) => {
  const [notes, setNotes] = useState(p.notes ?? '')
  const [notesSaved, setNotesSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [activities, setActivities] = useState<Activity[] | null>(null)
  const [form, setForm] = useState({ kind: 'appel', summary: '', followUp: '' })
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')

  const loadActivities = useCallback(async () => {
    const res = await api<{ docs: Activity[] }>(`/crm-activities?${qs({ 'where[prospect][equals]': p.id, sort: '-date', depth: 0, limit: 100 })}`)
    setActivities(res.docs)
  }, [p.id])

  useEffect(() => {
    setNotes(p.notes ?? '')
    setNotesSaved('idle')
    setActivities(null)
    loadActivities().catch((e) => setErr(e.message))
  }, [p.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.classList.add('bfiche-open')
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('bfiche-open')
    }
  }, [onClose])

  const saveNotes = async () => {
    setNotesSaved('saving')
    setNotesSaved((await onPatch({ notes })) ? 'saved' : 'idle')
  }

  const addActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.summary.trim()) return
    setAdding(true)
    setErr('')
    try {
      await api('/crm-activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect: p.id, kind: form.kind, summary: form.summary.trim(), date: new Date().toISOString(), followUpAt: dayToIso(form.followUp) }),
      })
      setForm({ kind: 'appel', summary: '', followUp: '' })
      await Promise.all([loadActivities(), onReload()])
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Erreur')
    } finally {
      setAdding(false)
    }
  }

  const toggleDone = async (a: Activity) => {
    setActivities((list) => list?.map((x) => (x.id === a.id ? { ...x, done: !a.done } : x)) ?? null)
    try {
      await api(`/crm-activities/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !a.done }) })
      await onReload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
      await loadActivities()
    }
  }

  const today = parisDay(new Date().toISOString())
  const next = parisDay(p.nextFollowUpAt)

  return (
    <div className="bfiche" role="dialog" aria-modal="true" aria-label={`Fiche ${p.name}`}>
      <button type="button" className="bfiche__backdrop" aria-label="Fermer" onClick={onClose} />
      <aside className="bfiche__panel">
        <header className="bfiche__head">
          <div>
            <h2>{p.name}</h2>
            {p.otherNames && <p className="bmuted">Aussi connu comme : {p.otherNames}</p>}
            <p className="bmuted">
              {[typeLabel(p.type), p.commune, zone?.label].filter(Boolean).join(' · ') || 'Informations à compléter'}
            </p>
          </div>
          <button type="button" className="bfiche__close" onClick={onClose} aria-label="Fermer la fiche">
            ✕
          </button>
        </header>
        {p.status === 'ferme' && <p className="bwarn bfiche__closed">Cette entreprise n’existe plus (fermée). Elle n’est plus proposée dans les relances ni les recherches ; la fiche est gardée pour éviter de la recréer.</p>}

        {p.doNotContact && p.status !== 'ferme' && <p className="bwarn">Ne plus contacter : ce prospect a refusé toute sollicitation.</p>}
        {!p.doNotContact && (
          <div className="brow bfiche__stop">
            <button
              type="button"
              className="bbtn bbtn--ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`${p.name} ne sera plus jamais proposé ni relancé, même s’il est réimporté. Continuer ?`)) void onPatch({ status: 'ne-plus-contacter' })
              }}
            >
              ⊘ Ne plus contacter
            </button>
            <span className="bmuted">S’il a répondu « STOP » ou refusé d’être sollicité.</span>
          </div>
        )}

        <section className="bfiche__block">
          <div className="bfiche__selects">
            <label>
              Statut commercial
              <CommercialSelect p={p} disabled={busy} onChange={(v) => onPatch({ status: statusForCommercial(v, p.status) })} />
            </label>
            <label>
              Site internet
              <SiteSelect p={p} disabled={busy} onChange={(v) => onPatch({ websiteStatus: v })} />
            </label>
            <label>
              Statut du projet
              <ProjectSelect p={p} disabled={busy} onChange={(v) => onPatch({ projectStatus: v })} />
            </label>
          </div>
        </section>

        <section className="bfiche__block">
          <h3>Coordonnées</h3>
          <dl className="bdl">
            <dt>Téléphone</dt>
            <dd>
              {p.phone ? <a href={telHref(p.phone)}>{p.phone}</a> : <NotFound />}
              {(p.otherPhones ?? []).map((t, i) => (
                <div key={t.id ?? i}>
                  <a href={telHref(t.number)}>{t.number}</a>
                  {t.label && <span className="bmuted"> · {t.label}</span>}
                </div>
              ))}
            </dd>
            <dt>E-mail</dt>
            <dd>
              {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <NotFound />}
              {(p.otherEmails ?? []).map((e, i) => (
                <div key={e.id ?? i}>
                  <a href={`mailto:${e.address}`}>{e.address}</a>
                  {e.label && <span className="bmuted"> · {e.label}</span>}
                </div>
              ))}
            </dd>
            <dt>Site</dt>
            <dd>
              {p.website ? (
                <a href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">
                  {p.website.replace(/^https?:\/\/(www\.)?/, '')} ↗
                </a>
              ) : (
                <NotFound />
              )}
            </dd>
            <dt>Adresse</dt>
            <dd>{[p.address, p.postalCode, p.commune].filter(Boolean).join(', ') || <NotFound />}</dd>
            {p.siren && (
              <>
                <dt>SIREN</dt>
                <dd>
                  {p.siren}
                  {p.status !== 'ferme' && <ClosedCheckButton p={p} onReload={onReload} />}
                </dd>
              </>
            )}
          </dl>
          {(p.sources?.length ?? 0) > 0 && (
            <>
              <h4>Liens et sources</h4>
              <ul className="blinks">
                {p.sources!.map((s, i) => (
                  <li key={i}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.label || s.url} ↗
                      </a>
                    ) : (
                      s.label
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <NameForm p={p} busy={busy} onPatch={onPatch} />
          <CoordsForm p={p} busy={busy} onPatch={onPatch} />
          <a className="bbtn bbtn--ghost" href={`/admin/collections/crm-prospects/${p.id}`}>
            Fiche complète
          </a>
        </section>

        <section className="bfiche__block">
          <h3>Préparer un e-mail</h3>
          <EmailComposer p={p} templates={templates} busy={busy} onPatch={onPatch} />
        </section>

        <section className="bfiche__block">
          <h3>Relance</h3>
          <div className="brow">
            <label className="bfield">
              Prochaine relance
              <input
                type="date"
                value={next}
                disabled={busy}
                onChange={(e) => onPatch({ nextFollowUpAt: dayToIso(e.target.value) })}
                className={next && next < today ? 'blate' : ''}
              />
            </label>
            <span className="bmuted">{p.lastContactAt ? `Dernier contact : ${frDate(p.lastContactAt)}` : 'Aucun contact enregistré'}</span>
          </div>
        </section>

        <section className="bfiche__block">
          <h3>Notes personnelles</h3>
          <textarea
            className="btextarea"
            rows={4}
            value={notes}
            placeholder="Tes remarques sur ce prospect…"
            onChange={(e) => {
              setNotes(e.target.value)
              setNotesSaved('idle')
            }}
          />
          <div className="brow">
            <button type="button" className="bbtn" disabled={notesSaved === 'saving' || notes === (p.notes ?? '')} onClick={saveNotes}>
              Enregistrer les notes
            </button>
            {notesSaved === 'saved' && <span className="bok">Enregistré ✓</span>}
          </div>
        </section>

        <section className="bfiche__block">
          <h3>Historique des échanges</h3>
          <form className="badd" onSubmit={addActivity}>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} aria-label="Type d’échange">
              {CRM_ACTIVITY_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Résumé (ex. : messagerie, rappeler)"
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              aria-label="Résumé"
            />
            <label className="bfield bfield--inline">
              Relancer le
              <input type="date" value={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.value })} />
            </label>
            <button type="submit" className="bbtn bbtn--primary" disabled={adding || !form.summary.trim()}>
              Ajouter
            </button>
          </form>
          {err && <p className="berr">{err}</p>}
          {activities === null ? (
            <p className="bmuted">Chargement…</p>
          ) : activities.length ? (
            <ul className="bhist">
              {activities.map((a) => (
                <li key={a.id}>
                  <div>
                    <b>{kindLabel(a.kind)}</b> <span className="bmuted">· {frDate(a.date, true)}</span>
                    <p>{a.summary}</p>
                  </div>
                  {a.followUpAt && (
                    <label className={`bcheck ${!a.done && parisDay(a.followUpAt) < today ? 'blate' : ''}`}>
                      <input type="checkbox" checked={Boolean(a.done)} onChange={() => toggleDone(a)} />
                      Relance du {frDate(a.followUpAt)} {a.done ? 'faite' : ''}
                    </label>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="bmuted">Aucun échange pour l’instant.</p>
          )}
        </section>
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page : compteurs, filtres, tableau                                  */
/* ------------------------------------------------------------------ */

type Filters = { q: string; dep: string; com: string; site: string; proj: string; search: string; reserve: '' | 'only' | 'all' }
const EMPTY: Filters = { q: '', dep: '', com: '', site: '', proj: '', search: '', reserve: '' }
/** Réserve « À compléter » : ni téléphone ni e-mail (et pas « ne plus contacter »). Calculée, jamais stockée. */
const inReserve = (p: Prospect) => !p.doNotContact && !String(p.phone ?? '').trim() && !String(p.email ?? '').trim()

export const CrmBaseTable: React.FC = () => {
  const [prospects, setProspects] = useState<Prospect[] | null>(null)
  const [zones, setZones] = useState<Map<number, Zone>>(new Map())
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [filters, setFilters] = useState<Filters>(EMPTY)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [openId, setOpenId] = useState<number | null>(null)
  const [busy, setBusy] = useState<Set<number>>(new Set())
  const [templates, setTemplates] = useState<EmailTemplate[] | null>(null)

  const load = useCallback(async () => {
    const [p, z] = await Promise.all([
      api<{ docs: Prospect[] }>(`/crm-prospects?${qs({ depth: 0, limit: 0, pagination: 'false', sort: 'name' })}`),
      api<{ docs: Zone[] }>(`/crm-zones?${qs({ depth: 0, limit: 0, pagination: 'false', sort: 'code' })}`),
    ])
    setProspects(p.docs)
    setZones(new Map(z.docs.map((x) => [x.id, x])))
  }, [])

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // Modèles d'e-mails (une erreur ici ne bloque pas le tableau)
    api<{ docs: EmailTemplate[] }>(`/crm-email-templates?${qs({ depth: 0, limit: 0, pagination: 'false', sort: 'name' })}`)
      .then((r) => setTemplates(r.docs))
      .catch(() => setTemplates([]))
    // Ouvre directement une fiche si l'adresse contient ?fiche=ID
    const params = new URLSearchParams(window.location.search)
    const id = Number(params.get('fiche'))
    if (id) setOpenId(id)
    const rech = params.get('recherche')
    if (rech && /^\d+$/.test(rech)) setFilters((f) => ({ ...f, search: rech }))
    // Recherche venue du tableau de bord : ?q=texte
    const dep = params.get('dep')
    if (dep && /^\d+$/.test(dep)) setFilters((f) => ({ ...f, dep }))
    const text = params.get('q')
    if (text) setFilters((f) => ({ ...f, q: text }))
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  /** Enregistre une modification (affichée tout de suite, annulée si l'enregistrement échoue). */
  const patch = useCallback(async (id: number, data: Partial<Prospect>, quiet = false): Promise<boolean> => {
    let before: Prospect | undefined
    setProspects((list) => list?.map((p) => (p.id === id ? ((before = p), { ...p, ...data }) : p)) ?? null)
    setBusy((s) => new Set(s).add(id))
    try {
      const res = await api<{ doc: Prospect }>(`/crm-prospects/${id}?depth=0`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      setProspects((list) => list?.map((p) => (p.id === id ? res.doc : p)) ?? null)
      if (!quiet) setToast(`Enregistré : ${res.doc.name}`)
      return true
    } catch (e) {
      if (before) setProspects((list) => list?.map((p) => (p.id === id ? before! : p)) ?? null)
      setToast(`Non enregistré : ${e instanceof Error ? e.message : 'erreur'}`)
      return false
    } finally {
      setBusy((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }
  }, [])

  const reloadOne = useCallback(async (id: number) => {
    const doc = await api<Prospect>(`/crm-prospects/${id}?depth=0`)
    setProspects((list) => list?.map((p) => (p.id === id ? doc : p)) ?? null)
  }, [])

  const all = prospects ?? []
  const counts = useMemo(() => {
    const c = { total: all.length, 'a-contacter': 0, contacte: 0, accepte: 0, refuse: 0, ferme: 0, livre: 0 }
    for (const p of all) {
      c[commercialOf(p.status)]++
      if (p.projectStatus === 'livre') c.livre++
    }
    return c
  }, [all])

  const depOptions = useMemo(() => {
    const ids = new Set(all.map((p) => p.department).filter(Boolean) as number[])
    return [...ids].map((id) => zones.get(id)).filter(Boolean).sort((a, b) => a!.code.localeCompare(b!.code)) as Zone[]
  }, [all, zones])

  const rows = useMemo(() => {
    const q = norm(filters.q.trim())
    return all.filter((p) => {
      if (filters.dep === 'none' ? p.department : filters.dep && String(p.department) !== filters.dep) return false
      if (filters.search && String(p.search ?? '') !== filters.search) return false
      if (filters.reserve === 'only' ? !inReserve(p) : filters.reserve === '' && inReserve(p) && !filters.q) return false
      if (filters.com && commercialOf(p.status) !== filters.com) return false
      if (filters.site === 'a-verifier' ? SITE.some((s) => s.value === p.websiteStatus) : filters.site && p.websiteStatus !== filters.site) return false
      if (filters.proj === 'none' ? p.projectStatus : filters.proj && p.projectStatus !== filters.proj) return false
      if (q && ![p.name, p.otherNames, p.commune, p.email, p.phone, p.website].some((v) => norm(v).includes(q))) return false
      return true
    })
  }, [all, filters])

  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY)
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const bulk = async (make: (p: Prospect) => Partial<Prospect>, label: string) => {
    const targets = all.filter((p) => selected.has(p.id))
    let ok = 0
    for (const p of targets) if (await patch(p.id, make(p), true)) ok++
    setToast(`${label} : ${ok} prospect${ok > 1 ? 's' : ''} mis à jour${ok < targets.length ? `, ${targets.length - ok} en échec` : ''}`)
    setSelected(new Set())
  }

  const open = openId ? all.find((p) => p.id === openId) : undefined
  const counter = (key: keyof typeof counts, label: string, tone: string, onClick: () => void, active: boolean) => (
    <button type="button" className={`bcount tone-${tone}${active ? ' on' : ''}`} onClick={onClick} aria-pressed={active}>
      <b>{counts[key]}</b>
      <span>{label}</span>
    </button>
  )

  if (error) return <p className="berr">Impossible de charger les prospects : {error}</p>
  if (!prospects) return <p className="bmuted">Chargement des prospects…</p>

  return (
    <div className="bbase">
      <div className="bcounts">
        {counter('total', 'Prospects', 'lav', () => setFilters({ ...EMPTY, reserve: 'all' }), JSON.stringify(filters) === JSON.stringify({ ...EMPTY, reserve: 'all' }))}
        {CRM_COMMERCIAL.map((c) =>
          counter(c.value, c.label === 'Contacté' ? 'Contactés' : c.label === 'Accepté' ? 'Acceptés' : c.label === 'Refusé' ? 'Refusés' : c.label, c.tone, () => setFilters({ ...EMPTY, reserve: 'all', com: c.value }), filters.com === c.value && filters.proj === ''),
        )}
        {counter('livre', 'Sites livrés', 'mint', () => setFilters({ ...EMPTY, reserve: 'all', proj: 'livre' }), filters.proj === 'livre' && filters.com === '')}
        <button type="button" className={`bcount tone-butter${filters.reserve === 'only' ? ' on' : ''}`} onClick={() => setFilters({ ...EMPTY, reserve: 'only' })} aria-pressed={filters.reserve === 'only'}>
          <b>{all.filter(inReserve).length}</b>
          <span>À compléter</span>
        </button>
        <button
          type="button"
          className="bcount bcount--action"
          title="Vérifie dans l’Annuaire des entreprises (par le SIREN) si des prospects ont fermé"
          onClick={async () => {
            setToast('Vérification des entreprises fermées…')
            try {
              const r = await checkClosed()
              await load()
              setToast(r.closed.length ? `${r.closed.length} entreprise(s) fermée(s) passée(s) en « N’existe plus » : ${r.closed.map((c) => c.name).join(', ')}` : `Aucune fermeture trouvée (${r.checked} vérifiée(s))${r.errors ? `, ${r.errors} non joignable(s)` : ''}`)
            } catch (e) {
              setToast(e instanceof Error ? e.message : 'Erreur')
            }
          }}
        >
          <b>⚫</b>
          <span>Vérifier les fermetures</span>
        </button>
      </div>

      <div className="bfilters ccard">
        <input
          type="search"
          className="bsearch"
          placeholder="Rechercher un nom, une commune, un e-mail, un téléphone…"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          aria-label="Rechercher"
        />
        <select value={filters.dep} onChange={(e) => setFilters({ ...filters, dep: e.target.value })} aria-label="Département">
          <option value="">Tous les départements</option>
          {depOptions.map((z) => (
            <option key={z.id} value={String(z.id)}>
              {z.label ?? `${z.code} · ${z.name}`}
            </option>
          ))}
          <option value="none">Sans département</option>
        </select>
        <select value={filters.com} onChange={(e) => setFilters({ ...filters, com: e.target.value })} aria-label="Statut commercial">
          <option value="">Tous les statuts</option>
          {CRM_COMMERCIAL.map((c) => (
            <option key={c.value} value={c.value}>
              {COMMERCIAL_DOT[c.value]} {c.label}
            </option>
          ))}
        </select>
        <select value={filters.site} onChange={(e) => setFilters({ ...filters, site: e.target.value })} aria-label="Site internet">
          <option value="">Site : tous</option>
          {SITE.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
          <option value="a-verifier">Site à vérifier</option>
        </select>
        <select value={filters.proj} onChange={(e) => setFilters({ ...filters, proj: e.target.value })} aria-label="Statut du projet">
          <option value="">Projet : tous</option>
          {CRM_PROJECT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
          <option value="none">Aucun projet</option>
        </select>
        <select value={filters.reserve} onChange={(e) => setFilters({ ...filters, reserve: e.target.value as Filters['reserve'] })} aria-label="Réserve">
          <option value="">Joignables (téléphone ou e-mail)</option>
          <option value="only">À compléter (sans contact)</option>
          <option value="all">Tous, y compris à compléter</option>
        </select>
        {filtered && (
          <button type="button" className="bbtn bbtn--ghost" onClick={() => setFilters(EMPTY)}>
            Effacer les filtres
          </button>
        )}
      </div>

      {filters.search && (
        <p className="bbanner">
          Prospects trouvés par la recherche n° {filters.search}.{' '}
          <button type="button" className="bbtn bbtn--ghost" onClick={() => setFilters({ ...filters, search: '' })}>
            Voir tous les prospects
          </button>
        </p>
      )}

      {selected.size > 0 && (
        <div className="bbulk" role="region" aria-label="Actions sur la sélection">
          <b>
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
          </b>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value as CrmCommercial
              if (v) bulk((p) => ({ status: statusForCommercial(v, p.status) }), 'Statut commercial')
            }}
            aria-label="Changer le statut commercial de la sélection"
          >
            <option value="">Statut commercial…</option>
            {CRM_COMMERCIAL.map((c) => (
              <option key={c.value} value={c.value}>
                {COMMERCIAL_DOT[c.value]} {c.label}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) bulk(() => ({ projectStatus: v === 'none' ? null : v }), 'Statut du projet')
            }}
            aria-label="Changer le statut du projet de la sélection"
          >
            <option value="">Statut du projet…</option>
            {CRM_PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value="none">Aucun projet</option>
          </select>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (v) bulk(() => ({ websiteStatus: v }), 'Site internet')
            }}
            aria-label="Changer la catégorie de site de la sélection"
          >
            <option value="">Site internet…</option>
            {SITE.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="bbtn bbtn--ghost" onClick={() => setSelected(new Set())}>
            Tout désélectionner
          </button>
        </div>
      )}

      <div className="btable-wrap ccard">
        <p className="bmuted bshown">
          {rows.length} prospect{rows.length > 1 ? 's' : ''} affiché{rows.length > 1 ? 's' : ''}
          {rows.length !== all.length ? ` sur ${all.length}` : ''}
        </p>
        {rows.length ? (
          <table className="btable">
            <thead>
              <tr>
                <th className="bcol-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                    aria-label="Tout sélectionner"
                  />
                </th>
                <th>Nom</th>
                <th>Commune</th>
                <th>Département</th>
                <th>Téléphone</th>
                <th>E-mail</th>
                <th>Site internet</th>
                <th>Statut commercial</th>
                <th>Projet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const z = p.department ? zones.get(p.department) : undefined
                const isBusy = busy.has(p.id)
                return (
                  <tr key={p.id} className={`${selected.has(p.id) ? 'sel' : ''}${p.doNotContact ? ' stop' : ''}`}>
                    <td className="bcol-check">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Sélectionner ${p.name}`} />
                    </td>
                    <td data-label="Nom" className="bcol-name">
                      <button type="button" className="bname" onClick={() => setOpenId(p.id)}>
                        <b>{p.name}</b>
                        <small>{[p.otherNames, typeLabel(p.type)].filter(Boolean).join(' · ')}</small>
                      </button>
                    </td>
                    <td data-label="Commune">{p.commune || <NotFound />}</td>
                    <td data-label="Département">{z ? z.label ?? z.code : <NotFound />}</td>
                    <td data-label="Téléphone">{p.phone ? <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a> : <NotFound />}</td>
                    <td data-label="E-mail" className="bcol-email">
                      {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <NotFound />}
                    </td>
                    <td data-label="Site internet">
                      <div className="bsitecell">
                        <SiteSelect p={p} short disabled={isBusy} onChange={(v) => patch(p.id, { websiteStatus: v })} />
                        {p.website && (
                          <a href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer" title={p.website} aria-label="Ouvrir le site">
                            ↗
                          </a>
                        )}
                      </div>
                    </td>
                    <td data-label="Statut commercial">
                      <CommercialSelect p={p} disabled={isBusy} onChange={(v) => patch(p.id, { status: statusForCommercial(v, p.status) })} />
                    </td>
                    <td data-label="Projet">
                      <ProjectSelect p={p} disabled={isBusy} onChange={(v) => patch(p.id, { projectStatus: v })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="bmuted">
            {all.length ? 'Aucun prospect ne correspond à ces filtres.' : 'Aucun prospect pour l’instant.'}{' '}
            {!all.length && (
              <>
                <a href="/admin/collections/crm-prospects/create">Ajouter le premier</a> ou <a href="/admin/prospection/import">importer un fichier</a>.
              </>
            )}
          </p>
        )}
      </div>

      {open &&
        createPortal(
        <Fiche
          p={open}
          zone={open.department ? zones.get(open.department) : undefined}
          busy={busy.has(open.id)}
          onClose={() => setOpenId(null)}
          onPatch={(data) => patch(open.id, data)}
          onReload={() => reloadOne(open.id)}
          templates={templates}
        />,
          document.body,
        )}
      {toast && (
        <div className="btoast" role="status">
          {toast}
        </div>
      )}
    </div>
  )
}

export default CrmBaseTable
