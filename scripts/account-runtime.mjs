#!/usr/bin/env node
// =====================================================================
//  L'ACCOUNT DI SERVIZIO CON CUI GIRANO LE FUNCTIONS DELLA REGIA.
//
//    node scripts/account-runtime.mjs --progetto drink-regia-test \
//         [--locale drinkpos-prova-bar]...
//
//  Audit del 09/11/2026, finding 3 (H4 del 22/10): le Functions girano
//  con l'account predefinito di Compute Engine, che è Editor sulla regia
//  e che il Terraform dei locali autorizza a leggere e scrivere il loro
//  Firestore e a firmare accessi. Qualunque bug in qualunque Function
//  eredita tutto. Questo script, lanciato da una persona col suo accesso
//  (il login del Firebase CLI: dare permessi è un gesto che vuole una
//  persona), crea sul progetto della regia un account dedicato con i soli
//  ruoli che il codice usa, e niente Editor:
//    - Firestore della regia (datastore.user) e i log (logging.logWriter);
//    - gli utenti della regia (firebaseauth.admin: crea l'admin del
//      cliente, lo cerca per email, firma gli accessi di passaggio);
//    - i trigger Firestore (eventarc.eventReceiver, run.invoker: sono i
//      due ruoli che Firebase dava all'account predefinito);
//    - la coda delle scadenze (cloudtasks.enqueuer, e «agire come» sé
//      stesso per il token OIDC dei task);
//    - firmare come sé stesso (iam.serviceAccountTokenCreator su sé
//      stesso: i token di accesso e gli URL firmati dell'archivio).
//  Poi lascia che il SA del deploy «agisca come» lui (serviceAccountUser
//  sull'account: senza, il deploy delle Functions si ferma con actAs).
//
//  --locale, ripetibile: dà all'account, su un progetto di un locale, i
//  tre ruoli che il Terraform gli darà alla prossima esecuzione
//  (infra/istanza/main.tf, risorse «regia»): così il passaggio dal vecchio
//  account al nuovo non lascia un buco in cui la licenza non si scrive.
//  Il Terraform poi converge e toglie il vecchio.
//
//  Il valore da mettere in functions/.env.<progetto> è
//  RUNTIME_SERVICE_ACCOUNT=<email stampata>, e REGIA_SA_EMAIL
//  nell'environment GitHub della flotta di quella regia deve diventare la
//  stessa email. Idempotente: un account che c'è già e un ruolo già dato
//  si lasciano. Non toglie niente: il vecchio account resta finché una
//  persona non decide di levargli Editor.
// =====================================================================
import { accessToken, arg } from './lib-firestore.js'
import { conIRuoli } from './lib-iam.js'

const PROGETTO = arg('progetto')
const ripetuto = (nome) => process.argv.flatMap((a, i, tutti) => (a === `--${nome}` ? [tutti[i + 1]] : []))
const LOCALI = ripetuto('locale')
if (!PROGETTO) {
  console.error('Uso: node scripts/account-runtime.mjs --progetto <id del progetto della regia> [--locale <id progetto del locale>]...')
  process.exit(1)
}
const NOME = 'runtime-regia'
const EMAIL = `${NOME}@${PROGETTO}.iam.gserviceaccount.com`
const DEPLOY = `firebase-adminsdk-fbsvc@${PROGETTO}.iam.gserviceaccount.com`
// Sul progetto della regia: il minimo che il codice delle Functions usa.
const RUOLI_PROGETTO = [
  'roles/datastore.user',
  'roles/firebaseauth.admin',
  'roles/logging.logWriter',
  'roles/eventarc.eventReceiver',
  'roles/run.invoker',
  'roles/cloudtasks.enqueuer',
]
// Su sé stesso: firmare (token di accesso, URL firmati) e agire come sé
// (i task della coda delle scadenze portano un token OIDC suo).
const RUOLI_SU_SE_STESSO = ['roles/iam.serviceAccountTokenCreator', 'roles/iam.serviceAccountUser']
// Su ogni locale: gli stessi tre del Terraform (main.tf, risorse «regia»).
const RUOLI_LOCALE = ['roles/datastore.user', 'roles/firebaseauth.viewer']
const RUOLO_FIRMA_LOCALE = 'roles/iam.serviceAccountTokenCreator'

const token = await accessToken()
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const IAM = `https://iam.googleapis.com/v1/projects/${PROGETTO}/serviceAccounts`

async function chiama(url, opzioni = {}) {
  const res = await fetch(url, { headers: h, ...opzioni })
  const j = res.status === 204 ? {} : await res.json()
  if (j.error) throw new Error(`${j.error.code} ${j.error.message}`)
  return j
}

// Un membro in più in una policy letta e riscritta con la sua API.
async function dai(etichetta, membro, ruoli, { leggi, scrivi }) {
  const policy = await chiama(leggi, { method: 'POST', body: '{}' })
  const { policy: nuova, nuovi } = conIRuoli(policy, membro, ruoli)
  if (nuovi) await chiama(scrivi, { method: 'POST', body: JSON.stringify({ policy: nuova }) })
  console.log(`${etichetta}: ${nuovi ? `${nuovi} dati` : 'già a posto'} (${ruoli.join(', ')})`)
}

// 1. L'account: creato, o già lì.
try {
  await chiama(IAM, { method: 'POST', body: JSON.stringify({ accountId: NOME, serviceAccount: { displayName: 'Functions della regia (runtime, senza Editor)' } }) })
  console.log('account creato:', EMAIL)
} catch (e) {
  if (!/^409/.test(e.message)) throw e
  console.log('account già presente:', EMAIL)
}

// 2. I ruoli sul progetto della regia.
const progetto = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROGETTO}`
await dai('ruoli sul progetto', `serviceAccount:${EMAIL}`, RUOLI_PROGETTO, { leggi: `${progetto}:getIamPolicy`, scrivi: `${progetto}:setIamPolicy` })

// 3. Su sé stesso, e il deploy che agisce come lui.
const account = `${IAM}/${EMAIL}`
await dai('su sé stesso', `serviceAccount:${EMAIL}`, RUOLI_SU_SE_STESSO, { leggi: `${account}:getIamPolicy`, scrivi: `${account}:setIamPolicy` })
await dai(`il deploy (${DEPLOY}) agisce come l’account`, `serviceAccount:${DEPLOY}`, ['roles/iam.serviceAccountUser'], { leggi: `${account}:getIamPolicy`, scrivi: `${account}:setIamPolicy` })

// 4. I locali, se chiesti: come farà il Terraform.
for (const locale of LOCALI) {
  const p = `https://cloudresourcemanager.googleapis.com/v1/projects/${locale}`
  await dai(`locale ${locale}`, `serviceAccount:${EMAIL}`, RUOLI_LOCALE, { leggi: `${p}:getIamPolicy`, scrivi: `${p}:setIamPolicy` })
  const firma = `https://iam.googleapis.com/v1/projects/${locale}/serviceAccounts/firebase-adminsdk-fbsvc@${locale}.iam.gserviceaccount.com`
  await dai(`locale ${locale}, firma come l’SDK`, `serviceAccount:${EMAIL}`, [RUOLO_FIRMA_LOCALE], { leggi: `${firma}:getIamPolicy`, scrivi: `${firma}:setIamPolicy` })
}

console.log(`\nIn functions/.env.${PROGETTO}: RUNTIME_SERVICE_ACCOUNT=${EMAIL}`)
console.log(`Nell'environment GitHub della flotta di questa regia: REGIA_SA_EMAIL=${EMAIL}`)
console.log('Poi un deploy delle Functions, e il Terraform dei locali alla prossima esecuzione converge.')
