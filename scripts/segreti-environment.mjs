// =====================================================================
//  I SEGRETI VITE_FIREBASE_* DI UN ENVIRONMENT GITHUB, DALLA SDKCONFIG.
//
//    npx firebase-tools apps:sdkconfig web --project drink-regia-test > <file>
//    node scripts/segreti-environment.mjs --file <file> --env test
//
//  Legge il file che `apps:sdkconfig` scrive (il blocco firebaseConfig) e
//  mette i quattro valori nell'environment GitHub con `gh secret set`,
//  uno per uno, senza che passino per la chat o per la riga di comando
//  in chiaro (docs/actions-come-tana-drink.md §4). Il file si cancella
//  dopo, a mano. `VITE_FIREBASE_PROJECT_ID` è anche la guardia del
//  deploy: deve coincidere col progetto di destinazione.
// =====================================================================
import { readFileSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { arg, flag } from './lib-firestore.js'

const FILE = arg('file')
const ENV = arg('env')
const REPO = arg('repo', 'redirect11/drink-regia')
if (!FILE || !ENV) {
  console.error('Uso: node scripts/segreti-environment.mjs --file <sdkconfig> --env <test|production> [--repo owner/repo] [--cancella]')
  process.exit(1)
}

// L'uscita di `apps:sdkconfig web` è JavaScript con dentro un oggetto
// letterale: si ritaglia il blocco fra le graffe e si legge come JSON
// dopo aver messo le virgolette alle chiavi.
const testo = readFileSync(FILE, 'utf8')
const blocco = testo.slice(testo.indexOf('{'), testo.lastIndexOf('}') + 1)
let config
try {
  config = JSON.parse(blocco.replace(/([a-zA-Z_]+)\s*:/g, '"$1":').replace(/,\s*}/g, '}'))
} catch {
  console.error('Il file non contiene una firebaseConfig leggibile.')
  process.exit(1)
}

const SEGRETI = {
  VITE_FIREBASE_API_KEY: config.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
  VITE_FIREBASE_PROJECT_ID: config.projectId,
  VITE_FIREBASE_APP_ID: config.appId,
}
for (const [nome, valore] of Object.entries(SEGRETI)) {
  if (!valore) {
    console.error(`✖ ${nome}: valore mancante nella sdkconfig`)
    process.exit(1)
  }
  // Il valore va sullo stdin di gh, non fra gli argomenti: così non finisce
  // nella cronologia della shell né nell'elenco dei processi.
  const esito = spawnSync('gh', ['secret', 'set', nome, '-R', REPO, '-e', ENV], { input: valore, stdio: ['pipe', 'inherit', 'inherit'] })
  if (esito.status !== 0) {
    console.error(`✖ ${nome}: gh secret set è uscito con ${esito.status}`)
    process.exit(1)
  }
  console.log(`[segreti] ✓ ${ENV}: ${nome}`)
}
console.log(`[segreti] ${ENV} punta a ${config.projectId}`)
if (flag('cancella')) {
  unlinkSync(FILE)
  console.log(`[segreti] file cancellato`)
}
