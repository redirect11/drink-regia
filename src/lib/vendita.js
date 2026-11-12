// ── LA VENDITA, PER IL SITO (REQ-FLOTTA-015) ───────────────────────────
//
// Cosa è in vendita lo decide l'admin (vendita/listino). Il sito nasconde
// quello che non lo è; la regola che conta la rifà il server
// (functions/lib/free.js), perché il browser non è di fiducia. Il Free è
// spento finché l'admin non lo accende; un modulo è in vendita finché
// l'admin non lo spegne.

import { MODULI, PIANI } from './piani.js'

// Le prove (REQ-FLOTTA-016): giorni interi fra 1 e 90; il resto è «niente
// prova». La stessa pulizia di functions/lib/prove.js.
const giorniDiProva = (g) => {
  const n = Math.floor(Number(g) || 0)
  return n >= 1 ? Math.min(n, 90) : 0
}

export function venditaPulita(doc) {
  return {
    free: doc?.free === true,
    // Il Free fuori vendita si mostra «in arrivo» nel confronto, finché
    // l'admin non lo nasconde (REQ-FLOTTA-071).
    nascondi_free: doc?.nascondi_free === true,
    // Spenti finché l'admin non li accende (REQ-FLOTTA-017).
    pagamenti_online: doc?.pagamenti_online === true,
    // Il sito aperto al pubblico (REQ-FLOTTA-043): true, false, o null se
    // l'admin non ha deciso. Cosa vale null lo dice sitoChiuso.
    sito_aperto: doc?.sito_aperto === true ? true : doc?.sito_aperto === false ? false : null,
    moduli: Object.fromEntries(MODULI.map((m) => [m.id, doc?.moduli?.[m.id] !== false])),
    prove: Object.fromEntries(MODULI.map((m) => [m.id, giorniDiProva(doc?.prove?.[m.id])])),
  }
}

// IL SITO CHIUSO (REQ-FLOTTA-043, l'utente, 07/11/2026): finché l'admin non
// apre il sito, in produzione si vede solo la pagina di anteprima; sul
// test, senza una decisione, il sito è aperto. La stessa regola delle
// Functions (functions/lib/free.js), che è quella che conta.
export function sitoChiuso(vendita, produzione) {
  if (vendita?.sito_aperto === false) return true
  return vendita?.sito_aperto !== true && produzione === true
}

export const eGratuito = (id) => PIANI[id]?.gratuito === true

// I piani da mostrare: il Free solo se è in vendita.
export const pianiInVendita = (vendita) => Object.values(PIANI).filter((p) => !p.gratuito || vendita?.free === true)

// Un modulo si mostra se è in vendita, o se il cliente lo ha già.
export const moduloVisibile = (vendita, id, giaSuoi = []) => vendita?.moduli?.[id] !== false || giaSuoi.includes(id)
