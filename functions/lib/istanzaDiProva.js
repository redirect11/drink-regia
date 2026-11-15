'use strict'

// ── L'ISTANZA DI PROVA, LOGICA PURA (REQ-FLOTTA-114) ───────────────────
//
// Daniele, 15/11/2026, su prova-e2e (l'istanza su cui tana-drink fa girare
// gli e2e): «teniamola ma deve rispondere sempre con la versione realmente
// installata. Regia non si caga le anteprime. Quello che possiamo fare è
// disattivare l'istanza e2e alla fine delle prove e nel backoffice la si
// vede come disattivata».
//
// L'admin segna di prova un'istanza senza cliente; le prove e2e la
// accendono all'inizio e la spengono alla fine (Function `istanzaDiProva`).
// È uno stato della regia, per il backoffice e la sentinella: spenta non
// cambia la licenza né la presentazione, che durante le prove servono.

// Il corpo: { attiva } con un vero sì o no.
function corpoProva(body) {
  return typeof body?.attiva === 'boolean' ? { attiva: body.attiva } : null
}

function registroProva(attiva, adesso = new Date()) {
  return { prova: { attiva, il: adesso.toISOString() } }
}

// Solo un'istanza che l'admin ha segnato di prova, senza cliente: un locale
// vero non si spegne da qui, anche se qualcuno del suo progetto ci prova.
const SCONOSCIUTA = { ok: false, status: 404, perche: 'Installazione non registrata nella regia.' }
function puoCambiare(ist, cliente) {
  if (!ist || ist.stato === 'eliminata') return SCONOSCIUTA
  if (cliente) return { ok: false, status: 403, perche: 'Ha un cliente: non è un’istanza di prova.' }
  if (!ist.prova) return { ok: false, status: 403, perche: 'Non è un’istanza di prova.' }
  return { ok: true }
}

module.exports = { corpoProva, registroProva, puoCambiare }
