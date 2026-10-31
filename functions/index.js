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
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, eAggiornamento, documentoIstanza, documentoAggiornamento, bearerValido } = require('./lib/provisioning.js')
const rilasci = require('./lib/rilasci.js')
const { sceltaCambiata, licenzaProtetta, stessaLicenza } = require('./lib/licenza.js')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { FieldValue } = require('firebase-admin/firestore')
const { chiaveStripeVera, righeCheckout, metadatiDi, aggiornamentoDaEvento } = require('./lib/abbonamento.js')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { daSospendere, STATI: STATI_LICENZA } = require('./lib/sospensione.js')
const { initializeApp: initializeAppCon, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const ai = require('./lib/ai.js')
const elim = require('./lib/eliminazione.js')
const free = require('./lib/free.js')
const contatti = require('./lib/contatti.js')
const { getStorage } = require('firebase-admin/storage')
const { datiEsistente, documentiEsistente, DatiNonValidi, scriveLicenza, gestioneEsistente } = require('./lib/esistente.js')
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
  const corpo = dispatchPayload({ ...richiesta, nome_locale: cliente.nome_locale, piano: cliente.piano, moduli: cliente.moduli }, { ref: REF, app: REF_APP, ambiente: AMBIENTE_FLOTTA })
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
      await scriviLicenza(esito.slug)
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
  await db.doc(`istanze/${slug}`).set({ licenza_stato: stato, licenza_motivo: motivo || null, licenza_dal: new Date().toISOString() }, { merge: true })
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
  return { ok: true }
})

// Ogni mattina: chi non paga da più dei giorni di grazia si sospende, chi
// ha disdetto si chiude, chi è tornato a pagare si riattiva.
// Con gli aggiornamenti «solo finché si paga» (REQ-FLOTTA-020) chi non paga
// non si ferma: torna al Free, e al pagamento riprende il suo piano. Prima
// di tutto, le condizioni degli aggiornamenti arrivate alla loro data
// diventano quelle in vigore.
exports.sospendiMorosi = onSchedule({ ...OPTS, schedule: '0 6 * * *', timeZone: 'Europe/Rome' }, async () => {
  const clienti = (await db.collection('clienti').get()).docs.map((d) => d.data())
  const istanze = Object.fromEntries((await db.collection('istanze').get()).docs.map((d) => [d.id, d.data()]))
  const adesso = new Date()
  for (const [slug, ist] of Object.entries(istanze)) {
    const patch = aggiornamenti.promozione(ist, adesso)
    if (!patch) continue
    try {
      await db.doc(`istanze/${slug}`).set(patch, { merge: true })
      istanze[slug] = { ...ist, ...patch }
      await scriviLicenza(slug)
      console.log(`[aggiornamenti] ${slug}: in vigore le condizioni nuove`)
    } catch (e) {
      console.error(`[aggiornamenti] ${slug}:`, e?.message || e)
    }
  }
  for (const { cliente, stato, motivo } of daSospendere(clienti, istanze, { adesso, ripiega: (ist) => aggiornamenti.ripiegaInveceDiSospendere(ist, adesso) })) {
    try {
      await scriviStatoIstanza(cliente.slug, stato, motivo)
      console.log(`[licenza] ${cliente.slug} → ${stato}`)
    } catch (e) {
      console.error(`[licenza] ${cliente.slug}:`, e?.message || e)
    }
  }
  for (const { cliente, azione } of aggiornamenti.daRipiegare(clienti, istanze, { adesso })) {
    try {
      await ripiegaAlFree(cliente, azione)
      console.log(`[aggiornamenti] ${cliente.slug} → ${azione === 'ripiega' ? 'piano Free' : `di nuovo ${cliente.piano}`}`)
    } catch (e) {
      console.error(`[aggiornamenti] ${cliente.slug}:`, e?.message || e)
    }
  }
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
  const datiIstanza = { slug, nome_locale: cliente?.nome_locale, ...(esistente ? { progetto: ist.progetto, cliente: ist.cliente, build: ist.build } : {}) }
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

async function clienteDi(slug) {
  return (await db.collection('clienti').where('slug', '==', slug).limit(1).get()).docs[0]?.data() || null
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

async function scriviLicenza(slug) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  if (!ist) return { ok: false, perche: 'Istanza non trovata.' }
  const cliente = await clienteDi(slug)
  const lic = licenzaProtetta(ist, cliente, { slug, regiaUrl: REGIA_URL })
  const { modalita, inclusi, motivo } = lic.aggiornamenti
  await ref.set({ regola_aggiornamenti: { modalita, inclusi, motivo } }, { merge: true })
  if (!riceveLicenza(ist)) return { ok: true, scritta: false }
  // Senza cliente la licenza sarebbe quella di un piano base inventato.
  if (!cliente) return { ok: false, perche: 'Nessun cliente per questo locale: la licenza non si calcola.' }
  const istanza = firestoreDi(ist.progetto)
  await istanza.doc(LICENZA_PROTETTA).set(lic)
  // mergeFields: il campo licenza si sostituisce intero, il resto di
  // settings/bar (le impostazioni del locale) non si tocca.
  await istanza.doc('settings/bar').set({ licenza: lic }, { mergeFields: ['licenza'] })
  await ref.set({ licenza_protetta: { ok: true, perche: null, controllata_il: lic.scritta_il } }, { merge: true })
  return { ok: true, scritta: true }
}

// La verifica di un locale: licenza/attuale c'è, è uguale a
// settings/bar.licenza ed è quella che dicono i dati della regia.
async function verificaLicenza(slug) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  const istanza = firestoreDi(ist.progetto)
  const [protetta, bar] = await Promise.all([istanza.doc(LICENZA_PROTETTA).get(), istanza.doc('settings/bar').get()])
  const attesa = licenzaProtetta(ist, await clienteDi(slug), { slug, regiaUrl: REGIA_URL })
  let perche = null
  if (!protetta.exists) perche = 'Manca licenza/attuale: con l’app nuova il locale si ferma.'
  else if (!stessaLicenza(protetta.data(), bar.data()?.licenza)) perche = 'licenza/attuale è diversa da settings/bar.licenza.'
  else if (!stessaLicenza(protetta.data(), attesa)) perche = 'La licenza non è quella che dicono i dati della regia.'
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
async function applicaScelta(slug, scelta, { il = new Date().toISOString(), da = null } = {}) {
  const ref = db.doc(`istanze/${slug}`)
  const ist = (await ref.get()).data()
  const p = ist?.proposta_aggiornamento
  if (!p?.attesa) return 'Nessuna proposta in attesa.'
  // Il piano può aver smesso di comprenderli dopo la proposta.
  if (scelta === 'aggiorna' && !aggiornamenti.regolaDi(ist, await clienteDi(slug)).inclusi) return 'Il piano del locale non comprende più gli aggiornamenti.'
  const fatta = { scelta, scelta_il: il, scelta_da: da, scelta_letta_il: il }
  if (scelta === 'aggiorna') {
    const perche = await lanciaAggiornamento(slug, p.tag, { rilascio: p.rilascio })
    if (perche) return perche
    await ref.update({ proposta_aggiornamento: { ...p, ...fatta, attesa: false } })
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

// La scelta dall'app: il titolare la scrive in `aggiornamenti/scelta` nel
// database del suo locale, e la regia la va a leggere. Il profilo leggero
// non ha Functions, e una chiamata dal browser alla regia vorrebbe una
// chiave nel browser: così non serve niente di nuovo.
exports.leggiScelteAggiornamenti = onSchedule({ ...OPTS, schedule: 'every 10 minutes', timeZone: 'Europe/Rome', secrets: [GITHUB_DISPATCH_TOKEN] }, async () => {
  const attese = (await db.collection('istanze').where('proposta_aggiornamento.attesa', '==', true).get()).docs
  for (const d of attese) {
    const ist = d.data()
    if (!ist.progetto || ist.stato !== 'attiva' || !scriveLicenza(ist)) continue
    try {
      const s = (await firestoreDi(ist.progetto).doc('aggiornamenti/scelta').get()).data()
      const scelta = aggiornamenti.sceltaValida(s, ist.proposta_aggiornamento, { giaLetta: ist.proposta_aggiornamento.scelta_letta_il })
      if (!scelta) continue
      const perche = await applicaScelta(d.id, scelta, { il: aggiornamenti.dataDi(s.il) || new Date().toISOString(), da: typeof s.da === 'string' ? s.da.slice(0, 128) : null })
      console.log(`[aggiornamenti] ${d.id}: ${scelta}${perche ? ` non partito: ${perche}` : ''}`)
    } catch (e) {
      console.error(`[aggiornamenti] ${d.id}, la scelta:`, e?.message || e)
    }
  }
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
  const fuori = free.moduliFuoriVendita(cliente, scelta, await vendita())
  if (fuori.length) throw new HttpsError('failed-precondition', `Non più in vendita: ${fuori.join(', ')}.`)
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
  if (prima?.abbonamento?.stato !== dopo.abbonamento?.stato && !sceltaCambiata(prima, dopo)) {
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
  if (free.serveProfiloCompleto(ist, dopo)) {
    const perche = await lanciaAggiornamento(dopo.slug, REF_APP, { profilo: 'completo' })
    console.log(`[free] ${dopo.slug} verso il profilo completo: ${perche || 'partito'}`)
  }
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
  // Anche la ricarica passa da Stripe: coi pagamenti spenti la fa l'admin.
  if (!contatti.pagamentiOnline(await vendita())) throw new HttpsError('failed-precondition', PAGAMENTI_SPENTI)
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
    g = gestioneEsistente(req.data, { slug })
  } catch (e) {
    if (e instanceof DatiNonValidi) throw new HttpsError('invalid-argument', e.message)
    throw e
  }
  await ref.update({ ...g, aggiornata_il: new Date().toISOString() })
  return { ok: true, ...g }
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
    await scriviStatoIstanza(slug, 'chiusa', 'chiusura chiesta dal titolare')
    await istRef.set({ eliminazione: richiesta }, { merge: true })
    await disdettaAFinePeriodo(cliente, true).catch((e) => console.error(`[eliminazione] ${slug}, disdetta:`, e?.message || e))
    return { ok: true, quando: richiesta.quando }
  }

  if (azione === 'chiedi' && admin) {
    const puo = elim.puoEliminare(ist)
    if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
    if (!elim.confermaValida(ist, conferma)) throw new HttpsError('invalid-argument', `Per confermare scrivi ${ist.progetto}.`)
    const richiesta = elim.eliminazioneChiesta(ist, { subito: Boolean(subito), da: req.auth.token.email || req.auth.uid, adesso })
    await istRef.set({ eliminazione: richiesta }, { merge: true })
    if (!subito) return { ok: true, quando: richiesta.quando }
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
      await scriviStatoIstanza(slug, e.licenza_prima || 'attiva', e.licenza_prima === 'sospesa' ? 'pagamento non ricevuto' : null)
      await disdettaAFinePeriodo(cliente, false).catch((err) => console.error(`[eliminazione] ${slug}, disdetta:`, err?.message || err))
    }
    return { ok: true }
  }

  throw new HttpsError('invalid-argument', 'Azione sconosciuta.')
})

// Ogni mattina: le cancellazioni programmate arrivate alla data partono.
exports.eliminazioniProgrammate = onSchedule({ ...OPTS, schedule: '0 5 * * *', timeZone: 'Europe/Rome', secrets: [GITHUB_DISPATCH_TOKEN] }, async () => {
  for (const slug of elim.daEliminareOggi(await tutteLeIstanze())) {
    const perche = await lanciaEliminazione(slug).catch((e) => e?.message || String(e))
    console.log(`[eliminazione] ${slug}: ${perche || 'partita'}`)
  }
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
  const id = String(req.data?.modulo || '')
  const adesso = new Date()
  const puo = prove.puoProvare(cliente, ist, id, await vendita(), adesso)
  if (!puo.ok) throw new HttpsError('failed-precondition', puo.perche)
  await ref.update({
    [`prove.${id}`]: { dal: adesso.toISOString(), scade_il: puo.scade_il, giorni: puo.giorni },
    prove_fatte: FieldValue.arrayUnion(id),
  })
  return { ok: true, scade_il: puo.scade_il }
})

// Ogni mattina: le prove scadute, o dei moduli ormai comprati, si tolgono;
// la licenza segue da sola (licenzaSegueIlPiano).
exports.proveScadute = onSchedule({ ...OPTS, schedule: '30 5 * * *', timeZone: 'Europe/Rome' }, async () => {
  const adesso = new Date()
  for (const d of (await db.collection('clienti').get()).docs) {
    const via = prove.proveDaTogliere(d.data(), adesso)
    if (!via.length) continue
    await d.ref.update(Object.fromEntries(via.map((id) => [`prove.${id}`, FieldValue.delete()])))
    console.log(`[prove] ${d.data().slug}: tolte ${via.join(', ')}`)
  }
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
    const sub = cliente.abbonamento.stripe_subscription
    const attuale = await stripe.subscriptions.retrieve(sub)
    await stripe.subscriptions.update(sub, {
      items: [...attuale.items.data.map((i) => ({ id: i.id, deleted: true })), ...righeCheckout(c.scelta)],
      metadata: metadatiDi(cliente.uid, c.scelta),
      proration_behavior: 'create_prorations',
    })
  } else {
    await doc.ref.set(c.cliente, { merge: true })
  }
  await doc.ref.update({ storico_piano: FieldValue.arrayUnion(c.storico) })
  return { ok: true, modo: req.data.modo }
})
