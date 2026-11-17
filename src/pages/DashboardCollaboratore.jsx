import { useEffect, useState } from 'react'
import { vistaCollaboratore, apriLaTuaApp } from '../lib/db.js'
import { PIANI } from '../lib/piani.js'
import { hrefSicuro } from '../lib/istanze.js'
import Titolo from '../components/Titolo.jsx'
import { conProdotto } from '../lib/titoli.js'

// LA VISTA DEL COLLABORATORE (REQ-FLOTTA-098): il locale con cui collabora,
// il piano, lo stato dell'app e «Apri l'app» col suo account. Niente
// abbonamento, pagamenti, dati del titolare: li gestisce il titolare. La
// vista la dà la regia (vistaCollaboratore), che rilegge il collegamento:
// il segno nel token sceglie solo questa pagina, e se il titolare l'ha
// tolto qui si dice.
export default function DashboardCollaboratore() {
  const [vista, setVista] = useState(undefined)
  const [errore, setErrore] = useState(null)
  const [erroreApp, setErroreApp] = useState(null)

  useEffect(() => {
    let viva = true
    vistaCollaboratore()
      .then((v) => viva && setVista(v || { membro: false }))
      .catch((e) => viva && setErrore(e.message))
    return () => {
      viva = false
    }
  }, [])

  if (errore)
    return (
      <main id="contenuto" tabIndex={-1} className="pagina stretta">
        {/* L'h1 anche qui (REQ-FLOTTA-125), solo per i lettori di schermo. */}
        <h1 className="solo-lettori">Dashboard</h1>
        <Titolo testo={conProdotto('Dashboard')} />
        <p role="alert" className="errore">
          {errore}
        </p>
      </main>
    )
  if (vista === undefined) return (
      <main id="contenuto" tabIndex={-1} className="pagina stretta muted">
        <Titolo testo={conProdotto('Dashboard')} />
        Carico…
      </main>
    )
  if (!vista.membro)
    return (
      <main id="contenuto" tabIndex={-1} className="pagina stretta">
        <h1 className="solo-lettori">Dashboard</h1>
        <Titolo testo={conProdotto('Dashboard')} />
        Non collabori più con nessun locale: se è un errore, chiedi al titolare.
      </main>
    )

  const piano = vista.piano ? PIANI[vista.piano] : null
  const url = hrefSicuro(vista.app?.url)

  // Nell'app senza password, col suo account (REQ-FLOTTA-030).
  const apri = async () => {
    setErroreApp(null)
    try {
      window.location.href = (await apriLaTuaApp()).url
    } catch (e) {
      setErroreApp(e.message)
    }
  }

  return (
    <main id="contenuto" tabIndex={-1} className="pagina dashboard">
      <header className="dashboard-testa">
        <h1 className="titolo-pagina">{vista.nome_locale}</h1>
        <Titolo testo={conProdotto('Dashboard')} />
        <p className="muted small">
          Collabori con questo locale. Abbonamento, pagamenti e dati del locale li gestisce il titolare.
        </p>
      </header>
      <section className="card" aria-label="Piano">
        <h2>Piano</h2>
        <p>
          {piano?.nome || vista.piano || '—'}
          {vista.terminali ? <span className="muted small"> · {vista.terminali} terminali</span> : null}
        </p>
      </section>
      <section className="card" aria-label="L’app">
        <h2>L’app</h2>
        {url ? (
          <>
            <p>
              L’app è su <a href={url}>{url}</a>.{vista.app?.versione && <span className="muted small"> Versione {vista.app.versione}.</span>}
            </p>
            <button className="btn" type="button" onClick={apri}>
              Apri l’app
            </button>
          </>
        ) : (
          <p className="muted">L’app non è attiva in questo momento.</p>
        )}
        {erroreApp && (
          <p role="alert" className="errore">
            {erroreApp}
          </p>
        )}
      </section>
    </main>
  )
}
