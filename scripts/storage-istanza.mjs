// =====================================================================
//  ACCENDE LO STORAGE DI UN'ISTANZA: il bucket predefinito di Firebase, e
//  il ruolo che serve alle regole di Storage per leggere la licenza.
//
//    node scripts/storage-istanza.mjs --project drinkpos-bar-mario [--location EUROPE-WEST1]
//
//  Lo lanciano provisiona-istanza.yml (REQ-FLOTTA-013) e aggiorna-istanza.yml
//  dopo il Terraform e prima del deploy: l'app usa firebase/storage e il
//  deploy pubblica storage.rules, e senza bucket si ferma («Firebase Storage
//  has not been set up»). Il bucket `<progetto>.firebasestorage.app` non lo
//  può creare il Terraform: quei nomi sono di Firebase, e Cloud Storage
//  risponde «Another user owns the domain» (la prima attivazione di prova,
//  29/10/2026). Lo crea l'API di Firebase Storage, la stessa del clic
//  «Inizia» della console. Se il bucket c'è già non lo rifà.
//
//  IL RUOLO DELLO STORAGE (REQ-FLOTTA-124, tana-drink REQ-SIC-006): le
//  regole di Storage che leggono la licenza da Firestore vogliono
//  roles/firebaserules.firestoreServiceAgent sul service agent dello
//  Storage. Si dà qui, dopo il bucket, e non nel Terraform: il service
//  agent nasce col bucket, e prima Google risponde «does not exist» (la
//  prova di un locale nuovo, drinkpos-prova-storage, 17/11/2026). Gira a
//  ogni attivazione e a ogni aggiornamento: un ruolo già dato non si
//  riscrive, quindi i locali già attivi lo ricevono al loro aggiornamento,
//  prima del deploy delle regole.
//
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service account di
//  provisioning (google-auth-library viene dalle dipendenze delle Functions).
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'
import { conIRuoli, agenteStorage, RUOLO_REGOLE_STORAGE, agenteNonAncoraNato } from './lib-iam.js'

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
} else if (c.status === 404) {
  const n = await client.request({ url, method: 'POST', headers, data: { location: LOCATION }, validateStatus: () => true })
  if (n.status !== 200) {
    console.error(`[storage] ✖ ${PROGETTO}: ${n.status} ${JSON.stringify(n.data).slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`[storage] ✓ ${PROGETTO}: bucket ${n.data.bucket?.name} in ${n.data.location}`)
} else {
  console.error(`[storage] ✖ ${PROGETTO}: ${c.status} ${JSON.stringify(c.data).slice(0, 300)}`)
  process.exit(1)
}

// Il ruolo. Il service agent può arrivare qualche istante dopo il bucket:
// finché Google dice che non esiste si riprova, per due minuti al più.
const crm = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROGETTO}`
const p = await client.request({ url: crm, validateStatus: () => true })
if (p.status !== 200 || !p.data?.projectNumber) {
  console.error(`[storage] ✖ ${PROGETTO}: il numero del progetto non si legge (${p.status})`)
  process.exit(1)
}
const membro = `serviceAccount:${agenteStorage(p.data.projectNumber)}`
const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms))
for (let tentativo = 1; ; tentativo++) {
  const letta = await client.request({ url: `${crm}:getIamPolicy`, method: 'POST', data: {}, validateStatus: () => true })
  if (letta.status !== 200) {
    console.error(`[storage] ✖ ${PROGETTO}: la policy non si legge (${letta.status} ${JSON.stringify(letta.data).slice(0, 200)})`)
    process.exit(1)
  }
  const { policy, nuovi } = conIRuoli(letta.data, membro, [RUOLO_REGOLE_STORAGE])
  if (nuovi === 0) {
    console.log(`[storage] = ${PROGETTO}: il ruolo per le regole che leggono la licenza c'è già`)
    break
  }
  const scritta = await client.request({ url: `${crm}:setIamPolicy`, method: 'POST', data: { policy }, validateStatus: () => true })
  if (scritta.status === 200) {
    console.log(`[storage] ✓ ${PROGETTO}: ${RUOLO_REGOLE_STORAGE} al service agent dello Storage`)
    break
  }
  if (agenteNonAncoraNato(scritta.data) && tentativo < 12) {
    console.log(`[storage] … ${PROGETTO}: il service agent dello Storage non c'è ancora, riprovo fra 10 s (${tentativo}/12)`)
    await attendi(10000)
    continue
  }
  console.error(`[storage] ✖ ${PROGETTO}: il ruolo non si dà (${scritta.status} ${JSON.stringify(scritta.data).slice(0, 300)})`)
  process.exit(1)
}
