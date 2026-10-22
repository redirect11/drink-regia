// ── LE FUNCTIONS DELLA REGIA (REQ-FLOTTA-006) ─────────────────────────
//
// Due cose sole: quando nasce (o viene rilanciata) una richiesta di
// attivazione, lanciare il workflow GitHub `provisiona-istanza.yml`; e
// ricevere l'esito dal workflow. La logica sta in lib/provisioning.js.
//
// Segreti (firebase functions:secrets:set, progetto drink-regia):
//   GITHUB_DISPATCH_TOKEN         token fine-grained con actions:write sul repo
//   PROVISIONING_CALLBACK_SECRET  il bearer che il workflow usa per l'esito
// Configurazione non segreta (.env): GITHUB_REPO (owner/repo), GITHUB_REF.

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, documentoIstanza, bearerValido } = require('./lib/provisioning.js')
const { patchLicenzaPiano, sceltaCambiata } = require('./lib/licenza.js')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { righeCheckout, metadatiDi, aggiornamentoDaEvento } = require('./lib/abbonamento.js')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { patchLicenza, daSospendere, STATI: STATI_LICENZA } = require('./lib/sospensione.js')
const { initializeApp: initializeAppCon, getApps } = require('firebase-admin/app')

initializeApp()
const db = getFirestore()
const OPTS = { region: 'europe-west1' }
const GITHUB_DISPATCH_TOKEN = defineSecret('GITHUB_DISPATCH_TOKEN')
const PROVISIONING_CALLBACK_SECRET = defineSecret('PROVISIONING_CALLBACK_SECRET')
// Stripe (REQ-FLOTTA-007): chiave segreta e segreto del webhook, prima
// quelle di PROVA (sk_test_…, whsec_…), poi quelle vere.
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY')
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET')
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
  const corpo = dispatchPayload(richiesta, { ref: REF })
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
  const adesso = new Date().toISOString()
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
  if (!ist?.progetto || ist.stato !== 'attiva') return
  await firestoreDi(ist.progetto).doc('settings/bar').update(patchLicenzaPiano(dopo))
  await db.doc(`istanze/${dopo.slug}`).set({ licenza_piano: dopo.piano, licenza_scritta_il: new Date().toISOString() }, { merge: true })
})
