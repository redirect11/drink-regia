#!/usr/bin/env node
// =====================================================================
//  L'ACCOUNT DI SERVIZIO DELLE FUNCTIONS AI, PER LA FEDERAZIONE ANTHROPIC.
//
//    node scripts/account-ai.mjs --progetto drink-regia-test
//
//  L'utente, 06/11/2026: un workspace Anthropic per la regia, con la
//  federazione delle identità al posto della chiave statica. Anthropic
//  vuole un account di servizio Google gestito da noi, non quello
//  predefinito di Compute Engine (docs/handover.md §7, «Cassetto AI»).
//  Questo script, lanciato da una persona col suo accesso (il login del
//  Firebase CLI: dare permessi è un gesto che vuole una persona), sul
//  progetto della regia:
//    1. crea l'account `ai-regia@<progetto>.iam.gserviceaccount.com`;
//    2. gli dà sul progetto Firestore (roles/datastore.user: il cassetto,
//       i consumi, i temi) e i log (roles/logging.logWriter), e basta: nei
//       progetti dei locali non entra, la licenza la riscrive un trigger;
//    3. lascia che il SA del deploy «agisca come» lui
//       (roles/iam.serviceAccountUser sull'account, non sul progetto:
//       senza, il deploy delle Functions si ferma con actAs);
//    4. stampa email e id numerico: sono i due valori che la procedura
//       «Connetti carico di lavoro → Google Cloud» della Console di
//       Anthropic chiede per la regola.
//  Idempotente: un account che c'è già e un ruolo già dato si lasciano.
// =====================================================================
import { accessToken, arg } from './lib-firestore.js'
import { conIRuoli } from './lib-iam.js'

const PROGETTO = arg('progetto')
if (!PROGETTO) {
  console.error('Uso: node scripts/account-ai.mjs --progetto <id del progetto della regia>')
  process.exit(1)
}
const NOME = 'ai-regia'
const EMAIL = `${NOME}@${PROGETTO}.iam.gserviceaccount.com`
const DEPLOY = `firebase-adminsdk-fbsvc@${PROGETTO}.iam.gserviceaccount.com`
const RUOLI_PROGETTO = ['roles/datastore.user', 'roles/logging.logWriter']

const token = await accessToken()
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const IAM = `https://iam.googleapis.com/v1/projects/${PROGETTO}/serviceAccounts`

async function chiama(url, opzioni = {}) {
  const res = await fetch(url, { headers: h, ...opzioni })
  const j = res.status === 204 ? {} : await res.json()
  if (j.error) throw new Error(`${j.error.code} ${j.error.message}`)
  return j
}

// 1. L'account: creato, o già lì.
let account
try {
  account = await chiama(IAM, { method: 'POST', body: JSON.stringify({ accountId: NOME, serviceAccount: { displayName: 'Functions AI della regia (federazione Anthropic)' } }) })
  console.log('account creato:', EMAIL)
} catch (e) {
  if (!/^409/.test(e.message)) throw e
  account = await chiama(`${IAM}/${EMAIL}`)
  console.log('account già presente:', EMAIL)
}

// 2. I ruoli sul progetto.
const progetto = `https://cloudresourcemanager.googleapis.com/v1/projects/${PROGETTO}`
const policy = await chiama(`${progetto}:getIamPolicy`, { method: 'POST', body: '{}' })
const { policy: nuova, nuovi } = conIRuoli(policy, `serviceAccount:${EMAIL}`, RUOLI_PROGETTO)
if (nuovi) await chiama(`${progetto}:setIamPolicy`, { method: 'POST', body: JSON.stringify({ policy: nuova }) })
console.log(`ruoli sul progetto: ${nuovi ? `${nuovi} dati` : 'già a posto'} (${RUOLI_PROGETTO.join(', ')})`)

// 3. Il deploy agisce come l'account.
const policySa = await chiama(`${IAM}/${EMAIL}:getIamPolicy`, { method: 'POST', body: '{}' })
const sa = conIRuoli(policySa, `serviceAccount:${DEPLOY}`, ['roles/iam.serviceAccountUser'])
if (sa.nuovi) await chiama(`${IAM}/${EMAIL}:setIamPolicy`, { method: 'POST', body: JSON.stringify({ policy: sa.policy }) })
console.log(`il deploy (${DEPLOY}) agisce come l’account: ${sa.nuovi ? 'dato' : 'già a posto'}`)

// 4. Quello che serve alla Console di Anthropic e a functions/.env.<progetto>.
console.log('\nNella Console di Anthropic, «Connetti carico di lavoro → Google Cloud»:')
console.log(`  email dell’account:  ${EMAIL}`)
console.log(`  id numerico (sub):   ${account.uniqueId}`)
console.log(`  audience:            https://api.anthropic.com`)
console.log(`\nIn functions/.env.${PROGETTO}: AI_SERVICE_ACCOUNT=${EMAIL}, più gli id che la Console mostra alla fine`)
console.log('(ANTHROPIC_FEDERATION_RULE_ID, ANTHROPIC_ORGANIZATION_ID, ANTHROPIC_SERVICE_ACCOUNT_ID, ANTHROPIC_WORKSPACE_ID).')
