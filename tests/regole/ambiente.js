// ── PROVARE LE REGOLE FIRESTORE PER DAVVERO (REQ-DEV-007) ────────────────
//
// Le regole sono l'unica barriera fra i documenti della regia (account,
// piani, abbonamenti, stato delle istanze) e chiunque abbia letto apiKey e
// projectId dal bundle, che sono pubblici per disegno. Fino all'audit del
// 09/11/2026 (finding 16) si provavano solo sul testo: `toContain` su
// firestore.rules, che dice cosa c'è scritto e non cosa succede.
//
// Qui girano contro l'EMULATORE Firestore, con le regole vere del progetto
// (firestore.rules, letto dal disco: se cambia, cambia quello che si
// prova). Per questo NON stanno nel giro di `npm test` — senza emulatore
// non partirebbero — ma in `npm run test:regole`, che lo accende e lo
// spegne (firebase.collaudo.json, vitest.regole.config.mjs).
//
// OGNI PROVA È DOPPIA: che l'abuso sia bloccato conta quanto che l'uso
// legittimo passi. Una regola che chiude tutto è facile da scrivere, e
// lascia il titolare senza la sua dashboard.
//
// LA COPERTURA: ogni file dichiara in testa quali `match` prova
// (`// REGOLE PROVATE: /clienti/{uid}, …`); tests/regole/copertura.test.js
// confronta le dichiarazioni con le `match` di firestore.rules, così una
// collezione nuova senza test si vede subito.

import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'

const REGOLE = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')
const COLLAUDO = JSON.parse(readFileSync(new URL('../../firebase.collaudo.json', import.meta.url), 'utf8'))

// `firebase emulators:exec` dice dov'è l'emulatore con FIRESTORE_EMULATOR_HOST;
// lanciando vitest a mano con l'emulatore già acceso si legge la porta da
// firebase.collaudo.json (8082: la 8080 è quella di default di Firestore,
// spesso occupata, la 8081 quella di tana-drink sulla stessa macchina).
function indirizzo() {
  const dallAmbiente = process.env.FIRESTORE_EMULATOR_HOST
  if (dallAmbiente) {
    const [host, porta] = dallAmbiente.split(':')
    return { host: host === '0.0.0.0' ? '127.0.0.1' : host, port: Number(porta) }
  }
  return { host: COLLAUDO.emulators.firestore.host, port: COLLAUDO.emulators.firestore.port }
}

// Un progetto per file di prova: l'emulatore ne tiene tanti insieme, e così
// le regole e i dati di un file non si mescolano con quelli di un altro
// (per questo firebase.collaudo.json ha singleProjectMode: false).
export async function avviaAmbiente(nomeProgetto) {
  return initializeTestEnvironment({
    projectId: `regole-${nomeProgetto}`,
    firestore: { ...indirizzo(), rules: REGOLE },
  })
}

// Database vuoto: quello da cui parte ogni prova.
export async function azzera(env) {
  await env.clearFirestore()
}

// Un documento già scritto dalle Functions (Admin SDK, fuori dalle regole):
// il punto di partenza di ogni prova che non sia una create.
export async function semina(env, percorso, dati) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), percorso), dati))
}

// Chi bussa alla regia. Gli uid sono fissi, così le prove sui documenti
// «propri» e «altrui» si leggono: A legge il suo, A non legge quello di B.
// L'admin ha il claim `admin: true`, come in produzione (REQ-FLOTTA-005).
export const UID = Object.freeze({ a: 'cliente-a', b: 'cliente-b', admin: 'admin-1' })
export const EMAIL = Object.freeze({ a: 'a@locale.example', b: 'b@locale.example', admin: 'admin@regia.example' })

export const CHI = {
  anonimo: (env) => env.unauthenticatedContext().firestore(),
  clienteA: (env) => env.authenticatedContext(UID.a, { email: EMAIL.a, email_verified: true }).firestore(),
  clienteB: (env) => env.authenticatedContext(UID.b, { email: EMAIL.b, email_verified: true }).firestore(),
  admin: (env) => env.authenticatedContext(UID.admin, { email: EMAIL.admin, admin: true }).firestore(),
}

// I quattro attori di ogni riga della matrice collezione × attore × operazione.
export const ATTORI = Object.freeze(['anonimo', 'clienteA', 'clienteB', 'admin'])
