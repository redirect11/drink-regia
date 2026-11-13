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
  // Solo nella dashboard (REQ-FLOTTA-086): l'app c'è ma è legata a un altro
  // account, o la lettura non va. Non lo scrive nessuno.
  ILLEGGIBILE: 'illeggibile',
}

const DETTO = {
  [STATI.DA_ATTIVARE]: 'Non ancora attivata',
  [STATI.DA_APPROVARE]: 'In attesa di autorizzazione: ti avvisiamo quando parte',
  [STATI.IN_CODA]: 'In coda: l’attivazione parte a breve',
  [STATI.IN_CORSO]: 'Attivazione in corso (qualche minuto)',
  [STATI.ATTIVA]: 'Attiva',
  [STATI.ERRORE]: 'Attivazione fallita: ci stiamo guardando',
  [STATI.ELIMINATA]: 'Eliminata',
  [STATI.ILLEGGIBILE]: 'Non riesco a leggere lo stato della tua app',
}

export const statoDetto = (stato) => DETTO[stato] || DETTO[STATI.DA_ATTIVARE]

// L'istanza come la vede il titolare, da quello che c'è: niente documento
// → da attivare. `illeggibile` (REQ-FLOTTA-086): l'istanza non si vede ma
// la regia dice che c'è, o la lettura è fallita. Allora non si dice «Non
// ancora attivata», che era la bugia di prova-free, e la richiesta da sola
// non basta a dire com'è l'app.
export function statoIstanza(istanza, richiesta, { illeggibile = false } = {}) {
  if (istanza?.stato) return istanza.stato
  if (illeggibile) return STATI.ILLEGGIBILE
  if (richiesta?.stato) return richiesta.stato
  return STATI.DA_ATTIVARE
}

// Per il backoffice (REQ-FLOTTA-086): l'istanza non è legata all'account del
// titolare (un altro uid, o nessuno), e lui nella sua area non la vede. Una
// istanza eliminata non ha più niente da far vedere.
export function istanzaScollegata(cliente, istanza) {
  if (!cliente?.uid || !istanza || istanza.stato === STATI.ELIMINATA) return false
  return (istanza.uid || '') !== cliente.uid
}

// Il progetto e l'indirizzo che l'istanza avrà.
export const progettoDi = (slug) => `${PREFISSO_PROGETTI}-${slug}`
export const urlDi = (slug) => `https://${slug}.${DOMINIO_ISTANZE}`

// Un indirizzo buono per un href: solo https, altrimenti null (niente
// link). `istanza.url` lo scrive il provisioning, ma passa per Firestore e
// per l'esito del workflow (audit del 09/11/2026, finding 28): un valore
// `javascript:` o `data:` non deve diventare un link nella dashboard o nel
// backoffice. Un indirizzo che non si legge come URL vale niente.
export function hrefSicuro(url) {
  if (typeof url !== 'string' || !url) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

// Si può chiedere l'attivazione? Serve un abbonamento valido (o un piano
// segnato pagato a mano dall'admin, finché Stripe non c'è) e nessuna
// attivazione già in viaggio. Questo decide solo se il tasto è acceso: la
// regola che conta la rifà il server (functions/lib/provisioning.js,
// preparaRichiesta), perché il browser non è di fiducia (audit C2).
export function puoAttivare(cliente, istanza, richiesta, { emailVerificata = true, illeggibile = false } = {}) {
  const stato = statoIstanza(istanza, richiesta, { illeggibile })
  if (stato !== STATI.DA_ATTIVARE && stato !== STATI.ERRORE) return { ok: false, perche: statoDetto(stato) }
  if (!emailVerificata) return { ok: false, perche: 'Prima conferma l’email: trovi il messaggio nella casella con cui ti sei registrato.' }
  if (!cliente?.piano) return { ok: false, perche: 'Serve un piano: scegline uno e completa l’abbonamento.' }
  if (cliente?.abbonamento?.stato && cliente.abbonamento.stato !== 'attivo') {
    return { ok: false, perche: 'L’abbonamento non risulta attivo.' }
  }
  return { ok: true, perche: null }
}

// Una licenza che toglie qualcosa aspetta il taglio della giornata del
// locale (REQ-FLOTTA-024): quando arriva e cosa toglie, a parole. Null se
// non aspetta niente.
export function riduzioneDetta(istanza) {
  const r = istanza?.riduzione_al_taglio
  const quando = Date.parse(r?.dal || '')
  if (!Number.isFinite(quando)) return null
  const data = new Date(quando).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const cosa = Array.isArray(r.cosa) && r.cosa.length ? `: ${r.cosa.join(', ')}` : ''
  return `Dal taglio della giornata (${data})${cosa}.`
}
