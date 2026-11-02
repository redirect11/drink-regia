// =====================================================================
//  IL TITOLARE, ADMIN DEL SUO LOCALE (REQ-FLOTTA-029).
//
//    node scripts/titolare-istanza.mjs --project drinkpos-bar-mario \
//         --uid <uid nella regia> --email mario@example.it \
//         --env app/.env --sito https://drinkpos-bar-mario.web.app
//
//  Lo lanciano provisiona-istanza.yml e aggiorna-istanza.yml dopo il
//  deploy, con le credenziali del service account di provisioning. Nel
//  progetto del locale: l'account con l'email del cliente c'è (creato già
//  verificato, senza password), ha il ruolo `admin`, e finché non ha una
//  password riceve l'email di Firebase per impostarla, in italiano. Dal
//  02/11/2026 (M7) l'account ha lo STESSO UID del titolare nella regia
//  (--uid): un segnaposto mai usato con un altro uid si ricrea, uno già
//  usato resta com'è con un avviso. Cosa fare lo decide pianoTitolare
//  (functions/lib/titolare.js). Si può rilanciare senza danni: un admin
//  con la sua password non si tocca. Senza --uid lavora per email, come
//  prima (un lancio a mano dalla pagina Actions).
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
const { emailTitolare, uidTitolare, pianoTitolare } = require('../functions/lib/titolare.js')

const PROGETTO = arg('project')
const EMAIL = emailTitolare(arg('email'))
const UID = uidTitolare(arg('uid', ''))
const ENV = arg('env', 'app/.env')
const SITO = arg('sito', `https://${PROGETTO}.web.app`)
if (!PROGETTO || !EMAIL || UID === null) {
  console.error('Uso: node scripts/titolare-istanza.mjs --project <id> --email <email> [--uid <uid della regia>] [--env app/.env] [--sito https://…]')
  process.exit(1)
}

initializeApp({ projectId: PROGETTO })
const auth = getAuth()
const cerca = (p) => p.catch((e) => (e?.code === 'auth/user-not-found' ? null : Promise.reject(e)))
const [perUid, perEmail] = await Promise.all([UID ? cerca(auth.getUser(UID)) : null, cerca(auth.getUserByEmail(EMAIL))])
const cosa = pianoTitolare({ uid: UID, email: EMAIL, perUid, perEmail })
for (const a of cosa.avvisi) console.log(`::warning::${PROGETTO}: ${a}`)

let uidFinale = cosa.uid
// Cancellare prima di creare: Firebase non vuole due account con la stessa
// email. Se la creazione poi fallisce, al rilancio non c'è più nessuno dei
// due e si crea da capo: il passo resta ripetibile.
if (cosa.daCancellare) await auth.deleteUser(cosa.daCancellare)
if (cosa.azione !== 'tieni') {
  const nuovo = await auth.createUser({ ...(cosa.uid ? { uid: cosa.uid } : {}), email: EMAIL, emailVerified: true })
  uidFinale = nuovo.uid
}
if (cosa.ruolo) await auth.setCustomUserClaims(uidFinale, cosa.ruolo)
const fatto = { crea: 'account creato', ricrea: 'segnaposto ricreato con l’uid della regia', tieni: 'account già presente' }[cosa.azione]
console.log(`[titolare] ✓ ${PROGETTO}: ${fatto} (${uidFinale}), admin${cosa.ruolo ? ' (ruolo dato ora)' : ''}`)

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
