// ── L'ELIMINAZIONE DI UN LOCALE, LOGICA PURA (REQ-FLOTTA-014) ──────────
//
// Decisioni dell'utente del 29/10/2026. Si elimina solo un locale già
// CHIUSO, e solo dall'admin, che scrive il nome dell'app (il progetto
// Firebase, `drinkpos-<slug>`) per confermare. Si sceglie fra «subito» e
// «fra 30 giorni dalla chiusura». In tutti e due i casi il workflow
// elimina-istanza.yml fa PRIMA il backup completo (database, file, utenti)
// e lo verifica; se il backup non è verificato il progetto non si tocca.
// L'archivio resta 180 giorni, poi si cancella da solo (regola del
// bucket), e lo scarica soltanto il titolare del locale: per quei dati il
// locale è titolare del trattamento e noi responsabili (GDPR art. 28).
// Qui le regole; index.js le applica, il workflow fa il lavoro.

const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const GIORNI_ATTESA = 30
const GIORNI_ARCHIVIO = 180
// La demo si mostra nella prima pagina: non si elimina da qui.
const PROTETTI = [require('./esistente.js').PROGETTO_DEMO]
// run_id e inviato_il dell'esito si leggono come per l'attivazione.
const { runIdValido, istanteValido } = require('./provisioning.js')
const GIORNO = 24 * 60 * 60 * 1000

// Si può chiedere l'eliminazione di quest'istanza? { ok, perche }
function puoEliminare(ist) {
  // Un locale simulato (REQ-FLOTTA-072) non ha un progetto, e si elimina lo stesso.
  if (!ist?.progetto && ist?.simulata !== true) return { ok: false, perche: 'L’istanza non ha un progetto.' }
  if (ist.origine === 'esistente') return { ok: false, perche: 'Un locale esistente si gestisce dal suo progetto, non dalla flotta.' }
  if (ist.interna) return { ok: false, perche: 'Un’installazione interna non si elimina dal backoffice.' }
  if (PROTETTI.includes(ist.progetto)) return { ok: false, perche: 'La demo non si elimina.' }
  if (ist.stato === 'eliminata') return { ok: false, perche: 'Il locale è già eliminato.' }
  if (['in coda', 'in corso'].includes(ist.eliminazione?.stato)) return { ok: false, perche: 'L’eliminazione è già partita.' }
  if (ist.licenza_stato !== 'chiusa') return { ok: false, perche: 'Prima si chiude il locale.' }
  return { ok: true, perche: null }
}

// La conferma è il nome dell'app, scritto per intero: niente maiuscole
// tollerate né pezzi, perché è l'ultimo freno prima di un gesto che non si
// annulla.
function confermaValida(ist, conferma) {
  // Un locale simulato (REQ-FLOTTA-072) non ha un progetto: si conferma
  // con lo slug.
  const atteso = ist?.simulata === true ? ist.slug : ist?.progetto
  return Boolean(atteso) && String(conferma ?? '').trim() === atteso
}

// L'eliminazione di un locale simulato (REQ-FLOTTA-072): niente workflow,
// niente archivio, perché non c'è un progetto né dati da salvare.
function eliminazioneSimulata(ist, adesso = new Date()) {
  const il = adesso.toISOString()
  return { stato: 'eliminata', eliminata_il: il, eliminazione: { ...(ist?.eliminazione || {}), stato: 'eliminata', errore: null, archivio: null, finito_il: il, simulata: true } }
}

// Quando parte: subito, o 30 giorni dopo la chiusura (mai nel passato).
function quandoEliminare(ist, { subito = false, adesso = new Date() } = {}) {
  if (subito) return adesso
  const chiusa = Date.parse(ist?.licenza_dal || '') || adesso.getTime()
  return new Date(Math.max(adesso.getTime(), chiusa + GIORNI_ATTESA * GIORNO))
}

// Il segno sull'istanza quando l'admin chiede l'eliminazione.
function eliminazioneChiesta(ist, { subito = false, da = null, adesso = new Date() } = {}) {
  return {
    stato: subito ? 'in coda' : 'programmata',
    quando: quandoEliminare(ist, { subito, adesso }).toISOString(),
    subito: Boolean(subito),
    richiedente: 'admin',
    chiesta_il: adesso.toISOString(),
    chiesta_da: da,
    errore: null,
  }
}

// IL TITOLARE (l'utente, 29/10/2026: «il proprietario del locale può fare
// solo la richiesta di cancellazione che si cancella entro trenta giorni…
// e può scegliere anche di cancellare la disattivazione se cambia idea»).
// Dalla sua dashboard chiude il locale e programma la cancellazione a 30
// giorni da adesso; mai subito, quella è dell'admin. Può chiederla da un
// locale attivo o sospeso, non da uno già chiuso dall'admin.
function puoChiedereTitolare(ist) {
  const base = puoEliminare({ ...ist, licenza_stato: 'chiusa' })
  if (!base.ok) return base
  if (ist.stato !== 'attiva') return { ok: false, perche: 'Il locale non è ancora attivo.' }
  if (!['attiva', 'sospesa', undefined, null].includes(ist.licenza_stato)) return { ok: false, perche: 'Il locale è già chiuso: per riaprirlo scrivici.' }
  return { ok: true, perche: null }
}

// La richiesta del titolare: il locale si chiude adesso, la cancellazione
// parte fra 30 giorni. Si ricorda com'era la licenza, per l'annullamento.
function richiestaTitolare(ist, { da = null, adesso = new Date() } = {}) {
  return {
    ...eliminazioneChiesta({ licenza_dal: adesso.toISOString() }, { subito: false, da, adesso }),
    richiedente: 'titolare',
    licenza_prima: ist?.licenza_stato || 'attiva',
  }
}

// Si può annullare? Solo una cancellazione programmata (non ancora
// partita); il titolare solo la sua, l'admin qualunque.
function puoAnnullare(ist, chi) {
  const e = ist?.eliminazione
  if (e?.stato !== 'programmata') return { ok: false, perche: 'Non c’è una cancellazione da annullare.' }
  if (chi !== 'admin' && e.richiedente !== 'titolare') return { ok: false, perche: 'La chiusura l’abbiamo decisa noi: per riaprire il locale scrivici.' }
  return { ok: true, perche: null }
}

// Le eliminazioni programmate arrivate alla data: si lanciano oggi.
function daEliminareOggi(istanze, adesso = new Date()) {
  return Object.entries(istanze || {})
    .filter(([, ist]) => ist?.eliminazione?.stato === 'programmata' && Date.parse(ist.eliminazione.quando) <= adesso.getTime())
    .filter(([, ist]) => puoEliminare({ ...ist, eliminazione: null }).ok)
    .map(([slug]) => slug)
}

// Un percorso nel bucket degli archivi: solo caratteri semplici, niente
// `..`, niente barra iniziale, e dentro la cartella di quel locale
// (`istanze/<slug>/…`, com'è scritto nel workflow). Il bucket NON arriva
// dal corpo (audit del 09/11/2026, finding 12): è della regia, lo dice la
// sua configurazione (ARCHIVIO_BUCKET), e scaricaArchivio lo prende da lì.
// Prima, chi aveva il segreto del callback faceva scaricare al titolare uno
// zip da un bucket a sua scelta.
const PERCORSO = /^[A-Za-z0-9._/-]{1,200}$/
function percorsoValido(p, slug) {
  const s = String(p ?? '')
  if (!PERCORSO.test(s) || s.startsWith('/') || s.split('/').includes('..')) return null
  return s.startsWith(`istanze/${slug}/`) ? s : null
}

// L'esito che elimina-istanza.yml manda:
// { slug, operazione: 'eliminazione', stato: eliminata|errore, archivio?, errore?, run_id, inviato_il }.
// run_id e inviato_il si leggono come in provisioning.js e li controlla
// vincoliEsito (stesso anti-replay dell'attivazione).
function esitoEliminazione(body) {
  if (!body || typeof body !== 'object' || body.operazione !== 'eliminazione') return null
  if (!SLUG.test(body.slug || '')) return null
  if (!['eliminata', 'errore'].includes(body.stato)) return null
  const a = body.archivio || {}
  const percorso = percorsoValido(a.percorso, body.slug)
  const zip = percorsoValido(a.zip, body.slug)
  // Lo zip sta dentro il percorso dell'archivio: così li scrive il workflow.
  const archivio =
    percorso && zip && zip.startsWith(`${percorso}/`)
      ? { percorso, zip, byte: Number(a.byte) || null, conteggi: a.conteggi && typeof a.conteggi === 'object' ? a.conteggi : null }
      : null
  // Eliminata senza un archivio non si accetta: vorrebbe dire che il
  // progetto è sparito senza backup, e quello non deve succedere mai.
  if (body.stato === 'eliminata' && !archivio) return null
  return {
    slug: body.slug,
    stato: body.stato,
    archivio,
    errore: body.stato === 'errore' ? String(body.errore || 'Eliminazione fallita') : null,
    run_id: runIdValido(body.run_id),
    inviato_il: istanteValido(body.inviato_il),
  }
}

// Cosa scrivere sull'istanza quando arriva l'esito. Se fallisce, il locale
// resta com'era (chiuso, coi suoi dati): si segna solo l'errore.
function documentoEliminazione(esito, prima, adesso = new Date()) {
  const base = { ...(prima?.eliminazione || {}), finito_il: adesso.toISOString() }
  if (esito.stato === 'errore') return { eliminazione: { ...base, stato: 'fallita', errore: esito.errore } }
  return {
    stato: 'eliminata',
    eliminata_il: adesso.toISOString(),
    eliminazione: {
      ...base,
      stato: 'eliminata',
      errore: null,
      archivio: esito.archivio,
      scade_il: new Date(adesso.getTime() + GIORNI_ARCHIVIO * GIORNO).toISOString(),
    },
  }
}

// Il corpo del lancio di elimina-istanza.yml: `ref` è il ramo della regia
// coi workflow, `ambiente` quale environment (flotta o flotta-test).
function dispatchEliminazione(slug, { ref = 'main', ambiente = 'produzione' } = {}) {
  if (!SLUG.test(slug || '')) throw new Error('Slug non valido')
  return { ref, inputs: { slug, ambiente: ['produzione', 'test'].includes(ambiente) ? ambiente : 'produzione' } }
}

// Il titolare può ancora scaricare il suo archivio?
function archivioScaricabile(ist, adesso = new Date()) {
  const e = ist?.eliminazione
  return Boolean(e?.stato === 'eliminata' && e.archivio?.zip && Date.parse(e.scade_il) > adesso.getTime())
}

module.exports = {
  puoEliminare,
  confermaValida,
  eliminazioneSimulata,
  quandoEliminare,
  eliminazioneChiesta,
  puoChiedereTitolare,
  richiestaTitolare,
  puoAnnullare,
  daEliminareOggi,
  esitoEliminazione,
  documentoEliminazione,
  dispatchEliminazione,
  archivioScaricabile,
  GIORNI_ATTESA,
  GIORNI_ARCHIVIO,
  PROTETTI,
}
