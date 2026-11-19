// IL PACCHETTO PER VERSIONE (REQ-FLOTTA-137, interfaccia 16 di
// docs/contratto-regia-app.md). tana-drink compila una volta al rilascio e
// pubblica l'archivio nella Release di GitHub del suo tag; provisiona-istanza
// e aggiorna-istanza (REQ-FLOTTA-140) lo pubblicano nei locali senza
// ricompilare. Qui si controlla un pacchetto già aperto PRIMA di toccare un
// locale: un formato che la regia non conosce, un file che manca o
// un'impronta che non torna fermano tutto. Logica pura sui dati; chi legge i
// file da disco (scripts/pacchetto-su-disco.mjs) passa il calcolo delle
// impronte.

export const FORMATI = [1]
export const TIPI = ['locali', 'demo']
export const PROFILI = ['completo', 'leggero']

// Ciò che il deploy usa: senza uno di questi il lavoro non saprebbe cosa
// pubblicare. `personalizza.mjs` serve solo ai pacchetti dei locali: la
// demo è decisa dalla build e non si personalizza.
export const FILE_NECESSARI = {
  locali: ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'storage.rules', 'dist/index.html', 'functions/package.json', 'functions/package-lock.json', 'personalizza.mjs'],
  demo: ['firebase.json', 'firestore.rules', 'firestore.indexes.json', 'dist/index.html'],
}

// I tag di prova di tana-drink sono `vX.Y.Z-beta` (docs/gitflow.md di
// tana-drink); si accetta anche `-beta.N`, come quelli della regia.
const VERSIONE = /^\d+\.\d+\.\d+(?:-beta(?:\.\d+)?)?$/
const COMMIT = /^[0-9a-f]{40}$/
const IMPRONTA = /^[0-9a-f]{64}$/
// Un percorso dentro il pacchetto: relativo, senza risalire né assoluto.
const PERCORSO_SICURO = (p) => typeof p === 'string' && p.length > 0 && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.split('/').includes('..') && !p.includes('\\')

// Il nome del file allegato alla Release, uguale per chi pubblica e chi
// scarica (tana-drink, 19/11/2026: «nella Release il nome è quello
// semplice»). Fino al 18/11 c'era davanti il percorso del bucket.
export const nomeArchivio = (tipo, versione) => `pacchetto-${tipo}-v${versione}.tgz`

// Dove sta: la Release del tag di tana-drink. Il repository è pubblico; quando
// diventerà privato servirà un accesso in sola lettura (REQ-FLOTTA-140).
export const REPOSITORY_APP = 'redirect11/tana-drink'
export const indirizzoNellaRelease = (nome, versione, repository = REPOSITORY_APP) => `https://github.com/${repository}/releases/download/v${versione}/${nome}`

// Controlla pacchetto.json. Restituisce l'elenco dei problemi: vuoto vuol
// dire che la forma va bene (le impronte si controllano dopo, sui file).
export function problemiDelManifesto(m, { versioneAttesa, tipoAtteso } = {}) {
  const p = []
  if (!m || typeof m !== 'object') return ['pacchetto.json non è un oggetto']
  if (!FORMATI.includes(m.formato)) p.push(`formato ${JSON.stringify(m.formato)} non conosciuto dalla regia (conosce ${FORMATI.join(', ')})`)
  if (!TIPI.includes(m.tipo)) p.push(`tipo ${JSON.stringify(m.tipo)} non valido`)
  else if (tipoAtteso && m.tipo !== tipoAtteso) p.push(`tipo «${m.tipo}», atteso «${tipoAtteso}»`)
  if (!VERSIONE.test(m.versione || '')) p.push(`versione ${JSON.stringify(m.versione)} non valida`)
  else if (versioneAttesa && m.versione !== versioneAttesa) p.push(`versione ${m.versione}, attesa ${versioneAttesa}`)
  if (m.tag !== `v${m.versione}`) p.push(`tag ${JSON.stringify(m.tag)} diverso da v${m.versione}`)
  // Se è una beta lo dice il pacchetto, e deve tornare con la versione: il
  // nome dell'archivio non decide niente (tana-drink, 18/11/2026).
  if (typeof m.beta !== 'boolean') p.push('beta deve essere true o false')
  else if (m.beta !== /-beta/.test(m.versione || '')) p.push(`beta: ${m.beta}, ma la versione è ${m.versione}`)
  if (!COMMIT.test(m.commit || '')) p.push('commit mancante o non valido (40 caratteri esadecimali)')
  if (!m.strumenti || typeof m.strumenti.node !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.strumenti['firebase-tools'] || '')) p.push('strumenti: servono node e la versione fissata di firebase-tools')
  if (!Array.isArray(m.personalizzabili) || m.personalizzabili.some((f) => !PERCORSO_SICURO(f))) p.push('personalizzabili deve essere un elenco di percorsi del pacchetto')
  if (Number.isNaN(Date.parse(m.creato_il))) p.push('creato_il non è una data')
  if (!Array.isArray(m.profili) || m.profili.length === 0 || m.profili.some((x) => !PROFILI.includes(x))) p.push('profili non validi')
  // Le chiavi del venue che personalizza.mjs di quel tag accetta (CAMPI_VENUE
  // dell'app): fanno parte del formato 1, sempre presenti e mai vuote
  // (tana-drink, 18/11/2026). Il lavoro ci confronta il suo venue prima di
  // toccare il locale.
  if ((!Array.isArray(m.campiVenue) || m.campiVenue.length === 0 || m.campiVenue.some((k) => typeof k !== 'string' || !/^venue_[a-z_]+$/.test(k)))) p.push('campiVenue deve essere un elenco di chiavi venue_*')
  if (!m.file || typeof m.file !== 'object' || Array.isArray(m.file)) return [...p, 'manca l’elenco dei file con le impronte']
  for (const [percorso, impronta] of Object.entries(m.file)) {
    if (!PERCORSO_SICURO(percorso)) p.push(`percorso non ammesso: ${percorso}`)
    if (!IMPRONTA.test(impronta)) p.push(`impronta non valida per ${percorso}`)
  }
  for (const f of FILE_NECESSARI[m.tipo] || []) if (!(f in m.file)) p.push(`manca ${f}`)
  for (const f of Array.isArray(m.personalizzabili) ? m.personalizzabili : []) if (!(f in m.file) && f !== 'dist/configurazione.json') p.push(`personalizzabile non nel pacchetto: ${f}`)
  return p
}

// Confronta le impronte dichiarate con quelle dei file su disco
// (`improntaDi(percorso)` restituisce lo SHA-256 esadecimale, o null se il
// file non c'è). Un file in più non dichiarato è un problema anche lui:
// nel pacchetto entra solo ciò che pacchetto.json elenca.
//
// PRIMA della personalizzazione si controlla tutto. DOPO (`dopo: true`) si
// saltano i file che personalizza.mjs riscrive o aggiunge (`personalizzabili`
// e configurazione.json): il resto deve essere ancora quello caricato.
export function problemiDeiFile(m, improntaDi, fileSuDisco = [], { dopo = false } = {}) {
  const p = []
  const saltati = new Set(dopo ? [...(m.personalizzabili || []), 'dist/configurazione.json'] : [])
  for (const [percorso, attesa] of Object.entries(m.file || {})) {
    if (saltati.has(percorso)) continue
    const vera = improntaDi(percorso)
    if (vera == null) p.push(`manca ${percorso}`)
    else if (vera !== attesa) p.push(`impronta diversa per ${percorso}`)
  }
  const dichiarati = new Set([...Object.keys(m.file || {}), 'pacchetto.json', ...saltati])
  for (const f of fileSuDisco) if (!dichiarati.has(f)) p.push(`file non dichiarato: ${f}`)
  return p
}

// La versione si può dare a un locale di questa regia? La produzione
// riceve solo i rilasci; il test anche le beta.
// Quando c'è il manifesto decide lui (`beta`); la versione da sola basta per
// scartare prima di scaricare.
export function versioneAmmessa(versione, ambiente, manifesto = null) {
  if (!VERSIONE.test(versione || '')) return false
  const beta = manifesto ? manifesto.beta === true : /-beta/.test(versione)
  return ambiente === 'test' || !beta
}

// L'impronta dell'archivio sta in un file a parte, allegato DOPO l'archivio
// (tana-drink, 18/11/2026): se c'è, il pacchetto è completo.
export const nomeImpronta = (tipo, versione) => `${nomeArchivio(tipo, versione)}.sha256`

// La versione di un tag di tana-drink («v1.10.56-beta» → «1.10.56-beta»), o
// null se il ref non è un tag di versione: allora un pacchetto non c'è.
export const versioneDelTag = (ref) => (typeof ref === 'string' && ref.startsWith('v') && VERSIONE.test(ref.slice(1)) ? ref.slice(1) : null)

// L'impronta dell'archivio dal file .sha256 (`sha256sum`: «<64 hex>  nome»).
export function improntaDalFile(testo) {
  const m = /^([0-9a-f]{64})(?:\s|$)/.exec(String(testo || '').trim())
  return m ? m[1] : null
}

// L'archivio scaricato si può usare? (C) della REQ-FLOTTA-140: la regia
// ricorda l'impronta del primo pacchetto usato per una versione e la passa al
// workflow; un archivio diverso per la stessa versione si rifiuta, anche se
// il suo .sha256 torna (una Release non immutabile si può riscrivere). Una
// versione corretta è una versione nuova.
export function problemiDellArchivio({ dichiarata, vera, ricordata = '' }) {
  if (!dichiarata) return ['il file .sha256 non contiene un’impronta']
  if (dichiarata !== vera) return [`l'archivio non ha l'impronta dichiarata (${dichiarata.slice(0, 12)}…, scaricato ${String(vera).slice(0, 12)}…)`]
  if (ricordata && ricordata !== vera) return [`per questa versione la regia ha già usato un altro archivio (${ricordata.slice(0, 12)}…): una versione corretta è una versione nuova`]
  return []
}

// LA STRADA DI UN LANCIO (REQ-FLOTTA-140, (A)): «pacchetto» se la Release
// del tag lo ha, «compilazione» (quella di prima, interfaccia 12) negli
// altri casi. Chi lancia può chiedere `compilazione` (una correzione urgente,
// una versione di prima del pacchetto) o `pacchetto` (allora, se manca, ci si
// ferma invece di compilare: serve alle prove). La demo e i locali esistenti
// con la loro cartella in tana-drink (la Tana) restano sulla compilazione:
// il pacchetto dei locali non li sa fare.
export const RICHIESTE_STRADA = ['auto', 'pacchetto', 'compilazione']
export function stradaDi({ richiesta = 'auto', versione = null, cèPacchetto = false, demo = false, esistente = false }) {
  if (!RICHIESTE_STRADA.includes(richiesta)) return { strada: null, perche: `strada «${richiesta}» non prevista (${RICHIESTE_STRADA.join(', ')})` }
  if (richiesta === 'compilazione') return { strada: 'compilazione', perche: 'chiesta da chi ha lanciato' }
  const no = demo ? 'la demo si compila ancora'
    : esistente ? 'un locale esistente ha la sua cartella in tana-drink'
      : !versione ? 'il ref non è un tag di versione'
        : !cèPacchetto ? `la Release v${versione} non ha il pacchetto dei locali`
          : null
  if (!no) return { strada: 'pacchetto', perche: `il pacchetto della Release v${versione}` }
  if (richiesta === 'pacchetto') return { strada: null, perche: `chiesto il pacchetto, ma ${no}` }
  return { strada: 'compilazione', perche: no }
}

// I COMANDI DI firebase.json. `predeploy` e `postdeploy` li esegue
// firebase-tools al deploy, cioè nel job con le credenziali: sarebbe codice di
// tana-drink dove il pacchetto non deve far girare niente (il motivo dei job
// separati, REQ-FLOTTA-047). Il firebase.json di oggi non ne ha; uno che li
// avesse si rifiuta.
export function comandiInFirebaseJson(x, dove = 'firebase.json') {
  if (Array.isArray(x)) return x.flatMap((y, i) => comandiInFirebaseJson(y, `${dove}[${i}]`))
  if (!x || typeof x !== 'object') return []
  return Object.entries(x).flatMap(([k, y]) => (/^(pre|post)deploy$/.test(k) ? [`${dove}.${k}`] : comandiInFirebaseJson(y, `${dove}.${k}`)))
}
