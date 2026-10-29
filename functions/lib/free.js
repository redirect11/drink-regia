// ── IL PIANO FREE E LA VENDITA, LOGICA PURA (REQ-FLOTTA-015) ───────────
//
// Decisioni dell'utente del 30/10/2026. Il Free è un piano vero del
// listino (piani.json → piani.free): 0 €, un terminale, nessun modulo, e
// dei LIMITI che la licenza porta all'app (10 prodotti nel menù, 5 conti
// aperti insieme, niente sconti, storico di 7 giorni, il marchio). Le
// limitazioni sono fatte perché, provata l'app completa, comprare sia
// quasi necessario. Un locale Free nasce col PROFILO LEGGERO: niente
// Functions, niente Storage, niente segreti, che sono quello che costa
// anche da fermo; quando compra passa al profilo completo.
//
// LA VENDITA la decide l'admin dal backoffice (vendita/listino): il Free
// si vende o no, ogni modulo si vende o no. Spegnere la vendita chiude
// solo la porta d'ingresso: chi c'è già continua a lavorare. Il Free parte
// SPENTO, finché l'app (tana-drink) non fa rispettare i limiti.

const listino = require('../piani.json')
const { provePulite } = require('./prove.js')

const piano = (id) => listino.piani[id] || null
const eGratuito = (id) => piano(id)?.gratuito === true
const profiloDi = (id) => piano(id)?.profilo || 'completo'
const limitiDi = (id) => piano(id)?.limiti || null

// Il documento vendita/listino come lo vede la regia: il Free è spento
// finché l'admin non lo accende; un modulo è in vendita finché l'admin non
// lo spegne; un modulo si prova solo se l'admin gli ha dato dei giorni
// (REQ-FLOTTA-016).
function venditaPulita(doc) {
  return {
    free: doc?.free === true,
    moduli: Object.fromEntries(listino.moduli.map((m) => [m.id, doc?.moduli?.[m.id] !== false])),
    prove: provePulite(doc),
  }
}

// Il titolare può passare al Free? { ok, perche }
function puoScegliereFree(cliente, istanza, vendita) {
  if (!vendita?.free) return { ok: false, perche: 'Il piano Free al momento non è disponibile.' }
  if (!cliente?.slug) return { ok: false, perche: 'Nessun locale registrato per questo account.' }
  const ab = cliente.abbonamento || {}
  if (ab.stato === 'attivo' && ab.origine === 'gratuito') return { ok: false, perche: 'Il locale è già sul piano Free.' }
  // Il Free è una porta d'ingresso, non un ripiego: chi paga non ci scende.
  if (ab.stato === 'attivo' || ab.stripe_subscription) return { ok: false, perche: 'Il locale ha già un abbonamento: il piano Free è per chi comincia.' }
  if (istanza?.stato === 'eliminata') return { ok: false, perche: 'Il locale è stato eliminato: per riaprirlo scrivici.' }
  return { ok: true, perche: null }
}

// Cosa scrivere sul cliente che sceglie il Free: un abbonamento attivo, a
// costo zero, che non passa da Stripe.
function sceltaFree(adesso = new Date()) {
  return {
    piano: 'free',
    moduli: [],
    terminali: 1,
    abbonamento: { stato: 'attivo', origine: 'gratuito', dal: adesso.toISOString() },
  }
}

// I moduli che una scelta AGGIUNGE e che non sono in vendita: chi li ha già
// li tiene, ma non se ne comprano di nuovi.
function moduliFuoriVendita(prima, scelta, vendita) {
  const giaSuoi = new Set(prima?.moduli || [])
  const inclusi = new Set(piano(scelta?.piano)?.include || [])
  return (scelta?.moduli || []).filter((id) => !giaSuoi.has(id) && !inclusi.has(id) && vendita?.moduli?.[id] === false)
}

// Un locale col profilo leggero che passa a un piano a pagamento va
// aggiornato col profilo completo (Functions, Storage, segreti).
function serveProfiloCompleto(istanza, cliente) {
  return istanza?.stato === 'attiva' && istanza.profilo === 'leggero' && Boolean(cliente?.piano) && !eGratuito(cliente.piano)
}

module.exports = { eGratuito, profiloDi, limitiDi, venditaPulita, puoScegliereFree, sceltaFree, moduliFuoriVendita, serveProfiloCompleto }
