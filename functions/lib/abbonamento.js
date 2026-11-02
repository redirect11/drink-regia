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

// Mensile o annuale (DEC-0005). Il valore arriva dal sito con la scelta;
// tutto quello che non è 'anno' vale mese, come un piano sconosciuto vale
// Base: il titolare non paga mai un anno senza averlo chiesto.
const INTERVALLI = { mese: 'month', anno: 'year' }
const intervalloPulito = (v) => (v === 'anno' ? 'anno' : 'mese')

// La scelta pulita: piano noto, moduli noti e non già inclusi, terminali
// da 1 in su, intervallo mese o anno.
function sceltaPulita({ piano = 'base', moduli = [], terminali = 1, intervallo = 'mese' } = {}) {
  const p = SCELTA_VALIDA.test(piano) ? listino.piani[piano] : listino.piani.base
  const inclusi = new Set(p.include)
  const extra = [...new Set((moduli || []).filter((id) => listino.moduli.some((m) => m.id === id) && !inclusi.has(id)))]
  const t = Math.max(1, Math.floor(Number(terminali) || 1))
  return { piano: p.id, moduli: extra, terminali: t, intervallo: intervalloPulito(intervallo) }
}

// Euro in centesimi, interi: 32,70 € fa 3270 e non 3270,0000000000005,
// che Stripe rifiuterebbe. Le moltiplicazioni (l'annuale) si fanno dopo,
// sugli interi.
const centesimi = (euro) => Math.round((Number(euro) || 0) * 100)

// L'IVA (REQ-FLOTTA-033): i prezzi del listino sono IVA esclusa, e Stripe
// la aggiunge con un'aliquota fissa (una «tax rate» di Stripe, non Stripe
// Tax). Fissa perché i clienti sono locali italiani con partita IVA:
// sempre il 22%, niente da calcolare per paese, e Stripe Tax costa una
// percentuale su ogni transazione. L'aliquota si cerca su Stripe dal suo
// segno nei metadati e si crea se manca (index.js, aliquotaIvaSuStripe):
// niente id da copiare a mano in configurazione, e lo stesso codice vale
// in test e in produzione, che hanno account Stripe diversi.
const PERCENTUALE_IVA = Number(listino.iva)

function parametriAliquotaIva() {
  return {
    display_name: 'IVA',
    description: `IVA ${PERCENTUALE_IVA}% (Italia), aggiunta ai prezzi del listino`,
    percentage: PERCENTUALE_IVA,
    inclusive: false,
    country: 'IT',
    jurisdiction: 'IT',
    tax_type: 'vat',
    metadata: { drink: 'iva', percentuale: String(PERCENTUALE_IVA) },
  }
}

// Una tax rate di Stripe è la nostra? Attiva, esclusa dal prezzo, della
// percentuale del listino e col nostro segno. Una tax rate su Stripe non si
// modifica nella percentuale: se il listino cambia aliquota, questa non è
// più giusta e se ne crea una nuova (col segno della percentuale nuova).
function eAliquotaIva(rate) {
  return Boolean(
    rate?.active &&
      rate.inclusive === false &&
      Number(rate.percentage) === PERCENTUALE_IVA &&
      rate.metadata?.drink === 'iva' &&
      rate.metadata?.percentuale === String(PERCENTUALE_IVA)
  )
}

// La chiave di idempotenza della creazione: due Checkout partiti insieme,
// la prima volta, creano una tax rate sola (Stripe tiene la chiave 24 ore;
// dopo la si ritrova cercandola).
const CHIAVE_IDEMPOTENZA_IVA = `drink-iva-${PERCENTUALE_IVA}-v1`

// Senza aliquota non si vende: Stripe addebiterebbe l'imponibile come se
// fosse il totale, e l'IVA la pagheremmo noi.
function serveAliquota(aliquotaIva) {
  if (!/^txr_/.test(String(aliquotaIva || ''))) throw new Error('Manca l’aliquota IVA di Stripe: senza, il Checkout addebiterebbe l’imponibile.')
  return aliquotaIva
}

// Le voci ricorrenti dell'abbonamento, prima di dare loro la forma che
// vuole Stripe: il piano, ogni modulo in più, i terminali oltre quelli
// inclusi. L'annuale costa 'mensilita' mesi di ogni voce (DEC-0005).
// `prodotto` è l'id fisso del prodotto su Stripe, che serve ai cambi di
// piano (righeSubscription).
function vociRicorrenti(scelta) {
  const s = sceltaPulita(scelta)
  const p = listino.piani[s.piano]
  const mesi = s.intervallo === 'anno' ? listino.annuale?.mensilita || 12 : 1
  const voce = (prodotto, nome, euro, quantity = 1) => ({ prodotto, nome, unit_amount: centesimi(euro) * mesi, quantity, interval: INTERVALLI[s.intervallo] })
  const voci = [voce(`drink-piano-${p.id}`, `Piano ${p.nome}`, p.prezzo)]
  for (const id of s.moduli) {
    const m = listino.moduli.find((x) => x.id === id)
    voci.push(voce(`drink-modulo-${m.id}`, m.nome, m.prezzo))
  }
  const extraTerminali = Math.max(0, s.terminali - (p.terminali || 1))
  if (extraTerminali > 0) voci.push(voce('drink-terminale', 'Terminale in più', listino.terminale_in_piu, extraTerminali))
  return voci
}

// Le righe ricorrenti del Checkout. Qui non c'è l'attivazione, che è una
// tantum (rigaAttivazione). Con `aliquotaIva` ogni riga porta l'IVA;
// sessioneCheckout la pretende. `tax_behavior: 'exclusive'` dice anche
// sul prezzo che l'importo è IVA esclusa: con la tax rate fissa decide
// `inclusive: false` dell'aliquota, ma un passaggio futuro a Stripe Tax
// troverebbe i prezzi già dichiarati.
function righeCheckout(scelta, { aliquotaIva = null } = {}) {
  return vociRicorrenti(scelta).map((v) => ({
    quantity: v.quantity,
    price_data: {
      currency: 'eur',
      unit_amount: v.unit_amount,
      product_data: { name: v.nome },
      recurring: { interval: v.interval },
      tax_behavior: 'exclusive',
    },
    ...(aliquotaIva ? { tax_rates: [aliquotaIva] } : {}),
  }))
}

// Le stesse righe per una subscription che c'è già (cambiaScelta,
// cambiaPianoAdmin). Stripe qui non accetta `product_data`: vuole l'id di
// un prodotto, e i prodotti hanno id fissi (vociRicorrenti) che index.js
// crea se mancano (prodottiSuStripe). Prima i cambi di piano mandavano le
// righe del Checkout, che Stripe rifiuta su una subscription.
function righeSubscription(scelta, { aliquotaIva } = {}) {
  serveAliquota(aliquotaIva)
  return vociRicorrenti(scelta).map((v) => ({
    quantity: v.quantity,
    price_data: { currency: 'eur', unit_amount: v.unit_amount, product: v.prodotto, recurring: { interval: v.interval }, tax_behavior: 'exclusive' },
    tax_rates: [aliquotaIva],
  }))
}

// I prodotti di Stripe che servono alle righe di una scelta: { id, name }.
function prodottiDi(scelta) {
  return vociRicorrenti(scelta).map((v) => ({ id: v.prodotto, name: v.nome, metadata: { drink: 'listino' } }))
}

// La riga una tantum dell'attivazione, o null se non si paga (Fondatori:
// attivazione gratuita). Nel Checkout in modalità abbonamento una riga
// senza 'recurring' si paga una volta, con la prima fattura.
function rigaAttivazione({ fondatore = false, aliquotaIva = null } = {}) {
  const importo = fondatore ? listino.fondatori?.attivazione ?? listino.attivazione : listino.attivazione
  if (!(centesimi(importo) > 0)) return null
  return {
    quantity: 1,
    price_data: { currency: 'eur', unit_amount: centesimi(importo), product_data: { name: 'Attivazione' }, tax_behavior: 'exclusive' },
    ...(aliquotaIva ? { tax_rates: [aliquotaIva] } : {}),
  }
}

// I metadati che viaggiano con la sessione e tornano col webhook: è così
// che il webhook sa a chi appartiene il pagamento.
function metadatiDi(uid, scelta) {
  const s = sceltaPulita(scelta)
  return { uid, piano: s.piano, moduli: s.moduli.join(','), terminali: String(s.terminali), intervallo: s.intervallo }
}

// La prova al Checkout (DEC-0005: 30 giorni) parte SPENTA
// (piani.json → prova_nel_checkout): non è ancora deciso se l'attivazione
// si paga all'inizio della prova o alla fine, e i Termini (punto 3) non
// parlano di prova. Accesa, vale solo per il primo abbonamento di un
// cliente: chi ha già avuto una subscription la prova l'ha fatta.
function giorniDiProva(cliente) {
  if (listino.prova_nel_checkout !== true) return 0
  if (cliente?.abbonamento?.stripe_subscription) return 0
  return Math.max(0, Math.floor(Number(listino.prova_giorni) || 0))
}

// La durata di una sessione di Checkout: Stripe chiede almeno 30 minuti
// dalla creazione; 35 lasciano il margine fra il calcolo qui e la
// chiamata. È anche quanto dura la prenotazione di un posto Fondatori.
const DURATA_SESSIONE_MS = 35 * 60 * 1000

// I parametri di stripe.checkout.sessions.create per un abbonamento.
// `coupon` è l'id del coupon Fondatori già creato su Stripe, o null;
// `aliquotaIva` l'id della tax rate dell'IVA (obbligatorio).
// I DATI DI FATTURAZIONE (REQ-FLOTTA-033): il Checkout chiede l'indirizzo
// e lascia scrivere la partita IVA, che finiscono sul customer di Stripe e
// sulle sue ricevute. La fattura elettronica però si fa coi dati presi
// alla registrazione (clienti/{uid}.fatturazione: P.IVA, codice fiscale,
// PEC, codice destinatario), che Stripe non ha. Con un customer che c'è
// già, Stripe vuole il permesso di aggiornargli nome e indirizzo.
function sessioneCheckout({ uid, cliente, scelta, ritorno, coupon = null, aliquotaIva, adesso = new Date() }) {
  serveAliquota(aliquotaIva)
  const fondatore = Boolean(coupon)
  const metadata = { ...metadatiDi(uid, scelta), ...(fondatore ? { fondatore: '1' } : {}) }
  const attivazione = rigaAttivazione({ fondatore, aliquotaIva })
  const prova = giorniDiProva(cliente)
  const stripeCustomer = cliente?.abbonamento?.stripe_customer
  return {
    mode: 'subscription',
    line_items: [...righeCheckout(scelta, { aliquotaIva }), ...(attivazione ? [attivazione] : [])],
    customer_email: stripeCustomer ? undefined : cliente?.email,
    customer: stripeCustomer || undefined,
    ...(stripeCustomer ? { customer_update: { address: 'auto', name: 'auto' } } : {}),
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    client_reference_id: uid,
    metadata,
    // L'IVA anche come aliquota predefinita della subscription: una riga
    // aggiunta dalla dashboard di Stripe, senza tax rate sua, la prende da qui.
    subscription_data: { metadata, default_tax_rates: [aliquotaIva], ...(prova ? { trial_period_days: prova } : {}) },
    ...(fondatore ? { discounts: [{ coupon }] } : {}),
    expires_at: Math.floor((adesso.getTime() + DURATA_SESSIONE_MS) / 1000),
    success_url: `${ritorno}/dashboard?pagamento=ok`,
    cancel_url: `${ritorno}/dashboard?pagamento=annullato`,
    locale: 'it',
  }
}

// L'intervallo di una subscription che c'è già: i cambi di piano lo
// tengono (le righe di una subscription hanno tutte lo stesso intervallo,
// e il titolare che ha pagato l'anno non torna al mese cambiando un
// modulo). Dai metadati, o dalla prima riga per le subscription nate prima.
function intervalloDi(subscription) {
  const md = subscription?.metadata?.intervallo
  if (md) return intervalloPulito(md)
  return subscription?.items?.data?.[0]?.price?.recurring?.interval === 'year' ? 'anno' : 'mese'
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

// La subscription di una fattura. Il webhook riceve gli eventi nella
// versione dell'API dell'endpoint registrato su Stripe, non in quella
// dell'SDK (stripe 17.7: 2025-02-24.acacia, dove sta in
// `invoice.subscription`): dalla 2025-03-31.basil il campo è sparito ed è
// in `invoice.parent.subscription_details.subscription`, e sulle righe in
// `parent.subscription_item_details.subscription`. Si leggono tutti, così
// un endpoint creato oggi con la versione più recente non perde le fatture.
// Può essere un id o l'oggetto espanso.
function subscriptionDellaFattura(fattura) {
  const id = (v) => (typeof v === 'string' ? v : v?.id) || null
  return (
    id(fattura?.subscription) ||
    id(fattura?.parent?.subscription_details?.subscription) ||
    (fattura?.lines?.data || []).map((l) => id(l?.parent?.subscription_item_details?.subscription) || id(l?.subscription)).find(Boolean) ||
    null
  )
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
          intervallo: intervalloPulito(md.intervallo),
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
    const sub = subscriptionDellaFattura(oggetto)
    if (!sub) return null
    // La fine del periodo pagato è il prossimo rinnovo: le condizioni nuove
    // degli aggiornamenti valgono da lì (REQ-FLOTTA-020). La più lontana fra
    // le righe: nella prima fattura c'è anche l'attivazione, una tantum, il
    // cui periodo finisce il giorno stesso.
    // È anche la fine del periodo PAGATO (`pagato_fino`): la licenza scade
    // da lì più la grazia (scadenze.js), non dalla fine del periodo della
    // subscription, che Stripe sposta al rinnovo prima del pagamento.
    const fine = Math.max(0, ...(oggetto?.lines?.data || []).map((l) => Number(l?.period?.end) || 0))
    const iso = Number.isFinite(fine) && fine > 0 ? new Date(fine * 1000).toISOString() : null
    const rinnovo = iso ? { 'abbonamento.rinnovo_il': iso, 'abbonamento.pagato_fino': iso } : {}
    return { stripe_subscription: sub, patch: { 'abbonamento.stato': 'attivo', 'abbonamento.ultimo_pagamento': ora, ...rinnovo } }
  }
  // Un tentativo fallito non cambia lo stato: Stripe ritenta, e lo stato
  // arriva con la subscription. Gli eventi di Stripe non arrivano per forza
  // in ordine: un «fallito» in ritardo non deve togliere un «non pagato».
  if (tipo === 'invoice.payment_failed') {
    const sub = subscriptionDellaFattura(oggetto)
    if (!sub) return null
    return { stripe_subscription: sub, patch: { 'abbonamento.ultimo_fallimento': ora } }
  }
  if (tipo === 'customer.subscription.deleted') {
    if (!oggetto?.id) return null
    return { stripe_subscription: oggetto.id, patch: { 'abbonamento.stato': 'disdetto', 'abbonamento.aggiornato_il': ora } }
  }
  return null
}

// Una sessione Fondatori scaduta senza pagamento: il posto prenotato torna
// libero (REQ-FLOTTA-031). → { uid, scadenza } o null; la scadenza dice
// quale sessione è scaduta (fondatori.rilascia).
function prenotazioneDaRilasciare(tipo, oggetto) {
  if (tipo !== 'checkout.session.expired') return null
  const md = oggetto?.metadata || {}
  if (md.fondatore !== '1' || !md.uid) return null
  const fine = Number(oggetto?.expires_at)
  return { uid: md.uid, scadenza: Number.isFinite(fine) && fine > 0 ? new Date(fine * 1000) : null }
}

// Un checkout completato da Fondatore: il posto va confermato. → uid o null.
function fondatoreDaConfermare(tipo, oggetto) {
  if (tipo !== 'checkout.session.completed') return null
  const md = oggetto?.metadata || {}
  return md.fondatore === '1' && md.uid && md.tipo !== 'ricarica_ai' ? md.uid : null
}

module.exports = {
  chiaveStripeVera,
  sceltaPulita,
  intervalloPulito,
  centesimi,
  righeCheckout,
  righeSubscription,
  prodottiDi,
  rigaAttivazione,
  parametriAliquotaIva,
  eAliquotaIva,
  CHIAVE_IDEMPOTENZA_IVA,
  PERCENTUALE_IVA,
  subscriptionDellaFattura,
  metadatiDi,
  giorniDiProva,
  sessioneCheckout,
  intervalloDi,
  aggiornamentoDaEvento,
  prenotazioneDaRilasciare,
  fondatoreDaConfermare,
  DURATA_SESSIONE_MS,
  fineDelPeriodo,
  STATI_STRIPE,
}
