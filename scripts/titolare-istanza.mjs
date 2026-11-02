// =====================================================================
//  IL TITOLARE, ADMIN DEL SUO LOCALE (REQ-FLOTTA-029).
//
//    node scripts/titolare-istanza.mjs --project drinkpos-bar-mario \
//         --email mario@example.it --env app/.env --sito https://drinkpos-bar-mario.web.app
//
//  Lo lanciano provisiona-istanza.yml e aggiorna-istanza.yml dopo il
//  deploy, con le credenziali del service account di provisioning. Nel
//  progetto del locale: l'account con l'email del cliente c'è (creato già
//  verificato, senza password), ha il ruolo `admin`, e finché non ha una
//  password riceve l'email di Firebase per impostarla, in italiano. Cosa
//  fare lo decide cosaFareColTitolare (functions/lib/titolare.js). Si può
//  rilanciare senza danni: un admin con la sua password non si tocca.
//
//  Senza account il passo fallisce, e si vede: un locale senza nessuno che
//  ci possa entrare non è attivo. L'email della password che non parte è
//  un avviso: il titolare la chiede lui con «password dimenticata».
// =====================================================================
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { arg } from './lib-firestore.js'

const require = createRequire(import.meta.url)
// firebase-admin sta nelle dipendenze delle Functions: si prende da lì.
const { initializeApp } = require('../functions/node_modules/firebase-admin/lib/app/index.js')
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js')
const { emailTitolare, cosaFareColTitolare } = require('../functions/lib/titolare.js')

const PROGETTO = arg('project')
const EMAIL = emailTitolare(arg('email'))
const ENV = arg('env', 'app/.env')
const SITO = arg('sito', `https://${PROGETTO}.web.app`)
if (!PROGETTO || !EMAIL) {
  console.error('Uso: node scripts/titolare-istanza.mjs --project <id> --email <email> [--env app/.env] [--sito https://…]')
  process.exit(1)
}

initializeApp({ projectId: PROGETTO })
const auth = getAuth()
let utente = null
try {
  utente = await auth.getUserByEmail(EMAIL)
} catch (e) {
  if (e?.code !== 'auth/user-not-found') throw e
}
const cosa = cosaFareColTitolare(utente)
if (cosa.crea) utente = await auth.createUser({ email: EMAIL, emailVerified: true })
if (cosa.ruolo) await auth.setCustomUserClaims(utente.uid, cosa.ruolo)
console.log(`[titolare] ✓ ${PROGETTO}: ${cosa.crea ? 'account creato' : 'account già presente'}, admin${cosa.ruolo ? ' (ruolo dato ora)' : ''}`)

if (cosa.link) {
  // L'email «imposta la password» la manda Firebase stesso, dal progetto
  // del locale: funziona anche senza il servizio email della regia. La
  // chiave web è pubblica (sta nell'app); il Referer è quello del sito, per
  // una chiave limitata ai suoi indirizzi.
  const chiave = (readFileSync(ENV, 'utf8').match(/^VITE_FIREBASE_API_KEY=(.+)$/m) || [])[1]?.trim()
  const res = chiave
    ? await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(chiave)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'it', Referer: `${SITO}/` },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: EMAIL }),
      }).catch(() => null)
    : null
  if (res?.ok) console.log(`[titolare] ✓ ${PROGETTO}: mandata l'email per impostare la password`)
  else console.log(`::warning::${PROGETTO}: l'email per impostare la password non è partita (${res ? `HTTP ${res.status}` : 'nessuna chiave web'}): il titolare usa «password dimenticata».`)
}
