// =====================================================================
//  IL NUMERO DEL PROGETTO DI UN LOCALE (REQ-FLOTTA-077)
//
//    node scripts/numero-progetto.mjs --project drinkpos-bar-mario
//
//  Stampa il numero del progetto Google, e nient'altro. Lo usano i
//  workflow della flotta nell'esito alla regia: le Functions del locale
//  girano con l'account predefinito del progetto, che porta il numero e non
//  il nome, e la regia riconosce il locale che chiede l'AI da quello.
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service account di
//  provisioning. Se non riesce esce con un errore, e il workflow manda
//  l'esito senza numero.
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'
const require = createRequire(import.meta.url)
const { GoogleAuth } = require('../functions/node_modules/google-auth-library')

const PROGETTO = arg('project')
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(PROGETTO || '')) {
  console.error('Uso: node scripts/numero-progetto.mjs --project <id>')
  process.exit(1)
}
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const r = await client.request({ url: `https://cloudresourcemanager.googleapis.com/v3/projects/${PROGETTO}`, validateStatus: () => true })
const numero = String(r.data?.name || '').replace(/^projects\//, '')
if (r.status !== 200 || !/^\d{6,20}$/.test(numero)) {
  console.error(`Il numero di ${PROGETTO} non si legge (${r.status}).`)
  process.exit(1)
}
console.log(numero)
