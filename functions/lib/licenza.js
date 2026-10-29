// ── LA LICENZA DI UN'ISTANZA DAL PIANO, LOGICA PURA (REQ-FLOTTA-010) ───
//
// Il piano e i moduli comprati nella regia (piani.json) diventano le
// funzioni premium dell'app (src/lib/licenza.js in tana-drink: conta,
// fatture, scadenzario). La stessa mappa sta in
// tana-drink/scripts/licenza-istanza.mjs, che la scrive alla prima
// attivazione; qui la si riscrive quando il piano cambia.

const listino = require('../piani.json')

// Stessi id nel listino e nell'app (REQ-LIC-002 in tana-drink); il
// magazzino porta con sé i suoi tre moduli di dettaglio.
const MAPPA = {
  menu_tavoli: ['menu_tavoli'],
  ordini_cliente: ['ordini_cliente'],
  clienti: ['clienti'],
  magazzino: ['magazzino', 'conta', 'fatture', 'scadenzario'],
  statistiche: ['statistiche'],
  staff: ['staff'],
  sumup: ['sumup'],
}
const TUTTI = ['menu_tavoli', 'ordini_cliente', 'clienti', 'magazzino', 'conta', 'fatture', 'scadenzario', 'statistiche', 'staff', 'sumup']

// { conta: true, fatture: false, … } per una scelta.
function moduliLicenza({ piano = 'base', moduli = [] } = {}) {
  const p = listino.piani[piano] ? piano : 'base'
  const accesi = p === 'completo' ? TUTTI : [...new Set((moduli || []).flatMap((m) => MAPPA[m] || []))]
  return Object.fromEntries(TUTTI.map((m) => [m, accesi.includes(m)]))
}

// La patch per settings/bar dell'istanza quando il piano cambia.
function patchLicenzaPiano(scelta, adesso = new Date()) {
  const p = listino.piani[scelta?.piano] ? scelta.piano : 'base'
  return {
    'licenza.piano': p,
    'licenza.moduli': moduliLicenza({ piano: p, moduli: scelta?.moduli }),
    'licenza.terminali': Math.max(1, Number(scelta?.terminali) || 1),
    'licenza.scritta_il': adesso.toISOString(),
  }
}

// È cambiato qualcosa che la licenza deve sapere?
function sceltaCambiata(prima, dopo) {
  const chiave = (c) => JSON.stringify([c?.piano || null, [...(c?.moduli || [])].sort(), Number(c?.terminali) || 1])
  return chiave(prima) !== chiave(dopo)
}

module.exports = { moduliLicenza, patchLicenzaPiano, sceltaCambiata, TUTTI }
