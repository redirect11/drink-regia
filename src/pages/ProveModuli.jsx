import { useEffect, useState } from 'react'
import { MODULI, PIANI, baseMancante } from '../lib/piani.js'
import { osservaVendita, provaModulo } from '../lib/db.js'
import { venditaPulita } from '../lib/vendita.js'
import { STATI } from '../lib/istanze.js'

// LE PROVE DEI MODULI, NELLA DASHBOARD (REQ-FLOTTA-016). Quali moduli si
// possono provare, e per quanti giorni, lo decide l'admin; il titolare ne
// accende uno con un clic, una volta sola, e vede fino a quando dura. Alla
// scadenza il modulo si spegne, salvo che lo abbia comprato. La regola che
// conta la rifà il server (functions/lib/prove.js).
const data = (iso) => new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })

export default function ProveModuli({ cliente, istanza }) {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  const [inCorso, setInCorso] = useState(null)
  const [errore, setErrore] = useState(null)

  if (istanza?.stato !== STATI.ATTIVA || (istanza.licenza_stato || 'attiva') !== 'attiva') return null
  const inclusi = new Set(PIANI[cliente.piano]?.include || [])
  const suoi = new Set([...inclusi, ...(cliente.moduli || [])])
  const inProva = Object.entries(cliente.prove || {}).filter(([id, p]) => !suoi.has(id) && Date.parse(p?.scade_il) > Date.now())
  // Senza la sua base (nel piano, comprata o in prova) un modulo non si
  // propone (tana-drink REQ-LIC-015): il server direbbe di no.
  const scelta = { piano: cliente.piano, moduli: cliente.moduli || [], prove: inProva.map(([id]) => id) }
  const provabili = MODULI.filter(
    (m) => vendita.prove[m.id] > 0 && vendita.moduli[m.id] && !suoi.has(m.id) && !(cliente.prove_fatte || []).includes(m.id) && !baseMancante(scelta, m.id)
  )
  if (!inProva.length && !provabili.length) return null

  const prova = async (id) => {
    setErrore(null)
    setInCorso(id)
    try {
      await provaModulo(id)
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInCorso(null)
    }
  }

  return (
    <section className="card" aria-label="Prova un modulo">
      <h3>Prova un modulo</h3>
      {inProva.map(([id, p]) => (
        <p key={id}>
          <strong>{MODULI.find((m) => m.id === id)?.nome || id}</strong> è in prova fino al {data(p.scade_il)}. Per tenerlo,
          aggiungilo al piano qui sotto.
        </p>
      ))}
      {provabili.map((m) => (
        <div key={m.id} className="row-tra">
          <span>
            <strong>{m.nome}</strong>
            <span className="muted small"> · {m.descrizione}</span>
          </span>
          <button type="button" className="btn ghost small" disabled={inCorso === m.id} onClick={() => prova(m.id)}>
            Prova gratis per {vendita.prove[m.id]} giorni
          </button>
        </div>
      ))}
      <p className="muted small">Ogni modulo si prova una volta sola. Alla fine della prova si spegne da solo, se non lo aggiungi.</p>
      {errore && <p className="errore">{errore}</p>}
    </section>
  )
}
