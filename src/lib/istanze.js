// ── LO STATO DI UN'ISTANZA (REQ-FLOTTA-004, REQ-FLOTTA-006) ───────────
//
// L'istanza di un cliente passa per pochi stati, e la dashboard li dice
// con parole piane. Chi li scrive: la Function `chiediAttivazione` (`in
// coda` o `da approvare`, col tasto Attiva), il provisioning (`in corso`,
// `attiva`, `errore`), l'admin.

import { DOMINIO_ISTANZE, PREFISSO_PROGETTI } from './prodotto.js'

export const STATI = {
  DA_ATTIVARE: 'da attivare',
  DA_APPROVARE: 'da approvare',
  IN_CODA: 'in coda',
  IN_CORSO: 'in corso',
  ATTIVA: 'attiva',
  ERRORE: 'errore',
  // Eliminata col suo progetto, dopo il backup (REQ-FLOTTA-014).
  ELIMINATA: 'eliminata',
}

const DETTO = {
  [STATI.DA_ATTIVARE]: 'Non ancora attivata',
  [STATI.DA_APPROVARE]: 'In attesa di autorizzazione: ti avvisiamo quando parte',
  [STATI.IN_CODA]: 'In coda: l’attivazione parte a breve',
  [STATI.IN_CORSO]: 'Attivazione in corso (qualche minuto)',
  [STATI.ATTIVA]: 'Attiva',
  [STATI.ERRORE]: 'Attivazione fallita: ci stiamo guardando',
  [STATI.ELIMINATA]: 'Eliminata',
}

export const statoDetto = (stato) => DETTO[stato] || DETTO[STATI.DA_ATTIVARE]

// L'istanza come la vede il titolare, da quello che c'è: niente documento
// → da attivare.
export function statoIstanza(istanza, richiesta) {
  if (istanza?.stato) return istanza.stato
  if (richiesta?.stato) return richiesta.stato
  return STATI.DA_ATTIVARE
}

// Il progetto e l'indirizzo che l'istanza avrà.
export const progettoDi = (slug) => `${PREFISSO_PROGETTI}-${slug}`
export const urlDi = (slug) => `https://${slug}.${DOMINIO_ISTANZE}`

// Si può chiedere l'attivazione? Serve un abbonamento valido (o un piano
// segnato pagato a mano dall'admin, finché Stripe non c'è) e nessuna
// attivazione già in viaggio. Questo decide solo se il tasto è acceso: la
// regola che conta la rifà il server (functions/lib/provisioning.js,
// preparaRichiesta), perché il browser non è di fiducia (audit C2).
export function puoAttivare(cliente, istanza, richiesta, { emailVerificata = true } = {}) {
  const stato = statoIstanza(istanza, richiesta)
  if (stato !== STATI.DA_ATTIVARE && stato !== STATI.ERRORE) return { ok: false, perche: statoDetto(stato) }
  if (!emailVerificata) return { ok: false, perche: 'Prima conferma l’email: trovi il messaggio nella casella con cui ti sei registrato.' }
  if (!cliente?.piano) return { ok: false, perche: 'Serve un piano: scegline uno e completa l’abbonamento.' }
  if (cliente?.abbonamento?.stato && cliente.abbonamento.stato !== 'attivo') {
    return { ok: false, perche: 'L’abbonamento non risulta attivo.' }
  }
  return { ok: true, perche: null }
}
