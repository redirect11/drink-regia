import { useEffect, useState } from 'react'
import { vistaCollaboratore, apriLaTuaApp } from '../lib/db.js'
import { PIANI } from '../lib/piani.js'
import { hrefSicuro } from '../lib/istanze.js'

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
      <main className="pagina stretta">
        <p role="alert" className="errore">
          {errore}
        </p>
      </main>
    )
  if (vista === undefined) return <main className="pagina stretta muted">Carico…</main>
  if (!vista.membro) return <main className="pagina stretta">Non collabori più con nessun locale: se è un errore, chiedi al titolare.</main>

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
    <main className="pagina dashboard">
      <header className="dashboard-testa">
        <h2>{vista.nome_locale}</h2>
        <p className="muted small">
          Collabori con questo locale. Abbonamento, pagamenti e dati del locale li gestisce il titolare.
        </p>
      </header>
      <section className="card" aria-label="Piano">
        <h3>Piano</h3>
        <p>
          {piano?.nome || vista.piano || '—'}
          {vista.terminali ? <span className="muted small"> · {vista.terminali} terminali</span> : null}
        </p>
      </section>
      <section className="card" aria-label="L’app">
        <h3>L’app</h3>
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
