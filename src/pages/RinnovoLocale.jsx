import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { apriPagamentoRinnovo, osservaVendita } from '../lib/db.js'
import { venditaPulita } from '../lib/vendita.js'
import { situazioneRinnovo, PARAMETRO_RINNOVO } from '../lib/rinnovo.js'
import { indirizzoSezione } from '../lib/areaTitolare.js'

// IL LOCALE SOSPESO O CHIUSO, NELL'AREA DEL TITOLARE (REQ-FLOTTA-090).
// Daniele, 13/11/2026: «Il servizio viene sospeso subito ma dobbiamo
// portare l'utente alla schermata di pagamento per il rinnovo in qualche
// modo (se prevediamo di accettare pagamenti altrimenti sito sospeso e si
// danno le info di contatto per contattarci)». L'app del locale porta qui
// con rinnovo_url della licenza (/dashboard/piano?rinnovo=1).
//
// Componenti a parte, fuori da Dashboard.jsx: la dashboard passa cliente e
// istanza che legge già, e qui si decide cosa dire (src/lib/rinnovo.js).

const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
const momento = (iso) =>
  new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

// La vendita (pagamenti online accesi o no), come la leggono CreditoAI e
// SceltaPiano: spenti finché non si sa.
function useVendita() {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  return vendita
}

const Contatti = ({ email }) => <a href={`mailto:${email}`}>{email}</a>

// IL RIQUADRO, in cima a «Piano e moduli». Con ?rinnovo=1 c'è anche col
// locale in regola: chi arriva dall'app dopo aver pagato vede che è a posto.
// `vai`: la navigazione verso Stripe (nei test si spia window.location).
export default function RinnovoLocale({ cliente, istanza, vai = (url) => window.location.assign(url) }) {
  const vendita = useVendita()
  const { search } = useLocation()
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState(null)
  const s = situazioneRinnovo({ cliente, istanza, vendita })
  const chiesto = new URLSearchParams(search).get(PARAMETRO_RINNOVO) === '1'

  if (!s) {
    if (!chiesto) return null
    return (
      <section className="card" aria-label="Rinnovo del locale">
        <h3>Il locale</h3>
        <p>Il tuo locale è attivo e l’abbonamento è in regola: non c’è niente da rinnovare.</p>
      </section>
    )
  }

  const paga = async () => {
    setErrore(null)
    setInCorso(true)
    try {
      vai((await apriPagamentoRinnovo()).url)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }

  const tasto = (nome) => (
    <button type="button" className="btn" disabled={inCorso} onClick={paga}>
      {nome}
    </button>
  )

  return (
    <section className="card avviso" aria-label="Rinnovo del locale">
      {s.tipo === 'chiuso' && (
        <>
          <h3>Il locale è chiuso</h3>
          <p>
            Il tuo locale è chiuso{s.dal ? ` dal ${giorno(s.dal)}` : ''}. Per qualsiasi domanda scrivici a <Contatti email={s.email} />.
          </p>
          <p className="muted small">
            {s.cancellazione
              ? `I dati restano conservati fino al ${giorno(s.cancellazione)}: quel giorno l’installazione e i suoi dati vengono cancellati definitivamente, dopo un backup che potrai scaricare da qui.`
              : 'Nessuna cancellazione dei dati è programmata.'}
          </p>
        </>
      )}

      {s.tipo === 'sospeso' && s.paga && (
        <>
          <h3>Il locale è sospeso</h3>
          <p>
            {s.alTaglio
              ? `L’abbonamento non risulta pagato: l’app del tuo locale si ferma al taglio della giornata, ${momento(s.alTaglio)}.`
              : `Il tuo locale è sospeso${s.dal ? ` dal ${giorno(s.dal)}` : ''} perché l’abbonamento non risulta pagato.`}
          </p>
          <p>
            Paga la fattura aperta o aggiorna il metodo di pagamento: il locale si riattiva da solo appena Stripe conferma il pagamento, di
            solito in pochi secondi.
          </p>
          {tasto('Paga e riattiva il locale')}
          <p className="muted small">
            Per qualsiasi problema scrivici a <Contatti email={s.email} />.
          </p>
        </>
      )}

      {s.tipo === 'sospeso' && !s.paga && (
        <>
          <h3>Il locale è sospeso</h3>
          {/* La frase di Daniele (13/11/2026): coi pagamenti spenti, per una
              sospensione dell'admin o un abbonamento a mano, solo i contatti. */}
          <p>
            Il tuo locale è sospeso: per riattivarlo scrivici a <Contatti email={s.email} />.
          </p>
          {s.dal && <p className="muted small">Sospeso dal {giorno(s.dal)}.</p>}
        </>
      )}

      {(s.tipo === 'in ritardo' || s.tipo === 'non pagato') && (
        <>
          <h3>{s.tipo === 'in ritardo' ? 'Pagamento in ritardo' : 'Abbonamento non pagato'}</h3>
          <p>
            {s.tipo === 'in ritardo'
              ? 'Il pagamento dell’abbonamento è in ritardo: l’ultimo addebito non è andato a buon fine e Stripe riproverà nei prossimi giorni. Se non va a buon fine, il locale viene sospeso.'
              : 'L’abbonamento risulta non pagato.'}
          </p>
          {s.paga ? (
            tasto('Paga ora')
          ) : (
            <p>
              Per rinnovarlo scrivici a <Contatti email={s.email} />.
            </p>
          )}
        </>
      )}

      {errore && <p className="errore">{errore}</p>}
    </section>
  )
}

// L'AVVISO NELLA PANORAMICA, in cima: una riga e il link al riquadro.
export function AvvisoRinnovo({ cliente, istanza }) {
  const vendita = useVendita()
  const s = situazioneRinnovo({ cliente, istanza, vendita })
  if (!s) return null
  const testo = {
    chiuso: 'Il tuo locale è chiuso.',
    sospeso: 'Il tuo locale è sospeso.',
    'in ritardo': 'Il pagamento dell’abbonamento è in ritardo.',
    'non pagato': 'L’abbonamento risulta non pagato.',
  }[s.tipo]
  const link = s.paga ? (s.tipo === 'sospeso' ? 'Paga e riattiva il locale' : 'Paga ora') : { chiuso: 'Cosa succede ai dati', sospeso: 'Come riattivarlo' }[s.tipo] || 'Come rinnovarlo'
  return (
    <section className="card avviso avviso-rinnovo" aria-label="Avviso sul locale">
      <p>
        <strong>{testo}</strong>
      </p>
      <Link to={`${indirizzoSezione('piano')}?${PARAMETRO_RINNOVO}=1`}>{link}</Link>
    </section>
  )
}
