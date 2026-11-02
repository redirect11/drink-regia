// ── GLI EVENTI DI STRIPE: UNA VOLTA SOLA E IN ORDINE (REQ-FLOTTA-034) ──
//
// Audit del 22/10/2026, M4. Stripe consegna ogni evento «almeno una
// volta»: lo ripete se la risposta tarda o fallisce, e non garantisce
// l'ordine. Senza un registro, lo stesso evento elaborato due volte rifà i
// suoi effetti; senza un controllo dell'ordine, un `invoice.paid` vecchio
// arrivato dopo la disdetta riaccende un abbonamento chiuso.
// Logica pura: index.js fa le letture e le scritture in transazione.

// Quanto vale una presa in carico: se l'elaborazione si interrompe (la
// Function muore a metà) il registro resta «in corso», e dopo questo tempo
// la ripetizione di Stripe la riprende. Più lungo del timeout della
// Function (60 secondi), più corto del primo ritentativo di Stripe che
// arriva dopo qualche minuto.
const PRESA_MS = 5 * 60 * 1000

// Per quanto si tiene la riga del registro: Stripe ritenta per tre giorni,
// e dal Workbench si rimanda a mano un evento fino a 30 giorni. `scade_il`
// è un Timestamp, il campo che la policy TTL di Firestore usa per
// cancellarla da sola (si accende in console, sulla collezione
// eventi_stripe).
const CONSERVA_MS = 45 * 24 * 60 * 60 * 1000

const ID_EVENTO = /^evt_[A-Za-z0-9]+$/

// Cosa fare di un evento, dalla sua riga nel registro (o null):
// 'elabora' (mai visto, o una presa in carico scaduta), 'fatto' (già
// elaborato: si risponde 200 senza rifare niente), 'in corso' (un'altra
// istanza lo sta elaborando ora: si risponde con un errore e Stripe
// riprova più tardi, quando sarà 'fatto').
function daElaborare(riga, adesso = new Date()) {
  if (!riga) return 'elabora'
  if (riga.stato === 'fatto') return 'fatto'
  const presa = Date.parse(riga.preso_il)
  if (riga.stato === 'in corso' && Number.isFinite(presa) && adesso.getTime() - presa < PRESA_MS) return 'in corso'
  return 'elabora'
}

// La riga del registro alla presa in carico. `scade_il` è una Date: l'SDK
// di Firestore la scrive come Timestamp, che serve al TTL.
function presaInCarico(evento, adesso = new Date()) {
  return {
    tipo: String(evento?.type || ''),
    creato: Number(evento?.created) || null,
    livemode: evento?.livemode === true,
    stato: 'in corso',
    preso_il: adesso.toISOString(),
    tentativi: 1,
    scade_il: new Date(adesso.getTime() + CONSERVA_MS),
  }
}

const idEventoValido = (id) => ID_EVENTO.test(String(id || ''))

// I campi che dicono com'è l'abbonamento: un evento più vecchio
// dell'ultimo che li ha scritti non li tocca. Gli altri campi (l'ultimo
// pagamento, l'ultimo fallimento) sono fatti accaduti e restano veri anche
// se arrivano tardi.
const CAMPI_DI_STATO = ['abbonamento.stato', 'piano', 'moduli', 'terminali', 'abbonamento.rinnovo_il']
const SOLO_DATA = new Set(['abbonamento.aggiornato_il'])

// L'aggiornamento di aggiornamentoDaEvento (abbonamento.js) messo in
// ordine col cliente com'è ora. `creato` è event.created (secondi), lo
// stesso orologio per tutti gli eventi dell'account. → la patch da
// scrivere, o null se non resta niente da scrivere.
// - Il checkout completato (patch con `abbonamento` intero) apre una
//   subscription: si scrive, salvo che sia della stessa subscription già
//   portata avanti da eventi più recenti.
// - Un evento più vecchio dell'ultimo che ha scritto lo stato non lo
//   riscrive (a parità di secondo si scrive: Stripe manda insieme
//   `invoice.paid` e `customer.subscription.updated`, e dicono la stessa cosa).
// - «disdetto» non si riapre da Stripe: una subscription cancellata su
//   Stripe non torna attiva, e un `invoice.paid` dopo la disdetta è per
//   forza un evento in ritardo. Un abbonamento nuovo passa dal Checkout.
// - Un abbonamento che l'admin ha messo fuori da Stripe (manuale,
//   gratuito) non lo cambiano gli eventi della vecchia subscription.
// - `pagato_fino` non torna indietro.
function inOrdine(cliente, agg, { creato } = {}) {
  if (!agg?.patch) return null
  const ab = cliente?.abbonamento || {}
  const ultimo = Number(ab.evento_stripe_creato) || 0
  const c = Number(creato) || 0
  if (agg.patch.abbonamento) {
    const stessa = Boolean(ab.stripe_subscription) && ab.stripe_subscription === agg.patch.abbonamento.stripe_subscription
    if (stessa && c && ultimo && c < ultimo) return null
    return { ...agg.patch, abbonamento: { ...agg.patch.abbonamento, evento_stripe_creato: Math.max(c, stessa ? ultimo : 0) || null } }
  }
  const patch = { ...agg.patch }
  const fuoriDaStripe = Boolean(ab.origine) && ab.origine !== 'stripe'
  const vecchio = Boolean(c && ultimo && c < ultimo)
  if (vecchio || fuoriDaStripe) for (const k of CAMPI_DI_STATO) delete patch[k]
  if (ab.stato === 'disdetto' && patch['abbonamento.stato'] && patch['abbonamento.stato'] !== 'disdetto') delete patch['abbonamento.stato']
  const pagato = patch['abbonamento.pagato_fino']
  if (pagato && ab.pagato_fino && Date.parse(pagato) < Date.parse(ab.pagato_fino)) delete patch['abbonamento.pagato_fino']
  if (!Object.keys(patch).some((k) => !SOLO_DATA.has(k))) return null
  if (c && CAMPI_DI_STATO.some((k) => k in patch)) patch['abbonamento.evento_stripe_creato'] = Math.max(c, ultimo)
  return patch
}

module.exports = { daElaborare, presaInCarico, idEventoValido, inOrdine, CAMPI_DI_STATO, PRESA_MS, CONSERVA_MS }
