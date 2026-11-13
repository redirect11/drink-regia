import { useState } from 'react'
import { Link } from 'react-router-dom'
import { correggiOrari, chiediCambioOrari, decidiCambioOrari } from '../lib/db.js'
import { GIORNI, NOMI_GIORNI, MOTIVO_MINIMO, AVVISO_SENZA_PAUSA, problemiOrari, orariPuliti, orariNelModulo, giorniSenzaPausa, correggibiliFino, giornoDetto, quandoDetto } from '../lib/orari.js'
import { BASE_TITOLARE } from '../lib/areaTitolare.js'
import OrariSettimana from './OrariSettimana.jsx'

// GLI ORARI DI SERVIZIO NELL'AREA DEL TITOLARE E NEL BACKOFFICE
// (REQ-FLOTTA-095). Daniele, 13/11/2026: «Orario di servizio che non può
// cambiare se non previa approvazione nostra e che deve essere dimostrato
// in qualche modo che effettivamente l'orario di servizio è cambiato. Se
// invece è semplicemente sbagliato, possiamo dare una settimana di tempo
// per cambiarlo». Quindi:
// - nei 7 giorni (e la prima volta, per i locali di prima) il titolare li
//   corregge da sé;
// - dopo li legge, e per cambiarli manda una richiesta col motivo scritto;
// - l'admin, nella scheda del locale, approva o rifiuta con una nota.
// Il browser chiama le Functions: orari_servizio non lo scrive mai.

// Gli orari a parole, un giorno per riga.
function OrariDetti({ giorni }) {
  return (
    <dl className="locale-dati">
      {GIORNI.map((id) => (
        <div key={id}>
          <dt>{NOMI_GIORNI[id]}</dt>
          <dd>{giornoDetto(giorni?.[id])}</dd>
        </div>
      ))}
    </dl>
  )
}

function AvvisoSenzaPausa({ giorni }) {
  const senza = giorniSenzaPausa(giorni)
  if (!senza.length) return null
  return (
    <p className="avviso small" role="status">
      {AVVISO_SENZA_PAUSA}: dopo {senza.map((id) => NOMI_GIORNI[id].toLowerCase()).join(', ')} non c’è almeno un’ora fra la chiusura e l’apertura dopo.
    </p>
  )
}

// L'ultima decisione dell'admin su una richiesta, se c'è.
function ultimaDecisione(storia) {
  return [...(storia || [])].reverse().find((s) => s.tipo === 'approvata' || s.tipo === 'rifiutata') || null
}

// Nella panoramica: gli orari mancano (un locale di prima, o creato
// dall'admin). Finché mancano la sospensione arriva al taglio della
// giornata (punto 10 di Daniele, 13/11/2026).
export function AvvisoOrari({ cliente }) {
  if (cliente?.orari_servizio?.giorni) return null
  return (
    <section className="card avviso-rinnovo" aria-label="Orari di servizio da indicare">
      <p>Non hai ancora indicato gli orari di servizio del tuo locale.</p>
      <Link className="btn small" to={`${BASE_TITOLARE}/locale#orari`}>
        Indica gli orari
      </Link>
    </section>
  )
}

export default function OrariServizio({ cliente, adesso = new Date() }) {
  const os = cliente?.orari_servizio
  const fino = correggibiliFino(cliente)
  const correggibili = !os?.giorni || (fino && adesso.getTime() < Date.parse(fino))
  const [modulo, setModulo] = useState(() => orariNelModulo(os?.giorni))
  const [motivo, setMotivo] = useState('')
  const [chiedendo, setChiedendo] = useState(false)
  const [errori, setErrori] = useState({})
  const [esito, setEsito] = useState(null)
  const [errore, setErrore] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const decisione = ultimaDecisione(os?.storia)

  const manda = async (azione) => {
    const p = problemiOrari(modulo)
    if (azione === 'richiesta' && motivo.trim().length < MOTIVO_MINIMO) p.motivo = `Scrivi il motivo del cambio (almeno ${MOTIVO_MINIMO} caratteri).`
    setErrori(p)
    setEsito(null)
    setErrore(null)
    if (Object.keys(p).length) return
    setInCorso(true)
    try {
      if (azione === 'correzione') {
        await correggiOrari(orariPuliti(modulo))
        setEsito('Orari salvati.')
      } else {
        await chiediCambioOrari(orariPuliti(modulo), motivo.trim())
        setChiedendo(false)
        setMotivo('')
        setEsito('Richiesta mandata: ti rispondiamo dopo averla verificata.')
      }
    } catch (e) {
      setErrore(e?.message || 'Non è andata: riprova.')
    } finally {
      setInCorso(false)
    }
  }

  return (
    <section className="card" id="orari" aria-label="Orari di servizio">
      <h3>Orari di servizio</h3>
      {!os?.giorni && (
        <p className="muted small">
          Non li hai ancora indicati: finché mancano, se un pagamento non arriva il locale si ferma al taglio della giornata. Una volta
          salvati, li puoi correggere per 7 giorni; dopo si cambiano solo con una richiesta.
        </p>
      )}
      {os?.giorni && correggibili && (
        <p className="muted small">Li puoi correggere fino al {quandoDetto(fino)}. Dopo si cambiano solo con una richiesta, col motivo, che approviamo noi.</p>
      )}
      {os?.giorni && !correggibili && <OrariDetti giorni={os.giorni} />}
      {os?.giorni && !chiedendo && <AvvisoSenzaPausa giorni={os.giorni} />}

      {correggibili && (
        <>
          <OrariSettimana valore={modulo} onChange={setModulo} errori={errori} prefisso="correggi" disabilitato={inCorso} />
          <div className="azioni">
            <button type="button" className="btn" disabled={inCorso} onClick={() => manda('correzione')}>
              {inCorso ? 'Un momento…' : 'Salva gli orari'}
            </button>
          </div>
        </>
      )}

      {!correggibili && os?.richiesta && (
        <div className="riquadro-richiesta">
          <p>
            Richiesta di cambio in attesa, mandata il {quandoDetto(os.richiesta.chiesta_il)}. Motivo: «{os.richiesta.motivo}».
          </p>
          <OrariDetti giorni={os.richiesta.giorni} />
        </div>
      )}

      {!correggibili && !os?.richiesta && decisione && (
        <p className="muted small">
          L’ultima richiesta è stata {decisione.tipo} il {quandoDetto(decisione.quando)}
          {decisione.nota ? `: «${decisione.nota}»` : ''}.
        </p>
      )}

      {!correggibili && !os?.richiesta && !chiedendo && (
        <div className="azioni">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setModulo(orariNelModulo(os.giorni))
              setChiedendo(true)
            }}
          >
            Chiedi un cambio degli orari
          </button>
        </div>
      )}

      {chiedendo && (
        <>
          <p className="muted small">Scrivi i nuovi orari e perché cambiano: verifichiamo e ti rispondiamo. Fino ad allora valgono quelli di adesso.</p>
          <OrariSettimana valore={modulo} onChange={setModulo} errori={errori} prefisso="richiesta" disabilitato={inCorso} />
          <div className="campo">
            <label htmlFor="motivo-orari">Motivo del cambio</label>
            <textarea id="motivo-orari" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-invalid={Boolean(errori.motivo)} />
            {errori.motivo && <p className="errore small">{errori.motivo}</p>}
          </div>
          <div className="azioni">
            <button type="button" className="btn ghost" disabled={inCorso} onClick={() => setChiedendo(false)}>
              Annulla
            </button>
            <button type="button" className="btn" disabled={inCorso} onClick={() => manda('richiesta')}>
              {inCorso ? 'Un momento…' : 'Manda la richiesta'}
            </button>
          </div>
        </>
      )}

      {esito && (
        <p className="segno-ok small" role="status">
          {esito}
        </p>
      )}
      {errore && <p className="errore">{errore}</p>}
    </section>
  )
}

// NEL BACKOFFICE, nella scheda del locale: gli orari, l'avviso se non c'è
// pausa, e la richiesta in attesa con Approva e Rifiuta. La nota va al
// titolare con la decisione (la legge nella sua area).
export function OrariNelBackoffice({ cliente, onFatto, onErrore }) {
  const os = cliente?.orari_servizio
  const [nota, setNota] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const r = os?.richiesta

  const decidi = async (esito) => {
    setInCorso(true)
    try {
      await decidiCambioOrari(cliente.uid, esito, nota.trim() || null)
      setNota('')
      onFatto?.()
    } catch (e) {
      onErrore?.(e?.message || 'La decisione non è andata.')
    } finally {
      setInCorso(false)
    }
  }

  if (!os?.giorni) return <p className="muted small">Non indicati: la sospensione per pagamento arriva al taglio della giornata.</p>
  return (
    <>
      <ul className="orari-elenco small">
        {GIORNI.map((id) => (
          <li key={id}>
            {NOMI_GIORNI[id]}: {giornoDetto(os.giorni[id])}
          </li>
        ))}
      </ul>
      <div className="muted small">Correggibili dal titolare fino al {quandoDetto(correggibiliFino(cliente))}</div>
      <AvvisoSenzaPausa giorni={os.giorni} />
      {r && (
        <div className="riquadro-richiesta" aria-label="Richiesta di cambio degli orari">
          <p className="small">
            Cambio chiesto il {quandoDetto(r.chiesta_il)}. Motivo: «{r.motivo}»
          </p>
          <ul className="orari-elenco small">
            {GIORNI.map((id) => (
              <li key={id}>
                {NOMI_GIORNI[id]}: {giornoDetto(r.prima?.[id])} → {giornoDetto(r.giorni?.[id])}
              </li>
            ))}
          </ul>
          <AvvisoSenzaPausa giorni={r.giorni} />
          <label htmlFor={`nota-orari-${cliente.slug}`}>Nota per il titolare (facoltativa)</label>
          <input id={`nota-orari-${cliente.slug}`} value={nota} onChange={(e) => setNota(e.target.value)} disabled={inCorso} />
          <div className="azioni">
            <button type="button" className="btn small" disabled={inCorso} onClick={() => decidi('approvata')}>
              Approva
            </button>
            <button type="button" className="btn ghost small" disabled={inCorso} onClick={() => decidi('rifiutata')}>
              Rifiuta
            </button>
          </div>
        </div>
      )}
    </>
  )
}
