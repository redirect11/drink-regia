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
//  Lo lancia aggiorna-istanza.yml prima del deploy, e per un locale
//  esistente che non passa dalla regia (la Tana) prepara-ai-locale.yml.
//  Con --deploy <account> dà anche a quell'account il permesso di
//  pubblicare Functions che girano come ai-locale (roles/iam.serviceAccountUser
//  sul solo account ai-locale): le Functions della Tana le pubblica il
//  deploy.yml di tana-drink col suo account, che dal 09/11 agisce solo
//  come gli account di runtime che conosce (da tana-drink, 12/11/2026).
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service account di
//  provisioning.
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
const DEPLOY = arg('deploy')
if (DEPLOY && !/^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/.test(DEPLOY)) {
  console.error('--deploy vuole un account di servizio di un progetto: <nome>@<progetto>.iam.gserviceaccount.com')
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

// 3. Il deploy di chi pubblica le Functions del locale, se è un altro
// (--deploy): può agire come ai-locale, e solo come lui.
if (DEPLOY) {
  const account = `https://iam.googleapis.com/v1/projects/${PROGETTO}/serviceAccounts/${EMAIL}`
  for (let tentativo = 1; ; tentativo++) {
    const letta = await chiama(`${account}:getIamPolicy`, { method: 'POST', data: {} })
    if (letta.status !== 200) {
      if (tentativo >= 5) {
        console.error(`La policy di ${EMAIL} non si legge (${letta.status}).`)
        process.exit(1)
      }
      await attendi(5000)
      continue
    }
    const { policy, nuovi } = conIRuoli(letta.data, `serviceAccount:${DEPLOY}`, ['roles/iam.serviceAccountUser'])
    if (!nuovi) {
      console.log(`${DEPLOY} può già pubblicare come ai-locale`)
      break
    }
    const scritta = await chiama(`${account}:setIamPolicy`, { method: 'POST', data: { policy } })
    if (scritta.status === 200) {
      console.log(`${DEPLOY} ora può pubblicare come ai-locale`)
      break
    }
    if (tentativo >= 5) {
      console.error(`Il permesso di deploy non si dà (${scritta.status}): ${JSON.stringify(scritta.data).slice(0, 200)}`)
      process.exit(1)
    }
    await attendi(5000)
  }
}
