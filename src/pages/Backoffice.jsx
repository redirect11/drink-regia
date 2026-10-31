import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  elencoClienti,
  elencoIstanze,
  elencoRichieste,
  cambiaPianoAdmin,
  rilanciaAttivazione,
  impostaStatoIstanza,
  aggiornaIstanza,
  osservaImpostazioniRegia,
  impostaDeployAutomatico,
  autorizzaRichiesta,
  rifiutaRichiesta,
  creaClienteDaAdmin,
  elencoCassettiAI,
  gestisciCassettoAI,
  registraLocaleEsistente,
  elencoRilasci,
  gestisciRilascio,
  gestisciEliminazione,
  osservaVendita,
  impostaVendita,
  elencoContatti,
  segnaContatto,
  impostaAggiornamentiEsistente,
  osservaRegoleAggiornamenti,
  impostaRegoleAggiornamenti,
} from '../lib/db.js'
import { venditaPulita } from '../lib/vendita.js'
import { statoIstanza, statoDetto, STATI, progettoDi } from '../lib/istanze.js'
import { PIANI, MODULI, prezzoMensile, euro } from '../lib/piani.js'
import { contattoDi } from '../lib/clienti.js'
import { statoCredito, euroCent } from '../lib/ai.js'
import { GRUPPI, TAG, aggiornamentoDetto } from '../lib/rilasci.js'
import { BASE, SEZIONI, VISTE, aggiornamentoFallito, aggiornaLaRegia, contiDelBackoffice, filtraLocali } from '../lib/backoffice.js'
import Rilasci from './Rilasci.jsx'
import { MODALITA, regolaDetta, propostaDetta } from '../lib/aggiornamenti.js'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato
// dell'istanza, progetto, versione. Solo col claim admin (App.jsx non ci fa
// arrivare gli altri, su ogni sotto-rotta, e le regole Firestore non gli
// darebbero comunque i dati).
//
// E GOVERNA I DEPLOY (REQ-FLOTTA-011): l'interruttore del deploy automatico,
// le richieste da autorizzare quando è spento, un locale creato da qui.
//
// IN SEZIONI (l'utente, 30/10/2026: «puoi separare le varie sezioni del
// backoffice magari in sotto menu? Così è tutto troppo caotico»): Locali,
// Richieste, Rilasci, Vendita, Nuovo locale, ognuna col suo indirizzo
// sotto /backoffice (src/lib/backoffice.js). I dati si leggono qui, una
// volta per tutte le sezioni: passare da una all'altra non rilegge niente,
// e i contatori del sotto-menù li hanno già.
export default function Backoffice() {
  const [righe, setRighe] = useState(undefined)
  const [errore, setErrore] = useState(null)
  const [impostazioni, setImpostazioni] = useState({})
  // La chiave AI appena creata: si vede una volta sola, qui (REQ-AI-003).
  const [chiaveNuova, setChiaveNuova] = useState(null)
  const [rilasci, setRilasci] = useState([])
  // Le richieste di contatto (REQ-FLOTTA-017): lette qui e non nella loro
  // sezione, perché il contatore di «Richieste» le conta da ogni sezione.
  const [contatti, setContatti] = useState([])
  // Lo slug -> il ref che «Aggiorna subito» ha lanciato, per dirlo sulla scheda.
  const [lanciati, setLanciati] = useState({})
  const vai = useNavigate()
  const { pathname } = useLocation()

  const carica = async () => {
    try {
      // I cassetti AI sono un di più: se non si leggono, il resto del
      // backoffice deve lavorare lo stesso.
      const [clienti, istanze, richieste, cassetti, elencoR] = await Promise.all([
        elencoClienti(),
        elencoIstanze(),
        elencoRichieste(),
        elencoCassettiAI().catch(() => ({})),
        elencoRilasci().catch(() => []),
      ])
      setRilasci(elencoR)
      setRighe(
        clienti
          .map((c) => ({ cliente: c, istanza: istanze[c.slug] || null, richiesta: richieste[c.slug] || null, cassetto: cassetti[c.slug] || null }))
          .map((r) => ({ ...r, stato: statoIstanza(r.istanza, r.richiesta) }))
          .sort((a, b) => peso(a.stato) - peso(b.stato))
      )
    } catch (e) {
      setErrore(e.message)
      setRighe([])
    }
  }
  const caricaContatti = useCallback(
    () =>
      elencoContatti()
        .then((elenco) => setContatti(elenco || []))
        .catch((e) => setErrore(e.message)),
    []
  )
  useEffect(() => {
    carica()
  }, [])
  useEffect(() => {
    caricaContatti()
  }, [caricaContatti])
  useEffect(() => osservaImpostazioniRegia(setImpostazioni), [])
  // Un errore riguarda la sezione in cui è nato: cambiando sezione si toglie.
  useEffect(() => setErrore(null), [pathname])

  const automatico = impostazioni.deploy_automatico !== false

  // Sospendi, Riattiva, Chiudi (REQ-FLOTTA-008): l'app del locale si ferma
  // e lo dice; i dati restano. Il motivo lo legge il titolare.
  const cambiaStato = async (c, stato) => {
    const motivo = stato === 'attiva' ? null : window.prompt(`Motivo (lo legge il titolare di ${c.nome_locale}):`, stato === 'sospesa' ? 'pagamento non ricevuto' : 'chiusura')
    if (stato !== 'attiva' && motivo == null) return
    try {
      await impostaStatoIstanza(c.slug, stato, motivo)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }

  // Annullare un'eliminazione programmata: l'admin le annulla tutte; il
  // locale resta chiuso finché non lo si riattiva (REQ-FLOTTA-014).
  const annullaEliminazione = async (c) => {
    if (!window.confirm(`Annullare l’eliminazione di ${c.nome_locale}?`)) return
    try {
      await gestisciEliminazione('annulla', { slug: c.slug })
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }

  // L'ultima versione dell'app a un locale (REQ-FLOTTA-009): per una
  // correzione urgente su un locale solo. A tutti i locali un rilascio ci
  // arriva a ondate (REQ-FLOTTA-012), dalla sezione «Rilasci»: un errore
  // si vede sulle istanze di prova, non su tutti insieme. La Function
  // aggiornaIstanza sceglie da sé la versione (APP_REF della regia: develop
  // di tana-drink sulla regia di test, main in produzione) e la restituisce:
  // la scheda la dice senza che il sito debba saperla in anticipo.
  const aggiorna = async (c) => {
    setErrore(null)
    try {
      const esito = await aggiornaIstanza(c.slug)
      setLanciati((v) => ({ ...v, [c.slug]: esito?.ref || '' }))
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  const azioneRilascio = async (azione, dati) => {
    setErrore(null)
    try {
      const esito = await gestisciRilascio(azione, dati)
      if (esito?.nonPartiti?.length) setErrore(`Non partiti: ${esito.nonPartiti.join('; ')}`)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  // Un aggiornamento fallito: si rilancia (nel rilascio, o da solo con lo
  // stesso ref) oppure si torna alla versione di prima.
  const riprova = (c, agg) =>
    agg.rilascio ? azioneRilascio('riprova', { ref: agg.rilascio, slug: c.slug }) : aggiornaIstanza(c.slug, agg.ref).catch((e) => setErrore(e.message)).then(carica)
  const indietro = (c, agg) => {
    if (window.confirm(`Riportare ${c.nome_locale} a ${agg.versione_precedente}?`)) azioneRilascio('indietro', { slug: c.slug })
  }

  const autorizza = async (c) => {
    try {
      await autorizzaRichiesta(c.slug)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  const rifiuta = async (c) => {
    const motivo = window.prompt(`Motivo del rifiuto (lo legge il titolare di ${c.nome_locale}):`, '')
    if (motivo == null) return
    try {
      await rifiutaRichiesta(c.slug, motivo)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  const segna = (c, stato) =>
    segnaContatto(c.uid, stato)
      .then(caricaContatti)
      .catch((e) => setErrore(e.message))

  // Il cassetto AI di un locale (REQ-AI-003): ricarica a mano (la Tana la
  // ricarichiamo noi), tetto del mese, acceso o spento, chiave.
  const azioneAI = async (c, azione, extra = {}) => {
    setErrore(null)
    try {
      const esito = await gestisciCassettoAI(c.slug, azione, extra)
      if (esito?.chiave) setChiaveNuova({ nome: c.nome_locale, chiave: esito.chiave })
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  const ricaricaAI = (c) => {
    const importo = window.prompt(`Euro da aggiungere al credito AI di ${c.nome_locale}:`, '10')
    if (importo == null) return
    const nota = window.prompt('Nota (facoltativa):', '') || ''
    azioneAI(c, 'ricarica', { importo: Number(String(importo).replace(',', '.')), nota })
  }
  const tettoAI = (c, attuale) => {
    const importo = window.prompt(`Tetto mensile del credito AI di ${c.nome_locale}, in euro:`, String(attuale ?? ''))
    if (importo == null) return
    azioneAI(c, 'tetto', { importo: Number(String(importo).replace(',', '.')) })
  }
  const chiaveAI = (c, cassetto) => {
    if (cassetto?.chiave_creata_il && !window.confirm(`La chiave attuale di ${c.nome_locale} smette di funzionare subito. Continuare?`)) return
    azioneAI(c, 'chiave')
  }

  if (righe === undefined) return <main className="pagina muted">Carico…</main>

  const daApprovare = righe.filter((r) => r.stato === STATI.DA_APPROVARE)
  // Le azioni di una scheda, le stesse da «Locali» e da «Rilasci».
  const az = { carica, cambiaStato, annullaEliminazione, aggiorna, azioneRilascio, riprova, indietro, azioneAI, ricaricaAI, tettoAI, chiaveAI, onErrore: setErrore }
  // Dopo «Crea il locale» o «Registra il locale» si va a vederlo in elenco.
  const creato = () => {
    carica()
    vai(`${BASE}/locali`)
  }

  return (
    <main className="pagina larga">
      <h2>Backoffice</h2>
      <SottoMenu conti={contiDelBackoffice(righe, contatti)} />
      {errore && <p className="errore">{errore}</p>}

      {chiaveNuova && (
        <section className="card avviso" aria-label="Chiave AI nuova">
          <h3>Chiave AI di {chiaveNuova.nome}</h3>
          <p className="small">
            Copiala adesso: non si vede più. Va tra i segreti dell’installazione, che la usa per chiamare la regia; la chiave precedente non
            funziona più.
          </p>
          <code className="chiave" data-testid="chiave-ai">
            {chiaveNuova.chiave}
          </code>
          <div className="azioni">
            <button type="button" className="btn small" onClick={() => setChiaveNuova(null)}>
              L’ho copiata
            </button>
          </div>
        </section>
      )}

      <div className="bo-sezione">
        <Routes>
          <Route index element={<Navigate to={`${BASE}/locali`} replace />} />
          <Route path="locali" element={<SezioneLocali righe={righe} az={az} lanciati={lanciati} />} />
          <Route
            path="richieste"
            element={
              <SezioneRichieste
                automatico={automatico}
                onAutomatico={(acceso) => impostaDeployAutomatico(acceso).catch((err) => setErrore(err.message))}
                daApprovare={daApprovare}
                contatti={contatti}
                onAutorizza={autorizza}
                onRifiuta={rifiuta}
                onSegna={segna}
              />
            }
          />
          <Route
            path="rilasci"
            element={
              <>
                <RegoleAggiornamenti onErrore={setErrore} onFatto={carica} />
                <Rilasci rilasci={rilasci} onAzione={azioneRilascio} />
                <AggiornamentiFalliti righe={righe} az={az} />
              </>
            }
          />
          <Route path="vendita" element={<Vendita onErrore={setErrore} />} />
          <Route
            path="nuovo"
            element={
              <>
                <NuovoLocale onFatto={creato} onErrore={setErrore} />
                <LocaleEsistente onFatto={creato} onErrore={setErrore} />
              </>
            }
          />
          {/* Un indirizzo che non c'è (un link vecchio) porta all'elenco, non a una pagina vuota. */}
          <Route path="*" element={<Navigate to={`${BASE}/locali`} replace />} />
        </Routes>
      </div>
    </main>
  )
}

// IL SOTTO-MENÙ: una riga di link, la voce attiva con aria-current (lo
// mette NavLink). Sul telefono la riga scorre di lato dentro sé stessa e la
// pagina resta ferma (index.css, .sotto-menu). Il contatore si legge anche
// a voce: «Richieste, 2 da gestire».
function SottoMenu({ conti }) {
  return (
    <nav className="sotto-menu" aria-label="Sezioni del backoffice">
      {SEZIONI.map((s) => (
        <NavLink key={s.id} to={`${BASE}/${s.id}`}>
          {s.nome}
          {conti[s.id] > 0 && (
            <span className="conta">
              <span aria-hidden="true">{conti[s.id]}</span>
              <span className="solo-lettori">{`, ${conti[s.id]} da gestire`}</span>
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

// «LOCALI»: l'elenco delle schede, con la ricerca e la vista per stato.
// Ricerca e vista stanno nell'indirizzo (?cerca=…&vista=…), così un elenco
// filtrato si condivide; si scrivono con replace, per non riempire la
// cronologia a ogni tasto.
function SezioneLocali({ righe, az, lanciati }) {
  const [parametri, setParametri] = useSearchParams()
  // Lo slug del locale col modulo «Cambia piano» aperto (REQ-FLOTTA-016).
  const [cambia, setCambia] = useState(null)
  // Lo slug del locale col modulo «Elimina» aperto (REQ-FLOTTA-014).
  const [elimina, setElimina] = useState(null)
  const vista = parametri.get('vista') || 'tutti'
  const cerca = parametri.get('cerca') || ''
  const filtra = (chiave, valore) =>
    setParametri(
      (p) => {
        const n = new URLSearchParams(p)
        if (valore && valore !== 'tutti') n.set(chiave, valore)
        else n.delete(chiave)
        return n
      },
      { replace: true }
    )

  if (righe.length === 0) return <p className="muted">Nessun cliente.</p>
  const mostrate = filtraLocali(righe, { vista, cerca })
  const chiudi = () => {
    setCambia(null)
    setElimina(null)
    az.carica()
  }

  return (
    <>
      <div className="filtri-locali" role="search" aria-label="Cerca tra i locali">
        <div className="campo">
          <label htmlFor="bo-cerca">Cerca</label>
          <input id="bo-cerca" type="search" value={cerca} placeholder="nome, identificativo o email" onChange={(e) => filtra('cerca', e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="bo-vista">Stato</label>
          <select id="bo-vista" value={VISTE.some((v) => v.id === vista) ? vista : 'tutti'} onChange={(e) => filtra('vista', e.target.value)}>
            {VISTE.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome} ({righe.filter(v.vale).length})
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted small" data-testid="quanti-locali">
        {mostrate.length === righe.length ? `${righe.length} locali` : `${mostrate.length} di ${righe.length} locali`}
      </p>
      {mostrate.length === 0 ? (
        <p className="muted">Nessun locale con questi filtri.</p>
      ) : (
        <ul className="locali" aria-label="Locali">
          {mostrate.map((r) => (
            <li key={r.cliente.uid}>
              <SchedaLocale
                riga={r}
                az={az}
                lanciato={lanciati[r.cliente.slug]}
                cambiaAperto={cambia === r.cliente.slug}
                onCambia={() => setCambia(cambia === r.cliente.slug ? null : r.cliente.slug)}
                eliminaAperto={elimina === r.cliente.slug}
                onElimina={() => setElimina(elimina === r.cliente.slug ? null : r.cliente.slug)}
                onFatto={chiudi}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// Riprova e Torna alla versione di prima, per un aggiornamento fallito: le
// stesse sulla scheda del locale e nell'elenco dei falliti di «Rilasci».
function AzioniAggiornamento({ cliente: c, istanza, az }) {
  const agg = istanza.aggiornamento
  return (
    <>
      <button type="button" className="btn ghost small" onClick={() => az.riprova(c, agg)}>
        Riprova
      </button>
      {TAG.test(agg.versione_precedente || '') && (
        <button type="button" className="btn ghost small" onClick={() => az.indietro(c, agg)}>
          Torna a {agg.versione_precedente}
        </button>
      )}
    </>
  )
}

// UN LOCALE PER SCHEDA (29/10/2026): nome e stato breve colorato in alto,
// i dati in una griglia, le azioni a gruppi in fondo.
function SchedaLocale({ riga, az, lanciato, cambiaAperto, onCambia, eliminaAperto, onElimina, onFatto }) {
  const { cliente: c, istanza, stato, cassetto } = riga
  const credito = statoCredito(cassetto)
  // Un locale registrato come esistente (la Tana) non passa per la
  // flotta: da qui niente Sospendi e Chiudi, la licenza è del suo progetto.
  // Gli aggiornamenti sì, se l'admin li ha affidati alla regia
  // (REQ-FLOTTA-018).
  const daFlotta = istanza?.origine !== 'esistente'
  const aggiornabile = aggiornaLaRegia(istanza)
  const [gestioneAperta, setGestioneAperta] = useState(false)
  const licenza = istanza?.licenza_stato || 'attiva'
  const tono = licenza !== 'attiva' ? 'avviso' : TONO[stato] || 'neutro'
  const aiVisibile = credito || stato === STATI.ATTIVA
  return (
    <article className={`locale tono-${tono}`} aria-label={c.nome_locale}>
      <header className="locale-testa">
        <div>
          <h3>{c.nome_locale}</h3>
          <div className="muted small">
            {c.slug}
            {istanza?.interna && ' · interna'}
            {!daFlotta && ' · esistente'}
          </div>
        </div>
        <span className={`stato stato-${tono}`}>
          {licenza !== 'attiva' ? `${licenza}${istanza.licenza_motivo ? ` · ${istanza.licenza_motivo}` : ''}` : STATO_BREVE[stato] || statoDetto(stato)}
        </span>
      </header>

      <dl className="locale-dati">
        <div>
          <dt>Titolare</dt>
          <dd>
            {c.email}
            {c.fatturazione?.ragione_sociale && (
              <div className="muted small">
                {c.fatturazione.ragione_sociale} · P.IVA {c.fatturazione.partita_iva}
              </div>
            )}
            {contattoDi(c) && <div className="muted small">{contattoDi(c)}</div>}
          </dd>
        </div>
        <div>
          <dt>Piano</dt>
          <dd>{c.piano ? `${PIANI[c.piano]?.nome || c.piano} · ${euro(prezzoMensile(c))}` : <span className="muted">—</span>}</dd>
        </div>
        <div>
          <dt>Progetto</dt>
          <dd>
            <code>{istanza?.progetto || progettoDi(c.slug)}</code>
            {istanza?.profilo === 'leggero' && <div className="muted small">profilo leggero (Free)</div>}
            {istanza?.url && (
              <div className="small">
                <a href={istanza.url} target="_blank" rel="noreferrer">
                  Apri l’app ↗
                </a>
              </div>
            )}
          </dd>
        </div>
        <div>
          <dt>Versione</dt>
          <dd>
            {istanza?.versione || <span className="muted">—</span>}
            {istanza?.ref && istanza.ref !== 'main' && <div className="muted small">da {istanza.ref}</div>}
            {aggiornamentoDetto(istanza?.aggiornamento) && (
              <div className={istanza.aggiornamento.stato === 'fallito' ? 'errore small' : 'muted small'}>{aggiornamentoDetto(istanza.aggiornamento)}</div>
            )}
            {propostaDetta(istanza?.proposta_aggiornamento) && <div className="muted small">{propostaDetta(istanza.proposta_aggiornamento)}</div>}
          </dd>
        </div>
        {aggiornabile && stato === STATI.ATTIVA && (
          // Come si aggiorna questo locale (REQ-FLOTTA-020): di norma come
          // dicono le regole; l'admin lo può fissare, per esempio la Tana.
          <div>
            <dt>
              <label htmlFor={`modalita-${c.slug}`}>Aggiornamenti</label>
            </dt>
            <dd>
              <select
                id={`modalita-${c.slug}`}
                aria-label={`Aggiornamenti di ${c.nome_locale}`}
                value={istanza?.modalita_aggiornamenti || ''}
                onChange={(e) => az.azioneRilascio('modalita', { slug: c.slug, modalita: e.target.value || null })}
              >
                <option value="">Seguono le regole</option>
                {MODALITA.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              {regolaDetta(istanza?.regola_aggiornamenti) && <div className="muted small">ora: {regolaDetta(istanza.regola_aggiornamenti)}</div>}
            </dd>
          </div>
        )}
        <div>
          <dt>Credito AI</dt>
          <dd>
            {credito ? (
              <>
                <span data-testid={`credito-${c.slug}`}>{euroCent(credito.credito)}</span>
                <div className="muted small">
                  mese {euroCent(credito.spesoMese)} / {euroCent(credito.tetto)}
                  {!credito.attivo && ' · spento'}
                  {!credito.collegata && ' · senza chiave'}
                </div>
              </>
            ) : (
              <span className="muted">—</span>
            )}
          </dd>
        </div>
        {eliminazioneDetta(istanza) && (
          <div>
            <dt>Eliminazione</dt>
            <dd className={istanza.eliminazione.stato === 'fallita' ? 'errore' : ''}>{eliminazioneDetta(istanza)}</dd>
          </div>
        )}
        {daFlotta && stato === STATI.ATTIVA && !istanza?.interna && (
          <div>
            <dt>
              <label htmlFor={`gruppo-${c.slug}`}>Gruppo di rilascio</label>
            </dt>
            <dd>
              <select
                id={`gruppo-${c.slug}`}
                aria-label={`Gruppo di rilascio di ${c.nome_locale}`}
                value={istanza?.gruppo_rilascio || 'generale'}
                onChange={(e) => az.azioneRilascio('gruppo', { slug: c.slug, gruppo: e.target.value })}
              >
                {GRUPPI.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </dd>
          </div>
        )}
      </dl>

      <footer className="locale-azioni">
        <div className="gruppo-azioni" aria-label="Istanza">
          {stato === STATI.ERRORE && (
            <button type="button" className="btn small" onClick={() => rilanciaAttivazione(c.slug).then(az.carica)}>
              Rilancia
            </button>
          )}
          {aggiornabile && stato === STATI.ATTIVA && (
            // «Aggiorna» da solo non diceva cosa fa (l'utente, 30/10/2026):
            // il testo accanto lo dice sempre, non solo al passaggio del mouse,
            // e il lettore di schermo lo legge col bottone (aria-describedby).
            <>
              <button type="button" className="btn ghost small" aria-describedby={`aggiorna-${c.slug}`} onClick={() => az.aggiorna(c)}>
                Aggiorna subito
              </button>
              <span id={`aggiorna-${c.slug}`} className="muted small spiega-azione">
                solo questo locale, all’ultima versione dell’app, per una correzione urgente. A tutti i locali la porta un rilascio, a ondate (
                <Link to={`${BASE}/rilasci`}>Rilasci</Link>).
              </span>
            </>
          )}
          {aggiornabile && istanza?.aggiornamento?.stato === 'fallito' && <AzioniAggiornamento cliente={c} istanza={istanza} az={az} />}
          <button type="button" className="btn ghost small" onClick={onCambia}>
            Cambia piano…
          </button>
          {!daFlotta && (
            <button type="button" className="btn ghost small" aria-expanded={gestioneAperta} onClick={() => setGestioneAperta((v) => !v)}>
              Chi la pubblica…
            </button>
          )}
        </div>

        {!daFlotta && gestioneAperta && (
          <GestioneEsistente
            cliente={c}
            istanza={istanza}
            onErrore={az.onErrore}
            onFatto={() => {
              setGestioneAperta(false)
              az.carica()
            }}
          />
        )}

        {aiVisibile && (
          <div className="gruppo-azioni" aria-label="Credito AI">
            <span className="gruppo-nome muted small">AI</span>
            <button type="button" className="btn ghost small" onClick={() => az.ricaricaAI(c)}>
              Ricarica AI
            </button>
            <button type="button" className="btn ghost small" onClick={() => az.tettoAI(c, credito?.tetto)}>
              Tetto AI
            </button>
            <button type="button" className="btn ghost small" onClick={() => az.chiaveAI(c, cassetto)}>
              Chiave AI
            </button>
            {credito && (
              <button type="button" className="btn ghost small" onClick={() => az.azioneAI(c, credito.attivo ? 'spegni' : 'accendi')}>
                {credito.attivo ? 'Spegni AI' : 'Accendi AI'}
              </button>
            )}
          </div>
        )}

        {daFlotta && stato === STATI.ATTIVA && (
          // Sospendere e chiudere stanno a parte, lontano dalle
          // azioni di tutti i giorni (tana-drink, DESIGN.md,
          // guardrail 2: le azioni distruttive lontane dalle frequenti).
          <div className="gruppo-azioni pericolo" aria-label="Licenza">
            {licenza === 'attiva' ? (
              <>
                <button type="button" className="btn ghost small" onClick={() => az.cambiaStato(c, 'sospesa')}>
                  Sospendi
                </button>
                <button type="button" className="btn ghost small" onClick={() => az.cambiaStato(c, 'chiusa')}>
                  Chiudi
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn ghost small" onClick={() => az.cambiaStato(c, 'attiva')}>
                  Riattiva
                </button>
                {licenza === 'chiusa' && !['programmata', 'in coda', 'in corso'].includes(istanza?.eliminazione?.stato) && (
                  <button type="button" className="btn ghost small" onClick={onElimina}>
                    Elimina…
                  </button>
                )}
                {istanza?.eliminazione?.stato === 'programmata' && (
                  <button type="button" className="btn ghost small" onClick={() => az.annullaEliminazione(c)}>
                    Annulla eliminazione
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </footer>
      {lanciato !== undefined && (
        // L'esito della chiamata: il workflow è partito, non è finito.
        // Quando finisce, la versione nuova compare in «Versione».
        <p className="small" role="status">
          Aggiornamento {lanciato ? `a ${lanciato} ` : ''}partito: quando il workflow finisce, la versione nuova compare qui.
        </p>
      )}
      {cambiaAperto && <CambiaPiano cliente={c} onFatto={onFatto} onErrore={az.onErrore} />}
      {eliminaAperto && <EliminaLocale cliente={c} istanza={istanza} onFatto={onFatto} onErrore={az.onErrore} />}
    </article>
  )
}

// LE REGOLE DEGLI AGGIORNAMENTI (REQ-FLOTTA-020). L'utente, 31/10/2026:
// due modi di aggiornare, «obbligatori» come oggi o a scelta del titolare,
// e gli aggiornamenti «garantiti fino a che si paga»; le accende e le
// spegne l'admin. Chi ha già un piano non cambia niente fino al rinnovo e
// riceve un avviso: lo fa la Function, qui si sceglie e si conferma.
function RegoleAggiornamenti({ onErrore, onFatto }) {
  const [regole, setRegole] = useState(null)
  const [bozza, setBozza] = useState(null)
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState(null)

  useEffect(
    () =>
      osservaRegoleAggiornamenti((d) => {
        const r = { a_scelta: d?.a_scelta === true, solo_finche_paga: d?.solo_finche_paga === true }
        setRegole(r)
        setBozza((b) => b || r)
      }),
    []
  )
  if (!regole || !bozza) return null
  const cambiate = bozza.a_scelta !== regole.a_scelta || bozza.solo_finche_paga !== regole.solo_finche_paga

  const salva = async () => {
    if (!window.confirm('I locali attivi prendono le regole nuove al loro rinnovo (o fra 30 giorni, se il rinnovo non lo sappiamo) e ricevono subito un avviso, nell’app e nella dashboard. Continuare?')) return
    setInCorso(true)
    setEsito(null)
    try {
      const r = await impostaRegoleAggiornamenti(bozza)
      setEsito(`Regole salvate: avvisati ${r?.avvisati ?? 0} locali.${r?.nonScritti?.length ? ` Non raggiunti nell’app: ${r.nonScritti.join(', ')}.` : ''}`)
      onFatto()
    } catch (e) {
      onErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <section className="card" aria-label="Regole degli aggiornamenti">
      <h3>Regole degli aggiornamenti</h3>
      <label className="riga">
        <input type="checkbox" checked={bozza.a_scelta} onChange={(e) => setBozza((b) => ({ ...b, a_scelta: e.target.checked }))} />A scelta del titolare: prima di
        ogni versione vede le novità e decide se aggiornare o saltarla
      </label>
      <label className="riga">
        <input type="checkbox" checked={bozza.solo_finche_paga} onChange={(e) => setBozza((b) => ({ ...b, solo_finche_paga: e.target.checked }))} />
        Solo finché si paga: chi non paga torna al Free, e il Free riceve solo i rilasci obbligatori
      </label>
      <p className="muted small">
        Un rilascio obbligatorio (sicurezza, compatibilità) arriva sempre a tutti. Le installazioni interne ricevono gli aggiornamenti anche senza
        pagare. I termini del servizio (punti 3 e 5) descrivono già tutte e due le regole.
      </p>
      <div className="azioni">
        <button type="button" className="btn small" disabled={!cambiate || inCorso} onClick={salva}>
          {inCorso ? 'Salvo…' : 'Salva le regole'}
        </button>
      </div>
      {esito && (
        <p className="small" role="status">
          {esito}
        </p>
      )}
    </section>
  )
}

// «RICHIESTE»: tutto quello che aspetta una risposta dell'admin. Le
// attivazioni da autorizzare (col deploy automatico spento, REQ-FLOTTA-011)
// e le richieste di contatto dei titolari (REQ-FLOTTA-017). L'interruttore
// del deploy automatico sta qui perché decide se le attivazioni passano di
// qui o no.
// CHI PUBBLICA UN LOCALE ESISTENTE (REQ-FLOTTA-018). Di norma il suo
// repository (la Tana: il deploy di tana-drink). Affidato alla regia,
// «Aggiorna subito» e i rilasci lo aggiornano come gli altri, sul suo
// progetto; il deploy del suo repository resta possibile. Servono la
// cartella in clienti/ di tana-drink e le chiavi pubbliche della build
// che il progetto non dice da sé: senza, l'app partirebbe senza notifiche
// e senza App Check.
const CHIAVI_BUILD = [
  ['VITE_FIREBASE_VAPID_KEY', 'Chiave VAPID delle notifiche'],
  ['VITE_RECAPTCHA_SITE_KEY', 'Chiave reCAPTCHA di App Check'],
  ['VITE_FIREBASE_MEASUREMENT_ID', 'Id di Analytics (se diverso da quello del progetto)'],
]

function GestioneEsistente({ cliente: c, istanza, onFatto, onErrore }) {
  const [dallaRegia, setDallaRegia] = useState(istanza?.aggiornamenti_dalla_regia === true)
  const [cartella, setCartella] = useState(istanza?.cliente || c.slug)
  const [build, setBuild] = useState(() => Object.fromEntries(CHIAVI_BUILD.map(([k]) => [k, istanza?.build?.[k] || ''])))
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await impostaAggiornamentiEsistente({ slug: c.slug, aggiornamenti_dalla_regia: dallaRegia, cliente: cartella.trim(), build })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="card" onSubmit={invia} aria-label={`Chi pubblica ${c.nome_locale}`}>
      <h4>Chi pubblica {c.nome_locale}</h4>
      <label className="riga">
        <input type="checkbox" checked={dallaRegia} onChange={(e) => setDallaRegia(e.target.checked)} />
        La aggiorna la regia, con «Aggiorna subito» e i rilasci
      </label>
      <p className="muted small">
        Sul progetto {istanza?.progetto || '—'}. La pubblicazione dal suo repository resta possibile, e la licenza resta del suo progetto.
      </p>
      <label>
        Cartella in clienti/ dell’app
        <input value={cartella} onChange={(e) => setCartella(e.target.value)} required />
      </label>
      {CHIAVI_BUILD.map(([chiave, nome]) => (
        <label key={chiave}>
          {nome}
          <input value={build[chiave]} onChange={(e) => setBuild((b) => ({ ...b, [chiave]: e.target.value }))} spellCheck={false} />
        </label>
      ))}
      <div className="azioni">
        <button type="submit" className="btn small" disabled={inCorso}>
          {inCorso ? 'Salvo…' : 'Salva'}
        </button>
      </div>
    </form>
  )
}

function SezioneRichieste({ automatico, onAutomatico, daApprovare, contatti, onAutorizza, onRifiuta, onSegna }) {
  return (
    <>
      <section className="card" aria-label="Attivazioni">
        <h3>Attivazioni</h3>
        <label className="opzione interruttore">
          <input type="checkbox" checked={automatico} onChange={(e) => onAutomatico(e.target.checked)} />
          Deploy automatico
        </label>
        <p className="muted small">
          {automatico
            ? 'Deploy automatico acceso: «Attiva» di un titolare parte da solo.'
            : 'Deploy automatico spento: le richieste aspettano la tua autorizzazione qui sotto.'}
        </p>
        {daApprovare.length === 0 && <p className="muted small">Nessuna attivazione da autorizzare.</p>}
      </section>

      {daApprovare.length > 0 && (
        <section className="card" aria-label="Richieste da autorizzare">
          <h3>Richieste da autorizzare</h3>
          {daApprovare.map(({ cliente: c, richiesta }) => (
            <div className="row-tra riga-richiesta" key={c.uid}>
              <span>
                <strong>{c.nome_locale}</strong> <span className="muted small">{c.slug} · {c.email}</span>
                <div className="muted small">
                  piano {PIANI[richiesta?.piano]?.nome || richiesta?.piano || '—'} · chiesta il{' '}
                  {richiesta?.chiesta_il ? new Date(richiesta.chiesta_il).toLocaleString('it-IT') : '—'}
                </div>
              </span>
              <span className="azioni-riga">
                <button type="button" className="btn small" onClick={() => onAutorizza(c)}>
                  Autorizza
                </button>
                <button type="button" className="btn ghost small" onClick={() => onRifiuta(c)}>
                  Rifiuta
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {contatti.length > 0 ? <Contatti elenco={contatti} onSegna={onSegna} /> : <p className="muted small">Nessuna richiesta di contatto.</p>}
    </>
  )
}

// GLI AGGIORNAMENTI FALLITI, in «Rilasci»: il contatore della voce li
// conta, e qui si vedono tutti insieme senza cercarli fra le schede.
function AggiornamentiFalliti({ righe, az }) {
  const falliti = righe.filter(aggiornamentoFallito)
  if (!falliti.length) return null
  return (
    <section className="card" aria-label="Aggiornamenti falliti">
      <h3>Aggiornamenti falliti</h3>
      <p className="muted small">Il locale resta attivo. Si riprova, o lo si riporta alla versione di prima.</p>
      <ul className="contatti">
        {falliti.map(({ cliente: c, istanza }) => (
          <li key={c.uid}>
            <span>
              <strong>{c.nome_locale}</strong> <span className="muted small">{c.slug}</span>
            </span>
            <span className="errore small">{aggiornamentoDetto(istanza.aggiornamento)}</span>
            <span className="gruppo-azioni">
              <AzioniAggiornamento cliente={c} istanza={istanza} az={az} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// UN LOCALE CREATO DALL'ADMIN (REQ-FLOTTA-011): nome, email del titolare,
// piano, moduli, terminali, e se attivarlo subito. Il titolare entra con
// «Password dimenticata»; i consensi si raccolgono a parte.
function NuovoLocale({ onFatto, onErrore }) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [piano, setPiano] = useState('base')
  const [moduli, setModuli] = useState([])
  const [terminali, setTerminali] = useState(1)
  const [attivaSubito, setAttivaSubito] = useState(true)
  const [inCorso, setInCorso] = useState(false)
  const inclusi = new Set(PIANI[piano].include)

  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await creaClienteDaAdmin({ nome_locale: nome, email, piano, moduli, terminali, attiva_subito: attivaSubito })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="card" onSubmit={invia} aria-label="Nuovo locale">
      <h3>Nuovo locale</h3>
      <div className="grid-2">
        <div className="campo">
          <label htmlFor="nl-nome">Nome del locale</label>
          <input id="nl-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="nl-email">Email del titolare</label>
          <input id="nl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="nl-piano">Piano</label>
        <select id="nl-piano" value={piano} onChange={(e) => setPiano(e.target.value)}>
          {Object.values(PIANI).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} · {euro(p.prezzo)} / mese
            </option>
          ))}
        </select>
      </div>
      {MODULI.map((m) => (
        <label key={m.id} className="opzione">
          <input
            type="checkbox"
            checked={inclusi.has(m.id) || moduli.includes(m.id)}
            disabled={inclusi.has(m.id)}
            onChange={(e) => setModuli((v) => (e.target.checked ? [...new Set([...v, m.id])] : v.filter((id) => id !== m.id)))}
          />
          {m.nome}
        </label>
      ))}
      <div className="campo">
        <label htmlFor="nl-terminali">Terminali</label>
        <input id="nl-terminali" type="number" min={1} max={10} value={terminali} onChange={(e) => setTerminali(Math.max(1, Number(e.target.value) || 1))} />
      </div>
      <label className="opzione">
        <input type="checkbox" checked={attivaSubito} onChange={(e) => setAttivaSubito(e.target.checked)} />
        Attiva subito (mette la richiesta in coda)
      </label>
      <p className="muted small">
        {euro(prezzoMensile({ piano, moduli, terminali }))} al mese. Il titolare entra dal sito con «Password dimenticata»; i consensi vanno
        raccolti a parte.
      </p>
      <button type="submit" className="btn" disabled={inCorso}>
        {inCorso ? 'Un momento…' : 'Crea il locale'}
      </button>
    </form>
  )
}

// UN LOCALE CHE ESISTE GIÀ (REQ-AI-003): la Tana, o un altro locale che ha
// già il suo progetto Firebase. Entra nella regia senza provisioning, con
// piano completo, segnato interno di partenza: la sospensione automatica
// lo salta e la regia non gli scrive la licenza (functions/lib/esistente.js).
function LocaleEsistente({ onFatto, onErrore }) {
  const [nome, setNome] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [progetto, setProgetto] = useState('')
  const [url, setUrl] = useState('')
  const [interna, setInterna] = useState(true)
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await registraLocaleEsistente({ nome_locale: nome, slug, email, progetto, url, interna })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="card" onSubmit={invia} aria-label="Locale esistente">
      <h3>Locale esistente</h3>
      <p className="muted small">
        Per un locale che ha già la sua app e il suo progetto, come la Tana: non parte nessuna attivazione e la regia non tocca il suo
        progetto. Serve a dargli il credito AI e a vederlo qui.
      </p>
      <div className="grid-2">
        <div className="campo">
          <label htmlFor="le-nome">Nome del locale</label>
          <input id="le-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="le-slug">Identificativo</label>
          <input id="le-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="dal nome, se vuoto" />
        </div>
        <div className="campo">
          <label htmlFor="le-email">Email del titolare</label>
          <input id="le-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="le-progetto">Progetto Firebase</label>
          <input id="le-progetto" value={progetto} onChange={(e) => setProgetto(e.target.value)} placeholder="tana-drink" required />
        </div>
        <div className="campo">
          <label htmlFor="le-url">Indirizzo dell’app</label>
          <input id="le-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" required />
        </div>
      </div>
      <label className="opzione">
        <input type="checkbox" checked={interna} onChange={(e) => setInterna(e.target.checked)} />
        Installazione interna (non si sospende per pagamenti, il credito AI lo ricarichiamo noi)
      </label>
      <button type="submit" className="btn" disabled={inCorso}>
        {inCorso ? 'Un momento…' : 'Registra il locale'}
      </button>
    </form>
  )
}

// Lo stato in due parole e il suo colore, per l'admin: le frasi lunghe di
// statoDetto sono quelle per il titolare.
const STATO_BREVE = {
  [STATI.DA_ATTIVARE]: 'Da attivare',
  [STATI.DA_APPROVARE]: 'Da autorizzare',
  [STATI.IN_CODA]: 'In coda',
  [STATI.IN_CORSO]: 'In corso',
  [STATI.ATTIVA]: 'Attiva',
  [STATI.ERRORE]: 'Errore',
  [STATI.ELIMINATA]: 'Eliminata',
}
const TONO = {
  [STATI.ATTIVA]: 'ok',
  [STATI.ERRORE]: 'errore',
  [STATI.IN_CODA]: 'attesa',
  [STATI.IN_CORSO]: 'attesa',
  [STATI.DA_APPROVARE]: 'avviso',
}

// LA VENDITA (REQ-FLOTTA-015, l'utente, 30/10/2026: «voglio poterlo
// attivare e disattivare per la vendita come admin»). Il Free e ogni modulo
// si mettono in vendita o si tolgono con un clic, senza deploy; chi li ha
// già continua a usarli. Ogni cambio resta nello storico.
function Vendita({ onErrore }) {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  const cambia = (cambio) => impostaVendita(cambio).catch((e) => onErrore(e.message))
  return (
    <section className="card vendita" aria-label="Vendita">
      <h3>Vendita</h3>
      <label className="opzione interruttore">
        <input type="checkbox" checked={vendita.pagamenti_online} onChange={(e) => cambia({ pagamenti_online: e.target.checked })} />
        Pagamenti online con Stripe
      </label>
      <p className="muted small">
        {vendita.pagamenti_online
          ? 'Chi sceglie un piano a pagamento va al Checkout di Stripe, e la ricarica AI si paga online.'
          : 'Niente Checkout: chi sceglie un piano a pagamento ci lascia un recapito (nella sezione «Richieste»). Si concorda il pagamento e si attiva il piano con «Cambia piano», fuori da Stripe.'}
      </p>
      <label className="opzione interruttore">
        <input type="checkbox" checked={vendita.free} onChange={(e) => cambia({ free: e.target.checked })} />
        Piano Free in vendita
      </label>
      <p className="muted small">
        {vendita.free
          ? 'Il Free compare nei prezzi e chi si registra lo può attivare.'
          : 'Il Free non compare e non si attiva; i locali Free che ci sono continuano a lavorare. Tienilo spento finché l’app non fa rispettare i suoi limiti.'}
      </p>
      <h4>Moduli in vendita e in prova</h4>
      <div className="vendita-moduli">
        {MODULI.map((m) => (
          <div key={m.id} className="vendita-modulo">
            <label className="opzione">
              <input type="checkbox" checked={vendita.moduli[m.id]} onChange={(e) => cambia({ moduli: { [m.id]: e.target.checked } })} />
              {m.nome}
            </label>
            <GiorniDiProva nome={m.nome} giorni={vendita.prove[m.id]} onCambio={(g) => cambia({ prove: { [m.id]: g } })} />
          </div>
        ))}
      </div>
      <p className="muted small">
        Un modulo tolto dalla vendita non si compra più; chi lo ha lo tiene. I giorni di prova: 0 vuol dire che il modulo non si
        prova; il titolare lo prova una volta sola, dalla sua dashboard (REQ-FLOTTA-016).
      </p>
    </section>
  )
}

// LE RICHIESTE DI CONTATTO (REQ-FLOTTA-017): coi pagamenti online spenti
// il titolare sceglie il piano e lascia un recapito. L'admin lo contatta,
// concorda il pagamento, attiva il piano con «Cambia piano» fuori da Stripe
// sulla scheda del locale, e segna la richiesta gestita. L'elenco lo legge
// il Backoffice, che lo conta per il sotto-menù, e lo rilegge dopo ogni
// richiesta segnata.
function Contatti({ elenco, onSegna: segna }) {
  const aperte = elenco.filter((c) => c.stato === 'aperta')
  return (
    <section className="card" aria-label="Richieste di contatto">
      <h3>Richieste di contatto {aperte.length > 0 && <span className="muted small">· {aperte.length} da gestire</span>}</h3>
      <ul className="contatti">
        {elenco.map((c) => (
          <li key={c.uid} className={c.stato === 'aperta' ? 'aperta' : 'gestita'}>
            <strong>{c.nome_locale || c.email}</strong> · {PIANI[c.scelta?.piano]?.nome || c.scelta?.piano}
            {c.scelta?.moduli?.length > 0 && ` + ${c.scelta.moduli.map((id) => MODULI.find((m) => m.id === id)?.nome || id).join(', ')}`}
            {c.scelta?.terminali > 1 && ` · ${c.scelta.terminali} terminali`} · {euro(prezzoMensile(c.scelta || {}))} / mese
            <div className="muted small">
              <a href={`mailto:${c.email}`}>{c.email}</a>
              {c.telefono && (
                <>
                  {' · '}
                  <a href={`tel:${c.telefono.replace(/[^+0-9]/g, '')}`}>{c.telefono}</a>
                </>
              )}
              {' · '}chiesta il {new Date(c.chiesta_il).toLocaleDateString('it-IT')}
              {c.stato === 'gestita' && c.gestita_il && ` · gestita il ${new Date(c.gestita_il).toLocaleDateString('it-IT')}`}
            </div>
            {c.nota && <div className="small">«{c.nota}»</div>}
            <button type="button" className="btn ghost small" onClick={() => segna(c, c.stato === 'aperta' ? 'gestita' : 'aperta')}>
              {c.stato === 'aperta' ? 'Segna gestita' : 'Riapri'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Quanti giorni si prova un modulo: si scrive quando si esce dal campo, non
// a ogni tasto (ogni cambio della vendita finisce nello storico).
function GiorniDiProva({ nome, giorni, onCambio }) {
  const [valore, setValore] = useState(String(giorni))
  useEffect(() => setValore(String(giorni)), [giorni])
  const salva = () => {
    const n = Math.max(0, Math.min(90, Math.floor(Number(valore) || 0)))
    setValore(String(n))
    if (n !== giorni) onCambio(n)
  }
  return (
    <label className="giorni-prova">
      prova
      <input
        type="number"
        min={0}
        max={90}
        aria-label={`Giorni di prova di ${nome}`}
        value={valore}
        onChange={(e) => setValore(e.target.value)}
        onBlur={salva}
        onKeyDown={(e) => e.key === 'Enter' && salva()}
      />
      giorni
    </label>
  )
}

// «CAMBIA PIANO» DELL'ADMIN (REQ-FLOTTA-016), al posto di «Piano a mano»:
// piano, moduli, terminali, e come si paga. Con Stripe l'abbonamento si
// aggiorna con l'addebito proporzionale; fuori da Stripe (bonifico,
// omaggio) si scrive direttamente. Il server rifiuta «fuori da Stripe» se
// Stripe sta ancora addebitando.
function CambiaPiano({ cliente, onFatto, onErrore }) {
  const conStripe = Boolean(cliente.abbonamento?.stripe_subscription) && cliente.abbonamento?.stato !== 'disdetto'
  const [piano, setPiano] = useState(cliente.piano || 'base')
  const [moduli, setModuli] = useState(cliente.moduli || [])
  const [terminali, setTerminali] = useState(cliente.terminali || 1)
  const [modo, setModo] = useState(conStripe ? 'stripe' : 'fuori')
  const [inCorso, setInCorso] = useState(false)
  const p = PIANI[piano]
  const inclusi = new Set(p.include)
  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await cambiaPianoAdmin({ slug: cliente.slug, piano, moduli: p.gratuito ? [] : moduli, terminali: p.gratuito ? 1 : terminali, modo })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <form className="cambia-piano" onSubmit={invia} aria-label={`Cambia piano di ${cliente.nome_locale}`}>
      <strong>Cambia piano di {cliente.nome_locale}</strong>
      <label htmlFor={`cp-piano-${cliente.slug}`}>Piano</label>
      <select id={`cp-piano-${cliente.slug}`} value={piano} onChange={(e) => setPiano(e.target.value)}>
        {Object.values(PIANI).map((x) => (
          <option key={x.id} value={x.id}>
            {x.nome} · {euro(x.prezzo)} / mese
          </option>
        ))}
      </select>
      {!p.gratuito && (
        <>
          <div className="vendita-moduli">
            {MODULI.map((m) => (
              <label key={m.id} className="opzione">
                <input
                  type="checkbox"
                  checked={inclusi.has(m.id) || moduli.includes(m.id)}
                  disabled={inclusi.has(m.id)}
                  onChange={(e) => setModuli((v) => (e.target.checked ? [...new Set([...v, m.id])] : v.filter((id) => id !== m.id)))}
                />
                {m.nome}
              </label>
            ))}
          </div>
          <label htmlFor={`cp-term-${cliente.slug}`}>Terminali</label>
          <input id={`cp-term-${cliente.slug}`} type="number" min={1} max={10} value={terminali} onChange={(e) => setTerminali(Math.max(1, Number(e.target.value) || 1))} />
        </>
      )}
      <p className="small">
        Nuovo prezzo: <strong>{euro(prezzoMensile({ piano, moduli: p.gratuito ? [] : moduli, terminali: p.gratuito ? 1 : terminali }))}</strong> / mese
      </p>
      <label className="opzione">
        <input type="radio" name={`modo-${cliente.slug}`} checked={modo === 'stripe'} disabled={!conStripe} onChange={() => setModo('stripe')} />
        Con Stripe (addebito proporzionale){!conStripe && ' — il cliente non ha un abbonamento Stripe'}
      </label>
      <label className="opzione">
        <input type="radio" name={`modo-${cliente.slug}`} checked={modo === 'fuori'} onChange={() => setModo('fuori')} />
        Fuori da Stripe (bonifico, omaggio)
      </label>
      <div className="azioni">
        <button type="submit" className="btn small" disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Cambia piano'}
        </button>
      </div>
    </form>
  )
}

// A che punto è l'eliminazione di un locale (REQ-FLOTTA-014), in una riga.
const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT')
function eliminazioneDetta(istanza) {
  const e = istanza?.eliminazione
  if (!e || e.stato === 'annullata') return null
  const chi = e.richiedente === 'titolare' ? ' (chiesta dal titolare)' : ''
  if (e.stato === 'programmata') return `Programmata per il ${giorno(e.quando)}${chi}`
  if (e.stato === 'in coda' || e.stato === 'in corso') return 'Backup ed eliminazione in corso'
  if (e.stato === 'fallita') return `Non riuscita: ${e.errore || 'vedi il workflow'}. Il progetto c’è ancora.`
  if (e.stato === 'eliminata') return `Eliminata il ${giorno(e.finito_il)} · archivio fino al ${giorno(e.scade_il)}, lo scarica solo il titolare`
  return null
}

// IL MODULO «ELIMINA» (REQ-FLOTTA-014, l'utente, 29/10/2026): solo l'admin
// può scegliere «subito»; in tutti e due i casi il workflow fa prima il
// backup e lo verifica. Per confermare si scrive il nome dell'app.
function EliminaLocale({ cliente, istanza, onFatto, onErrore }) {
  const [subito, setSubito] = useState(false)
  const [conferma, setConferma] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const progetto = istanza?.progetto || progettoDi(cliente.slug)
  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await gestisciEliminazione('chiedi', { slug: cliente.slug, conferma, subito })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <form className="elimina-form" onSubmit={invia} aria-label={`Elimina ${cliente.nome_locale}`}>
      <strong>Eliminare {cliente.nome_locale} e il suo progetto?</strong>
      <p className="muted small">
        Prima si fa il backup completo (database, file, utenti) e si verifica; senza backup verificato il progetto non si tocca.
        L’archivio resta 180 giorni e lo scarica solo il titolare.
      </p>
      <label className="opzione">
        <input type="radio" name={`quando-${cliente.slug}`} checked={!subito} onChange={() => setSubito(false)} />
        Fra 30 giorni dalla chiusura
      </label>
      <label className="opzione">
        <input type="radio" name={`quando-${cliente.slug}`} checked={subito} onChange={() => setSubito(true)} />
        Subito, appena il backup è verificato
      </label>
      <label htmlFor={`conferma-${cliente.slug}`}>
        Per confermare scrivi <code>{progetto}</code>
      </label>
      <input id={`conferma-${cliente.slug}`} value={conferma} onChange={(e) => setConferma(e.target.value)} autoComplete="off" />
      <div className="azioni">
        <button type="submit" className="btn pericolo small" disabled={inCorso || conferma.trim() !== progetto}>
          {subito ? 'Backup ed elimina subito' : 'Programma l’eliminazione'}
        </button>
      </div>
    </form>
  )
}

// In cima quello che chiede attenzione.
const PESI = { [STATI.ERRORE]: 0, [STATI.DA_APPROVARE]: 1, [STATI.IN_CODA]: 2, [STATI.IN_CORSO]: 3, [STATI.DA_ATTIVARE]: 4, [STATI.ATTIVA]: 5, [STATI.ELIMINATA]: 8 }
const peso = (s) => PESI[s] ?? 9
