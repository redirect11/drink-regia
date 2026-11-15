import { useCallback, useEffect, useState } from 'react'
import { elencoAllarmi, statoSentinella, leggiSoglieSentinella, salvaSoglieSentinella, giroSentinella } from '../lib/db.js'

// LA SENTINELLA NEL BACKOFFICE (REQ-FLOTTA-111). Daniele, 14/11/2026, sul
// canale degli avvisi: «Solo nel backoffice». La Function `sentinella` fa
// un giro ogni 15 minuti e scrive gli allarmi; qui si leggono: quelli
// aperti (il più grave prima), l'ultimo giro coi controlli che non sono
// riusciti, i chiusi degli ultimi 7 giorni e le soglie. Leggere qui non
// chiede niente a Google: legge due documenti della regia.

const LIVELLI = {
  problema: { detto: 'Problema', tono: 'errore', peso: 0 },
  attenzione: { detto: 'Attenzione', tono: 'avviso', peso: 1 },
}
// Le stesse della Function (functions/lib/sentinella.js), per mostrare
// qualcosa prima che l'admin le abbia mai salvate.
const SOGLIE = [
  { nome: 'errori', detto: 'Errori di una Function in un giro', predefinita: 3, min: 1, max: 1000 },
  { nome: 'presentazione_ore', detto: 'Ore di una presentazione ferma dopo un aggiornamento', predefinita: 48, min: 1, max: 720 },
  { nome: 'sito_secondi', detto: 'Secondi di attesa di un sito', predefinita: 10, min: 2, max: 30 },
]
const FERMA_DOPO_MINUTI = 45
const SETTE_GIORNI = 7 * 24 * 3600 * 1000

const quando = (iso) =>
  iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const minutiDa = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 60000) : null)

function Allarme({ a, chiuso = false }) {
  const l = LIVELLI[a.livello] || LIVELLI.attenzione
  return (
    <li className={`tono-${l.tono}`}>
      <strong>{l.detto}</strong> · {a.titolo}
      <div className="small">{a.dettaglio}</div>
      <div className="muted small">
        {chiuso ? `dal ${quando(a.aperto_il)} al ${quando(a.chiuso_il)}` : `dal ${quando(a.aperto_il)}`}
        {a.volte > 1 ? ` · ${a.volte} volte` : ''}
      </div>
    </li>
  )
}

export default function Sentinella({ onErrore, onAllarmi }) {
  const [allarmi, setAllarmi] = useState(null)
  const [stato, setStato] = useState(null)
  const [soglie, setSoglie] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const [salvate, setSalvate] = useState(false)

  const carica = useCallback(async () => {
    try {
      const [elenco, s, sg] = await Promise.all([elencoAllarmi(), statoSentinella(), leggiSoglieSentinella()])
      setAllarmi(elenco)
      setStato(s)
      setSoglie(Object.fromEntries(SOGLIE.map((x) => [x.nome, Number.isFinite(Number(sg?.[x.nome])) && sg?.[x.nome] != null ? Number(sg[x.nome]) : x.predefinita])))
      onAllarmi?.(elenco)
    } catch (e) {
      onErrore?.(e.message)
    }
  }, [onErrore, onAllarmi])

  useEffect(() => {
    carica()
  }, [carica])

  const giro = async () => {
    setInCorso(true)
    try {
      await giroSentinella()
      await carica()
    } catch (e) {
      onErrore?.(e.message)
    } finally {
      setInCorso(false)
    }
  }

  const salva = async (ev) => {
    ev.preventDefault()
    try {
      await salvaSoglieSentinella(Object.fromEntries(SOGLIE.map((x) => [x.nome, Number(soglie[x.nome])])))
      setSalvate(true)
    } catch (e) {
      onErrore?.(e.message)
    }
  }

  const aperti = (allarmi || [])
    .filter((a) => a.aperto === true)
    .sort((a, b) => (LIVELLI[a.livello]?.peso ?? 2) - (LIVELLI[b.livello]?.peso ?? 2) || String(a.aperto_il).localeCompare(String(b.aperto_il)))
  const chiusi = (allarmi || [])
    .filter((a) => a.aperto !== true && a.chiuso_il && Date.now() - Date.parse(a.chiuso_il) <= SETTE_GIORNI)
    .sort((a, b) => String(b.chiuso_il).localeCompare(String(a.chiuso_il)))
  const minuti = minutiDa(stato?.ultimo_giro_il)
  const nonRiusciti = Object.entries(stato?.controlli || {}).filter(([, c]) => c && c.ok === false)

  return (
    <section className="card" aria-label="Sentinella">
      <div className="row-tra">
        <h3>Sentinella</h3>
        <button type="button" onClick={giro} disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Fai un giro adesso'}
        </button>
      </div>
      <p className="muted small">
        Ogni 15 minuti la regia controlla i siti, gli errori, le presentazioni dei locali e, una volta l’ora, i suoi permessi. Gli
        allarmi si chiudono da soli quando il controllo torna in ordine.
      </p>

      {stato === null && allarmi !== null && <p className="muted">La sentinella non ha ancora fatto nessun giro.</p>}
      {stato && (
        <p className="small">
          Ultimo giro: {quando(stato.ultimo_giro_il)} ({minuti} min fa)
        </p>
      )}
      {stato && minuti > FERMA_DOPO_MINUTI && <p className="errore">La sentinella è ferma: l’ultimo giro è di {minuti} minuti fa.</p>}
      {nonRiusciti.length > 0 && (
        <ul className="senza-punti small errore" aria-label="Controlli non riusciti">
          {nonRiusciti.map(([nome, c]) => (
            <li key={nome}>{`${nome}: ${c.perche || 'non riuscito'}`}</li>
          ))}
        </ul>
      )}

      {allarmi !== null && (
        <>
          <h4>Allarmi aperti</h4>
          {aperti.length === 0 ? (
            <p className="muted">Nessun allarme aperto.</p>
          ) : (
            <ul className="senza-punti" aria-label="Allarmi aperti">
              {aperti.map((a) => (
                <Allarme key={a.id} a={a} />
              ))}
            </ul>
          )}
          {chiusi.length > 0 && (
            <>
              <h4>Chiusi negli ultimi 7 giorni</h4>
              <ul className="senza-punti" aria-label="Allarmi chiusi negli ultimi 7 giorni">
                {chiusi.map((a) => (
                  <Allarme key={a.id} a={a} chiuso />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {soglie && (
        <form onSubmit={salva} aria-label="Soglie della sentinella">
          <h4>Soglie</h4>
          {SOGLIE.map((x) => (
            <label key={x.nome} className="small">
              {x.detto}
              <input
                type="number"
                min={x.min}
                max={x.max}
                step="1"
                value={soglie[x.nome]}
                onChange={(e) => {
                  setSalvate(false)
                  setSoglie({ ...soglie, [x.nome]: e.target.value })
                }}
              />
            </label>
          ))}
          <button type="submit">Salva le soglie</button>
          {salvate && <span className="muted small"> Salvate: valgono dal prossimo giro.</span>}
        </form>
      )}
    </section>
  )
}
