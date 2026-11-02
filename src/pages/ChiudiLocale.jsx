import { useState } from 'react'
import { gestisciEliminazione, scaricaArchivio } from '../lib/db.js'
import { STATI } from '../lib/istanze.js'

// CHIUDERE E CANCELLARE IL PROPRIO LOCALE (REQ-FLOTTA-014), nella dashboard
// del titolare. L'utente, 29/10/2026: il titolare «può fare solo la
// richiesta di cancellazione che si cancella entro trenta giorni… e può
// scegliere anche di cancellare la disattivazione se cambia idea». L'app si
// ferma subito; la cancellazione parte dopo 30 giorni, sempre dopo un
// backup che il titolare scarica da qui per 180 giorni. Per confermare si
// scrive il nome dell'app.
const data = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })

export default function ChiudiLocale({ istanza }) {
  const [aperto, setAperto] = useState(false)
  const [conferma, setConferma] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState(null)
  const e = istanza?.eliminazione

  const esegui = async (fn) => {
    setErrore(null)
    setInCorso(true)
    try {
      await fn()
    } catch (err) {
      setErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  // Eliminato: resta solo l'archivio, finché non scade.
  if (istanza?.stato === STATI.ELIMINATA) {
    const scaricabile = e?.archivio?.zip && Date.parse(e.scade_il) > Date.now()
    return (
      <section className="card" aria-label="I dati del locale">
        <h3>I dati del locale</h3>
        <p className="muted">
          Il locale è stato eliminato il {data(istanza.eliminata_il || e.finito_il)}.
          {scaricabile
            ? ` Il backup dei tuoi dati è disponibile fino al ${data(e.scade_il)}, poi viene cancellato.`
            : ' Il backup dei dati non è più disponibile.'}
        </p>
        {scaricabile && (
          <button type="button" className="btn" disabled={inCorso} onClick={() => esegui(async () => (window.location.href = (await scaricaArchivio()).url))}>
            Scarica i dati del locale
          </button>
        )}
        {errore && <p className="errore">{errore}</p>}
      </section>
    )
  }

  if (!istanza?.progetto || istanza.stato !== STATI.ATTIVA || istanza.origine === 'esistente' || istanza.interna) return null

  // Cancellazione programmata: si vede quando, e si può annullare se l'ha
  // chiesta il titolare.
  if (e?.stato === 'programmata' || e?.stato === 'in coda' || e?.stato === 'in corso') {
    return (
      <section className="card avviso" aria-label="Cancellazione del locale">
        <h3>Cancellazione del locale</h3>
        {e.stato === 'programmata' && e.richiedente === 'conservazione' ? (
          // Fermo per il pagamento (REQ-FLOTTA-025): i dati restano 90
          // giorni, e tornare a pagare annulla la cancellazione.
          <p>
            L’app del locale è ferma{e.motivo ? ` (${e.motivo})` : ''}. I dati restano conservati fino al{' '}
            <strong>{data(e.quando)}</strong>: quel giorno l’installazione e i suoi dati verranno cancellati definitivamente, dopo
            un backup che potrai scaricare da qui per 180 giorni. Per evitarlo basta riattivare l’abbonamento.
          </p>
        ) : e.stato === 'programmata' ? (
          <p>
            Il locale è chiuso e verrà cancellato definitivamente il <strong>{data(e.quando)}</strong>, dopo un backup dei dati che
            potrai scaricare da qui per 180 giorni.
          </p>
        ) : (
          <p>Il backup e la cancellazione sono in corso.</p>
        )}
        {e.stato === 'programmata' && e.richiedente === 'titolare' && (
          <button type="button" className="btn" disabled={inCorso} onClick={() => esegui(() => gestisciEliminazione('annulla'))}>
            Annulla la cancellazione
          </button>
        )}
        {errore && <p className="errore">{errore}</p>}
      </section>
    )
  }

  // Un locale chiuso da noi (per esempio per un pagamento): qui non si
  // chiude né si riapre.
  if (istanza.licenza_stato === 'chiusa') return null

  return (
    <section className="card zona-pericolo" aria-label="Chiudi il locale">
      <h3>Chiudi il locale</h3>
      <p className="muted">
        L’app si ferma subito e l’abbonamento viene disdetto a fine periodo. Dopo 30 giorni il locale e tutti i suoi dati vengono
        cancellati definitivamente; prima facciamo un backup completo, che potrai scaricare da qui per 180 giorni. Fino alla
        cancellazione puoi annullare tutto.
      </p>
      {!aperto ? (
        <button type="button" className="btn ghost" onClick={() => setAperto(true)}>
          Chiudi e cancella il locale…
        </button>
      ) : (
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            esegui(() => gestisciEliminazione('chiedi', { conferma }))
          }}
        >
          <label htmlFor="conferma-chiusura">
            Per confermare scrivi <code>{istanza.progetto}</code>
          </label>
          <input id="conferma-chiusura" value={conferma} onChange={(ev) => setConferma(ev.target.value)} autoComplete="off" />
          <div className="azioni">
            <button type="submit" className="btn pericolo" disabled={inCorso || conferma.trim() !== istanza.progetto}>
              Chiudi e cancella fra 30 giorni
            </button>
            <button type="button" className="btn ghost" onClick={() => setAperto(false)}>
              Lascia stare
            </button>
          </div>
        </form>
      )}
      {errore && <p className="errore">{errore}</p>}
    </section>
  )
}
