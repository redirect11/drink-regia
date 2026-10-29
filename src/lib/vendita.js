// ── LA VENDITA, PER IL SITO (REQ-FLOTTA-015) ───────────────────────────
//
// Cosa è in vendita lo decide l'admin (vendita/listino). Il sito nasconde
// quello che non lo è; la regola che conta la rifà il server
// (functions/lib/free.js), perché il browser non è di fiducia. Il Free è
// spento finché l'admin non lo accende; un modulo è in vendita finché
// l'admin non lo spegne.

import { MODULI, PIANI } from './piani.js'

export function venditaPulita(doc) {
  return {
    free: doc?.free === true,
    moduli: Object.fromEntries(MODULI.map((m) => [m.id, doc?.moduli?.[m.id] !== false])),
  }
}

export const eGratuito = (id) => PIANI[id]?.gratuito === true

// I piani da mostrare: il Free solo se è in vendita.
export const pianiInVendita = (vendita) => Object.values(PIANI).filter((p) => !p.gratuito || vendita?.free === true)

// Un modulo si mostra se è in vendita, o se il cliente lo ha già.
export const moduloVisibile = (vendita, id, giaSuoi = []) => vendita?.moduli?.[id] !== false || giaSuoi.includes(id)
