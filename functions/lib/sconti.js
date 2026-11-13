'use strict'

// ── I CODICI SCONTO, LOGICA PURA (REQ-FLOTTA-028) ──────────────────────
//
// L'utente, 02/11/2026, sulla Tana: «Dobbiamo trattarlo come abbonamento
// premium e tracciare i moduli attivi. Ha un codice sconto allegato con una
// durata illimitata per avere tutti i servizi attivi.» E, fra Stripe e la
// regia, «Codici sconto nella regia»: coi pagamenti online spenti, i codici
// stanno qui; quando si accende Stripe, un codice diventerà un coupon sulla
// subscription.
//
// Un codice: { codice, percentuale 1-100, durata_mesi (1-120, o null:
// illimitato), usi_massimi (1-100000, o null: senza limite), usi,
// descrizione, attivo }. Applicato a un cliente diventa
// clienti/{uid}.sconto = { codice, percentuale, durata_mesi, dal, fino }.
// - Uno sconto al 100% è un abbonamento attivo che non si paga: illimitato
//   non scade mai (origine «sconto»); a tempo è un piano a mano pagato
//   fino alla fine dello sconto (origine «manuale», «pagato fino al»), e da
//   lì valgono la grazia, i promemoria e la sospensione di sempre.
// - Uno sconto parziale cambia solo il prezzo: il pagamento resta com'era.
// Con Stripe, per ora, si applica solo uno sconto parziale: un 100% vorrebbe
// dire smettere di far pagare una subscription, e quello va fatto in Stripe.

// La forma di un codice che si cerca: lettere maiuscole, cifre e trattini,
// da 3 a 24. È la forma dei codici creati fino al 09/11/2026 e resta quella
// della ricerca, perché quei codici (TANA-100, i codici di prova sul test)
// valgono ancora: i vincoli nuovi valgono alla creazione.
const CODICE = /^[A-Z0-9][A-Z0-9-]{2,23}$/
// La forma di un codice NUOVO (audit del 09/11/2026, finding 15): almeno 8
// caratteri e almeno 2 cifre. Prima bastavano 3 caratteri, e un codice
// come «TANA» si indovinava; con 8 caratteri e due cifre, e il limite di
// tentativi (sotto), provare a caso non porta da nessuna parte.
const CODICE_NUOVO = /^(?=(?:[A-Z-]*[0-9]){2})[A-Z0-9][A-Z0-9-]{7,23}$/
// Gli stessi testi li mostra il backoffice prima di chiamare (src/lib/sconti.js).
const REGOLA_CODICE = 'Codice non valido: almeno 8 caratteri fra lettere maiuscole, cifre e trattini, con almeno 2 cifre.'
const LIMITE_PER_IL_CENTO = 'Un codice al 100% ha sempre un limite di usi.'

// Un codice pulito, o { errore }.
function scontoPulito(dati) {
  const codice = String(dati?.codice || '').trim().toUpperCase()
  if (!CODICE_NUOVO.test(codice)) return { errore: REGOLA_CODICE }
  const percentuale = Number(dati?.percentuale)
  if (!Number.isInteger(percentuale) || percentuale < 1 || percentuale > 100) return { errore: 'Percentuale da 1 a 100.' }
  const mesi = dati?.durata_mesi
  const durata_mesi = mesi === null || mesi === undefined || mesi === '' ? null : Number(mesi)
  if (durata_mesi !== null && (!Number.isInteger(durata_mesi) || durata_mesi < 1 || durata_mesi > 120)) return { errore: 'Durata da 1 a 120 mesi, o vuota per illimitata.' }
  const limite = limitePulito(dati?.usi_massimi)
  if (limite.errore) return limite
  // Un 100% attiva un piano che non si paga (attivaConCodice): senza un
  // limite, un codice fatto girare attiverebbe piani gratis a non finire.
  if (percentuale === 100 && limite.usi_massimi == null) return { errore: LIMITE_PER_IL_CENTO }
  return { codice, percentuale, durata_mesi, usi_massimi: limite.usi_massimi, descrizione: String(dati?.descrizione || '').trim().slice(0, 120), attivo: true }
}

// ── I TENTATIVI SUI CODICI (audit del 09/11/2026, finding 15) ──────────
//
// La verifica di un codice dice se esiste: con tentativi senza limite è un
// oracolo per indovinarli. Ogni verifica o attivazione fallita di un
// titolare si conta in clienti/{uid}.tentativi_codice = { conteggio,
// finestra_da }; a 10 in un'ora la Function rifiuta con resource-exhausted
// finché l'ora non passa; un codice buono azzera il contatore. Il campo lo
// scrivono solo le Functions: nelle regole il titolare cambia solo i suoi
// dati anagrafici.
const TENTATIVI_MAX = 10
const FINESTRA_TENTATIVI_MS = 60 * 60 * 1000
const TROPPI_TENTATIVI = 'Troppi tentativi, riprova fra un’ora.'

// La finestra dei tentativi è ancora aperta?
const finestraAperta = (t, adesso) => t?.finestra_da != null && adesso.getTime() - Date.parse(t.finestra_da) < FINESTRA_TENTATIVI_MS

function troppiTentativi(t, adesso = new Date()) {
  return finestraAperta(t, adesso) && (Number(t.conteggio) || 0) >= TENTATIVI_MAX
}

// Il contatore dopo un tentativo fallito: cresce nella finestra aperta,
// riparte da uno se la finestra è passata.
function tentativoFallito(t, adesso = new Date()) {
  if (finestraAperta(t, adesso)) return { conteggio: (Number(t.conteggio) || 0) + 1, finestra_da: t.finestra_da }
  return { conteggio: 1, finestra_da: adesso.toISOString() }
}

// ── IL LIMITE DI USI ────────────────────────────────────────────────────
//
// L'utente, 02/11/2026: «Aggiungiamo limite di utilizzo del codice». Senza,
// un codice lo usava chiunque lo conoscesse, e un 100% fatto girare
// attivava piani gratis a non finire. Il limite vale per tutti gli usi:
// quelli del titolare (al pagamento o con un codice al 100%) e quelli
// dell'admin che lo applica dalla scheda.
// - Un uso è un cliente che prende lo sconto: chi lo ha già sul suo
//   cliente (clienti/{uid}.sconto.codice) e lo riusa, per esempio pagando
//   dopo che l'admin glielo ha dato, non ne consuma un altro.
// - Al pagamento l'uso si tiene da parte per la durata del Checkout
//   (`prenotazioni`, come i posti Fondatori): due titolari che pagano
//   insieme l'ultimo uso non lo prendono tutti e due. Diventa un uso quando
//   Stripe conferma il pagamento; se la sessione scade, la prenotazione
//   scade con lei.
// - Disattivare un codice resta un'altra cosa: lo ferma subito, a
//   qualunque numero di usi.

const USI_MASSIMI = 100000
// Come per i Fondatori: un webhook può arrivare un po' dopo la scadenza
// della sessione, e la prenotazione non deve sparire prima.
const MARGINE_MS = 10 * 60 * 1000
const ESAURITO = 'Codice esaurito: ha già raggiunto il numero massimo di usi.'

// Il limite scritto dall'admin: un intero, o vuoto per nessun limite.
function limitePulito(valore) {
  if (valore === null || valore === undefined || valore === '') return { usi_massimi: null }
  const n = Number(valore)
  if (!Number.isInteger(n) || n < 1 || n > USI_MASSIMI) return { errore: `Usi da 1 a ${USI_MASSIMI}, o vuoto per nessun limite.` }
  return { usi_massimi: n }
}

// Prendere lo sconto è un uso nuovo per questo cliente?
const usoNuovo = (cliente, codice) => cliente?.sconto?.codice !== codice

const prenotazioniValide = (doc, adesso, tranne = null) =>
  Object.entries(doc?.prenotazioni || {}).filter(([uid, p]) => uid !== tranne && Date.parse(p?.scade_il) > adesso.getTime()).length

// Gli usi presi, più quelli tenuti da parte da un Checkout in corso. `uid`:
// la prenotazione del titolare stesso non gli toglie il suo uso.
function usiOccupati(doc, adesso = new Date(), uid = null) {
  return (Number(doc?.usi) || 0) + prenotazioniValide(doc, adesso, uid)
}

function esaurito(doc, adesso = new Date(), uid = null) {
  return doc?.usi_massimi != null && usiOccupati(doc, adesso, uid) >= doc.usi_massimi
}

// Tiene da parte un uso per il Checkout di `uid`, che scade a
// `scadenzaSessione` (Date). → { esito: 'prenotato' | 'esaurito', prenotazioni }.
// Una seconda sessione dello stesso titolare rinnova la sua prenotazione.
// Le prenotazioni scadute si tolgono qui: il documento resta piccolo.
function prenotaUso(doc, uid, scadenzaSessione, adesso = new Date()) {
  const prenotazioni = Object.fromEntries(Object.entries(doc?.prenotazioni || {}).filter(([, p]) => Date.parse(p?.scade_il) > adesso.getTime()))
  if (esaurito(doc, adesso, uid)) return { esito: 'esaurito', prenotazioni }
  prenotazioni[uid] = { scade_il: new Date(scadenzaSessione.getTime() + MARGINE_MS).toISOString(), il: adesso.toISOString() }
  return { esito: 'prenotato', prenotazioni }
}

// Un uso confermato (pagamento, codice al 100%, applicato dall'admin): il
// contatore sale e la prenotazione, se c'era, non serve più. Si conta
// anche oltre il limite: chi ha pagato con lo sconto lo ha avuto.
function usoConfermato(doc, uid) {
  const prenotazioni = { ...(doc?.prenotazioni || {}) }
  delete prenotazioni[uid]
  return { usi: (Number(doc?.usi) || 0) + 1, prenotazioni }
}

// La prenotazione liberata: la sessione di Checkout non è nata.
function prenotazioneTolta(doc, uid) {
  const prenotazioni = { ...(doc?.prenotazioni || {}) }
  delete prenotazioni[uid]
  return { prenotazioni }
}

// La fine di uno sconto a tempo: tanti mesi dal giorno in cui si applica.
function fineSconto(dal, mesi) {
  if (mesi == null) return null
  const d = new Date(dal)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

// La patch del cliente quando l'admin gli applica un codice, o { errore }.
// `uso`: è un uso nuovo del codice, da contare. Un codice esaurito non si
// applica nemmeno dall'admin: se serve, alza il limite.
function scontoApplicato(cliente, sconto, adesso = new Date(), uid = null) {
  if (!sconto?.attivo) return { errore: 'Codice sconosciuto o disattivato.' }
  const uso = usoNuovo(cliente, sconto.codice)
  if (uso && esaurito(sconto, adesso, uid)) return { errore: `${ESAURITO} Per darlo ancora, alza il limite.` }
  const ab = cliente?.abbonamento || {}
  const ora = adesso.toISOString()
  const fino = fineSconto(ora, sconto.durata_mesi)
  const patch = { sconto: { codice: sconto.codice, percentuale: sconto.percentuale, durata_mesi: sconto.durata_mesi, dal: ora, fino } }
  if (sconto.percentuale < 100) return { patch, uso }
  if (ab.origine === 'stripe') return { errore: 'Un abbonamento Stripe si azzera in Stripe: qui solo sconti parziali.' }
  if (ab.origine === 'gratuito') return { errore: 'È un locale Free: prima cambia il piano, poi applica lo sconto.' }
  patch.abbonamento = fino
    ? { ...ab, stato: 'attivo', origine: 'manuale', pagato_fino_al: fino, dal: ab.dal || ora }
    : { ...ab, stato: 'attivo', origine: 'sconto', pagato_fino_al: null, dal: ab.dal || ora }
  return { patch, uso }
}

// Lo sconto tolto. Senza più lo sconto al 100% illimitato l'abbonamento
// torna un piano a mano pagato fino a oggi: da lì la grazia, poi si ferma,
// finché l'admin non registra un pagamento.
function scontoTolto(cliente, adesso = new Date()) {
  const ab = cliente?.abbonamento || {}
  const patch = { sconto: null }
  if (ab.origine === 'sconto') patch.abbonamento = { ...ab, origine: 'manuale', pagato_fino_al: adesso.toISOString().slice(0, 10) }
  return { patch }
}

module.exports = {
  CODICE,
  CODICE_NUOVO,
  REGOLA_CODICE,
  LIMITE_PER_IL_CENTO,
  ESAURITO,
  USI_MASSIMI,
  TENTATIVI_MAX,
  FINESTRA_TENTATIVI_MS,
  TROPPI_TENTATIVI,
  troppiTentativi,
  tentativoFallito,
  scontoPulito,
  limitePulito,
  usoNuovo,
  usiOccupati,
  esaurito,
  prenotaUso,
  usoConfermato,
  prenotazioneTolta,
  fineSconto,
  scontoApplicato,
  scontoTolto,
}

