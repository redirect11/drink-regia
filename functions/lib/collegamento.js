'use strict'

// ── ISTANZA E TITOLARE SCOLLEGATI, LOGICA PURA (REQ-FLOTTA-086) ────────
//
// Il titolare legge istanze/{slug} e richieste/{slug} solo se il loro `uid`
// è il suo (firestore.rules). Un'app nata prima di M7 (02/11/2026), o un
// account ricreato, lascia sull'istanza un uid che non è più quello del
// titolare: la regia la vede attiva, lui no. Su prova-free la dashboard
// diceva «Non ancora attivata» col tasto «Attiva», con l'app attiva.
//
// Daniele, 13/11/2026: «fai il tasto di collegamento nel backoffice, ma
// deve apparire solo se per qualche motivo istanza e regia risultano
// scollegati». Qui si decide cosa scrive quel tasto (la Function
// collegaIstanza) e cosa la regia dice al titolare della sua app (la
// Function statoMiaApp). index.js legge e scrive; qui niente Firebase.

const uidDi = (doc) => String(doc?.uid || '')

// Un documento legato all'istanza (la richiesta di attivazione, il cassetto
// AI) passa al titolare solo se oggi ha l'uid vecchio o nessuno: è lo
// stesso scollegamento dell'istanza. Già del titolare resta com'è. Con
// l'uid di un terzo, diverso anche dal vecchio, qualcosa non torna e non lo
// si aggiusta alla cieca: ci si ferma.
function allinea(doc, vecchio, nuovo, legataA) {
  if (!doc) return { patch: null }
  const uid = uidDi(doc)
  if (uid === nuovo) return { patch: null }
  if (!uid || uid === vecchio) return { patch: { uid: nuovo } }
  return { errore: `${legataA} un terzo account (${uid}), né al titolare né all’app: non tocco niente, va guardato a mano.` }
}

// Il piano del collegamento, dai documenti letti nella transazione:
//   { ok: false, codice, perche }  — codice è quello di HttpsError
//   { ok: true, vecchio, nuovo, istanza, richiesta, cassetto } — le tre
//     scritture (merge), null dove non si scrive niente.
// Dell'istanza si scrivono solo l'uid e la traccia: chi, quando, l'uid di
// prima (per tornare indietro a mano, se servisse).
function pianoCollegamento({ cliente, istanza, richiesta = null, cassetto = null, da = null, adesso = new Date() }) {
  const no = (codice, perche) => ({ ok: false, codice, perche })
  if (!cliente || !uidDi(cliente)) return no('not-found', 'Nessun cliente con questo identificativo.')
  if (!istanza) return no('not-found', 'Il locale non ha un’istanza da collegare.')
  if (istanza.stato === 'eliminata') return no('failed-precondition', 'L’istanza è eliminata: non c’è niente da collegare.')
  const nuovo = uidDi(cliente)
  const vecchio = uidDi(istanza) || null
  if (vecchio === nuovo) return no('failed-precondition', 'L’app è già collegata al titolare.')
  const r = allinea(richiesta, vecchio, nuovo, 'La richiesta di attivazione è legata a')
  if (r.errore) return no('failed-precondition', r.errore)
  const c = allinea(cassetto, vecchio, nuovo, 'Il credito AI è legato a')
  if (c.errore) return no('failed-precondition', c.errore)
  return {
    ok: true,
    vecchio,
    nuovo,
    istanza: { uid: nuovo, collegamento: { il: adesso.toISOString(), da: da || null, uid_prima: vecchio } },
    richiesta: r.patch,
    cassetto: c.patch,
  }
}

// Cosa dire al titolare della sua app, quando la sua query (istanze dove
// uid == il suo) non la trova. Solo tre parole, e solo per il SUO locale:
//   'nessuna'    non c'è un'app: «Non ancora attivata», col tasto
//   'collegata'  c'è ed è sua (la query la porterà)
//   'scollegata' c'è ed è legata a un altro account: la dashboard lo dice
// Un'istanza senza uid e senza progetto è un lancio fallito prima che il
// progetto nascesse (GitHub che non risponde): non c'è un'app da vedere, e
// il titolare deve poter rilanciare dalla sua richiesta in errore.
function appDelTitolare(uid, istanza) {
  if (!istanza) return 'nessuna'
  if (uid && uidDi(istanza) === uid) return 'collegata'
  if (!uidDi(istanza) && !istanza.progetto) return 'nessuna'
  return 'scollegata'
}

module.exports = { pianoCollegamento, appDelTitolare }
