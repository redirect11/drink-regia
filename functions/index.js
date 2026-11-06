// ── LE FUNCTIONS DELLA REGIA (REQ-FLOTTA-006) ─────────────────────────
//
// Due cose sole: quando nasce (o viene rilanciata) una richiesta di
// attivazione, lanciare il workflow GitHub `provisiona-istanza.yml`; e
// ricevere l'esito dal workflow. La logica sta in lib/provisioning.js.
//
// Segreti (firebase functions:secrets:set, progetto drink-regia):
//   GITHUB_DISPATCH_TOKEN         token fine-grained con actions:write sul repo
//   PROVISIONING_CALLBACK_SECRET  il bearer che il workflow usa per l'esito
//   ANTHROPIC_API_KEY             la nostra chiave di Claude (REQ-AI-003): sta
//                                 solo qui, mai in un'installazione
// Configurazione non segreta (.env): GITHUB_REPO (il repository con i
// workflow della flotta, dal 29/10/2026 la regia stessa), FLOTTA_REF (il
// suo ramo con i workflow), APP_REF (la versione di tana-drink da
// pubblicare), FLOTTA_AMBIENTE (produzione o test: quale environment),
// APP_REPO (il repository dell'app, da cui si leggono le note di un
// rilascio: di norma redirect11/tana-drink).

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const eventiStripe = require('./lib/eventistripe.js')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, eAggiornamento, documentoIstanza, documentoAggiornamento, bearerValido } = require('./lib/provisioning.js')
const rilasci = require('./lib/rilasci.js')
const { sceltaCambiata, licenzaProtetta, stessaLicenza, perIlDatabase, scadenzaCoerente } = require('./lib/licenza.js')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue, Timestamp } = require('firebase-admin/firestore')
const { chiaveStripeVera, righeSubscription, prodottiDi, parametriAliquotaIva, eAliquotaIva, CHIAVE_IDEMPOTENZA_IVA, metadatiDi, aggiornamentoDaEvento, sceltaPulita, sessioneCheckout, intervalloDi, prenotazioneDaRilasciare, fondatoreDaConfermare, DURATA_SESSIONE_MS, fineDelPeriodo, STATI_STRIPE } = require('./lib/abbonamento.js')
const fondatori = require('./lib/fondatori.js')
const acquisto = require('./lib/acquisto.js')
const { onTaskDispatched } = require('firebase-functions/v2/tasks')
const { getFunctions: funzioniAdmin } = require('firebase-admin/functions')
const { STATI: STATI_LICENZA } = require('./lib/sospensione.js')
const scadenze = require('./lib/scadenze.js')
const taglio = require('./lib/taglio.js')
const { initializeApp: initializeAppCon, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const ai = require('./lib/ai.js')
const elim = require('./lib/eliminazione.js')
const conserva = require('./lib/conservazione.js')
const presenta = require('./lib/presentazione.js')
const passa = require('./lib/passaggio.js')
const temi = require('./lib/temi.js')
const stili = require('./lib/stili.js')
const comunica = require('./lib/comunicazioni.js')
const sconti = require('./lib/sconti.js')
const free = require('./lib/free.js')
const contatti = require('./lib/contatti.js')
const { getStorage } = require('firebase-admin/storage')
const { datiEsistente, documentiEsistente, DatiNonValidi, scriveLicenza, gestioneEsistente, eDemo } = require('./lib/esistente.js')
const aggiornamenti = require('./lib/aggiornamenti.js')

initializeApp()
const db = getFirestore()
const OPTS = { region: 'europe-west1' }
const GITHUB_DISPATCH_TOKEN = defineSecret('GITHUB_DISPATCH_TOKEN')
const PROVISIONING_CALLBACK_SECRET = defineSecret('PROVISIONING_CALLBACK_SECRET')
// Stripe (REQ-FLOTTA-007): chiave segreta e segreto del webhook, prima
// quelle di PROVA (sk_test_…, whsec_…), poi quelle vere.
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const REPO = process.env.GITHUB_REPO || 'redirect11/drink-regia'
const REF = process.env.FLOTTA_REF || 'main'
const WORKFLOW = 'provisiona-istanza.yml'
const WORKFLOW_AGGIORNA = 'aggiorna-istanza.yml'
const WORKFLOW_ELIMINA = 'elimina-istanza.yml'
// La versione dell'app da pubblicare: di norma `main` (l'ultimo rilascio).
const REF_APP = process.env.APP_REF || 'main'
// La regia di test lancia sull'environment flotta-test: il suo account di
// fatturazione, il suo callback, il suo account per la licenza.
const AMBIENTE_FLOTTA = process.env.FLOTTA_AMBIENTE || 'produzione'
// tana-drink è pubblico: le note di un rilascio si leggono senza token.
const APP_REPO = process.env.APP_REPO || 'redirect11/tana-drink'
// L'indirizzo di questa regia, che la licenza dà all'app per il «vedi i
// piani» (functions/.env.<progetto>).
const REGIA_URL = process.env.REGIA_URL || null
// Dove l'app manda la scelta del titolare (sceltaDallApp, REQ-FLOTTA-020):
// l'indirizzo di questa Function nel progetto della regia.
const PROGETTO_REGIA = process.env.GCLOUD_PROJECT || (() => { try { return JSON.parse(process.env.FIREBASE_CONFIG || '{}').projectId } catch { return null } })()
const SCELTA_URL = PROGETTO_REGIA ? `https://europe-west1-${PROGETTO_REGIA}.cloudfunctions.net/sceltaDallApp` : null

async function dispatchGitHub(workflow, corpo) {
  return fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_DISPATCH_TOKEN.value()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(corpo),
  })
}

async function lancia(richiesta) {
  const adesso = new Date().toISOString()
  // Audit del 22/10/2026, C2: il workflow parte solo se la richiesta è
  // davvero del cliente che dice, con l'abbonamento attivo; e gli input
  // (nome, piano, moduli) si prendono dal cliente, non dalla richiesta.
  const cliente = richiesta.uid ? (await db.doc(`clienti/${richiesta.uid}`).get()).data() : null
  const coerenza = richiestaCoerente(richiesta, cliente)
  if (!coerenza.ok) {
    console.error(`[provisioning] ${richiesta.slug} non parte: ${coerenza.perche}`)
    await db.doc(`richieste/${richiesta.slug}`).set({ stato: 'errore', errore: `Lancio rifiutato: ${coerenza.perche}`, aggiornata_il: adesso }, { merge: true })
    return
  }
  const corpo = dispatchPayload({ ...richiesta, nome_locale: cliente.nome_locale, piano: cliente.piano, moduli: cliente.moduli, email: cliente.email }, { ref: REF, app: REF_APP, ambiente: AMBIENTE_FLOTTA })
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_DISPATCH_TOKEN.value()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(corpo),
  })
  if (res.status !== 204) {
    const testo = await res.text().catch(() => '')
    await db.doc(`richieste/${richiesta.slug}`).set({ stato: 'errore', errore: `GitHub ${res.status}: ${testo.slice(0, 200)}`, aggiornata_il: adesso }, { merge: true })
    await db.doc(`istanze/${richiesta.slug}`).set(
      documentoIstanza({ slug: richiesta.slug, stato: 'errore', errore: `Lancio fallito (GitHub ${res.status})` }, null),
      { merge: true }
    )
    return
  }
  await db.doc(`richieste/${richiesta.slug}`).set({ stato: 'in corso', lanciata_il: adesso }, { merge: true })
  await db.doc(`istanze/${richiesta.slug}`).set(
    { ...documentoIstanza({ slug: richiesta.slug, stato: 'in corso' }, null), uid: richiesta.uid || null },
    { merge: true }
  )
}

// Il titolare chiede l'attivazione (audit del 22/10/2026, C2): la richiesta
// la scrive questa callable, non il browser. Il corpo della chiamata non
// conta niente: tutto viene da clienti/{uid}, dallo stato dell'istanza e
// dalle impostazioni della regia, riletti qui. Le regole Firestore non
// lasciano più creare richieste ai client.
exports.chiediAttivazione = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente?.slug) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const [istanza, richiesta, impostazioni] = await Promise.all([
    db.doc(`istanze/${cliente.slug}`).get().then((s) => s.data() || null),
    db.doc(`richieste/${cliente.slug}`).get().then((s) => s.data() || null),
    db.doc('impostazioni/regia').get().then((s) => s.data() || {}),
  ])
  const esito = preparaRichiesta(cliente, {
    istanza,
    richiesta,
    emailVerificata: req.auth.token?.email_verified === true,
    // Spento finché l'admin non lo accende (l'utente, 02/11/2026: «per ora
    // la vendita è attiva ma non il deploy automatico, che passa per me»).
    automatico: impostazioni.deploy_automatico === true,
  })
  if (!esito.ok) throw new HttpsError('failed-precondition', esito.perche)
  await db.doc(`richieste/${cliente.slug}`).set(esito.richiesta)
  return { ok: true, stato: esito.richiesta.stato }
})

exports.avviaProvisioning = onDocumentCreated(
  { ...OPTS, document: 'richieste/{slug}', secrets: [GITHUB_DISPATCH_TOKEN] },
  async (event) => {
    const dopo = event.data?.data()
    if (daLanciare(null, dopo)) await lancia({ ...dopo, slug: event.params.slug })
  }
)

exports.rilanciaProvisioning = onDocumentUpdated(
  { ...OPTS, document: 'richieste/{slug}', secrets: [GITHUB_DISPATCH_TOKEN] },
  async (event) => {
    const prima = event.data?.before?.data()
    const dopo = event.data?.after?.data()
    if (daLanciare(prima, dopo)) await lancia({ ...dopo, slug: event.params.slug })
  }
)

// L'esito dal workflow: POST con bearer, corpo { slug, stato, url, progetto, versione, ref, ambiente, operazione, errore }.
exports.esitoProvisioning = onRequest({ ...OPTS, secrets: [PROVISIONING_CALLBACK_SECRET], cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('')
  if (!bearerValido(req.get('authorization'), PROVISIONING_CALLBACK_SECRET.value())) return res.status(401).send('')
  // L'esito di un'eliminazione (REQ-FLOTTA-014) ha campi e stati suoi.
  if (req.body?.operazione === 'eliminazione') {
    const fine = elim.esitoEliminazione(req.body)
    if (!fine) return res.status(400).json({ errore: 'esito non valido' })
    const ref = db.doc(`istanze/${fine.slug}`)
    const prima = (await ref.get()).data() || null
    await ref.set(elim.documentoEliminazione(fine, prima), { merge: true })
    return res.status(200).json({ ok: true, operazione: 'eliminazione' })
  }
  const esito = esitoValido(req.body)
  if (!esito) return res.status(400).json({ errore: 'esito non valido' })
  const ref = db.doc(`istanze/${esito.slug}`)
  const prima = (await ref.get()).data() || null
  // Un aggiornamento non tocca lo stato dell'istanza né la richiesta di
  // attivazione (REQ-FLOTTA-012); fa andare avanti, o fermare, il rilascio.
  if (eAggiornamento(esito, prima)) {
    await ref.set(documentoAggiornamento(esito, prima), { merge: true })
    // Arrivato a quella versione o oltre (un «Aggiorna subito», un rilascio
    // obbligatorio): la proposta al titolare non serve più (REQ-FLOTTA-020).
    if (esito.stato === 'attiva' && aggiornamenti.propostaSuperata(prima?.proposta_aggiornamento, esito.versione)) {
      await ref.update({ 'proposta_aggiornamento.attesa': false })
    }
    // Ogni aggiornamento riuscito riscrive la licenza (BUG-125): un locale
    // senza licenza/attuale, con l'app nuova, si ferma.
    if (esito.stato === 'attiva') await scriviLicenza(esito.slug).catch((e) => console.error(`[licenza] ${esito.slug}:`, e?.message || e))
    if (esito.stato === 'attiva') await scriviDatiDelLocale(esito.slug)
    try {
      await ricalcolaRilasci()
    } catch (e) {
      console.error('[rilasci] ricalcolo dopo esito:', e?.message || e)
    }
    return res.status(200).json({ ok: true, operazione: 'aggiornamento' })
  }
  await ref.set(documentoIstanza(esito, prima), { merge: true })
  await db.doc(`richieste/${esito.slug}`).set({ stato: esito.stato, aggiornata_il: new Date().toISOString() }, { merge: true })
  // Un locale che nasce adesso prende le regole degli aggiornamenti di
  // adesso, senza preavviso: le accetta registrandosi (REQ-FLOTTA-020).
  // E nasce con la sua licenza protetta (BUG-125), calcolata dalla regia.
  if (esito.stato === 'attiva') {
    try {
      if (!prima?.condizioni_aggiornamenti) await ref.set({ condizioni_aggiornamenti: await regoleAggiornamenti() }, { merge: true })
      // Il locale nasce adesso: nessuno ci lavora ancora, niente taglio.
      await scriviLicenza(esito.slug, { subito: true })
      await scriviDatiDelLocale(esito.slug)
    } catch (e) {
      console.error(`[licenza] ${esito.slug}, la prima licenza:`, e?.message || e)
    }
  }
  res.status(200).json({ ok: true })
})

// ── L'ABBONAMENTO (REQ-FLOTTA-007) ────────────────────────────────────

const stripeClient = () => {
  const chiave = STRIPE_SECRET_KEY.value()
  if (!chiaveStripeVera(chiave)) return null
  // Caricato qui e non in cima: senza chiave la regia lavora lo stesso.
  const Stripe = require('stripe')
  return new Stripe(chiave)
}

// Il contatore dei posti Fondatori (REQ-FLOTTA-031): un documento solo,
// cambiato sempre in transazione. Lo leggono solo le Functions e l'admin.
const POSTI_FONDATORI = () => db.doc('fondatori/posti')

// Il coupon Fondatori su Stripe: si cerca per id e si crea se manca. L'id
// dipende dall'importo, quindi un coupon trovato è quello giusto.
async function couponSuStripe(stripe, parametri) {
  try {
    return (await stripe.coupons.retrieve(parametri.id)).id
  } catch (e) {
    if (e?.statusCode !== 404 && e?.code !== 'resource_missing') throw e
    return (await stripe.coupons.create(parametri)).id
  }
}

// L'aliquota IVA su Stripe (REQ-FLOTTA-035): si cerca fra le tax rate
// attive dal segno nei metadati (eAliquotaIva), e si crea se manca, con una
// chiave di idempotenza perché due Checkout insieme non ne creino due.
// Ricordata per la vita dell'istanza della Function: la tax rate non cambia.
// La si cerca invece di leggerne l'id da un segreto perché un id copiato a
// mano dalla dashboard di Stripe è un passo in più da dimenticare per ogni
// account (test e produzione), e un id sbagliato si scoprirebbe al primo
// incasso.
let aliquotaIvaRicordata = null
async function aliquotaIvaSuStripe(stripe) {
  if (aliquotaIvaRicordata) return aliquotaIvaRicordata
  for await (const rate of stripe.taxRates.list({ active: true, inclusive: false, limit: 100 })) {
    if (eAliquotaIva(rate)) return (aliquotaIvaRicordata = rate.id)
  }
  const creata = await stripe.taxRates.create(parametriAliquotaIva(), { idempotencyKey: CHIAVE_IDEMPOTENZA_IVA })
  console.log(`[stripe] creata l'aliquota IVA ${creata.id}`)
  return (aliquotaIvaRicordata = creata.id)
}

// I prodotti di Stripe delle righe di una subscription (righeSubscription):
// id fissi, cercati e creati se mancano, come il coupon Fondatori.
async function prodottiSuStripe(stripe, scelta) {
  for (const p of prodottiDi(scelta)) {
    try {
      await stripe.products.retrieve(p.id)
    } catch (e) {
      if (e?.statusCode !== 404 && e?.code !== 'resource_missing') throw e
      await stripe.products.create(p, { idempotencyKey: `drink-prodotto-${p.id}` })
    }
  }
}

// Il titolare sceglie il piano: nasce la sessione di Checkout (abbonamento
// mensile o annuale) e torna l'url. I metadati portano uid e scelta, che il
// webhook userà per aggiornare il cliente. Se il piano è coperto
// dall'offerta Fondatori e c'è un posto, il posto si prenota qui, in
// transazione, e la sessione porta il coupon.
exports.creaCheckout = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const stripe = stripeClient()
  if (!stripe) throw new HttpsError('failed-precondition', 'Il pagamento online non è ancora attivo: scrivici all’email del prodotto.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const scelta = sceltaPulita({ piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali, intervallo: req.data?.intervallo })
  const inVendita = await vendita()
  // Pagamenti online spenti (REQ-FLOTTA-017): il sito non mostra il
  // Checkout, e il server non lo apre comunque.
  if (!contatti.pagamentiOnline(inVendita)) throw new HttpsError('failed-precondition', PAGAMENTI_SPENTI)
  // Un modulo che l'admin ha tolto dalla vendita non si compra di nuovo
  // (REQ-FLOTTA-015); chi lo ha già lo tiene.
  const fuori = free.moduliFuoriVendita(cliente, scelta, inVendita)
  if (fuori.length) throw new HttpsError('failed-precondition', `Non più in vendita: ${fuori.join(', ')}.`)
  const ritorno =String(req.data?.ritorno || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(ritorno)) throw new HttpsError('invalid-argument', 'Indirizzo di ritorno non valido.')
  const adesso = new Date()
  // IL CODICE SCONTO (REQ-FLOTTA-028): quello scritto ora dal titolare, o
  // quello che l'admin gli ha già dato. Un codice al 100% non passa da qui
  // (attivaConCodice). Se c'è anche un posto Fondatori vale il più
  // conveniente (acquisto.scontoCheVale): Stripe ne accetta uno solo.
  // Un codice col limite di usi si tiene da parte per la durata della
  // sessione, e diventa un uso quando Stripe conferma il pagamento.
  const { sconto, uso, errore: erroreCodice } = await scontoPerAcquisto(cliente, req.data?.codice, adesso, uid)
  if (erroreCodice) throw new HttpsError('failed-precondition', erroreCodice)
  if (sconto?.percentuale === 100) throw new HttpsError('failed-precondition', 'Con questo codice il piano non si paga: usa «Attiva con il codice».')
  const couponCodice = sconto ? acquisto.couponSconto(sconto, { intervallo: scelta.intervallo, adesso }) : null
  if (couponCodice?.errore) throw new HttpsError('failed-precondition', couponCodice.errore)
  // Un posto per cliente: chi è già stato Fondatore (anche se poi ha
  // disdetto) torna al listino.
  const puoFondatore = fondatori.coperto(scelta.piano) && !cliente.abbonamento?.fondatore && fondatori.postiLiberi((await POSTI_FONDATORI().get()).data(), adesso) > 0
  const vale = acquisto.scontoCheVale({ scelta, sconto, fondatore: puoFondatore, adesso })
  let prenotato = false
  if (vale === 'fondatori') {
    const scadenza = new Date(adesso.getTime() + DURATA_SESSIONE_MS)
    prenotato = await db.runTransaction(async (t) => {
      const p = fondatori.prenota((await t.get(POSTI_FONDATORI())).data(), uid, scadenza, adesso)
      if (p.esito === 'prenotato') t.set(POSTI_FONDATORI(), p.doc)
      return p.esito === 'prenotato'
    })
  }
  // L'ultimo posto preso da un altro un attimo prima: allora il codice, se c'è.
  const conCodice = Boolean(sconto) && !prenotato
  const usoTenuto = conCodice && uso && (await prenotaUsoCodice(sconto.codice, uid, new Date(adesso.getTime() + DURATA_SESSIONE_MS), adesso))
  if (conCodice && uso && !usoTenuto) throw new HttpsError('failed-precondition', sconti.ESAURITO)
  let sessione
  try {
    const coupon = prenotato
      ? await couponSuStripe(stripe, fondatori.couponFondatori(scelta.piano, scelta.intervallo))
      : conCodice
        ? await couponSuStripe(stripe, couponCodice.coupon)
        : null
    const aliquotaIva = await aliquotaIvaSuStripe(stripe)
    sessione = await stripe.checkout.sessions.create(
      sessioneCheckout({ uid, cliente, scelta, ritorno, coupon, fondatore: prenotato, sconto: conCodice ? acquisto.metadatiSconto(sconto, { uso }) : null, aliquotaIva, adesso })
    )
  } catch (e) {
    // La sessione non è nata: il posto e l'uso del codice non restano
    // tenuti per nessuno.
    if (prenotato) await liberaPosto(uid).catch((x) => console.error('[fondatori] rilascio:', x?.message || x))
    if (usoTenuto) await liberaUsoCodice(sconto.codice, uid).catch((x) => console.error('[sconti] rilascio:', x?.message || x))
    throw e
  }
  return { url: sessione.url, fondatore: prenotato, sconto: conCodice ? sconto.codice : null }
})

// Lo sconto di un acquisto: il codice scritto dal titolare (che deve
// esistere, essere attivo e avere ancora usi), o se non ne scrive uno
// quello che l'admin gli ha dato ed è ancora in corso. → { sconto, uso }
// (sconto null se non c'è; `uso`: consuma un uso del codice), o { errore }.
async function scontoPerAcquisto(cliente, scritto, adesso = new Date(), uid = null) {
  const codice = String(scritto || '').trim().toUpperCase()
  if (!codice) return { sconto: acquisto.scontoInCorso(cliente, adesso), uso: false }
  const doc = sconti.CODICE.test(codice) ? (await db.doc(`sconti/${codice}`).get()).data() : null
  const s = acquisto.scontoDelCodice(doc, adesso)
  if (!s) return { errore: 'Codice sconosciuto o disattivato.' }
  const uso = sconti.usoNuovo(cliente, s.codice)
  if (uso && sconti.esaurito(doc, adesso, uid)) return { errore: sconti.ESAURITO }
  return { sconto: s, uso }
}

// Tiene da parte un uso del codice per un Checkout. → false se il codice è
// esaurito. Un codice senza limite non tiene niente: non c'è da contendersi.
async function prenotaUsoCodice(codice, uid, scadenza, adesso = new Date()) {
  const ref = db.doc(`sconti/${codice}`)
  return db.runTransaction(async (t) => {
    const doc = (await t.get(ref)).data()
    if (!doc || doc.usi_massimi == null) return true
    const p = sconti.prenotaUso(doc, uid, scadenza, adesso)
    if (p.esito !== 'prenotato') return false
    t.update(ref, { prenotazioni: p.prenotazioni })
    return true
  })
}

async function liberaUsoCodice(codice, uid) {
  const ref = db.doc(`sconti/${codice}`)
  await db.runTransaction(async (t) => {
    const doc = (await t.get(ref)).data()
    if (doc) t.update(ref, sconti.prenotazioneTolta(doc, uid))
  })
}

// Un uso del codice confermato: il contatore sale, la prenotazione va via.
async function contaUsoCodice(codice, uid) {
  const ref = db.doc(`sconti/${codice}`)
  await db.runTransaction(async (t) => {
    const doc = (await t.get(ref)).data()
    if (doc) t.update(ref, sconti.usoConfermato(doc, uid))
  })
}

// IL TITOLARE PROVA UN CODICE nella scelta del piano, prima di pagare: è
// valido? quanto vale? vince sul prezzo Fondatori? Non scrive niente. Serve
// l'accesso con l'email confermata: un codice non si indovina da fuori.
exports.verificaCodiceSconto = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  if (!cliente) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  if (!String(req.data?.codice || '').trim()) throw new HttpsError('invalid-argument', 'Scrivi il codice.')
  const adesso = new Date()
  const { sconto, errore } = await scontoPerAcquisto(cliente, req.data.codice, adesso, req.auth.uid)
  if (errore) throw new HttpsError('failed-precondition', errore)
  const scelta = sceltaPulita({ piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali, intervallo: req.data?.intervallo })
  if (sconto.percentuale < 100) {
    const c = acquisto.couponSconto(sconto, { intervallo: scelta.intervallo, adesso })
    if (c.errore) throw new HttpsError('failed-precondition', c.errore)
  }
  const puoFondatore = fondatori.coperto(scelta.piano) && !cliente.abbonamento?.fondatore && fondatori.postiLiberi((await POSTI_FONDATORI().get()).data(), adesso) > 0
  const vale = sconto.percentuale === 100 ? 'codice' : acquisto.scontoCheVale({ scelta, sconto, fondatore: puoFondatore, adesso })
  return { codice: sconto.codice, percentuale: sconto.percentuale, durata_mesi: sconto.durata_mesi, gratis: sconto.percentuale === 100, vale }
})

// UN CODICE AL 100% (REQ-FLOTTA-028, l'utente: «senza passare da
// Stripe»): il piano scelto si attiva subito con lo sconto. Il locale poi
// si attiva come gli altri, da «Attiva», e col deploy automatico spento
// la richiesta aspetta l'admin.
exports.attivaConCodice = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const uid = req.auth.uid
  const ref = db.doc(`clienti/${uid}`)
  const codice = String(req.data?.codice || '').trim().toUpperCase()
  if (!sconti.CODICE.test(codice)) throw new HttpsError('failed-precondition', 'Codice sconosciuto o disattivato.')
  const refCodice = db.doc(`sconti/${codice}`)
  const prima = (await ref.get()).data()
  const istanza = prima?.slug ? (await db.doc(`istanze/${prima.slug}`).get()).data() : null
  const scelta = sceltaPulita({ piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali })
  const inVendita = await vendita()
  // In transazione col codice: l'ultimo uso lo prende uno solo.
  const esito = await db.runTransaction(async (t) => {
    const [cliente, doc] = (await Promise.all([t.get(ref), t.get(refCodice)])).map((s) => s.data())
    const fuori = cliente ? free.moduliFuoriVendita(cliente, scelta, inVendita) : []
    const e = acquisto.attivazioneConCodice({ cliente, uid, istanza, codice: doc, scelta, fuori })
    if (e.errore) return e
    t.update(ref, e.patch)
    if (e.uso) t.update(refCodice, sconti.usoConfermato(doc, uid))
    return e
  })
  if (esito.errore) throw new HttpsError('failed-precondition', esito.errore)
  return { ok: true, piano: esito.patch.piano }
})

async function liberaPosto(uid, scadenza = null) {
  await db.runTransaction(async (t) => {
    const ref = POSTI_FONDATORI()
    t.set(ref, fondatori.rilascia((await t.get(ref)).data(), uid, scadenza))
  })
}

// Il pagamento da Fondatore è confermato: il posto prenotato diventa un
// numero, sul contatore e sul cliente, nella stessa transazione.
async function confermaFondatore(uid) {
  return db.runTransaction(async (t) => {
    const ref = POSTI_FONDATORI()
    const c = fondatori.conferma((await t.get(ref)).data(), uid, new Date())
    t.set(ref, c.doc)
    const cliente = db.doc(`clienti/${uid}`)
    if (c.fondatore) t.set(cliente, { abbonamento: { fondatore: c.fondatore } }, { merge: true })
    // Ha pagato col coupon ma il posto non c'è più (webhook arrivato dopo
    // la scadenza della prenotazione): lo decide l'admin, non la regia.
    else t.set(cliente, { abbonamento: { fondatore_da_verificare: new Date().toISOString() } }, { merge: true })
    return c.esito
  })
}

// Il webhook di Stripe: la firma si verifica sul corpo grezzo, e lo stato
// dell'abbonamento segue gli eventi (aggiornamentoDaEvento). Una
// subscription si ritrova per id nel cliente che l'ha aperta.
// UNA VOLTA SOLA E IN ORDINE (REQ-FLOTTA-036, audit M4): ogni evento passa
// dal registro eventi_stripe/{event.id}, preso in carico in transazione
// prima di fare qualunque cosa; un evento già fatto si conferma senza
// rifarlo, uno che un'altra istanza sta elaborando risponde 409 e Stripe
// lo ripete più tardi. Se l'elaborazione fallisce la riga si toglie, e la
// ripetizione di Stripe riparte da capo: per questo ogni effetto resta
// ripetibile da sé (la ricarica per id di sessione, il posto Fondatori per
// uid, lo stato del cliente in ordine col suo orologio).
exports.stripeWebhook = onRequest({ ...OPTS, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('')
  const stripe = stripeClient()
  if (!stripe) return res.status(503).send('')
  let evento
  try {
    evento = stripe.webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), STRIPE_WEBHOOK_SECRET.value())
  } catch (e) {
    console.error('[stripe] firma non valida:', e?.message)
    return res.status(400).send('')
  }
  if (!eventiStripe.idEventoValido(evento.id)) return res.status(400).send('')
  const registro = db.doc(`eventi_stripe/${evento.id}`)
  const decisione = await db.runTransaction(async (t) => {
    const riga = await t.get(registro)
    const d = eventiStripe.daElaborare(riga.exists ? riga.data() : null, new Date())
    if (d !== 'elabora') return d
    const nuova = eventiStripe.presaInCarico(evento, new Date())
    t.set(registro, riga.exists ? { ...nuova, tentativi: (Number(riga.data().tentativi) || 0) + 1 } : nuova)
    return d
  })
  if (decisione === 'fatto') return res.status(200).json({ ok: true, duplicato: true })
  if (decisione === 'in corso') return res.status(409).json({ ok: false, in_corso: true })
  let esito
  try {
    esito = await elaboraEventoStripe(evento)
  } catch (e) {
    console.error(`[stripe] ${evento.type} ${evento.id}:`, e?.message || e)
    await registro.delete().catch((x) => console.error('[stripe] registro:', x?.message || x))
    return res.status(500).json({ ok: false })
  }
  await registro.update({ stato: 'fatto', fatto_il: new Date().toISOString(), esito: JSON.stringify(esito).slice(0, 200) })
  res.status(200).json(esito)
})

// Gli effetti di un evento, una volta preso in carico. → il corpo della
// risposta.
async function elaboraEventoStripe(evento) {
  // Una ricarica del credito AI (REQ-AI-003): pagamento singolo, credito
  // in più. Prima dell'abbonamento, che la ignora comunque.
  if (evento.type === 'checkout.session.completed') {
    const ricarica = ai.ricaricaDaSessione(evento.data?.object)
    if (ricarica) return { ok: true, ricarica: await accreditaRicarica(ricarica, { origine: 'stripe' }) }
  }
  // Una sessione Fondatori scaduta: il posto prenotato torna libero.
  const daLiberare = prenotazioneDaRilasciare(evento.type, evento.data?.object)
  if (daLiberare) {
    await liberaPosto(daLiberare.uid, daLiberare.scadenza)
    return { ok: true, fondatori: 'rilasciato' }
  }
  const agg = aggiornamentoDaEvento(evento.type, evento.data?.object)
  if (!agg) return { ok: true, ignorato: evento.type }
  let uid = agg.uid
  if (!uid && agg.stripe_subscription) {
    const q = await db.collection('clienti').where('abbonamento.stripe_subscription', '==', agg.stripe_subscription).limit(1).get()
    uid = q.empty ? null : q.docs[0].id
  }
  if (!uid) return { ok: true, ignorato: 'cliente non trovato' }
  const ref = db.doc(`clienti/${uid}`)
  // In transazione: due eventi dello stesso cliente insieme non si
  // scavalcano, e l'ordine si confronta col cliente com'è davvero ora.
  const scritto = await db.runTransaction(async (t) => {
    const snap = await t.get(ref)
    if (!snap.exists) return false
    const patch = eventiStripe.inOrdine(snap.data(), agg, { creato: evento.created })
    if (!patch) return false
    if (patch.abbonamento) t.set(ref, patch, { merge: true })
    else t.update(ref, { ...patch, 'abbonamento.visto_il': FieldValue.serverTimestamp() })
    return true
  })
  // Dopo l'abbonamento, che con merge non tocca abbonamento.fondatore. Anche
  // se la patch non si è scritta: il pagamento col coupon c'è stato, e la
  // conferma è idempotente (fondatori.conferma).
  const daConfermare = fondatoreDaConfermare(evento.type, evento.data?.object)
  if (daConfermare) {
    const esito = await confermaFondatore(daConfermare)
    if (esito === 'esauriti') console.error(`[fondatori] ${daConfermare}: pagato col coupon, posti esauriti: da verificare`)
  }
  // Pagato con un codice: un uso in più, anche se la patch non si è
  // scritta. L'evento passa di qui una volta sola (eventi_stripe).
  const daContare = acquisto.usoDaContare(evento.type, evento.data?.object)
  if (daContare) await contaUsoCodice(daContare.codice, daContare.uid)
  return scritto ? { ok: true } : { ok: true, ignorato: 'fuori ordine o già scritto' }
}

// ── SOSPENDERE, RIATTIVARE, CHIUDERE UN'ISTANZA (REQ-FLOTTA-008) ───────

// Il Firestore di un'istanza, da qui: un'app admin per progetto. Il
// service account di runtime della regia ha `roles/datastore.user` sul
// progetto (lo dà Terraform). Per il passaggio (REQ-FLOTTA-030) firma gli
// accessi COME l'account dell'SDK di Firebase del locale: Firebase accetta
// un accesso solo se firmato da un account del suo progetto. Serve
// roles/iam.serviceAccountTokenCreator su quell'account, e
// roles/firebaseauth.viewer sul progetto per leggere l'account del titolare.
function appDi(progetto) {
  const nome = `istanza-${progetto}`
  return (
    getApps().find((a) => a.name === nome) ||
    initializeAppCon({ projectId: progetto, serviceAccountId: `firebase-adminsdk-fbsvc@${progetto}.iam.gserviceaccount.com` }, nome)
  )
}
const firestoreDi = (progetto) => getFirestore(appDi(progetto))

// `per`: chi ha voluto lo stato (admin, pagamento, titolare). Solo una
// sospensione per il pagamento si toglie da sola quando si torna a pagare
// (REQ-FLOTTA-023): una dell'admin la toglie l'admin.
async function scriviStatoIstanza(slug, stato, motivo, { per = 'admin' } = {}) {
  const ist = (await db.doc(`istanze/${slug}`).get()).data()
  if (!ist?.progetto) throw new HttpsError('failed-precondition', 'Istanza senza progetto: non è ancora attiva.')
  // Un locale registrato come esistente (la Tana, REQ-AI-003) non riceve
  // la licenza dalla regia finché non lo si collega: «senza rompere niente».
  if (!scriveLicenza(ist)) throw new HttpsError('failed-precondition', 'Questa installazione non riceve la licenza dalla regia: si gestisce dal suo progetto.')
  await db.doc(`istanze/${slug}`).set({ licenza_stato: stato, licenza_motivo: motivo || null, licenza_dal: new Date().toISOString(), licenza_per: stato === 'attiva' ? null : per }, { merge: true })
  const scritta = await scriviLicenza(slug)
  if (!scritta.ok) throw new HttpsError('failed-precondition', scritta.perche)
}

// Dal backoffice: Sospendi, Riattiva, Chiudi. Solo col claim admin.
exports.impostaStatoIstanza = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const { slug, stato, motivo } = req.data || {}
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(slug || '')) throw new HttpsError('invalid-argument', 'Slug non valido.')
  if (!STATI_LICENZA.includes(stato)) throw new HttpsError('invalid-argument', 'Stato non valido.')
  await scriviStatoIstanza(slug, stato, motivo ? String(motivo).slice(0, 200) : null)
  // Chiuso dall'admin: i dati si conservano 90 giorni (REQ-FLOTTA-025).
  // Una sospensione sua è una pausa, e non fa partire niente.
  if (stato === 'chiusa') await conservaDati(slug, motivo ? String(motivo).slice(0, 200) : 'chiuso dall’amministratore')
  if (stato === 'attiva') await annullaConservazione(slug, req.auth.token.email || req.auth.uid)
  return { ok: true }
})

// Il ritorno al Free di chi non paga, e il suo piano quando torna a pagare.
// La licenza dell'app cambia piano, moduli e limiti; i dati restano.
async function ripiegaAlFree(cliente, azione) {
  const ref = db.doc(`istanze/${cliente.slug}`)
  const ist = (await ref.get()).data()
  if (!ist?.progetto || !scriveLicenza(ist)) return
  const ripiega = azione === 'ripiega'
  const adesso = new Date().toISOString()
  await ref.set(
    { ripiego_free: ripiega ? { dal: adesso, piano_prima: cliente.piano || null } : null, licenza_piano: ripiega ? 'free' : cliente.piano || null, licenza_scritta_il: adesso },
    { merge: true }
  )
  await scriviLicenza(cliente.slug)
}

// ── LE SCADENZE A EVENTI (REQ-FLOTTA-023) ──────────────────────────────
// Niente giri quotidiani: il locale cambia stato quando cambia lo stato del
// suo abbonamento (Stripe, o un compito alla scadenza di un pagamento a
// mano), e ogni altra scadenza (prova, eliminazione, condizioni degli
// aggiornamenti) ha un compito alla sua data. La logica sta in
// lib/scadenze.js.

// I giorni di grazia di un pagamento a mano: impostazioni/regia.giorni_grazia.
async function giorniDiGrazia() {
  const v = Number((await db.doc('impostazioni/regia').get()).data()?.giorni_grazia)
  return Number.isFinite(v) && v >= 0 ? v : scadenze.GIORNI_DI_GRAZIA
}

// Cosa succede al locale per un cambio di stato dell'abbonamento.
// Un locale fermo per il pagamento conserva i dati 90 giorni, poi si
// cancellano; se torna a pagare, la cancellazione si annulla
// (REQ-FLOTTA-025). Al Free non si cancella niente.
async function eseguiAzionePagamento(cliente, { azione, motivo }) {
  if (azione === 'sospendi' || azione === 'chiudi') {
    await scriviStatoIstanza(cliente.slug, azione === 'sospendi' ? 'sospesa' : 'chiusa', motivo, { per: 'pagamento' })
    return conservaDati(cliente.slug, motivo)
  }
  if (azione === 'riattiva') {
    await scriviStatoIstanza(cliente.slug, 'attiva', null)
    await annullaConservazione(cliente.slug, 'pagamento')
    return accodaEmail(comunica.emailStato(cliente, azione), { slug: cliente.slug, motivo: azione })
  }
  await ripiegaAlFree(cliente, azione)
  return accodaEmail(comunica.emailStato(cliente, azione), { slug: cliente.slug, motivo: azione })
}

// ── LA CONSERVAZIONE DEI DATI DI UN LOCALE FERMO (REQ-FLOTTA-025) ──────
// Un'eliminazione programmata a 90 giorni (lib/conservazione.js), con un
// avviso subito, uno a 7 giorni e uno il giorno prima: per email (la coda
// `mail` dell'estensione Trigger Email di Firebase), nella dashboard e
// nell'app (licenza.cancellazione).
async function conservaDati(slug, motivo) {
  const ref = db.doc(`istanze/${slug}`)
  if (!conserva.daConservare((await ref.get()).data())) return
  const richiesta = conserva.conservazioneChiesta({ motivo })
  // update, non set con merge: l'eliminazione di prima (annullata) si
  // sostituisce intera, senza lasciare campi suoi.
  await ref.update({ eliminazione: richiesta })
  await programma('eliminazione', slug, richiesta.quando).catch((e) => console.error(`[conservazione] ${slug}, la cancellazione:`, e?.message || e))
  await avvisiDellaCancellazione(slug, richiesta.quando)
}

// Una cancellazione appena programmata, da chiunque: il primo avviso
// subito, i compiti per gli altri, e la licenza che lo dice all'app.
async function avvisiDellaCancellazione(slug, quando) {
  for (const a of conserva.orariAvvisi(quando)) {
    await programma('avviso_dati', slug, a.il).catch((e) => console.error(`[conservazione] ${slug}, l'avviso a ${a.giorni} giorni:`, e?.message || e))
  }
  await avvisaCancellazione(slug, null).catch((e) => console.error(`[conservazione] ${slug}, il primo avviso:`, e?.message || e))
  await scriviLicenza(slug).catch((e) => console.error(`[conservazione] ${slug}, la licenza:`, e?.message || e))
}

// Un avviso al titolare. `giorni`: null il primo, poi 7 e 1. Un compito
// ripetuto non manda due email: l'avviso si segna sull'eliminazione.
async function avvisaCancellazione(slug, giorni) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (ist?.eliminazione?.stato !== 'programmata') return
  const chiave = `${ist.eliminazione.quando}:${giorni ?? 'subito'}`
  if (conserva.giaAvvisato(ist, chiave)) return
  const posta = conserva.emailAvviso(await clienteDi(slug), ist, giorni)
  await accodaEmail(posta, { slug, motivo: 'cancellazione_dati' })
  await ref.update({ 'eliminazione.avvisi': FieldValue.arrayUnion({ chiave, giorni, il: new Date().toISOString(), email: Boolean(posta) }) })
}

// Un'email nella coda `mail`: la manda l'estensione Trigger Email di
// Firebase, con l'SMTP di Resend (REQ-FLOTTA-027). Senza l'estensione resta
// in coda e parte quando c'è. Un errore qui non ferma niente.
async function accodaEmail(posta, { slug = null, motivo } = {}) {
  if (!posta) return
  await db
    .collection('mail')
    .add({ ...posta, slug, motivo, creata_il: new Date().toISOString() })
    .catch((e) => console.error(`[email] ${slug}, ${motivo}:`, e?.message || e))
}

// Il locale torna a lavorare: la conservazione si annulla.
async function annullaConservazione(slug, da) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (!conserva.daAnnullare(ist)) return
  await ref.update({ eliminazione: { ...ist.eliminazione, stato: 'annullata', annullata_il: new Date().toISOString(), annullata_da: da } })
  await scriviLicenza(slug).catch((e) => console.error(`[conservazione] ${slug}, la licenza:`, e?.message || e))
}

// Un compito per una scadenza: arriva alla data (o fra 29 giorni, e si
// riprogramma). Lo stesso compito non si programma due volte.
async function programma(tipo, chiave, quando) {
  const orario = scadenze.orarioCompito(quando)
  const coda = funzioniAdmin().taskQueue('locations/europe-west1/functions/scadenza')
  try {
    await coda.enqueue({ tipo, chiave, quando: new Date(quando).toISOString() }, { scheduleTime: orario, id: scadenze.idCompito(tipo, chiave, quando, orario) })
  } catch (e) {
    if (e?.code === 'functions/task-already-exists') return
    throw e
  }
}

// L'esecutore dei compiti. Ognuno ricontrolla prima di fare: una scadenza
// spostata o annullata nel frattempo lascia il compito senza effetto.
exports.scadenza = onTaskDispatched(
  { ...OPTS, retryConfig: { maxAttempts: 5, minBackoffSeconds: 60 }, rateLimits: { maxConcurrentDispatches: 5 }, secrets: [GITHUB_DISPATCH_TOKEN, STRIPE_SECRET_KEY] },
  async (req) => {
    const { tipo, chiave, quando } = req.data || {}
    if (!scadenze.TIPI.includes(tipo) || !chiave || !Number.isFinite(Date.parse(quando))) return
    const adesso = new Date()
    if (scadenze.daRiprogrammare(quando, adesso)) return programma(tipo, chiave, quando)
    // Un promemoria di un pagamento a mano (REQ-FLOTTA-027).
    if (tipo === 'promemoria') {
      const doc = (await db.collection('clienti').where('slug', '==', chiave).limit(1).get()).docs[0]
      const cliente = doc?.data()
      const qualeTipo = cliente && comunica.promemoriaDelCompito(cliente, new Date(quando).toISOString())
      if (!qualeTipo) return
      const chiaveAvviso = comunica.chiavePromemoria(cliente, qualeTipo)
      if (comunica.giaMandato(cliente, chiaveAvviso)) return
      const validaFino = scadenze.scadenzaPagamento(cliente, await giorniDiGrazia())
      await accodaEmail(comunica.emailPromemoria(cliente, qualeTipo, { validaFino }), { slug: chiave, motivo: `promemoria_${qualeTipo}` })
      await doc.ref.update({ avvisi_pagamento: FieldValue.arrayUnion(chiaveAvviso) })
      return
    }
    if (tipo === 'pagamento' || tipo === 'prova') {
      const doc = (await db.collection('clienti').where('slug', '==', chiave).limit(1).get()).docs[0]
      if (!doc) return
      if (tipo === 'pagamento') {
        const cliente = doc.data()
        if (!scadenze.pagamentoScaduto(cliente, quando, { adesso, giorniGrazia: await giorniDiGrazia() })) return
        // Con Stripe si chiede a Stripe com'è davvero: un rinnovo pagato il
        // cui evento si è perso sposta la scadenza invece di fermare il
        // locale. Se Stripe non risponde, la grazia è finita lo stesso.
        if (cliente.abbonamento.origine === 'stripe') {
          const sub = await stripeClient()
            ?.subscriptions.retrieve(cliente.abbonamento.stripe_subscription)
            .catch((e) => console.error(`[scadenze] ${chiave}, Stripe:`, e?.message || e))
          await doc.ref.update({ ...scadenze.esitoControlloStripe(cliente, sub || null, { statiStripe: STATI_STRIPE, fineDelPeriodo }), 'abbonamento.aggiornato_il': adesso.toISOString() })
          console.log(`[scadenze] ${chiave}: controllato su Stripe`)
          return
        }
        // Il cambio di stato fa il resto (licenzaSegueIlPiano).
        await doc.ref.update({ 'abbonamento.stato': 'non pagato', 'abbonamento.aggiornato_il': adesso.toISOString() })
        console.log(`[scadenze] ${chiave}: pagamento scaduto`)
        return
      }
      const via = prove.proveDaTogliere(doc.data(), adesso)
      if (via.length) await doc.ref.update(Object.fromEntries(via.map((id) => [`prove.${id}`, FieldValue.delete()])))
      return
    }
    const ref = db.doc(`istanze/${chiave}`)
    let ist = (await ref.get()).data()
    if (!ist) return
    // Il taglio della giornata: la licenza che toglie qualcosa arriva ora,
    // se aspetta ancora questo taglio (REQ-FLOTTA-024).
    if (tipo === 'taglio') {
      if (ist.riduzione_al_taglio?.dal !== new Date(quando).toISOString()) return
      const scritta = await scriviLicenza(chiave, { subito: true })
      console.log(`[taglio] ${chiave}: ${scritta.ok ? 'licenza scritta' : scritta.perche}`)
      return
    }
    // Un avviso prima della cancellazione dei dati (REQ-FLOTTA-025).
    if (tipo === 'avviso_dati') {
      const giorni = conserva.avvisoDelCompito(ist, new Date(quando).toISOString())
      if (giorni != null) await avvisaCancellazione(chiave, giorni)
      return
    }
    if (tipo === 'eliminazione') {
      // Novanta giorni da fermo per il pagamento: un locale ancora sospeso
      // si chiude, poi si cancella come gli altri.
      if (conserva.daAnnullare(ist) && Date.parse(ist.eliminazione.quando) <= adesso.getTime() && ist.licenza_stato === 'sospesa') {
        await scriviStatoIstanza(chiave, 'chiusa', 'dati non conservati oltre 90 giorni', { per: 'pagamento' })
        ist = (await ref.get()).data()
      }
      if (!elim.daEliminareOggi({ [chiave]: ist }, adesso).length) return
      const perche = await lanciaEliminazione(chiave)
      console.log(`[scadenze] ${chiave}, eliminazione: ${perche || 'partita'}`)
      return
    }
    const patch = aggiornamenti.promozione(ist, adesso)
    if (!patch) return
    await ref.set(patch, { merge: true })
    await scriviLicenza(chiave)
  }
)

// Un pagamento fuori da Stripe (bonifico): fino a quando è pagato. Se il
// locale era fermo per il pagamento, torna a lavorare (il cambio di stato).
exports.registraPagamento = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const doc = (await db.collection('clienti').where('slug', '==', String(req.data?.slug || '')).limit(1).get()).docs[0]
  if (!doc) throw new HttpsError('not-found', 'Cliente sconosciuto.')
  if (doc.data().abbonamento?.origine !== 'manuale') throw new HttpsError('failed-precondition', 'Vale per i piani pagati fuori da Stripe.')
  const data = scadenze.dataPagata(req.data?.pagato_fino_al)
  if (!data) throw new HttpsError('invalid-argument', 'Scrivi la data fino a cui è pagato: AAAA-MM-GG.')
  await doc.ref.update({
    'abbonamento.pagato_fino_al': data,
    'abbonamento.stato': 'attivo',
    'abbonamento.pagamento_registrato_il': new Date().toISOString(),
    'abbonamento.pagamento_registrato_da': req.auth.token.email || req.auth.uid,
  })
  const dopo = (await doc.ref.get()).data()
  await accodaEmail(comunica.emailPagamentoRicevuto(dopo), { slug: dopo.slug, motivo: 'pagamento_ricevuto' })
  return { ok: true, pagato_fino_al: data }
})

// Una volta, dopo il primo deploy di REQ-FLOTTA-023: i compiti per le
// scadenze che c'erano già (pagamenti a mano, prove, eliminazioni,
// condizioni), e il «perché» delle sospensioni per il pagamento di prima.
// Rifarlo non fa danni: lo stesso compito non si programma due volte.
exports.programmaScadenze = onCall({ ...OPTS, timeoutSeconds: 540 }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const [clienti, istanze, grazia] = await Promise.all([db.collection('clienti').get().then((q) => q.docs.map((d) => d.data())), tutteLeIstanze(), giorniDiGrazia()])
  let programmati = 0
  const errori = []
  const prova = async (descrizione, fn) => {
    try {
      await fn()
      programmati += 1
    } catch (e) {
      errori.push(`${descrizione}: ${String(e?.message || e).slice(0, 120)}`)
    }
  }
  for (const c of clienti) {
    if (!c.slug) continue
    const s = scadenze.scadenzaPagamento(c, grazia)
    if (s && c.abbonamento.stato === 'attivo') await prova(`${c.slug} pagamento`, () => programma('pagamento', c.slug, s))
    for (const p of comunica.orariPromemoria(c)) await prova(`${c.slug} promemoria ${p.tipo}`, () => programma('promemoria', c.slug, p.il))
    for (const [id, p] of Object.entries(c.prove || {})) await prova(`${c.slug} prova ${id}`, () => programma('prova', c.slug, p.scade_il))
  }
  for (const [slug, ist] of Object.entries(istanze)) {
    if (ist.eliminazione?.stato === 'programmata') {
      await prova(`${slug} eliminazione`, () => programma('eliminazione', slug, ist.eliminazione.quando))
      for (const a of conserva.orariAvvisi(ist.eliminazione.quando)) await prova(`${slug} avviso a ${a.giorni} giorni`, () => programma('avviso_dati', slug, a.il))
    }
    if (ist.condizioni_prossime?.dal) await prova(`${slug} condizioni`, () => programma('condizioni', slug, ist.condizioni_prossime.dal))
    if (ist.riduzione_al_taglio?.dal) await prova(`${slug} taglio`, () => programma('taglio', slug, ist.riduzione_al_taglio.dal))
    if (ist.licenza_stato === 'sospesa' && !ist.licenza_per && /pagamento non ricevuto/.test(ist.licenza_motivo || '')) {
      await db.doc(`istanze/${slug}`).set({ licenza_per: 'pagamento' }, { merge: true })
    }
  }
  return { ok: true, programmati, errori }
})

// ── GLI AGGIORNAMENTI DELLA FLOTTA (REQ-FLOTTA-009) ───────────────────
// L'app di base è tana-drink: ogni rilascio si porta sui locali che si
// decide dal backoffice («Aggiorna», «Aggiorna tutte»). La versione la
// riferisce il workflow, con l'esito.
// Lancia l'aggiornamento di un locale e lo segna «in corso», con la
// versione di prima (il tag a cui tornare se va male). Ritorna null se è
// partito, o il perché se non è partito.
async function lanciaAggiornamento(slug, ref, { rilascio = null, ritorno = false, profilo = null } = {}) {
  const istRef = db.doc(`istanze/${slug}`)
  const ist = (await istRef.get()).data()
  if (!ist || ist.stato !== 'attiva') return 'L’istanza non è attiva.'
  // Un locale registrato come esistente (la Tana, REQ-AI-003) si aggiorna
  // dal suo repository, finché l'admin non lo affida alla regia
  // (REQ-FLOTTA-018): allora il workflow della flotta pubblica sul SUO
  // progetto, con la sua cartella in clienti/ e le sue chiavi della build.
  if (!rilasci.daFlotta(ist)) return 'Questa installazione si aggiorna dal suo repository, non dalla flotta.'
  const esistente = ist.origine === 'esistente'
  const cliente = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]?.data()
  // Il titolare diventa admin a ogni deploy (REQ-FLOTTA-029); un locale
  // esistente (la Tana) ha i suoi admin, e la regia non ne aggiunge.
  const datiIstanza = { slug, nome_locale: cliente?.nome_locale, email: esistente ? '' : cliente?.email || '', uid: esistente ? '' : cliente?.uid || '', ...(esistente ? { progetto: ist.progetto, cliente: ist.cliente, build: ist.build } : {}) }
  // PRIMA DEL DEPLOY, LA LICENZA PROTETTA (BUG-125 di tana-drink): con
  // l'app nuova un locale senza licenza/attuale si ferma. L'app arriva a un
  // locale solo da qui (rilasci, «Aggiorna subito», ritorni, il Free che
  // compra), quindi scriverla qui vuol dire che nessun locale la riceve
  // senza la sua licenza, senza aspettare «Allinea tutte». Se non si
  // scrive, l'aggiornamento non parte.
  const licenza = await scriviLicenza(slug).catch((e) => ({ ok: false, perche: e?.message || String(e) }))
  if (!licenza.ok) return `La licenza non si è scritta (${licenza.perche}): l’aggiornamento non parte.`
  const res = await dispatchGitHub(WORKFLOW_AGGIORNA, dispatchAggiornamento(datiIstanza, { ref: REF, app: ref, ambiente: AMBIENTE_FLOTTA, profilo: profilo || ist.profilo || 'completo' }))
  const adesso = new Date()
  if (res.status !== 204) {
    // Non è partito: si segna fallito, così il rilascio si ferma e si vede.
    await istRef.set({ aggiornamento: { ...rilasci.aggiornamentoLanciato(ist, ref, { rilascio, ritorno, adesso }), stato: 'fallito', finito_il: adesso.toISOString(), errore: `GitHub ${res.status}: il workflow non è partito` } }, { merge: true })
    return `GitHub ${res.status}`
  }
  await istRef.set({ aggiornamento: rilasci.aggiornamentoLanciato(ist, ref, { rilascio, ritorno, adesso }), aggiornamento_chiesto_il: adesso.toISOString(), aggiornamento_ref: ref }, { merge: true })
  return null
}

async function tutteLeIstanze() {
  return Object.fromEntries((await db.collection('istanze').get()).docs.map((d) => [d.id, d.data()]))
}

// Dopo ogni esito o azione: i rilasci aperti si fermano o si chiudono
// (dopoEsito) e il riepilogo per il backoffice si riscrive.
async function ricalcolaRilasci() {
  const aperti = (await db.collection('rilasci').where('stato', 'in', rilasci.APERTI).get()).docs
  if (!aperti.length) return
  const istanze = await tutteLeIstanze()
  for (const d of aperti) {
    const r = rilasci.dopoEsito(d.data(), istanze) || d.data()
    await d.ref.set(rilasci.conRiepilogo(r, istanze))
  }
}

exports.aggiornaIstanza = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN] }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const ref = String(req.data?.ref || REF_APP)
  const perche = await lanciaAggiornamento(slug, ref)
  if (perche) throw new HttpsError('failed-precondition', perche)
  return { ok: true, ref }
})

// ── I RILASCI A ONDATE (REQ-FLOTTA-012) ───────────────────────────────
// Un rilascio alla volta. Azioni dell'admin:
//   crea {ref, obbligatorio} fotografa le ondate per il tag vX.Y.Z;
//                         obbligatorio: arriva a tutti (REQ-FLOTTA-020)
//   avanza {ref}          avvia l'ondata successiva (la prima, o riprende
//                         un rilascio fermo quando l'ondata è a posto)
//   riprova {ref, slug}   rilancia un aggiornamento fallito
//   indietro {slug}       riporta un locale alla versione di prima
//   ferma {ref, perche}   nessuna ondata nuova finché non si riprende
//   annulla {ref}         il rilascio si chiude qui (i locali restano
//                         come sono)
//   gruppo {slug, gruppo} prova, pilota o generale
//   modalita {slug, modalita} obbligatori, a_scelta o null (REQ-FLOTTA-020)
// Un'ondata grande lancia molti workflow uno dopo l'altro: tempo lungo.
exports.gestisciRilascio = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN], timeoutSeconds: 540 }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const { azione } = req.data || {}
  const tag = String(req.data?.ref || '')
  const slug = String(req.data?.slug || '')
  const rilascioRef = rilasci.TAG.test(tag) ? db.doc(`rilasci/${tag}`) : null
  const no = (perche) => {
    throw new HttpsError('failed-precondition', perche)
  }
  try {
    if (azione === 'gruppo') {
      const gruppo = String(req.data?.gruppo || '')
      if (!rilasci.GRUPPI.includes(gruppo)) no('Gruppo non valido.')
      const ist = (await db.doc(`istanze/${slug}`).get()).data()
      if (!ist) no('Istanza non trovata.')
      await db.doc(`istanze/${slug}`).set({ gruppo_rilascio: gruppo }, { merge: true })
      return { ok: true }
    }
    // Come si aggiorna questo locale, al di là delle regole (REQ-FLOTTA-020):
    // 'obbligatori', 'a_scelta', o null per seguire le regole.
    if (azione === 'modalita') {
      const modalita = req.data?.modalita ?? null
      if (modalita !== null && !aggiornamenti.MODALITA.includes(modalita)) no('Modalità non valida.')
      const ist = (await db.doc(`istanze/${slug}`).get()).data()
      if (!ist) no('Istanza non trovata.')
      await db.doc(`istanze/${slug}`).set({ modalita_aggiornamenti: modalita }, { merge: true })
      await scriviLicenza(slug)
      return { ok: true }
    }
    if (azione === 'indietro') {
      const ist = (await db.doc(`istanze/${slug}`).get()).data()
      const versione = rilasci.versioneDiRitorno(ist)
      if (!versione) no('Non c’è una versione precedente a cui tornare.')
      const perche = await lanciaAggiornamento(slug, versione, { rilascio: ist.aggiornamento?.rilascio || null, ritorno: true })
      if (perche) no(perche)
      await ricalcolaRilasci()
      return { ok: true, ref: versione }
    }
    if (!rilascioRef) no('Un rilascio è un tag vX.Y.Z di tana-drink, non un ramo.')
    if (azione === 'crea') {
      const aperti = await db.collection('rilasci').where('stato', 'in', rilasci.APERTI).get()
      if (!aperti.empty) no(`C’è già un rilascio aperto: ${aperti.docs[0].id}. Finiscilo o annullalo prima.`)
      const esiste = (await rilascioRef.get()).data()
      if (esiste && esiste.stato !== 'annullato') no(`Il rilascio ${tag} c’è già.`)
      const istanze = await tutteLeIstanze()
      const nuovo = rilasci.nuovoRilascio(tag, istanze, { da: req.auth.token.email || req.auth.uid, obbligatorio: req.data?.obbligatorio === true })
      await rilascioRef.set(rilasci.conRiepilogo(nuovo, istanze))
      return { ok: true }
    }
    const rilascio = (await rilascioRef.get()).data()
    if (!rilascio) no('Rilascio non trovato.')
    if (azione === 'avanza') {
      const istanze = await tutteLeIstanze()
      const { rilascio: avanti, daLanciare } = rilasci.avanzamento(rilascio, istanze)
      // Prima si scrive il rilascio, poi si lancia: un secondo clic trova
      // l'ondata già partita e si ferma.
      await rilascioRef.set(rilasci.conRiepilogo(avanti, istanze))
      // Ognuno secondo la sua regola (REQ-FLOTTA-020): si pubblica, si
      // propone al titolare, o il suo piano non lo comprende.
      const nonPartiti = []
      const proposti = []
      const esclusi = []
      let changelog = null
      for (const s of daLanciare) {
        const cosa = aggiornamenti.cosaFareNelRilascio(istanze[s], await clienteDi(s), avanti)
        if (cosa === 'escludi') {
          esclusi.push(s)
          continue
        }
        if (cosa === 'proponi') {
          // Le note si leggono una volta per ondata; senza, la proposta
          // esce lo stesso, col solo numero di versione.
          if (changelog === null) changelog = await changelogAl(tag).catch((e) => (console.error('[aggiornamenti] note:', e?.message || e), ''))
          await proponiAggiornamento(s, tag, { rilascio: tag, changelog })
          proposti.push(s)
          continue
        }
        const perche = await lanciaAggiornamento(s, tag, { rilascio: tag })
        if (perche) nonPartiti.push(`${s}: ${perche}`)
      }
      if (esclusi.length) await rilascioRef.set({ non_inclusi: FieldValue.arrayUnion(...esclusi) }, { merge: true })
      await ricalcolaRilasci()
      const lanciati = daLanciare.length - nonPartiti.length - proposti.length - esclusi.length
      return { ok: true, ondata: avanti.ondate[avanti.ondata].nome, lanciati, proposti: proposti.length, esclusi: esclusi.length, nonPartiti }
    }
    if (azione === 'riprova') {
      if (!rilascio.ondate.some((o) => o.slugs.includes(slug))) no('Questo locale non è nel rilascio.')
      const perche = await lanciaAggiornamento(slug, tag, { rilascio: tag })
      if (perche) no(perche)
      await ricalcolaRilasci()
      return { ok: true }
    }
    if (azione === 'ferma' || azione === 'annulla') {
      if (!rilasci.APERTI.includes(rilascio.stato)) no('Il rilascio non è aperto.')
      const adesso = new Date().toISOString()
      const patch = azione === 'ferma'
        ? { stato: 'fermo', fermato_perche: String(req.data?.perche || 'Fermato dall’amministratore').slice(0, 200) }
        : { stato: 'annullato', annullato_il: adesso }
      await rilascioRef.set({ ...patch, aggiornato_il: adesso }, { merge: true })
      return { ok: true }
    }
    no('Azione sconosciuta.')
  } catch (e) {
    if (e instanceof rilasci.RilascioNonValido) throw new HttpsError('failed-precondition', e.message)
    throw e
  }
})

// ── GLI AGGIORNAMENTI OBBLIGATORI O A SCELTA (REQ-FLOTTA-020) ─────────
// Le regole le decide l'admin (impostazioni/aggiornamenti); ogni locale le
// prende al suo rinnovo, con un avviso prima. La logica sta in
// lib/aggiornamenti.js; qui si legge, si scrive e si lancia.

async function regoleAggiornamenti() {
  return aggiornamenti.regolePulite((await db.doc('impostazioni/aggiornamenti').get()).data())
}

// Col suo uid, che è l'id del documento: serve per le sue sottoraccolte.
async function clienteDi(slug) {
  const d = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]
  return d ? { uid: d.id, ...d.data() } : null
}

// I temi su misura del locale (REQ-FLOTTA-040), per la licenza: con gli
// stili a ricetta pubblicati, che servono a controllarli. Si leggono gli
// stili solo se il locale ha temi: quasi nessuno ne ha.
async function temiSuMisuraDi(cliente) {
  if (!cliente?.uid) return {}
  const temiSuMisura = (await db.collection(`clienti/${cliente.uid}/temi_su_misura`).get()).docs.map((d) => d.data())
  if (!temiSuMisura.length) return { temiSuMisura }
  const docsStili = (await db.collection('stili').get()).docs.map((d) => d.data())
  return { temiSuMisura, stiliRicetta: stili.catalogoStili(docsStili).map((s) => s.id) }
}

// Il CHANGELOG di tana-drink a un tag.
async function changelogAl(tag) {
  const res = await fetch(`https://raw.githubusercontent.com/${APP_REPO}/${tag}/CHANGELOG.md`)
  if (!res.ok) throw new Error(`CHANGELOG di ${tag}: GitHub ${res.status}`)
  return res.text()
}

// ── LA LICENZA DI UN LOCALE, IN UN POSTO SOLO (BUG-125 di tana-drink) ──
// Ogni cambio della licenza passa da qui: piano, moduli, prove, stato,
// ritorno al Free, aggiornamenti. Chi la cambia scrive prima i dati della
// regia (cliente, istanza), poi chiama questa, che CALCOLA la licenza intera
// da quei dati (licenzaProtetta) e la scrive:
// - in licenza/attuale, che l'app legge e nessuno dall'app scrive;
// - in settings/bar.licenza, finché tutti i locali non hanno l'app che legge
//   solo licenza/attuale. Poi questa riga si toglie, e il campo si cancella.
// Mai copiata da settings/bar: lì un bartender la può aver riscritta.
// Sull'istanza restano la regola degli aggiornamenti, che la dashboard del
// titolare legge, e l'esito. Un locale esistente che non riceve la licenza
// dalla regia (la Tana) ha solo la regola.
const LICENZA_PROTETTA = 'licenza/attuale'
const riceveLicenza = (ist) => Boolean(ist?.progetto) && ist.stato === 'attiva' && scriveLicenza(ist)

// UNA LICENZA CHE TOGLIE QUALCOSA aspetta il taglio della giornata del
// locale (REQ-FLOTTA-024, lib/taglio.js): fino ad allora resta quella di
// prima più quello che la nuova aggiunge, e un compito «taglio» scrive la
// nuova. `subito`: il taglio è arrivato, o il locale nasce adesso.
//
// licenza/attuale non si cancella mai (tana-drink, 01/11/2026): senza
// documento l'app si ferma, e le sue regole lo leggono come «nessun
// limite». Un locale si ferma con lo stato, sospesa o chiusa.
async function scriviLicenza(slug, { subito = false } = {}) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (!ist) return { ok: false, perche: 'Istanza non trovata.' }
  const cliente = await clienteDi(slug)
  const opzioni = { slug, regiaUrl: REGIA_URL, sceltaUrl: SCELTA_URL, giorniGrazia: await giorniDiGrazia(), ...(await temiSuMisuraDi(cliente)) }
  const { modalita, inclusi, motivo } = licenzaProtetta(ist, cliente, opzioni).aggiornamenti
  await ref.set({ regola_aggiornamenti: { modalita, inclusi, motivo } }, { merge: true })
  if (!riceveLicenza(ist)) return { ok: true, scritta: false }
  // Senza cliente la licenza sarebbe quella di un piano base inventato.
  if (!cliente) return { ok: false, perche: 'Nessun cliente per questo locale: la licenza non si calcola.' }
  const istanza = firestoreDi(ist.progetto)
  const [scritta, bar] = await Promise.all([istanza.doc(LICENZA_PROTETTA).get(), istanza.doc('settings/bar').get()])
  // valida_fino cade al taglio della giornata del locale (REQ-FLOTTA-024).
  const lic = licenzaProtetta(ist, cliente, { ...opzioni, oraTaglio: taglio.oraDelTaglio(bar.data()) })
  const { licenza, riduzioni } = taglio.licenzaDaScrivere(scritta.exists ? scritta.data() : null, lic, { subito, statoAlTaglio: ist.licenza_per === 'pagamento' })
  let alTaglio = null
  let perche = null
  if (riduzioni.length) {
    alTaglio = { dal: taglio.prossimoTaglio(new Date(), taglio.oraDelTaglio(bar.data())).toISOString(), cosa: riduzioni }
    // Senza il compito la riduzione non arriverebbe mai: la licenza di
    // prima si scrive lo stesso (non toglie niente), e il problema si vede
    // sulla scheda del locale. «Allinea» riprova.
    await programma('taglio', slug, alTaglio.dal).catch((e) => {
      perche = `La riduzione al taglio non si è programmata: ${String(e?.message || e).slice(0, 160)}`
    })
  }
  // Con valida_fino_ts, la scadenza che le regole sanno leggere.
  const doc = perIlDatabase(licenza, (d) => Timestamp.fromDate(d))
  await istanza.doc(LICENZA_PROTETTA).set(doc)
  // mergeFields: il campo licenza si sostituisce intero, il resto di
  // settings/bar (le impostazioni del locale) non si tocca.
  await istanza.doc('settings/bar').set({ licenza: doc }, { mergeFields: ['licenza'] })
  await ref.update({ licenza_protetta: { ok: !perche, perche, controllata_il: lic.scritta_il }, riduzione_al_taglio: alTaglio })
  return { ok: true, scritta: true }
}

// La verifica di un locale: licenza/attuale c'è, è uguale a
// settings/bar.licenza ed è quella che dicono i dati della regia.
async function verificaLicenza(slug) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  const istanza = firestoreDi(ist.progetto)
  const [protetta, bar] = await Promise.all([istanza.doc(LICENZA_PROTETTA).get(), istanza.doc('settings/bar').get()])
  const cliente = await clienteDi(slug)
  const calcolata = licenzaProtetta(ist, cliente, { slug, regiaUrl: REGIA_URL, sceltaUrl: SCELTA_URL, giorniGrazia: await giorniDiGrazia(), oraTaglio: taglio.oraDelTaglio(bar.data()), ...(await temiSuMisuraDi(cliente)) })
  // Con una riduzione che aspetta il taglio, quella giusta è la licenza di
  // prima più le aggiunte (REQ-FLOTTA-024).
  const attesa = ist.riduzione_al_taglio && protetta.exists ? taglio.licenzaDaScrivere(protetta.data(), calcolata, { statoAlTaglio: ist.licenza_per === 'pagamento' }).licenza : calcolata
  let perche = null
  if (!protetta.exists) perche = 'Manca licenza/attuale: con l’app nuova il locale si ferma.'
  else if (!stessaLicenza(protetta.data(), bar.data()?.licenza)) perche = 'licenza/attuale è diversa da settings/bar.licenza.'
  else if (!stessaLicenza(protetta.data(), attesa)) perche = 'La licenza non è quella che dicono i dati della regia.'
  else if (!scadenzaCoerente(protetta.data())) perche = 'Manca valida_fino_ts, o non è valida_fino: per le regole la licenza non scadrebbe.'
  await ref.set({ licenza_protetta: { ok: !perche, perche, controllata_il: new Date().toISOString() } }, { merge: true })
  return { slug, ok: !perche, perche }
}

// Tutti i locali che ricevono la licenza: «allinea» la riscrive e verifica,
// «verifica» guarda soltanto. L'esito resta in controlli/licenze, che legge
// solo l'admin. Prima del rilascio dell'app con BUG-125, i problemi devono
// essere zero.
async function controllaLicenze({ allinea = false } = {}) {
  const istanze = await tutteLeIstanze()
  const slugs = Object.entries(istanze)
    .filter(([, ist]) => riceveLicenza(ist))
    .map(([slug]) => slug)
    .sort()
  const problemi = []
  for (const slug of slugs) {
    try {
      if (allinea) {
        const scritta = await scriviLicenza(slug)
        if (!scritta.ok) {
          problemi.push({ slug, perche: scritta.perche })
          continue
        }
      }
      const v = await verificaLicenza(slug)
      if (!v.ok) problemi.push({ slug, perche: v.perche })
    } catch (e) {
      problemi.push({ slug, perche: String(e?.message || e).slice(0, 200) })
    }
  }
  const esito = { controllata_il: new Date().toISOString(), allineata: allinea, totale: slugs.length, pronte: slugs.length - problemi.length, problemi }
  await db.doc('controlli/licenze').set(esito)
  return esito
}

exports.gestisciLicenze = onCall({ ...OPTS, timeoutSeconds: 540 }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const azione = req.data?.azione
  if (!['allinea', 'verifica'].includes(azione)) throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
  return controllaLicenze({ allinea: azione === 'allinea' })
})

// La proposta di un rilascio al titolare, con le note dalla sua versione.
async function proponiAggiornamento(slug, tag, { rilascio = null, changelog = '' } = {}) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  const note = aggiornamenti.noteTra(changelog, ist?.versione, tag)
  await ref.update({ proposta_aggiornamento: aggiornamenti.nuovaProposta(tag, { rilascio, note }) })
  await scriviLicenza(slug).catch((e) => console.error(`[aggiornamenti] ${slug}:`, e?.message || e))
}

// La scelta del titolare, dall'app o dalla dashboard: «aggiorna» lancia il
// workflow come un'ondata, «salta» lascia il locale dov'è. Ritorna null, o
// il perché se l'aggiornamento non è partito.
// La stessa scelta che arriva due volte (il titolare riprova se la risposta
// tarda) non fa danni: «aggiorna» si prende la proposta in una transazione
// prima di lanciare, e il secondo trova GIA_SCELTA. Con un lancio non
// partito la presa si lascia, e si può riprovare.
const GIA_SCELTA = 'Questa scelta è già stata fatta.'
async function applicaScelta(slug, scelta, { il = new Date().toISOString(), da = null } = {}) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  const p = ist?.proposta_aggiornamento
  if (!p?.attesa) return GIA_SCELTA
  // Il piano può aver smesso di comprenderli dopo la proposta.
  if (scelta === 'aggiorna' && !aggiornamenti.regolaDi(ist, await clienteDi(slug)).inclusi) return 'Il piano del locale non comprende più gli aggiornamenti.'
  const fatta = { scelta, scelta_il: il, scelta_da: da, scelta_letta_il: il }
  if (scelta === 'aggiorna') {
    const presa = await db.runTransaction(async (tx) => {
      const ora = (await tx.get(ref)).data()?.proposta_aggiornamento
      if (!aggiornamenti.puoPrendere(ora, p.tag, new Date())) return false
      tx.update(ref, { 'proposta_aggiornamento.presa_il': new Date().toISOString() })
      return true
    })
    if (!presa) return GIA_SCELTA
    const perche = await lanciaAggiornamento(slug, p.tag, { rilascio: p.rilascio })
    if (perche) {
      await ref.update({ 'proposta_aggiornamento.presa_il': null })
      return perche
    }
    await ref.update({ proposta_aggiornamento: { ...p, ...fatta, attesa: false, presa_il: null } })
  } else {
    await ref.update({ proposta_aggiornamento: { ...p, ...fatta, saltata_il: il } })
  }
  await scriviLicenza(slug).catch((e) => console.error(`[aggiornamenti] ${slug}:`, e?.message || e))
  await ricalcolaRilasci().catch((e) => console.error('[rilasci] ricalcolo dopo una scelta:', e?.message || e))
  return null
}

// L'admin cambia le regole: chi è già attivo le prende al suo rinnovo (o
// dopo il preavviso) e riceve l'avviso adesso, nell'app e nella dashboard.
exports.impostaRegoleAggiornamenti = onCall({ ...OPTS, timeoutSeconds: 540 }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const regole = aggiornamenti.regolePulite(req.data)
  const adesso = new Date()
  await db.doc('impostazioni/aggiornamenti').set({ ...regole, cambiato_il: adesso.toISOString(), cambiato_da: req.auth.token.email || req.auth.uid })
  const [istanze, clienti] = await Promise.all([tutteLeIstanze(), db.collection('clienti').get().then((q) => q.docs.map((d) => d.data()))])
  const perSlug = Object.fromEntries(clienti.map((c) => [c.slug, c]))
  let avvisati = 0
  const nonScritti = []
  for (const [slug, ist] of Object.entries(istanze)) {
    const patch = aggiornamenti.cambioPerIstanza(ist, perSlug[slug], regole, adesso)
    if (!patch) continue
    await db.doc(`istanze/${slug}`).set(patch, { merge: true })
    if (patch.avviso_aggiornamenti) avvisati += 1
    if (patch.condizioni_prossime?.dal) await programma('condizioni', slug, patch.condizioni_prossime.dal).catch((e) => console.error(`[scadenze] ${slug}, condizioni:`, e?.message || e))
    try {
      await scriviLicenza(slug)
    } catch (e) {
      nonScritti.push(slug)
      console.error(`[aggiornamenti] ${slug}:`, e?.message || e)
    }
  }
  return { ok: true, avvisati, nonScritti }
})

// La scelta dalla dashboard del titolare: la stessa che può fare nell'app.
exports.sceltaAggiornamento = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  if (!cliente?.slug) throw new HttpsError('failed-precondition', 'Nessun locale collegato a questo account.')
  const ist = (await db.doc(`istanze/${cliente.slug}`).get()).data()
  const scelta = aggiornamenti.sceltaValida({ tag: String(req.data?.tag || ''), scelta: req.data?.scelta, il: new Date().toISOString() }, ist?.proposta_aggiornamento)
  if (!scelta) throw new HttpsError('failed-precondition', 'Questa proposta non è più valida: ricarica la pagina.')
  const perche = await applicaScelta(cliente.slug, scelta, { da: req.auth.token.email || req.auth.uid })
  if (perche) throw new HttpsError('failed-precondition', perche)
  return { ok: true, scelta }
})

// La scelta dall'app: il titolare tocca «Aggiorna» o «Salta» e l'app chiama
// qui col suo token d'accesso (Authorization: Bearer <ID token>, corpo
// { tag, scelta }). La regia riconosce il locale dal progetto del token, lo
// verifica con quel progetto, controlla che sia il titolare e applica la
// scelta subito. Niente chiavi nel browser e niente giri a tempo; va bene
// anche per il Free, che non ha Functions. Il token è nell'intestazione e
// non ci sono cookie, quindi la chiamata si apre a qualunque origine.
exports.sceltaDallApp = onRequest({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN], cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
  const token = aggiornamenti.bearerDi(req.get('authorization'))
  const progetto = aggiornamenti.progettoDelToken(token)
  if (!progetto) return res.status(401).json({ errore: 'Serve l’accesso.' })
  const trovata = (await db.collection('istanze').where('progetto', '==', progetto).limit(1).get()).docs[0]
  const ist = trovata?.data()
  if (!ist || !riceveLicenza(ist)) return res.status(404).json({ errore: 'Locale sconosciuto.' })
  let chi
  try {
    chi = await getAuth(appDi(progetto)).verifyIdToken(token)
  } catch {
    return res.status(401).json({ errore: 'Accesso non valido: entra di nuovo.' })
  }
  if (!aggiornamenti.eTitolare(chi)) return res.status(403).json({ errore: 'La sceglie il titolare.' })
  const corpo = aggiornamenti.corpoScelta(req.body)
  if (!corpo) return res.status(400).json({ errore: 'Scelta non valida.' })
  const scelta = aggiornamenti.sceltaValida({ ...corpo, il: new Date().toISOString() }, ist.proposta_aggiornamento)
  if (!scelta) return res.status(409).json({ errore: 'Questa proposta non è più valida.' })
  const perche = await applicaScelta(trovata.id, scelta, { da: chi.email || chi.uid })
  if (perche === GIA_SCELTA) return res.status(409).json({ errore: GIA_SCELTA })
  if (perche) return res.status(502).json({ errore: perche })
  return res.status(200).json({ ok: true, scelta })
})

// ── IL PASSAGGIO FRA LA REGIA E L'APP DEL LOCALE (REQ-FLOTTA-030) ──────
// Le regole in lib/passaggio.js. I codici stanno in passaggi/{impronta}:
// li scrivono e li cancellano solo le Functions.

// I dati del titolare (nome, indirizzo, telefono, intestazione fiscale)
// nelle impostazioni dell'app, solo dove sono vuoti. Un errore non ferma
// niente: si riprova al prossimo deploy.
async function scriviDatiDelLocale(slug) {
  try {
    const ist = (await db.doc(`istanze/${slug}`).get()).data()
    if (!riceveLicenza(ist)) return
    const cliente = await clienteDi(slug)
    if (!cliente) return
    const bar = firestoreDi(ist.progetto).doc('settings/bar')
    const patch = passa.soloIVuoti((await bar.get()).data(), passa.datiDelLocale(cliente))
    if (Object.keys(patch).length) await bar.set(patch, { merge: true })
  } catch (e) {
    console.error(`[dati del locale] ${slug}:`, e?.message || e)
  }
}

// Un codice nuovo per un passaggio: l'impronta nel database, il codice
// solo nella risposta.
async function creaPassaggio(dati) {
  const codice = passa.nuovoCodice()
  await db.doc(`passaggi/${passa.impronta(codice)}`).set(passa.nuovoPassaggio(dati))
  return codice
}

// «Apri la tua app»: il titolare, entrato nella regia, passa nella sua app.
exports.passaggioVersoApp = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  const ist = cliente?.slug ? (await db.doc(`istanze/${cliente.slug}`).get()).data() : null
  if (!ist?.progetto || ist.stato !== 'attiva' || !ist.url) throw new HttpsError('failed-precondition', 'La tua app non è ancora attiva.')
  // La demo non ha titolare né accessi veri (REQ-FLOTTA-019).
  if (eDemo(ist)) throw new HttpsError('failed-precondition', 'La demo si apre dal suo indirizzo, senza accesso.')
  const utente = await getAuth(appDi(ist.progetto))
    .getUserByEmail(cliente.email)
    .catch((e) => (e?.code === 'auth/user-not-found' ? null : Promise.reject(e)))
  const ok = passa.titolareNelLocale(utente, cliente)
  if (!ok.ok) throw new HttpsError('failed-precondition', ok.perche)
  const codice = await creaPassaggio({ verso: 'app', progetto: ist.progetto, uid: utente.uid, url: ist.url })
  return { url: `${ist.url.replace(/\/$/, '')}/#accesso-regia=${codice}` }
})

// «Area clienti»: dall'app, il titolare passa nella regia. Come la
// presentazione: POST con `Authorization: Bearer <ID token>` del locale,
// appena rinnovato. Risponde { url } da aprire.
exports.passaggioVersoRegia = onRequest({ ...OPTS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
  if (!REGIA_URL) return res.status(503).json({ errore: 'La regia non sa il suo indirizzo.' })
  const token = aggiornamenti.bearerDi(req.get('authorization'))
  const progetto = aggiornamenti.progettoDelToken(token)
  if (!progetto) return res.status(401).json({ errore: 'Serve l’accesso.' })
  const trovata = (await db.collection('istanze').where('progetto', '==', progetto).limit(1).get()).docs[0]
  const ist = trovata?.data()
  if (!ist || ist.stato === 'eliminata') return res.status(404).json({ errore: 'Locale sconosciuto.' })
  let chi
  try {
    chi = await getAuth(appDi(progetto)).verifyIdToken(token)
  } catch {
    return res.status(401).json({ errore: 'Accesso non valido: entra di nuovo.' })
  }
  const cliente = await clienteDi(trovata.id)
  const ok = passa.titolareDallApp(chi, cliente)
  if (!ok.ok) return res.status(403).json({ errore: ok.perche })
  const codice = await creaPassaggio({ verso: 'regia', uid: cliente.uid, url: REGIA_URL })
  return res.status(200).json({ url: `${REGIA_URL.replace(/\/$/, '')}/accesso#accesso-regia=${codice}` })
})

// Lo scambio: il codice, una volta sola e solo dal suo sito, diventa un
// accesso firmato per il progetto giusto. `{ codice }` → `{ token }`.
exports.scambiaPassaggio = onRequest({ ...OPTS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
  const codice = passa.codiceDelCorpo(req.body)
  if (!codice) return res.status(400).json({ errore: 'Codice non valido.' })
  const ref = db.doc(`passaggi/${passa.impronta(codice)}`)
  // Una volta sola: lo si legge e lo si cancella nella stessa transazione.
  const esito = await db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() || null
    const v = passa.passaggioValido(doc, { origin: req.get('origin') })
    if (doc) tx.delete(ref)
    return { ...v, doc }
  })
  if (!esito.ok) return res.status(403).json({ errore: esito.perche })
  const { verso, progetto, uid } = esito.doc
  try {
    const token = await getAuth(verso === 'app' ? appDi(progetto) : undefined).createCustomToken(uid)
    return res.status(200).json({ token })
  } catch (e) {
    console.error(`[passaggio] verso ${verso} ${progetto || 'regia'}:`, e?.message || e)
    return res.status(503).json({ errore: 'L’accesso non si è firmato: riprova fra poco.' })
  }
})

// ── IL CATALOGO DEI TEMI (REQ-FLOTTA-032, REQ-MENU-023 di tana-drink) ──
// I temi stanno in temi/{id}, con lo stato bozza, pubblicato o ritirato.
// Le regole in lib/temi.js.

// Il catalogo pubblico: GET, senza token, con il CORS aperto, perché lo
// legge l'app dal dominio di ogni locale, anche la Tana, che alla regia non
// è collegata per la licenza. → 200 { temi: [...] } (solo i pubblicati).
// L'app lo legge all'apertura del marketplace, mai a tempo: cinque minuti
// di cache bastano.
exports.catalogoTemi = onRequest({ ...OPTS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'GET') return res.status(405).json({ errore: 'Solo GET.' })
  // Tutti i documenti, non solo i pubblicati: uno ritirato nel database
  // deve coprire quello del repository con lo stesso id.
  const [docsTemi, docsStili] = await Promise.all(['temi', 'stili'].map((c) => db.collection(c).get().then((q) => q.docs.map((d) => d.data()))))
  // Gli stili a ricetta (REQ-FLOTTA-034): un tema li può usare solo se
  // sono pubblicati.
  const catalogoStili = stili.catalogoStili(docsStili)
  res.set('Cache-Control', 'public, max-age=300')
  return res.status(200).json({ temi: temi.catalogoPubblico(docsTemi, undefined, { stiliRicetta: catalogoStili.map((s) => s.id) }), stili: catalogoStili })
})

// Il backoffice: salvare, pubblicare, ritirare un tema. Solo l'admin.
exports.gestisciTemi = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const azione = req.data?.azione
  const id = String((azione === 'salva' ? req.data?.tema?.id : req.data?.id) || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Identificativo del tema non valido.')
  const ref = db.doc(`temi/${id}`)
  // Un tema del repository senza copia nel database: si ritira (o si
  // ripubblica) scrivendone la copia, che vince sul repository.
  const nelDatabase = (await ref.get()).data() || null
  const delRepository = temi.dalRepository(id)
  if (azione === 'salva' && req.data?.nuovo === true && (nelDatabase || delRepository)) throw new HttpsError('already-exists', `Il tema ${id} esiste già.`)
  const prima = nelDatabase || (azione !== 'salva' && delRepository ? { ...delRepository } : null)
  const docsStili = (await db.collection('stili').get()).docs.map((d) => d.data())
  const stiliRicetta = stili.catalogoStili(docsStili).map((s) => s.id)
  const esito = temi.azioneSuTema(prima, azione, req.data?.tema, { da: req.auth.token.email || req.auth.uid, stiliRicetta })
  if (esito.errore) throw new HttpsError('failed-precondition', esito.errore)
  await ref.set(esito.doc)
  return { ok: true, tema: esito.doc }
})

// Gli stili a ricetta del repository si ritirano (e si ripubblicano) dal
// backoffice scrivendone la copia nel database, come i temi. Solo l'admin.
exports.gestisciStili = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const azione = req.data?.azione
  if (!['pubblica', 'ritira'].includes(azione)) throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
  const id = String(req.data?.id || '').trim().toLowerCase()
  const ref = db.doc(`stili/${id}`)
  const prima = (await ref.get()).data() || stili.stileDalRepository(id)
  if (!prima) throw new HttpsError('not-found', 'Stile sconosciuto.')
  if (azione === 'pubblica' && stili.stilePulito(prima).errore) throw new HttpsError('failed-precondition', `Non si pubblica: ${stili.stilePulito(prima).errore}`)
  if (azione === 'ritira' && prima.stato !== 'pubblicato') throw new HttpsError('failed-precondition', 'Si ritira solo uno stile pubblicato.')
  const ora = new Date().toISOString()
  const doc = { ...prima, stato: azione === 'pubblica' ? 'pubblicato' : 'ritirato', [azione === 'pubblica' ? 'pubblicato_il' : 'ritirato_il']: ora, aggiornato_il: ora, aggiornato_da: req.auth.token.email || req.auth.uid }
  await ref.set(doc)
  return { ok: true, stile: doc }
})

// ── I TEMI SU MISURA DI UN LOCALE (REQ-FLOTTA-040) ─────────────────────
// L'utente, 06/11/2026: un servizio premium col mockup di Canva e il
// credito AI, e i temi fatti da noi su richiesta. Stanno in
// clienti/{uid}/temi_su_misura/{id} (il titolare li legge, l'admin pure;
// li scrivono solo queste Functions) e arrivano all'app con la licenza
// (licenza.temi_su_misura), che si riscrive a ogni cambio. Le regole in
// lib/temi.js; il mockup non si salva da nessuna parte.

// Il titolare carica il mockup: la regia chiede al modello col credito del
// suo cassetto (come richiestaAI, ma dal sito e col suo account), controlla
// la proposta come ogni tema e la mette subito fra i suoi temi, pubblicata.
// Una proposta che non regge (colori illeggibili) non si scrive, e il
// tentativo resta addebitato: lo si dice.
exports.temaDaMockup = onCall({ ...OPTS, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente?.slug) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  let messaggio
  try {
    messaggio = ai.preparaMessaggio({ ...(req.data || {}), tipo: 'tema' })
  } catch (e) {
    if (e instanceof ai.RichiestaNonValida) throw new HttpsError('invalid-argument', e.message)
    throw e
  }
  const esito = await interrogaClaude(cliente.slug, messaggio)
  if (!esito.ok) throw new HttpsError(esito.http === 402 ? 'resource-exhausted' : esito.http === 503 ? 'unavailable' : 'failed-precondition', esito.errore)
  const { tema, errore } = temi.temaDalMockup(esito.risultato, { struttura: messaggio.struttura })
  if (errore) {
    throw new HttpsError('failed-precondition', `La proposta del modello non si può usare (${errore.replace(/\.$/, '')}). Il tentativo è costato ${esito.costo_eur} €: riprova, magari con una nota in più.`)
  }
  const ora = new Date().toISOString()
  const doc = {
    ...tema,
    stato: 'pubblicato',
    creato_il: ora,
    pubblicato_il: ora,
    aggiornato_il: ora,
    aggiornato_da: uid,
    mockup: { media_type: String(req.data?.media_type || ''), struttura: messaggio.struttura, costo_eur: esito.costo_eur },
  }
  await db.doc(`clienti/${uid}/temi_su_misura/${tema.id}`).set(doc)
  await scriviLicenza(cliente.slug).catch((e) => console.error(`[temi] ${cliente.slug}, la licenza:`, e?.message || e))
  return { ok: true, tema: doc, costo_eur: esito.costo_eur, credito_eur: esito.credito_eur }
})

// L'admin scrive, pubblica e ritira un tema su misura dalla scheda del
// locale (`slug`); il titolare, dalla dashboard, toglie e rimette i suoi
// (ritira e pubblica), ma non li scrive: il tema lo fa il fornitore, o il
// modello dal mockup.
exports.gestisciTemiSuMisura = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const admin = req.auth.token?.admin === true
  const azione = req.data?.azione
  if (!admin && !['pubblica', 'ritira'].includes(azione)) throw new HttpsError('permission-denied', 'Il tema lo scrive il fornitore: dalla dashboard si toglie e si rimette.')
  const cliente = admin && req.data?.slug ? await clienteDi(String(req.data.slug)) : await db.doc(`clienti/${req.auth.uid}`).get().then((d) => (d.exists ? { uid: d.id, ...d.data() } : null))
  if (!cliente?.slug) throw new HttpsError('not-found', 'Nessun locale per questo account.')
  const id = String((azione === 'salva' ? req.data?.tema?.id : req.data?.id) || '').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(id)) throw new HttpsError('invalid-argument', 'Identificativo del tema non valido.')
  const ref = db.doc(`clienti/${cliente.uid}/temi_su_misura/${id}`)
  const prima = (await ref.get()).data() || null
  if (azione === 'salva' && req.data?.nuovo === true && prima) throw new HttpsError('already-exists', `Il tema ${id} esiste già.`)
  const docsStili = (await db.collection('stili').get()).docs.map((d) => d.data())
  const stiliRicetta = stili.catalogoStili(docsStili).map((s) => s.id)
  const esito = temi.azioneSuTemaSuMisura(prima, azione, req.data?.tema, { da: req.auth.token.email || req.auth.uid, stiliRicetta, origine: 'fornitore' })
  if (esito.errore) throw new HttpsError('failed-precondition', esito.errore)
  await ref.set(esito.doc)
  await scriviLicenza(cliente.slug).catch((e) => console.error(`[temi] ${cliente.slug}, la licenza:`, e?.message || e))
  return { ok: true, tema: esito.doc }
})

// Il titolare chiede un tema al fornitore: una richiesta di contatto
// (REQ-FLOTTA-017) in contatti/<uid>_tema, che l'admin trova in «Richieste»
// e lavora dalla scheda del locale. Una nuova sostituisce la precedente.
exports.chiediTemaSuMisura = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  const r = contatti.richiestaTemaSuMisura(cliente && { uid: req.auth.uid, ...cliente }, req.data)
  if (!r.ok) throw new HttpsError('failed-precondition', r.perche)
  await db.doc(`contatti/${contatti.idRichiestaTema(req.auth.uid)}`).set(r.documento)
  return { ok: true }
})

// ── IL SITO SI PRESENTA ALLA REGIA (REQ-FLOTTA-026) ────────────────────
// Al primo avvio di ogni versione l'app chiama qui, col token di chi ha
// fatto l'accesso nel progetto del locale: `POST`, `Authorization: Bearer
// <ID token>`, corpo `{ versione }`. La regia riconosce il progetto fra le
// sue istanze, verifica il token con quel progetto, si segna la versione e,
// se il sito non ha la licenza, la riscrive: l'attivazione la scrive prima
// dell'app, e senza sessione l'app non si può presentare. Basta un
// utente qualunque del locale: la licenza la decide la regia, non chi
// chiama. Risposte: 200 { ok, licenza: 'scritta' | 'presente' |
// 'non_dalla_regia' | 'non_attiva' }; 400 corpo sbagliato; 401 token
// mancante o non valido; 404 progetto che la regia non conosce; 503 la
// licenza non si è scritta (si riprova aprendo l'app).
exports.presentazione = onRequest({ ...OPTS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
  const token = aggiornamenti.bearerDi(req.get('authorization'))
  const progetto = aggiornamenti.progettoDelToken(token)
  if (!progetto) return res.status(401).json({ errore: 'Serve l’accesso.' })
  const trovata = (await db.collection('istanze').where('progetto', '==', progetto).limit(1).get()).docs[0]
  if (!trovata || trovata.data().stato === 'eliminata') return res.status(404).json({ errore: 'Installazione non registrata nella regia.' })
  let chi
  try {
    chi = await getAuth(appDi(progetto)).verifyIdToken(token)
  } catch {
    return res.status(401).json({ errore: 'Accesso non valido: entra di nuovo.' })
  }
  const corpo = presenta.corpoPresentazione(req.body)
  if (!corpo) return res.status(400).json({ errore: 'Versione non valida.' })
  const slug = trovata.id
  const ist = trovata.data()
  if (presenta.daRegistrare(ist, corpo.versione)) await trovata.ref.update(presenta.registroPresentazione(ist, { versione: corpo.versione, uid: chi.uid }))
  const riceve = riceveLicenza(ist)
  const esiste = riceve ? (await firestoreDi(progetto).doc(LICENZA_PROTETTA).get()).exists : false
  const cosa = presenta.cosaFareConLaLicenza(ist, { esiste, riceve })
  if (cosa !== 'scrivi') return res.status(200).json({ ok: true, licenza: cosa })
  // Nessuno ci lavora ancora: la prima licenza si scrive subito, niente taglio.
  const scritta = await scriviLicenza(slug, { subito: true }).catch((e) => ({ ok: false, perche: e?.message || String(e) }))
  if (!scritta.ok) {
    console.error(`[presentazione] ${slug}: la licenza non si è scritta: ${scritta.perche}`)
    return res.status(503).json({ errore: 'La licenza non si è scritta: riprova fra poco.' })
  }
  console.log(`[presentazione] ${slug} ${corpo.versione}: licenza scritta`)
  return res.status(200).json({ ok: true, licenza: 'scritta' })
})

// ── IL PIANO CHE CAMBIA (REQ-FLOTTA-010) ──────────────────────────────

// Le righe nuove al posto delle vecchie, con l'intervallo che la
// subscription ha già (mensile o annuale). Un Fondatore che passa a un
// piano che l'offerta non copre perde lo sconto (REQ-FLOTTA-031): il
// coupon si toglie e il segno sulla subscription pure.
async function aggiornaSubscription(stripe, sub, uid, scelta) {
  const attuale = await stripe.subscriptions.retrieve(sub)
  const conIntervallo = { ...scelta, intervallo: intervalloDi(attuale) }
  const togli = fondatori.scontoDaTogliere(attuale.metadata, sceltaPulita(conIntervallo).piano)
  // L'IVA anche qui (REQ-FLOTTA-035): ogni riga nuova porta l'aliquota, e
  // il conguaglio dei giorni la calcola su quelle. È anche l'aliquota
  // predefinita della subscription, per le subscription nate prima.
  const aliquotaIva = await aliquotaIvaSuStripe(stripe)
  await prodottiSuStripe(stripe, conIntervallo)
  await stripe.subscriptions.update(sub, {
    items: [...attuale.items.data.map((i) => ({ id: i.id, deleted: true })), ...righeSubscription(conIntervallo, { aliquotaIva })],
    default_tax_rates: [aliquotaIva],
    metadata: { ...metadatiDi(uid, conIntervallo), ...(togli ? { fondatore: '' } : {}) },
    proration_behavior: 'create_prorations',
  })
  if (togli) {
    await stripe.subscriptions.deleteDiscount(sub)
    await db.doc(`clienti/${uid}`).set({ abbonamento: { fondatore: { tolto_il: new Date().toISOString(), perche: `piano ${scelta.piano}` } } }, { merge: true })
  }
}
// Il titolare cambia piano, moduli o terminali: con Stripe si aggiorna la
// subscription (gli importi si conguagliano) e il webhook riporta la
// scelta sul cliente; senza Stripe (piano a mano) si scrive subito. In
// tutti e due i casi la licenza dell'istanza segue (sotto).
// GESTIRE L'ABBONAMENTO DA SOLI (REQ-FLOTTA-023, 02/11/2026): il portale
// clienti di Stripe, per disdire a fine periodo, cambiare la carta e
// scaricare le fatture. I termini lo promettono («si disdice dalla propria
// pagina»); prima l'unico tasto era chiudere e cancellare il locale. Il
// ritorno è sempre la dashboard della regia, mai un indirizzo dal browser.
exports.portaleAbbonamento = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  const customer = cliente?.abbonamento?.origine === 'stripe' ? cliente.abbonamento.stripe_customer : null
  if (!customer) throw new HttpsError('failed-precondition', 'Il tuo abbonamento non passa da Stripe: per cambiarlo o disdirlo scrivici.')
  const stripe = stripeClient()
  if (!stripe || !REGIA_URL) throw new HttpsError('unavailable', 'La gestione dell’abbonamento non è disponibile al momento: scrivici.')
  const sessione = await stripe.billingPortal.sessions.create({ customer, return_url: `${REGIA_URL}/dashboard` })
  return { url: sessione.url }
})

exports.cambiaScelta = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const scelta = { piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali }
  const fuori = free.moduliFuoriVendita(cliente, scelta, await vendita())
  if (fuori.length) throw new HttpsError('failed-precondition', `Non più in vendita: ${fuori.join(', ')}.`)
  const sub = cliente.abbonamento?.stripe_subscription
  const stripe = stripeClient()
  if (sub && stripe) {
    await aggiornaSubscription(stripe, sub, uid, scelta)
    return { ok: true, via: 'stripe' }
  }
  // Da Free a un piano a pagamento si passa solo dal Checkout (REQ-FLOTTA-015):
  // il ramo qui sotto scrive il piano senza pagamento, ed era la strada per
  // avere il Base gratis. Resta per i clienti creati a mano dall'admin.
  if (cliente.abbonamento?.origine === 'gratuito') throw new HttpsError('failed-precondition', 'Per passare a un piano a pagamento scegli il piano e vai al pagamento.')
  if (cliente.abbonamento?.origine === 'manuale') {
    const pulita = metadatiDi(uid, scelta)
    await db.doc(`clienti/${uid}`).set(
      { piano: pulita.piano, moduli: pulita.moduli ? pulita.moduli.split(',') : [], terminali: Number(pulita.terminali) || 1 },
      { merge: true }
    )
    return { ok: true, via: 'manuale' }
  }
  throw new HttpsError('failed-precondition', 'Prima serve un abbonamento: scegli un piano e paga.')
})

// La licenza dell'istanza segue il cliente: quando piano, moduli o
// terminali cambiano e l'istanza è attiva, si riscrive settings/bar.licenza.
// Anche gli aggiornamenti la seguono (REQ-FLOTTA-020): con «solo finché si
// paga» sono compresi o no secondo il piano e il pagamento.
exports.licenzaSegueIlPiano = onDocumentUpdated({ ...OPTS, document: 'clienti/{uid}', secrets: [GITHUB_DISPATCH_TOKEN] }, async (event) => {
  const prima = event.data?.before?.data()
  const dopo = event.data?.after?.data()
  if (!dopo?.slug) return
  // L'abbonamento ha cambiato stato: cosa fa al locale (REQ-FLOTTA-023).
  if (prima?.abbonamento?.stato !== dopo.abbonamento?.stato) {
    const azione = scadenze.azioneDiPagamento(prima, dopo, (await db.doc(`istanze/${dopo.slug}`).get()).data())
    if (azione) await eseguiAzionePagamento(dopo, azione).catch((e) => console.error(`[scadenze] ${dopo.slug}, ${azione.azione}:`, e?.message || e))
  }
  // Un pagamento a mano con una scadenza nuova: il suo compito.
  const grazia = await giorniDiGrazia()
  const scadenza = dopo.abbonamento?.stato === 'attivo' ? scadenze.scadenzaPagamento(dopo, grazia) : null
  if (scadenza && scadenza !== scadenze.scadenzaPagamento(prima, grazia)) {
    await programma('pagamento', dopo.slug, scadenza).catch((e) => console.error(`[scadenze] ${dopo.slug}, il compito del pagamento:`, e?.message || e))
    for (const p of comunica.orariPromemoria(dopo)) {
      await programma('promemoria', dopo.slug, p.il).catch((e) => console.error(`[scadenze] ${dopo.slug}, il promemoria:`, e?.message || e))
    }
  }
  // Lo stato o la scadenza del pagamento sono cambiati: la licenza (stato,
  // valida_fino) si riscrive anche se piano e moduli sono quelli di prima.
  const scadenzaSpostata = scadenze.scadenzaPagamento(prima, grazia) !== scadenze.scadenzaPagamento(dopo, grazia)
  if ((prima?.abbonamento?.stato !== dopo.abbonamento?.stato || scadenzaSpostata) && !sceltaCambiata(prima, dopo)) {
    await scriviLicenza(dopo.slug).catch((e) => console.error(`[aggiornamenti] ${dopo.slug}:`, e?.message || e))
    return
  }
  if (!sceltaCambiata(prima, dopo)) return
  const ist = (await db.doc(`istanze/${dopo.slug}`).get()).data()
  if (!ist?.progetto || ist.stato !== 'attiva' || !scriveLicenza(ist)) return
  // Tornato al Free perché non paga: il piano suo torna col pagamento
  // (ripiegaAlFree), non con un cambio di scelta.
  if (ist.ripiego_free) return
  await db.doc(`istanze/${dopo.slug}`).set({ licenza_piano: dopo.piano, licenza_scritta_il: new Date().toISOString() }, { merge: true })
  await scriviLicenza(dopo.slug).catch((e) => console.error(`[licenza] ${dopo.slug}:`, e?.message || e))
  // Un locale Free che compra (REQ-FLOTTA-015): la licenza ha già tolto i
  // limiti; ora arrivano Functions, Storage e segreti, col profilo completo.
  // Col deploy automatico spento (REQ-FLOTTA-011) non parte da solo: la
  // richiesta aspetta l'admin, nel backoffice, come un'attivazione.
  if (free.serveProfiloCompleto(ist, dopo)) {
    const impostazioni = (await db.doc('impostazioni/regia').get()).data() || {}
    if (impostazioni.deploy_automatico !== true) {
      await db.doc(`istanze/${dopo.slug}`).set({ profilo_completo_da_autorizzare: { chiesto_il: new Date().toISOString(), piano: dopo.piano } }, { merge: true })
      console.log(`[free] ${dopo.slug} verso il profilo completo: aspetta l'admin`)
      return
    }
    const perche = await lanciaAggiornamento(dopo.slug, REF_APP, { profilo: 'completo' })
    console.log(`[free] ${dopo.slug} verso il profilo completo: ${perche || 'partito'}`)
  }
})

// L'admin autorizza il profilo completo di un Free che ha comprato: parte
// l'aggiornamento con Functions, Storage e segreti. Se non parte, la
// richiesta resta e lo si dice.
exports.autorizzaProfiloCompleto = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN] }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (!ist?.profilo_completo_da_autorizzare) throw new HttpsError('failed-precondition', 'Non c’è niente da autorizzare per questo locale.')
  const perche = await lanciaAggiornamento(slug, REF_APP, { profilo: 'completo' })
  if (perche) throw new HttpsError('failed-precondition', perche)
  await ref.update({ profilo_completo_da_autorizzare: FieldValue.delete(), profilo_completo_autorizzato_il: new Date().toISOString() })
  return { ok: true }
})

// ── IL PIANO FREE E LA VENDITA (REQ-FLOTTA-015) ───────────────────────
// La vendita la decide l'admin (vendita/listino, dal backoffice): il Free
// e ogni modulo si vendono o no. La regola che conta sta qui, sul server:
// il sito nasconde quello che non è in vendita, ma il server lo rifiuta.
async function vendita() {
  return free.venditaPulita((await db.doc('vendita/listino').get()).data())
}

// ── PAGAMENTI ONLINE SPENTI: LA RICHIESTA DI CONTATTO (REQ-FLOTTA-017) ─
// Il titolare sceglie il piano e lascia un recapito; l'admin lo contatta,
// concorda il pagamento e attiva il piano con «Cambia piano» fuori da
// Stripe. Una richiesta aperta per cliente: una nuova la sostituisce.
const PAGAMENTI_SPENTI = 'I pagamenti online non sono ancora attivi: chiedi di essere contattato dalla dashboard, e attiviamo il piano con te.'
exports.chiediContatto = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  const r = contatti.richiestaContatto(cliente && { uid: req.auth.uid, ...cliente }, req.data, await vendita())
  if (!r.ok) throw new HttpsError('failed-precondition', r.perche)
  await db.doc(`contatti/${req.auth.uid}`).set(r.documento)
  return { ok: true }
})

// Il titolare sceglie il Free: un abbonamento attivo a costo zero, senza
// Stripe. Poi «Attiva» come per ogni piano; il workflow lo pubblica col
// profilo leggero.
exports.scegliFree = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Prima conferma la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  const ist = cliente?.slug ? (await db.doc(`istanze/${cliente.slug}`).get()).data() : null
  const puo = free.puoScegliereFree(cliente, ist, await vendita())
  if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
  await db.doc(`clienti/${req.auth.uid}`).set(free.sceltaFree(), { merge: true })
  return { ok: true }
})

// ── L'ADMIN CREA UN LOCALE DA SÉ (REQ-FLOTTA-011) ─────────────────────
// Account del titolare (senza password: la imposta lui con «Password
// dimenticata» sul sito), documento del cliente con piano a mano, e se
// l'admin lo chiede la richiesta di attivazione, già in coda.
exports.creaCliente = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const { email, nome_locale, piano = 'base', moduli = [], terminali = 1, attiva_subito = false } = req.data || {}
  const nome = String(nome_locale || '').trim()
  const slug = nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-').slice(0, 30).replace(/-+$/g, '')
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(slug)) throw new HttpsError('invalid-argument', 'Nome del locale troppo corto o non valido.')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''))) throw new HttpsError('invalid-argument', 'Email non valida.')
  const esiste = await db.collection('clienti').where('slug', '==', slug).limit(1).get()
  if (!esiste.empty) throw new HttpsError('already-exists', `Esiste già un locale con identificativo ${slug}.`)
  const auth = getAuth()
  let utente
  try {
    utente = await auth.getUserByEmail(email)
  } catch {
    utente = await auth.createUser({ email, emailVerified: true })
  }
  const ora = new Date().toISOString()
  // Anche l'admin può creare un locale Free (REQ-FLOTTA-015): resta Free,
  // perché metadatiDi è quella di Stripe e ne farebbe un Base.
  const pulita = free.eGratuito(piano) ? { piano: 'free', moduli: '', terminali: '1' } : metadatiDi(utente.uid, { piano, moduli, terminali })
  const cliente = {
    uid: utente.uid,
    versione_schema: 2,
    email: String(email).toLowerCase(),
    nome_locale: nome,
    slug,
    locale: { tipo: 'altro', indirizzo: {}, telefono: '', sito: '' },
    fatturazione: {},
    referente: {},
    consensi: { termini_il: null, privacy_il: null, marketing: false, nota: 'creato dall’amministratore: consensi da raccogliere' },
    piano: pulita.piano,
    moduli: pulita.moduli ? pulita.moduli.split(',') : [],
    terminali: Number(pulita.terminali) || 1,
    abbonamento: { stato: 'attivo', origine: free.eGratuito(piano) ? 'gratuito' : 'manuale', dal: ora },
    creato_da_admin: true,
    creato_il: ora,
  }
  await db.doc(`clienti/${utente.uid}`).set(cliente, { merge: true })
  if (attiva_subito) {
    await db.doc(`richieste/${slug}`).set({ uid: utente.uid, slug, nome_locale: nome, piano: cliente.piano, moduli: cliente.moduli, stato: 'in coda', chiesta_il: ora, chiesta_da: 'admin' })
  }
  return { uid: utente.uid, slug }
})

// ── IL CASSETTO AI (REQ-AI-003) ───────────────────────────────────────
// Decisione dell'utente del 24/10/2026: un cassetto AI unico nella regia,
// per tutti i locali compresa la Tana. Le installazioni chiedono a
// `richiestaAI` con la loro chiave della regia; la regia controlla il
// credito, chiama Claude con la NOSTRA chiave (ANTHROPIC_API_KEY, mai in
// un'installazione) e scala il costo. La logica sta in lib/ai.js.

// Caricato qui e non in cima, come Stripe: le altre Functions non ne hanno
// bisogno e partono più leggere.
const claude = () => {
  const sdk = require('@anthropic-ai/sdk')
  const Anthropic = sdk.default || sdk
  return { Anthropic, client: new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() }) }
}

// Una ricarica (Stripe o a mano) diventa credito una volta sola: il
// documento della ricarica ha l'id della sessione di Stripe, e se c'è già
// il webhook ripetuto non accredita due volte (Stripe ripete gli eventi).
async function accreditaRicarica(r, { origine, nota = null, da = null }) {
  const cassettoRef = db.doc(`ai/${r.slug}`)
  const ricaricaRef = cassettoRef.collection('ricariche').doc(r.sessione)
  const ora = new Date()
  return db.runTransaction(async (t) => {
    const [gia, cassetto] = await Promise.all([t.get(ricaricaRef), t.get(cassettoRef)])
    if (gia.exists) return 'già accreditata'
    if (cassetto.exists) {
      t.update(cassettoRef, { credito_microeuro: FieldValue.increment(r.importo_microeuro), ultima_ricarica_il: ora.toISOString() })
    } else {
      t.set(cassettoRef, {
        ...ai.nuovoCassetto({ slug: r.slug, uid: r.uid, adesso: ora }),
        credito_microeuro: r.importo_microeuro,
        ultima_ricarica_il: ora.toISOString(),
      })
    }
    t.set(ricaricaRef, { il: ora.toISOString(), importo_microeuro: r.importo_microeuro, origine, pacchetto: r.pacchetto || null, nota, da })
    return 'accreditata'
  })
}

// Il cassetto di un'istanza, creato se manca: serve all'admin per dare
// credito, tetto o chiave a un'installazione che non ha ancora ricaricato.
async function cassettoDi(slug) {
  const ref = db.doc(`ai/${slug}`)
  if ((await ref.get()).exists) return ref
  const ist = (await db.doc(`istanze/${slug}`).get()).data()
  if (!ist) throw new HttpsError('not-found', `Nessuna istanza «${slug}».`)
  await ref.set(ai.nuovoCassetto({ slug, uid: ist.uid, interna: ist.interna === true }), { merge: true })
  return ref
}

// La porta delle installazioni. POST con `Authorization: Bearer
// <slug>.<segreto>` e il corpo di preparaMessaggio. Risponde 200 col
// risultato, 400 se la richiesta è sbagliata, 401 se la chiave non va,
// 402 se il credito o il tetto non bastano, 422 se il modello non ha dato
// un risultato usabile (il consumo resta addebitato), 503 se Claude non
// risponde. È HTTP e non callable perché a chiamarla è il server
// dell'installazione, non un utente di questo sito.
exports.richiestaAI = onRequest(
  { ...OPTS, secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 300, memory: '512MiB', maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ errore: 'Solo POST.' })
    const chi = ai.leggiBearer(req.get('authorization'))
    const riservato = chi ? (await db.doc(`ai/${chi.slug}/riservato/chiave`).get()).data() : null
    if (!chi || !ai.chiaveGiusta(chi.segreto, riservato?.impronta)) return res.status(401).json({ errore: 'Chiave della regia non valida.' })

    let messaggio
    try {
      messaggio = ai.preparaMessaggio(req.body)
    } catch (e) {
      if (e instanceof ai.RichiestaNonValida) return res.status(400).json({ errore: e.message })
      throw e
    }
    // Il tema dal mockup (REQ-FLOTTA-040) si chiede dal sito, col suo
    // account: da qui le due richieste dell'app e basta.
    if (!ai.TIPI_INSTALLAZIONE.includes(messaggio.tipo)) return res.status(400).json({ errore: 'Da un’installazione si chiedono «descrizione» e «fattura».' })

    const esito = await interrogaClaude(chi.slug, messaggio)
    if (!esito.ok) {
      const { ok: _no, http, ...corpo } = esito
      return res.status(http).json(corpo)
    }
    res.status(200).json({ ok: true, tipo: messaggio.tipo, risultato: esito.risultato, costo_eur: esito.costo_eur, credito_eur: esito.credito_eur })
  }
)

// UNA RICHIESTA AL MODELLO SUL CREDITO DI UN'INSTALLAZIONE, in un posto
// solo, per richiestaAI e per il tema dal mockup (REQ-FLOTTA-040): il
// controllo del credito, la chiamata, l'addebito e la riga dei consumi.
// → { ok: true, risultato, costo_eur, credito_eur }, oppure { ok: false,
// http, errore, codice, ... } con il codice HTTP che richiestaAI risponde
// (402 credito, 503 servizio, 422 risposta inutilizzabile: addebitata).
async function interrogaClaude(slug, messaggio) {
  const cassettoRef = db.doc(`ai/${slug}`)
  const prima = (await cassettoRef.get()).data()
  const via = ai.puoChiedere(prima, ai.stimaMassimaMicroeuro(messaggio))
  if (!via.ok) return { ok: false, http: 402, errore: via.perche, codice: via.codice, credito_eur: ai.inEuro(prima?.credito_microeuro) }

  const { Anthropic, client } = claude()
  let risposta
  try {
    risposta = await client.beta.messages.stream(ai.parametriClaude(messaggio)).finalMessage()
  } catch (e) {
    // Niente addebito: se la chiamata non è arrivata in fondo non c'è una
    // usage da scalare. Il tipo dell'errore dice di chi è il problema.
    const tipo = e instanceof Anthropic.APIError ? e.type || e.status : 'rete'
    if (tipo === 'billing_error') {
      // IL NOSTRO credito presso Anthropic è finito: va ricaricato dalla
      // Console (o la ricarica automatica non è scattata). Riga cercabile
      // nei log: «[ai] CREDITO ANTHROPIC».
      console.error('[ai] CREDITO ANTHROPIC esaurito o pagamento rifiutato:', e.message)
    } else {
      console.error(`[ai] ${slug} ${messaggio.tipo}: ${tipo}`, e?.message)
    }
    const riprova =
      e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError
    return {
      ok: false,
      http: 503,
      errore: riprova ? 'Il servizio AI è occupato: riprova tra poco.' : 'Il servizio AI non è disponibile in questo momento.',
      codice: 'servizio',
    }
  }

  const costo = ai.costoMicroeuro(risposta)
  const letta = ai.leggiRisposta(risposta)
  const residuo = await db.runTransaction(async (t) => {
    const snap = await t.get(cassettoRef)
    const patch = ai.addebito(snap.data(), costo)
    t.update(cassettoRef, patch)
    t.set(cassettoRef.collection('consumi').doc(), ai.rigaConsumo({ tipo: messaggio.tipo, risposta, costo, esito: letta.ok ? 'ok' : letta.codice }))
    return patch.credito_microeuro
  })
  const conti = { costo_eur: ai.inEuro(costo), credito_eur: ai.inEuro(residuo) }
  if (!letta.ok) return { ok: false, http: 422, errore: letta.perche, codice: letta.codice, ...conti }
  return { ok: true, risultato: letta.risultato, ...conti }
}

// Il titolare ricarica il credito AI dalla dashboard: una sessione di
// Checkout per un pacchetto del listino (piani.json → ai.pacchetti). Il
// credito arriva col webhook, a pagamento confermato.
exports.creaRicaricaAI = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente?.slug) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const p = ai.pacchetto(req.data?.pacchetto)
  if (!p) throw new HttpsError('invalid-argument', 'Pacchetto di ricarica sconosciuto.')
  // Anche la ricarica passa da Stripe: coi pagamenti spenti la fa l'admin.
  if (!contatti.pagamentiOnline(await vendita())) throw new HttpsError('failed-precondition', PAGAMENTI_SPENTI)
  const ritorno = String(req.data?.ritorno || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(ritorno)) throw new HttpsError('invalid-argument', 'Indirizzo di ritorno non valido.')
  const stripe = stripeClient()
  if (!stripe) throw new HttpsError('failed-precondition', 'Il pagamento online non è ancora attivo: scrivici all’email del prodotto.')
  const metadata = ai.metadatiRicarica({ uid, slug: cliente.slug, p })
  const aliquotaIva = await aliquotaIvaSuStripe(stripe)
  const sessione = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [ai.rigaRicarica(p, { aliquotaIva })],
    customer: cliente.abbonamento?.stripe_customer || undefined,
    customer_email: cliente.abbonamento?.stripe_customer ? undefined : cliente.email,
    client_reference_id: uid,
    metadata,
    payment_intent_data: { metadata },
    success_url: `${ritorno}/dashboard?ricarica=ok`,
    cancel_url: `${ritorno}/dashboard?ricarica=annullata`,
    locale: 'it',
  })
  return { url: sessione.url }
})

// Dal backoffice, sul cassetto di un'installazione: ricarica a mano (la
// Tana la ricarichiamo noi), tetto mensile, acceso o spento, e la chiave
// che l'installazione usa per chiamare `richiestaAI`. La chiave si vede
// una volta sola, qui: la regia ne tiene solo l'impronta.
exports.gestisciCassettoAI = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const { slug, azione } = req.data || {}
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(slug || '')) throw new HttpsError('invalid-argument', 'Slug non valido.')
  const importo = Number(req.data?.importo)
  const ref = await cassettoDi(slug)
  const ora = new Date().toISOString()
  if (azione === 'ricarica') {
    if (!Number.isFinite(importo) || importo <= 0 || importo > 1000) throw new HttpsError('invalid-argument', 'Importo tra 0 e 1000 €.')
    const cassetto = (await ref.get()).data()
    const esito = await accreditaRicarica(
      {
        slug,
        uid: cassetto.uid,
        sessione: `manuale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        importo_microeuro: ai.daEuro(importo),
      },
      { origine: 'manuale', nota: req.data?.nota ? String(req.data.nota).slice(0, 200) : null, da: req.auth.uid }
    )
    return { ok: true, esito }
  }
  if (azione === 'tetto') {
    if (!Number.isFinite(importo) || importo < 0 || importo > 5000) throw new HttpsError('invalid-argument', 'Tetto tra 0 e 5000 €.')
    await ref.update({ tetto_mensile_microeuro: ai.daEuro(importo), aggiornato_il: ora })
    return { ok: true }
  }
  if (azione === 'accendi' || azione === 'spegni') {
    await ref.update({ attivo: azione === 'accendi', aggiornato_il: ora })
    return { ok: true }
  }
  if (azione === 'chiave') {
    const { bearer, impronta } = ai.nuovaChiave(slug)
    await db.doc(`ai/${slug}/riservato/chiave`).set({ impronta, creata_il: ora, da: req.auth.uid })
    await ref.update({ chiave_creata_il: ora })
    return { ok: true, chiave: bearer }
  }
  throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
})

// Un locale che esiste già, senza provisioning (la Tana): cliente, istanza
// segnata «interna» ed «esistente», cassetto AI vuoto. Nessuna richiesta di
// attivazione: è quella che farebbe partire il workflow. Il perché sta in
// lib/esistente.js.
// Un locale esistente già registrato passa agli aggiornamenti dalla regia,
// o torna a pubblicare da sé, senza rifare la registrazione
// (REQ-FLOTTA-018). `build` si riscrive per intero: una chiave tolta sparisce.
exports.impostaAggiornamentiEsistente = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (!ist || ist.origine !== 'esistente') throw new HttpsError('failed-precondition', 'Vale solo per un locale registrato come esistente.')
  let g
  try {
    g = gestioneEsistente(req.data, { slug, progetto: ist.progetto })
  } catch (e) {
    if (e instanceof DatiNonValidi) throw new HttpsError('invalid-argument', e.message)
    throw e
  }
  await ref.update({ ...g, aggiornata_il: new Date().toISOString() })
  // La licenza appena collegata si scrive subito: se la regia non può
  // scrivere in quel progetto (manca il permesso), si torna indietro e lo
  // si dice, invece di lasciare un locale «collegato» senza licenza.
  if (g.licenza_dalla_regia && !scriveLicenza(ist)) {
    const scritta = await scriviLicenza(slug).catch((e) => ({ ok: false, perche: e?.message || String(e) }))
    if (!scritta.ok) {
      await ref.update({ licenza_dalla_regia: false })
      throw new HttpsError('failed-precondition', `La licenza non si è scritta nel progetto ${ist.progetto}: ${String(scritta.perche).slice(0, 200)}. Serve roles/datastore.user per la regia su quel progetto.`)
    }
  }
  return { ok: true, ...g }
})

// ── I CODICI SCONTO (REQ-FLOTTA-028) ───────────────────────────────────
// I codici stanno in sconti/{CODICE}: li crea e li disattiva l'admin, e li
// applica lui a un cliente. La logica sta in lib/sconti.js.
exports.gestisciSconti = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const azione = req.data?.azione
  if (azione === 'crea') {
    const s = sconti.scontoPulito(req.data)
    if (s.errore) throw new HttpsError('invalid-argument', s.errore)
    const ref = db.doc(`sconti/${s.codice}`)
    // Un codice non si riscrive: chi lo ha già applicato ha quelle condizioni.
    if ((await ref.get()).exists) throw new HttpsError('already-exists', `Il codice ${s.codice} esiste già.`)
    await ref.set({ ...s, usi: 0, creato_il: new Date().toISOString(), creato_da: req.auth.token.email || req.auth.uid })
    return { ok: true, codice: s.codice }
  }
  // Il limite di usi si cambia anche dopo: le condizioni dello sconto no.
  // Sotto gli usi già fatti vuol dire esaurito, e chi lo ha lo tiene.
  if (azione === 'limite') {
    const codice = String(req.data?.codice || '').trim().toUpperCase()
    const ref = db.doc(`sconti/${codice}`)
    if (!sconti.CODICE.test(codice) || !(await ref.get()).exists) throw new HttpsError('not-found', 'Codice sconosciuto.')
    const l = sconti.limitePulito(req.data?.usi_massimi)
    if (l.errore) throw new HttpsError('invalid-argument', l.errore)
    await ref.update({ usi_massimi: l.usi_massimi, limite_cambiato_il: new Date().toISOString() })
    return { ok: true, usi_massimi: l.usi_massimi }
  }
  if (azione === 'disattiva') {
    const codice = String(req.data?.codice || '').trim().toUpperCase()
    const ref = db.doc(`sconti/${codice}`)
    if (!sconti.CODICE.test(codice) || !(await ref.get()).exists) throw new HttpsError('not-found', 'Codice sconosciuto.')
    // Chi lo ha già lo tiene: disattivato vuol dire che non si applica più.
    await ref.update({ attivo: false, disattivato_il: new Date().toISOString() })
    return { ok: true }
  }
  throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
})

// Applica un codice a un cliente, o lo toglie (codice vuoto).
exports.applicaSconto = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const doc = (await db.collection('clienti').where('slug', '==', String(req.data?.slug || '')).limit(1).get()).docs[0]
  if (!doc) throw new HttpsError('not-found', 'Cliente sconosciuto.')
  const codice = String(req.data?.codice || '').trim().toUpperCase()
  if (!codice) {
    await doc.ref.update(sconti.scontoTolto(doc.data()).patch)
    return { ok: true, sconto: null }
  }
  if (!sconti.CODICE.test(codice)) throw new HttpsError('failed-precondition', 'Codice sconosciuto o disattivato.')
  const refCodice = db.doc(`sconti/${codice}`)
  // In transazione col codice: anche l'admin consuma un uso, e l'ultimo
  // lo prende uno solo.
  const esito = await db.runTransaction(async (t) => {
    const [cliente, s] = (await Promise.all([t.get(doc.ref), t.get(refCodice)])).map((x) => x.data())
    const e = sconti.scontoApplicato(cliente, s, new Date(), doc.id)
    if (e.errore) return e
    t.update(doc.ref, e.patch)
    if (e.uso) t.update(refCodice, sconti.usoConfermato(s, doc.id))
    return e
  })
  if (esito.errore) throw new HttpsError('failed-precondition', esito.errore)
  return { ok: true, sconto: esito.patch.sconto }

})

exports.registraLocaleEsistente = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  let d
  try {
    d = datiEsistente(req.data)
  } catch (e) {
    if (e instanceof DatiNonValidi) throw new HttpsError('invalid-argument', e.message)
    throw e
  }
  const [stessoSlug, istanza] = await Promise.all([
    db.collection('clienti').where('slug', '==', d.slug).limit(1).get(),
    db.doc(`istanze/${d.slug}`).get(),
  ])
  if (!stessoSlug.empty || istanza.exists) throw new HttpsError('already-exists', `Esiste già un locale con identificativo ${d.slug}.`)
  const auth = getAuth()
  const utente = await auth.getUserByEmail(d.email).catch(() => auth.createUser({ email: d.email, emailVerified: true }))
  if ((await db.doc(`clienti/${utente.uid}`).get()).exists) {
    throw new HttpsError('already-exists', 'Questo account ha già un locale: usa un’altra email per il titolare.')
  }
  const adesso = new Date()
  const { cliente, istanza: ist } = documentiEsistente(d, { uid: utente.uid, adesso })
  const batch = db.batch()
  batch.set(db.doc(`clienti/${utente.uid}`), cliente)
  batch.set(db.doc(`istanze/${d.slug}`), ist)
  batch.set(db.doc(`ai/${d.slug}`), ai.nuovoCassetto({ slug: d.slug, uid: utente.uid, interna: d.interna, adesso }))
  await batch.commit()
  return { uid: utente.uid, slug: d.slug }
})

// ── I TEMI DEI LOCALI (REQ-FLOTTA-039, richiesta da tana-drink) ────────
// Gli stili esclusivi o comprati stanno in clienti/{uid}.temi, e la licenza
// li nomina in `temi`: licenzaSegueIlPiano la riscrive come per un modulo.
// Li assegna l'admin, perché un esclusivo non si compra. Il contratto in
// docs/temi-dei-locali.md.
exports.impostaTemi = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const temiNuovi = temi.temiPuliti(req.data?.temi)
  if (!temiNuovi) throw new HttpsError('invalid-argument', 'I temi in licenza sono id di stili: minuscole, cifre e trattini.')
  const doc = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]
  if (!doc) throw new HttpsError('not-found', 'Cliente sconosciuto.')
  await doc.ref.update({ temi: temiNuovi })
  console.log(`[temi] ${slug}: ${temiNuovi.join(', ') || 'nessuno'} (${req.auth.token.email || req.auth.uid})`)
  return { ok: true, temi: temiNuovi }
})

// Quello che il locale ha installato dall'app (gli stili gratis, i temi del
// marketplace, lo stile in uso): la regia lo LEGGE dal suo settings/bar al
// momento e non lo salva. È un dato operativo del locale, e letto adesso è
// esatto per costruzione: niente sincronizzazione che resta indietro.
// L'account delle Functions ha già datastore.user sul progetto, per la
// licenza.
exports.temiDelLocale = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const ist = (await db.doc(`istanze/${slug}`).get()).data()
  if (!ist?.progetto) throw new HttpsError('failed-precondition', 'Il locale non ha ancora un progetto.')
  let bar
  try {
    bar = (await firestoreDi(ist.progetto).doc('settings/bar').get()).data()
  } catch (e) {
    console.error(`[temi] ${slug}, settings/bar:`, e?.message || e)
    throw new HttpsError('unavailable', 'Il progetto del locale non risponde: riprova fra poco.')
  }
  return temi.installatiDalLocale(bar)
})

// ── L'ELIMINAZIONE DI UN LOCALE (REQ-FLOTTA-014) ───────────────────────
//
// Decisioni dell'utente del 29/10/2026. Il TITOLARE, dalla sua dashboard,
// chiude il locale e ne chiede la cancellazione, che parte fra 30 giorni;
// finché non parte la può annullare, e il locale torna com'era. Solo
// l'ADMIN può chiederla subito (o anche lui a 30 giorni), e solo per un
// locale già chiuso. Tutti e due confermano scrivendo il nome dell'app.
// Il lavoro lo fa elimina-istanza.yml: prima il backup verificato, poi
// l'eliminazione. Le regole stanno in lib/eliminazione.js.

async function lanciaEliminazione(slug) {
  const res = await dispatchGitHub(WORKFLOW_ELIMINA, elim.dispatchEliminazione(slug, { ref: REF, ambiente: AMBIENTE_FLOTTA }))
  const ref = db.doc(`istanze/${slug}`)
  if (res.status !== 204) {
    await ref.set({ eliminazione: { stato: 'fallita', errore: `GitHub ${res.status}: il workflow non è partito`, finito_il: new Date().toISOString() } }, { merge: true })
    return `GitHub ${res.status}`
  }
  await ref.set({ eliminazione: { stato: 'in corso', lanciata_il: new Date().toISOString() } }, { merge: true })
  return null
}

// Disdetta a fine periodo, o il suo contrario: chi chiude il locale non
// paga il mese dopo, chi ci ripensa torna come prima.
async function disdettaAFinePeriodo(cliente, disdici) {
  const sub = cliente?.abbonamento?.stripe_subscription
  const stripe = stripeClient()
  if (!sub || !stripe) return
  await stripe.subscriptions.update(sub, { cancel_at_period_end: disdici })
}

exports.gestisciEliminazione = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN, STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const admin = req.auth.token?.admin === true
  const { azione, conferma, subito = false } = req.data || {}
  const adesso = new Date()

  // Di quale locale si parla: l'admin lo nomina, il titolare è il suo.
  let slug
  let cliente
  if (admin) {
    slug = String(req.data?.slug || '')
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(slug)) throw new HttpsError('invalid-argument', 'Slug non valido.')
    cliente = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]?.data() || null
  } else {
    cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data() || null
    slug = cliente?.slug
    if (!slug) throw new HttpsError('failed-precondition', 'Nessun locale collegato a questo account.')
  }
  const istRef = db.doc(`istanze/${slug}`)
  const ist = (await istRef.get()).data() || null

  if (azione === 'chiedi' && !admin) {
    const puo = elim.puoChiedereTitolare(ist)
    if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
    if (!elim.confermaValida(ist, conferma)) throw new HttpsError('invalid-argument', `Per confermare scrivi ${ist.progetto}.`)
    const richiesta = elim.richiestaTitolare(ist, { da: req.auth.token.email || req.auth.uid, adesso })
    await scriviStatoIstanza(slug, 'chiusa', 'chiusura chiesta dal titolare', { per: 'titolare' })
    await istRef.set({ eliminazione: richiesta }, { merge: true })
    await programma('eliminazione', slug, richiesta.quando).catch((e) => console.error(`[scadenze] ${slug}, eliminazione:`, e?.message || e))
    await avvisiDellaCancellazione(slug, richiesta.quando)
    await disdettaAFinePeriodo(cliente, true).catch((e) => console.error(`[eliminazione] ${slug}, disdetta:`, e?.message || e))
    return { ok: true, quando: richiesta.quando }
  }

  if (azione === 'chiedi' && admin) {
    const puo = elim.puoEliminare(ist)
    if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
    if (!elim.confermaValida(ist, conferma)) throw new HttpsError('invalid-argument', `Per confermare scrivi ${ist.progetto}.`)
    const richiesta = elim.eliminazioneChiesta(ist, { subito: Boolean(subito), da: req.auth.token.email || req.auth.uid, adesso })
    await istRef.set({ eliminazione: richiesta }, { merge: true })
    if (!subito) {
      await programma('eliminazione', slug, richiesta.quando).catch((e) => console.error(`[scadenze] ${slug}, eliminazione:`, e?.message || e))
      await avvisiDellaCancellazione(slug, richiesta.quando)
      return { ok: true, quando: richiesta.quando }
    }
    const perche = await lanciaEliminazione(slug)
    if (perche) throw new HttpsError('unavailable', `Il backup e l’eliminazione non sono partiti: ${perche}.`)
    return { ok: true, quando: richiesta.quando }
  }

  if (azione === 'annulla') {
    const puo = elim.puoAnnullare(ist, admin ? 'admin' : 'titolare')
    if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
    const e = ist.eliminazione
    await istRef.set({ eliminazione: { ...e, stato: 'annullata', annullata_il: adesso.toISOString(), annullata_da: req.auth.token.email || req.auth.uid } }, { merge: true })
    // Una chiusura chiesta dal titolare si annulla tornando com'era.
    if (e.richiedente === 'titolare') {
      await scriviStatoIstanza(slug, e.licenza_prima || 'attiva', e.licenza_prima === 'sospesa' ? 'pagamento non ricevuto' : null, { per: 'pagamento' })
      await disdettaAFinePeriodo(cliente, false).catch((err) => console.error(`[eliminazione] ${slug}, disdetta:`, err?.message || err))
    }
    // La licenza non annuncia più la cancellazione.
    await scriviLicenza(slug).catch((err) => console.error(`[eliminazione] ${slug}, la licenza:`, err?.message || err))
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
})

// L'archivio di un locale eliminato lo scarica SOLO il suo titolare
// (decisione dell'utente del 29/10/2026): per quei dati il locale è
// titolare del trattamento. Nemmeno l'admin ha questo pulsante. Il link
// vale 15 minuti; l'archivio stesso si cancella dopo 180 giorni.
exports.scaricaArchivio = onCall(OPTS, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  if (req.auth.token?.email_verified !== true) throw new HttpsError('permission-denied', 'Conferma prima la tua email.')
  const cliente = (await db.doc(`clienti/${req.auth.uid}`).get()).data()
  if (!cliente?.slug || cliente.uid && cliente.uid !== req.auth.uid) throw new HttpsError('permission-denied', 'Nessun locale collegato a questo account.')
  const ist = (await db.doc(`istanze/${cliente.slug}`).get()).data()
  if (!elim.archivioScaricabile(ist)) throw new HttpsError('not-found', 'Non c’è un archivio da scaricare, o è scaduto.')
  const { bucket, zip } = ist.eliminazione.archivio
  const [url] = await getStorage().bucket(bucket).file(zip).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
    responseDisposition: `attachment; filename="${cliente.slug}-archivio.zip"`,
  })
  return { url, scade_il: ist.eliminazione.scade_il }
})

// ── LE PROVE DEI MODULI E «CAMBIA PIANO» DELL'ADMIN (REQ-FLOTTA-016) ───
const prove = require('./lib/prove.js')
const { cambioAdmin } = require('./lib/cambiopiano.js')

// Il titolare accende la prova di un modulo: quali si provano e per quanti
// giorni lo decide l'admin (vendita/listino). Una volta sola per modulo.
// Scritta la prova, licenzaSegueIlPiano accende il modulo nell'istanza.
exports.provaModulo = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const ref = db.doc(`clienti/${req.auth.uid}`)
  const cliente = (await ref.get()).data()
  if (!cliente?.slug) throw new HttpsError('failed-precondition', 'Nessun locale collegato a questo account.')
  const ist = (await db.doc(`istanze/${cliente.slug}`).get()).data()
  const p = await accendiProva(ref, cliente, ist, String(req.data?.modulo || ''), await vendita())
  if (p.errore) throw new HttpsError('failed-precondition', p.errore)
  return { ok: true, scade_il: p.scade_il }
})

// LA PROVA DI UN MODULO, una sola regola per le due porte: la dashboard
// (provaModulo) e l'app del locale (moduloDallApp). → { scade_il } o
// { errore }. Scritta la prova, licenzaSegueIlPiano accende il modulo.
async function accendiProva(ref, cliente, ist, id, inVendita) {
  const adesso = new Date()
  const puo = prove.puoProvare(cliente, ist, id, inVendita, adesso)
  if (!puo.ok) return { errore: puo.perche }
  await ref.update({
    [`prove.${id}`]: { dal: adesso.toISOString(), scade_il: puo.scade_il, giorni: puo.giorni },
    prove_fatte: FieldValue.arrayUnion(id),
  })
  // Alla fine della prova il modulo si spegne (REQ-FLOTTA-023).
  await programma('prova', cliente.slug, puo.scade_il).catch((e) => console.error(`[scadenze] ${cliente.slug}, prova:`, e?.message || e))
  return { scade_il: puo.scade_il }
}

// ── I MODULI COMPRATI DALL'APP DEL LOCALE (REQ-FLOTTA-037) ────────────
// Da tana-drink (REQ-LIC-012): «Marketplace → Moduli» nel gestionale. Le
// regole in lib/moduliapp.js; il contratto dal lato dell'app è in
// tana-drink/docs/marketplace-moduli.md.
const moduliApp = require('./lib/moduliapp.js')

// Il listino per l'app: GET, pubblico, CORS aperto (lo legge il browser
// dal dominio del locale). → 200 { moduli: [{ id, prezzo, prova_giorni }] },
// solo quelli in vendita. L'app lo legge quando si apre «Moduli», mai a
// tempo: un minuto di cache basta, e un modulo tolto dalla vendita sparisce
// presto.
exports.catalogoModuli = onRequest({ ...OPTS, cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  if (req.method !== 'GET') return res.status(405).json({ errore: 'Solo GET.' })
  res.set('Cache-Control', 'public, max-age=60')
  return res.status(200).json(moduliApp.catalogoModuli(await vendita()))
})

// Prova, aggiungi, disdici dall'app: POST con `Authorization: Bearer <ID
// token>` di chi ha fatto l'accesso nell'app, corpo { modulo, azione,
// ritorno }. I controlli in quest'ordine: l'installazione (401 senza token
// valido, 404 sconosciuta o eliminata), il titolare (il ruolo `admin`
// dell'app, 403), il ritorno sui domini dell'installazione (400), il
// modulo nel listino e in vendita (409; per disdire basta che esista).
// Risposte: 200 { ok: true } (aggiunto), { ok: true, scade_il } (prova),
// { ok: true, dal } (disdetto), { ok: true, in_attesa: true } (richiesta
// all'assistenza); { ok: false, errore } col motivo, che l'app mostra al
// titolare così com'è. Su un abbonamento Stripe aggiungere e disdire
// cambiano la subscription come «Cambia piano» (aggiornaSubscription, col
// conguaglio e l'IVA): il webhook riporta la scelta sul cliente, e la
// licenza segue. Su un piano gestito a mano la regia scrive una richiesta
// di contatto (REQ-FLOTTA-017) e l'admin accende o spegne il modulo dal
// backoffice. Nessun Checkout da qui, e la licenza non cambia mai per un
// ritorno dal browser.
exports.moduloDallApp = onRequest({ ...OPTS, secrets: [STRIPE_SECRET_KEY], cors: false }, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Allow-Methods', 'POST')
  if (req.method === 'OPTIONS') return res.status(204).send('')
  const no = (stato, errore) => res.status(stato).json({ ok: false, errore })
  if (req.method !== 'POST') return no(405, 'Solo POST.')
  const token = aggiornamenti.bearerDi(req.get('authorization'))
  const progetto = aggiornamenti.progettoDelToken(token)
  if (!progetto) return no(401, 'Serve l’accesso.')
  const trovata = (await db.collection('istanze').where('progetto', '==', progetto).limit(1).get()).docs[0]
  const ist = trovata?.data()
  // La demo non ha titolare né abbonamento (REQ-FLOTTA-019).
  if (!ist || ist.stato === 'eliminata' || eDemo(ist)) return no(404, 'Installazione non registrata nella regia.')
  let chi
  try {
    chi = await getAuth(appDi(progetto)).verifyIdToken(token)
  } catch {
    return no(401, 'Accesso non valido: rientrare e riprovare.')
  }
  if (!aggiornamenti.eTitolare(chi)) return no(403, 'I moduli li gestisce il titolare.')
  const corpo = moduliApp.corpoModulo(req.body)
  if (!corpo) return no(400, 'Richiesta non valida.')
  if (!moduliApp.ritornoValido(corpo.ritorno, ist)) return no(400, 'Indirizzo di ritorno non valido.')
  const inVendita = await vendita()
  if (corpo.azione !== 'disdici') {
    const fuori = moduliApp.moduloInVendita(corpo.modulo, inVendita)
    if (fuori) return no(409, fuori)
  }
  const docCliente = (await db.collection('clienti').where('slug', '==', trovata.id).limit(1).get()).docs[0]
  if (!docCliente) return no(404, 'Nessun abbonamento registrato per questo locale.')
  const cliente = docCliente.data()
  if (corpo.azione === 'prova') {
    const p = await accendiProva(docCliente.ref, cliente, ist, corpo.modulo, inVendita)
    if (p.errore) return no(409, p.errore)
    return res.status(200).json({ ok: true, scade_il: p.scade_il })
  }
  const adesso = new Date()
  const d = corpo.azione === 'aggiungi' ? moduliApp.sceltaPerAggiungere(cliente, ist, corpo.modulo, inVendita) : moduliApp.sceltaPerDisdire(cliente, ist, corpo.modulo, adesso)
  if (d.errore) return no(409, d.errore)
  if (d.modo === 'richiesta') {
    const refRichiesta = db.doc(`contatti/${moduliApp.idRichiesta(docCliente.id, corpo.modulo)}`)
    const r = moduliApp.richiestaDallApp({ uid: docCliente.id, ...cliente }, { ...corpo, scelta: d.scelta }, chi.email || chi.uid, (await refRichiesta.get()).data(), adesso)
    if (r.errore) return no(409, r.errore)
    await refRichiesta.set(r.documento)
    console.log(`[moduli dall'app] ${trovata.id}: ${corpo.azione} ${corpo.modulo} chiesto all'assistenza (${chi.email || chi.uid})`)
    return res.status(200).json({ ok: true, in_attesa: true })
  }
  const stripe = stripeClient()
  if (!stripe) return no(503, 'Il pagamento online non è disponibile al momento: riprovare più tardi.')
  try {
    await aggiornaSubscription(stripe, cliente.abbonamento.stripe_subscription, docCliente.id, d.scelta)
  } catch (e) {
    console.error(`[moduli dall'app] ${trovata.id}, ${corpo.azione} ${corpo.modulo}:`, e?.message || e)
    return no(502, 'Il cambio non è passato: riprovare fra poco.')
  }
  // Chi, quando e da dove, come i cambi dell'admin: in un locale gli
  // admin dell'app possono essere più d'uno.
  const storico = { il: adesso.toISOString(), da: chi.email || chi.uid, modo: 'app', azione: corpo.azione, modulo: corpo.modulo, ...d.scelta }
  await docCliente.ref.update({ storico_piano: FieldValue.arrayUnion(storico) }).catch((e) => console.error(`[moduli dall'app] ${trovata.id}, storico:`, e?.message || e))
  console.log(`[moduli dall'app] ${trovata.id}: ${corpo.azione} ${corpo.modulo} (${chi.email || chi.uid})`)
  return res.status(200).json(corpo.azione === 'aggiungi' ? { ok: true } : { ok: true, dal: moduliApp.dalGiorno(adesso) })
})


// L'admin cambia piano, moduli e terminali di un locale: con Stripe
// (l'abbonamento si aggiorna, il webhook scrive il cliente) o fuori da
// Stripe (si scrive qui). Ogni cambio nello storico del cliente.
exports.cambiaPianoAdmin = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const doc = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]
  if (!doc) throw new HttpsError('not-found', 'Cliente sconosciuto.')
  const cliente = doc.data()
  const c = cambioAdmin(cliente, req.data, { da: req.auth.token.email || req.auth.uid })
  if (!c.ok) throw new HttpsError('failed-precondition', c.perche)
  if (req.data.modo === 'stripe') {
    const stripe = stripeClient()
    if (!stripe) throw new HttpsError('failed-precondition', 'Stripe non è configurato.')
    await aggiornaSubscription(stripe, cliente.abbonamento.stripe_subscription, cliente.uid, c.scelta)
  } else {
    await doc.ref.set(c.cliente, { merge: true })
  }
  await doc.ref.update({ storico_piano: FieldValue.arrayUnion(c.storico) })
  return { ok: true, modo: req.data.modo }
})
