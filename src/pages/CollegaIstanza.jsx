import { useState } from 'react'
import { collegaIstanza } from '../lib/db.js'
import { istanzaScollegata } from '../lib/istanze.js'

// ISTANZA E TITOLARE SCOLLEGATI, NELLA SCHEDA DEL LOCALE (REQ-FLOTTA-086).
// Daniele, 13/11/2026: «fai il tasto di collegamento nel backoffice, ma
// deve apparire solo se per qualche motivo istanza e regia risultano
// scollegati». Il backoffice accoppia cliente e istanza per slug e la
// mostrava «Attiva», mentre il titolare, che la legge col suo uid, non la
// vedeva (prova-free). Qui si vede, in cima alla scheda, e si ricollega.
// Un componente a parte: la scheda si sta ridisegnando su un altro ramo
// (REQ-FLOTTA-089), e qui basta una riga per metterlo.
export default function CollegaIstanza({ cliente, istanza, onFatto }) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState(null)
  const [errore, setErrore] = useState(null)
  // Dopo il collegamento la scheda si rilegge e l'avviso non serve più:
  // resta l'esito, finché si guarda questa scheda.
  if (!istanzaScollegata(cliente, istanza))
    return esito ? (
      <p className="small" role="status">
        {esito}
      </p>
    ) : null
  const vecchio = istanza.uid || null

  const collega = async () => {
    // Si dice chi riceve l'app prima di darla: nome, email e i due uid.
    const domanda = `Collegare l’app di ${cliente.nome_locale} al titolare ${cliente.email}?\n\nuid ${vecchio || '(nessuno)'} → ${cliente.uid}\n\nSi allineano anche la richiesta di attivazione e il credito AI, se hanno l’uid vecchio.`
    if (!window.confirm(domanda)) return
    setInCorso(true)
    setEsito(null)
    setErrore(null)
    try {
      const r = await collegaIstanza(cliente.slug)
      setEsito(`Collegata: l’app ora è del titolare (${r?.vecchio || 'nessun uid'} → ${r?.nuovo || cliente.uid}).`)
      onFatto?.()
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <section className="card avviso" role="alert" aria-label="App scollegata dal titolare">
      <p>
        <strong>L’app è legata a un altro account: il titolare non la vede nella sua area.</strong>
      </p>
      <p className="small">
        App legata a: <code>{vecchio || 'nessun account'}</code> · titolare {cliente.email} (<code>{cliente.uid}</code>)
      </p>
      <div className="azioni">
        <button type="button" className="btn small" disabled={inCorso} onClick={collega}>
          {inCorso ? 'Collego…' : 'Collega l’app al titolare'}
        </button>
      </div>
      {esito && (
        <p className="small" role="status">
          {esito}
        </p>
      )}
      {errore && <p className="errore small">{errore}</p>}
    </section>
  )
}
