// IL LAVORO DELLA FLOTTA SU GOOGLE (REQ-FLOTTA-138): la logica pura di
// scripts/flotta-lavoro.mjs, che fa quello che oggi fanno i workflow
// provisiona, aggiorna ed elimina, ma dentro un Cloud Run Job della regia e
// con l'app già compilata nel pacchetto (REQ-FLOTTA-137). Qui niente rete né
// disco: gli input, il blocco, la configurazione del locale, l'esito. Le
// regole sono le stesse dei workflow, scritte una volta qui perché si
// possano provare.

export const COMANDI = ['attiva', 'aggiorna', 'elimina']
export const AMBIENTI = ['produzione', 'test']
export const PROFILI = ['completo', 'leggero']

// Gli stessi controlli di «Input validi» nei workflow (audit del 22/10/2026,
// C1): gli input arrivano da fuori e non entrano mai in un comando prima di
// essere passati da qui.
const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
const PIANO = /^(free|base|completo)$/
const MODULI = /^[a-z_,]*$/
const UID = /^[A-Za-z0-9]*$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const VERSIONE = /^\d+\.\d+\.\d+(?:-beta(?:\.\d+)?)?$/
const CONTROLLO = /[\u0000-\u001f\u007f]/

// Il segno dell'esecuzione per la regia: la callback vuole un intero
// positivo (runIdValido in functions/lib/provisioning.js), e ogni coppia
// run_id+operazione passa una volta sola. Lo dà chi lancia il lavoro; senza,
// l'istante in millisecondi, che non si ripete.
export function runIdDi(valore, adesso = Date.now()) {
  if (valore == null || valore === '') return adesso
  const n = Number(valore)
  return Number.isSafeInteger(n) && n > 0 && String(n) === String(valore) ? n : null
}

// Gli input del lavoro, dalle variabili d'ambiente dell'esecuzione (chi la
// lancia le cambia per ogni esecuzione). Restituisce { input, problemi }.
export function inputDelLavoro(env = {}, adesso = Date.now()) {
  const p = []
  const v = (k) => (env[k] == null ? '' : String(env[k]))
  const comando = v('COMANDO')
  const slug = v('SLUG')
  const ambiente = v('AMBIENTE')
  const profilo = v('PROFILO') || 'completo'
  const nome = v('NOME') || slug
  const piano = v('PIANO') || 'base'
  const moduli = v('MODULI')
  const uid = v('UID_TITOLARE')
  const email = v('EMAIL_TITOLARE')
  const versione = v('VERSIONE')
  const runId = runIdDi(env.RUN_ID, adesso)
  const dati = datiLocaleDa(env.DATI_LOCALE)
  if (!COMANDI.includes(comando)) p.push(`comando «${comando}» non valido (${COMANDI.join(', ')})`)
  if (!SLUG.test(slug)) p.push('slug non valido')
  if (!AMBIENTI.includes(ambiente)) p.push('ambiente non valido')
  if (!PROFILI.includes(profilo)) p.push('profilo non valido')
  if (runId == null) p.push('RUN_ID non valido (un intero positivo)')
  // La demo si mostra nella prima pagina e ha regole sue: resta sui
  // workflow finché il pacchetto `demo` non c'è (REQ-FLOTTA-139).
  if (slug === 'demo') p.push('la demo non passa dal lavoro della flotta')
  if (comando !== 'elimina') {
    if (!PIANO.test(piano)) p.push('piano non valido')
    if (!MODULI.test(moduli)) p.push('moduli non validi')
    if (!UID.test(uid)) p.push('uid non valido')
    if (email && !EMAIL.test(email)) p.push('email del titolare non valida')
    if (!nome || nome.length > 80 || CONTROLLO.test(nome)) p.push('nome del locale non valido')
    p.push(...dati.problemi)
    // Il lavoro pubblica solo un pacchetto: la versione è obbligatoria, e
    // in produzione mai una beta (lo ricontrolla versioneAmmessa sul
    // manifesto, che decide lui).
    if (!VERSIONE.test(versione)) p.push('versione non valida (X.Y.Z o X.Y.Z-beta)')
    else if (ambiente === 'produzione' && /-beta/.test(versione)) p.push('in produzione un locale riceve solo rilasci, non una beta')
  }
  const input = { comando, slug, ambiente, profilo, nome, piano, moduli, uid, email, versione, runId, datiLocale: dati.valori, progetto: `drinkpos-${slug}` }
  return { input, problemi: p }
}

// I DATI DEL TITOLARE PER L'INFORMATIVA (interfaccia 16). personalizza.mjs
// di tana-drink li scrive nelle pagine della privacy e dei cookie del
// locale; quelli che mancano si leggono «[… — da inserire]». Li passa chi
// lancia il lavoro, in DATI_LOCALE (JSON), dagli stessi campi che la regia
// scrive in settings/bar (datiDelLocale in functions/lib/passaggio.js), più
// l'email. Stanno nelle variabili dell'esecuzione: vanno su una pagina
// pubblica, e nient'altro del titolare passa da lì. Solo chiavi note, solo
// testi corti su una riga: un campo sconosciuto personalizza.mjs lo
// rifiuterebbe a metà lavoro, dopo il Terraform.
export const CAMPI_DATI_LOCALE = [
  'venue_legal_name',
  'venue_address',
  'venue_postal_city',
  'venue_city',
  'venue_phone',
  'venue_vat_number',
  'venue_tax_code',
  'venue_legal_address',
  'venue_email',
]
export function datiLocaleDa(testo) {
  if (testo == null || testo === '') return { valori: {}, problemi: [] }
  let v
  try { v = JSON.parse(String(testo)) } catch { return { valori: {}, problemi: ['DATI_LOCALE non è JSON'] } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { valori: {}, problemi: ['DATI_LOCALE deve essere un oggetto'] }
  const valori = {}
  const problemi = []
  for (const [k, x] of Object.entries(v)) {
    if (!CAMPI_DATI_LOCALE.includes(k)) problemi.push(`DATI_LOCALE: campo sconosciuto ${k}`)
    else if (typeof x !== 'string' || x.length > 200 || CONTROLLO.test(x)) problemi.push(`DATI_LOCALE: ${k} deve essere un testo su una riga`)
    else if (k === 'venue_email' && x.trim() && !EMAIL.test(x.trim())) problemi.push('DATI_LOCALE: venue_email non valida')
    else if (x.trim()) valori[k] = x.trim()
  }
  return { valori: problemi.length ? {} : valori, problemi }
}

// Le impostazioni della regia per il lavoro: stanno nell'esecuzione come
// variabili d'ambiente fissate sul lavoro (non per esecuzione), il segreto
// della callback da Secret Manager. Sono quelle dell'environment GitHub.
export const IMPOSTAZIONI = ['TFSTATE_BUCKET', 'RILASCI_BUCKET', 'REGIA_URL', 'REGIA_CALLBACK_URL', 'REGIA_SA_EMAIL', 'BILLING_ACCOUNT_ID', 'ARCHIVIO_BUCKET', 'PROVISIONING_CALLBACK_SECRET']
export function impostazioniMancanti(env = {}) {
  return IMPOSTAZIONI.filter((k) => !env[k])
}

// La regia che il locale chiama: viene dall'ambiente, mai da un input
// libero (REQ-FLOTTA-075).
export const regiaDi = (ambiente) => (ambiente === 'test' ? 'drink-regia-test' : 'drink-regia')

// IL BLOCCO PER PROGETTO (CTO-agente, 17/11/2026): due esecuzioni sullo
// stesso locale non si sovrappongono. Un oggetto nel bucket dello stato,
// creato solo se non esiste (precondizione di Cloud Storage), tolto alla
// fine. Il lavoro dura al più un'ora: un blocco più vecchio del tempo
// massimo, con un margine, è di un'esecuzione morta e si può togliere.
export const TEMPO_MASSIMO_S = 3600
export const MARGINE_BLOCCO_S = 600
export const nomeBlocco = (slug) => `blocchi/drinkpos-${slug}.json`
export function bloccoMorto(creatoIl, adesso = Date.now()) {
  const t = Date.parse(creatoIl)
  if (Number.isNaN(t)) return true
  return adesso - t > (TEMPO_MASSIMO_S + MARGINE_BLOCCO_S) * 1000
}

// La configurazione web del progetto, da una delle due forme che il lavoro
// trova: l'output `config_web` del Terraform (VITE_FIREBASE_*) o la
// risposta di `firebase apps:sdkconfig` (apiKey, …).
export function firebaseDa(c = {}) {
  const s = c.result?.sdkConfig || c.result || c
  const f = {
    apiKey: s.apiKey ?? s.VITE_FIREBASE_API_KEY,
    authDomain: s.authDomain ?? s.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: s.projectId ?? s.VITE_FIREBASE_PROJECT_ID,
    storageBucket: s.storageBucket ?? s.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: s.messagingSenderId ?? s.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: s.appId ?? s.VITE_FIREBASE_APP_ID,
  }
  // Gli stessi che personalizza.mjs pretende al deploy: senza authDomain
  // l'accesso non parte, e meglio saperlo prima del deploy.
  for (const k of ['apiKey', 'authDomain', 'projectId', 'appId']) if (!f[k]) throw new Error(`configurazione web senza ${k}`)
  return f
}

// La configurazione che personalizza.mjs scrive nel sito del locale
// (interfaccia 16). Il venue è quello che oggi scrive genera-cliente.mjs di
// tana-drink: nome, nome corto, descrizione; il resto lo mette il locale da
// Impostazioni. I dati del titolare (datiLocale) servono all'informativa
// delle pagine pubbliche; in settings/bar la regia li scrive comunque, e lì
// vincono le impostazioni.
export const venueDelLocale = (nome, datiLocale = {}) => ({
  venue_name: nome,
  venue_short_name: nome.length > 12 ? nome.split(/\s+/)[0] : nome,
  venue_description: `Ordina da ${nome}`,
  ...datiLocale,
})

export function configurazioneLocale({ slug, nome, profilo, ambiente, firebase, datiLocale = {} }) {
  if (firebase.projectId !== `drinkpos-${slug}`) throw new Error(`la configurazione web è di ${firebase.projectId}, non di drinkpos-${slug}`)
  return {
    backend: 'firebase',
    locale: slug,
    firebase,
    venue: venueDelLocale(nome, datiLocale),
    profilo,
    regia: regiaDi(ambiente),
  }
}

// Le chiavi del venue che il pacchetto non accetterebbe, dal suo elenco
// (`campiVenue` in pacchetto.json). Si guarda subito dopo aver scaricato il
// pacchetto: personalizza.mjs le rifiuterebbe dopo il Terraform, a locale
// già toccato. L'elenco c'è sempre (lo pretende problemiDelManifesto);
// senza, qui non si guarda.
export function chiaviVenueFuori({ nome, datiLocale }, campiVenue) {
  if (!Array.isArray(campiVenue)) return []
  return Object.keys(venueDelLocale(nome, datiLocale)).filter((k) => !campiVenue.includes(k))
}

// Il .env che gli script della regia leggono (titolare-istanza.mjs prende
// la chiave API da lì), come lo scriveva la build.
export function envDaFirebase(f) {
  return [
    ['VITE_FIREBASE_API_KEY', f.apiKey],
    ['VITE_FIREBASE_AUTH_DOMAIN', f.authDomain || ''],
    ['VITE_FIREBASE_PROJECT_ID', f.projectId],
    ['VITE_FIREBASE_STORAGE_BUCKET', f.storageBucket || ''],
    ['VITE_FIREBASE_MESSAGING_SENDER_ID', f.messagingSenderId || ''],
    ['VITE_FIREBASE_APP_ID', f.appId],
  ].map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
}

// Il .env delle Functions del locale, come nei workflow. Il nome è passato
// già dal controllo degli input: niente a capo, niente caratteri di
// controllo.
export const envFunctions = ({ nome, ambiente }) => `VENUE_NAME=${nome}\nREGIA_PROGETTO=${regiaDi(ambiente)}\n`

// Cosa pubblica il deploy: il leggero (il Free) solo regole e sito.
export const soloDelDeploy = (profilo) => (profilo === 'leggero' ? 'firestore,hosting' : 'firestore,storage,functions,hosting')

// L'ARCHIVIO PRIMA DI APRIRLO. Dall'elenco di `tar -tvzf`: solo file e
// cartelle (niente collegamenti, che porterebbero fuori), e solo percorsi
// dentro il pacchetto. Una riga: «-rw-r--r-- u/g 123 2026-11-18 10:00 dist/index.html».
const PERCORSO_SICURO = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..') && !p.includes('\\')
export function problemiDellElenco(righe) {
  const p = []
  for (const riga of righe.filter((r) => r.trim())) {
    const tipo = riga[0]
    const percorso = riga.trim().split(/\s+/).slice(5).join(' ').replace(/^\.\//, '').replace(/\/$/, '')
    if (tipo !== '-' && tipo !== 'd') p.push(`voce non ammessa (tipo «${tipo}»): ${percorso}`)
    else if (percorso && !PERCORSO_SICURO(percorso)) p.push(`percorso non ammesso: ${percorso}`)
  }
  return p
}

// personalizza.mjs è codice di tana-drink e gira dove il lavoro ha le
// credenziali della flotta. Senza dipendenze npm non porta con sé il
// rischio di un pacchetto compromesso (il motivo per cui i workflow
// compilano senza chiave, REQ-FLOTTA-047): si ammettono solo i moduli di
// Node (`node:`) e i file del pacchetto (`./`, `../` dentro il pacchetto).
export function importNonAmmessi(sorgente) {
  const trovati = []
  const re = /(?:^|[^\w$.])(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?['"]([^'"]+)['"]|(?:^|[^\w$.])import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|(?:^|[^\w$.])require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
  for (const m of sorgente.matchAll(re)) {
    const s = m[1] || m[2] || m[3]
    if (!s.startsWith('node:') && !s.startsWith('./') && !s.startsWith('../')) trovati.push(s)
  }
  // Un import calcolato non si può controllare: non si ammette.
  if (/(?:^|[^\w$.])(?:import|require)\s*\(\s*[^'"`\s)]/.test(sorgente)) trovati.push('(import calcolato)')
  return trovati
}

// L'ESITO ALLA REGIA, con la stessa callback dei workflow (esitoProvisioning):
// lo stesso corpo, così la regia non distingue chi l'ha mandato. Mai una
// scrittura diretta nel database della regia (CTO-agente, 17/11/2026).
export function corpoEsito({ input, riuscito, url = null, versione = null, commit = null, errore = null, archivio = null, adesso = new Date() }) {
  const inviato_il = adesso.toISOString()
  if (input.comando === 'elimina') {
    return {
      slug: input.slug,
      operazione: 'eliminazione',
      stato: riuscito ? 'eliminata' : 'errore',
      archivio: riuscito ? archivio : null,
      errore: riuscito ? null : errore || 'Eliminazione non riuscita. Il progetto è stato eliminato solo se il backup era verificato.',
      run_id: input.runId,
      inviato_il,
    }
  }
  const operazione = input.comando === 'attiva' ? 'attivazione' : 'aggiornamento'
  return {
    slug: input.slug,
    stato: riuscito ? 'attiva' : 'errore',
    ...(input.comando === 'attiva' ? { url } : {}),
    progetto: input.progetto,
    versione: versione ? `v${versione}` : null,
    errore: riuscito ? null : errore || `${operazione[0].toUpperCase()}${operazione.slice(1)} non riuscita: lavoro della flotta, esecuzione ${input.runId}`,
    // Lo stesso valore dei workflow: è la regia che riceve, non il locale.
    ambiente: 'produzione',
    operazione,
    profilo: input.profilo,
    ref: versione ? `v${versione}` : null,
    commit,
    run_id: input.runId,
    inviato_il,
  }
}

// I tentativi della callback (REQ-FLOTTA-119): un 429 (la regia piena) o
// una rete caduta si ritentano, fino a 5 volte in quasi 4 minuti.
export const ATTESE_ESITO_MS = [15000, 30000, 60000, 120000]
export async function mandaEsito({ url, segreto, corpo, fetch: f = fetch, attendi = (ms) => new Promise((ok) => setTimeout(ok, ms)), log = console.log }) {
  for (let n = 0; ; n++) {
    let stato = null
    try {
      const r = await f(url, { method: 'POST', headers: { Authorization: `Bearer ${segreto}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      stato = r.status
      if (stato !== 429) return stato
    } catch (e) {
      if (n >= ATTESE_ESITO_MS.length) throw e
    }
    if (n >= ATTESE_ESITO_MS.length) return stato
    log(`regia: tentativo ${n + 1} non arrivato, riprovo`)
    await attendi(ATTESE_ESITO_MS[n])
  }
}

// I passi di ogni comando, nell'ordine dei workflow: li stampa il lavoro e
// li controllano i test, così un passo tolto si vede.
export function passi({ comando, profilo }) {
  const completo = profilo === 'completo'
  if (comando === 'elimina') return ['blocco', 'progetto-della-regia', 'backup-leggibile', 'export-nativo', 'archivio', 'verifica-backup', 'elimina-progetto', 'stato-terraform', 'esito']
  // Il pacchetto si scarica e si controlla PRIMA di toccare il locale:
  // uno non valido ferma tutto senza aver cambiato niente (criterio 4).
  const dopo = ['configurazione-web', 'personalizza', 'env-functions']
  const app = [
    ...(completo ? ['storage', 'segreti'] : []),
    ...(comando === 'aggiorna' && completo ? ['account-ai-locale'] : []),
    'deploy',
    'titolare',
  ]
  if (comando === 'attiva') return ['blocco', 'progetto-della-regia', 'pacchetto', 'terraform', ...dopo, 'licenza', ...app, 'esito']
  return ['blocco', 'progetto-della-regia', 'pacchetto', ...(completo ? ['terraform-completo'] : []), ...dopo, ...app, 'esito']
}
