import { useState } from 'react'
import { PIANI, MODULI, TERMINALE_IN_PIU, ATTIVAZIONE, prezzoMensile, euro } from '../lib/piani.js'
import { avviaPagamento, cambiaScelta } from '../lib/db.js'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): piano, moduli in più, terminali;
// il prezzo del mese si aggiorna mentre si sceglie; «Vai al pagamento»
// apre il Checkout di Stripe. Finché le chiavi di Stripe non ci sono, il
// tasto spiega che l'abbonamento si attiva con noi.
// `modifica`: il cliente ha già un abbonamento e cambia piano o moduli
// (REQ-FLOTTA-010): niente Checkout, si aggiorna e la licenza segue.
export default function SceltaPiano({ cliente, modifica = false, vai = (url) => window.location.assign(url) }) {
  const [piano, setPiano] = useState(cliente.piano || 'base')
  const [moduli, setModuli] = useState(cliente.moduli || [])
  const [terminali, setTerminali] = useState(cliente.terminali || 1)
  const [errore, setErrore] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const [fatto, setFatto] = useState(null)
  const scelta = { piano, moduli, terminali }
  const p = PIANI[piano]
  const inclusi = new Set(p.include)

  const paga = async () => {
    setErrore(null)
    setFatto(null)
    setInCorso(true)
    try {
      if (modifica) {
        await cambiaScelta(scelta)
        setFatto('Piano aggiornato: le funzioni nuove si accendono nell’app entro un minuto.')
        setInCorso(false)
        return
      }
      const { url } = await avviaPagamento(scelta)
      vai(url)
    } catch (e) {
      setErrore(e.message)
      setInCorso(false)
    }
  }

  return (
    <section className="card" aria-label="Scelta del piano">
      <h3>{modifica ? 'Cambia piano o moduli' : 'Scegli il piano'}</h3>
      <div className="scelta-piani">
        {Object.values(PIANI).map((x) => (
          <label key={x.id} className={`opzione${piano === x.id ? ' scelta' : ''}`}>
            <input type="radio" name="piano" value={x.id} checked={piano === x.id} onChange={() => setPiano(x.id)} />
            <strong>{x.nome}</strong> · {euro(x.prezzo)} / mese
            <div className="muted small">{x.descrizione}</div>
          </label>
        ))}
      </div>
      <h4>Moduli in più</h4>
      {MODULI.map((m) => (
        <label key={m.id} className="opzione">
          <input
            type="checkbox"
            checked={inclusi.has(m.id) || moduli.includes(m.id)}
            disabled={inclusi.has(m.id)}
            onChange={(e) => setModuli((v) => (e.target.checked ? [...new Set([...v, m.id])] : v.filter((id) => id !== m.id)))}
          />
          {m.nome} · {inclusi.has(m.id) ? <span className="muted small">incluso</span> : `${euro(m.prezzo)} / mese`}
        </label>
      ))}
      <label htmlFor="terminali">Terminali (oltre {p.terminali || 1} {p.terminali > 1 ? 'inclusi' : 'incluso'}: {euro(TERMINALE_IN_PIU)} / mese ciascuno)</label>
      <input id="terminali" type="number" min={1} max={10} value={terminali} onChange={(e) => setTerminali(Math.max(1, Number(e.target.value) || 1))} />
      <p className="prezzo" data-testid="prezzo-scelta">
        {euro(prezzoMensile(scelta))} <span className="muted small">/ mese, IVA esclusa · attivazione {euro(ATTIVAZIONE)} una volta</span>
      </p>
      {errore && <p className="errore">{errore}</p>}
      {fatto && <p className="muted small">{fatto}</p>}
      <button type="button" className="btn" disabled={inCorso} onClick={paga}>
        {inCorso ? 'Un momento…' : modifica ? 'Aggiorna il piano' : 'Vai al pagamento'}
      </button>
    </section>
  )
}
