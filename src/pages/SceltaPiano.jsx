import { useEffect, useState } from 'react'
import { PIANI, MODULI, TERMINALE_IN_PIU, ATTIVAZIONE, prezzoMensile, euro } from '../lib/piani.js'
import { avviaPagamento, cambiaScelta, chiediContatto, osservaContatto, osservaVendita, scegliFree } from '../lib/db.js'
import { EMAIL_CONTATTI } from '../lib/prodotto.js'
import { venditaPulita, pianiInVendita, moduloVisibile, eGratuito } from '../lib/vendita.js'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): piano, moduli in più, terminali;
// il prezzo del mese si aggiorna mentre si sceglie; «Vai al pagamento»
// apre il Checkout di Stripe. Finché le chiavi di Stripe non ci sono, il
// tasto spiega che l'abbonamento si attiva con noi.
// `modifica`: il cliente ha già un abbonamento e cambia piano o moduli
// (REQ-FLOTTA-010): niente Checkout, si aggiorna e la licenza segue.
// IL FREE (REQ-FLOTTA-015): c'è solo se l'admin lo mette in vendita, e non
// a chi cambia un abbonamento a pagamento; non ha moduli né terminali in
// più, e si attiva senza pagamento. Un modulo tolto dalla vendita non si
// mostra, a meno che il cliente non lo abbia già.
// PAGAMENTI ONLINE SPENTI (REQ-FLOTTA-017): finché l'admin non li accende,
// al posto del Checkout il titolare lascia un recapito e lo contattiamo
// noi; il pagamento si concorda fuori dal sito e il piano lo attiva l'admin.
export default function SceltaPiano({ cliente, modifica = false, vai = (url) => window.location.assign(url) }) {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  const [piano, setPiano] = useState(cliente.piano && !eGratuito(cliente.piano) ? cliente.piano : 'base')
  const [moduli, setModuli] = useState(cliente.moduli || [])
  const [terminali, setTerminali] = useState(cliente.terminali || 1)
  const [errore, setErrore] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const [fatto, setFatto] = useState(null)
  const [telefono, setTelefono] = useState('')
  const [nota, setNota] = useState('')
  const [contatto, setContatto] = useState(null)
  useEffect(() => osservaContatto(cliente.uid, setContatto), [cliente.uid])
  const gratuito = eGratuito(piano)
  // Il Checkout serve solo a chi comincia un piano a pagamento.
  const daContattare = !gratuito && !modifica && !vendita.pagamenti_online
  const scelta = gratuito ? { piano, moduli: [], terminali: 1 } : { piano, moduli, terminali }
  const p = PIANI[piano]
  const inclusi = new Set(p.include)
  const giaSuoi = cliente.moduli || []
  const piani = pianiInVendita(vendita).filter((x) => !(x.gratuito && (modifica || cliente.piano === x.id)))

  const conferma = async () => {
    setErrore(null)
    setFatto(null)
    setInCorso(true)
    try {
      if (gratuito) {
        await scegliFree()
        setFatto('Piano Free attivo: ora puoi attivare il locale.')
        setInCorso(false)
        return
      }
      if (daContattare) {
        await chiediContatto({ ...scelta, telefono, nota })
        setFatto(`Richiesta inviata: ti contattiamo a ${cliente.email || 'la tua email'}${telefono ? ` o al ${telefono}` : ''}.`)
        setInCorso(false)
        return
      }
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
        {piani.map((x) => (
          <label key={x.id} className={`opzione${piano === x.id ? ' scelta' : ''}`}>
            <input type="radio" name="piano" value={x.id} checked={piano === x.id} onChange={() => setPiano(x.id)} />
            <strong>{x.nome}</strong> · {euro(x.prezzo)} / mese
            <div className="muted small">{x.descrizione}</div>
          </label>
        ))}
      </div>
      {!gratuito && (
        <>
          <h4>Moduli in più</h4>
          {MODULI.filter((m) => moduloVisibile(vendita, m.id, giaSuoi)).map((m) => (
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
        </>
      )}
      <p className="prezzo" data-testid="prezzo-scelta">
        {euro(prezzoMensile(scelta))}{' '}
        <span className="muted small">{gratuito ? '/ mese, senza pagamento' : `/ mese, IVA esclusa · attivazione ${euro(ATTIVAZIONE)} una volta`}</span>
      </p>
      {daContattare && (
        <div className="contatto" data-testid="contatto">
          <p className="muted small">
            I pagamenti online non sono ancora attivi. Lasciaci un recapito: ti contattiamo per attivare il piano e concordare il
            pagamento. Puoi anche scriverci a <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>.
          </p>
          {contatto?.stato === 'aperta' && (
            <p className="muted small" data-testid="contatto-aperto">
              Hai già chiesto di essere contattato il {new Date(contatto.chiesta_il).toLocaleDateString('it-IT')}: una richiesta
              nuova prende il posto di quella.
            </p>
          )}
          <label htmlFor="telefono">Telefono (facoltativo)</label>
          <input id="telefono" type="tel" value={telefono} maxLength={20} onChange={(e) => setTelefono(e.target.value)} />
          <label htmlFor="nota">Una nota (facoltativa: orari, domande)</label>
          <textarea id="nota" rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      )}
      {errore && <p className="errore">{errore}</p>}
      {fatto && <p className="muted small">{fatto}</p>}
      <button type="button" className="btn" disabled={inCorso} onClick={conferma}>
        {inCorso ? 'Un momento…' : gratuito ? 'Attiva il Free' : modifica ? 'Aggiorna il piano' : daContattare ? 'Chiedi di essere contattato' : 'Vai al pagamento'}
      </button>
    </section>
  )
}
