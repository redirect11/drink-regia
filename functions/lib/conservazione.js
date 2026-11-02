'use strict'

// ── LA CONSERVAZIONE DEI DATI DI UN LOCALE FERMO, LOGICA PURA ──────────
// (REQ-FLOTTA-025)
//
// L'utente, 02/11/2026: senza licenza valida il prodotto non parte; con
// l'opzione della regia diventa Free senza perdere i dati; altrimenti
// «dobbiamo cancellare i suoi dati entro un tot e avvisarlo quando stiamo
// per cancellarli». Decisioni dello stesso giorno: 90 giorni; un locale
// tornato al Free non perde niente (il Free è un servizio attivo); avvisi
// subito, 7 giorni e 1 giorno prima; per email, nella dashboard e nell'app.
//
// Il perché: a fine servizio il responsabile del trattamento restituisce i
// dati e li cancella (GDPR art. 28, par. 3, lett. g). La restituzione è il
// backup che il workflow di eliminazione fa sempre prima di cancellare, e
// che il titolare scarica per 180 giorni (lib/eliminazione.js).
//
// La conservazione è un'eliminazione programmata come le altre, con
// `richiedente: 'conservazione'`: la vedono il backoffice e la dashboard,
// la lancia lo stesso compito. Parte quando il locale si ferma per il
// pagamento (sospeso o chiuso) o lo chiude l'admin; una sospensione
// dell'admin no, è una pausa che decide lui. Se il locale torna a pagare
// o l'admin lo riattiva, si annulla da sola.

const GIORNO = 86400000
const GIORNI_CONSERVAZIONE = 90
// Gli avvisi prima della cancellazione, in giorni; il primo parte subito.
const AVVISI_PRIMA = [7, 1]

const programmata = (ist) => ist?.eliminazione?.stato === 'programmata'
const ms = (iso) => Date.parse(iso || '')

// Si conservano (e poi si cancellano) i dati di questo locale? No per la
// Tana e le interne, per un locale esistente, o se una cancellazione è già
// programmata o partita (quella del titolare, a 30 giorni, resta la sua).
function daConservare(ist) {
  if (!ist?.progetto || ist.stato !== 'attiva') return false
  if (ist.interna === true || ist.origine === 'esistente') return false
  return !['programmata', 'in coda', 'in corso'].includes(ist.eliminazione?.stato)
}

// L'eliminazione programmata a 90 giorni da adesso.
function conservazioneChiesta({ motivo = null, adesso = new Date() } = {}) {
  return {
    stato: 'programmata',
    quando: new Date(adesso.getTime() + GIORNI_CONSERVAZIONE * GIORNO).toISOString(),
    subito: false,
    richiedente: 'conservazione',
    motivo,
    chiesta_il: adesso.toISOString(),
    chiesta_da: 'regia',
    errore: null,
    avvisi: [],
  }
}

// Torna a lavorare: la conservazione si annulla (non quella del titolare,
// che la annulla lui, né quella dell'admin).
const daAnnullare = (ist) => programmata(ist) && ist.eliminazione.richiedente === 'conservazione'

// I momenti degli avvisi prima della cancellazione, ancora da venire.
function orariAvvisi(quando, adesso = new Date()) {
  return AVVISI_PRIMA.map((giorni) => ({ giorni, il: new Date(ms(quando) - giorni * GIORNO).toISOString() })).filter((a) => ms(a.il) > adesso.getTime())
}

// Quale avviso è questo compito: i giorni che mancano, o null se la
// cancellazione nel frattempo è cambiata o annullata.
function avvisoDelCompito(ist, il) {
  if (!programmata(ist)) return null
  const a = AVVISI_PRIMA.find((giorni) => new Date(ms(ist.eliminazione.quando) - giorni * GIORNO).toISOString() === il)
  return a ?? null
}

// Già mandato? Un compito che si ripete non manda due email.
const giaAvvisato = (ist, chiave) => (ist?.eliminazione?.avvisi || []).some((a) => a.chiave === chiave)

const { conArticolo } = require('./comunicazioni.js')

const PERCHE = {
  conservazione: 'il locale è fermo',
  titolare: 'ne hai chiesto la chiusura',
  admin: 'il locale è stato chiuso',
}

// L'email al titolare. `giorni`: null per il primo avviso, 7 o 1 dopo.
function emailAvviso({ nome_locale: nome, email } = {}, ist, giorni = null) {
  const quando = conArticolo(ist.eliminazione.quando)
  const perche = PERCHE[ist.eliminazione.richiedente] || PERCHE.conservazione
  const oggetto = giorni == null ? `${nome}: i dati del locale verranno cancellati ${quando}` : `${nome}: i dati del locale verranno cancellati ${giorni === 1 ? 'domani' : `fra ${giorni} giorni`}`
  const righe = [
    `Buongiorno,`,
    ``,
    `poiché ${perche}, ${quando} cancelleremo l'installazione di ${nome} e tutti i suoi dati, come previsto dai termini del servizio e dalla normativa sulla protezione dei dati.`,
    ``,
    `Prima della cancellazione facciamo un backup completo, che potrai scaricare dalla tua area clienti per 180 giorni; poi verrà cancellato anche quello.`,
    ``,
    ist.eliminazione.richiedente === 'titolare'
      ? `Se hai cambiato idea, puoi annullare la chiusura dalla tua area clienti fino a quel giorno.`
      : `Per evitare la cancellazione basta riattivare l'abbonamento dalla tua area clienti, o scriverci.`,
  ]
  return email ? { to: email, message: { subject: oggetto, text: righe.join('\n') } } : null
}

// Quello che la licenza dice all'app (REQ-FLOTTA-025): una cancellazione
// programmata, con la data e il perché. Null se non ce n'è.
function cancellazioneDellaLicenza(ist) {
  if (!programmata(ist)) return null
  return { il: ist.eliminazione.quando, richiedente: ist.eliminazione.richiedente || 'admin' }
}

module.exports = {
  GIORNI_CONSERVAZIONE,
  AVVISI_PRIMA,
  daConservare,
  conservazioneChiesta,
  daAnnullare,
  orariAvvisi,
  avvisoDelCompito,
  giaAvvisato,
  emailAvviso,
  cancellazioneDellaLicenza,
}
