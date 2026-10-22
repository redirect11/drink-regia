// ── L'ATTIVAZIONE DI UN'ISTANZA, LOGICA PURA (REQ-FLOTTA-006) ──────────
//
// Dalla richiesta in `richieste/{slug}` al lancio del workflow GitHub
// `provisiona-istanza.yml`, e dall'esito che il workflow manda indietro ai
// documenti `istanze/{slug}` e `richieste/{slug}`. Niente Firebase qui:
// index.js collega, questo decide, e si prova senza emulatori.

const { sceltaPulita } = require('./abbonamento.js')

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
  const scelta = sceltaPulita(cliente)
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

// Il corpo della chiamata `POST /repos/{repo}/actions/workflows/{file}/dispatches`.
// Gli input sono stringhe: GitHub non accetta altro.
function dispatchPayload(richiesta, { ref = 'develop' } = {}) {
  if (!richiesta || !SLUG.test(richiesta.slug || '')) throw new Error('Richiesta senza uno slug valido')
  return {
    ref,
    inputs: {
      slug: richiesta.slug,
      nome_locale: String(richiesta.nome_locale || richiesta.slug),
      piano: String(richiesta.piano || 'base'),
      moduli: (richiesta.moduli || []).join(','),
      uid: String(richiesta.uid || ''),
      // La versione dell'app da pubblicare (REQ-FLOTTA-009): il workflow la
      // prende da qui, non dal ramo che contiene il file del workflow.
      ref,
    },
  }
}

// L'aggiornamento di un'istanza (REQ-FLOTTA-009): stesso meccanismo, altro
// workflow (aggiorna-istanza.yml), con la versione dell'app da pubblicare.
function dispatchAggiornamento(istanza, { ref = 'main' } = {}) {
  if (!istanza || !SLUG.test(istanza.slug || '')) throw new Error('Istanza senza uno slug valido')
  return { ref, inputs: { slug: istanza.slug, nome_locale: String(istanza.nome_locale || istanza.slug), ref } }
}

// Si lancia solo una richiesta «in coda»: una «in corso» è già partita,
// una «attiva» ha finito. La Function su update usa `rilanciata_il` per
// distinguere un rilancio dell'admin da un altro aggiornamento qualsiasi.
function daLanciare(prima, dopo) {
  if (!dopo || dopo.stato !== 'in coda') return false
  if (!prima) return true
  return prima.stato !== 'in coda' || (dopo.rilanciata_il && dopo.rilanciata_il !== prima.rilanciata_il)
}

// L'esito che il workflow manda: { slug, stato, url?, progetto?, versione?, errore? }.
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
    errore: body.stato === 'errore' ? String(body.errore || 'Attivazione fallita') : null,
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

module.exports = { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, documentoIstanza, bearerValido, STATI }
