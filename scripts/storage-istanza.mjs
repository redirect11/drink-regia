// =====================================================================
//  ACCENDE LO STORAGE DI UN'ISTANZA: il bucket predefinito di Firebase.
//
//    node scripts/storage-istanza.mjs --project drinkpos-bar-mario [--location EUROPE-WEST1]
//
//  Lo lancia provisiona-istanza.yml (REQ-FLOTTA-013) dopo il Terraform e
//  prima del deploy: l'app usa firebase/storage e il deploy pubblica
//  storage.rules, e senza bucket si ferma («Firebase Storage has not been
//  set up»). Il bucket `<progetto>.firebasestorage.app` non lo può creare
//  il Terraform: quei nomi sono di Firebase, e Cloud Storage risponde
//  «Another user owns the domain» (la prima attivazione di prova,
//  29/10/2026). Lo crea l'API di Firebase Storage, la stessa del clic
//  «Inizia» della console. Se il bucket c'è già non fa niente.
//
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service account di
//  provisioning (google-auth-library viene dalle dipendenze delle Functions).
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'

const require = createRequire(import.meta.url)
const { GoogleAuth } = require('../functions/node_modules/google-auth-library')

const PROGETTO = arg('project')
const LOCATION = arg('location', 'EUROPE-WEST1')
if (!PROGETTO) {
  console.error('Uso: node scripts/storage-istanza.mjs --project <id> [--location EUROPE-WEST1]')
  process.exit(1)
}

const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const url = `https://firebasestorage.googleapis.com/v1alpha/projects/${PROGETTO}/defaultBucket`
const headers = { 'X-Goog-User-Project': PROGETTO }

const c = await client.request({ url, headers, validateStatus: () => true })
if (c.status === 200) {
  console.log(`[storage] = ${PROGETTO}: il bucket c'è già (${c.data.bucket?.name || '?'})`)
  process.exit(0)
}
if (c.status !== 404) {
  console.error(`[storage] ✖ ${PROGETTO}: ${c.status} ${JSON.stringify(c.data).slice(0, 300)}`)
  process.exit(1)
}
const n = await client.request({ url, method: 'POST', headers, data: { location: LOCATION }, validateStatus: () => true })
if (n.status !== 200) {
  console.error(`[storage] ✖ ${PROGETTO}: ${n.status} ${JSON.stringify(n.data).slice(0, 300)}`)
  process.exit(1)
}
console.log(`[storage] ✓ ${PROGETTO}: bucket ${n.data.bucket?.name} in ${n.data.location}`)
