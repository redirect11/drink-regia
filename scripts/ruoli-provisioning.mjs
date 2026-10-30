// =====================================================================
//  I RUOLI DEL SERVICE ACCOUNT DI PROVISIONING (REQ-FLOTTA-006).
//
//    node scripts/ruoli-provisioning.mjs --sa provisioning@drink-regia.iam.gserviceaccount.com \
//         --billing 01FD7B-XXXXXX-XXXXXX \
//         --bucket drink-regia-tfstate --bucket drink-regia-archivio \
//         --progetto drinkpos-<slug>
//
//  Dà al service account quello che i workflow della flotta gli chiedono
//  (infra/README.md, «Prerequisiti»): usare l'account di fatturazione
//  (agganciare Blaze ai progetti nuovi), scrivere lo stato di Terraform e
//  gli archivi nei bucket, e amministrare il progetto di un locale.
//  --bucket e --progetto si ripetono: senza Organizzazione i progetti li
//  crea una persona, e il ruolo va dato uno per uno.
//  Lo lancia una persona, col suo accesso: dare permessi è un gesto che
//  vuole una persona. Idempotente: un ruolo già dato non si riscrive.
//  Portato da tana-drink (ramo feature/flotta, chiuso il 30/10/2026).
// =====================================================================
import { accessToken, arg } from './lib-firestore.js'
import { conIRuoli } from './lib-iam.js'

const SA = arg('sa')
const BILLING = arg('billing')
const ripetuto = (nome) => process.argv.flatMap((a, i, tutti) => (a === `--${nome}` ? [tutti[i + 1]] : []))
const BUCKET = ripetuto('bucket')
const PROGETTI = ripetuto('progetto')
if (!SA) {
  console.error('Uso: node scripts/ruoli-provisioning.mjs --sa <email> [--billing <id>] [--bucket <nome>]... [--progetto <id>]...')
  process.exit(1)
}
const token = await accessToken()
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
const membro = `serviceAccount:${SA}`

// Ogni API legge e scrive la policy a modo suo: i progetti con POST e
// POST, l'account di fatturazione con GET e POST, i bucket con GET e PUT.
async function aggiungi(ruoli, { leggi, scrivi }) {
  const policy = await (await leggi()).json()
  if (policy.error) throw new Error(policy.error.message)
  const { policy: nuova, nuovi } = conIRuoli(policy, membro, ruoli)
  if (nuovi === 0) return 'già a posto'
  const j = await (await scrivi(nuova)).json()
  if (j.error) throw new Error(j.error.message)
  return `${nuovi} ruoli dati`
}

if (BILLING) {
  const url = `https://cloudbilling.googleapis.com/v1/billingAccounts/${BILLING}`
  console.log('fatturazione:', await aggiungi(['roles/billing.user'], {
    leggi: () => fetch(`${url}:getIamPolicy`, { headers: h }),
    scrivi: (policy) => fetch(`${url}:setIamPolicy`, { method: 'POST', headers: h, body: JSON.stringify({ policy }) }),
  }))
}
for (const b of BUCKET) {
  const url = `https://storage.googleapis.com/storage/v1/b/${b}/iam`
  console.log(`bucket ${b}:`, await aggiungi(['roles/storage.objectAdmin'], {
    leggi: () => fetch(url, { headers: h }),
    scrivi: (policy) => fetch(url, { method: 'PUT', headers: h, body: JSON.stringify(policy) }),
  }))
}
for (const p of PROGETTI) {
  // Proprietario: il provisioning amministra il locale per intero (API,
  // Firebase, Firestore, Hosting, Auth, IAM del progetto). È il ruolo che
  // Terraform e il deploy si aspettano; un elenco più stretto si rompe a
  // ogni risorsa nuova.
  const url = `https://cloudresourcemanager.googleapis.com/v1/projects/${p}`
  console.log(`progetto ${p}:`, await aggiungi(['roles/owner'], {
    leggi: () => fetch(`${url}:getIamPolicy`, { method: 'POST', headers: h, body: '{}' }),
    scrivi: (policy) => fetch(`${url}:setIamPolicy`, { method: 'POST', headers: h, body: JSON.stringify({ policy }) }),
  }))
}
