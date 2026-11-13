// ── LE SEZIONI DELL'AREA DEL TITOLARE (REQ-FLOTTA-084) ────────────────
//
// Daniele, 12/11/2026: «quel box non dovrebbe essere messo nella
// dashboard, o meglio da qualche altra parte nel backoffice del titolare di
// un locale. Non basta solo la dashboard.» La dashboard diventa un'area con
// un sotto-menù, come il backoffice (src/lib/backoffice.js): ogni sezione
// ha il suo indirizzo, così si torna indietro e si manda un link.
// Struttura approvata lo stesso giorno: «ti do l'ok per la struttura
// dell'area del titolare e procedi».

export const BASE_TITOLARE = '/dashboard'

// L'ordine è quello di chi ha un locale: prima come va, poi quello che si
// paga, poi i dati; chiudere il locale sta in fondo, lontano dal resto.
// `id` vuoto: la panoramica è /dashboard stessa, dove arrivano l'accesso,
// la registrazione e il portale di Stripe.
export const SEZIONI_TITOLARE = [
  { id: '', nome: 'Panoramica' },
  { id: 'piano', nome: 'Piano e moduli' },
  { id: 'credito-ai', nome: 'Credito AI' },
  { id: 'locale', nome: 'Il locale' },
  { id: 'chiudi', nome: 'Chiudi il locale' },
]

// Le sezioni che un locale vede. Il Free non ha l'AI (REQ-FLOTTA-087;
// Daniele, 13/11/2026: «I free non hanno l'ai»): senza la sezione del
// credito, non ricarica un credito che la regia poi non gli lascerebbe
// spendere.
export const sezioniTitolare = ({ ai = true } = {}) => SEZIONI_TITOLARE.filter((s) => ai || s.id !== 'credito-ai')

export const indirizzoSezione = (id) => (id ? `${BASE_TITOLARE}/${id}` : BASE_TITOLARE)
