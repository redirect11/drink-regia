import { Fragment, useCallback, useEffect, useState } from 'react'
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
  impostaAttivazioneSimulata,
  autorizzaRichiesta,
  autorizzaProfiloCompleto,
  rifiutaRichiesta,
  creaClienteDaAdmin,
  elencoCassettiAI,
  gestisciCassettoAI,
  impostaModelliAI,
  registraLocaleEsistente,
  elencoRilasci,
  gestisciRilascio,
  gestisciEliminazione,
  eliminaCliente,
  osservaVendita,
  impostaVendita,
  elencoContatti,
  segnaContatto,
  impostaAggiornamentiEsistente,
  osservaRegoleAggiornamenti,
  impostaRegoleAggiornamenti,
  osservaControlloLicenze,
  gestisciLicenze,
  registraPagamento,
  elencoSconti,
  gestisciSconti,
  applicaSconto,
  programmaScadenze,
  allineaEmail,
  impostaTemi,
  temiDelLocale,
  elencoTemiSuMisura,
  gestisciTemiSuMisura,
} from '../lib/db.js'
import { venditaPulita } from '../lib/vendita.js'
import { stampantiDette } from '../lib/stampanti.js'

import { ESCLUSIVI, nomeStile, nomeImpaginazione, ORIGINI_DETTE, STATI_DETTI, temaVuoto } from '../lib/temi.js'
import { statoIstanza, statoDetto, STATI, progettoDi, riduzioneDetta, hrefSicuro, istanzaScollegata } from '../lib/istanze.js'
import { PIANI, MODULI, prezzoMensile, euro, baseMancante, senzaOrfani } from '../lib/piani.js'
import { prezzoConSconto, scontoDetto, usiDetti, CODICE_VALIDO, REGOLA_CODICE, LIMITE_PER_IL_CENTO, generaCodice } from '../lib/sconti.js'
import CatalogoTemi, { EditorTema } from './CatalogoTemi.jsx'
import { contattoDi } from '../lib/clienti.js'
import { statoCredito, euroCent, aiNelPiano, MODELLI_AI, TIPI_MODELLO_DETTI, modelloScelto } from '../lib/ai.js'
import { GRUPPI, TAG, aggiornamentoDetto, runNellErrore } from '../lib/rilasci.js'
import { BASE, SEZIONI, VISTE, aggiornamentoFallito, aggiornaLaRegia, contiDelBackoffice, filtraLocali, profiloDaAutorizzare } from '../lib/backoffice.js'
import Rilasci from './Rilasci.jsx'
import Commerciale from './Commerciale.jsx'
import CollegaIstanza from './CollegaIstanza.jsx'
import { OrariNelBackoffice } from './OrariServizio.jsx'
import { MODALITA, regolaDetta, propostaDetta } from '../lib/aggiornamenti.js'

// Il sito di produzione: lo dice il deploy (deploy.yml), come in App.jsx.
const PRODUZIONE = import.meta.env.VITE_APP_ENV === 'production'

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
  const [rilasci, setRilasci] = useState([])
  // Le richieste di contatto (REQ-FLOTTA-017): lette qui e non nella loro
  // sezione, perché il contatore di «Richieste» le conta da ogni sezione.
  const [contatti, setContatti] = useState([])
  // Lo slug -> il ref che «Aggiorna subito» ha lanciato, per dirlo sulla scheda.
  const [lanciati, setLanciati] = useState({})
  // Gli slug per cui la Function sta ancora lanciando il workflow.
  const [inAvvio, setInAvvio] = useState({})
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
      // Una lettura fallita non è un elenco vuoto (REQ-FLOTTA-064): prima
      // qui si mettevano zero righe, e la pagina diceva «Nessun cliente.».
      // Alla prima lettura l'elenco resta «non letto» (null), e la pagina
      // lo dice con «Riprova»; a pagina già caricata resta quello di prima.
      setErrore(e.message)
      setRighe((prima) => prima ?? null)
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
  // Finché un aggiornamento è in corso la pagina si ricarica da sola ogni
  // venti secondi: il workflow dura otto-dieci minuti e la scheda deve
  // muoversi, senza che l'admin ricarichi a mano (09/11/2026).
  const aggiornamentiInCorso = (righe || []).some((r) => r.istanza?.aggiornamento?.stato === 'in corso')
  useEffect(() => {
    if (!aggiornamentiInCorso) return undefined
    const giro = setInterval(carica, 20000)
    return () => clearInterval(giro)
  }, [aggiornamentiInCorso])
  useEffect(() => {
    caricaContatti()
  }, [caricaContatti])
  useEffect(() => osservaImpostazioniRegia(setImpostazioni), [])
  // Un errore riguarda la sezione in cui è nato: cambiando sezione si toglie.
  useEffect(() => setErrore(null), [pathname])

  // Spento finché l'admin non lo accende (02/11/2026): ogni deploy dopo un
  // acquisto passa da qui.
  const automatico = impostazioni.deploy_automatico === true
  // L'attivazione simulata (REQ-FLOTTA-072): l'interruttore c'è solo sul test.
  const simulata = impostazioni.attivazione_simulata === true

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

  // Un cliente senza istanza, o con l'istanza già eliminata, sparisce con
  // l'account (REQ-FLOTTA-059): diritto alla cancellazione, e i clienti di
  // collaudo dei rilasci. Non si torna indietro: si conferma.
  const eliminaClienteDaAdmin = async (c) => {
    if (!window.confirm(`Eliminare il cliente ${c.nome_locale} (${c.email})? Via l’account e i suoi dati nella regia. Non si torna indietro.`)) return
    try {
      await eliminaCliente(c.slug)
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
  // Mentre la Function lancia il workflow (qualche secondo) il bottone lo
  // dice e non si ripreme; poi la scheda mostra l'aggiornamento in corso
  // dal documento dell'istanza (l'utente, 09/11/2026: «vorrei almeno un
  // loading, qualcosa che mi faccia capire che sta succedendo qualcosa»).
  const aggiorna = async (c) => {
    setErrore(null)
    setInAvvio((v) => ({ ...v, [c.slug]: true }))
    try {
      const esito = await aggiornaIstanza(c.slug)
      setLanciati((v) => ({ ...v, [c.slug]: esito?.ref || '' }))
    } catch (e) {
      setErrore(e.message)
    } finally {
      setInAvvio((v) => {
        const resto = { ...v }
        delete resto[c.slug]
        return resto
      })
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
  const autorizzaProfilo = async (c) => {
    try {
      await autorizzaProfiloCompleto(c.slug)
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
  // ricarichiamo noi), omaggio, tetto del mese, acceso o spento.
  const azioneAI = async (c, azione, extra = {}) => {
    setErrore(null)
    try {
      await gestisciCassettoAI(c.slug, azione, extra)
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
  // Un omaggio (l'utente, 06/11/2026): credito regalato, senza pagamento,
  // che il titolare vede come tale fra le sue ricariche.
  const regalaAI = (c) => {
    const importo = window.prompt(`Euro da regalare al credito AI di ${c.nome_locale}:`, '5')
    if (importo == null) return
    const nota = window.prompt('Nota per il titolare (facoltativa):', '') || ''
    azioneAI(c, 'omaggio', { importo: Number(String(importo).replace(',', '.')), nota })
  }
  const tettoAI = (c, attuale) => {
    const importo = window.prompt(`Tetto mensile del credito AI di ${c.nome_locale}, in euro:`, String(attuale ?? ''))
    if (importo == null) return
    azioneAI(c, 'tetto', { importo: Number(String(importo).replace(',', '.')) })
  }

  if (righe === undefined) return <main className="pagina muted">Carico…</main>
  if (righe === null)
    return (
      <main className="pagina">
        <p className="errore" role="alert">
          {errore}
        </p>
        <div className="azioni">
          <button
            type="button"
            className="btn"
            onClick={() => {
              // L'errore si toglie qui e non a ogni lettura riuscita: le azioni
              // (rilancia, sospendi…) dicono il loro errore e poi rileggono, e
              // una lettura andata bene non deve cancellarlo.
              setErrore(null)
              setRighe(undefined)
              carica()
            }}
          >
            Riprova
          </button>
        </div>
      </main>
    )

  const daApprovare = righe.filter((r) => r.stato === STATI.DA_APPROVARE)
  const profiliDaAutorizzare = righe.filter(profiloDaAutorizzare)
  // Le azioni di una scheda, le stesse da «Locali» e da «Rilasci».
  // Un bonifico arrivato (REQ-FLOTTA-023): fino a quando è pagato.
  // E quanto è entrato (REQ-FLOTTA-041), IVA esclusa, proposto dal canone:
  // va nel libro dei movimenti; vuoto, si registra solo la data.
  const pagamento = async (c) => {
    const data = window.prompt(`${c.nome_locale}: pagato fino al (AAAA-MM-GG)?`, c.abbonamento?.pagato_fino_al || '')
    if (data == null) return
    const importo = window.prompt(`${c.nome_locale}: importo incassato, IVA esclusa (vuoto per non registrarlo)?`, String(prezzoConSconto(prezzoMensile(c), c)).replace('.', ','))
    if (importo == null) return
    try {
      await registraPagamento(c.slug, data.trim(), importo.trim() ? importo.trim().replace(',', '.') : null)
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  // Un codice sconto al cliente (REQ-FLOTTA-028); vuoto lo toglie.
  const sconto = async (c) => {
    const codice = window.prompt(`${c.nome_locale}: codice sconto (vuoto per toglierlo)?`, c.sconto?.codice || '')
    if (codice == null) return
    try {
      await applicaSconto(c.slug, codice.trim())
    } catch (e) {
      setErrore(e.message)
    }
    carica()
  }
  const az = { carica, cambiaStato, annullaEliminazione, eliminaCliente: eliminaClienteDaAdmin, aggiorna, azioneRilascio, riprova, indietro, azioneAI, ricaricaAI, regalaAI, tettoAI, registraPagamento: pagamento, sconto, onErrore: setErrore }
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

      <div className="bo-sezione">
        <Routes>
          <Route index element={<Navigate to={`${BASE}/locali`} replace />} />
          <Route path="locali" element={<SezioneLocali righe={righe} az={az} lanciati={lanciati} inAvvio={inAvvio} />} />
          {/* La dashboard di chi vende (REQ-FLOTTA-041): legge le righe e i contatti già caricati qui. */}
          <Route path="commerciale" element={<Commerciale righe={righe} contatti={contatti} onErrore={setErrore} />} />
          <Route
            path="richieste"
            element={
              <SezioneRichieste
                automatico={automatico}
                onAutomatico={(acceso) => impostaDeployAutomatico(acceso).catch((err) => setErrore(err.message))}
                simulata={PRODUZIONE ? null : simulata}
                onSimulata={(acceso) => impostaAttivazioneSimulata(acceso).catch((err) => setErrore(err.message))}
                daApprovare={daApprovare}
                profili={profiliDaAutorizzare}
                onAutorizzaProfilo={autorizzaProfilo}
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
                <LicenzeProtette onErrore={setErrore} onFatto={carica} />
                <Scadenze onErrore={setErrore} />
                <AllineaEmail onErrore={setErrore} />
                <RegoleAggiornamenti onErrore={setErrore} onFatto={carica} />
                <Rilasci rilasci={rilasci} onAzione={azioneRilascio} />
                <AggiornamentiFalliti righe={righe} az={az} />
              </>
            }
          />
          <Route
            path="vendita"
            element={
              <>
                <Vendita onErrore={setErrore} />
                <ModelliAI impostazioni={impostazioni} onErrore={setErrore} />
                <CodiciSconto onErrore={setErrore} />
              </>
            }
          />
          <Route path="temi" element={<CatalogoTemi onErrore={setErrore} />} />
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
function SezioneLocali({ righe, az, lanciati, inAvvio = {} }) {
  const [parametri, setParametri] = useSearchParams()
  // Lo slug del locale col modulo «Cambia piano» aperto (REQ-FLOTTA-016).
  const [cambia, setCambia] = useState(null)
  // Lo slug del locale col modulo «Elimina» aperto (REQ-FLOTTA-014).
  const [elimina, setElimina] = useState(null)
  const vista = parametri.get('vista') || 'tutti'
  const cerca = parametri.get('cerca') || ''
  // Il locale aperto sotto la sua riga: nell'indirizzo, così resta aperto
  // dopo un'azione e si può mandare a qualcuno.
  const aperto = parametri.get('locale') || ''
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
        // UNA TABELLA (l'utente, 02/11/2026: «vorrei che la lista delle
        // istanze deployate sia una tabella che cliccando si apre il
        // dettaglio come è ora un elemento della lista»): una riga per
        // locale; il nome apre, sotto, la scheda di sempre.
        <div className="tabella-scorre">
          <table className="tabella-locali" aria-label="Locali">
            <thead>
              <tr>
                <th scope="col">Locale</th>
                <th scope="col">Stato</th>
                <th scope="col">Piano</th>
                <th scope="col" className="col-secondaria">
                  Versione
                </th>
                <th scope="col">Licenza</th>
                <th scope="col" className="col-secondaria">
                  Titolare
                </th>
              </tr>
            </thead>
            <tbody>
              {mostrate.map((r) => {
                const c = r.cliente
                const aperta = aperto === c.slug
                const breve = statoBreve(r)
                return (
                  <Fragment key={c.uid}>
                    <tr className={`riga-locale tono-${breve.tono}${aperta ? ' aperta' : ''}`} onClick={() => filtra('locale', aperta ? '' : c.slug)}>
                      <th scope="row">
                        <button
                          type="button"
                          className="nome-locale"
                          aria-expanded={aperta}
                          onClick={(e) => {
                            e.stopPropagation()
                            filtra('locale', aperta ? '' : c.slug)
                          }}
                        >
                          {c.nome_locale}
                        </button>
                        <div className="muted small">
                          {c.slug}
                          {r.istanza?.interna && ' · interna'}
                          {r.istanza?.origine === 'esistente' && ' · esistente'}
                        </div>
                      </th>
                      <td>
                        <span className={`stato stato-${breve.tono}`}>{breve.testo}</span>
                      </td>
                      <td>{c.piano ? `${PIANI[c.piano]?.nome || c.piano} · ${euro(prezzoConSconto(prezzoMensile(c), c))}` : <span className="muted">—</span>}</td>
                      <td className="col-secondaria">{r.istanza?.versione || r.istanza?.presentazione?.versione || <span className="muted">—</span>}</td>
                      <td className={licenzaBreve(r.istanza).tono === 'errore' ? 'errore small' : 'muted small'}>{licenzaBreve(r.istanza).testo}</td>
                      <td className="col-secondaria muted small">{c.email}</td>
                    </tr>
                    {aperta && (
                      <tr className="riga-dettaglio">
                        <td colSpan={6}>
                          <SchedaLocale
                            riga={r}
                            az={az}
                            lanciato={lanciati[c.slug]}
                            inAvvio={Boolean(inAvvio[c.slug])}
                            cambiaAperto={cambia === c.slug}
                            onCambia={() => setCambia(cambia === c.slug ? null : c.slug)}
                            eliminaAperto={elimina === c.slug}
                            onElimina={() => setElimina(elimina === c.slug ? null : c.slug)}
                            onFatto={chiudi}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
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

// LA SCHEDA DEL LOCALE (REQ-FLOTTA-089). Fino al 13/11/2026 era una griglia
// di dati che andavano a capo come capitava e una fila di tasti in fondo;
// Daniele: «è tutto troppo caotico e formattato male andrebbe fatto
// meglio». Ora: in testa chi è, lo stato, il piano e la versione; sotto,
// quello che chiede di intervenire, ognuno col suo tasto; poi sei blocchi
// sempre nello stesso ordine (Titolare, Piano, App, Aggiornamenti, Aspetto,
// Credito AI), ciascuno coi tasti della cosa che cambia, così l'occhio
// trova le cose sempre allo stesso posto; in fondo, sotto una riga, i gesti
// che fermano o cancellano il locale, lontani da quelli di tutti i giorni
// (tana-drink, DESIGN.md, guardrail 2).
function SchedaLocale({ riga, az, lanciato, inAvvio = false, cambiaAperto, onCambia, eliminaAperto, onElimina, onFatto }) {
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
  const { tono, testo: statoTesto } = statoBreve(riga)
  const attiva = stato === STATI.ATTIVA
  const piano = PIANI[c.piano]
  // Il Free non ha l'AI (REQ-FLOTTA-087; Daniele, 13/11/2026: «I free non
  // hanno l'ai»): niente blocco Credito AI, o si regalerebbe un credito che
  // la regia poi non lascia spendere. La regola è quella della regia.
  const conAI = aiNelPiano(c, istanza)
  const aiVisibile = conAI && (credito || attiva)
  // Un locale pubblicato fuori dalla regia (la Tana, da GitHub) non manda
  // l'esito del deploy: la versione la dice l'app stessa quando si
  // presenta (REQ-FLOTTA-026).
  const versione = istanza?.versione || istanza?.presentazione?.versione
  const agg = istanza?.aggiornamento
  const inCorso = agg?.stato === 'in corso'
  const id = (nome) => `${nome}-${c.slug}`
  // L'account a cui è legata l'app, confrontato con quello del titolare: è
  // solo un'indicazione (collegare l'app al titolare è un lavoro a parte,
  // REQ-FLOTTA-086). Un locale esistente non ha un account legato.
  const account = istanza?.uid ? (istanza.uid === c.uid ? 'collegato' : 'diverso') : null
  const manuale = c.abbonamento?.origine === 'manuale'
  const eliminazione = eliminazioneDetta(istanza)
  const eliminazioneFallita = istanza?.eliminazione?.stato === 'fallita'

  // Gli avvisi: solo quello che chiede all'admin di fare qualcosa, col
  // tasto per farlo quando c'è.
  const avvisi = [
    stato === STATI.ERRORE && (
      <li key="attivazione">
        <span>Attivazione non riuscita{istanza?.errore ? `: ${istanza.errore}` : ''}.</span>
        <button type="button" className="btn small" onClick={() => rilanciaAttivazione(c.slug).then(az.carica)}>
          Rilancia
        </button>
      </li>
    ),
    agg?.stato === 'fallito' && (
      <li key="aggiornamento">
        <span>
          {aggiornamentoDetto(agg)}
          {runNellErrore(agg.errore) && (
            <>
              {' · '}
              <a href={runNellErrore(agg.errore)} target="_blank" rel="noreferrer">
                vedi il run ↗
              </a>
            </>
          )}
        </span>
        {aggiornabile && <AzioniAggiornamento cliente={c} istanza={istanza} az={az} />}
      </li>
    ),
    // BUG-125: con l'app nuova un locale senza licenza protetta si ferma.
    istanza?.licenza_protetta?.ok === false && <li key="licenza">Licenza da allineare: {istanza.licenza_protetta.perche}</li>,
    eliminazioneFallita && <li key="eliminazione">Eliminazione: {eliminazione}</li>,
    manuale && c.abbonamento.stato === 'non pagato' && (
      <li key="pagamento">Piano fuori da Stripe non pagato: si registra un pagamento dal blocco Piano.</li>
    ),
    // L'app legata a un altro account, col tasto per ricollegarla
    // (REQ-FLOTTA-086): solo quando è scollegata.
    // Un cambio degli orari di servizio chiesto dal titolare (REQ-FLOTTA-095).
    c.orari_servizio?.richiesta && <li key="orari">Il titolare chiede di cambiare gli orari di servizio: si decide nel blocco Titolare.</li>,
    istanzaScollegata(c, istanza) && (
      <li key="account">
        <CollegaIstanza cliente={c} istanza={istanza} onFatto={az.carica} />
      </li>
    ),
  ].filter(Boolean)

  // Il fondo: i gesti che fermano o cancellano.
  const eliminaCliente = (!istanza?.progetto || stato === STATI.ELIMINATA) && ![STATI.IN_CODA, STATI.IN_CORSO].includes(stato)
  const gestisciLicenza = daFlotta && attiva
  const conFondo = eliminaCliente || gestisciLicenza || (eliminazione && !eliminazioneFallita) || eliminaAperto

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
        <div className="locale-sintesi">
          <span className={`stato stato-${tono}`}>{statoTesto}</span>
          <span className="muted small">{[piano?.nome || c.piano, versione].filter(Boolean).join(' · ')}</span>
        </div>
      </header>

      {avvisi.length > 0 && (
        <ul className="locale-avvisi" aria-label="Da trattare">
          {avvisi}
        </ul>
      )}

      <div className="locale-blocchi">
        <Blocco id={id('titolare')} titolo="Titolare">
          <div>{c.email}</div>
          {c.fatturazione?.ragione_sociale && (
            <div className="muted small">
              {c.fatturazione.ragione_sociale} · P.IVA {c.fatturazione.partita_iva}
            </div>
          )}
          {contattoDi(c) && <div className="muted small">{contattoDi(c)}</div>}
          {stampantiDette(c.stampanti) && <div className="muted small">{stampantiDette(c.stampanti)}</div>}
          {account && (
            // Il segno accanto alla parola: l'informazione non sta nel solo colore.
            <div className={account === 'collegato' ? 'segno-ok small' : 'errore small'}>
              <span aria-hidden="true">{account === 'collegato' ? '✓ ' : '⚠ '}</span>
              account dell’app: {account}
            </div>
          )}
          {/* Gli orari di servizio del locale (REQ-FLOTTA-095): stanno col titolare, che li dichiara; i blocchi restano sei (REQ-FLOTTA-089). */}
          <h5 className="blocco-sotto">Orari di servizio</h5>
          <OrariNelBackoffice cliente={c} onFatto={az.carica} onErrore={az.onErrore} />
        </Blocco>

        <Blocco id={id('piano')} titolo="Piano">
          <div>{c.piano ? `${piano?.nome || c.piano} · ${euro(prezzoConSconto(prezzoMensile(c), c))}` : <span className="muted">—</span>}</div>
          {scontoDetto(c) && (
            <div className="muted small" data-testid={`sconto-${c.slug}`}>
              sconto {scontoDetto(c)}
            </div>
          )}
          {/* Un piano pagato fuori da Stripe (REQ-FLOTTA-023): fino a quando. */}
          {manuale && (
            <div className={c.abbonamento.stato === 'non pagato' ? 'errore small' : 'muted small'} data-testid={`pagato-${c.slug}`}>
              {c.abbonamento.pagato_fino_al ? `pagato fino al ${giorno(c.abbonamento.pagato_fino_al)}` : 'fuori da Stripe, senza scadenza'}
              {c.abbonamento.stato === 'non pagato' && ' · non pagato'}
            </div>
          )}
          <ModuliDelPiano cliente={c} />
          {riduzioneDetta(istanza) && (
            // REQ-FLOTTA-024: quello che la licenza toglie arriva al taglio.
            <div className="small">
              <span className="muted">riduzione: </span>
              <span data-testid="riduzione-al-taglio">{riduzioneDetta(istanza)}</span>
            </div>
          )}
          <div className="gruppo-azioni">
            <button type="button" className="btn ghost small" onClick={onCambia}>
              Cambia piano…
            </button>
            {manuale && (
              <button type="button" className="btn ghost small" onClick={() => az.registraPagamento(c)}>
                Registra pagamento…
              </button>
            )}
            <button type="button" className="btn ghost small" onClick={() => az.sconto(c)}>
              Sconto…
            </button>
          </div>
          {cambiaAperto && <CambiaPiano cliente={c} onFatto={onFatto} onErrore={az.onErrore} />}
        </Blocco>

        <Blocco id={id('app')} titolo="App">
          <div>
            <code>{istanza?.simulata ? 'simulato' : istanza?.progetto || progettoDi(c.slug)}</code>
          </div>
          {istanza?.profilo === 'leggero' && <div className="muted small">profilo leggero (Free)</div>}
          {/* Solo un https diventa un link (hrefSicuro, audit del 09/11/2026, finding 28). */}
          {hrefSicuro(istanza?.url) && (
            <div className="small">
              <a href={hrefSicuro(istanza.url)} target="_blank" rel="noreferrer">
                Apri l’app ↗
              </a>
            </div>
          )}
          <div className="small">
            <span className="muted">installata </span>
            <span data-testid={`versione-${c.slug}`}>{versione || '—'}</span>
            {!istanza?.versione && istanza?.presentazione?.versione && <span className="muted"> · detta dall’app</span>}
            {istanza?.ref && istanza.ref !== 'main' && <span className="muted"> · da {istanza.ref}</span>}
          </div>
          {/* L'aggiornamento: in corso con un segno che gira e da quanto (la
              pagina si ricarica da sola), riuscito con la versione a cui è
              arrivato. Quello fallito sta negli avvisi, col suo tasto. */}
          {inCorso && (
            <p className="avanzamento small" role="status">
              <span className="spinner" aria-hidden="true" />
              {aggiornamentoDetto(agg)} ·{' '}
              <a href="https://github.com/redirect11/drink-regia/actions/workflows/aggiorna-istanza.yml" target="_blank" rel="noreferrer">
                segui su GitHub ↗
              </a>
            </p>
          )}
          {agg?.stato === 'riuscito' && <div className="muted small">{aggiornamentoDetto(agg)}</div>}
          {istanza?.presentazione?.versione && (
            // REQ-FLOTTA-026: la versione che l'app stessa ha detto alla regia,
            // da qualunque deploy sia arrivata (anche da GitHub, come la Tana).
            <div className="small">
              <span className="muted">ultimo contatto: </span>
              <span data-testid="presentazione">
                {istanza.presentazione.versione} · dal {giorno(istanza.presentazione.prima_il)} · ultima volta il {giorno(istanza.presentazione.il)}
              </span>
            </div>
          )}
          {!daFlotta && (
            <div className="gruppo-azioni">
              <button type="button" className="btn ghost small" aria-expanded={gestioneAperta} onClick={() => setGestioneAperta((v) => !v)}>
                Pubblicazione e licenza…
              </button>
            </div>
          )}
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
        </Blocco>

        <Blocco id={id('aggiornamenti')} titolo="Aggiornamenti">
          {aggiornabile && attiva && (
            // Come si aggiorna questo locale (REQ-FLOTTA-020): di norma come
            // dicono le regole; l'admin lo può fissare, per esempio la Tana.
            // Il titolo del blocco fa da etichetta a vista.
            <div>
              <select
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
            </div>
          )}
          {propostaDetta(istanza?.proposta_aggiornamento) && <div className="muted small">{propostaDetta(istanza.proposta_aggiornamento)}</div>}
          {daFlotta && attiva && !istanza?.interna && (
            <div className="campo-blocco">
              <label htmlFor={id('gruppo')} className="muted small">
                Gruppo di rilascio
              </label>
              <select
                id={id('gruppo')}
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
            </div>
          )}
          {aggiornabile && attiva && (
            // «Aggiorna» da solo non diceva cosa fa (l'utente, 30/10/2026). Dal
            // 13/11/2026 (REQ-FLOTTA-089) la spiegazione è un aiuto che si apre:
            // sempre scritta accanto allungava la scheda. Il lettore di
            // schermo la legge col tasto (aria-describedby), chiusa o aperta.
            <div className="gruppo-azioni">
              <button
                type="button"
                className="btn ghost small"
                aria-describedby={id('aggiorna')}
                disabled={inAvvio || inCorso}
                onClick={() => az.aggiorna(c)}
              >
                {inAvvio ? 'Avvio…' : inCorso ? 'Aggiornamento in corso…' : 'Aggiorna subito'}
              </button>
              <Aiuto id={id('aggiorna')} titolo="Cosa fa «Aggiorna subito»">
                Solo questo locale, all’ultima versione dell’app, per una correzione urgente. A tutti i locali la porta un rilascio, a ondate (
                <Link to={`${BASE}/rilasci`}>Rilasci</Link>).
              </Aiuto>
            </div>
          )}
          {lanciato !== undefined && !inCorso && (
            // L'esito della chiamata: il workflow è partito, non è finito. Appena
            // il documento dell'istanza lo dice, al suo posto c'è l'avanzamento
            // nel blocco App, che si aggiorna da solo.
            <p className="small" role="status">
              Aggiornamento {lanciato ? `a ${lanciato} ` : ''}partito: la scheda si aggiorna da sola quando il workflow finisce.
            </p>
          )}
          {!attiva && <div className="muted small">Dopo l’attivazione.</div>}
          {attiva && !aggiornabile && <div className="muted small">Li porta il suo repository, non la regia.</div>}
        </Blocco>

        <Blocco id={id('aspetto')} titolo="Aspetto">
          <div className="small">
            <span className="muted">temi in licenza: </span>
            <span data-testid={`temi-${c.slug}`}>{(c.temi || []).length ? c.temi.map(nomeStile).join(', ') : 'nessuno'}</span>
          </div>
          <TemiInLicenza cliente={c} onErrore={az.onErrore} onFatto={az.carica} />
          <TemiSuMisuraLocale cliente={c} onErrore={az.onErrore} />
          {istanza?.progetto && attiva && <InstallatiDallApp cliente={c} />}
        </Blocco>

        {conAI && (
          <Blocco id={id('ai')} titolo="Credito AI">
            {credito ? (
              <>
                <div>
                  <span data-testid={`credito-${c.slug}`}>{euroCent(credito.credito)}</span>
                  <span className="muted small"> di credito</span>
                </div>
                <div className="muted small">
                  mese {euroCent(credito.spesoMese)} / {euroCent(credito.tetto)}
                  {!credito.attivo && ' · spento'}
                </div>
                {credito.sforato > 0 && (
                  // REQ-FLOTTA-093: un costo vero sopra la stima, che il
                  // credito non copriva. È un difetto: il credito si è
                  // fermato a zero e il resto lo paga Stonebit (Daniele,
                  // 13/11/2026: «In realtà è un costo che ci accolliamo»).
                  // Un'informazione per l'admin, non un debito del locale.
                  <p className="muted small" role="status" data-testid={`sforato-${c.slug}`}>
                    Sforamento assorbito da Stonebit: {euroCent(credito.sforato)}. Una richiesta AI è costata più della sua stima: i dettagli sono nei log, alla riga «[ai] SFORAMENTO».
                  </p>
                )}
              </>
            ) : (
              <div className="muted">—</div>
            )}
            {aiVisibile && (
              <div className="gruppo-azioni">
                <button type="button" className="btn ghost small" onClick={() => az.ricaricaAI(c)}>
                  Ricarica AI
                </button>
                <button type="button" className="btn ghost small" onClick={() => az.regalaAI(c)}>
                  Regala AI
                </button>
                <button type="button" className="btn ghost small" onClick={() => az.tettoAI(c, credito?.tetto)}>
                  Tetto AI
                </button>
                {credito && (
                  <button type="button" className="btn ghost small" onClick={() => az.azioneAI(c, credito.attivo ? 'spegni' : 'accendi')}>
                    {credito.attivo ? 'Spegni AI' : 'Accendi AI'}
                  </button>
                )}
              </div>
            )}
          </Blocco>
        )}
      </div>

      {conFondo && (
        <footer className="locale-fondo">
          {eliminazione && !eliminazioneFallita && <p className="muted small locale-eliminazione">Eliminazione: {eliminazione}</p>}
          {eliminaCliente && (
            // Un cliente senza istanza (mai attivata, o già eliminata col suo
            // progetto) si elimina da qui, con l'account (REQ-FLOTTA-059).
            // Con un'attivazione in coda o in corso si aspetta.
            <div className="gruppo-azioni pericolo" aria-label="Cliente">
              <button type="button" className="btn ghost small" onClick={() => az.eliminaCliente(c)}>
                Elimina cliente…
              </button>
            </div>
          )}
          {gestisciLicenza && (
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
          {eliminaAperto && <EliminaLocale cliente={c} istanza={istanza} onFatto={onFatto} onErrore={az.onErrore} />}
        </footer>
      )}
    </article>
  )
}

// Un blocco della scheda: il titolo, che lo nomina anche per il lettore di
// schermo, e sotto i suoi dati e i suoi tasti.
function Blocco({ id, titolo, children }) {
  return (
    <section className="blocco" aria-labelledby={id}>
      <h4 id={id}>{titolo}</h4>
      {children}
    </section>
  )
}

// Una spiegazione lunga diventa un aiuto che si apre (REQ-FLOTTA-089): un
// <details> si apre col clic, col dito e da tastiera (Invio o spazio sul
// «?») senza codice, e non solo al passaggio del mouse come un title.
function Aiuto({ id, titolo, children }) {
  return (
    <details className="aiuto">
      <summary aria-label={titolo}>?</summary>
      <p id={id} className="muted small">
        {children}
      </p>
    </details>
  )
}

// LE LICENZE PROTETTE (BUG-125 di tana-drink). La licenza esce da
// settings/bar, che ogni bartender può riscrivere, e va in licenza/attuale,
// che dall'app non scrive nessuno. Con l'app nuova un locale senza
// licenza/attuale mostra «Installazione non attivata»: prima di quel
// rilascio qui i problemi devono essere zero. «Allinea» riscrive ogni
// licenza dai dati della regia, in tutti e due i posti, e verifica. Nessun
// giro pianificato (l'utente, 31/10/2026: «Noi dobbiamo essere certi quando
// deployiamo che la licenza venga aggiornata»): la licenza si scrive a ogni
// cambio e prima di ogni deploy, e qui si controlla a richiesta.
function LicenzeProtette({ onErrore, onFatto }) {
  const [controllo, setControllo] = useState(undefined)
  const [inCorso, setInCorso] = useState(null)
  useEffect(() => osservaControlloLicenze(setControllo), [])

  const esegui = async (azione) => {
    if (azione === 'allinea' && !window.confirm('Riscrivere la licenza di ogni locale dai dati della regia, in licenza/attuale e in settings/bar?')) return
    setInCorso(azione)
    try {
      await gestisciLicenze(azione)
      onFatto()
    } catch (e) {
      onErrore(e.message)
    } finally {
      setInCorso(null)
    }
  }

  if (controllo === undefined) return null
  const pronte = controllo && controllo.problemi?.length === 0
  return (
    <section className="card" aria-label="Licenze protette">
      <h3>Licenze protette</h3>
      <p className="muted small">
        La licenza di ogni locale in licenza/attuale, che dall’app non si scrive. Ogni cambio e ogni aggiornamento dalla regia la scrivono
        prima del deploy; qui si controllano tutte a richiesta.
      </p>
      {controllo ? (
        <p className={pronte ? 'small' : 'errore small'} data-testid="esito-licenze">
          {pronte ? `Tutti pronti: ${controllo.pronte} su ${controllo.totale}.` : `Pronti ${controllo.pronte} su ${controllo.totale}.`}{' '}
          <span className="muted">
            {controllo.allineata ? 'Allineate e verificate' : 'Verificate'} il {new Date(controllo.controllata_il).toLocaleString('it-IT')}.
          </span>
        </p>
      ) : (
        <p className="muted small">Nessun controllo ancora.</p>
      )}
      {controllo?.problemi?.length > 0 && (
        <ul className="small">
          {controllo.problemi.map((p) => (
            <li key={p.slug}>
              <code>{p.slug}</code>: {p.perche}
            </li>
          ))}
        </ul>
      )}
      <div className="azioni">
        <button type="button" className="btn small" disabled={Boolean(inCorso)} onClick={() => esegui('allinea')}>
          {inCorso === 'allinea' ? 'Allineo…' : 'Allinea tutte'}
        </button>
        <button type="button" className="btn ghost small" disabled={Boolean(inCorso)} onClick={() => esegui('verifica')}>
          {inCorso === 'verifica' ? 'Verifico…' : 'Verifica'}
        </button>
      </div>
    </section>
  )
}

// LE SCADENZE (REQ-FLOTTA-023): niente giri quotidiani; ogni scadenza
// (pagamento a mano, prova, eliminazione, condizioni degli aggiornamenti)
// ha un compito alla sua data, che la regia programma quando la scadenza
// nasce. Quelle nate prima di questa versione vanno programmate una volta,
// con questo bottone. Rifarlo non fa danni.
function Scadenze({ onErrore }) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState(null)
  const programma = async () => {
    setInCorso(true)
    setEsito(null)
    try {
      const r = await programmaScadenze()
      setEsito(`Programmate ${r?.programmati ?? 0} scadenze.${r?.errori?.length ? ` Non riuscite: ${r.errori.join('; ')}.` : ''}`)
    } catch (e) {
      onErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <section className="card" aria-label="Scadenze">
      <h3>Scadenze</h3>
      <p className="muted small">
        Pagamenti fuori da Stripe, prove dei moduli, eliminazioni e condizioni degli aggiornamenti arrivano ognuna alla sua data, senza giri
        quotidiani. Con Stripe decide lo stato dell’abbonamento, coi tentativi e la grazia impostati in Stripe. Dopo il primo deploy di questa
        versione, programma una volta le scadenze che c’erano già.
      </p>
      <div className="azioni">
        <button type="button" className="btn ghost small" disabled={inCorso} onClick={programma}>
          {inCorso ? 'Programmo…' : 'Programma le scadenze'}
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

// UN ACCOUNT PER PERSONA (REQ-FLOTTA-083): i clienti registrati prima non
// hanno la forma base dell'email, e il controllo dei doppioni non li vede.
// Una volta dopo il deploy; rifatto non cambia niente.
function AllineaEmail({ onErrore }) {
  const [inCorso, setInCorso] = useState(false)
  const [esito, setEsito] = useState(null)
  const allinea = async () => {
    setInCorso(true)
    setEsito(null)
    try {
      const r = await allineaEmail()
      setEsito(`Allineati ${r?.allineati ?? 0} clienti su ${r?.totale ?? 0}.`)
    } catch (e) {
      onErrore(e.message)
    } finally {
      setInCorso(false)
    }
  }
  return (
    <section className="card" aria-label="Email dei clienti">
      <h3>Email dei clienti</h3>
      <p className="muted small">
        Un account per persona: chi si registra non può usare una variante di un’email che ha già un account. I clienti registrati prima di
        questa versione vanno allineati una volta; rifarlo non cambia niente.
      </p>
      <div className="azioni">
        <button type="button" className="btn ghost small" disabled={inCorso} onClick={allinea}>
          {inCorso ? 'Allineo…' : 'Allinea le email'}
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
      <label className="opzione">
        <input type="checkbox" checked={bozza.a_scelta} onChange={(e) => setBozza((b) => ({ ...b, a_scelta: e.target.checked }))} />A scelta del titolare: prima di
        ogni versione vede le novità e decide se aggiornare o saltarla
      </label>
      <label className="opzione">
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
  const [licenzaRegia, setLicenzaRegia] = useState(istanza?.licenza_dalla_regia === true)
  const [cartella, setCartella] = useState(istanza?.cliente || c.slug)
  const [build, setBuild] = useState(() => Object.fromEntries(CHIAVI_BUILD.map(([k]) => [k, istanza?.build?.[k] || ''])))
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await impostaAggiornamentiEsistente({ slug: c.slug, aggiornamenti_dalla_regia: dallaRegia, licenza_dalla_regia: licenzaRegia, cliente: cartella.trim(), build })
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <form className="card gestione-esistente" onSubmit={invia} aria-label={`Pubblicazione e licenza di ${c.nome_locale}`}>
      <h4>Pubblicazione e licenza di {c.nome_locale}</h4>
      <label className="opzione">
        <input type="checkbox" checked={dallaRegia} onChange={(e) => setDallaRegia(e.target.checked)} />
        La aggiorna la regia, con «Aggiorna subito» e i rilasci
      </label>
      <p className="muted small">Sul progetto {istanza?.progetto || '—'}. La pubblicazione dal suo repository resta possibile.</p>
      {/* REQ-FLOTTA-028: la licenza calcolata dal piano, come per gli altri. */}
      <label className="opzione">
        <input type="checkbox" checked={licenzaRegia} onChange={(e) => setLicenzaRegia(e.target.checked)} />
        La licenza la scrive la regia, dal suo piano e dai suoi moduli
      </label>
      <p className="muted small">
        {licenzaRegia
          ? 'Si scrive subito nel suo progetto: serve che la regia ci possa scrivere (roles/datastore.user).'
          : 'Spento: la licenza resta quella del suo progetto, e la regia non la tocca.'}
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

function SezioneRichieste({ automatico, onAutomatico, simulata = null, onSimulata, daApprovare, profili = [], onAutorizzaProfilo, contatti, onAutorizza, onRifiuta, onSegna }) {
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
            ? 'Deploy automatico acceso: «Attiva» di un titolare parte da solo, e un locale Free che compra si ripubblica col profilo completo.'
            : 'Deploy automatico spento: le attivazioni dopo un acquisto, e i locali Free che comprano, aspettano la tua autorizzazione qui sotto.'}
        </p>
        {/* SOLO SUL TEST (REQ-FLOTTA-072, Daniele, 12/11/2026: «facciamo
            l'attivazione finta»): un'attivazione arriva ad attiva senza
            GitHub e senza un progetto Google. In produzione l'interruttore
            non c'è, e il server non simula comunque. */}
        {simulata !== null && (
          <>
            <label className="opzione interruttore">
              <input type="checkbox" checked={simulata} onChange={(e) => onSimulata(e.target.checked)} />
              Attivazione simulata
            </label>
            <p className="muted small">
              {simulata
                ? 'Attivazione simulata accesa: chi attiva arriva al locale attivo con un indirizzo finto, e nessun progetto Google viene creato. Non c’è un’app da aprire. Il deploy automatico decide ancora se parte da solo o aspetta te.'
                : 'Attivazione simulata spenta: le attivazioni creano davvero il progetto del locale. Accendila per provare tutto il giro senza creare progetti: nessun progetto Google, nessuna quota consumata.'}
            </p>
          </>
        )}
        {daApprovare.length === 0 && profili.length === 0 && <p className="muted small">Nessuna attivazione da autorizzare.</p>}
      </section>

      {profili.length > 0 && (
        <section className="card" aria-label="Free che hanno comprato">
          <h3>Free che hanno comprato</h3>
          <p className="muted small">La licenza ha già tolto i limiti; il deploy porta Functions, Storage e segreti del piano a pagamento.</p>
          {profili.map(({ cliente: c, istanza }) => (
            <div className="row-tra riga-richiesta" key={c.uid}>
              <span>
                <strong>{c.nome_locale}</strong> <span className="muted small">{c.slug} · {c.email}</span>
                <div className="muted small">
                  piano {PIANI[istanza.profilo_completo_da_autorizzare.piano]?.nome || istanza.profilo_completo_da_autorizzare.piano || '—'} · comprato il{' '}
                  {istanza.profilo_completo_da_autorizzare.chiesto_il ? new Date(istanza.profilo_completo_da_autorizzare.chiesto_il).toLocaleString('it-IT') : '—'}
                </div>
              </span>
              <span className="azioni-riga">
                <button type="button" className="btn small" onClick={() => onAutorizzaProfilo(c)}>
                  Pubblica il piano
                </button>
              </span>
            </div>
          ))}
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
  const [temi, setTemi] = useState([])
  const [inCorso, setInCorso] = useState(false)

  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      await registraLocaleEsistente({ nome_locale: nome, slug, email, progetto, url, interna, temi })
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
      {/* I temi in licenza (REQ-FLOTTA-039): la Tana entra coi suoi esclusivi
          già scritti, così la licenza dalla regia non glieli toglie. */}
      <div className="vendita-moduli">
        {ESCLUSIVI.map((s) => (
          <label key={s.id} className="opzione">
            <input
              type="checkbox"
              checked={temi.includes(s.id)}
              onChange={(e) => setTemi((v) => (e.target.checked ? [...new Set([...v, s.id])] : v.filter((id) => id !== s.id)))}
            />
            Tema in licenza: {s.nome}
          </label>
        ))}
      </div>
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

// Lo stato di un locale in due parole e col suo colore: sospeso o chiuso
// vince sullo stato dell'istanza.
function statoBreve({ istanza, stato }) {
  const licenza = istanza?.licenza_stato || 'attiva'
  if (licenza !== 'attiva') return { tono: 'avviso', testo: `${licenza}${istanza.licenza_motivo ? ` · ${istanza.licenza_motivo}` : ''}` }
  return { tono: TONO[stato] || 'neutro', testo: STATO_BREVE[stato] || statoDetto(stato) }
}

// La licenza in una parola, per la tabella: chi la scrive e se va.
function licenzaBreve(istanza) {
  if (!istanza?.progetto) return { tono: 'neutro', testo: '—' }
  if (istanza.licenza_dalla_regia === false) return { tono: 'neutro', testo: 'del suo progetto' }
  if (istanza.licenza_protetta?.ok === false) return { tono: 'errore', testo: 'da allineare' }
  // La sospensione per pagamento che aspetta il suo momento fuori servizio (REQ-FLOTTA-095).
  if (istanza.sospensione_al?.dal) return { tono: 'attesa', testo: `sospensione il ${giorno(istanza.sospensione_al.dal)}` }
  if (istanza.riduzione_al_taglio?.dal) return { tono: 'neutro', testo: 'riduzione al taglio' }
  if (istanza.eliminazione?.stato === 'programmata') return { tono: 'errore', testo: `cancellazione il ${giorno(istanza.eliminazione.quando)}` }
  return { tono: 'neutro', testo: istanza.licenza_protetta?.ok ? 'verificata' : 'dalla regia' }
}

// LA VENDITA (REQ-FLOTTA-015, l'utente, 30/10/2026: «voglio poterlo
// attivare e disattivare per la vendita come admin»). Il Free e ogni modulo
// si mettono in vendita o si tolgono con un clic, senza deploy; chi li ha
// già continua a usarli. Ogni cambio resta nello storico.
// I CODICI SCONTO (REQ-FLOTTA-028): crearli, dar loro un limite di usi e
// disattivarli. Si applicano dalla scheda del locale, con «Sconto…».
// Il modulo parte con un codice proposto a caso (audit del 09/11/2026,
// finding 15): un codice corto o parlante si indovina, uno di cinque
// lettere e quattro cifre no. L'admin lo può cambiare, con la stessa regola
// del server; e un 100% ha sempre un limite di usi.
const CODICE_VUOTO = { codice: '', percentuale: '', durata_mesi: '', usi_massimi: '', descrizione: '' }
const codiceProposto = () => ({ ...CODICE_VUOTO, codice: generaCodice() })
const numeroONulla = (v) => (v === '' ? null : Number(v))

function CodiciSconto({ onErrore }) {
  const [elenco, setElenco] = useState([])
  const [nuovo, setNuovo] = useState(codiceProposto)
  // Ogni cambio rilegge l'elenco: `giro` cresce, l'effetto riparte.
  const [giro, setGiro] = useState(0)
  const carica = () => setGiro((g) => g + 1)
  useEffect(() => {
    elencoSconti()
      .then(setElenco)
      .catch((e) => onErrore(e.message))
  }, [giro, onErrore])
  const crea = async (e) => {
    e.preventDefault()
    const codice = nuovo.codice.trim().toUpperCase()
    // Le stesse regole del server, dette prima di chiamare.
    if (!CODICE_VALIDO.test(codice)) return onErrore(REGOLA_CODICE)
    if (Number(nuovo.percentuale) === 100 && nuovo.usi_massimi === '') return onErrore(LIMITE_PER_IL_CENTO)
    try {
      await gestisciSconti('crea', { ...nuovo, codice, percentuale: Number(nuovo.percentuale), durata_mesi: numeroONulla(nuovo.durata_mesi), usi_massimi: numeroONulla(nuovo.usi_massimi) })
      setNuovo(codiceProposto())
      carica()
    } catch (err) {
      onErrore(err.message)
    }
  }
  const disattiva = (codice) =>
    gestisciSconti('disattiva', { codice })
      .then(carica)
      .catch((e) => onErrore(e.message))
  const limite = (s) => {
    const scritto = window.prompt(`${s.codice}: quanti usi al massimo (vuoto per nessun limite)?`, s.usi_massimi ?? '')
    if (scritto === null) return
    gestisciSconti('limite', { codice: s.codice, usi_massimi: numeroONulla(scritto.trim()) })
      .then(carica)
      .catch((e) => onErrore(e.message))
  }
  const campo = (k) => ({ value: nuovo[k], onChange: (e) => setNuovo((n) => ({ ...n, [k]: e.target.value })) })
  return (
    <section className="card" aria-label="Codici sconto">
      <h3>Codici sconto</h3>
      <p className="muted small">
        Uno sconto al 100% illimitato vuol dire che il locale non paga e non scade; a tempo, che è pagato fino alla fine dello
        sconto. Uno parziale cambia solo il prezzo. Un codice disattivato non si applica più, e chi lo ha lo tiene.
      </p>
      <p className="muted small">
        Il limite conta i locali che prendono lo sconto: al pagamento, con un codice al 100% o applicato da qui. Raggiunto il
        limite il codice non vale più per nessuno nuovo; si può alzare quando serve. Un codice al 100% ha sempre un limite.
      </p>
      <p className="muted small">
        Un codice ha almeno 8 caratteri fra lettere maiuscole, cifre e trattini, con almeno 2 cifre: quello proposto va bene
        così; chi lo cambia tiene la regola. Un titolare che sbaglia dieci codici in un’ora aspetta un’ora.
      </p>
      {elenco.length === 0 && <p className="muted small">Nessun codice.</p>}
      {elenco.map((s) => (
        <div className="row-tra" key={s.codice} data-testid={`codice-${s.codice}`}>
          <span>
            <strong>{s.codice}</strong> · {s.percentuale}% · {s.durata_mesi ? `${s.durata_mesi} mesi` : 'illimitato'} · {usiDetti(s)}
            {s.descrizione && <span className="muted small"> · {s.descrizione}</span>}
            {!s.attivo && <span className="muted small"> · disattivato</span>}
          </span>
          {s.attivo && (
            <span className="row">
              <button type="button" className="btn ghost small" onClick={() => limite(s)}>
                Limite…
              </button>
              <button type="button" className="btn ghost small" onClick={() => disattiva(s.codice)}>
                Disattiva
              </button>
            </span>
          )}
        </div>
      ))}
      <form onSubmit={crea} aria-label="Nuovo codice sconto">
        <label>
          Codice
          <input {...campo('codice')} required minLength={8} maxLength={24} autoCapitalize="characters" />
        </label>
        <button type="button" className="btn ghost small" onClick={() => setNuovo((n) => ({ ...n, codice: generaCodice() }))}>
          Proponi un altro
        </button>
        <label>
          Percentuale
          <input type="number" min="1" max="100" {...campo('percentuale')} required />
        </label>
        <label>
          Durata in mesi (vuota: illimitato)
          <input type="number" min="1" max="120" {...campo('durata_mesi')} />
        </label>
        <label>
          Usi massimi (vuoto: nessun limite)
          <input type="number" min="1" max="100000" {...campo('usi_massimi')} />
        </label>

        <label>
          Descrizione
          <input {...campo('descrizione')} />
        </label>
        <div className="azioni">
          <button type="submit" className="btn small">
            Crea il codice
          </button>
        </div>
      </form>
    </section>
  )
}

// IL MODELLO AI PER TIPO DI RICHIESTA (REQ-FLOTTA-092). Daniele,
// 13/11/2026, su Sonnet: «Per tutto». Una scelta per tipo, fra i modelli
// del listino; si salva un tipo alla volta, passando dalla Function
// gestisciModelliAI, che ricontrolla tutto. Le richieste dopo usano la
// scelta nuova.
function ModelliAI({ impostazioni, onErrore }) {
  const cambia = (tipo, modello) => impostaModelliAI({ [tipo]: modello }).catch((e) => onErrore(e.message))
  return (
    <section className="card vendita" aria-label="Modelli AI">
      <h3>Modelli AI</h3>
      <p className="muted small">Il modello che risponde a ogni tipo di richiesta AI dei locali. Il credito si scala ai prezzi del modello che risponde.</p>
      {TIPI_MODELLO_DETTI.map(([tipo, nome]) => (
        <div key={tipo} className="campo">
          <label htmlFor={`bo-modello-${tipo}`}>{nome}</label>
          <select id={`bo-modello-${tipo}`} value={modelloScelto(tipo, impostazioni)} onChange={(e) => cambia(tipo, e.target.value)}>
            {MODELLI_AI.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      ))}
    </section>
  )
}

function Vendita({ onErrore }) {
  const [vendita, setVendita] = useState(() => venditaPulita(null))
  useEffect(() => osservaVendita((v) => setVendita(venditaPulita(v))), [])
  const cambia = (cambio) => impostaVendita(cambio).catch((e) => onErrore(e.message))
  return (
    <section className="card vendita" aria-label="Vendita">
      <h3>Vendita</h3>
      {/* IL SITO APERTO AL PUBBLICO (REQ-FLOTTA-043, l'utente, 07/11/2026):
          finché è spento, in produzione si vede solo la pagina di anteprima e
          le Functions della vendita rifiutano. Tre stati: non deciso (in
          produzione chiuso, sul test aperto), acceso, spento apposta. */}
      <label className="opzione interruttore">
        <input type="checkbox" checked={vendita.sito_aperto === true} onChange={(e) => cambia({ sito_aperto: e.target.checked })} />
        Sito aperto al pubblico
      </label>
      <p className="muted small" data-testid="sito-aperto">
        {vendita.sito_aperto === true
          ? 'La prima pagina, la registrazione e gli acquisti sono aperti a tutti.'
          : vendita.sito_aperto === false
            ? 'Chiuso dappertutto: al posto della prima pagina c’è l’anteprima, nessuno si registra né compra; chi ha un account entra da /accedi.'
            : 'Non ancora deciso: in produzione il sito mostra solo l’anteprima e nessuno si registra né compra; sul test è aperto. Accendilo quando vuoi aprire.'}
      </p>
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
        Piano Free disponibile
      </label>
      {/* «Disponibile», non «in vendita» (REQ-FLOTTA-073, Daniele: «è
          free, non si vende»). */}
      <p className="muted small">
        {vendita.free
          ? 'Il Free ha la sua scheda nella prima pagina, con «Inizia con Free», e chi si registra lo può attivare. Se l’attivazione crea davvero il locale lo decidono «Deploy automatico» e, sul test, «Attivazione simulata», in «Richieste».'
          : 'Il Free non ha la sua scheda e non si attiva; i locali Free che ci sono continuano a lavorare. Tienilo spento finché l’app non fa rispettare i suoi limiti.'}
      </p>
      {/* COSA PROMETTE LA PRIMA PAGINA SULL'ATTIVAZIONE (REQ-FLOTTA-073): lo
          decide l'admin, staccato da pagamenti, Free e deploy. */}
      <label className="opzione interruttore">
        <input
          type="checkbox"
          checked={vendita.mostra_attivazione_automatica}
          onChange={(e) => cambia({ mostra_attivazione_automatica: e.target.checked })}
        />
        Mostra «Attivazione automatica» nella prima pagina
      </label>
      <p className="muted small">
        {vendita.mostra_attivazione_automatica
          ? 'La prima pagina dice «Attivazione automatica» e che l’installazione nasce da sola. Cosa succede davvero lo decidono «Deploy automatico» e «Attivazione simulata».'
          : 'La prima pagina dice «Attivazione concordata con noi»: ci accordiamo sul pagamento e attiviamo noi.'}
      </p>
      {/* IL FREE FUORI VENDITA (REQ-FLOTTA-071, Daniele, 12/11/2026:
          «mettimelo che posso mostrarlo oppure no… no proprio nascondere il
          free»): nel confronto si vede come un piano normale, a meno di
          nasconderlo. */}
      <label className="opzione interruttore">
        <input type="checkbox" checked={vendita.nascondi_free} onChange={(e) => cambia({ nascondi_free: e.target.checked })} />
        Nascondi il Free dal sito
      </label>
      <p className="muted small">
        {vendita.free
          ? 'Il Free è in vendita: si vede comunque.'
          : vendita.nascondi_free
            ? 'Il Free non si vede da nessuna parte del sito: il confronto mostra solo Base e Completo.'
            : 'Nel confronto della prima pagina il Free compare con le sue differenze da Base e Completo. Non ha la sua scheda: non si sceglie e non si attiva.'}
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
// sulla scheda del locale, e segna la richiesta gestita. Qui arrivano anche
// i moduli chiesti dall'app su un piano gestito a mano (REQ-FLOTTA-037): la
// nota dice «Dall'app: aggiungere …», e la scelta è il piano da scrivere.
// L'elenco lo legge il Backoffice, che lo conta per il sotto-menù, e lo
// rilegge dopo ogni richiesta segnata.
function Contatti({ elenco, onSegna: segna }) {
  const aperte = elenco.filter((c) => c.stato === 'aperta')
  return (
    <section className="card" aria-label="Richieste di contatto">
      <h3>Richieste di contatto {aperte.length > 0 && <span className="muted small">· {aperte.length} da gestire</span>}</h3>
      <ul className="contatti">
        {elenco.map((c) => (
          <li key={c.uid} className={c.stato === 'aperta' ? 'aperta' : 'gestita'}>
            <strong>{c.nome_locale || c.email}</strong>
            {/* Un tema su misura chiesto al fornitore (REQ-FLOTTA-040): si lavora dalla scheda del locale. */}
            {c.tema_su_misura ? (
              <>
                {' '}
                · tema su misura · {nomeImpaginazione(c.tema_su_misura.struttura)}
                {c.tema_su_misura.riferimento && ` · riferimento: ${c.tema_su_misura.riferimento}`}
              </>
            ) : (
              <>
                {' '}
                · {PIANI[c.scelta?.piano]?.nome || c.scelta?.piano}
                {c.scelta?.moduli?.length > 0 && ` + ${c.scelta.moduli.map((id) => MODULI.find((m) => m.id === id)?.nome || id).join(', ')}`}
                {c.scelta?.terminali > 1 && ` · ${c.scelta.terminali} terminali`} · {euro(prezzoMensile(c.scelta || {}))} / mese
              </>
            )}
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
            {/* Le stampanti del locale (REQ-FLOTTA-081). */}
            {stampantiDette(c.stampanti) && <div className="muted small">{stampantiDette(c.stampanti)}</div>}
            {c.codice && <div className="small">Codice sconto: {c.codice}</div>}
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
  const [pagatoFino, setPagatoFino] = useState(cliente.abbonamento?.pagato_fino_al || '')
  const [inCorso, setInCorso] = useState(false)
  const p = PIANI[piano]
  const inclusi = new Set(p.include)
  const invia = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      const pagato = modo === 'fuori' && !p.gratuito ? { pagato_fino_al: pagatoFino } : {}
      await cambiaPianoAdmin({ slug: cliente.slug, piano, moduli: p.gratuito ? [] : moduli, terminali: p.gratuito ? 1 : terminali, modo, ...pagato })
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
            {MODULI.map((m) => {
              // Anche l'admin non scrive un modulo senza la sua base
              // (tana-drink REQ-LIC-015): la Function lo rifiuterebbe.
              const manca = !inclusi.has(m.id) && !moduli.includes(m.id) ? baseMancante({ piano, moduli }, m.id) : null
              return (
                <label key={m.id} className="opzione">
                  <input
                    type="checkbox"
                    checked={inclusi.has(m.id) || moduli.includes(m.id)}
                    disabled={inclusi.has(m.id) || Boolean(manca)}
                    onChange={(e) => setModuli((v) => senzaOrfani(piano, e.target.checked ? [...new Set([...v, m.id])] : v.filter((id) => id !== m.id)))}
                  />
                  {m.nome}
                  {manca && <span className="muted small"> · richiede {manca}</span>}
                </label>
              )
            })}
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
      {modo === 'fuori' && !p.gratuito && (
        // REQ-FLOTTA-023: alla scadenza, più i giorni di grazia, il locale si
        // ferma (o torna al Free) da solo. Vuoto: senza scadenza.
        <>
          <label htmlFor={`cp-pagato-${cliente.slug}`}>Pagato fino al (vuoto: senza scadenza)</label>
          <input id={`cp-pagato-${cliente.slug}`} type="date" value={pagatoFino} onChange={(e) => setPagatoFino(e.target.value)} />
        </>
      )}
      <div className="azioni">
        <button type="submit" className="btn small" disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Cambia piano'}
        </button>
      </div>
    </form>
  )
}

// MODULI E TEMI DEL LOCALE (REQ-FLOTTA-039, richiesta da tana-drink: «la
// regia deve sempre elencare moduli e temi acquistati in app»). I moduli
// (compresi nel piano e comprati) stanno nel blocco Piano; i temi in
// licenza (gli esclusivi, che assegna l'admin: clienti/{uid}.temi, e la
// licenza li nomina), quelli su misura e quello che il locale ha installato
// dall'app (letto dal suo progetto quando si apre la scheda e mai salvato
// qui) nel blocco Aspetto (REQ-FLOTTA-089). Accanto ai moduli i terminali,
// quando la scelta del cliente li dice.
function ModuliDelPiano({ cliente: c }) {
  const inclusi = PIANI[c.piano]?.include || []
  const moduli = [...new Set([...inclusi, ...(c.moduli || [])])].map((id) => MODULI.find((m) => m.id === id)?.nome || id)
  const terminali = Number(c.terminali) || 0
  return (
    <>
      <div className="small">
        <span className="muted">moduli: </span>
        <span data-testid={`moduli-${c.slug}`}>{moduli.length ? moduli.join(', ') : 'nessuno'}</span>
      </div>
      {terminali > 0 && <div className="muted small">{terminali === 1 ? '1 terminale' : `${terminali} terminali`}</div>}
    </>
  )
}

// I temi su misura del locale (REQ-FLOTTA-040): quelli dal mockup del
// titolare e quelli fatti da noi. L'admin ne scrive uno nuovo (l'editor
// del catalogo, con la struttura del menù e la ricetta), lo pubblica e lo
// ritira; la licenza del locale lo segue.
function TemiSuMisuraLocale({ cliente: c, onErrore }) {
  const [temi, setTemi] = useState([])
  const [giro, setGiro] = useState(0)
  const [aperto, setAperto] = useState(null)
  useEffect(() => {
    let vivo = true
    elencoTemiSuMisura(c.uid)
      .then((t) => vivo && setTemi(t))
      .catch((err) => vivo && onErrore(err.message))
    return () => {
      vivo = false
    }
  }, [c.uid, giro, onErrore])
  const azione = async (nome, dati) => {
    try {
      await gestisciTemiSuMisura(nome, { slug: c.slug, ...dati })
      setGiro((g) => g + 1)
      return true
    } catch (err) {
      onErrore(err.message)
      return false
    }
  }
  // Una riga col loro elenco, poi i tasti: uno per tema e «Nuovo…».
  return (
    <>
      <div className="small">
        <span className="muted">su misura: </span>
        <span data-testid={`su-misura-${c.slug}`}>
          {temi.length
            ? temi
                .map((t) => `${t.nome} (${ORIGINI_DETTE[t.origine] || t.origine}${t.ricetta?.impaginazione ? `, ${nomeImpaginazione(t.ricetta.impaginazione)}` : `, stile ${nomeStile(t.stile)}`}, ${(STATI_DETTI[t.stato] || t.stato).toLowerCase()})`)
                .join(' · ')
            : 'nessuno'}
        </span>
      </div>
      <div className="gruppo-azioni">
        {temi.map((t) => (
          <Fragment key={t.id}>
            {!aperto && (
              <button type="button" className="btn ghost small" onClick={() => setAperto({ ...t, nuovo: false })}>
                Modifica «{t.nome}»
              </button>
            )}
            {t.stato === 'pubblicato' ? (
              <button type="button" className="btn ghost small" onClick={() => azione('ritira', { id: t.id })}>
                Ritira «{t.nome}»
              </button>
            ) : (
              <button type="button" className="btn ghost small" onClick={() => azione('pubblica', { id: t.id })}>
                Pubblica «{t.nome}»
              </button>
            )}
          </Fragment>
        ))}
        {!aperto && (
          <button type="button" className="btn ghost small" onClick={() => setAperto({ ...temaVuoto(), nuovo: true })}>
            Nuovo tema su misura…
          </button>
        )}
      </div>
      {aperto && (
        <EditorTema
          key={aperto.id || 'nuovo'}
          iniziale={aperto}
          suMisura
          onChiudi={() => setAperto(null)}
          onSalva={async (tema, pubblica) => {
            const ok = await azione('salva', { tema, nuovo: aperto.nuovo })
            if (ok && pubblica) await azione('pubblica', { id: tema.id })
            if (ok) setAperto(null)
          }}
        />
      )}
    </>
  )
}

// L'admin assegna gli esclusivi: le caselle degli stili in licenza noti, e
// gli altri id a mano (un id che l'app non conosce l'app lo ignora, quindi
// si può scrivere prima che l'app lo abbia).
function TemiInLicenza({ cliente: c, onErrore, onFatto }) {
  const [aperto, setAperto] = useState(false)
  const [scelti, setScelti] = useState(c.temi || [])
  const [altri, setAltri] = useState((c.temi || []).filter((id) => !ESCLUSIVI.some((e) => e.id === id)).join(', '))
  const [inCorso, setInCorso] = useState(false)
  const salva = async (e) => {
    e.preventDefault()
    setInCorso(true)
    try {
      const aMano = altri.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      await impostaTemi(c.slug, [...new Set([...scelti.filter((id) => ESCLUSIVI.some((x) => x.id === id)), ...aMano])])
      setAperto(false)
      onFatto()
    } catch (err) {
      onErrore(err.message)
    } finally {
      setInCorso(false)
    }
  }
  if (!aperto) {
    return (
      <button type="button" className="btn ghost small" onClick={() => setAperto(true)}>
        Temi…
      </button>
    )
  }
  return (
    <form className="cambia-piano" onSubmit={salva} aria-label={`Temi in licenza di ${c.nome_locale}`}>
      {ESCLUSIVI.map((s) => (
        <label key={s.id} className="opzione">
          <input
            type="checkbox"
            checked={scelti.includes(s.id)}
            onChange={(e) => setScelti((v) => (e.target.checked ? [...new Set([...v, s.id])] : v.filter((id) => id !== s.id)))}
          />
          {s.nome}
        </label>
      ))}
      <label htmlFor={`temi-altri-${c.slug}`}>Altri id, separati da virgola</label>
      <input id={`temi-altri-${c.slug}`} value={altri} onChange={(e) => setAltri(e.target.value)} placeholder="es. aurora" />
      <div className="azioni">
        <button type="submit" className="btn small" disabled={inCorso}>
          {inCorso ? 'Un momento…' : 'Salva i temi'}
        </button>
        <button type="button" className="btn ghost small" onClick={() => setAperto(false)}>
          Annulla
        </button>
      </div>
    </form>
  )
}

// Gli installati dall'app si leggono dal locale all'apertura della scheda:
// la fonte della verità è il suo settings/bar, e letto adesso è sempre
// esatto. Se il progetto non risponde, lo si dice e il resto resta.
function InstallatiDallApp({ cliente: c }) {
  const [esito, setEsito] = useState(null)
  useEffect(() => {
    let vivo = true
    temiDelLocale(c.slug)
      .then((dati) => vivo && setEsito({ dati }))
      .catch((err) => vivo && setEsito({ errore: err.message }))
    return () => {
      vivo = false
    }
  }, [c.slug])
  const d = esito?.dati
  return (
    <div className="small">
      <span className="muted">installati nell’app: </span>
      {!esito && <span className="muted">leggo dal locale…</span>}
      {esito?.errore && <span className="errore">{esito.errore}</span>}
      {d && (
        <span data-testid={`installati-${c.slug}`}>
          stili: {d.stili_installati.length ? d.stili_installati.map(nomeStile).join(', ') : 'nessuno'} · temi:{' '}
          {d.temi_installati.length ? d.temi_installati.map((t) => `${t.nome}${t.stile ? ` (${nomeStile(t.stile)})` : ''}`).join(', ') : 'nessuno'} · in uso:{' '}
          {d.stile_menu ? nomeStile(d.stile_menu) : '—'}
        </span>
      )}
    </div>
  )
}

// A che punto è l'eliminazione di un locale (REQ-FLOTTA-014), in una riga.
const giorno = (iso) => new Date(iso).toLocaleDateString('it-IT')
function eliminazioneDetta(istanza) {
  const e = istanza?.eliminazione
  if (!e || e.stato === 'annullata') return null
  // La conservazione (REQ-FLOTTA-025): locale fermo, dati per 90 giorni.
  const chi = e.richiedente === 'titolare' ? ' (chiesta dal titolare)' : e.richiedente === 'conservazione' ? ' (fine della conservazione dei dati: il locale è fermo)' : ''
  const avvisi = e.avvisi?.length ? ` · avvisi mandati: ${e.avvisi.length}` : ''
  if (e.stato === 'programmata') return `Programmata per il ${giorno(e.quando)}${chi}${avvisi}`
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
  // Un locale simulato (REQ-FLOTTA-072) non ha un progetto: si conferma con lo slug.
  const progetto = istanza?.simulata ? cliente.slug : istanza?.progetto || progettoDi(cliente.slug)
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
