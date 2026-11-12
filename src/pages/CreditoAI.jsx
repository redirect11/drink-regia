import { useEffect, useState } from 'react'
import { osservaCassettoAI, ultimiConsumiAI, ultimeRicaricheAI, avviaRicaricaAI, osservaVendita } from '../lib/db.js'
import { venditaPulita } from '../lib/vendita.js'
import { EMAIL_CONTATTI } from '../lib/prodotto.js'
import { PACCHETTI_AI, statoCredito, euroCent, daMicro, tipoDetto, esitoDetto, origineDetta } from '../lib/ai.js'

// IL CREDITO AI DEL LOCALE (REQ-AI-003): quanto resta, quanto si è speso
// questo mese contro il tetto, gli ultimi consumi, e la ricarica a
// pacchetti con Stripe. Finito il credito si fermano solo le funzioni AI
// dell'app: cassa e comande lavorano come sempre, e qui lo si dice.
// `vai` è la navigazione verso Stripe: nei test si passa una funzione
// (window.location non si spia).
// `senza`: cosa mostrare quando non c'è niente da dire (di suo, niente).
// Da quando il credito ha una sezione sua nell'area del titolare
// (REQ-FLOTTA-084), una sezione vuota non spiegherebbe nulla: lì si dice
// perché.
export default function CreditoAI({ slug, istanzaAttiva, vai = (url) => window.location.assign(url), senza = null }) {
  const [cassetto, setCassetto] = useState(undefined)
  const [consumi, setConsumi] = useState([])
  const [ricariche, setRicariche] = useState([])
  const [inCorso, setInCorso] = useState(null)
  const [errore, setErrore] = useState(null)
  // Coi pagamenti online spenti (REQ-FLOTTA-017) la ricarica la fa l'admin.
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])

  useEffect(() => osservaCassettoAI(slug, setCassetto), [slug])
  useEffect(() => {
    if (!cassetto) return
    ultimiConsumiAI(slug)
      .then(setConsumi)
      .catch(() => setConsumi([]))
    ultimeRicaricheAI(slug)
      .then(setRicariche)
      .catch(() => setRicariche([]))
  }, [slug, cassetto])

  // Senza cassetto e senza istanza attiva non c'è niente da dire: l'AI
  // lavora sull'app installata.
  if (cassetto === undefined) return null
  if (!cassetto && !istanzaAttiva) return senza
  const s = statoCredito(cassetto)

  const ricarica = async (id) => {
    setErrore(null)
    setInCorso(id)
    try {
      const { url } = await avviaRicaricaAI(id)
      vai(url)
    } catch (e) {
      setErrore(e.message)
      setInCorso(null)
    }
  }

  return (
    <section className="card" aria-label="Credito AI">
      <h3>Credito AI</h3>
      <p className="muted small">
        Le funzioni AI dell’app (descrizione dei prodotti, lettura delle fatture) e il tema dal tuo mockup consumano un credito in euro.
        Quando il credito finisce si fermano solo quelle: il resto dell’app lavora come sempre.
      </p>
      {s ? (
        <>
          <p>
            <strong data-testid="credito-ai">{euroCent(s.credito)}</strong> disponibili · questo mese {euroCent(s.spesoMese)} su un tetto di{' '}
            {euroCent(s.tetto)}
          </p>
          {!s.attivo && <p className="errore small">Le funzioni AI di questo locale sono spente: scrivici per riaccenderle.</p>}
          {s.attivo && s.credito <= 0 && <p className="errore small">Credito esaurito: le funzioni AI sono ferme finché non ricarichi.</p>}
        </>
      ) : (
        <p data-testid="credito-ai">Nessun credito ancora: con la prima ricarica le funzioni AI si possono usare.</p>
      )}

      {s?.interna ? (
        <p className="muted small">Installazione interna: il credito lo ricarica la regia.</p>
      ) : !vendita.pagamenti_online ? (
        <p className="muted small" data-testid="ricarica-a-mano">
          I pagamenti online non sono ancora attivi: per ricaricare scrivici a <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>, e
          il credito lo aggiungiamo noi.
        </p>
      ) : (
        <div className="azioni">
          {PACCHETTI_AI.map((p) => (
            <button key={p.id} type="button" className="btn ghost small" disabled={inCorso !== null} onClick={() => ricarica(p.id)}>
              {inCorso === p.id ? 'Un momento…' : `Ricarica ${euroCent(p.importo)}`}
            </button>
          ))}
        </div>
      )}
      {errore && <p className="errore small">{errore}</p>}
      {new URLSearchParams(window.location.search).get('ricarica') === 'ok' && (
        <p className="muted small">Pagamento ricevuto: il credito compare qui appena Stripe ce lo conferma, di solito in pochi secondi.</p>
      )}

      {/* Le ricariche con l'origine: un credito regalato si vede come tale. */}
      {ricariche.length > 0 && (
        <p className="muted small" data-testid="ricariche-ai">
          Ultime ricariche:{' '}
          {ricariche
            .map((r) => `${euroCent(daMicro(r.importo_microeuro))} ${origineDetta(r.origine)} il ${new Date(r.il).toLocaleDateString('it-IT')}${r.origine === 'omaggio' && r.nota ? ` («${r.nota}»)` : ''}`)
            .join(' · ')}
        </p>
      )}
      {consumi.length > 0 && (
        <table className="clienti" aria-label="Ultimi consumi AI">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Cosa</th>
              <th>Esito</th>
              <th>Costo</th>
            </tr>
          </thead>
          <tbody>
            {consumi.map((c, i) => (
              <tr key={`${c.il}-${i}`}>
                <td>{new Date(c.il).toLocaleString('it-IT')}</td>
                <td>{tipoDetto(c.tipo)}</td>
                <td>{esitoDetto(c.esito)}</td>
                <td>{euroCent(daMicro(c.costo_microeuro))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
