'use strict'

// ── IL CODICE SCONTO ALL'ACQUISTO, LOGICA PURA (REQ-FLOTTA-028) ────────
//
// L'utente, 02/11/2026: «gli acquisti possono avere anche i codici sconto
// mi raccomando», e alle tre domande dello stesso giorno:
// - chi lo inserisce: «tutti e due» — il titolare nella scelta del piano,
//   e l'admin dal backoffice come prima (clienti/{uid}.sconto);
// - col prezzo Fondatori: «il più conveniente» — Stripe accetta un solo
//   sconto per acquisto, e vale quello che fa pagare meno;
// - un codice al 100%: «senza passare da Stripe» — il piano si attiva
//   subito con lo sconto, e l'attivazione passa dall'admin come le altre.
// Prima il Checkout ignorava i codici: chi aveva il 20% pagava il listino.
// Qui le decisioni; index.js legge, scrive e parla con Stripe.

const listino = require('../piani.json')
const { sceltaPulita, righeCheckout, centesimi } = require('./abbonamento.js')
const fondatori = require('./fondatori.js')
const { fineSconto, usoNuovo, esaurito, ESAURITO } = require('./sconti.js')

// Il confronto col prezzo Fondatori si fa sul primo anno, attivazione
// compresa: è l'orizzonte dell'offerta (12 mesi), e un codice illimitato
// non vince per forza solo perché dura di più.
const MESI_CONFRONTO = 12

// I mesi che restano a uno sconto che finisce `fino` (AAAA-MM-GG o ISO),
// almeno 1; null se non finisce. Mesi di calendario, come li conta
// fineSconto: uno sconto di 3 mesi dal 2 novembre finisce il 2 febbraio, e
// sono 3 mesi, non i 92 giorni divisi per un mese medio (che farebbero 4).
// Un mese cominciato conta intero.
function mesiRestanti(fino, adesso = new Date()) {
  if (!fino) return null
  const f = new Date(fino)
  const mesi = (f.getUTCFullYear() - adesso.getUTCFullYear()) * 12 + (f.getUTCMonth() - adesso.getUTCMonth()) + (f.getUTCDate() > adesso.getUTCDate() ? 1 : 0)
  return Math.max(1, mesi)
}

// Lo sconto di un codice del registro (sconti/{CODICE}) usato oggi da chi
// compra: parte adesso. null se il codice non c'è o è disattivato.
function scontoDelCodice(codice, adesso = new Date()) {
  if (!codice?.attivo) return null
  const ora = adesso.toISOString()
  return { codice: codice.codice, percentuale: codice.percentuale, durata_mesi: codice.durata_mesi ?? null, dal: ora, fino: fineSconto(ora, codice.durata_mesi) }
}

// Lo sconto che l'admin ha già dato al cliente, se è ancora in corso.
// Resta suo anche se il codice nel frattempo è stato disattivato: chi lo
// ha già lo tiene (REQ-FLOTTA-028).
function scontoInCorso(cliente, adesso = new Date()) {
  const s = cliente?.sconto
  if (!s?.codice || !(Number(s.percentuale) >= 1)) return null
  if (s.fino && !(Date.parse(s.fino) > adesso.getTime())) return null
  return { codice: s.codice, percentuale: Number(s.percentuale), durata_mesi: s.durata_mesi ?? null, dal: s.dal || null, fino: s.fino || null }
}

// Il coupon di Stripe per uno sconto, o { errore }. In percentuale, su
// tutto quello che Stripe addebita (canone, moduli, terminali e, nella
// prima fattura, l'attivazione), come un codice al 100% non fa pagare
// niente. L'id dice percentuale e durata: un coupon trovato è quello giusto.
// COL PAGAMENTO ANNUALE la durata in mesi di Stripe conta le fatture create
// in quel tempo: un codice di 13 mesi coprirebbe due anni interi. Quindi:
// meno di un anno non vale (lo sconto dell'anno sarebbe più lungo del
// codice), da uno a due anni copre la prima fattura, oltre si conta per
// anni interi, e la finestra si chiude un mese prima della fattura che non
// deve coprire.
function couponSconto(s, { intervallo = 'mese', adesso = new Date() } = {}) {
  const mesi = s.fino ? mesiRestanti(s.fino, adesso) : null
  let durata
  if (mesi === null) durata = { duration: 'forever' }
  else if (intervallo !== 'anno') durata = { duration: 'repeating', duration_in_months: mesi }
  else if (mesi < 12) return { errore: 'Questo codice dura meno di un anno: vale col pagamento mensile.' }
  else if (mesi < 24) durata = { duration: 'once' }
  else durata = { duration: 'repeating', duration_in_months: Math.floor(mesi / 12) * 12 - 1 }
  const quanto = durata.duration === 'repeating' ? `${durata.duration_in_months}m` : durata.duration
  return {
    coupon: {
      id: `sconto-${s.codice}-${s.percentuale}-${intervallo}-${quanto}`,
      percent_off: s.percentuale,
      ...durata,
      // Stripe tiene i nomi entro 40 caratteri.
      name: `Codice ${s.codice}: ${s.percentuale}%`.slice(0, 40),
      metadata: { sconto: s.codice },
    },
  }
}

const totaleDelPeriodo = (scelta) => righeCheckout(scelta).reduce((t, r) => t + r.price_data.unit_amount * r.quantity, 0)

// Quanto fa risparmiare uno sconto nel primo anno, in centesimi.
function risparmioCodice(scelta, s, adesso = new Date()) {
  const sc = sceltaPulita(scelta)
  const mesi = s.fino ? mesiRestanti(s.fino, adesso) : null
  const fatture = sc.intervallo === 'anno' ? 1 : Math.min(mesi ?? MESI_CONFRONTO, MESI_CONFRONTO)
  return Math.round(((totaleDelPeriodo(sc) * fatture + centesimi(listino.attivazione)) * s.percentuale) / 100)
}

function risparmioFondatori(scelta) {
  const sc = sceltaPulita(scelta)
  const c = fondatori.couponFondatori(sc.piano, sc.intervallo)
  if (!c) return 0
  const volte = sc.intervallo === 'anno' ? 1 : Math.min(fondatori.MESI, MESI_CONFRONTO)
  const attivazione = centesimi(listino.attivazione) - centesimi(listino.fondatori?.attivazione ?? listino.attivazione)
  return c.amount_off * volte + Math.max(0, attivazione)
}

// Quale sconto vale per questo acquisto: 'codice', 'fondatori' o null.
// `fondatore`: il cliente avrebbe un posto Fondatori (piano coperto, posti
// liberi, mai stato Fondatore). A parità vince il codice: è quello che il
// cliente ha scritto.
function scontoCheVale({ scelta, sconto = null, fondatore = false, adesso = new Date() }) {
  const fond = fondatore && risparmioFondatori(scelta) > 0
  if (!sconto) return fond ? 'fondatori' : null
  if (!fond) return 'codice'
  return risparmioCodice(scelta, sconto, adesso) >= risparmioFondatori(scelta) ? 'codice' : 'fondatori'
}

// I metadati dello sconto sulla sessione di Checkout: il webhook li
// riporta sul cliente (aggiornamentoDaEvento). `uso`: il pagamento consuma
// un uso del codice, e il webhook lo conta (usoDaContare).
function metadatiSconto(s, { uso = false } = {}) {
  return {
    sconto: s.codice,
    sconto_percentuale: String(s.percentuale),
    sconto_mesi: s.durata_mesi == null ? '' : String(s.durata_mesi),
    sconto_dal: s.dal || '',
    sconto_fino: s.fino || '',
    ...(uso ? { sconto_uso: '1' } : {}),
  }
}

// Un Checkout pagato con un codice che ne consuma un uso: il contatore del
// codice sale. → { codice, uid } o null.
function usoDaContare(tipo, oggetto) {
  if (tipo !== 'checkout.session.completed') return null
  const md = oggetto?.metadata || {}
  return md.sconto_uso === '1' && md.sconto && md.uid && md.tipo !== 'ricarica_ai' ? { codice: md.sconto, uid: md.uid } : null
}

// UN CODICE AL 100% DAL TITOLARE: il piano scelto si attiva senza Stripe.
// → { patch, uso } per clienti/{uid}, o { errore }; `uso`: un uso nuovo
// del codice, da contare (sconti.usoConfermato). `vendita` è quella di
// free.venditaPulita; `fuori` i moduli non più in vendita della scelta.
// Come per lo sconto dato dall'admin: illimitato è un abbonamento attivo
// che non si paga (origine «sconto»); a tempo è un piano a mano pagato
// fino alla fine dello sconto (origine «manuale»), poi grazia e promemoria.
// Un Free può: sceglie qui il suo piano a pagamento. Un abbonamento Stripe
// attivo no: si azzererebbe una subscription che continua ad addebitare.
function attivazioneConCodice({ cliente, uid = null, istanza = null, codice, scelta, fuori = [], adesso = new Date() }) {
  if (!cliente?.slug) return { errore: 'Nessun locale registrato per questo account.' }
  const s = scontoDelCodice(codice, adesso)
  if (!s) return { errore: 'Codice sconosciuto o disattivato.' }
  if (s.percentuale !== 100) return { errore: 'Questo codice è uno sconto sul prezzo: vale al pagamento.' }
  const uso = usoNuovo(cliente, s.codice)
  if (uso && esaurito(codice, adesso, uid)) return { errore: ESAURITO }
  const ab = cliente.abbonamento || {}
  if (ab.stato === 'attivo' && ab.origine === 'stripe') return { errore: 'Hai già un abbonamento con pagamento online: per il codice scrivici.' }
  if (istanza?.stato === 'eliminata') return { errore: 'Il locale è stato eliminato: per riaprirlo scrivici.' }
  if (fuori.length) return { errore: `Non più in vendita: ${fuori.join(', ')}.` }
  const sc = sceltaPulita(scelta)
  const ora = adesso.toISOString()
  // Il resto dell'abbonamento (il customer di Stripe, i Fondatori) resta.
  const abbonamento = s.fino
    ? { ...ab, stato: 'attivo', origine: 'manuale', pagato_fino_al: s.fino, intervallo: 'mese', dal: ab.dal || ora }
    : { ...ab, stato: 'attivo', origine: 'sconto', pagato_fino_al: null, intervallo: 'mese', dal: ab.dal || ora }
  return { patch: { piano: sc.piano, moduli: sc.moduli, terminali: sc.terminali, sconto: { codice: s.codice, percentuale: s.percentuale, durata_mesi: s.durata_mesi, dal: s.dal, fino: s.fino }, abbonamento }, uso }
}

module.exports = { MESI_CONFRONTO, mesiRestanti, scontoDelCodice, scontoInCorso, couponSconto, risparmioCodice, risparmioFondatori, scontoCheVale, metadatiSconto, usoDaContare, attivazioneConCodice }

