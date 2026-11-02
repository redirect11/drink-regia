// ── L'ABBONAMENTO CON STRIPE, LOGICA PURA (REQ-FLOTTA-007) ─────────────
//
// Dalla scelta del titolare (piano, moduli, terminali) alle righe della
// sessione di Checkout; dagli eventi del webhook al documento del cliente.
// Niente Stripe qui: index.js chiama l'SDK, questo decide, e si prova
// senza chiavi.

const listino = require('../piani.json')

const SCELTA_VALIDA = /^(base|completo)$/

// Una chiave di Stripe vera: segreta (sk_) o ristretta (rk_), di test o
// live. In produzione il segreto nasce col segnaposto «non-configurato»
// finché non ci sono le chiavi live (30/10/2026): senza questo controllo la
// regia creerebbe un client Stripe con una chiave che non esiste, e ogni
// chiamata fallirebbe con un errore di Stripe invece di dire che Stripe
// non è configurato.
const chiaveStripeVera = (chiave) => /^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(String(chiave || '').trim())

// La scelta pulita: piano noto, moduli noti e non già inclusi, terminali
// da 1 in su.
function sceltaPulita({ piano = 'base', moduli = [], terminali = 1 } = {}) {
  const p = SCELTA_VALIDA.test(piano) ? listino.piani[piano] : listino.piani.base
  const inclusi = new Set(p.include)
  const extra = [...new Set((moduli || []).filter((id) => listino.moduli.some((m) => m.id === id) && !inclusi.has(id)))]
  const t = Math.max(1, Math.floor(Number(terminali) || 1))
  return { piano: p.id, moduli: extra, terminali: t }
}

// Le righe della sessione di Checkout (modalità abbonamento, mensile):
// il piano, ogni modulo in più, i terminali oltre quelli inclusi. Importi
// in centesimi, come li vuole Stripe. L'attivazione una tantum sta a
// parte, come prima riga non ricorrente.
function righeCheckout(scelta) {
  const s = sceltaPulita(scelta)
  const p = listino.piani[s.piano]
  const riga = (nome, euro, ricorrente = true) => ({
    quantity: 1,
    price_data: {
      currency: 'eur',
      unit_amount: Math.round(euro * 100),
      product_data: { name: nome },
      ...(ricorrente ? { recurring: { interval: 'month' } } : {}),
    },
  })
  const righe = [riga(`Piano ${p.nome}`, p.prezzo)]
  for (const id of s.moduli) {
    const m = listino.moduli.find((x) => x.id === id)
    righe.push(riga(m.nome, m.prezzo))
  }
  const extraTerminali = Math.max(0, s.terminali - (p.terminali || 1))
  if (extraTerminali > 0) righe.push({ ...riga('Terminale in più', listino.terminale_in_piu), quantity: extraTerminali })
  return righe
}

// I metadati che viaggiano con la sessione e tornano col webhook: è così
// che il webhook sa a chi appartiene il pagamento.
function metadatiDi(uid, scelta) {
  const s = sceltaPulita(scelta)
  return { uid, piano: s.piano, moduli: s.moduli.join(','), terminali: String(s.terminali) }
}

// L'aggiornamento di clienti/{uid} per un evento di Stripe, o null se
// l'evento non ci riguarda. Lo stato segue l'abbonamento, non il singolo
// pagamento: il POS non dipende mai da Stripe per funzionare, cambia solo
// cosa dice la dashboard.
// Gli stati di una subscription di Stripe, nelle parole del cliente
// (REQ-FLOTTA-023). «past_due»: Stripe sta ritentando, è il periodo di
// grazia. «unpaid»: i tentativi sono finiti (impostazioni di Stripe:
// «se tutti i tentativi falliscono, segna l'abbonamento come non pagato»).
// Gli altri (incomplete, paused) non cambiano niente.
const STATI_STRIPE = { active: 'attivo', trialing: 'attivo', past_due: 'in sospeso', unpaid: 'non pagato', canceled: 'disdetto', incomplete_expired: 'disdetto' }

// La fine del periodo pagato: sulla subscription, o sulla sua prima voce
// nelle versioni più recenti dell'API di Stripe.
function fineDelPeriodo(sub) {
  const fine = Number(sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end)
  return Number.isFinite(fine) && fine > 0 ? new Date(fine * 1000).toISOString() : null
}

function aggiornamentoDaEvento(tipo, oggetto, adesso = new Date()) {
  const ora = adesso.toISOString()
  const md = oggetto?.metadata || {}
  if (tipo === 'checkout.session.completed') {
    // Una ricarica del credito AI (REQ-AI-003) è un pagamento singolo, non
    // un abbonamento: la lavora ai.js, qui non deve toccare piano e stato.
    if (md.tipo === 'ricarica_ai') return null
    if (!md.uid) return null
    return {
      uid: md.uid,
      patch: {
        piano: md.piano || 'base',
        moduli: md.moduli ? md.moduli.split(',').filter(Boolean) : [],
        terminali: Number(md.terminali) || 1,
        abbonamento: {
          stato: 'attivo',
          origine: 'stripe',
          stripe_customer: oggetto.customer || null,
          stripe_subscription: oggetto.subscription || null,
          dal: ora,
        },
      },
    }
  }
  // Il piano cambiato da Stripe (REQ-FLOTTA-010): i metadati della
  // subscription portano la scelta nuova. E lo stato dell'abbonamento
  // (REQ-FLOTTA-023): è lui, non il singolo pagamento, a dire se il locale
  // lavora; il cambio di stato fa il resto (licenzaSegueIlPiano).
  if (tipo === 'customer.subscription.updated') {
    if (!oggetto?.id) return null
    const patch = {}
    if (md.piano) Object.assign(patch, { piano: md.piano, moduli: md.moduli ? md.moduli.split(',').filter(Boolean) : [], terminali: Number(md.terminali) || 1 })
    if (STATI_STRIPE[oggetto.status]) patch['abbonamento.stato'] = STATI_STRIPE[oggetto.status]
    if (fineDelPeriodo(oggetto)) patch['abbonamento.rinnovo_il'] = fineDelPeriodo(oggetto)
    if (!Object.keys(patch).length) return null
    return { stripe_subscription: oggetto.id, patch: { ...patch, 'abbonamento.aggiornato_il': ora } }
  }
  if (tipo === 'invoice.paid') {
    const sub = oggetto?.subscription
    if (!sub) return null
    // La fine del periodo pagato è il prossimo rinnovo: le condizioni nuove
    // degli aggiornamenti valgono da lì (REQ-FLOTTA-020).
    // È anche la fine del periodo PAGATO (`pagato_fino`): la licenza scade
    // da lì più la grazia (scadenze.js), non dalla fine del periodo della
    // subscription, che Stripe sposta al rinnovo prima del pagamento.
    const fine = Number(oggetto?.lines?.data?.[0]?.period?.end)
    const iso = Number.isFinite(fine) && fine > 0 ? new Date(fine * 1000).toISOString() : null
    const rinnovo = iso ? { 'abbonamento.rinnovo_il': iso, 'abbonamento.pagato_fino': iso } : {}
    return { stripe_subscription: sub, patch: { 'abbonamento.stato': 'attivo', 'abbonamento.ultimo_pagamento': ora, ...rinnovo } }
  }
  // Un tentativo fallito non cambia lo stato: Stripe ritenta, e lo stato
  // arriva con la subscription. Gli eventi di Stripe non arrivano per forza
  // in ordine: un «fallito» in ritardo non deve togliere un «non pagato».
  if (tipo === 'invoice.payment_failed') {
    const sub = oggetto?.subscription
    if (!sub) return null
    return { stripe_subscription: sub, patch: { 'abbonamento.ultimo_fallimento': ora } }
  }
  if (tipo === 'customer.subscription.deleted') {
    if (!oggetto?.id) return null
    return { stripe_subscription: oggetto.id, patch: { 'abbonamento.stato': 'disdetto', 'abbonamento.aggiornato_il': ora } }
  }
  return null
}

module.exports = { chiaveStripeVera, sceltaPulita, righeCheckout, metadatiDi, aggiornamentoDaEvento, fineDelPeriodo, STATI_STRIPE }
