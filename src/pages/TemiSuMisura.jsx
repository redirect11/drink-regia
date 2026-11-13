import { useEffect, useState } from 'react'
import { osservaTemiSuMisura, osservaCassettoAI, creaTemaDaMockup, gestisciTemiSuMisura, chiediTemaSuMisura } from '../lib/db.js'
import { IMPAGINAZIONI, nomeImpaginazione, ORIGINI_DETTE, coloriDelTema, nomeStile } from '../lib/temi.js'
import { statoCredito, euroCent } from '../lib/ai.js'
import { Anteprima } from './CatalogoTemi.jsx'

// I TEMI SU MISURA DEL LOCALE (REQ-FLOTTA-040). L'utente, 06/11/2026: un
// servizio premium col mockup di un tema fatto con Canva, che col credito
// AI diventa un tema del locale; e i temi fatti da noi su richiesta. Qui il
// titolare vede i suoi, carica un mockup, o chiede un tema al fornitore. I
// temi arrivano all'app con la licenza: nel marketplace, fra i suoi.

const FORMATI = 'image/jpeg,image/png,image/webp,image/gif,application/pdf'
const MAX_IMMAGINE = 5 * 1024 * 1024
const MAX_PDF = 20 * 1024 * 1024

// Il file in base64, senza il prefisso «data:…;base64,».
export const leggiBase64 = (file) =>
  new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader()
    lettore.onload = () => risolvi(String(lettore.result).replace(/^data:[^;]*;base64,/, ''))
    lettore.onerror = () => rifiuta(new Error('Il file non si è letto.'))
    lettore.readAsDataURL(file)
  })

// `ai`: il piano comprende l'AI? Il Free no (REQ-FLOTTA-087): il tema dal
// mockup non si chiede, quelli fatti da noi sì.
export default function TemiSuMisura({ uid, slug, ai = true }) {
  const [temi, setTemi] = useState([])
  const [cassetto, setCassetto] = useState(null)
  const [errore, setErrore] = useState(null)
  const [avviso, setAvviso] = useState(null)
  useEffect(() => osservaTemiSuMisura(uid, setTemi), [uid])
  useEffect(() => osservaCassettoAI(slug, setCassetto), [slug])
  const credito = statoCredito(cassetto)

  const azione = async (nome, id) => {
    setErrore(null)
    try {
      await gestisciTemiSuMisura(nome, { id })
    } catch (e) {
      setErrore(e.message)
    }
  }

  return (
    <section className="card" aria-label="Temi su misura">
      <h3>Temi su misura</h3>
      <p className="muted small">
        Un tema fatto per il tuo locale, oltre a quelli del marketplace: dal mockup che hai disegnato (con Canva o uno strumento simile),
        col credito AI; oppure fatto da noi, su richiesta. I temi arrivano all’app con la licenza: li trovi nel marketplace, fra i tuoi, e li
        provi e li usi come gli altri.
      </p>
      {temi.length > 0 && (
        <ul className="temi-su-misura" aria-label="I tuoi temi">
          {temi.map((t) => (
            <li key={t.id} data-testid={`su-misura-${t.id}`} className={t.stato === 'pubblicato' ? '' : 'ritirato'}>
              <Anteprima colori={coloriDelTema(t.tavolozza)} tema={t} />
              <div className="muted small">
                {ORIGINI_DETTE[t.origine] || t.origine}
                {t.ricetta?.impaginazione && ` · ${nomeImpaginazione(t.ricetta.impaginazione)}`}
                {!t.ricetta && ` · stile ${nomeStile(t.stile)}`}
                {t.stato !== 'pubblicato' && ' · tolto dalla licenza'}
              </div>
              {t.da_verificare?.length > 0 && (
                <ul className="small da-verificare">
                  {t.da_verificare.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
              {t.stato === 'pubblicato' ? (
                <button type="button" className="btn ghost small" onClick={() => azione('ritira', t.id)}>
                  Rimuovi
                </button>
              ) : (
                <button type="button" className="btn ghost small" onClick={() => azione('pubblica', t.id)}>
                  Rimetti
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {ai ? (
        <DalMockup credito={credito} onErrore={setErrore} onFatto={setAvviso} />
      ) : (
        <p className="muted small" data-testid="mockup-senza-ai">
          Il piano Free non comprende le funzioni AI: il tema dal mockup si chiede con un piano a pagamento. Un tema fatto da noi si chiede
          qui sotto.
        </p>
      )}
      <DalFornitore onErrore={setErrore} onFatto={setAvviso} />
      {avviso && <p className="muted small">{avviso}</p>}
      {errore && <p className="errore small">{errore}</p>}
    </section>
  )
}

// Il tema dal mockup: un file (foto o PDF), la struttura del menù, una
// nota. Il modello legge il mockup e propone il tema; la regia lo controlla
// e lo mette fra i temi del locale. Costa come le altre richieste AI.
function DalMockup({ credito, onErrore, onFatto }) {
  const [file, setFile] = useState(null)
  const [struttura, setStruttura] = useState(IMPAGINAZIONI[0].id)
  const [note, setNote] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const troppoGrande = file && file.size > (file.type === 'application/pdf' ? MAX_PDF : MAX_IMMAGINE)
  const senzaCredito = !credito || !credito.attivo || credito.credito <= 0

  const invia = async (e) => {
    e.preventDefault()
    if (!file || troppoGrande) return
    onErrore(null)
    onFatto(null)
    setInCorso(true)
    try {
      const esito = await creaTemaDaMockup({ file: await leggiBase64(file), media_type: file.type, struttura, note })
      onFatto(`Tema «${esito.tema.nome}» pronto: lo trovi qui sopra e nel marketplace dell’app. Costo ${euroCent(esito.costo_eur)}, credito rimasto ${euroCent(esito.credito_eur)}.`)
      setFile(null)
      setNote('')
      e.target.reset()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="tema-dal-mockup" aria-label="Un tema dal tuo mockup" onSubmit={invia}>
      <h4>Dal tuo mockup</h4>
      <p className="muted small">
        Esporta da Canva una pagina del menù come immagine (JPEG, PNG, WebP fino a 5 MB) o PDF (fino a 20 MB). Il modello ne ricava
        colori, caratteri e impaginazione fra quelli che l’app sa disegnare: non riproduce animazioni né immagini, e quello che non ha
        potuto fare te lo dice. Il mockup non si conserva.
      </p>
      <label htmlFor="mockup-file">Il mockup</label>
      <input id="mockup-file" type="file" accept={FORMATI} onChange={(e) => setFile(e.target.files?.[0] || null)} />
      {troppoGrande && <p className="errore small">Il file è troppo grande: riducilo prima di caricarlo.</p>}
      <label htmlFor="mockup-struttura">Struttura del menù</label>
      <select id="mockup-struttura" value={struttura} onChange={(e) => setStruttura(e.target.value)}>
        {IMPAGINAZIONI.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </select>
      <label htmlFor="mockup-note">Note (facoltative)</label>
      <textarea id="mockup-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} placeholder="es. i prezzi coi puntini, titoli in maiuscolo" />
      {senzaCredito && <p className="muted small">Serve il credito AI: lo ricarichi dal riquadro «Credito AI».</p>}
      <div className="azioni">
        <button type="submit" className="btn small" disabled={inCorso || !file || troppoGrande}>
          {inCorso ? 'Il modello sta leggendo il mockup…' : 'Crea il tema col credito AI'}
        </button>
      </div>
    </form>
  )
}

// Un tema fatto da noi: il titolare lo racconta, con la struttura del menù e
// un riferimento; la richiesta arriva all'admin fra le richieste di contatto.
function DalFornitore({ onErrore, onFatto }) {
  const [descrizione, setDescrizione] = useState('')
  const [struttura, setStruttura] = useState(IMPAGINAZIONI[0].id)
  const [riferimento, setRiferimento] = useState('')
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e) => {
    e.preventDefault()
    onErrore(null)
    onFatto(null)
    setInCorso(true)
    try {
      await chiediTemaSuMisura({ descrizione, struttura, riferimento })
      onFatto('Richiesta inviata: ti scriviamo noi per concordare il tema.')
      setDescrizione('')
      setRiferimento('')
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="tema-dal-fornitore" aria-label="Un tema dal fornitore" onSubmit={invia}>
      <h4>Fatto da noi</h4>
      <p className="muted small">Raccontaci il tema che vuoi: lo disegniamo noi e te lo mettiamo fra i tuoi temi. Il costo si concorda.</p>
      <label htmlFor="tema-descrizione">Com’è il tema</label>
      <textarea id="tema-descrizione" value={descrizione} onChange={(e) => setDescrizione(e.target.value)} required minLength={10} maxLength={500} rows={3} placeholder="colori, atmosfera, a cosa deve somigliare" />
      <label htmlFor="tema-struttura">Struttura del menù</label>
      <select id="tema-struttura" value={struttura} onChange={(e) => setStruttura(e.target.value)}>
        {IMPAGINAZIONI.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </select>
      <label htmlFor="tema-riferimento">Un riferimento (facoltativo)</label>
      <input id="tema-riferimento" value={riferimento} onChange={(e) => setRiferimento(e.target.value)} maxLength={300} placeholder="il link a Canva, un sito, un locale" />
      <div className="azioni">
        <button type="submit" className="btn ghost small" disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Chiedi il tema'}
        </button>
      </div>
    </form>
  )
}
