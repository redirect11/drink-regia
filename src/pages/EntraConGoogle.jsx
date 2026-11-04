import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { entraConGoogle } from '../lib/db.js'

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
      setErrore(messaggioGoogle(err))
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="con-google">
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

// Gli errori della finestra di Google in italiano; null se l'ha chiusa chi
// stava entrando.
export function messaggioGoogle(err) {
  const codice = err?.code || ''
  if (codice.includes('popup-closed-by-user') || codice.includes('cancelled-popup-request')) return null
  if (codice.includes('popup-blocked')) return 'Il browser ha bloccato la finestra di Google: consenti le finestre per questo sito e riprova.'
  // Un account con la password e un'email che Google non garantisce (non
  // Gmail): Firebase non li unisce da sé, per non consegnare l'account a
  // chi ha solo l'indirizzo.
  if (codice.includes('account-exists-with-different-credential')) return 'Questa email ha già un account con la password: entra con email e password.'
  if (codice.includes('operation-not-allowed') || codice.includes('unauthorized-domain')) return 'L’accesso con Google non è ancora attivo: entra con email e password.'
  if (codice.includes('network-request-failed')) return 'Connessione assente: riprova.'
  return 'L’accesso con Google non è riuscito. Riprova.'
}
