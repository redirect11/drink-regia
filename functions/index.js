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
// Configurazione non segreta (.env): GITHUB_REPO (owner/repo), GITHUB_REF.

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, documentoIstanza, bearerValido } = require('./lib/provisioning.js')
const { patchLicenzaPiano, sceltaCambiata } = require('./lib/licenza.js')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { righeCheckout, metadatiDi, aggiornamentoDaEvento } = require('./lib/abbonamento.js')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { patchLicenza, daSospendere, STATI: STATI_LICENZA } = require('./lib/sospensione.js')
const { initializeApp: initializeAppCon, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const ai = require('./lib/ai.js')
const { datiEsistente, documentiEsistente, DatiNonValidi, scriveLicenza } = require('./lib/esistente.js')

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
const REPO = process.env.GITHUB_REPO || 'redirect11/tana-drink'
const REF = process.env.GITHUB_REF || 'develop'
const WORKFLOW = 'provisiona-istanza.yml'
const WORKFLOW_AGGIORNA = 'aggiorna-istanza.yml'
// La versione dell'app da pubblicare: di norma `main` (l'ultimo rilascio).
const REF_APP = process.env.APP_REF || 'main'

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
  const corpo = dispatchPayload({ ...richiesta, nome_locale: cliente.nome_locale, piano: cliente.piano, moduli: cliente.moduli }, { ref: REF })
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
    automatico: impostazioni.deploy_automatico !== false,
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

// L'esito dal workflow: POST con bearer, corpo { slug, stato, url, progetto, versione, errore }.
exports.esitoProvisioning = onRequest({ ...OPTS, secrets: [PROVISIONING_CALLBACK_SECRET], cors: false }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('')
  if (!bearerValido(req.get('authorization'), PROVISIONING_CALLBACK_SECRET.value())) return res.status(401).send('')
  const esito = esitoValido(req.body)
  if (!esito) return res.status(400).json({ errore: 'esito non valido' })
  const ref = db.doc(`istanze/${esito.slug}`)
  const prima = (await ref.get()).data() || null
  await ref.set(documentoIstanza(esito, prima), { merge: true })
  await db.doc(`richieste/${esito.slug}`).set({ stato: esito.stato, aggiornata_il: new Date().toISOString() }, { merge: true })
  res.status(200).json({ ok: true })
})

// ── L'ABBONAMENTO (REQ-FLOTTA-007) ────────────────────────────────────

const stripeClient = () => {
  const chiave = STRIPE_SECRET_KEY.value()
  if (!chiave) return null
  // Caricato qui e non in cima: senza chiave la regia lavora lo stesso.
  const Stripe = require('stripe')
  return new Stripe(chiave)
}

// Il titolare sceglie il piano: nasce la sessione di Checkout (abbonamento
// mensile) e torna l'url. I metadati portano uid e scelta, che il webhook
// userà per aggiornare il cliente.
exports.creaCheckout = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const stripe = stripeClient()
  if (!stripe) throw new HttpsError('failed-precondition', 'Il pagamento online non è ancora attivo: scrivici all’email del prodotto.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const scelta = { piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali }
  const ritorno = String(req.data?.ritorno || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(ritorno)) throw new HttpsError('invalid-argument', 'Indirizzo di ritorno non valido.')
  const sessione = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: righeCheckout(scelta),
    customer_email: cliente.abbonamento?.stripe_customer ? undefined : cliente.email,
    customer: cliente.abbonamento?.stripe_customer || undefined,
    client_reference_id: uid,
    metadata: metadatiDi(uid, scelta),
    subscription_data: { metadata: metadatiDi(uid, scelta) },
    success_url: `${ritorno}/dashboard?pagamento=ok`,
    cancel_url: `${ritorno}/dashboard?pagamento=annullato`,
    locale: 'it',
  })
  return { url: sessione.url }
})

// Il webhook di Stripe: la firma si verifica sul corpo grezzo, e lo stato
// dell'abbonamento segue gli eventi (aggiornamentoDaEvento). Una
// subscription si ritrova per id nel cliente che l'ha aperta.
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
  // Una ricarica del credito AI (REQ-AI-003): pagamento singolo, credito
  // in più. Prima dell'abbonamento, che la ignora comunque.
  if (evento.type === 'checkout.session.completed') {
    const ricarica = ai.ricaricaDaSessione(evento.data?.object)
    if (ricarica) {
      const esito = await accreditaRicarica(ricarica, { origine: 'stripe' })
      return res.status(200).json({ ok: true, ricarica: esito })
    }
  }
  const agg = aggiornamentoDaEvento(evento.type, evento.data?.object)
  if (!agg) return res.status(200).json({ ok: true, ignorato: evento.type })
  let uid = agg.uid
  if (!uid && agg.stripe_subscription) {
    const q = await db.collection('clienti').where('abbonamento.stripe_subscription', '==', agg.stripe_subscription).limit(1).get()
    uid = q.empty ? null : q.docs[0].id
  }
  if (!uid) return res.status(200).json({ ok: true, ignorato: 'cliente non trovato' })
  const ref = db.doc(`clienti/${uid}`)
  if (agg.patch.abbonamento) await ref.set(agg.patch, { merge: true })
  else await ref.update({ ...agg.patch, 'abbonamento.visto_il': FieldValue.serverTimestamp() })
  res.status(200).json({ ok: true })
})

// ── SOSPENDERE, RIATTIVARE, CHIUDERE UN'ISTANZA (REQ-FLOTTA-008) ───────

// Il Firestore di un'istanza, da qui: un'app admin per progetto. Il
// service account di runtime della regia ha `roles/datastore.user` sul
// progetto (lo dà Terraform).
function firestoreDi(progetto) {
  const nome = `istanza-${progetto}`
  const app = getApps().find((a) => a.name === nome) || initializeAppCon({ projectId: progetto }, nome)
  return getFirestore(app)
}

async function scriviStatoIstanza(slug, stato, motivo) {
  const ist = (await db.doc(`istanze/${slug}`).get()).data()
  if (!ist?.progetto) throw new HttpsError('failed-precondition', 'Istanza senza progetto: non è ancora attiva.')
  // Un locale registrato come esistente (la Tana, REQ-AI-003) non riceve
  // la licenza dalla regia finché non lo si collega: «senza rompere niente».
  if (!scriveLicenza(ist)) throw new HttpsError('failed-precondition', 'Questa installazione non riceve la licenza dalla regia: si gestisce dal suo progetto.')
  await firestoreDi(ist.progetto).doc('settings/bar').update(patchLicenza(stato, { motivo }))
  await db.doc(`istanze/${slug}`).set({ licenza_stato: stato, licenza_motivo: motivo || null, licenza_dal: new Date().toISOString() }, { merge: true })
}

// Dal backoffice: Sospendi, Riattiva, Chiudi. Solo col claim admin.
exports.impostaStatoIstanza = onCall(OPTS, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const { slug, stato, motivo } = req.data || {}
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(slug || '')) throw new HttpsError('invalid-argument', 'Slug non valido.')
  if (!STATI_LICENZA.includes(stato)) throw new HttpsError('invalid-argument', 'Stato non valido.')
  await scriviStatoIstanza(slug, stato, motivo ? String(motivo).slice(0, 200) : null)
  return { ok: true }
})

// Ogni mattina: chi non paga da più dei giorni di grazia si sospende, chi
// ha disdetto si chiude, chi è tornato a pagare si riattiva.
exports.sospendiMorosi = onSchedule({ ...OPTS, schedule: '0 6 * * *', timeZone: 'Europe/Rome' }, async () => {
  const clienti = (await db.collection('clienti').get()).docs.map((d) => d.data())
  const istanze = Object.fromEntries((await db.collection('istanze').get()).docs.map((d) => [d.id, d.data()]))
  for (const { cliente, stato, motivo } of daSospendere(clienti, istanze)) {
    try {
      await scriviStatoIstanza(cliente.slug, stato, motivo)
      console.log(`[licenza] ${cliente.slug} → ${stato}`)
    } catch (e) {
      console.error(`[licenza] ${cliente.slug}:`, e?.message || e)
    }
  }
})

// ── GLI AGGIORNAMENTI DELLA FLOTTA (REQ-FLOTTA-009) ───────────────────
// L'app di base è tana-drink: ogni rilascio si porta sui locali che si
// decide dal backoffice («Aggiorna», «Aggiorna tutte»). La versione la
// riferisce il workflow, con l'esito.
exports.aggiornaIstanza = onCall({ ...OPTS, secrets: [GITHUB_DISPATCH_TOKEN] }, async (req) => {
  if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied', 'Solo l’amministratore.')
  const slug = String(req.data?.slug || '')
  const ist = (await db.doc(`istanze/${slug}`).get()).data()
  if (!ist || ist.stato !== 'attiva') throw new HttpsError('failed-precondition', 'L’istanza non è attiva.')
  // Un locale registrato come esistente (la Tana, REQ-AI-003) ha i suoi
  // rilasci e il suo progetto: il workflow della flotta non lo tocca mai.
  if (ist.origine === 'esistente') throw new HttpsError('failed-precondition', 'Questa installazione si aggiorna dal suo repository, non dalla flotta.')
  const cliente = (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]?.data()
  const ref = String(req.data?.ref || REF_APP)
  const res = await dispatchGitHub(WORKFLOW_AGGIORNA, dispatchAggiornamento({ slug, nome_locale: cliente?.nome_locale }, { ref }))
  if (res.status !== 204) throw new HttpsError('internal', `GitHub ${res.status}`)
  await db.doc(`istanze/${slug}`).set({ aggiornamento_chiesto_il: new Date().toISOString(), aggiornamento_ref: ref }, { merge: true })
  return { ok: true, ref }
})

// ── IL PIANO CHE CAMBIA (REQ-FLOTTA-010) ──────────────────────────────
// Il titolare cambia piano, moduli o terminali: con Stripe si aggiorna la
// subscription (gli importi si conguagliano) e il webhook riporta la
// scelta sul cliente; senza Stripe (piano a mano) si scrive subito. In
// tutti e due i casi la licenza dell'istanza segue (sotto).
exports.cambiaScelta = onCall({ ...OPTS, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Serve l’accesso.')
  const uid = req.auth.uid
  const cliente = (await db.doc(`clienti/${uid}`).get()).data()
  if (!cliente) throw new HttpsError('not-found', 'Nessun locale registrato per questo account.')
  const scelta = { piano: req.data?.piano, moduli: req.data?.moduli, terminali: req.data?.terminali }
  const sub = cliente.abbonamento?.stripe_subscription
  const stripe = stripeClient()
  if (sub && stripe) {
    const attuale = await stripe.subscriptions.retrieve(sub)
    await stripe.subscriptions.update(sub, {
      items: [...attuale.items.data.map((i) => ({ id: i.id, deleted: true })), ...righeCheckout(scelta)],
      metadata: metadatiDi(uid, scelta),
      proration_behavior: 'create_prorations',
    })
    return { ok: true, via: 'stripe' }
  }
  if (cliente.abbonamento?.origine === 'manuale' || cliente.piano) {
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
exports.licenzaSegueIlPiano = onDocumentUpdated({ ...OPTS, document: 'clienti/{uid}' }, async (event) => {
  const prima = event.data?.before?.data()
  const dopo = event.data?.after?.data()
  if (!dopo?.slug || !sceltaCambiata(prima, dopo)) return
  const ist = (await db.doc(`istanze/${dopo.slug}`).get()).data()
  if (!ist?.progetto || ist.stato !== 'attiva' || !scriveLicenza(ist)) return
  await firestoreDi(ist.progetto).doc('settings/bar').update(patchLicenzaPiano(dopo))
  await db.doc(`istanze/${dopo.slug}`).set({ licenza_piano: dopo.piano, licenza_scritta_il: new Date().toISOString() }, { merge: true })
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
  const pulita = metadatiDi(utente.uid, { piano, moduli, terminali })
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
    abbonamento: { stato: 'attivo', origine: 'manuale', dal: ora },
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

    const cassettoRef = db.doc(`ai/${chi.slug}`)
    const prima = (await cassettoRef.get()).data()
    const via = ai.puoChiedere(prima, ai.stimaMassimaMicroeuro(messaggio))
    if (!via.ok) {
      return res.status(402).json({ errore: via.perche, codice: via.codice, credito_eur: ai.inEuro(prima?.credito_microeuro) })
    }

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
        console.error(`[ai] ${chi.slug} ${messaggio.tipo}: ${tipo}`, e?.message)
      }
      const riprova =
        e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError
      return res.status(503).json({
        errore: riprova ? 'Il servizio AI è occupato: riprova tra poco.' : 'Il servizio AI non è disponibile in questo momento.',
        codice: 'servizio',
      })
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
    if (!letta.ok) return res.status(422).json({ errore: letta.perche, codice: letta.codice, ...conti })
    res.status(200).json({ ok: true, tipo: messaggio.tipo, risultato: letta.risultato, ...conti })
  }
)

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
  const ritorno = String(req.data?.ritorno || '').replace(/\/$/, '')
  if (!/^https?:\/\//.test(ritorno)) throw new HttpsError('invalid-argument', 'Indirizzo di ritorno non valido.')
  const stripe = stripeClient()
  if (!stripe) throw new HttpsError('failed-precondition', 'Il pagamento online non è ancora attivo: scrivici all’email del prodotto.')
  const metadata = ai.metadatiRicarica({ uid, slug: cliente.slug, p })
  const sessione = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [ai.rigaRicarica(p)],
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
