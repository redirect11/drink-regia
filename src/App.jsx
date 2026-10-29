import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Registrati from './pages/Registrati.jsx'
import Accedi from './pages/Accedi.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Backoffice from './pages/Backoffice.jsx'
import { Termini, Privacy } from './pages/Legali.jsx'
import { osservaUtente, esci } from './lib/db.js'
import { NOME_PRODOTTO, EMAIL_CONTATTI, URL_DEMO } from './lib/prodotto.js'

// Il nastro «TEST» e la versione (REQ-DEV-002): il sito di test
// (drink-regia-test) deve dirsi tale a chi lo guarda, come in tana-drink.
// VITE_APP_ENV e VITE_APP_VERSION le mette il deploy (deploy.yml); in
// locale e nei test mancano, e il nastro c'è, perché non è produzione.
// La versione di riserva è quella di package.json (vite.config.js).
const PRODUZIONE = import.meta.env.VITE_APP_ENV === 'production'
const VERSIONE = import.meta.env.VITE_APP_VERSION || __APP_VERSION__

// Le voci del menù della prima pagina (REQ-FLOTTA-002): sono ancore
// dentro Home, raggiungibili anche dalle altre pagine con «/#…».
const VOCI = [
  ['funzioni', 'Funzioni'],
  ['come-funziona', 'Come funziona'],
  ['prezzi', 'Prezzi'],
  ['domande', 'Domande'],
]

export default function App() {
  const [utente, setUtente] = useState(undefined) // undefined = non ancora saputo
  const [menuAperto, setMenuAperto] = useState(false)
  const posizione = useLocation()
  useEffect(() => osservaUtente(setUtente), [])
  // Cambiando pagina il menù a tendina del telefono si chiude da solo.
  useEffect(() => setMenuAperto(false), [posizione])

  const pronto = utente !== undefined
  return (
    <div className="regia">
      {!PRODUZIONE && (
        <div className="nastro-test" role="note">
          TEST · {VERSIONE} · non è il sito vero
        </div>
      )}
      <header className="barra">
        <Link to="/" className="marchio">
          <span className="marchio-punto" aria-hidden="true" />
          {NOME_PRODOTTO}
        </Link>
        <button
          type="button"
          className="menu-tasto"
          aria-expanded={menuAperto}
          aria-controls="menu-principale"
          onClick={() => setMenuAperto((a) => !a)}
        >
          Menu
        </button>
        <nav id="menu-principale" className={menuAperto ? 'aperto' : ''} aria-label="Principale">
          {VOCI.map(([id, testo]) => (
            <a key={id} href={`/#${id}`}>
              {testo}
            </a>
          ))}
          {utente && <Link to="/dashboard">Dashboard</Link>}
          {utente?.admin && <Link to="/backoffice">Backoffice</Link>}
          {utente ? (
            <button type="button" className="link" onClick={esci}>
              Esci
            </button>
          ) : (
            <>
              <Link to="/accedi">Accedi</Link>
              <Link to="/registrati" className="btn small">
                Registra il locale
              </Link>
            </>
          )}
        </nav>
      </header>
      {pronto && (
        <Routes>
          <Route path="/" element={<Home utente={utente} />} />
          <Route path="/registrati" element={utente ? <Navigate to="/dashboard" replace /> : <Registrati />} />
          <Route path="/accedi" element={utente ? <Navigate to="/dashboard" replace /> : <Accedi />} />
          <Route path="/dashboard" element={utente ? <Dashboard utente={utente} /> : <Navigate to="/accedi" replace />} />
          <Route path="/backoffice" element={utente?.admin ? <Backoffice /> : <Navigate to="/" replace />} />
          <Route path="/termini" element={<Termini />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
      <footer className="piede">
        <div className="piede-colonne">
          <div>
            <div className="marchio piede-marchio">{NOME_PRODOTTO}</div>
            <p className="muted small">Un’installazione per ogni locale. I dati restano suoi.</p>
          </div>
          <div>
            <h4>Prodotto</h4>
            <a href="/#funzioni">Funzioni</a>
            <a href="/#prezzi">Prezzi</a>
            <a href={URL_DEMO} target="_blank" rel="noreferrer">
              Installazione dimostrativa
            </a>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/accedi">Accedi</Link>
            <Link to="/registrati">Registra il locale</Link>
          </div>
          <div>
            <h4>Informazioni</h4>
            <Link to="/termini">Termini di servizio</Link>
            <Link to="/privacy">Privacy</Link>
            <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>
          </div>
        </div>
        <p className="muted small piede-riga">
          © {new Date().getFullYear()} {NOME_PRODOTTO}. Importi IVA esclusa. Lo scontrino sulla stampante termica non è uno
          scontrino fiscale. <span data-testid="versione">Versione {VERSIONE}</span>
        </p>
      </footer>
    </div>
  )
}
