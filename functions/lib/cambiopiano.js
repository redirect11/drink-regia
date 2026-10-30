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

const MODI = ['stripe', 'fuori']

// La scelta pulita, Free compreso (sceltaPulita è quella di Stripe e del
// Free farebbe un Base).
function sceltaAdmin({ piano, moduli, terminali } = {}) {
  if (eGratuito(piano)) return { piano, moduli: [], terminali: 1 }
  return sceltaPulita({ piano, moduli, terminali })
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
  const abbonamento = eGratuito(scelta.piano)
    ? { stato: 'attivo', origine: 'gratuito', dal: adesso.toISOString() }
    : { stato: 'attivo', origine: 'manuale', dal: adesso.toISOString(), nota: 'fuori da Stripe, dall’admin' }
  return { ok: true, perche: null, scelta, cliente: { ...scelta, abbonamento }, storico }
}

module.exports = { cambioAdmin, sceltaAdmin, MODI }
