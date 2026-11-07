// ── LE SEZIONI DEL BACKOFFICE (REQ-FLOTTA-005) ─────────────────────────
//
// L'utente, 30/10/2026: «puoi separare le varie sezioni del backoffice
// magari in sotto menu? Così è tutto troppo caotico». Una pagina lunga
// diventa cinque sezioni, ognuna col suo indirizzo (si torna indietro e si
// condivide il link). Qui solo le regole, senza React: quali sezioni, cosa
// contano i loro contatori, come si filtra l'elenco dei locali.

import { STATI } from './istanze.js'

export const BASE = '/backoffice'

// L'ordine è quello di chi amministra: prima i locali, che si guardano
// ogni giorno, poi quello che aspetta una risposta, poi i rilasci; la
// vendita e i locali nuovi si toccano di rado.
// «Commerciale» (REQ-FLOTTA-041) sta subito dopo i locali: è la vista di
// chi vende, e la si guarda ogni giorno quanto l'elenco.
export const SEZIONI = [
  { id: 'locali', nome: 'Locali' },
  { id: 'commerciale', nome: 'Commerciale' },
  { id: 'richieste', nome: 'Richieste' },
  { id: 'rilasci', nome: 'Rilasci' },
  { id: 'vendita', nome: 'Vendita' },
  { id: 'temi', nome: 'Temi' },
  { id: 'nuovo', nome: 'Nuovo locale' },
]

// Un locale registrato come esistente (la Tana) non passa per la flotta:
// i suoi aggiornamenti non sono nostri.
// Chi aggiorna la regia: i locali della flotta, e un locale esistente che
// l'admin le ha affidato (REQ-FLOTTA-018). La stessa regola delle
// Functions (functions/lib/rilasci.js, daFlotta).
export const aggiornaLaRegia = (istanza) => istanza?.origine !== 'esistente' || istanza?.aggiornamenti_dalla_regia === true
const daFlotta = aggiornaLaRegia
const licenzaDi = (r) => r.istanza?.licenza_stato || 'attiva'
const eliminazioneFallita = (r) => r.istanza?.eliminazione?.stato === 'fallita'
export const aggiornamentoFallito = (r) => daFlotta(r.istanza) && r.istanza?.aggiornamento?.stato === 'fallito'
// Un locale Free che ha comprato, col deploy automatico spento: il profilo
// completo aspetta l'admin (REQ-FLOTTA-011).
export const profiloDaAutorizzare = (r) => Boolean(r.istanza?.profilo_completo_da_autorizzare)

// I contatori del sotto-menù: ora che non è più tutto in una pagina, la
// voce dice se dietro c'è qualcosa da fare. Ogni cosa si conta una volta
// sola, nella sezione dove si risolve: un'attivazione fallita o
// un'eliminazione non riuscita in «Locali», le attivazioni da autorizzare
// e i contatti aperti in «Richieste», gli aggiornamenti falliti in
// «Rilasci».
export function contiDelBackoffice(righe, contatti) {
  return {
    locali: righe.filter((r) => r.stato === STATI.ERRORE || eliminazioneFallita(r)).length,
    richieste:
      righe.filter((r) => r.stato === STATI.DA_APPROVARE || profiloDaAutorizzare(r)).length + (contatti || []).filter((c) => c.stato === 'aperta').length,
    rilasci: righe.filter(aggiornamentoFallito).length,
  }
}

// Le viste dell'elenco dei locali. «Da seguire» raccoglie tutto quello che
// i contatori contano, più le attivazioni in attesa di autorizzazione.
export const VISTE = [
  { id: 'tutti', nome: 'Tutti', vale: () => true },
  {
    id: 'da-seguire',
    nome: 'Da seguire',
    vale: (r) => r.stato === STATI.ERRORE || r.stato === STATI.DA_APPROVARE || profiloDaAutorizzare(r) || aggiornamentoFallito(r) || eliminazioneFallita(r),
  },
  { id: 'attivi', nome: 'Attivi', vale: (r) => r.stato === STATI.ATTIVA && licenzaDi(r) === 'attiva' },
  {
    id: 'in-attivazione',
    nome: 'In attivazione',
    vale: (r) => [STATI.DA_ATTIVARE, STATI.DA_APPROVARE, STATI.IN_CODA, STATI.IN_CORSO].includes(r.stato),
  },
  { id: 'fermi', nome: 'Sospesi o chiusi', vale: (r) => r.stato === STATI.ATTIVA && licenzaDi(r) !== 'attiva' },
  { id: 'eliminati', nome: 'Eliminati', vale: (r) => r.stato === STATI.ELIMINATA },
]

// La vista e la ricerca vengono dall'indirizzo: una vista sconosciuta (un
// link vecchio, una parola sbagliata) mostra tutti, non un elenco vuoto.
export function filtraLocali(righe, { vista = 'tutti', cerca = '' } = {}) {
  const v = VISTE.find((x) => x.id === vista) || VISTE[0]
  const q = cerca.trim().toLowerCase()
  const trovato = ({ cliente: c }) =>
    !q || [c.nome_locale, c.slug, c.email, c.fatturazione?.ragione_sociale].some((t) => String(t || '').toLowerCase().includes(q))
  return righe.filter((r) => v.vale(r) && trovato(r))
}
