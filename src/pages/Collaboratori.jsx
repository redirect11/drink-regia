import { useCallback, useEffect, useState } from 'react'
import { gestisciCollaboratori } from '../lib/db.js'

// I COLLABORATORI DI UN LOCALE (REQ-FLOTTA-098, REQ-FLOTTA-099). Daniele,
// 14/11/2026: «implementa 1 e 2». Lo stesso riquadro per il titolare, nella
// sua area (/dashboard/collaboratori), e per l'admin, nella scheda del
// locale: con `slug` lavora su quel locale, e la Function lo accetta solo
// dall'admin. Il titolare resta uno, quello che paga: i collaboratori
// vedono il locale e aprono l'app, niente abbonamento.
//
// Nessun link da mandare: la regia crea l'account (senza password) e il
// collaboratore entra con «Password dimenticata», che gli arriva nella sua
// casella, o con Google. Funziona anche col sito chiuso.

const dataDi = (iso) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '')
const DA_CHI = { titolare: 'dal titolare', admin: 'dall’amministratore' }

export default function Collaboratori({ slug = null }) {
  const [elenco, setElenco] = useState(null)
  const [massimo, setMassimo] = useState(5)
  const [email, setEmail] = useState('')
  const [errore, setErrore] = useState(null)
  const [avviso, setAvviso] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  // Lo slug va solo all'admin: per il titolare la regia usa il suo locale.
  const conSlug = useCallback((dati = {}) => (slug ? { slug, ...dati } : dati), [slug])

  const carica = useCallback(async () => {
    try {
      const r = await gestisciCollaboratori('elenco', conSlug())
      setElenco(r?.collaboratori || [])
      if (r?.massimo) setMassimo(r.massimo)
    } catch (e) {
      setErrore(e.message)
    }
  }, [conSlug])

  useEffect(() => {
    carica()
  }, [carica])

  const pieno = (elenco?.length ?? 0) >= massimo

  const aggiungi = async (e) => {
    e.preventDefault()
    setErrore(null)
    setAvviso(null)
    setInCorso(true)
    try {
      await gestisciCollaboratori('aggiungi', conSlug({ email: email.trim() }))
      setAvviso(
        `Aggiunto. Per entrare va su ${window.location.origin}/accedi, scrive ${email.trim()} e tocca «Password dimenticata»: gli arriva il messaggio per scegliere la password. Con una Gmail può entrare anche con Google.`
      )
      setEmail('')
      await carica()
    } catch (err) {
      setErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  const togli = async (m) => {
    if (!window.confirm(`Togliere ${m.email} dai collaboratori? Non vedrà più il locale e non aprirà più l’app dalla regia.`)) return
    setErrore(null)
    setAvviso(null)
    try {
      await gestisciCollaboratori('togli', conSlug({ uid: m.uid }))
      await carica()
    } catch (err) {
      setErrore(err.message)
    }
  }

  return (
    <section className="card" aria-label="Collaboratori">
      <h3>Collaboratori</h3>
      <p className="muted small">
        Un collaboratore entra nella regia col suo account: vede il locale, il piano e lo stato dell’app, e apre l’app da qui. Abbonamento, pagamenti,
        piano e chiusura del locale restano del titolare. Per aprire l’app gli serve nel gestionale un account admin con la stessa email.
      </p>
      {elenco === null && !errore && <p className="muted">Carico…</p>}
      {elenco?.length === 0 && <p className="muted">Nessun collaboratore.</p>}
      {elenco?.length > 0 && (
        <ul className="elenco-collaboratori">
          {elenco.map((m) => (
            <li key={m.uid}>
              <span>{m.email}</span>
              <span className="muted small">
                {' '}
                · dal {dataDi(m.aggiunto_il)}
                {slug && DA_CHI[m.aggiunto_da] ? `, aggiunto ${DA_CHI[m.aggiunto_da]}` : ''}
              </span>{' '}
              <button type="button" className="btn ghost small" aria-label={`Togli ${m.email}`} onClick={() => togli(m)}>
                Togli
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={aggiungi} aria-label="Aggiungi un collaboratore">
        <div className="campo">
          <label htmlFor={`collaboratore-${slug || 'mio'}`}>Email del collaboratore</label>
          <input id={`collaboratore-${slug || 'mio'}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button type="submit" className="btn" disabled={inCorso || pieno}>
          {inCorso ? 'Un momento…' : 'Aggiungi'}
        </button>
        {pieno && <p className="muted small">Al massimo {massimo} collaboratori per locale: per aggiungerne uno, togline un altro.</p>}
      </form>
      {avviso && (
        <p role="status" className="small">
          {avviso}
        </p>
      )}
      {errore && (
        <p role="alert" className="errore">
          {errore}
        </p>
      )}
    </section>
  )
}
