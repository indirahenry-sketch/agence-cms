'use client'

import React, { useCallback, useEffect, useState } from 'react'

import { api, relative } from '../admin/client'

type Settings = { autoSend: boolean; autoSendScope: 'choisis' | 'tous'; autoSendDailyCap: number; autoSendGapMinutes: number; autoSendRelances: number; replyCheck: boolean; followUpDays: number }
type Status = {
  configured: boolean
  redirectUri: string
  connected: boolean
  email: string | null
  connectedAt: string | null
  lastCheck: string | null
  error: string | null
  settings: Settings
  sentToday: number
  inWindow: boolean
  next: { id: number; name: string; kind: string; subject: string }[]
  readyCount: number
  skipped: { id: number; name: string; reason: string }[]
  skippedCount: number
}

const FLAGS: Record<string, [string, string]> = {
  ok: ['bok', 'Boîte Outlook connectée ✓'],
  annule: ['bwarn', 'Connexion annulée.'],
  refuse: ['bwarn', 'Connexion refusée : le lien a expiré ou ne venait pas d’ici. Recommence depuis cette page.'],
  erreur: ['bwarn', 'Microsoft n’a pas accepté la connexion. Vérifie MS_CLIENT_ID, MS_CLIENT_SECRET et l’adresse de retour, puis recommence.'],
  session: ['bwarn', 'Session expirée : reconnecte-toi au CMS puis recommence.'],
  config: ['bwarn', 'Outlook n’est pas encore configuré sur le serveur (voir les étapes ci-dessous).'],
}
const fiche = (id: number) => `/admin/prospection/base?fiche=${id}`

export const CrmOutlookPanel = ({ flag }: { flag: string }) => {
  const [st, setSt] = useState<Status | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const s = await api<Status>('/crm-outlook/status')
    setSt(s)
    setForm(s.settings)
  }, [])
  useEffect(() => {
    load().catch((e) => setErr(e.message))
  }, [load])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const m = await fn()
      if (m) setMsg(m)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(async () => {
      if (!form) return
      if (form.autoSend && !st?.settings.autoSend && !window.confirm(`L’envoi automatique va partir de ${st?.email ?? 'ta boîte'} : au plus ${form.autoSendDailyCap} e-mail(s) par jour, en semaine de 9 h à 18 h. Activer ?`)) {
        setForm({ ...form, autoSend: false })
        return
      }
      await api('/globals/crm-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      return 'Réglages enregistrés ✓'
    })

  if (err && !st) return <p className="bwarn">{err}</p>
  if (!st || !form) return <p className="cmuted">Chargement…</p>
  const banner = FLAGS[flag]
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v })

  return (
    <div className="cout">
      {banner && <p className={banner[0]}>{banner[1]}</p>}
      {msg && <p className="bok">{msg}</p>}
      {err && <p className="bwarn">{err}</p>}

      <section className="crm__card">
        <h2>1. Ta boîte Outlook</h2>
        {!st.configured ? (
          <>
            <p>Une seule fois, il faut autoriser le CMS auprès de Microsoft (gratuit) :</p>
            <ol className="crm__steps">
              <li>Va sur portal.azure.com avec ton compte Microsoft (un compte Azure gratuit suffit).</li>
              <li>« Inscriptions d’applications » → « Nouvelle inscription » → nom : Prospection.</li>
              <li>
                Types de comptes : <strong>« Comptes dans un annuaire d’organisation et comptes Microsoft personnels »</strong>.
              </li>
              <li>
                URI de redirection, plateforme « Web » : <code className="cout__code">{st.redirectUri}</code>
              </li>
              <li>« Certificats et secrets » → « Nouveau secret client » → copie la <strong>Valeur</strong>.</li>
              <li>
                Sur Render, ajoute <code>MS_CLIENT_ID</code> (l’« ID d’application ») et <code>MS_CLIENT_SECRET</code> (la valeur du secret), puis redéploie.
              </li>
            </ol>
            <p className="cmuted">Ne colle jamais ces valeurs dans le chat ni dans GitHub : uniquement dans Render.</p>
          </>
        ) : st.connected ? (
          <>
            <p>
              Connectée : <strong>{st.email}</strong>
              {st.connectedAt ? <span className="cmuted"> · depuis {new Date(st.connectedAt).toLocaleDateString('fr-FR')}</span> : null}
            </p>
            <p className="cmuted">
              Réponses lues {st.lastCheck ? relative(st.lastCheck) : 'jamais'} (toutes les 10 minutes). Seuls les e-mails venant d’une adresse de prospect sont notés ; le reste de ta boîte n’est pas gardé.
            </p>
            {st.error && <p className="bwarn">Dernière erreur : {st.error}</p>}
            <div className="brow">
              <button type="button" className="bbtn" disabled={busy} onClick={() => run(async () => {
                const r = await api<{ checked: number; replies: number; stops: number }>('/crm-outlook/check', { method: 'POST' })
                return r.replies ? `${r.replies} réponse(s) de prospect trouvée(s)${r.stops ? `, dont ${r.stops} « STOP »` : ''}.` : 'Aucune nouvelle réponse de prospect.'
              })}>
                Lire les réponses maintenant
              </button>
              <button type="button" className="bbtn bbtn--ghost" disabled={busy} onClick={() => {
                if (window.confirm('Déconnecter la boîte ? L’envoi automatique sera coupé.')) void run(async () => {
                  await api('/crm-outlook/disconnect', { method: 'POST' })
                  return 'Boîte déconnectée.'
                })
              }}>
                Déconnecter
              </button>
            </div>
          </>
        ) : (
          <>
            <p>Connecte la boîte d’où partent tes e-mails de prospection. Tu choisis le compte sur la page de Microsoft, puis tu acceptes : envoyer des e-mails, et lire ta boîte pour repérer les réponses.</p>
            <a className="bbtn bbtn--primary" href="/api/crm-outlook/connect">
              Connecter ma boîte Outlook
            </a>
          </>
        )}
      </section>

      <section className="crm__card">
        <h2>2. Envoi automatique</h2>
        <label className="bcheck cout__big">
          <input type="checkbox" checked={form.autoSend} disabled={!st.connected} onChange={(e) => set('autoSend', e.target.checked)} />
          Envoi automatique activé
        </label>
        {!st.connected && <p className="cmuted">Connecte d’abord ta boîte Outlook.</p>}
        <fieldset className="cout__scope">
          <legend>Pour quels prospects ?</legend>
          <label className="bcheck">
            <input type="radio" name="scope" checked={form.autoSendScope === 'choisis'} onChange={() => set('autoSendScope', 'choisis')} />
            Seulement ceux que je choisis (« Envoi automatique : Oui » sur la fiche ou par sélection dans la base)
          </label>
          <label className="bcheck">
            <input type="radio" name="scope" checked={form.autoSendScope === 'tous'} onChange={() => set('autoSendScope', 'tous')} />
            Tous, sauf ceux mis sur « Non » (les fiches « À vérifier » restent exclues)
          </label>
        </fieldset>
        <div className="cout__grid">
          <label className="bfield">
            Maximum par jour
            <input type="number" min={1} max={50} value={form.autoSendDailyCap} onChange={(e) => set('autoSendDailyCap', Number(e.target.value))} />
          </label>
          <label className="bfield">
            Écart entre deux envois (min)
            <input type="number" min={5} max={240} value={form.autoSendGapMinutes} onChange={(e) => set('autoSendGapMinutes', Number(e.target.value))} />
          </label>
          <label className="bfield">
            Relances sans réponse
            <input type="number" min={0} max={3} value={form.autoSendRelances} onChange={(e) => set('autoSendRelances', Number(e.target.value))} />
          </label>
          <label className="bfield">
            Relancer après (jours)
            <input type="number" min={1} max={60} value={form.followUpDays} onChange={(e) => set('followUpDays', Number(e.target.value))} />
          </label>
        </div>
        <label className="bcheck">
          <input type="checkbox" checked={form.replyCheck} onChange={(e) => set('replyCheck', e.target.checked)} />
          Repérer les réponses des prospects (alerte + statut « A répondu », « STOP » → Ne plus contacter)
        </label>
        <p className="cmuted">
          Règles fixes : en semaine de 9 h à 18 h, un e-mail à la fois, jamais à un prospect qui a répondu ou refusé, modèle choisi selon le besoin (Refonte ou Création), relance avec le modèle « Relance ». Une fiche à
          laquelle il manque une information du modèle est mise de côté.
        </p>
        <button type="button" className="bbtn bbtn--primary" disabled={busy} onClick={save}>
          Enregistrer
        </button>
      </section>

      <section className="crm__card">
        <h2>3. Aujourd’hui</h2>
        <p>
          <strong>
            {st.sentToday} / {st.settings.autoSendDailyCap}
          </strong>{' '}
          e-mail(s) automatique(s) envoyé(s) · {st.settings.autoSend ? (st.inWindow ? 'envoi en cours de journée' : 'en pause (hors horaires)') : 'envoi automatique coupé'}
        </p>
        <h3 className="cout__h3">Prochains envois ({st.readyCount})</h3>
        {st.next.length ? (
          <ul className="crm__list">
            {st.next.map((n) => (
              <li key={n.id}>
                <a href={fiche(n.id)}>
                  <span>
                    {n.name}
                    <small> · {n.kind === 'relance' ? 'Relance' : 'Premier e-mail'} · « {n.subject} »</small>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="crm__empty">Aucun e-mail prêt à partir.</p>
        )}
        {st.skippedCount > 0 && (
          <>
            <h3 className="cout__h3">Mis de côté ({st.skippedCount})</h3>
            <ul className="crm__list">
              {st.skipped.map((s) => (
                <li key={s.id}>
                  <a href={fiche(s.id)}>
                    <span>
                      {s.name}
                      <small> · {s.reason}</small>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
