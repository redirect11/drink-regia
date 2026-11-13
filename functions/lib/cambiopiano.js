// ── «CAMBIA PIANO» DELL'ADMIN, LOGICA PURA (REQ-FLOTTA-016) ────────────
//
// Al posto di «Piano a mano», che scriveva solo il piano e segnava
// l'abbonamento pagato senza dirlo. L'admin sceglie piano, moduli e
// terminali, e come si paga:
//   - «stripe»: si aggiorna l'abbonamento Stripe del cliente, con
//     l'addebito proporzionale, come quando lo fa lui dalla dashboard;
//   - «fuori»: bonifico o omaggio, si scrive direttamente e si dice.
// Ogni cambio resta nello storico del cliente, con chi, quando e come.

const listino = require('../piani.json')
const { sceltaPulita } = require('./abbonamento.js')
const { eGratuito } = require('./free.js')
const { dataPagata } = require('./scadenze.js')
const { problemaBasi } = require('./prove.js')

const MODI = ['stripe', 'fuori']

// La scelta pulita, Free compreso (sceltaPulita è quella di Stripe e del
// Free farebbe un Base). Senza intervallo: l'admin cambia piano, moduli e
// terminali, e con Stripe l'intervallo resta quello della subscription
// (index.js, intervalloDi); fuori da Stripe non c'è niente da fatturare.
function sceltaAdmin({ piano, moduli, terminali } = {}) {
  if (eGratuito(piano)) return { piano, moduli: [], terminali: 1 }
  const { intervallo: _ignorato, ...scelta } = sceltaPulita({ piano, moduli, terminali })
  return scelta
}

// Si può fare il cambio, e cosa si scrive? { ok, perche, scelta, cliente, storico }
// `cliente` è la parte da scrivere su clienti/{uid} (solo col modo «fuori»:
// con Stripe il cliente lo aggiorna il webhook).
function cambioAdmin(cliente, richiesta, { da = null, adesso = new Date() } = {}) {
  const no = (perche) => ({ ok: false, perche })
  if (!cliente?.uid) return no('Cliente sconosciuto.')
  if (!listino.piani[richiesta?.piano]) return no('Piano sconosciuto.')
  if (!MODI.includes(richiesta?.modo)) return no('Scegli come si paga: con Stripe o fuori da Stripe.')
  const scelta = sceltaAdmin(richiesta)
  // Un modulo senza la sua base non si scrive nemmeno dall'admin
  // (tana-drink REQ-LIC-015): la licenza accenderebbe gli ordini senza il menù.
  const basi = problemaBasi(scelta)
  if (basi) return no(basi)
  const sub = cliente.abbonamento?.stripe_subscription
  const storico = { il: adesso.toISOString(), da, modo: richiesta.modo, piano: scelta.piano, moduli: scelta.moduli, terminali: scelta.terminali }
  if (richiesta.modo === 'stripe') {
    if (!sub) return no('Il cliente non ha un abbonamento Stripe: usa «fuori da Stripe».')
    if (eGratuito(scelta.piano)) return no('Il Free non passa da Stripe: usa «fuori da Stripe», dopo aver disdetto l’abbonamento.')
    return { ok: true, perche: null, scelta, cliente: null, storico }
  }
  // Fuori da Stripe con un abbonamento Stripe attivo: Stripe continuerebbe
  // ad addebitare il piano vecchio mentre la regia ne mostra un altro.
  if (sub && cliente.abbonamento?.stato !== 'disdetto') return no('Il cliente ha un abbonamento Stripe: cambia con Stripe, oppure disdicilo prima.')
  // «Pagato fino al» (REQ-FLOTTA-023): la sua scadenza ha un compito alla
  // data. Vuoto: senza scadenza, come un omaggio.
  const pagato = dataPagata(richiesta.pagato_fino_al)
  if (pagato === undefined) return no('La data «pagato fino al» non è valida: AAAA-MM-GG.')
  const abbonamento = eGratuito(scelta.piano)
    ? { stato: 'attivo', origine: 'gratuito', dal: adesso.toISOString() }
    : { stato: 'attivo', origine: 'manuale', dal: adesso.toISOString(), nota: 'fuori da Stripe, dall’admin', pagato_fino_al: pagato }
  return { ok: true, perche: null, scelta, cliente: { ...scelta, abbonamento }, storico }
}

// ── IL CAMBIO DEL TITOLARE SU UN ABBONAMENTO A MANO (REQ-FLOTTA-046) ───
//
// Audit del 09/11/2026, finding 5 (era la M2 del 22/10): con l'abbonamento
// gestito a mano (bonifico, piano scritto dall'admin, codice al 100% poi
// pagato) `cambiaScelta` scriveva subito piano, moduli e terminali, e la
// licenza seguiva: un titolare si accendeva il Completo con tutti i moduli
// e venti terminali senza pagare niente. Ora dalla dashboard si scrive
// subito solo una RIDUZIONE: piano uguale o più economico, nessuna
// funzione in più fra quelle che la licenza accende (i moduli compresi nel
// piano più quelli comprati), terminali non di più. Tutto il resto diventa
// una richiesta di contatto, come i moduli chiesti dall'app su un piano a
// mano (moduliapp.js): l'admin la vede fra le richieste, concorda il
// pagamento e accende con «Cambia piano» fuori da Stripe. Stesso documento
// contatti/<uid> della richiesta della dashboard coi pagamenti spenti: una
// aperta per cliente, una nuova prende il posto di quella.

const prezzoPiano = (id) => Number(listino.piani[id]?.prezzo) || 0
// Le funzioni che la licenza accende per un piano con quei moduli.
const funzioniAccese = (piano, moduli) => new Set([...(listino.piani[piano]?.include || []), ...(moduli || [])])

// La scelta nuova toglie soltanto? Quello che costa (piano, terminali) non
// cresce e nessuna funzione si accende che prima era spenta. La scelta
// identica è una riduzione vuota: si scrive e non cambia niente.
function eRiduzione(cliente, scelta) {
  if (prezzoPiano(scelta.piano) > prezzoPiano(cliente?.piano)) return false
  if ((Number(scelta.terminali) || 1) > (Number(cliente?.terminali) || 1)) return false
  const prima = funzioniAccese(cliente?.piano, cliente?.moduli)
  return [...funzioniAccese(scelta.piano, scelta.moduli)].every((f) => prima.has(f))
}

// → { via: 'manuale', patch } da scrivere subito su clienti/{uid}, oppure
// { via: 'richiesta', documento } da scrivere in contatti/{uid}. La scelta
// è pulita come la puliva metadatiDi (sceltaPulita: il Free diventa Base,
// come prima); l'intervallo non c'è, perché fuori da Stripe non si fattura.
function decisioneManuale(cliente, richiesta, { adesso = new Date() } = {}) {
  const { intervallo: _ignorato, ...scelta } = sceltaPulita(richiesta)
  if (eRiduzione(cliente, scelta)) return { via: 'manuale', patch: scelta }
  return {
    via: 'richiesta',
    documento: {
      uid: cliente?.uid || null,
      email: cliente?.email || null,
      nome_locale: cliente?.nome_locale || null,
      slug: cliente?.slug || null,
      scelta,
      telefono: null,
      nota: 'Dalla dashboard: cambio di piano su un abbonamento gestito a mano, da concordare prima di accenderlo.',
      codice: null,
      dalla_dashboard: { piano: cliente?.piano || null, moduli: cliente?.moduli || [], terminali: Number(cliente?.terminali) || 1 },
      stato: 'aperta',
      chiesta_il: adesso.toISOString(),
    },
  }
}

module.exports = { cambioAdmin, sceltaAdmin, MODI, eRiduzione, decisioneManuale }
