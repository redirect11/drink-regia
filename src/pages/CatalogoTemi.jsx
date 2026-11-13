import { useEffect, useState } from 'react'
import { elencoTemi, gestisciTemi, elencoStili, gestisciStili } from '../lib/db.js'
import { BASI, STILI, CHIAVI_COLORE, STATI_DETTI, IMPAGINAZIONI, coloriDelTema, temaVuoto, temiDaMostrare, stiliDaMostrare, nomeStile, STILI_RICETTA } from '../lib/temi.js'

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
  // Gli stili a ricetta (REQ-FLOTTA-034), con le loro copie nel database.
  const [elencoS, setElencoS] = useState([])
  const stili = stiliDaMostrare(elencoS)

  useEffect(() => {
    elencoTemi()
      .then(setElenco)
      .catch((e) => onErrore(e.message))
    elencoStili()
      .then(setElencoS)
      .catch((e) => onErrore(e.message))
  }, [giro, onErrore])

  const azioneStile = (nome, id) =>
    gestisciStili(nome, id)
      .then(carica)
      .catch((e) => onErrore(e.message))

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
                  <td>{nomeStile(t.stile)}</td>
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
      {/* Il modulo si apre dove lo si è chiesto, al posto del bottone e sotto
          la tabella dei temi (REQ-FLOTTA-066): prima stava in fondo alla
          scheda, dopo gli stili a ricetta, e chi premeva non lo vedeva. */}
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
      {!aperto && (
        <div className="azioni">
          <button type="button" className="btn small" onClick={() => setAperto({ ...temaVuoto(), nuovo: true })}>
            Nuovo tema
          </button>
        </div>
      )}
      <h4>Stili a ricetta</h4>
      <p className="muted small">
        La forma del menù come scelta fra valori fissi (caratteri, voci, separatori, cornici, sfondo), che l’app disegna con il suo
        motore: si cambiano nel loro file (functions/temi/stili.json), da qui si ritirano. Un’app che non ha ancora il motore non li
        mostra, e nemmeno i temi che li usano.
      </p>
      <div className="tabella-scorre">
        <table className="tabella-locali" aria-label="Gli stili a ricetta">
          <thead>
            <tr>
              <th scope="col">Stile</th>
              <th scope="col">Caratteri</th>
              <th scope="col">Voci</th>
              <th scope="col">Stato</th>
              <th scope="col">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {stili.map((s) => (
              <tr key={s.id} data-testid={`stile-${s.id}`}>
                <th scope="row">
                  {s.nome}
                  <div className="muted small">{s.descrizione}</div>
                </th>
                <td className="muted small">
                  {s.ricetta?.caratteri?.titolo} · {s.ricetta?.caratteri?.voce} · {s.ricetta?.caratteri?.testo}
                </td>
                <td className="muted small">
                  {s.ricetta?.voce?.forma}, prezzo {s.ricetta?.voce?.prezzo}, sfondo {s.ricetta?.sfondo}
                </td>
                <td>
                  <span className={`stato stato-${s.stato === 'pubblicato' ? 'ok' : 'neutro'}`}>{STATI_DETTI[s.stato] || s.stato}</span>
                </td>
                <td>
                  {s.stato === 'pubblicato' ? (
                    <button type="button" className="btn ghost small" onClick={() => window.confirm(`Ritirare lo stile «${s.nome}»?`) && azioneStile('ritira', s.id)}>
                      Ritira
                    </button>
                  ) : (
                    <button type="button" className="btn ghost small" onClick={() => azioneStile('pubblica', s.id)}>
                      Pubblica
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// La ricetta di un tema su misura (REQ-FLOTTA-040) si scrive come JSON:
// è il fornitore (o un agente) a farla, con lo stesso vocabolario degli
// stili del repository. Vuota, il tema usa lo stile scelto sopra.
const ricettaScritta = (r) => (r ? JSON.stringify(r, null, 2) : '')
function ricettaLetta(testo, struttura) {
  const pulito = testo.trim()
  if (!pulito) return { ricetta: null }
  try {
    const r = JSON.parse(pulito)
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { errore: 'La ricetta è un oggetto JSON.' }
    return { ricetta: { versione: 1, ...r, impaginazione: struttura } }
  } catch {
    return { errore: 'La ricetta non è un JSON leggibile.' }
  }
}

// L'editor: i campi a sinistra, l'anteprima a destra. Con `suMisura` è il
// tema di un locale: in più la struttura del menù e la ricetta (JSON).
export function EditorTema({ iniziale, onChiudi, onSalva, suMisura = false }) {
  const [tema, setTema] = useState(() => ({
    id: iniziale.id,
    nome: iniziale.nome,
    descrizione: iniziale.descrizione || '',
    tavolozza: { base: iniziale.tavolozza?.base || 'tana-scuro', colori: { ...(iniziale.tavolozza?.colori || {}) } },
    stile: iniziale.stile || 'classico',
  }))
  const [struttura, setStruttura] = useState(iniziale.ricetta?.impaginazione || IMPAGINAZIONI[0].id)
  const [ricetta, setRicetta] = useState(() => ricettaScritta(iniziale.ricetta))
  const [erroreRicetta, setErroreRicetta] = useState(null)
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
    let daSalvare = tema
    if (suMisura) {
      const letta = ricettaLetta(ricetta, struttura)
      setErroreRicetta(letta.errore || null)
      if (letta.errore) return
      daSalvare = letta.ricetta ? { ...tema, ricetta: letta.ricetta } : tema
    }
    setInCorso(true)
    await onSalva(daSalvare, pubblica)
    setInCorso(false)
  }

  return (
    <form
      className="editor-tema"
      aria-label={iniziale.nuovo ? (suMisura ? 'Nuovo tema su misura' : 'Nuovo tema') : `Tema ${iniziale.nome}`}
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
            <optgroup label="Dell’app">
              {STILI.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label="A ricetta">
              {STILI_RICETTA.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </optgroup>
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
        {suMisura && (
          <>
            <label>
              Struttura del menù
              <select value={struttura} onChange={(e) => setStruttura(e.target.value)}>
                {IMPAGINAZIONI.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ricetta (JSON, facoltativa)
              <textarea value={ricetta} onChange={(e) => setRicetta(e.target.value)} rows={8} spellCheck={false} placeholder='{ "caratteri": { "titolo": "playfair-display", "voce": "inter", "testo": "inter" }, "voce": { "forma": "riga", "prezzo": "puntini" } }' />
            </label>
            <p className="muted small">
              Lo stesso vocabolario degli stili a ricetta (functions/temi/stili.json); la struttura del menù la mette la scelta qui sopra.
              Senza ricetta il tema usa lo stile scelto.
            </p>
            {erroreRicetta && <p className="errore small">{erroreRicetta}</p>}
          </>
        )}
        {!iniziale.nuovo && iniziale.stato === 'pubblicato' && (
          <p className="muted small">È pubblicato: salvando, il ritocco arriva subito {suMisura ? 'nella licenza del locale' : 'nel catalogo'}.</p>
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
// stile vero lo disegna l'app: qui si dice quale. La usa anche la dashboard
// del titolare, per i suoi temi su misura.
export function Anteprima({ colori, tema }) {
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
          {tema.nome || 'Senza nome'} · stile {nomeStile(tema.stile)}
        </div>
      </div>
    </div>
  )
}
