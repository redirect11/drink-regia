import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Registrati from './pages/Registrati.jsx'
import Accedi from './pages/Accedi.jsx'
import Accesso from './pages/Accesso.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Backoffice from './pages/Backoffice.jsx'
import Anteprima from './pages/Anteprima.jsx'
import { Termini, Privacy } from './pages/Legali.jsx'
import { osservaUtente, esci, tracciaPagina, osservaVendita } from './lib/db.js'
import { sitoChiuso, venditaPulita } from './lib/vendita.js'
import { NOME_PRODOTTO, EMAIL_CONTATTI, URL_DEMO } from './lib/prodotto.js'
import { LINGUE, NOMI_LINGUE, leggiPreferenza, linguaDelPercorso, percorsoDellaLingua, salvaPreferenza } from './lib/lingua.js'
import { testi } from './i18n/index.js'
import { versioneDetta } from './lib/versione.js'

// Il nastro «TEST» e la versione (REQ-DEV-002): il sito di test
// (drink-regia-test) deve dirsi tale a chi lo guarda, come in tana-drink.
// VITE_APP_ENV e VITE_APP_VERSION le mette il deploy (deploy.yml); in
// locale e nei test mancano, e il nastro c'è, perché non è produzione.
// La versione di riserva è quella di package.json (vite.config.js).
const PRODUZIONE = import.meta.env.VITE_APP_ENV === 'production'
const VERSIONE = versioneDetta({ versione: import.meta.env.VITE_APP_VERSION || __APP_VERSION__, ramo: import.meta.env.VITE_APP_RAMO, commit: import.meta.env.VITE_APP_COMMIT })

// Le voci del menù della prima pagina (REQ-FLOTTA-002, DESIGN.md §5.0):
// ancore dentro Home, raggiungibili anche dalle altre pagine con «/#…»
// (o «/en#…» sulla pagina inglese). Gli id delle sezioni sono gli stessi
// nelle due lingue.
const VOCI = ['funzioni', 'prezzi', 'domande']

// La prima pagina italiana. Chi ha scelto l'inglese col selettore ci torna
// in inglese (la preferenza ricordata, DESIGN.md §6); la lingua del browser
// da sola non sposta nessuno, la propone l'avviso dentro Home.
function PrimaPagina({ utente, lingua }) {
  const { hash } = useLocation()
  if (lingua === 'it' && leggiPreferenza() === 'en') return <Navigate to={{ pathname: '/en', hash }} replace />
  return <Home utente={utente} lingua={lingua} />
}

// Il selettore IT / EN, nella barra e nel piè di pagina della prima
// pagina. Scegliere una lingua è la sola cosa che la ricorda.
function SceltaLingua({ lingua, etichetta }) {
  return (
    <div className="scelta-lingua" role="group" aria-label={etichetta}>
      {LINGUE.map((l) => (
        <Link
          key={l}
          to={percorsoDellaLingua(l)}
          lang={l}
          hrefLang={l}
          aria-current={l === lingua ? 'true' : undefined}
          onClick={() => salvaPreferenza(l)}
        >
          {l.toUpperCase()}
          <span className="solo-lettori"> – {NOMI_LINGUE[l]}</span>
        </Link>
      ))}
    </div>
  )
}

export default function App() {
  const [utente, setUtente] = useState(undefined) // undefined = non ancora saputo
  const [menuAperto, setMenuAperto] = useState(false)
  // IL SITO CHIUSO (REQ-FLOTTA-043): finché l'admin non lo apre, in
  // produzione al posto della prima pagina e della registrazione c'è
  // l'anteprima, e il menù ha solo «Accedi». La vendita arriva da Firestore:
  // in produzione, finché non è arrivata, non si mostra niente, perché la
  // prima pagina non deve comparire per un attimo a chi non deve vederla.
  const [vendita, setVendita] = useState(undefined)
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  const chiuso = sitoChiuso(vendita, PRODUZIONE)
  const posizione = useLocation()
  useEffect(() => osservaUtente(setUtente), [])
  // Cambiando pagina il menù a tendina del telefono si chiude da solo.
  useEffect(() => setMenuAperto(false), [posizione])
  // Il traffico (REQ-FLOTTA-042): una vista per ogni pagina aperta, contata
  // per giorno nella regia; solo col sito collegato a Firebase.
  useEffect(() => tracciaPagina(posizione.pathname, linguaDelPercorso(posizione.pathname)), [posizione.pathname])

  const pronto = utente !== undefined
  // La prima pagina non aspetta l'accesso (03/11/2026): è la vetrina, e
  // la prima schermata deve comparire subito; finché non si sa chi è, i
  // bottoni sono quelli di chi non è entrato. Le altre pagine decidono in
  // base all'utente, e aspettano.
  const dopoLAccesso = (pagina) => (pronto ? pagina : null)
  // La lingua viene dall'indirizzo: inglese solo la prima pagina su /en; il
  // resto del sito per ora è solo in italiano.
  const lingua = linguaDelPercorso(posizione.pathname)
  const t = testi(lingua)
  const primaPagina = posizione.pathname === '/' || lingua === 'en'
  const casa = percorsoDellaLingua(lingua)
  // Dalla pagina inglese, i link verso le pagine solo in italiano lo dicono,
  // al browser (hreflang) e a chi legge.
  const versoItaliano = lingua === 'it' ? {} : { hrefLang: 'it' }
  const inItaliano = t.piede.inItaliano ? (
    <>
      {' '}
      <span className="small">{t.piede.inItaliano}</span>
    </>
  ) : null
  if (PRODUZIONE && vendita === undefined) return null
  return (
    // Sulla prima pagina (DESIGN.md §4, 07/11/2026) barra e piè di pagina
    // prendono i colori della vetrina, avorio e verde; il resto del sito
    // resta col tema scuro.
    <div className={`regia${primaPagina ? ' vetrina' : ''}`}>
      {!PRODUZIONE && (
        <div className="nastro-test" role="note">
          TEST · {VERSIONE} · non è il sito vero
        </div>
      )}
      <header className="barra">
        <Link to={casa} className="marchio">
          <span className="marchio-punto" aria-hidden="true" />
          {NOME_PRODOTTO}
        </Link>
        <div className="barra-destra">
          {primaPagina && <SceltaLingua lingua={lingua} etichetta={t.barra.lingua} />}
          <button
            type="button"
            className="menu-tasto"
            aria-expanded={menuAperto}
            aria-controls="menu-principale"
            onClick={() => setMenuAperto((a) => !a)}
          >
            {t.barra.menu}
          </button>
        </div>
        <nav id="menu-principale" className={menuAperto ? 'aperto' : ''} aria-label={t.barra.principale}>
          {!chiuso &&
            VOCI.map((id) => (
              <a key={id} href={`${casa}#${id}`}>
                {t.barra[id]}
              </a>
            ))}
          {utente && <Link to="/dashboard">{t.barra.dashboard}</Link>}
          {utente?.admin && <Link to="/backoffice">{t.barra.backoffice}</Link>}
          {utente ? (
            <button type="button" className="link" onClick={esci}>
              {t.barra.esci}
            </button>
          ) : (
            <>
              <Link to="/accedi" {...versoItaliano}>
                {t.barra.accedi}
              </Link>
              {!chiuso && (
                <Link to="/registrati" className="btn small" {...versoItaliano}>
                  {t.barra.attiva}
                </Link>
              )}
            </>
          )}
        </nav>
      </header>
      <Routes>
        {/* key: le due lingue sono due pagine, ognuna col suo stato (l'avviso della lingua). */}
        {/* Col sito chiuso (REQ-FLOTTA-043) la prima pagina e la registrazione sono l'anteprima. */}
        <Route path="/" element={chiuso ? <Anteprima key="it" lingua="it" /> : <PrimaPagina key="it" utente={utente} lingua="it" />} />
        <Route path="/en" element={chiuso ? <Anteprima key="en" lingua="en" /> : <PrimaPagina key="en" utente={utente} lingua="en" />} />
        <Route path="/registrati" element={chiuso ? <Anteprima lingua="it" /> : dopoLAccesso(utente ? <Navigate to="/dashboard" replace /> : <Registrati />)} />
        <Route path="/accedi" element={dopoLAccesso(utente ? <Navigate to="/dashboard" replace /> : <Accedi />)} />
        {/* Il passaggio dall'app del locale (REQ-FLOTTA-030): sempre qui, anche già entrati. */}
        <Route path="/accesso" element={dopoLAccesso(<Accesso />)} />
        {/* Col sito chiuso la dashboard non fa completare una registrazione (audit del 09/11/2026, finding 26). */}
        <Route path="/dashboard" element={dopoLAccesso(utente ? <Dashboard utente={utente} chiuso={chiuso} /> : <Navigate to="/accedi" replace />)} />
        {/* Le sezioni del backoffice (REQ-FLOTTA-005, 30/10/2026) sono sotto-rotte: «/*» le porta tutte a Backoffice, e il controllo del claim admin vale per ognuna. */}
        <Route path="/backoffice/*" element={dopoLAccesso(utente?.admin ? <Backoffice /> : <Navigate to="/" replace />)} />
        <Route path="/termini" element={dopoLAccesso(<Termini />)} />
        <Route path="/privacy" element={dopoLAccesso(<Privacy />)} />
        <Route path="*" element={dopoLAccesso(<Navigate to="/" replace />)} />
      </Routes>
      <footer className="piede">
        <div className="piede-colonne">
          <div>
            <div className="marchio piede-marchio">{NOME_PRODOTTO}</div>
            <p className="muted small">{t.piede.descrizione}</p>
            {primaPagina && <SceltaLingua lingua={lingua} etichetta={t.barra.lingua} />}
          </div>
          {/* Col sito chiuso niente link alle sezioni, alla demo e alla registrazione: non ci sono. */}
          {!chiuso && (
          <div>
            <h2 className="piede-titolo">{t.piede.prodotto}</h2>
            <a href={`${casa}#funzioni`}>{t.piede.funzioni}</a>
            <a href={`${casa}#prezzi`}>{t.piede.prezzi}</a>
            <a href={URL_DEMO} target="_blank" rel="noreferrer">
              {t.piede.demo}
            </a>
          </div>
          )}
          <div>
            <h2 className="piede-titolo">{t.piede.account}</h2>
            <Link to="/accedi" {...versoItaliano}>
              {t.piede.accedi}
              {inItaliano}
            </Link>
            {!chiuso && (
              <Link to="/registrati" {...versoItaliano}>
                {t.piede.registrati}
                {inItaliano}
              </Link>
            )}
          </div>
          <div>
            <h2 className="piede-titolo">{t.piede.informazioni}</h2>
            <Link to="/termini" {...versoItaliano}>
              {t.piede.termini}
              {inItaliano}
            </Link>
            <Link to="/privacy" {...versoItaliano}>
              {t.piede.privacy}
              {inItaliano}
            </Link>
            <a href={`mailto:${EMAIL_CONTATTI}`}>{EMAIL_CONTATTI}</a>
          </div>
        </div>
        <p className="muted small piede-riga">
          © {new Date().getFullYear()} {NOME_PRODOTTO}. {t.piede.nota}{' '}
          <span data-testid="versione">
            {t.piede.versione} {VERSIONE}
          </span>
        </p>
      </footer>
    </div>
  )
}
