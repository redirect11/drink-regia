// =====================================================================
//  IL SERVICE ACCOUNT DEL DEPLOY DI UN PROGETTO DELLA REGIA
//  (docs/actions-come-tana-drink.md §3).
//
//    node scripts/ruoli-deploy.mjs --progetto drink-regia [--chiave --env production]
//
//  Prepara `firebase-adminsdk-fbsvc@<progetto>` a pubblicare sito, regole
//  e Functions dalle Actions: accende le API che il SA non può accendere
//  da solo, gli dà i ruoli sul progetto, lo fa «agire come» il SA di
//  runtime e quello di App Engine, e dà agli agenti di servizio i tre
//  ruoli che il primo deploy altrimenti chiede e, non essendo
//  proprietario, non può dare. Con --chiave crea una chiave JSON del SA e
//  la mette nell'environment GitHub indicato come FIREBASE_SERVICE_ACCOUNT,
//  passandola a `gh secret set` dallo standard input: non tocca il disco e
//  non la stampa. Idempotente, tranne la chiave: ogni lancio con --chiave
//  ne crea una nuova (le vecchie restano, da togliere a mano dalla console).
//  Lo lancia una persona, col suo accesso: dare permessi è un gesto che
//  vuole una persona. Fatto sul test il 29/10/2026 a mano, sulla
//  produzione il 06/11/2026 con questo script.
// =====================================================================
import { spawnSync } from 'node:child_process'
import { accessToken, arg, flag } from './lib-firestore.js'
import { conIRuoli } from './lib-iam.js'

const P = arg('progetto')
const REPO = arg('repo', 'redirect11/drink-regia')
const ENV = arg('env')
const CHIAVE = flag('chiave')
if (!P || (CHIAVE && !ENV)) {
  console.error('Uso: node scripts/ruoli-deploy.mjs --progetto <id> [--chiave --env <test|production>] [--repo owner/repo]')
  process.exit(1)
}

const API = ['secretmanager.googleapis.com', 'run.googleapis.com', 'cloudfunctions.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'eventarc.googleapis.com', 'pubsub.googleapis.com', 'cloudtasks.googleapis.com', 'cloudscheduler.googleapis.com', 'firebaseextensions.googleapis.com', 'iamcredentials.googleapis.com']
// I ruoli di §3, punto 1, col perché di ciascuno là.
const RUOLI_PROGETTO = ['roles/firebase.admin', 'roles/serviceusage.serviceUsageConsumer', 'roles/datastore.indexAdmin', 'roles/firebaserules.admin', 'roles/secretmanager.admin', 'roles/cloudscheduler.admin', 'roles/cloudtasks.queueAdmin', 'roles/artifactregistry.admin', 'roles/run.admin']

const token = await accessToken()
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const post = async (url, body = {}) => {
  const j = await (await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) })).json()
  if (j.error) throw new Error(`${url}: ${j.error.message}`)
  return j
}
const get = async (url) => {
  const j = await (await fetch(url, { headers: h })).json()
  if (j.error) throw new Error(`${url}: ${j.error.message}`)
  return j
}
const dormi = (ms) => new Promise((r) => setTimeout(r, ms))

const deploy = `firebase-adminsdk-fbsvc@${P}.iam.gserviceaccount.com`
const numero = (await get(`https://cloudresourcemanager.googleapis.com/v1/projects/${P}`)).projectNumber
const runtime = `${numero}-compute@developer.gserviceaccount.com`
const appengine = `${P}@appspot.gserviceaccount.com`
console.log(`progetto ${P} (${numero}), deploy ${deploy}`)

// 1. Le API: batchEnable è un'operazione lunga, si aspetta che finisca.
const accese = (await get(`https://serviceusage.googleapis.com/v1/projects/${P}/services?filter=state:ENABLED&pageSize=200`)).services?.map((s) => s.config.name) || []
const spente = API.filter((a) => !accese.includes(a))
if (spente.length) {
  let op = await post(`https://serviceusage.googleapis.com/v1/projects/${P}/services:batchEnable`, { serviceIds: spente })
  for (let i = 0; !op.done && i < 30; i++) { await dormi(2000); op = await get(`https://serviceusage.googleapis.com/v1/${op.name}`) }
  if (op.error) throw new Error(op.error.message)
}
console.log('API accese:', spente.length ? spente.join(', ') : 'già tutte')

// 2. L'agente di Pub/Sub nasce solo al primo uso: lo si fa nascere, perché
//    il ruolo di sotto va dato a un'identità che esiste.
await post(`https://serviceusage.googleapis.com/v1beta1/projects/${P}/services/pubsub.googleapis.com:generateServiceIdentity`)
const pubsub = `service-${numero}@gcp-sa-pubsub.iam.gserviceaccount.com`

// 3. Ruoli sul progetto: al deploy i suoi, agli agenti i tre del primo deploy.
async function suProgetto(membro, ruoli) {
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${P}`
  const { policy, nuovi } = conIRuoli(await post(`${url}:getIamPolicy`), membro, ruoli)
  if (nuovi) await post(`${url}:setIamPolicy`, { policy })
  return nuovi ? `${nuovi} ruoli dati` : 'già a posto'
}
console.log('deploy sul progetto:', await suProgetto(`serviceAccount:${deploy}`, RUOLI_PROGETTO))
console.log('runtime sul progetto (invoker, eventarc):', await suProgetto(`serviceAccount:${runtime}`, ['roles/run.invoker', 'roles/eventarc.eventReceiver']))
console.log('agente Pub/Sub (tokenCreator):', await suProgetto(`serviceAccount:${pubsub}`, ['roles/iam.serviceAccountTokenCreator']))

// 4. «Agire come» i due SA: il ruolo va sul SA, non sul progetto.
for (const sa of [runtime, appengine]) {
  const url = `https://iam.googleapis.com/v1/projects/${P}/serviceAccounts/${sa}`
  const { policy, nuovi } = conIRuoli(await post(`${url}:getIamPolicy`), `serviceAccount:${deploy}`, ['roles/iam.serviceAccountUser'])
  if (nuovi) await post(`${url}:setIamPolicy`, { policy })
  console.log(`actAs su ${sa}:`, nuovi ? 'dato' : 'già a posto')
}

// 5. La chiave, dritta nell'environment GitHub.
if (CHIAVE) {
  const k = await post(`https://iam.googleapis.com/v1/projects/${P}/serviceAccounts/${deploy}/keys`, { privateKeyType: 'TYPE_GOOGLE_CREDENTIALS_FILE' })
  const json = Buffer.from(k.privateKeyData, 'base64').toString('utf8')
  const r = spawnSync('gh', ['secret', 'set', 'FIREBASE_SERVICE_ACCOUNT', '-R', REPO, '-e', ENV], { input: json, encoding: 'utf8', shell: process.platform === 'win32' })
  if (r.status !== 0) throw new Error(`gh secret set: ${r.stderr}`)
  console.log(`chiave ${k.name.split('/').pop()} creata e messa in FIREBASE_SERVICE_ACCOUNT dell'environment ${ENV}`)
}
