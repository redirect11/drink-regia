#!/usr/bin/env node
// =====================================================================
//  SEMINA (O RIPULISCE) I LOCALI DI PROVA SULLA REGIA DI TEST (REQ-DEV-004).
//
//    node scripts/semina-test.mjs --progetto drink-regia-test
//    node scripts/semina-test.mjs --progetto drink-regia-test --pulisci
//
//  L'utente, 07/11/2026: «sulla versione di test dovremmo creare un po' di
//  utenti che abbiano varie attivazioni del prodotto». Le persone stanno in
//  lib-semina.mjs; qui solo le scritture: gli account di Auth (email
//  verificata, una password sola per tutti, l'admin col suo claim), i
//  documenti di Firestore, e il file `.env.e2e` che i test Playwright
//  leggono (la configurazione web del progetto di test e la password).
//  La password non si stampa mai: sta nel file, che git ignora.
//
//  Credenziali: la sessione del Firebase CLI (`npx firebase-tools login`),
//  passata all'Admin SDK come refresh token: chi semina è Owner del
//  progetto di test. Niente chiavi.
//
//  SOLO SU UN PROGETTO DI TEST: il nome deve finire in «-test». Idempotente:
//  si rilancia e riscrive le stesse persone con le date di oggi. Con
//  --pulisci cancella tutto quello che porta `semina: true` e gli account
//  di prova, e niente altro.
// =====================================================================
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { accessToken, credenzialiCli, arg, flag } from './lib-firestore.js'
import { PERSONE, ADMIN, DOMINIO_SEMINA, emailDi, uidDi, documentoCliente, documentoIstanza, documentoRichiesta, documentiCassetto, documentiContatti, documentiSconti, movimentiDiProva, trafficoDiProva, postiFondatori, progettoAmmesso, passwordDiProva } from './lib-semina.mjs'

const require = createRequire(import.meta.url)
const { initializeApp, applicationDefault } = require('../functions/node_modules/firebase-admin/lib/app/index.js')
const { getAuth } = require('../functions/node_modules/firebase-admin/lib/auth/index.js')
const { getFirestore, FieldValue } = require('../functions/node_modules/firebase-admin/lib/firestore/index.js')

const PROGETTO = arg('progetto')
const PULISCI = flag('pulisci')
const FILE_ENV = arg('env-file', '.env.e2e')
if (!progettoAmmesso(PROGETTO)) {
  console.error('Uso: node scripts/semina-test.mjs --progetto <id che finisce in -test> [--pulisci] [--password <pwd>] [--env-file .env.e2e]')
  console.error('Solo su un progetto di test: la produzione non si semina.')
  process.exit(1)
}

// Firestore vuole le credenziali «application default», non un refresh token
// passato a mano: la sessione del CLI si scrive in un file temporaneo nel
// formato di gcloud (authorized_user, col progetto per la quota), si indica
// all'SDK e si cancella alla fine.
const cartellaCredenziali = mkdtempSync(join(tmpdir(), 'semina-'))
const fileCredenziali = join(cartellaCredenziali, 'adc.json')
writeFileSync(fileCredenziali, JSON.stringify({ ...credenzialiCli(), quota_project_id: PROGETTO }), { mode: 0o600 })
process.env.GOOGLE_APPLICATION_CREDENTIALS = fileCredenziali
process.on('exit', () => rmSync(cartellaCredenziali, { recursive: true, force: true }))

initializeApp({ credential: applicationDefault(), projectId: PROGETTO })
const auth = getAuth()
const db = getFirestore()
const ADESSO = new Date()
const log = (m) => console.log(`[semina] ${m}`)

// ── gli account ──
async function account({ uid, email, password, admin = false }) {
  const dati = { email, password, emailVerified: true, displayName: email.split('@')[0] }
  let u = await auth.getUser(uid).catch(() => null)
  if (!u) {
    // Lo stesso indirizzo con un altro uid (una semina vecchia): via, e si rifà.
    const omonimo = await auth.getUserByEmail(email).catch(() => null)
    if (omonimo) await auth.deleteUser(omonimo.uid)
    u = await auth.createUser({ uid, ...dati })
  } else {
    u = await auth.updateUser(uid, dati)
  }
  await auth.setCustomUserClaims(uid, admin ? { admin: true } : {})
  return u
}

// ── la configurazione web del progetto, per .env.e2e ──
async function configurazioneWeb() {
  const token = await accessToken()
  const h = { Authorization: `Bearer ${token}` }
  const elenco = await (await fetch(`https://firebase.googleapis.com/v1beta1/projects/${PROGETTO}/webApps`, { headers: h })).json()
  const app = (elenco.apps || [])[0]
  if (!app) throw new Error(`Il progetto ${PROGETTO} non ha un'app web: creala dalla console di Firebase.`)
  const cfg = await (await fetch(`https://firebase.googleapis.com/v1beta1/${app.name}/config`, { headers: h })).json()
  if (!cfg.apiKey) throw new Error(`La configurazione web di ${PROGETTO} non si legge: ${JSON.stringify(cfg).slice(0, 200)}`)
  return cfg
}

// La password: data, o quella di una semina precedente nel file, o nuova.
function password() {
  const data = arg('password')
  if (data) return data
  if (existsSync(FILE_ENV)) {
    const riga = readFileSync(FILE_ENV, 'utf8').split(/\r?\n/).find((r) => r.startsWith('E2E_PASSWORD='))
    if (riga) return riga.slice('E2E_PASSWORD='.length).trim()
  }
  return passwordDiProva(randomBytes(16))
}

function scriviEnv(cfg, pwd) {
  const righe = [
    '# Scritto da scripts/semina-test.mjs: la regia di test per i test Playwright (REQ-DEV-004).',
    '# Non si committa (.gitignore: .env.*). Rilanciare la semina lo riscrive.',
    `VITE_FIREBASE_API_KEY=${cfg.apiKey}`,
    `VITE_FIREBASE_AUTH_DOMAIN=${cfg.authDomain}`,
    `VITE_FIREBASE_PROJECT_ID=${cfg.projectId}`,
    `VITE_FIREBASE_APP_ID=${cfg.appId}`,
    `E2E_PROGETTO=${PROGETTO}`,
    `E2E_DOMINIO=${DOMINIO_SEMINA}`,
    `E2E_ADMIN=${emailDi(ADMIN.slug)}`,
    `E2E_PASSWORD=${pwd}`,
    '',
  ]
  writeFileSync(FILE_ENV, righe.join('\n'))
  log(`scritto ${FILE_ENV} (configurazione web di ${PROGETTO}, password delle persone)`)
}

// ── le scritture ──
async function semina() {
  const pwd = password()
  const cfg = await configurazioneWeb()
  log(`progetto ${PROGETTO}: ${PERSONE.length} persone più l'amministratore`)

  await account({ uid: uidDi(ADMIN.slug), email: emailDi(ADMIN.slug), password: pwd, admin: true })
  log(`admin: ${emailDi(ADMIN.slug)} (claim admin)`)

  let batch = db.batch()
  let nelBatch = 0
  const scrivi = async (ref, doc) => {
    batch.set(ref, doc)
    if (++nelBatch >= 400) {
      await batch.commit()
      batch = db.batch()
      nelBatch = 0
    }
  }

  for (const p of PERSONE) {
    await account({ uid: uidDi(p.slug), email: emailDi(p.slug), password: pwd })
    await scrivi(db.doc(`clienti/${uidDi(p.slug)}`), documentoCliente(p, ADESSO))
    const ist = documentoIstanza(p, ADESSO)
    if (ist) await scrivi(db.doc(`istanze/${p.slug}`), ist)
    else await db.doc(`istanze/${p.slug}`).delete().catch(() => {})
    const ric = documentoRichiesta(p, ADESSO)
    if (ric) await scrivi(db.doc(`richieste/${p.slug}`), ric)
    else await db.doc(`richieste/${p.slug}`).delete().catch(() => {})
    const c = documentiCassetto(p, ADESSO)
    if (c) {
      await scrivi(db.doc(`ai/${p.slug}`), c.cassetto)
      for (const [i, consumo] of c.consumi.entries()) await scrivi(db.doc(`ai/${p.slug}/consumi/semina-${i}`), consumo)
      for (const r of c.ricariche) {
        const { id, ...doc } = r
        await scrivi(db.doc(`ai/${p.slug}/ricariche/${id}`), doc)
      }
    }
    log(`${p.slug}: ${p.caso}`)
  }
  for (const c of documentiContatti(ADESSO)) {
    const { id, ...doc } = c
    await scrivi(db.doc(`contatti/${id}`), doc)
  }
  for (const s of documentiSconti(ADESSO)) await scrivi(db.doc(`sconti/${s.codice}`), s)
  const movimenti = movimentiDiProva(ADESSO)
  for (const m of movimenti) {
    const { id, ...doc } = m
    await scrivi(db.doc(`movimenti/${id}`), { ...doc, id })
  }
  const traffico = trafficoDiProva(ADESSO)
  for (const t of traffico) await scrivi(db.doc(`traffico/${t.giorno}`), t)
  await batch.commit()
  // I posti Fondatori: solo le chiavi delle persone, con merge, il resto resta.
  await db.doc('fondatori/posti').set({ assegnati: postiFondatori(ADESSO) }, { merge: true })
  log(`contatti, codici sconto, ${movimenti.length} movimenti, ${traffico.length} giorni di traffico, i posti Fondatori`)
  scriviEnv(cfg, pwd)
  log('fatto. I test: npm run test:e2e')
}

// ── la pulizia ──
async function pulisci() {
  log(`progetto ${PROGETTO}: via tutto quello che porta semina: true`)
  const collezioni = ['clienti', 'istanze', 'richieste', 'contatti', 'sconti', 'movimenti', 'traffico', 'ai']
  let cancellati = 0
  for (const nome of collezioni) {
    const snap = await db.collection(nome).where('semina', '==', true).get()
    for (const d of snap.docs) {
      // Le sotto-collezioni del cassetto AI, prima del documento.
      if (nome === 'ai') for (const sotto of ['consumi', 'ricariche']) for (const s of (await d.ref.collection(sotto).get()).docs) await s.ref.delete()
      await d.ref.delete()
      cancellati += 1
    }
    log(`${nome}: ${snap.size}`)
  }
  const posti = (await db.doc('fondatori/posti').get()).data()
  const via = Object.entries(posti?.assegnati || {}).filter(([, v]) => v?.semina === true).map(([uid]) => uid)
  if (via.length) await db.doc('fondatori/posti').update(Object.fromEntries(via.map((uid) => [`assegnati.${uid}`, FieldValue.delete()])))
  for (const slug of [ADMIN.slug, ...PERSONE.map((p) => p.slug)]) {
    const u = await auth.getUserByEmail(emailDi(slug)).catch(() => null)
    if (u) await auth.deleteUser(u.uid)
  }
  log(`fatto: ${cancellati} documenti, ${via.length} posti Fondatori, gli account di prova`)
}

await (PULISCI ? pulisci() : semina())
