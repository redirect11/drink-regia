// =====================================================================
//  LA FORMA BASE DELL'EMAIL DEI CLIENTI DI PRIMA (REQ-FLOTTA-083)
//
//    node scripts/email-norma.mjs --project drink-regia-test [--scrivi]
//
//  Dal 12/11/2026 la registrazione salva `email_norma` (minuscole, senza
//  «+qualcosa», per Gmail senza punti) e rifiuta le varianti di un'email
//  che ha già un account. I clienti nati prima non ce l'hanno: lo script la
//  scrive solo dove manca, e mai per un'email col «+» (le prove
//  dell'admin). Senza --scrivi dice soltanto cosa farebbe.
// =====================================================================
import { createRequire } from 'node:module'
import { arg, flag } from './lib-firestore.js'
const require = createRequire(import.meta.url)
const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/app')
const { getFirestore } = require('../functions/node_modules/firebase-admin/firestore')
const { emailNorma } = require('../functions/lib/registrazione.js')

const PROGETTO = arg('project')
if (!['drink-regia', 'drink-regia-test'].includes(PROGETTO)) {
  console.error('Uso: node scripts/email-norma.mjs --project drink-regia-test|drink-regia [--scrivi]')
  process.exit(1)
}
const SCRIVI = flag('scrivi')
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: PROGETTO }))
const clienti = await db.collection('clienti').get()
let da = 0
for (const d of clienti.docs) {
  const c = d.data()
  if (c.email_norma || !c.email || String(c.email).includes('+')) continue
  da++
  console.log(`${d.id} ${c.slug || '—'}: ${emailNorma(c.email)}`)
  if (SCRIVI) await d.ref.set({ email_norma: emailNorma(c.email) }, { merge: true })
}
console.log(`${da} clienti ${SCRIVI ? 'aggiornati' : 'da aggiornare (lancia con --scrivi)'}.`)
