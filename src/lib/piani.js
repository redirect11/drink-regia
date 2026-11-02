// ── I PIANI E I PREZZI (REQ-FLOTTA-002) ───────────────────────────────
//
// I numeri stanno in functions/piani.json, letto anche dalle Functions
// (abbonamento.js): un posto solo, DA CONFERMARE con l'utente prima di
// pubblicare. Il piano base è la porta d'ingresso; il margine sta nei
// moduli, che sono le stesse funzioni premium della licenza
// (src/lib/licenza.js nell'app): quello che si compra qui è quello che
// l'istanza accende.

import listino from '../../functions/piani.json'

export const MODULI = listino.moduli
export const PIANI = listino.piani
export const TERMINALE_IN_PIU = listino.terminale_in_piu
export const ATTIVAZIONE = listino.attivazione
export const IVA = listino.iva
export const FONDATORI = listino.fondatori
export const ANNUALE = listino.annuale
// La prova si dice a schermo solo se il Checkout la fa davvero
// (piani.json → prova_nel_checkout, spenta finché Daniele non decide se
// l'attivazione si paga all'inizio o alla fine della prova): la pagina non
// promette quello che Stripe non applica.
export const PROVA_GIORNI = listino.prova_nel_checkout === true ? listino.prova_giorni : 0
export const ASSISTENZA = listino.assistenza
// Le stampanti fuori da quelle supportate: a preventivo (DEC-0005). La
// pagina dei prezzi e i termini lo dicono solo se il listino lo prevede.
export const STAMPANTE = listino.stampante

// Al centesimo: i prezzi hanno i decimali (32,70 €) e le somme in virgola
// mobile lasciano code (32.7 + 12 = 44.699999…).
const alCentesimo = (n) => Math.round((Number(n) || 0) * 100) / 100

// Il prezzo IVA inclusa, accanto all'imponibile: la vendita è B2B e il
// listino è IVA esclusa, ma il titolare guarda anche il totale (DEC-0005).
export const conIva = (n) => alCentesimo(n * (1 + IVA / 100))

// Il prezzo di un anno pagato in anticipo: 'mensilita' mesi del mensile.
export const prezzoAnnuale = (mensile) => alCentesimo(mensile * ANNUALE.mensilita)

// Il prezzo Fondatori di un piano, o null se l'offerta non lo copre.
export const prezzoFondatori = (piano) => FONDATORI.prezzi[piano] ?? null

// Quanto costa al mese una scelta: piano, moduli in più, terminali in più.
//   { piano: 'base'|'completo', moduli: ['magazzino', …], terminali: 1 }
export function prezzoMensile({ piano = 'base', moduli = [], terminali = 1 } = {}) {
  const p = PIANI[piano] || PIANI.base
  const inclusi = new Set(p.include)
  const extra = MODULI.filter((m) => moduli.includes(m.id) && !inclusi.has(m.id))
  const terminaliInclusi = p.terminali || 1
  const terminaliExtra = Math.max(0, (Number(terminali) || 1) - terminaliInclusi)
  return alCentesimo(p.prezzo + extra.reduce((s, m) => s + m.prezzo, 0) + terminaliExtra * TERMINALE_IN_PIU)
}

// I moduli che un'istanza deve accendere per una scelta: è quello che la
// licenza scrive (REQ-FLOTTA-007).
export function moduliDellaScelta({ piano = 'base', moduli = [] } = {}) {
  const p = PIANI[piano] || PIANI.base
  return [...new Set([...p.include, ...moduli.filter((id) => MODULI.some((m) => m.id === id))])]
}

// Il punto delle migliaia e la virgola dei decimali a mano: in CI il Node
// della macchina non ha i dati di lingua italiani e toLocaleString scriveva
// «1250». I centesimi si scrivono solo se ci sono: 82 €, 32,70 €.
export const euro = (n) => {
  const v = alCentesimo(n)
  const intero = String(Math.trunc(Math.abs(v))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const cent = Math.round(Math.abs(v) * 100) % 100
  return `${v < 0 ? '-' : ''}${intero}${cent ? ',' + String(cent).padStart(2, '0') : ''} €`
}
