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
// illimitato), descrizione, attivo }. Applicato a un cliente diventa
// clienti/{uid}.sconto = { codice, percentuale, durata_mesi, dal, fino }.
// - Uno sconto al 100% è un abbonamento attivo che non si paga: illimitato
//   non scade mai (origine «sconto»); a tempo è un piano a mano pagato
//   fino alla fine dello sconto (origine «manuale», «pagato fino al»), e da
//   lì valgono la grazia, i promemoria e la sospensione di sempre.
// - Uno sconto parziale cambia solo il prezzo: il pagamento resta com'era.
// Con Stripe, per ora, si applica solo uno sconto parziale: un 100% vorrebbe
// dire smettere di far pagare una subscription, e quello va fatto in Stripe.

const CODICE = /^[A-Z0-9][A-Z0-9-]{2,23}$/

// Un codice pulito, o { errore }.
function scontoPulito(dati) {
  const codice = String(dati?.codice || '').trim().toUpperCase()
  if (!CODICE.test(codice)) return { errore: 'Codice non valido: lettere, cifre e trattini, da 3 a 24.' }
  const percentuale = Number(dati?.percentuale)
  if (!Number.isInteger(percentuale) || percentuale < 1 || percentuale > 100) return { errore: 'Percentuale da 1 a 100.' }
  const mesi = dati?.durata_mesi
  const durata_mesi = mesi === null || mesi === undefined || mesi === '' ? null : Number(mesi)
  if (durata_mesi !== null && (!Number.isInteger(durata_mesi) || durata_mesi < 1 || durata_mesi > 120)) return { errore: 'Durata da 1 a 120 mesi, o vuota per illimitata.' }
  return { codice, percentuale, durata_mesi, descrizione: String(dati?.descrizione || '').trim().slice(0, 120), attivo: true }
}

// La fine di uno sconto a tempo: tanti mesi dal giorno in cui si applica.
function fineSconto(dal, mesi) {
  if (mesi == null) return null
  const d = new Date(dal)
  d.setUTCMonth(d.getUTCMonth() + mesi)
  return d.toISOString().slice(0, 10)
}

// La patch del cliente quando l'admin gli applica un codice, o { errore }.
function scontoApplicato(cliente, sconto, adesso = new Date()) {
  if (!sconto?.attivo) return { errore: 'Codice sconosciuto o disattivato.' }
  const ab = cliente?.abbonamento || {}
  const ora = adesso.toISOString()
  const fino = fineSconto(ora, sconto.durata_mesi)
  const patch = { sconto: { codice: sconto.codice, percentuale: sconto.percentuale, durata_mesi: sconto.durata_mesi, dal: ora, fino } }
  if (sconto.percentuale < 100) return { patch }
  if (ab.origine === 'stripe') return { errore: 'Un abbonamento Stripe si azzera in Stripe: qui solo sconti parziali.' }
  if (ab.origine === 'gratuito') return { errore: 'È un locale Free: prima cambia il piano, poi applica lo sconto.' }
  patch.abbonamento = fino
    ? { ...ab, stato: 'attivo', origine: 'manuale', pagato_fino_al: fino, dal: ab.dal || ora }
    : { ...ab, stato: 'attivo', origine: 'sconto', pagato_fino_al: null, dal: ab.dal || ora }
  return { patch }
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

module.exports = { CODICE, scontoPulito, fineSconto, scontoApplicato, scontoTolto }
