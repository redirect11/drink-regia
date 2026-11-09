// =====================================================================
//  DÀ (O TOGLIE) IL CLAIM `admin` A UN ACCOUNT DELLA REGIA.
//
//    node scripts/admin-regia.mjs --email daniele@esempio.it --project drink-regia-test
//    node scripts/admin-regia.mjs --email daniele@esempio.it --project drink-regia --togli
//
//  `--project` è obbligatorio (audit del 09/11/2026, finding 28): prima il
//  predefinito era la produzione, e un lancio distratto con l'email
//  sbagliata dava il claim admin su drink-regia. Come semina-test.mjs, il
//  progetto si scrive ogni volta.
//
//  Il backoffice si apre solo col claim admin (App.jsx, firestore.rules,
//  le callable in functions/index.js). Il claim non si dà da nessuna
//  schermata, apposta: lo dà chi ha le credenziali del progetto, da qui.
//  L'account deve esistere già: ci si registra dal sito come un cliente
//  qualsiasi, poi si lancia questo. Il claim entra al prossimo accesso
//  (o dopo un'ora, quando il token si rinnova): uscire e rientrare.
//
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS con la chiave di un
//  service account del progetto, oppure `gcloud auth application-default
//  login` con un account che è Owner di drink-regia.
// =====================================================================
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { initializeApp } = require('../functions/node_modules/firebase-admin/lib/app/index.js')
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js')

const argv = process.argv.slice(2)
const arg = (nome) => {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const EMAIL = arg('email')
const PROGETTO = arg('project')
const TOGLI = argv.includes('--togli')
if (!EMAIL || !PROGETTO || PROGETTO.startsWith('--')) {
  console.error('Uso: node scripts/admin-regia.mjs --email <email> --project <id del progetto> [--togli]')
  console.error('Il progetto si scrive sempre: nessun predefinito, la produzione non si tocca per sbaglio.')
  process.exit(1)
}

initializeApp({ projectId: PROGETTO })
const auth = getAuth()
const utente = await auth.getUserByEmail(EMAIL).catch(() => null)
if (!utente) {
  console.error(`[admin] nessun account con email ${EMAIL} su ${PROGETTO}: registrarsi prima dal sito.`)
  process.exit(1)
}
const claims = { ...(utente.customClaims || {}) }
if (TOGLI) delete claims.admin
else claims.admin = true
await auth.setCustomUserClaims(utente.uid, claims)
console.log(`[admin] ✓ ${EMAIL} su ${PROGETTO}: admin ${TOGLI ? 'tolto' : 'dato'}. Uscire e rientrare dal sito perché il token si rinnovi.`)
