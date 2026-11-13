import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { entraConGoogle } from '../lib/db.js'
import { messaggio } from './Registrati.jsx'

// IL TASTO DI GOOGLE (REQ-FLOTTA-038), uguale in «Accedi» e «Registrati».
// Dopo l'accesso si va alla dashboard: lì chi ha già il locale lo trova, e
// chi è nuovo completa i dati del locale. Chiudere la finestra di Google non
// è un errore e non si segnala.
export default function EntraConGoogle({ etichetta = 'Entra con Google' }) {
  const navigate = useNavigate()
  const [errore, setErrore] = useState(null)
  const [inCorso, setInCorso] = useState(false)

  const entra = async () => {
    setErrore(null)
    setInCorso(true)
    try {
      await entraConGoogle()
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (!finestraChiusa(err)) setErrore(messaggio(err))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div>
      <button type="button" className="btn ghost block" onClick={entra} disabled={inCorso}>
        {inCorso ? 'Un momento…' : etichetta}
      </button>
      {errore && <p className="errore small">{errore}</p>}
      <p className="oppure muted small" aria-hidden="true">
        oppure
      </p>
    </div>
  )
}

// La finestra di Google chiusa da chi stava entrando, o aperta due volte.
export const finestraChiusa = (err) => /popup-closed-by-user|cancelled-popup-request/.test(err?.code || '')
