// IL PACCHETTO PER VERSIONE (REQ-FLOTTA-137, interfaccia 16 di
// docs/contratto-regia-app.md). tana-drink compila una volta al rilascio e
// carica un archivio nel bucket della regia; il lavoro della flotta su
// Google (REQ-FLOTTA-138) lo pubblica nei locali senza ricompilare. Qui si
// controlla un pacchetto già aperto PRIMA di toccare un locale: un formato
// che la regia non conosce, un file che manca o un'impronta che non torna
// fermano tutto. Logica pura sui dati; chi legge i file da disco passa
// all'ultima funzione il calcolo delle impronte.

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

// Il nome dell'archivio nel bucket, uguale per chi carica e chi legge.
export const nomeArchivio = (tipo, versione) => `pacchetti/v${versione}/pacchetto-${tipo}-v${versione}.tgz`

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

// L'impronta dell'archivio sta in un oggetto a parte, caricato DOPO
// l'archivio (tana-drink, 18/11/2026): se c'è, il pacchetto è completo.
export const nomeImpronta = (tipo, versione) => `${nomeArchivio(tipo, versione)}.sha256`
