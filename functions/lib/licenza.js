// ── LA LICENZA DI UN'ISTANZA DAL PIANO, LOGICA PURA (REQ-FLOTTA-010) ───
//
// Il piano e i moduli comprati nella regia (piani.json) diventano le
// funzioni premium dell'app (src/lib/licenza.js in tana-drink: conta,
// fatture, scadenzario). La prima volta la scrive il workflow
// dell'attivazione (scripts/licenza-istanza.mjs, con licenzaIniziale);
// poi la riscrivono le Functions quando il piano cambia.

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

// { conta: true, fatture: false, … } per una scelta. Il Free non accende
// nessun modulo, qualunque cosa porti la scelta (REQ-FLOTTA-015).
function moduliLicenza({ piano = 'base', moduli = [] } = {}) {
  const p = listino.piani[piano] ? piano : 'base'
  const accesi = p === 'completo' ? TUTTI : listino.piani[p].gratuito ? [] : [...new Set((moduli || []).flatMap((m) => MAPPA[m] || []))]
  return Object.fromEntries(TUTTI.map((m) => [m, accesi.includes(m)]))
}

// I limiti del piano per l'app (REQ-FLOTTA-015): il Free li porta, gli
// altri piani scrivono null, cioè nessun limite. Contratto con tana-drink
// (handover §7): senza limiti scritti l'app non ne applica nessuno.
const limitiLicenza = (piano) => listino.piani[piano]?.limiti || null

// La patch per settings/bar dell'istanza quando il piano cambia.
function patchLicenzaPiano(scelta, adesso = new Date()) {
  const p = listino.piani[scelta?.piano] ? scelta.piano : 'base'
  return {
    'licenza.piano': p,
    'licenza.moduli': moduliLicenza({ piano: p, moduli: scelta?.moduli }),
    'licenza.terminali': Math.max(1, Number(scelta?.terminali) || 1),
    'licenza.limiti': limitiLicenza(p),
    'licenza.scritta_il': adesso.toISOString(),
  }
}

// La prima licenza di un'istanza, dopo il deploy dell'attivazione o di un
// aggiornamento: cosa scrivere in settings/bar dato quello che c'è già.
// Lo stato (attiva, sospesa, chiusa: REQ-FLOTTA-008) non si tocca se la
// regia l'ha già scritto: una riattivazione passa da lì, non da un deploy.
// Il nome del locale si scrive solo se manca: lo cambia il locale.
function licenzaIniziale(attuale, { piano = 'base', moduli = [], slug, nome, regiaUrl }, adesso = new Date()) {
  const p = listino.piani[piano] ? piano : 'base'
  const nomeLocale = String(nome || slug)
  const patch = {
    licenza: {
      ...(attuale?.licenza || {}),
      piano: p,
      moduli: moduliLicenza({ piano: p, moduli }),
      limiti: limitiLicenza(p),
      stato: attuale?.licenza?.stato || 'attiva',
      slug,
      regia_url: regiaUrl,
      scritta_il: adesso.toISOString(),
    },
  }
  if (!attuale?.venue_name) patch.venue_name = nomeLocale
  if (!attuale?.venue_short_name) patch.venue_short_name = nomeLocale.length > 12 ? nomeLocale.split(/\s+/)[0] : nomeLocale
  return patch
}

// È cambiato qualcosa che la licenza deve sapere?
function sceltaCambiata(prima, dopo) {
  const chiave = (c) => JSON.stringify([c?.piano || null, [...(c?.moduli || [])].sort(), Number(c?.terminali) || 1])
  return chiave(prima) !== chiave(dopo)
}

module.exports = { moduliLicenza, patchLicenzaPiano, licenzaIniziale, sceltaCambiata, TUTTI }
