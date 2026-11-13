// =====================================================================
//  SCRIVE LA LICENZA E L'IDENTITÀ DI UN'ISTANZA appena creata o aggiornata.
//
//    node scripts/licenza-istanza.mjs --project drinkpos-bar-mario \
//         --slug bar-mario --nome "Bar Mario" --piano base --moduli staff,magazzino \
//         --regia https://drink-regia.web.app
//
//  Lo lancia il workflow provisiona-istanza.yml (REQ-FLOTTA-006) PRIMA del
//  deploy, appena c'è il database: ogni locale ha licenza/attuale prima di
//  ricevere l'app (tana-drink, 01/11/2026). Con le credenziali
//  (GOOGLE_APPLICATION_CREDENTIALS) del service account di provisioning.
//  Scrive la licenza in licenza/attuale, che l'app legge e nessuno
//  dall'app scrive (BUG-125 di tana-drink), e finché tutti i
//  locali non hanno l'app nuova anche in settings/bar. Un locale nuovo
//  nasce con licenza/attuale: con l'app nuova, senza, mostra «non attivata».
//  Le Functions la riscrivono intera all'esito dell'attivazione. Cosa scrivere lo decide
//  licenzaIniziale in functions/lib/licenza.js: la stessa mappa piano →
//  moduli che le Functions usano quando il piano cambia, non una copia.
//  Prima stava in tana-drink/scripts/licenza-istanza.mjs, con la mappa
//  ricopiata a mano.
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'

const require = createRequire(import.meta.url)
// firebase-admin sta nelle dipendenze delle Functions: si prende da lì.
const { initializeApp } = require('../functions/node_modules/firebase-admin/lib/app/index.js')
const { getFirestore } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js')
const { licenzaIniziale } = require('../functions/lib/licenza.js')

const PROGETTO = arg('project')
const SLUG = arg('slug')
const NOME = arg('nome', SLUG)
const PIANO = arg('piano', 'base')
const MODULI = (arg('moduli', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
// I temi in licenza (REQ-FLOTTA-039): di norma nessuno alla prima licenza;
// poi li riscrivono le Functions dal cliente.
const TEMI = (arg('temi', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const REGIA_URL = arg('regia', process.env.REGIA_URL || '')
if (!PROGETTO || !SLUG || !REGIA_URL) {
  console.error('Uso: node scripts/licenza-istanza.mjs --project <id> --slug <slug> --regia <url> [--nome …] [--piano …] [--moduli a,b] [--temi x,y]')
  process.exit(1)
}

initializeApp({ projectId: PROGETTO })
const db = getFirestore()
const [bar, protetta] = await Promise.all([db.doc('settings/bar').get(), db.doc('licenza/attuale').get()])
// Si parte da licenza/attuale, mai da settings/bar.licenza: lì la può aver
// riscritta un bartender (BUG-125). Da settings/bar solo il nome del locale.
const patch = licenzaIniziale({ ...(bar.exists ? bar.data() : {}), licenza: protetta.exists ? protetta.data() : undefined }, { piano: PIANO, moduli: MODULI, temi: TEMI, slug: SLUG, nome: NOME, regiaUrl: REGIA_URL })
await db.doc('licenza/attuale').set(patch.licenza)
await db.doc('settings/bar').set(patch, { merge: true })
const accesi = Object.entries(patch.licenza.moduli).filter(([, v]) => v).map(([m]) => m)
console.log(`[licenza] ✓ ${PROGETTO}: piano ${patch.licenza.piano}, moduli app ${accesi.join(', ') || 'nessuno'}, stato ${patch.licenza.stato}`)
