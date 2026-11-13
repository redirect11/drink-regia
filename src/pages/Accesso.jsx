import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { entraColPassaggio } from '../lib/db.js'

// IL PASSAGGIO DALL'APP DEL LOCALE (REQ-FLOTTA-030): «Area clienti»
// nell'app porta qui con un codice monouso dopo il `#`. Il codice si toglie
// subito dall'indirizzo (non resta nella cronologia), si scambia con la
// regia, e si entra nella propria area.
export const leggiCodice = (hash) => new URLSearchParams(String(hash || '').replace(/^#/, '')).get('accesso-regia') || ''

export default function Accesso() {
  const vai = useNavigate()
  const [errore, setErrore] = useState(null)

  useEffect(() => {
    const codice = leggiCodice(window.location.hash)
    window.history.replaceState(null, '', window.location.pathname)
    if (!codice) {
      setErrore('Nessun codice di accesso: entra dalla pagina di accesso.')
      return
    }
    entraColPassaggio(codice)
      .then(() => vai('/dashboard', { replace: true }))
      .catch((e) => setErrore(e.message))
  }, [vai])

  return (
    <main className="pagina stretta">
      <section className="card" aria-label="Accesso dall’app">
        <h2>Accesso dall’app del locale</h2>
        {errore ? (
          <>
            <p className="errore">{errore}</p>
            <p>
              <Link to="/accedi">Entra con email e password</Link>
            </p>
          </>
        ) : (
          <p className="muted">Entro nella tua area…</p>
        )}
      </section>
    </main>
  )
}
