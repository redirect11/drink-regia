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

const VERSIONE = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/
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
  if (!COMMIT.test(m.commit || '')) p.push('commit mancante o non valido (40 caratteri esadecimali)')
  if (Number.isNaN(Date.parse(m.creato_il))) p.push('creato_il non è una data')
  if (!Array.isArray(m.profili) || m.profili.length === 0 || m.profili.some((x) => !PROFILI.includes(x))) p.push('profili non validi')
  if (!m.file || typeof m.file !== 'object' || Array.isArray(m.file)) return [...p, 'manca l’elenco dei file con le impronte']
  for (const [percorso, impronta] of Object.entries(m.file)) {
    if (!PERCORSO_SICURO(percorso)) p.push(`percorso non ammesso: ${percorso}`)
    if (!IMPRONTA.test(impronta)) p.push(`impronta non valida per ${percorso}`)
  }
  for (const f of FILE_NECESSARI[m.tipo] || []) if (!(f in m.file)) p.push(`manca ${f}`)
  return p
}

// Confronta le impronte dichiarate con quelle dei file su disco
// (`improntaDi(percorso)` restituisce lo SHA-256 esadecimale, o null se il
// file non c'è). Un file in più non dichiarato è un problema anche lui:
// nel pacchetto entra solo ciò che pacchetto.json elenca.
export function problemiDeiFile(m, improntaDi, fileSuDisco = []) {
  const p = []
  for (const [percorso, attesa] of Object.entries(m.file || {})) {
    const vera = improntaDi(percorso)
    if (vera == null) p.push(`manca ${percorso}`)
    else if (vera !== attesa) p.push(`impronta diversa per ${percorso}`)
  }
  const dichiarati = new Set([...Object.keys(m.file || {}), 'pacchetto.json'])
  for (const f of fileSuDisco) if (!dichiarati.has(f)) p.push(`file non dichiarato: ${f}`)
  return p
}

// La versione si può dare a un locale di questa regia? La produzione
// riceve solo i rilasci; il test anche le beta.
export function versioneAmmessa(versione, ambiente) {
  if (!VERSIONE.test(versione || '')) return false
  return ambiente === 'test' || !versione.includes('-beta.')
}
