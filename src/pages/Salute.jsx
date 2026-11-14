import { useState } from 'react'
import { saluteDellaFlotta } from '../lib/db.js'

// «SALUTE» (REQ-FLOTTA-109). Daniele, 14/11/2026, dopo la verifica a mano
// del 500 di drinkpos-prova-e2e: «dove le vedi queste cose?». Per ogni
// locale l'ultima presentazione, gli errori delle 24 ore e i permessi che
// mancano alla regia; poi gli errori per Function. Si controlla quando
// l'admin preme il tasto, mai a tempo: ogni controllo chiede a Google, e
// i registri hanno una quota di letture al minuto.
// I conti li fa la Function (functions/lib/salute.js); qui si mostra.

const GIUDIZI = {
  problema: { detto: 'Problema', tono: 'errore' },
  attenzione: { detto: 'Attenzione', tono: 'avviso' },
  ok: { detto: 'In ordine', tono: 'ok' },
}
const NON_CONTROLLATO = { detto: 'Non controllato', tono: 'attesa' }

const ora = (iso) =>
  iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

function Presentazione({ p }) {
  if (!p?.versione) return <span className="muted">mai presentato</span>
  return (
    <>
      <strong>{p.versione}</strong>{' '}
      <span className="muted small">
        {ora(p.il)}
        {p.ore_fa != null ? ` (${p.ore_fa} h fa)` : ''}
      </span>
      {p.pubblicata && <div className={p.diversa ? 'errore small' : 'muted small'}>pubblicata {p.pubblicata}</div>}
    </>
  )
}

// I ruoli che mancano, e la riga che li dà: lo stesso script che li ha dati
// agli altri locali (scripts/account-runtime.mjs --locale).
function Permessi({ locale }) {
  if (!locale.controllato) return <span className="muted">—</span>
  if (!locale.mancanti.length) return <span>tutti</span>
  return (
    <>
      <ul className="senza-punti small">
        {locale.mancanti.map((m) => (
          <li key={`${m.ruolo}-${m.dove}`}>
            manca {m.ruolo} ({m.dove})
          </li>
        ))}
      </ul>
      <code className="small">{`node scripts/account-runtime.mjs --progetto <regia> --locale ${locale.progetto}`}</code>
    </>
  )
}

export default function Salute({ onErrore }) {
  const [rapporto, setRapporto] = useState(null)
  const [inCorso, setInCorso] = useState(false)

  const controlla = async () => {
    setInCorso(true)
    try {
      setRapporto(await saluteDellaFlotta())
    } catch (e) {
      onErrore?.(e.message)
    } finally {
      setInCorso(false)
    }
  }

  const registri = rapporto?.registri
  return (
    <section className="card" aria-label="Salute">
      <div className="row-tra">
        <h3>Salute</h3>
        <button type="button" onClick={controlla} disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Controlla adesso'}
        </button>
      </div>
      <p className="muted small">
        Per ogni locale: l’ultima volta che l’app si è presentata alla regia, gli errori delle ultime 24 ore e i permessi che mancano
        alla regia sul suo progetto.
        {rapporto && ` Controllato ${ora(rapporto.controllato_il)}.`}
      </p>

      {rapporto && (
        <>
          <table className="clienti" aria-label="Locali">
            <thead>
              <tr>
                <th scope="col">Locale</th>
                <th scope="col">Stato</th>
                <th scope="col">Presentazione</th>
                <th scope="col">Permessi</th>
                <th scope="col">Errori 24 h</th>
              </tr>
            </thead>
            <tbody>
              {rapporto.locali.map((l) => {
                const g = (l.controllato && GIUDIZI[l.giudizio]) || NON_CONTROLLATO
                return (
                  <tr key={l.slug} className={`riga-locale tono-${g.tono}`}>
                    <th scope="row">
                      {l.slug}
                      {l.progetto && <div className="muted small">{l.progetto}</div>}
                    </th>
                    <td>{g.detto}</td>
                    <td>
                      <Presentazione p={l.presentazione} />
                    </td>
                    <td>
                      <Permessi locale={l} />
                    </td>
                    <td>{registri?.leggibili ? l.errori : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h4>Errori delle ultime 24 ore</h4>
          {!registri?.leggibili ? (
            <p className="errore">I registri della regia non si leggono: {registri?.perche}</p>
          ) : registri.per_function.length === 0 && registri.righe.length === 0 ? (
            <p className="muted">Nessun errore.</p>
          ) : (
            <>
              {registri.per_function.length > 0 && (
                <table className="clienti" aria-label="Errori per Function">
                  <thead>
                    <tr>
                      <th scope="col">Function</th>
                      <th scope="col">Risposte 5xx</th>
                      <th scope="col">L’ultima</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registri.per_function.map((f) => (
                      <tr key={f.servizio}>
                        <th scope="row">{f.servizio}</th>
                        <td>{f.errori}</td>
                        <td>{ora(f.ultimo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {registri.righe.length > 0 && (
                <ul className="senza-punti small" aria-label="Le ultime righe d’errore">
                  {registri.righe.map((r, i) => (
                    <li key={`${r.il}-${i}`}>
                      <span className="muted">
                        {ora(r.il)} · {r.servizio}
                        {r.slug ? ` · ${r.slug}` : ''}
                      </span>{' '}
                      <code>{r.testo}</code>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
