import { useEffect, useState } from 'react'
import { elencoClienti, elencoIstanze, elencoRichieste, segnaPiano, rilanciaAttivazione, impostaStatoIstanza, aggiornaIstanza } from '../lib/db.js'
import { statoIstanza, statoDetto, STATI, progettoDi } from '../lib/istanze.js'
import { PIANI, prezzoMensile, euro } from '../lib/piani.js'
import { contattoDi } from '../lib/clienti.js'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato
// dell'istanza, progetto, versione; le richieste in coda o in errore in
// cima. Solo col claim admin (App.jsx non ci fa arrivare gli altri, e le
// regole Firestore non gli darebbero comunque i dati).
export default function Backoffice() {
  const [righe, setRighe] = useState(undefined)
  const [errore, setErrore] = useState(null)

  const carica = async () => {
    try {
      const [clienti, istanze, richieste] = await Promise.all([elencoClienti(), elencoIstanze(), elencoRichieste()])
      setRighe(
        clienti
          .map((c) => ({ cliente: c, istanza: istanze[c.slug] || null, richiesta: richieste[c.slug] || null }))
          .map((r) => ({ ...r, stato: statoIstanza(r.istanza, r.richiesta) }))
          .sort((a, b) => peso(a.stato) - peso(b.stato))
      )
    } catch (e) {
      setErrore(e.message)
      setRighe([])
    }
  }
  useEffect(() => {
    carica()
  }, [])

  const pianoAMano = async (c) => {
    const piano = window.prompt('Piano (base | completo):', c.piano || 'base')
    if (!piano || !PIANI[piano]) return
    await segnaPiano(c.uid, { piano, moduli: c.moduli || [], terminali: c.terminali || 1 })
    carica()
  }

  // Sospendi, Riattiva, Chiudi (REQ-FLOTTA-008): l'app del locale si ferma
  // e lo dice; i dati restano. Il motivo lo legge il titolare.
  const cambiaStato = async (c, stato) => {
    const motivo = stato === 'attiva' ? null : window.prompt(`Motivo (lo legge il titolare di ${c.nome_locale}):`, stato === 'sospesa' ? 'pagamento non ricevuto' : 'chiusura')
    if (stato !== 'attiva' && motivo == null) return
    try {
      await impostaStatoIstanza(c.slug, stato, motivo)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }

  // L'ultima versione dell'app a un locale, o a tutti quelli attivi
  // (REQ-FLOTTA-009): l'app di base è tana-drink, i locali la seguono
  // quando lo si decide.
  const aggiorna = async (c) => {
    try {
      await aggiornaIstanza(c.slug)
    } catch (e) {
      setErrore(e.message)
    }
  }
  const aggiornaTutte = async () => {
    const attive = righe.filter((r) => r.stato === STATI.ATTIVA)
    if (!window.confirm(`Portare l’ultima versione a ${attive.length} locali attivi?`)) return
    for (const r of attive) await aggiorna(r.cliente)
  }

  if (righe === undefined) return <main className="pagina muted">Carico…</main>

  return (
    <main className="pagina">
      <div className="row-tra">
        <h2>Backoffice</h2>
        {righe?.some((r) => r.stato === STATI.ATTIVA) && (
          <button type="button" className="btn ghost small" onClick={aggiornaTutte}>
            Aggiorna tutte le istanze attive
          </button>
        )}
      </div>
      {errore && <p className="errore">{errore}</p>}
      {righe.length === 0 ? (
        <p className="muted">Nessun cliente.</p>
      ) : (
        <table className="clienti">
          <thead>
            <tr>
              <th>Locale</th>
              <th>Email</th>
              <th>Piano</th>
              <th>Istanza</th>
              <th>Progetto</th>
              <th>Versione</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {righe.map(({ cliente: c, istanza, stato }) => (
              <tr key={c.uid} className={stato === STATI.ERRORE ? 'errore-riga' : ''}>
                <td>
                  <strong>{c.nome_locale}</strong>
                  <div className="muted small">{c.slug}</div>
                </td>
                <td>
                  {c.email}
                  {c.fatturazione?.ragione_sociale && (
                    <div className="muted small">
                      {c.fatturazione.ragione_sociale} · P.IVA {c.fatturazione.partita_iva}
                    </div>
                  )}
                  {contattoDi(c) && <div className="muted small">{contattoDi(c)}</div>}
                </td>
                <td>{c.piano ? `${PIANI[c.piano]?.nome || c.piano} · ${euro(prezzoMensile(c))}` : <span className="muted">—</span>}</td>
                <td>
                  {statoDetto(stato)}
                  {istanza?.licenza_stato && istanza.licenza_stato !== 'attiva' && (
                    <div className="errore small">
                      {istanza.licenza_stato}
                      {istanza.licenza_motivo ? ` · ${istanza.licenza_motivo}` : ''}
                    </div>
                  )}
                </td>
                <td>
                  <code>{istanza?.progetto || progettoDi(c.slug)}</code>
                </td>
                <td>{istanza?.versione || <span className="muted">—</span>}</td>
                <td className="azioni-riga">
                  <button type="button" className="btn ghost small" onClick={() => pianoAMano(c)}>
                    Piano a mano
                  </button>
                  {stato === STATI.ERRORE && (
                    <button type="button" className="btn ghost small" onClick={() => rilanciaAttivazione(c.slug).then(carica)}>
                      Rilancia
                    </button>
                  )}
                  {stato === STATI.ATTIVA && (
                    <button type="button" className="btn ghost small" onClick={() => aggiorna(c)}>
                      Aggiorna
                    </button>
                  )}
                  {stato === STATI.ATTIVA && (istanza?.licenza_stato || 'attiva') === 'attiva' && (
                    <>
                      <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'sospesa')}>
                        Sospendi
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'chiusa')}>
                        Chiudi
                      </button>
                    </>
                  )}
                  {stato === STATI.ATTIVA && istanza?.licenza_stato && istanza.licenza_stato !== 'attiva' && (
                    <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'attiva')}>
                      Riattiva
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

// In cima quello che chiede attenzione.
const PESI = { [STATI.ERRORE]: 0, [STATI.IN_CODA]: 1, [STATI.IN_CORSO]: 2, [STATI.DA_ATTIVARE]: 3, [STATI.ATTIVA]: 4 }
const peso = (s) => PESI[s] ?? 9
