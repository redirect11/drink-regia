import { useEffect, useState } from 'react'
import { osservaCliente, osservaIstanza, osservaRichiesta, chiediAttivazione, inviaVerificaEmail, rileggiUtente, apriPortaleAbbonamento, apriLaTuaApp } from '../lib/db.js'
import { statoIstanza, statoDetto, puoAttivare, urlDi, progettoDi, riduzioneDetta, hrefSicuro, STATI } from '../lib/istanze.js'
import { PIANI, MODULI, prezzoMensile, prezzoAnnuale, prezzoFondatori, conIva, euro } from '../lib/piani.js'
import { prezzoConSconto, scontoDetto } from '../lib/sconti.js'
import { nomeStile } from '../lib/temi.js'
import SceltaPiano from './SceltaPiano.jsx'
import CreditoAI from './CreditoAI.jsx'
import TemiSuMisura from './TemiSuMisura.jsx'
import ChiudiLocale from './ChiudiLocale.jsx'
import ProveModuli from './ProveModuli.jsx'
import AggiornamentiLocale from './AggiornamentiLocale.jsx'
import Registrati from './Registrati.jsx'
import Anteprima from './Anteprima.jsx'

// LA DASHBOARD DEL TITOLARE (REQ-FLOTTA-004): il suo locale, il piano, lo
// stato dell'istanza e, quando è attiva, l'indirizzo dell'app.
//
// A RIQUADRI AFFIANCATI (l'utente, 31/10/2026: «direi di creare più box
// anche affiancati, due o tre colonne di box»): una griglia che fa due o
// tre colonne secondo lo schermo, una sul telefono. La scelta del piano e
// la chiusura del locale restano larghe quanto la pagina.
// `chiuso`: il sito non è aperto al pubblico (REQ-FLOTTA-043, App.jsx).
export default function Dashboard({ utente, chiuso = false }) {
  const [cliente, setCliente] = useState(undefined)
  const [istanza, setIstanza] = useState(null)
  const [richiesta, setRichiesta] = useState(null)
  const [errore, setErrore] = useState(null)
  const [avviso, setAvviso] = useState(null)

  useEffect(() => osservaCliente(utente.uid, setCliente), [utente.uid])
  useEffect(() => {
    if (!cliente?.slug) return undefined
    const a = osservaIstanza(cliente.slug, setIstanza)
    const b = osservaRichiesta(cliente.slug, setRichiesta)
    return () => {
      a()
      b()
    }
  }, [cliente?.slug])

  if (cliente === undefined) return <main className="pagina stretta muted">Carico…</main>
  // Un account senza locale (entrato con Google la prima volta, o una
  // registrazione interrotta) completa qui i dati (REQ-FLOTTA-038).
  // L'amministratore della regia non ha un locale.
  // Col sito chiuso (REQ-FLOTTA-043) no: la registrazione è l'anteprima
  // anche da qui, altrimenti chi entrava con Google si registrava lo stesso
  // (audit del 09/11/2026, finding 26). Chi ha già un locale lo vede.
  if (!cliente && !utente.admin) return chiuso ? <Anteprima lingua="it" /> : <Registrati completa={utente} />
  if (!cliente) return <main className="pagina stretta">Nessun locale registrato per questo account.</main>

  const stato = statoIstanza(istanza, richiesta)
  const via = puoAttivare(cliente, istanza, richiesta, { emailVerificata: utente.emailVerificata !== false })
  const piano = cliente.piano ? PIANI[cliente.piano] : null
  // Il prezzo coi centesimi e «+ IVA», col totale accanto (DEC-0005); chi
  // paga l'anno vede l'anno. Un Fondatore, finché l'offerta vale
  // (abbonamento.fondatore.fino_al, scritto dal webhook: REQ-FLOTTA-031),
  // vede il suo prezzo: il coupon Stripe toglie la differenza dal piano,
  // quindi moduli e terminali in più restano a listino. Un codice sconto
  // della regia (REQ-FLOTTA-028) si applica sul mese che resta.
  const annuale = cliente.abbonamento?.intervallo === 'anno' && !piano?.gratuito
  const fondatore = cliente.abbonamento?.fondatore
  const scontoFondatore =
    piano && fondatore && new Date(fondatore.fino_al) > new Date() && prezzoFondatori(cliente.piano) != null
      ? piano.prezzo - prezzoFondatori(cliente.piano)
      : 0
  const mensile = piano ? prezzoConSconto(prezzoMensile(cliente) - scontoFondatore, cliente) : 0
  const prezzo = piano ? (annuale ? prezzoAnnuale(mensile) : Math.round(mensile * 100) / 100) : 0
  // I dati del locale stanno per essere cancellati: si dice per primo.
  const cancellazione = ['programmata', 'in coda', 'in corso'].includes(istanza?.eliminazione?.stato)
  // L'indirizzo dell'app: quello scritto dal provisioning se è un https
  // (hrefSicuro), altrimenti quello che l'istanza avrà per il suo slug.
  const indirizzoApp = hrefSicuro(istanza?.url) || urlDi(cliente.slug)

  const attiva = async () => {
    setErrore(null)
    try {
      // Il server rilegge tutto da sé: qui non si passa niente (audit C2).
      await chiediAttivazione()
    } catch (e) {
      setErrore(e.message)
    }
  }

  // Nella propria app senza password (REQ-FLOTTA-030).
  const apri = async () => {
    setErrore(null)
    try {
      window.location.href = (await apriLaTuaApp()).url
    } catch (e) {
      setErrore(e.message)
    }
  }

  const gestisci = async () => {
    setErrore(null)
    try {
      window.location.href = (await apriPortaleAbbonamento()).url
    } catch (e) {
      setErrore(e.message)
    }
  }

  const rimanda = async () => {
    setAvviso(null)
    try {
      await inviaVerificaEmail()
      setAvviso('Email inviata di nuovo: controlla anche la posta indesiderata.')
    } catch (e) {
      setAvviso(e.message)
    }
  }
  const verificata = async () => {
    const ok = await rileggiUtente().catch(() => false)
    setAvviso(ok ? 'Email confermata.' : 'Non risulta ancora confermata: apri il link nel messaggio.')
  }

  return (
    <main className="pagina dashboard">
      {utente.emailVerificata === false && (
        <section className="card avviso avviso-email" role="status">
          <p>
            <strong>Conferma la tua email.</strong> Ti abbiamo scritto a {utente.email}: apri il link nel messaggio. Senza, l’app non
            si attiva.
          </p>
          <div className="azioni">
            <button type="button" className="btn ghost small" onClick={rimanda}>
              Invia di nuovo
            </button>
            <button type="button" className="btn ghost small" onClick={verificata}>
              Ho confermato
            </button>
          </div>
          {avviso && <p className="muted small">{avviso}</p>}
        </section>
      )}
      {cancellazione && <ChiudiLocale istanza={istanza} />}
      <header className="dashboard-testa">
        <h2>{cliente.nome_locale}</h2>
        <p className="muted small">
          {/* Il progetto lo dice l'istanza: un locale esistente (la Tana) non è drinkpos-<slug>. */}
          Identificativo: <code>{cliente.slug}</code> · progetto <code>{istanza?.simulata ? 'simulato' : istanza?.progetto || progettoDi(cliente.slug)}</code>
        </p>
      </header>
      {/* DUE COLONNE, OGNUNA UNA PILA (REQ-FLOTTA-062). Prima i riquadri
          stavano in una griglia a righe: ogni riga è alta quanto il
          riquadro più alto, e accanto al «Credito AI», che è lungo,
          restavano buchi; il quarto riquadro finiva solo, molto più in
          basso (Daniele, 11/11/2026: «tutti i box sono sfalsati, quello
          sotto è lontanissimo»). In una pila ogni riquadro sta subito
          sotto il precedente, qualunque altezza abbia. A sinistra, più
          larga, l'app, il piano e i moduli che si compilano; a destra il
          credito AI, che è un riepilogo. */}
      <div className="dashboard-colonne">
        <div className="pila principale">
          <section className="card" aria-label="L’app">
            <h3>L’app</h3>
            <p>
              <strong data-testid="stato-istanza">{statoDetto(stato)}</strong>
              {istanza?.aggiornata_il && <span className="muted small"> · {new Date(istanza.aggiornata_il).toLocaleString('it-IT')}</span>}
            </p>
            {stato === STATI.ATTIVA && (
              <p>
                L’app è su <a href={indirizzoApp}>{indirizzoApp}</a>. Sei l’admin del
                locale con l’email di questo account: ti abbiamo scritto per impostare la password. Se non trovi il messaggio, usa
                «password dimenticata» nell’app.
                {istanza?.versione && <span className="muted small"> Versione {istanza.versione}.</span>}
              </p>
            )}
            {stato === STATI.ATTIVA && (
              <button className="btn" type="button" onClick={apri}>
                Apri la tua app
              </button>
            )}
            {stato === STATI.ERRORE && istanza?.errore && <p className="errore small">{istanza.errore}</p>}
            {(stato === STATI.DA_ATTIVARE || stato === STATI.ERRORE) && (
              <>
                <button className="btn" type="button" disabled={!via.ok} onClick={attiva}>
                  Attiva l’istanza
                </button>
                {!via.ok && <p className="muted small">{via.perche}</p>}
              </>
            )}
            {errore && <p className="errore">{errore}</p>}
          </section>
          <section className="card" aria-label="Piano">
            <h3>Piano</h3>
            {piano ? (
              <p>
                <strong>{piano.nome}</strong> ·{' '}
                <span data-testid="prezzo-piano">
                  {piano.gratuito
                    ? `${euro(0)} al mese`
                    : `${euro(prezzo)} + IVA ${annuale ? 'all’anno' : 'al mese'} (${euro(conIva(prezzo))} IVA inclusa)`}
                </span>
                {scontoDetto(cliente) && <span className="muted small"> · sconto {scontoDetto(cliente)}</span>}
                {cliente.moduli?.length > 0 && (
                  <span className="muted"> · moduli: {cliente.moduli.map((id) => MODULI.find((m) => m.id === id)?.nome || id).join(', ')}</span>
                )}
                {cliente.terminali > 1 && <span className="muted"> · {cliente.terminali} terminali</span>}
                {/* I temi in licenza (REQ-FLOTTA-039): gli esclusivi che il fornitore ha dato al locale. */}
                {cliente.temi?.length > 0 && <span className="muted"> · temi: {cliente.temi.map(nomeStile).join(', ')}</span>}
                {/* I limiti del Free si dicono qui, chiari (REQ-FLOTTA-015). */}
                {piano.limiti && (
                  <span className="muted small" data-testid="limiti-piano">
                    {' '}
                    · fino a {piano.limiti.prodotti_max} prodotti nel menù e {piano.limiti.conti_aperti_max} conti aperti insieme
                    {piano.limiti.utenti_max === 1 && ', solo il titolare'}
                    {piano.limiti.sconti === false && ', senza sconti'}
                    {piano.limiti.comande === false && ', senza comande'}, storico degli ultimi {piano.limiti.storico_giorni} giorni
                  </span>
                )}
              </p>
            ) : (
              <p className="muted">Nessun piano ancora: scegline uno qui sotto.</p>
            )}
            {cliente.abbonamento?.stato && cliente.abbonamento.stato !== 'attivo' && (
              <p className="errore small">Abbonamento {cliente.abbonamento.stato}.</p>
            )}
            {/* Gestire l'abbonamento da soli (REQ-FLOTTA-023): con Stripe il
                portale clienti (disdetta a fine periodo, carta, fatture); a
                mano fino a quando è pagato, e a chi scrivere. */}
            {cliente.abbonamento?.origine === 'stripe' && cliente.abbonamento?.stripe_customer && (
              <button type="button" className="btn ghost small" onClick={gestisci}>
                Gestisci l’abbonamento
              </button>
            )}
            {cliente.abbonamento?.origine === 'manuale' && cliente.abbonamento?.pagato_fino_al && (
              <p className="muted small" data-testid="pagato-fino-al">
                Pagato fino al {new Date(cliente.abbonamento.pagato_fino_al).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}. Per
                rinnovare o disdire scrivici.
              </p>
            )}
            {/* Quello che il piano nuovo toglie arriva a fine giornata, non in
                servizio (REQ-FLOTTA-024). */}
            {riduzioneDetta(istanza) && (
              <p className="muted small" data-testid="riduzione-al-taglio">
                {riduzioneDetta(istanza)} Fino ad allora l’app resta com’è.
              </p>
            )}
          </section>
          {/* Le versioni nuove e le condizioni degli aggiornamenti (REQ-FLOTTA-020). */}
          {stato === STATI.ATTIVA && <AggiornamentiLocale istanza={istanza} />}
          <ProveModuli cliente={cliente} istanza={istanza} />
          {/* I temi su misura (REQ-FLOTTA-040) arrivano all'app con la licenza: con l'app attiva.
              Stanno nella colonna larga: è un modulo lungo, e a destra faceva
              una colonna alta il doppio dell'altra. */}
          {stato === STATI.ATTIVA && <TemiSuMisura uid={utente.uid} slug={cliente.slug} />}
        </div>
        <div className="pila accanto">
          <CreditoAI slug={cliente.slug} istanzaAttiva={stato === STATI.ATTIVA} />
        </div>
      </div>
      {/* Senza un abbonamento attivo si sceglie (o si rinnova) il piano. Dal
          Free a un piano a pagamento si passa dal Checkout, non da «modifica»
          (REQ-FLOTTA-015). */}
      <div className="dashboard-piano">
        {(cliente.abbonamento?.stato !== 'attivo' || cliente.abbonamento?.origine === 'gratuito') && <SceltaPiano cliente={cliente} />}
        {cliente.abbonamento?.stato === 'attivo' && cliente.abbonamento?.origine !== 'gratuito' && <SceltaPiano cliente={cliente} modifica />}
      </div>
      {new URLSearchParams(window.location.search).get('pagamento') === 'ok' && (
        <p className="muted small">Pagamento ricevuto: l’abbonamento compare qui sopra appena Stripe ce lo conferma, di solito in pochi secondi.</p>
      )}
      {/* In fondo, lontano dal resto: chiudere e cancellare il locale. Una
          cancellazione già programmata sta invece in cima (REQ-FLOTTA-025). */}
      {!cancellazione && <ChiudiLocale istanza={istanza} />}
    </main>
  )
}
