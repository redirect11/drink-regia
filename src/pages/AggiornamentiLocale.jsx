import { useState } from 'react'
import { sceltaAggiornamento } from '../lib/db.js'
import { blocchiDelleNote, percheNonInclusi, regolaDetta, senzaSegni } from '../lib/aggiornamenti.js'

// GLI AGGIORNAMENTI DEL LOCALE, NELLA DASHBOARD (REQ-FLOTTA-020).
// L'utente, 31/10/2026: il titolare «vede prima il changelog con i
// cambiamenti» e sceglie se aggiornare, o salta. La stessa scelta c'è
// nell'app del locale; vale la prima che arriva. Qui anche l'avviso quando
// cambiano le condizioni, e il perché se il piano non comprende gli
// aggiornamenti. Tutto viene dall'istanza, che scrivono le Functions.
export default function AggiornamentiLocale({ istanza }) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState(null)
  const [errore, setErrore] = useState(null)

  const regola = istanza?.regola_aggiornamenti
  const p = istanza?.proposta_aggiornamento
  const avviso = istanza?.avviso_aggiornamenti
  const proposta = p?.attesa && regola?.inclusi !== false ? p : null
  if (!regola && !proposta && !avviso) return null

  const scegli = async (scelta) => {
    setErrore(null)
    setInCorso(true)
    try {
      await sceltaAggiornamento(proposta.tag, scelta)
      setEsito(scelta === 'aggiorna' ? 'Aggiornamento chiesto: arriva entro una ventina di minuti, poi l’app ti chiede di ricaricare.' : 'Versione saltata: il locale resta com’è. Se cambi idea, la trovi qui.')
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <section className="card" aria-label="Aggiornamenti">
      <h3>Aggiornamenti</h3>
      {regolaDetta(regola) && (
        <p className="small" data-testid="regola-aggiornamenti">
          {regolaDetta(regola)}
          {regola.modalita === 'a_scelta' && regola.inclusi !== false && <span className="muted"> · prima di ogni versione vedi le novità e scegli</span>}
        </p>
      )}
      {regola?.inclusi === false && <p className="small">{percheNonInclusi(regola.motivo)}</p>}

      {avviso && (
        <div className="avviso small" role="note" aria-label="Condizioni degli aggiornamenti">
          {avviso.testo}
        </div>
      )}

      {proposta && (
        <div className="proposta" aria-label={`Versione ${proposta.tag}`}>
          <h4>È disponibile la versione {proposta.tag}</h4>
          {proposta.saltata_il && <p className="muted small">L’hai saltata il {new Date(proposta.saltata_il).toLocaleDateString('it-IT')}.</p>}
          <Note md={proposta.note} />
          <div className="azioni">
            <button type="button" className="btn small" disabled={inCorso} onClick={() => scegli('aggiorna')}>
              Aggiorna
            </button>
            {!proposta.saltata_il && (
              <button type="button" className="btn ghost small" disabled={inCorso} onClick={() => scegli('salta')}>
                Salta questa versione
              </button>
            )}
          </div>
        </div>
      )}
      {esito && (
        <p className="small" role="status">
          {esito}
        </p>
      )}
      {errore && <p className="errore small">{errore}</p>}
    </section>
  )
}

function Note({ md }) {
  const blocchi = blocchiDelleNote(md)
  if (!blocchi.length) return <p className="muted small">Le note di questa versione non sono disponibili.</p>
  // Le voci di fila stanno nello stesso elenco.
  const gruppi = []
  for (const b of blocchi) {
    const ultimo = gruppi[gruppi.length - 1]
    if (b.tipo === 'voce' && ultimo?.tipo === 'voci') ultimo.voci.push(b.testo)
    else gruppi.push(b.tipo === 'voce' ? { tipo: 'voci', voci: [b.testo] } : b)
  }
  return (
    <div className="note-versione" data-testid="note-versione">
      {gruppi.map((g, i) => {
        if (g.tipo === 'titolo') return <h5 key={i}>{senzaSegni(g.testo)}</h5>
        if (g.tipo === 'sotto') return <h6 key={i}>{senzaSegni(g.testo)}</h6>
        if (g.tipo === 'voci')
          return (
            <ul key={i}>
              {g.voci.map((v, j) => (
                <li key={j}>{senzaSegni(v)}</li>
              ))}
            </ul>
          )
        return <p key={i}>{senzaSegni(g.testo)}</p>
      })}
    </div>
  )
}
