'use strict'

// ── LE SCADENZE A EVENTI, LOGICA PURA (REQ-FLOTTA-023) ─────────────────
//
// L'utente, 31/10/2026: «non possiamo mettere un qualcosa che tiene
// traccia del periodo delle licenze ed esegue operazioni in base ad eventi
// piuttosto che farlo ogni mattina? Tipo il pagamento automatico [...]
// dovrebbe essere l'esito di quello a dire se sospendere il sito, se
// portarlo a free o altro. Non mi piace la temporizzazione di questi
// check» e, sulla proposta, «Ok procedi così».
//
// Niente più giri quotidiani su tutti i locali. Due fonti di eventi:
// - STRIPE: ritenta il pagamento col suo calendario (il periodo di grazia
//   si sceglie nelle impostazioni di Stripe) e, finiti i tentativi, cambia
//   lo stato dell'abbonamento. Il webhook lo scrive sul cliente; il cambio
//   di stato decide cosa succede al locale (azioneDiPagamento);
// - UN COMPITO PER OGNI SCADENZA, alla sua data (Cloud Tasks): il pagamento
//   a mano «pagato fino al», la fine di una prova, l'eliminazione
//   programmata, le condizioni degli aggiornamenti che entrano in vigore.
//   Il compito, quando arriva, ricontrolla: se la scadenza nel frattempo è
//   cambiata (un pagamento registrato, un'eliminazione annullata) non fa
//   niente. Così un compito vecchio non si cancella: si ignora.

const { eGratuito } = require('./free.js')
const { ripiegaInveceDiSospendere } = require('./aggiornamenti.js')

const GIORNO = 86400000
// Cloud Tasks non programma un compito a più di 30 giorni: oltre, il
// compito arriva prima e si riprogramma da solo verso la data vera.
const ANTICIPO_MAX = 29 * GIORNO
// I giorni di grazia di un pagamento a mano, se l'admin non dice altro
// (impostazioni/regia.giorni_grazia). Quelli di Stripe li decide Stripe.
const GIORNI_DI_GRAZIA = 7
// «taglio»: una licenza che toglie qualcosa, al taglio della giornata
// (REQ-FLOTTA-024, lib/taglio.js).
// «avviso_dati»: un avviso prima della cancellazione dei dati di un locale
// (REQ-FLOTTA-025, lib/conservazione.js).
// «promemoria»: un promemoria di un pagamento a mano (REQ-FLOTTA-027,
// lib/comunicazioni.js).
const TIPI = ['pagamento', 'prova', 'eliminazione', 'condizioni', 'taglio', 'avviso_dati', 'promemoria']

const ms = (iso) => Date.parse(iso || '')

// Quando far arrivare il compito: alla data, o fra 29 giorni se è più in là.
function orarioCompito(quando, adesso = new Date()) {
  return new Date(Math.min(ms(quando), adesso.getTime() + ANTICIPO_MAX))
}

// Il compito è arrivato prima della data (per il limite dei 30 giorni)?
const daRiprogrammare = (quando, adesso = new Date()) => ms(quando) > adesso.getTime() + 60_000

// Un nome unico per il compito: lo stesso compito non si programma due
// volte. Cloud Tasks vuole lettere, cifre, trattini e trattini bassi.
function idCompito(tipo, chiave, quando, orario) {
  const pulito = String(chiave).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200)
  return `${tipo}-${pulito}-${ms(quando)}-${new Date(orario).getTime()}`
}

// ── IL PAGAMENTO A MANO ──────────────────────────────────────────────

// Quando scade un abbonamento: la fine del periodo PAGATO più i giorni di
// grazia. A mano è «pagato fino al»; con Stripe è `pagato_fino`, la fine
// del periodo dell'ultima fattura pagata (invoice.paid). Null se non scade
// (un omaggio senza data, il Free, uno Stripe senza ancora una fattura).
//
// CON STRIPE (l'utente, 02/11/2026: «viene attivata la licenza con una
// durata in base alla subscription, se la subscription scade e non viene
// pagato nulla la licenza viene disattivata»; 7 giorni di grazia, come a
// mano). Non la fine del periodo della subscription: al rinnovo Stripe la
// sposta avanti subito, anche se il pagamento non è ancora riuscito. Così
// un locale che non paga si ferma anche se un evento di Stripe si perde.
function scadenzaPagamento(cliente, giorniGrazia = GIORNI_DI_GRAZIA) {
  const ab = cliente?.abbonamento
  const grazia = Math.max(0, Number(giorniGrazia) || 0) * GIORNO
  if (ab?.origine === 'stripe') return Number.isFinite(ms(ab.pagato_fino)) ? new Date(ms(ab.pagato_fino) + grazia).toISOString() : null
  if (ab?.origine !== 'manuale' || !Number.isFinite(ms(ab.pagato_fino_al))) return null
  const fine = new Date(ab.pagato_fino_al)
  // «Pagato fino al 30 novembre» vuol dire tutto il 30 novembre.
  fine.setUTCHours(23, 59, 59, 0)
  return new Date(fine.getTime() + grazia).toISOString()
}

// È arrivato il compito del pagamento: vale ancora? Sì solo se la scadenza
// è quella per cui era stato programmato e l'abbonamento è ancora attivo
// (con Stripe anche «in sospeso»: Stripe sta ancora ritentando).
function pagamentoScaduto(cliente, quando, { adesso = new Date(), giorniGrazia = GIORNI_DI_GRAZIA } = {}) {
  const scadenza = scadenzaPagamento(cliente, giorniGrazia)
  if (!scadenza || scadenza !== new Date(quando).toISOString()) return false
  const stati = cliente.abbonamento.origine === 'stripe' ? ['attivo', 'in sospeso'] : ['attivo']
  return stati.includes(cliente.abbonamento.stato) && ms(scadenza) <= adesso.getTime()
}

// Alla scadenza di uno Stripe la regia chiede a Stripe com'è davvero la
// subscription, invece di fidarsi solo degli eventi: un rinnovo pagato il
// cui evento si è perso sposta `pagato_fino`; altrimenti lo stato che dice
// Stripe, o «non pagato» se Stripe dice ancora attivo o in sospeso (la
// grazia è finita). `sub`: la subscription, o null se Stripe non risponde.
function esitoControlloStripe(cliente, sub, { statiStripe = {}, fineDelPeriodo = () => null } = {}) {
  const fine = fineDelPeriodo(sub)
  if (sub?.status === 'active' && fine && ms(fine) > ms(cliente?.abbonamento?.pagato_fino)) return { 'abbonamento.pagato_fino': fine, 'abbonamento.stato': 'attivo' }
  const stato = statiStripe[sub?.status]
  return { 'abbonamento.stato': stato === 'disdetto' ? 'disdetto' : 'non pagato' }
}

// La data scritta dall'admin: un giorno (AAAA-MM-GG) o un ISO.
function dataPagata(v) {
  const s = String(v || '').trim()
  if (!s) return null
  if (!/^\d{4}-\d{2}-\d{2}($|T)/.test(s) || !Number.isFinite(ms(s))) return undefined
  return new Date(ms(s)).toISOString().slice(0, 10)
}

// ── COSA FA UN CAMBIO DI STATO DELL'ABBONAMENTO ───────────────────────
// Gli stati di clienti/{uid}.abbonamento.stato:
//   attivo       si paga (o è il Free, o è un omaggio);
//   in sospeso   Stripe sta ritentando: il periodo di grazia, non succede
//                niente;
//   non pagato   i tentativi sono finiti (Stripe), o è passato «pagato
//                fino al» più la grazia (a mano);
//   disdetto     l'abbonamento è chiuso.
// Torna null o { azione, motivo }:
//   sospendi     il locale si ferma e lo dice;
//   ripiega      con «aggiornamenti solo finché si paga» (REQ-FLOTTA-020)
//                torna al Free invece di fermarsi;
//   chiudi       disdetto: l'ha chiesto il titolare. Con «solo finché si
//                paga» torna invece al Free (l'utente, 02/11/2026), e non
//                perde i dati;
//   riattiva     torna a pagare dopo una sospensione o una chiusura PER IL
//                PAGAMENTO (una dell'admin resta: la toglie lui);
//   ripristina   torna a pagare dopo il ritorno al Free.
function azioneDiPagamento(prima, dopo, ist) {
  const da = prima?.abbonamento?.stato || null
  const a = dopo?.abbonamento?.stato || null
  if (da === a || ist?.stato !== 'attiva') return null
  // La Tana e le altre interne non si fermano da sole (REQ-AI-003).
  if (ist.interna === true) return null
  const licenza = ist.licenza_stato || 'attiva'
  if (a === 'non pagato') {
    if (licenza !== 'attiva' || ist.ripiego_free || eGratuito(dopo.piano)) return null
    return ripiegaInveceDiSospendere(ist) ? { azione: 'ripiega', motivo: null } : { azione: 'sospendi', motivo: 'pagamento non ricevuto' }
  }
  if (a === 'disdetto') {
    if (licenza === 'chiusa' || ist.ripiego_free || eGratuito(dopo.piano)) return null
    return ripiegaInveceDiSospendere(ist) ? { azione: 'ripiega', motivo: null } : { azione: 'chiudi', motivo: 'abbonamento disdetto' }
  }
  if (a === 'attivo') {
    if (ist.ripiego_free) return { azione: 'ripristina', motivo: null }
    // Chi torna a pagare entro i 90 giorni riapre il locale coi suoi dati.
    if (['sospesa', 'chiusa'].includes(licenza) && ist.licenza_per === 'pagamento') return { azione: 'riattiva', motivo: null }
  }
  return null
}

module.exports = {
  ANTICIPO_MAX,
  GIORNI_DI_GRAZIA,
  TIPI,
  orarioCompito,
  daRiprogrammare,
  idCompito,
  scadenzaPagamento,
  pagamentoScaduto,
  esitoControlloStripe,
  dataPagata,
  azioneDiPagamento,
}
