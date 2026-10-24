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
} from '../lib/db.js'
import { statoIstanza, statoDetto, STATI, progettoDi } from '../lib/istanze.js'
import { PIANI, MODULI, prezzoMensile, euro } from '../lib/piani.js'
import { contattoDi } from '../lib/clienti.js'
import { statoCredito, euroCent } from '../lib/ai.js'

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

  const carica = async () => {
    try {
      // I cassetti AI sono un di più: se non si leggono, il resto del
      // backoffice deve lavorare lo stesso.
      const [clienti, istanze, richieste, cassetti] = await Promise.all([
        elencoClienti(),
        elencoIstanze(),
        elencoRichieste(),
        elencoCassettiAI().catch(() => ({})),
      ])
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

  // L'ultima versione dell'app a un locale, o a tutti quelli attivi
  // (REQ-FLOTTA-009): l'app di base è tana-drink, i locali la seguono
  // quando lo si decide.
  const aggiorna = async (c) => {
    try {
      await aggiornaIstanza(c.slug)
    } catch (e) {
      setErrore(e.message)
    }
  }
  const aggiornaTutte = async () => {
    // I locali esistenti (la Tana) si aggiornano dal loro repository.
    const attive = righe.filter((r) => r.stato === STATI.ATTIVA && r.istanza?.origine !== 'esistente')
    if (!window.confirm(`Portare l’ultima versione a ${attive.length} locali attivi?`)) return
    for (const r of attive) await aggiorna(r.cliente)
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
    <main className="pagina">
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
          {righe.some((r) => r.stato === STATI.ATTIVA) && (
            <button type="button" className="btn ghost small" onClick={aggiornaTutte}>
              Aggiorna tutte le istanze attive
            </button>
          )}
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
        <table className="clienti">
          <thead>
            <tr>
              <th>Locale</th>
              <th>Email</th>
              <th>Piano</th>
              <th>Istanza</th>
              <th>Progetto</th>
              <th>Versione</th>
              <th>Credito AI</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {righe.map(({ cliente: c, istanza, stato, cassetto }) => {
              const credito = statoCredito(cassetto)
              // Un locale registrato come esistente (la Tana) non passa per
              // la flotta: da qui niente Aggiorna, Sospendi, Chiudi.
              const daFlotta = istanza?.origine !== 'esistente'
              return (
              <tr key={c.uid} className={stato === STATI.ERRORE ? 'errore-riga' : ''}>
                <td>
                  <strong>{c.nome_locale}</strong>
                  <div className="muted small">
                    {c.slug}
                    {istanza?.interna && ' · interna'}
                    {!daFlotta && ' · esistente'}
                  </div>
                </td>
                <td>
                  {c.email}
                  {c.fatturazione?.ragione_sociale && (
                    <div className="muted small">
                      {c.fatturazione.ragione_sociale} · P.IVA {c.fatturazione.partita_iva}
                    </div>
                  )}
                  {contattoDi(c) && <div className="muted small">{contattoDi(c)}</div>}
                </td>
                <td>{c.piano ? `${PIANI[c.piano]?.nome || c.piano} · ${euro(prezzoMensile(c))}` : <span className="muted">—</span>}</td>
                <td>
                  {statoDetto(stato)}
                  {istanza?.licenza_stato && istanza.licenza_stato !== 'attiva' && (
                    <div className="errore small">
                      {istanza.licenza_stato}
                      {istanza.licenza_motivo ? ` · ${istanza.licenza_motivo}` : ''}
                    </div>
                  )}
                </td>
                <td>
                  <code>{istanza?.progetto || progettoDi(c.slug)}</code>
                </td>
                <td>
                  {istanza?.versione || <span className="muted">—</span>}
                  {istanza?.ref && istanza.ref !== 'main' && <div className="muted small">da {istanza.ref}</div>}
                </td>
                <td>
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
                </td>
                <td className="azioni-riga">
                  <button type="button" className="btn ghost small" onClick={() => pianoAMano(c)}>
                    Piano a mano
                  </button>
                  {(credito || stato === STATI.ATTIVA) && (
                    <>
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
                    </>
                  )}
                  {stato === STATI.ERRORE && (
                    <button type="button" className="btn ghost small" onClick={() => rilanciaAttivazione(c.slug).then(carica)}>
                      Rilancia
                    </button>
                  )}
                  {daFlotta && stato === STATI.ATTIVA && (
                    <button type="button" className="btn ghost small" onClick={() => aggiorna(c)}>
                      Aggiorna
                    </button>
                  )}
                  {daFlotta && stato === STATI.ATTIVA && (istanza?.licenza_stato || 'attiva') === 'attiva' && (
                    <>
                      <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'sospesa')}>
                        Sospendi
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'chiusa')}>
                        Chiudi
                      </button>
                    </>
                  )}
                  {daFlotta && stato === STATI.ATTIVA && istanza?.licenza_stato && istanza.licenza_stato !== 'attiva' && (
                    <button type="button" className="btn ghost small" onClick={() => cambiaStato(c, 'attiva')}>
                      Riattiva
                    </button>
                  )}
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
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

// In cima quello che chiede attenzione.
const PESI = { [STATI.ERRORE]: 0, [STATI.DA_APPROVARE]: 1, [STATI.IN_CODA]: 2, [STATI.IN_CORSO]: 3, [STATI.DA_ATTIVARE]: 4, [STATI.ATTIVA]: 5 }
const peso = (s) => PESI[s] ?? 9
