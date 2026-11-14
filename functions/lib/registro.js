'use strict'

// ── I REGISTRI STRUTTURATI DELLE FUNCTIONS (REQ-FLOTTA-110) ────────────
//
// Daniele, 14/11/2026: «la dashboard la vorrei piu sofisticata per il
// logging e il monitoring. Roba piu seria», e poi: «niente allarmi
// google. Noi che possiamo fare internamente?». La base di tutto è qui:
// prima ogni Function scriveva righe di testo libere, e una parte degli
// errori non scriveva niente (il 500 muto della presentazione,
// REQ-FLOTTA-108). Grafici, filtri per locale e la sentinella
// (REQ-FLOTTA-111) hanno bisogno di righe con dei campi.
//
// Ogni chiamata a una Function HTTP o callable scrive UNA riga JSON:
//   { funzione, tipo: 'http'|'chiamata', slug, esito, status, durata_ms, versione }
// e un errore inatteso ne scrive un'altra, severity ERROR, col suo stack
// in testa al messaggio: Error Reporting la riconosce e la raggruppa.
//
// NIENTE DATI PERSONALI: né uid né email né corpo della richiesta. Le
// email che finiscono in un messaggio d'errore si mascherano. Il locale
// si scrive col suo slug, che è il nome tecnico del progetto, e solo se ha
// la forma di uno slug: un valore arrivato dalla richiesta non entra nei
// registri così com'è.
//
// Il nome della Function non si passa a mano: Google lo mette in ogni
// Function (FUNCTION_TARGET, o K_SERVICE in minuscolo). Così index.js non
// cambia le sue 62 dichiarazioni: `onRequest` e `onCall` passano di qui.

const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const VERSIONE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/
const EMAIL = /[^\s@"'<>«»()]+@[^\s@"'<>«»()]+\.[A-Za-z]{2,}/g
const MAX_MESSAGGIO = 4000

const nomeFunzione = (env = process.env) => env.FUNCTION_TARGET || env.K_SERVICE || 'sconosciuta'
const slugPulito = (v) => (typeof v === 'string' && SLUG.test(v) ? v : null)
const versionePulita = (v) => (typeof v === 'string' && VERSIONE.test(v) ? v : null)
const senzaEmail = (testo) => String(testo ?? '').replace(EMAIL, '«email»')

// L'esito in una parola: per l'HTTP dallo status, per una callable dal
// codice dell'HttpsError ('ok' se è andata).
function esitoHttp(status) {
  if (status >= 500) return 'errore'
  if (status >= 400) return 'rifiutata'
  return 'ok'
}
const severityDi = (esito) => (esito === 'errore' ? 'ERROR' : 'INFO')

// La riga di una richiesta HTTP.
function rigaRichiesta({ funzione, slug, status, durata_ms, versione }) {
  const esito = esitoHttp(status)
  return {
    severity: severityDi(esito),
    message: `${funzione} ${status}${slugPulito(slug) ? ` ${slug}` : ''}`,
    funzione,
    tipo: 'http',
    slug: slugPulito(slug),
    esito,
    status,
    durata_ms,
    versione: versionePulita(versione),
  }
}

// Gli errori delle callable che sono un rifiuto e non un guasto: chi
// chiama ha sbagliato o non può. Gli altri codici sono guasti.
const RIFIUTI = new Set(['invalid-argument', 'failed-precondition', 'out-of-range', 'unauthenticated', 'permission-denied', 'not-found', 'already-exists', 'resource-exhausted', 'cancelled', 'aborted'])

function rigaChiamata({ funzione, slug, codice, durata_ms }) {
  const esito = !codice ? 'ok' : RIFIUTI.has(codice) ? 'rifiutata' : 'errore'
  return {
    severity: severityDi(esito),
    message: `${funzione} ${codice || 'ok'}${slugPulito(slug) ? ` ${slug}` : ''}`,
    funzione,
    tipo: 'chiamata',
    slug: slugPulito(slug),
    esito,
    codice: codice || null,
    durata_ms,
  }
}

// Un errore inatteso: lo stack in testa al messaggio, che è quello che
// Error Reporting cerca; le email mascherate anche lì.
function rigaErrore({ funzione, slug, errore }) {
  const testo = errore?.stack || `${errore?.name || 'Error'}: ${errore?.message ?? errore}`
  return {
    severity: 'ERROR',
    message: senzaEmail(testo).slice(0, MAX_MESSAGGIO),
    funzione,
    slug: slugPulito(slug),
    esito: 'errore',
  }
}

// Chi scrive davvero: il logger di firebase-functions, che manda a Cloud
// Logging una riga JSON con severity e campi. Si carica qui dentro, così
// la logica resta provabile senza le dipendenze delle Functions.
function scrittoreGoogle() {
  const { write } = require('firebase-functions/logger')
  return (riga) => write(riga)
}

// Una Function HTTP col suo registro. Il gestore può dire il locale e la
// versione dell'app in `res.locals.slug` e `res.locals.versione`. Le
// richieste OPTIONS (il preflight del browser) non si scrivono: sono
// metà del traffico e non dicono niente.
function conRegistro(gestore, { scrivi = scrittoreGoogle(), env = process.env, adesso = () => Date.now() } = {}) {
  return async (req, res) => {
    const funzione = nomeFunzione(env)
    const inizio = adesso()
    if (!res.locals) res.locals = {}
    if (req.method !== 'OPTIONS') {
      res.on('finish', () => {
        scrivi(rigaRichiesta({ funzione, slug: res.locals.slug, status: res.statusCode, durata_ms: adesso() - inizio, versione: res.locals.versione }))
      })
    }
    try {
      return await gestore(req, res)
    } catch (e) {
      scrivi(rigaErrore({ funzione, slug: res.locals.slug, errore: e }))
      if (!res.headersSent) res.status(500).json({ errore: 'Errore della regia: riprova fra poco.' })
    }
  }
}

// Una callable col suo registro. Il locale, se la chiamata ne nomina uno
// (`data.slug`, come le azioni dell'admin). L'errore torna a chi chiama
// esattamente com'era: il registro guarda, non cambia le risposte.
function conRegistroChiamata(gestore, { scrivi = scrittoreGoogle(), env = process.env, adesso = () => Date.now() } = {}) {
  return async (req, ...resto) => {
    const funzione = nomeFunzione(env)
    const inizio = adesso()
    const slug = req?.data?.slug
    try {
      const risultato = await gestore(req, ...resto)
      scrivi(rigaChiamata({ funzione, slug, codice: null, durata_ms: adesso() - inizio }))
      return risultato
    } catch (e) {
      // Un HttpsError ha il suo codice ('invalid-argument'…); un errore
      // qualunque arriva a chi chiama come 'internal', e così si scrive.
      const codice = typeof e?.code === 'string' ? e.code : 'internal'
      const riga = rigaChiamata({ funzione, slug, codice, durata_ms: adesso() - inizio })
      scrivi(riga)
      if (riga.esito === 'errore') scrivi(rigaErrore({ funzione, slug, errore: e }))
      throw e
    }
  }
}

module.exports = { nomeFunzione, rigaRichiesta, rigaChiamata, rigaErrore, conRegistro, conRegistroChiamata, senzaEmail }
