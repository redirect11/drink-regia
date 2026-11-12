// =====================================================================
//  L'ACCOUNT DELL'AI DI UN LOCALE ESISTENTE (REQ-FLOTTA-078)
//
//    node scripts/account-ai-locale.mjs --project tana-drink
//
//  La Function AI dell'app gira con ai-locale@<progetto>, e la regia la
//  riconosce da lì (REQ-FLOTTA-077). Ai locali della flotta l'account lo
//  dà il Terraform (infra/istanza/main.tf, ai_locale); un locale esistente
//  (la Tana) non ce l'ha, e glielo dà questo script, a ogni aggiornamento,
//  con gli stessi ruoli. Crea l'account se manca, aggiunge i ruoli e non
//  toglie mai niente: rilanciato, non cambia nulla.
//  Lo lancia aggiorna-istanza.yml prima del deploy. Credenziali:
//  GOOGLE_APPLICATION_CREDENTIALS del service account di provisioning.
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'
import { conIRuoli } from './lib-iam.js'
const require = createRequire(import.meta.url)
const { GoogleAuth } = require('../functions/node_modules/google-auth-library')

// Gli stessi del Terraform: un test li confronta.
const RUOLI = ['roles/datastore.user', 'roles/logging.logWriter']

const PROGETTO = arg('project')
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(PROGETTO || '')) {
  console.error('Uso: node scripts/account-ai-locale.mjs --project <id>')
  process.exit(1)
}
const EMAIL = `ai-locale@${PROGETTO}.iam.gserviceaccount.com`
const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const chiama = (url, opz = {}) => client.request({ url, validateStatus: () => true, timeout: 30000, ...opz })
const attendi = (ms) => new Promise((r) => setTimeout(r, ms))

// 1. L'account: creato, o già lì.
const creato = await chiama(`https://iam.googleapis.com/v1/projects/${PROGETTO}/serviceAccounts`, {
  method: 'POST',
  data: { accountId: 'ai-locale', serviceAccount: { displayName: "L'AI del locale verso la regia" } },
})
if (creato.status === 200) console.log('account creato:', EMAIL)
else if (creato.status === 409) console.log('account già presente:', EMAIL)
else {
  console.error(`L'account ${EMAIL} non si crea (${creato.status}): ${JSON.stringify(creato.data).slice(0, 200)}`)
  process.exit(1)
}

// 2. I ruoli sul progetto, aggiunti. Un account appena nato può non essere
// ancora visibile all'IAM per qualche secondo: si riprova.
const progetto = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROGETTO}`
for (let tentativo = 1; ; tentativo++) {
  const letta = await chiama(`${progetto}:getIamPolicy`, { method: 'POST', data: {} })
  if (letta.status !== 200) {
    console.error(`La policy di ${PROGETTO} non si legge (${letta.status}).`)
    process.exit(1)
  }
  const { policy, nuovi } = conIRuoli(letta.data, `serviceAccount:${EMAIL}`, RUOLI)
  if (!nuovi) {
    console.log('ruoli già presenti:', RUOLI.join(', '))
    break
  }
  const scritta = await chiama(`${progetto}:setIamPolicy`, { method: 'POST', data: { policy } })
  if (scritta.status === 200) {
    console.log('ruoli dati:', RUOLI.join(', '))
    break
  }
  if (tentativo >= 5) {
    console.error(`I ruoli non si danno (${scritta.status}): ${JSON.stringify(scritta.data).slice(0, 200)}`)
    process.exit(1)
  }
  await attendi(5000)
}
