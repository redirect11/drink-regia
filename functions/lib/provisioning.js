// ── L'ATTIVAZIONE DI UN'ISTANZA, LOGICA PURA (REQ-FLOTTA-006) ──────────
//
// Dalla richiesta in `richieste/{slug}` al lancio del workflow GitHub
// `provisiona-istanza.yml`, e dall'esito che il workflow manda indietro ai
// documenti `istanze/{slug}` e `richieste/{slug}`. Niente Firebase qui:
// index.js collega, questo decide, e si prova senza emulatori.

const { sceltaPulita } = require('./abbonamento.js')
const { eGratuito, profiloDi } = require('./free.js')

const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const STATI = ['in coda', 'in corso', 'attiva', 'errore']
// Gli stati con cui un'attivazione è già in viaggio o finita: non si
// chiede due volte. Dopo un «errore» sì, si riprova.
const IN_VIAGGIO = ['da approvare', 'in coda', 'in corso', 'attiva']

// ── LA RICHIESTA LA SCRIVE IL SERVER (audit del 22/10/2026, C2) ────────
// Prima la scriveva il browser in richieste/{slug}, e le regole non
// controllavano né lo slug né l'abbonamento: chiunque registrato poteva
// attivarsi gratis col piano completo, saltare l'approvazione dell'admin o
// scrivere sullo slug di un altro cliente. «Questo va assolutamente
// risolto» (l'utente, 22/10/2026). Da qui in poi la callable
// `chiediAttivazione` rilegge il cliente e decide con questa funzione:
// slug, piano, moduli e nome vengono dal documento del cliente, mai dal
// corpo della chiamata; lo stato iniziale lo sceglie
// `impostazioni/regia.deploy_automatico`, letto sul server.
function preparaRichiesta(cliente, { istanza = null, richiesta = null, emailVerificata = false, automatico = true, adesso = new Date() } = {}) {
  const no = (perche) => ({ ok: false, perche, richiesta: null })
  if (!cliente || !SLUG.test(cliente.slug || '')) return no('Nessun locale registrato per questo account.')
  if (!emailVerificata) return no('Prima conferma l’email: trovi il messaggio nella casella con cui ti sei registrato.')
  if (!cliente.piano) return no('Serve un piano: scegline uno e completa l’abbonamento.')
  if (cliente.abbonamento?.stato !== 'attivo') return no('L’abbonamento non risulta attivo.')
  // La stessa regola della dashboard (src/lib/istanze.js, puoAttivare):
  // l'istanza vince sulla richiesta, e in viaggio non si chiede di nuovo.
  const stato = istanza?.stato || richiesta?.stato || null
  if (stato && IN_VIAGGIO.includes(stato)) return no(`L’istanza è già ${stato}.`)
  // Un locale eliminato (REQ-FLOTTA-014) non rinasce da qui: Google non
  // riusa mai l'id di un progetto cancellato, drinkpos-<slug> non torna.
  if (istanza?.stato === 'eliminata') return no('Il locale è stato eliminato: per riaprirlo scrivici.')
  // Il Free resta Free (REQ-FLOTTA-015): sceltaPulita è quella di Stripe,
  // che conosce solo i piani a pagamento e farebbe del Free un Base.
  const scelta = eGratuito(cliente.piano) ? { piano: 'free', moduli: [] } : sceltaPulita(cliente)
  return {
    ok: true,
    perche: null,
    richiesta: {
      uid: cliente.uid,
      slug: cliente.slug,
      nome_locale: String(cliente.nome_locale || cliente.slug),
      piano: scelta.piano,
      moduli: scelta.moduli,
      stato: automatico ? 'in coda' : 'da approvare',
      chiesta_il: adesso.toISOString(),
      chiesta_da: 'titolare',
    },
  }
}

// Prima di lanciare il workflow si rilegge il cliente: la richiesta deve
// essere la sua (stesso slug, stesso uid) e l'abbonamento deve essere
// ancora attivo. Se qualcosa non torna il lancio non parte, qualunque
// cosa ci sia scritto nella richiesta. Vale anche per i rilanci.
function richiestaCoerente(richiesta, cliente) {
  if (!richiesta || !SLUG.test(richiesta.slug || '')) return { ok: false, perche: 'Richiesta senza uno slug valido' }
  if (!cliente) return { ok: false, perche: 'Cliente non trovato' }
  if (cliente.slug !== richiesta.slug) return { ok: false, perche: `Lo slug «${richiesta.slug}» non è del cliente` }
  if (richiesta.uid && cliente.uid !== richiesta.uid) return { ok: false, perche: 'La richiesta non è del titolare' }
  if (cliente.abbonamento?.stato !== 'attivo') return { ok: false, perche: 'Abbonamento non attivo' }
  return { ok: true, perche: null }
}

// Quale regia lancia: decide l'environment del workflow (flotta o
// flotta-test), e con lui l'account di fatturazione e l'indirizzo a cui
// torna l'esito. Qualunque altro valore vale produzione.
const AMBIENTI = ['produzione', 'test']
const ambienteValido = (a) => (AMBIENTI.includes(a) ? a : 'produzione')

// Il corpo della chiamata `POST /repos/{repo}/actions/workflows/{file}/dispatches`.
// Gli input sono stringhe: GitHub non accetta altro. Due versioni diverse,
// dal 29/10/2026 che i workflow stanno nella regia: `ref` in cima è il
// ramo della regia che contiene il workflow (di norma main), `app` è la
// versione di tana-drink da pubblicare (REQ-FLOTTA-009).
function dispatchPayload(richiesta, { ref = 'main', app = 'main', ambiente = 'produzione' } = {}) {
  if (!richiesta || !SLUG.test(richiesta.slug || '')) throw new Error('Richiesta senza uno slug valido')
  return {
    ref,
    inputs: {
      slug: richiesta.slug,
      nome_locale: String(richiesta.nome_locale || richiesta.slug),
      piano: String(richiesta.piano || 'base'),
      moduli: (richiesta.moduli || []).join(','),
      uid: String(richiesta.uid || ''),
      ref: app,
      ambiente: ambienteValido(ambiente),
      // Leggero per il Free (niente Functions, Storage, segreti: costo
      // zero), completo per gli altri (REQ-FLOTTA-015).
      profilo: profiloDi(richiesta.piano),
    },
  }
}

const PROFILI = ['leggero', 'completo']
const profiloValido = (p) => (PROFILI.includes(p) ? p : 'completo')

// L'aggiornamento di un'istanza (REQ-FLOTTA-009): stesso meccanismo, altro
// workflow (aggiorna-istanza.yml), con la versione dell'app da pubblicare
// e il profilo: quello che l'istanza ha, o «completo» quando un locale Free
// passa a un piano a pagamento.
function dispatchAggiornamento(istanza, { ref = 'main', app = 'main', ambiente = 'produzione', profilo = 'completo' } = {}) {
  if (!istanza || !SLUG.test(istanza.slug || '')) throw new Error('Istanza senza uno slug valido')
  return {
    ref,
    inputs: { slug: istanza.slug, nome_locale: String(istanza.nome_locale || istanza.slug), ref: app, ambiente: ambienteValido(ambiente), profilo: profiloValido(profilo) },
  }
}

// Si lancia solo una richiesta «in coda»: una «in corso» è già partita,
// una «attiva» ha finito. La Function su update usa `rilanciata_il` per
// distinguere un rilancio dell'admin da un altro aggiornamento qualsiasi.
function daLanciare(prima, dopo) {
  if (!dopo || dopo.stato !== 'in coda') return false
  if (!prima) return true
  return prima.stato !== 'in coda' || (dopo.rilanciata_il && dopo.rilanciata_il !== prima.rilanciata_il)
}

// L'esito che il workflow manda: { slug, stato, url?, progetto?, versione?, ref?, ambiente?, operazione?, errore? }.
function esitoValido(body) {
  if (!body || typeof body !== 'object') return null
  if (!SLUG.test(body.slug || '')) return null
  if (!STATI.includes(body.stato)) return null
  return {
    slug: body.slug,
    stato: body.stato,
    url: body.url ? String(body.url) : null,
    progetto: body.progetto ? String(body.progetto) : null,
    versione: body.versione ? String(body.versione) : null,
    // L'app di un locale è di produzione (REQ-FLOTTA-009): il workflow lo
    // dice, con il ramo o tag da cui l'ha compilata.
    ambiente: body.ambiente ? String(body.ambiente) : null,
    ref: body.ref ? String(body.ref) : null,
    // Attivazione o aggiornamento (REQ-FLOTTA-012): il workflow può dirlo;
    // se non lo dice decide eAggiornamento, dallo stato dell'istanza.
    operazione: ['attivazione', 'aggiornamento'].includes(body.operazione) ? body.operazione : null,
    // Con quale profilo è stato pubblicato (REQ-FLOTTA-015).
    profilo: PROFILI.includes(body.profilo) ? body.profilo : null,
    errore: body.stato === 'errore' ? String(body.errore || (body.operazione === 'aggiornamento' ? 'Aggiornamento fallito' : 'Attivazione fallita')) : null,
  }
}

// UN ESITO SU UN'ISTANZA GIÀ ATTIVA È UN AGGIORNAMENTO (REQ-FLOTTA-012).
// Prima ogni esito riscriveva lo stato: un aggiornamento fallito segnava
// «errore» un locale che girava ancora con la versione di prima, e da lì
// niente più Aggiorna, Sospendi o Chiudi. Un'attivazione parte solo da
// un'istanza non attiva (IN_VIAGGIO), quindi un esito su un'istanza
// attiva, o su un locale esistente che riferisce la sua versione, è
// sempre un aggiornamento.
function eAggiornamento(esito, prima) {
  if (esito?.operazione === 'aggiornamento') return true
  if (esito?.operazione === 'attivazione') return false
  return prima?.stato === 'attiva' || prima?.origine === 'esistente'
}

// Il documento istanze/{slug} dopo l'esito di un aggiornamento: lo stato
// dell'istanza non cambia; versione e ref cambiano solo se è riuscito.
// Se è fallito il locale può avere una parte della versione nuova (le
// regole sì, l'hosting no): lo dice il backoffice, e si riprova o si
// torna indietro.
function documentoAggiornamento(esito, prima = null, adesso = new Date()) {
  const quando = adesso.toISOString()
  const agg = prima?.aggiornamento || {}
  const riuscito = esito.stato === 'attiva'
  const fallito = esito.stato === 'errore'
  const stato = riuscito ? 'riuscito' : fallito ? 'fallito' : 'in corso'
  return {
    ...(prima || {}),
    slug: esito.slug,
    versione: riuscito ? esito.versione ?? prima?.versione ?? null : prima?.versione ?? null,
    ref: riuscito ? esito.ref ?? prima?.ref ?? null : prima?.ref ?? null,
    ambiente: esito.ambiente ?? prima?.ambiente ?? null,
    profilo: riuscito ? esito.profilo ?? prima?.profilo ?? null : prima?.profilo ?? null,
    aggiornamento: {
      ...agg,
      ref: agg.ref ?? esito.ref ?? null,
      stato,
      versione: esito.versione ?? null,
      finito_il: stato === 'in corso' ? null : quando,
      errore: fallito ? (esito.errore === 'Attivazione fallita' ? 'Aggiornamento fallito' : esito.errore) : null,
    },
    aggiornata_il: quando,
  }
}

// Il documento istanze/{slug} dopo un esito, a partire da quello che c'era.
function documentoIstanza(esito, prima = null, adesso = new Date()) {
  return {
    ...(prima || {}),
    slug: esito.slug,
    stato: esito.stato,
    url: esito.url ?? prima?.url ?? null,
    progetto: esito.progetto ?? prima?.progetto ?? null,
    versione: esito.versione ?? prima?.versione ?? null,
    ambiente: esito.ambiente ?? prima?.ambiente ?? null,
    ref: esito.ref ?? prima?.ref ?? null,
    profilo: esito.profilo ?? prima?.profilo ?? null,
    errore: esito.errore,
    aggiornata_il: adesso.toISOString(),
  }
}

// Il bearer del callback: un confronto a tempo costante basta, il segreto
// è lungo e casuale.
function bearerValido(header, segreto) {
  if (!segreto || !header) return false
  const atteso = `Bearer ${segreto}`
  if (header.length !== atteso.length) return false
  let diff = 0
  for (let i = 0; i < atteso.length; i += 1) diff |= header.charCodeAt(i) ^ atteso.charCodeAt(i)
  return diff === 0
}

module.exports = { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, eAggiornamento, documentoIstanza, documentoAggiornamento, bearerValido, STATI }
