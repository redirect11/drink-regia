import { useEffect, useState } from 'react'
import { elencoTemi, gestisciTemi } from '../lib/db.js'
import { BASI, STILI, CHIAVI_COLORE, STATI_DETTI, coloriDelTema, temaVuoto, temiDaMostrare } from '../lib/temi.js'

// IL CATALOGO DEI TEMI (REQ-FLOTTA-032, REQ-MENU-023 di tana-drink).
// L'utente, 02/11/2026: «Serve un posto dove pubblicarne di nuovi», e
// pubblica solo il fornitore, dalla regia. Si sceglie la base e lo stile,
// si ritoccano i sette colori, si scrivono nome e descrizione; l'anteprima
// mostra la tavolozza e un assaggio; poi si pubblica o si ritira. L'app lo
// legge da catalogoTemi all'apertura del suo marketplace.
export default function CatalogoTemi({ onErrore }) {
  const [elenco, setElenco] = useState([])
  const [giro, setGiro] = useState(0)
  // Il tema aperto nell'editor: null chiuso; `nuovo` se non è ancora salvato.
  const [aperto, setAperto] = useState(null)
  const carica = () => setGiro((g) => g + 1)
  // Quelli del database e quelli del repository (REQ-FLOTTA-033).
  const temi = temiDaMostrare(elenco)

  useEffect(() => {
    elencoTemi()
      .then(setElenco)
      .catch((e) => onErrore(e.message))
  }, [giro, onErrore])

  const azione = async (nome, dati) => {
    try {
      await gestisciTemi(nome, dati)
      carica()
      return true
    } catch (e) {
      onErrore(e.message)
      return false
    }
  }

  return (
    <section className="card" aria-label="Temi">
      <h3>Temi</h3>
      <p className="muted small">
        Un tema è una tavolozza e uno stile del menù che l’app sa già disegnare: non è codice, e non può rompere il menù dei
        locali. L’app legge i temi pubblicati quando si apre il suo marketplace; un tema ritirato sparisce dal catalogo, ma resta a
        chi l’ha già installato. Per ora sono tutti gratis. I temi «dal repository» arrivano col deploy
        (functions/temi/catalogo.json): si cambiano nel file, e da qui si ritirano.
      </p>
      {temi.length === 0 && <p className="muted small">Nessun tema ancora.</p>}
      {temi.length > 0 && (
        <div className="tabella-scorre">
          <table className="tabella-locali" aria-label="I temi">
            <thead>
              <tr>
                <th scope="col">Tema</th>
                <th scope="col">Stile</th>
                <th scope="col">Base</th>
                <th scope="col">Stato</th>
                <th scope="col">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {temi.map((t) => (
                <tr key={t.id} data-testid={`tema-${t.id}`}>
                  <th scope="row">
                    {t.nome}
                    <div className="muted small">
                      {t.id}
                      {t.dal_repository && ' · dal repository'}
                    </div>
                  </th>
                  <td>{STILI.find((s) => s.id === t.stile)?.nome || t.stile}</td>
                  <td>{BASI.find((b) => b.id === t.tavolozza?.base)?.nome || t.tavolozza?.base}</td>
                  <td>
                    <span className={`stato stato-${t.stato === 'pubblicato' ? 'ok' : 'neutro'}`}>{STATI_DETTI[t.stato] || t.stato}</span>
                  </td>
                  <td>
                    <div className="gruppo-azioni">
                      {/* Un tema del repository si cambia nel suo file, con una PR. */}
                      {!t.dal_repository && (
                        <button type="button" className="btn ghost small" onClick={() => setAperto({ ...t, nuovo: false })}>
                          Modifica
                        </button>
                      )}
                      {t.stato !== 'pubblicato' && (
                        <button type="button" className="btn ghost small" onClick={() => azione('pubblica', { id: t.id })}>
                          Pubblica
                        </button>
                      )}
                      {t.stato === 'pubblicato' && (
                        <button type="button" className="btn ghost small" onClick={() => window.confirm(`Ritirare «${t.nome}» dal catalogo?`) && azione('ritira', { id: t.id })}>
                          Ritira
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!aperto && (
        <div className="azioni">
          <button type="button" className="btn small" onClick={() => setAperto({ ...temaVuoto(), nuovo: true })}>
            Nuovo tema
          </button>
        </div>
      )}
      {aperto && (
        <EditorTema
          key={aperto.id || 'nuovo'}
          iniziale={aperto}
          onChiudi={() => setAperto(null)}
          onSalva={async (tema, pubblica) => {
            const ok = await azione('salva', { tema, nuovo: aperto.nuovo })
            if (ok && pubblica) await azione('pubblica', { id: tema.id })
            if (ok) setAperto(null)
          }}
        />
      )}
    </section>
  )
}

// L'editor: i campi a sinistra, l'anteprima a destra.
function EditorTema({ iniziale, onChiudi, onSalva }) {
  const [tema, setTema] = useState(() => ({
    id: iniziale.id,
    nome: iniziale.nome,
    descrizione: iniziale.descrizione || '',
    tavolozza: { base: iniziale.tavolozza?.base || 'tana-scuro', colori: { ...(iniziale.tavolozza?.colori || {}) } },
    stile: iniziale.stile || 'classico',
  }))
  const [inCorso, setInCorso] = useState(false)
  const effettivi = coloriDelTema(tema.tavolozza)
  const campo = (k) => ({ value: tema[k], onChange: (e) => setTema((t) => ({ ...t, [k]: e.target.value })) })
  const colore = (k, v) =>
    setTema((t) => {
      const colori = { ...t.tavolozza.colori }
      if (v == null) delete colori[k]
      else colori[k] = v
      return { ...t, tavolozza: { ...t.tavolozza, colori } }
    })
  const invia = async (pubblica) => {
    setInCorso(true)
    await onSalva(tema, pubblica)
    setInCorso(false)
  }

  return (
    <form
      className="editor-tema"
      aria-label={iniziale.nuovo ? 'Nuovo tema' : `Tema ${iniziale.nome}`}
      onSubmit={(e) => {
        e.preventDefault()
        invia(false)
      }}
    >
      <div className="editor-tema-campi">
        <label>
          Identificativo
          <input {...campo('id')} disabled={!iniziale.nuovo} required placeholder="grand-hotel-oro" spellCheck={false} />
        </label>
        <label>
          Nome
          <input {...campo('nome')} required maxLength={40} />
        </label>
        <label>
          Descrizione
          <textarea {...campo('descrizione')} maxLength={240} rows={3} />
        </label>
        <label>
          Base della tavolozza
          <select value={tema.tavolozza.base} onChange={(e) => setTema((t) => ({ ...t, tavolozza: { ...t.tavolozza, base: e.target.value } }))}>
            {BASI.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stile del menù
          <select {...campo('stile')}>
            {STILI.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="colori-tema">
          <legend>I sette colori</legend>
          {CHIAVI_COLORE.map(({ key, label }) => (
            <div className="colore-tema" key={key}>
              <input type="color" aria-label={label} value={effettivi[key]} onChange={(e) => colore(key, e.target.value)} />
              <span>
                {label} <code className="muted small">{effettivi[key]}</code>
              </span>
              {tema.tavolozza.colori[key] ? (
                <button type="button" className="btn ghost small" onClick={() => colore(key, null)}>
                  Come la base
                </button>
              ) : (
                <span className="muted small">dalla base</span>
              )}
            </div>
          ))}
        </fieldset>
        {!iniziale.nuovo && iniziale.stato === 'pubblicato' && (
          <p className="muted small">È pubblicato: salvando, il ritocco arriva subito nel catalogo.</p>
        )}
        <div className="azioni">
          <button type="submit" className="btn small" disabled={inCorso}>
            {iniziale.nuovo ? 'Salva in bozza' : 'Salva'}
          </button>
          {(iniziale.nuovo || iniziale.stato !== 'pubblicato') && (
            <button type="button" className="btn ghost small" disabled={inCorso} onClick={() => invia(true)}>
              Salva e pubblica
            </button>
          )}
          <button type="button" className="btn ghost small" onClick={onChiudi}>
            Chiudi
          </button>
        </div>
      </div>
      <Anteprima colori={effettivi} tema={tema} />
    </form>
  )
}

// L'anteprima: la tavolozza e un assaggio del menù coi suoi colori. Lo
// stile vero lo disegna l'app: qui si dice quale.
function Anteprima({ colori, tema }) {
  return (
    <div className="anteprima-tema" aria-label="Anteprima">
      <div className="tavolozza-tema">
        {CHIAVI_COLORE.map(({ key, label }) => (
          <span key={key} className="campione" title={`${label} ${colori[key]}`} style={{ background: colori[key] }} />
        ))}
      </div>
      <div className="assaggio-tema" data-testid="assaggio" style={{ background: colori['--bg'], color: colori['--text'] }}>
        <div className="assaggio-card" style={{ background: colori['--card'], borderColor: colori['--bg-2'] }}>
          <strong>Negroni</strong> · <span style={{ color: colori['--accent'] }}>9,00 €</span>
          <div style={{ color: colori['--muted'] }}>Gin, vermut rosso, bitter</div>
          <span className="assaggio-bottone" style={{ background: colori['--accent-2'], color: colori['--bg'] }}>
            Aggiungi
          </span>
        </div>
        <div className="muted small" style={{ color: colori['--muted'] }}>
          {tema.nome || 'Senza nome'} · stile {STILI.find((s) => s.id === tema.stile)?.nome}
        </div>
      </div>
    </div>
  )
}
