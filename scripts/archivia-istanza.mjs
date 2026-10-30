// =====================================================================
//  IL BACKUP LEGGIBILE DI UN'ISTANZA, prima che si elimini.
//
//    node scripts/archivia-istanza.mjs --project drinkpos-bar-mario --slug bar-mario --out archivio/
//
//  Lo lancia elimina-istanza.yml (REQ-FLOTTA-014) come primo passo, prima
//  di toccare qualunque cosa. Scrive in --out:
//    dati.json      TUTTE le collezioni e sottocollezioni del database, coi
//                   tipi di Firestore scritti per esteso (date, riferimenti,
//                   coordinate, byte), così si rileggono senza Firestore;
//    utenti.json    gli utenti di Firebase Auth del locale, SENZA password
//                   né hash: l'archivio lo scarica il titolare, e una
//                   password non è un suo dato da portarsi via;
//    file/          ogni file dello Storage, con il suo percorso;
//    manifesto.json progetto, data, conteggi e dimensioni: è quello che il
//                   workflow confronta con l'archivio caricato prima di
//                   eliminare.
//  È il formato che il titolare apre (portabilità, GDPR art. 20). Per il
//  ripristino il workflow fa in più l'export nativo di Firestore.
//
//  Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service account di
//  provisioning (firebase-admin dalle dipendenze delle Functions).
// =====================================================================
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { arg } from './lib-firestore.js'

const require = createRequire(import.meta.url)
const { initializeApp } = require('../functions/node_modules/firebase-admin/lib/app/index.js')
const { getFirestore, Timestamp, GeoPoint, DocumentReference } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js')
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js')
const { getStorage } = require('../functions/node_modules/firebase-admin/lib/storage/index.js')

const PROGETTO = arg('project')
const SLUG = arg('slug')
const OUT = arg('out', 'archivio')
// L'export nativo il workflow lo scrive nel bucket stesso, sotto questo
// prefisso: non è un file del locale, e non si copia due volte.
const ESCLUSO = arg('escludi', '_backup-eliminazione/')
if (!PROGETTO || !SLUG) {
  console.error('Uso: node scripts/archivia-istanza.mjs --project <id> --slug <slug> [--out cartella]')
  process.exit(1)
}

initializeApp({ projectId: PROGETTO, storageBucket: `${PROGETTO}.firebasestorage.app` })
const db = getFirestore()

// Un valore di Firestore in JSON, senza perdere il tipo.
function valore(v) {
  if (v instanceof Timestamp) return { __tipo: 'data', valore: v.toDate().toISOString() }
  if (v instanceof GeoPoint) return { __tipo: 'coordinate', lat: v.latitude, lng: v.longitude }
  if (v instanceof DocumentReference) return { __tipo: 'riferimento', percorso: v.path }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __tipo: 'byte', base64: Buffer.from(v).toString('base64') }
  if (Array.isArray(v)) return v.map(valore)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valore(x)]))
  return v
}

const conteggi = { collezioni: 0, documenti: 0, utenti: 0, file: 0 }

async function collezione(ref) {
  conteggi.collezioni++
  const out = {}
  for (const d of (await ref.get()).docs) {
    conteggi.documenti++
    const sotto = {}
    for (const c of await d.ref.listCollections()) sotto[c.id] = await collezione(c)
    out[d.id] = { dati: valore(d.data()), ...(Object.keys(sotto).length ? { sottocollezioni: sotto } : {}) }
  }
  // Documenti che esistono solo come genitori di sottocollezioni.
  for (const d of await ref.listDocuments()) {
    if (out[d.id]) continue
    const sotto = {}
    for (const c of await d.listCollections()) sotto[c.id] = await collezione(c)
    if (Object.keys(sotto).length) out[d.id] = { dati: null, sottocollezioni: sotto }
  }
  return out
}

mkdirSync(OUT, { recursive: true })

const dati = {}
for (const c of await db.listCollections()) dati[c.id] = await collezione(c)
writeFileSync(join(OUT, 'dati.json'), JSON.stringify(dati, null, 1))

const utenti = []
let pagina
do {
  const r = await getAuth().listUsers(1000, pagina)
  for (const u of r.users) {
    utenti.push({
      uid: u.uid, email: u.email || null, nome: u.displayName || null, telefono: u.phoneNumber || null,
      disabilitato: u.disabled, claim: u.customClaims || null,
      creato_il: u.metadata.creationTime, ultimo_accesso: u.metadata.lastSignInTime,
      accessi: (u.providerData || []).map((p) => p.providerId),
    })
  }
  pagina = r.pageToken
} while (pagina)
conteggi.utenti = utenti.length
writeFileSync(join(OUT, 'utenti.json'), JSON.stringify(utenti, null, 1))

let byteFile = 0
const bucket = getStorage().bucket()
const [esiste] = await bucket.exists()
if (esiste) {
  const [files] = await bucket.getFiles()
  for (const f of files) {
    if (f.name.endsWith('/') || f.name.startsWith(ESCLUSO)) continue
    const dest = join(OUT, 'file', f.name)
    mkdirSync(dirname(dest), { recursive: true })
    await f.download({ destination: dest })
    conteggi.file++
    byteFile += Number(f.metadata.size) || 0
  }
}

const manifesto = { progetto: PROGETTO, slug: SLUG, creato_il: new Date().toISOString(), conteggi, byte_file: byteFile, storage: esiste ? bucket.name : null }
writeFileSync(join(OUT, 'manifesto.json'), JSON.stringify(manifesto, null, 1))
console.log(`[archivio] ✓ ${PROGETTO}: ${conteggi.documenti} documenti in ${conteggi.collezioni} collezioni, ${conteggi.utenti} utenti, ${conteggi.file} file`)
