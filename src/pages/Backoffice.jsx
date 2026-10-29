import { useEffect, useState } from 'react'
import {
  elencoClienti,
  elencoIstanze,
  elencoRichieste,
  segnaPiano,
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
} from '../lib/db.js'
import { statoIstanza, statoDetto, STATI, progettoDi } from '../lib/istanze.js'
import { PIANI, MODULI, prezzoMensile, euro } from '../lib/piani.js'
import { contattoDi } from '../lib/clienti.js'
import { statoCredito, euroCent } from '../lib/ai.js'
import { GRUPPI, TAG, aggiornamentoDetto } from '../lib/rilasci.js'
import Rilasci from './Rilasci.jsx'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato
// dell'istanza, progetto, versione; le richieste in coda o in errore in
// cima. Solo col claim admin (App.jsx non ci fa arrivare gli altri, e le
// regole Firestore non gli darebbero comunque i dati).
//
// E GOVERNA I DEPLOY (REQ-FLOTTA-011): l'interruttore del deploy automatico,
// le richieste da autorizzare quando è spento, un locale creato da qui.
export default function Backoffice() {
  const [righe, setRighe] = useState(undefined)
  const [errore, setErrore] = useState(null)
  const [impostazioni, setImpostazioni] = useState({})
  const [nuovo, setNuovo] = useState(false)
  const [esistente, setEsistente] = useState(false)
  // La chiave AI appena creata: si vede una volta sola, qui (REQ-AI-003).
  const [chiaveNuova, setChiaveNuova] = useState(null)
  const [rilasci, setRilasci] = useState([])
  // Lo slug del locale col modulo «Elimina» aperto (REQ-FLOTTA-014).
  const [elimina, setElimina] = useState(null)

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
  useEffect(() => {
    carica()
  }, [])
  useEffect(() => osservaImpostazioniRegia(setImpostazioni), [])

  const automatico = impostazioni.deploy_automatico !== false

  const pianoAMano = async (c) => {
    const piano = window.prompt('Piano (base | completo):', c.piano || 'base')
    if (!piano || !PIANI[piano]) return
    await segnaPiano(c.uid, { piano, moduli: c.moduli || [], terminali: c.terminali || 1 })
    carica()
  }

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
  // arriva a ondate (REQ-FLOTTA-012), dal riquadro «Rilasci»: un errore
  // si vede sulle istanze di prova, non su tutti insieme.
  const aggiorna = async (c) => {
    try {
      await aggiornaIstanza(c.slug)
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

  return (
    <main className="pagina larga">
      <div className="row-tra">
        <h2>Backoffice</h2>
        <div className="azioni">
          <label className="opzione interruttore">
            <input
              type="checkbox"
              checked={automatico}
              onChange={(e) => impostaDeployAutomatico(e.target.checked).catch((err) => setErrore(err.message))}
            />
            Deploy automatico
          </label>
          <button type="button" className="btn ghost small" onClick={() => setNuovo((v) => !v)}>
            {nuovo ? 'Chiudi' : 'Nuovo locale'}
          </button>
          <button type="button" className="btn ghost small" onClick={() => setEsistente((v) => !v)}>
            {esistente ? 'Chiudi' : 'Locale esistente'}
          </button>
        </div>
      </div>
      <p className="muted small">
        {automatico
          ? 'Deploy automatico acceso: «Attiva» di un titolare parte da solo.'
          : 'Deploy automatico spento: le richieste aspettano la tua autorizzazione qui sotto.'}
      </p>
      {errore && <p className="errore">{errore}</p>}

      {nuovo && (
        <NuovoLocale
          onFatto={() => {
            setNuovo(false)
            carica()
          }}
          onErrore={setErrore}
        />
      )}

      {esistente && (
        <LocaleEsistente
          onFatto={() => {
            setEsistente(false)
            carica()
          }}
          onErrore={setErrore}
        />
      )}

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

      <Rilasci rilasci={rilasci} onAzione={azioneRilascio} />

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
                <button type="button" className="btn small" onClick={() => autorizza(c)}>
                  Autorizza
                </button>
                <button type="button" className="btn ghost small" onClick={() => rifiuta(c)}>
                  Rifiuta
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {righe.length === 0 ? (
        <p className="muted">Nessun cliente.</p>
      ) : (
        <ul className="locali" aria-label="Locali">
          {righe.map(({ cliente: c, istanza, stato, cassetto }) => {
            const credito = statoCredito(cassetto)
            // Un locale registrato come esistente (la Tana) non passa per
            // la flotta: da qui niente Aggiorna, Sospendi, Chiudi.
            const daFlotta = istanza?.origine !== 'esistente'
            const licenza = istanza?.licenza_stato || 'attiva'
            const tono = licenza !== 'attiva' ? 'avviso' : TONO[stato] || 'neutro'
            const aiVisibile = credito || stato === STATI.ATTIVA
            return (
              <li key={c.uid}>
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
                          <div className={istanza.aggiornamento.stato === 'fallito' ? 'errore small' : 'muted small'}>
                            {aggiornamentoDetto(istanza.aggiornamento)}
                          </div>
                        )}
                      </dd>
                    </div>
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
                            onChange={(e) => azioneRilascio('gruppo', { slug: c.slug, gruppo: e.target.value })}
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
                        <button type="button" className="btn small" onClick={() => rilanciaAttivazione(c.slug).then(carica)}>
                          Rilancia
                        </button>
                      )}
                      {daFlotta && stato === STATI.ATTIVA && (
                        <button type="button" className="btn ghost small" onClick={() => aggiorna(c)}>
                          Aggiorna
                        </button>
                      )}
                      {daFlotta && istanza?.aggiornamento?.stato === 'fallito' && (
                        <>
                          <button type="button" className="btn ghost small" onClick={() => riprova(c, istanza.aggiornamento)}>
                            Riprova
                          </button>
                          {TAG.test(istanza.aggiornamento.versione_precedente || '') && (
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => {
                                if (window.confirm(`Riportare ${c.nome_locale} a ${istanza.aggiornamento.versione_precedente}?`)) azioneRilascio('indietro', { slug: c.slug })
                              }}
                            >
                              Torna a {istanza.aggiornamento.versione_precedente}
                            </button>
                          )}
                        </>
                      )}
                      <button type="button" className="btn ghost small" onClick={() => pianoAMano(c)}>
                        Piano a mano
                      </button>
                    </div>

                    {aiVisibile && (
                      <div className="gruppo-azioni" aria-label="Credito AI">
                        <span className="gruppo-nome muted small">AI</span>
                        <button type="button" className="btn ghost small" onClick={() => ricaricaAI(c)}>
                          Ricarica AI
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => tettoAI(c, credito?.tetto)}>
                          Tetto AI
                        </button>
                        <button type="button" className="btn ghost small" onClick={() => chiaveAI(c, cassetto)}>
                          Chiave AI
                        </button>
                        {credito && (
                          <button type="button" className="btn ghost small" onClick={() => azioneAI(c, credito.attivo ? 'spegni' : 'accendi')}>
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
                            <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'sospesa')}>
                              Sospendi
                            </button>
                            <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'chiusa')}>
                              Chiudi
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'attiva')}>
                              Riattiva
                            </button>
                            {licenza === 'chiusa' && !['programmata', 'in coda', 'in corso'].includes(istanza?.eliminazione?.stato) && (
                              <button type="button" className="btn ghost small" onClick={() => setElimina(elimina === c.slug ? null : c.slug)}>
                                Elimina…
                              </button>
                            )}
                            {istanza?.eliminazione?.stato === 'programmata' && (
                              <button type="button" className="btn ghost small" onClick={() => annullaEliminazione(c)}>
                                Annulla eliminazione
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </footer>
                  {elimina === c.slug && (
                    <EliminaLocale
                      cliente={c}
                      istanza={istanza}
                      onFatto={() => {
                        setElimina(null)
                        carica()
                      }}
                      onErrore={setErrore}
                    />
                  )}
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </main>
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
