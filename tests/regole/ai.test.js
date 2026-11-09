// ── IL CASSETTO AI SULLE REGOLE VERE (REQ-AI-003, REQ-DEV-007) ───────────
// REGOLE PROVATE: /ai/{slug}, /ai/{slug}/consumi/{id}, /ai/{slug}/ricariche/{id}, /ai/{slug}/riservato/{doc}
//
// Credito, tetto, speso del mese, consumi e ricariche di un'installazione:
// li scrivono solo le Functions, il titolare li legge, l'admin pure. In
// `riservato` sta l'impronta della chiave dell'installazione: quella non la
// legge nessuno dal browser, nemmeno l'admin.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, orderBy, limit } from 'firebase/firestore'
import { avviaAmbiente, azzera, semina, CHI, UID } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('ai')
})
afterAll(async () => {
  await env?.cleanup()
})

const SLUG_A = 'bar-centrale-a'
const SLUG_B = 'osteria-del-porto-b'

beforeEach(async () => {
  await azzera(env)
  for (const [slug, uid] of [[SLUG_A, UID.a], [SLUG_B, UID.b]]) {
    await semina(env, `ai/${slug}`, { uid, slug, credito: 10, tetto_mensile: 20, speso_mese: 1.5 })
    await semina(env, `ai/${slug}/consumi/c1`, { il: '2026-11-09T10:00:00.000Z', tipo: 'descrizione', costo: 0.02 })
    await semina(env, `ai/${slug}/ricariche/r1`, { il: '2026-11-01T10:00:00.000Z', importo: 10, esito: 'accreditata' })
    await semina(env, `ai/${slug}/riservato/chiave`, { impronta: 'sha256:0000', creata_il: '2026-11-01T10:00:00.000Z' })
  }
})

describe('ai/{slug}: il cassetto', () => {
  it('il titolare legge il cassetto del suo locale', async () => {
    await assertSucceeds(getDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}`)))
  })

  it('il titolare non legge il cassetto di un altro locale, né l’elenco', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), `ai/${SLUG_B}`)))
    await assertFails(getDocs(collection(CHI.clienteA(env), 'ai')))
  })

  it('chi non ha fatto l’accesso non legge niente', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), `ai/${SLUG_A}`)))
  })

  it('l’admin legge ogni cassetto e l’elenco', async () => {
    await assertSucceeds(getDoc(doc(CHI.admin(env), `ai/${SLUG_A}`)))
    await assertSucceeds(getDocs(collection(CHI.admin(env), 'ai')))
  })

  it('nessuno scrive il cassetto dal browser: il titolare non si ricarica il credito, l’admin passa dalle Functions', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}`), { credito: 1000 }))
    await assertFails(setDoc(doc(CHI.clienteA(env), 'ai/nuovo-locale'), { uid: UID.a, credito: 1000 }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}`)))
    await assertFails(updateDoc(doc(CHI.admin(env), `ai/${SLUG_A}`), { credito: 1000 }))
    await assertFails(setDoc(doc(CHI.anonimo(env), 'ai/nuovo-locale'), { uid: UID.a, credito: 1000 }))
  })
})

describe.each([
  ['consumi', 'c1', 'i consumi'],
  ['ricariche', 'r1', 'le ricariche'],
])('ai/{slug}/%s/{id}', (sotto, id, cosa) => {
  it(`il titolare legge ${cosa} del suo cassetto, uno e in elenco`, async () => {
    const db = CHI.clienteA(env)
    await assertSucceeds(getDoc(doc(db, `ai/${SLUG_A}/${sotto}/${id}`)))
    await assertSucceeds(getDocs(query(collection(db, `ai/${SLUG_A}/${sotto}`), orderBy('il', 'desc'), limit(50))))
  })

  it(`il titolare non legge ${cosa} di un altro cassetto`, async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), `ai/${SLUG_B}/${sotto}/${id}`)))
    await assertFails(getDocs(collection(CHI.clienteA(env), `ai/${SLUG_B}/${sotto}`)))
  })

  it(`chi non ha fatto l’accesso non legge ${cosa}`, async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), `ai/${SLUG_A}/${sotto}/${id}`)))
  })

  it(`l’admin legge ${cosa} di tutti`, async () => {
    await assertSucceeds(getDocs(collection(CHI.admin(env), `ai/${SLUG_A}/${sotto}`)))
    await assertSucceeds(getDocs(collection(CHI.admin(env), `ai/${SLUG_B}/${sotto}`)))
  })

  it(`nessuno scrive ${cosa} dal browser`, async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}/${sotto}/nuovo`), { il: '2026-11-09T10:00:00.000Z', importo: 100 }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}/${sotto}/${id}`)))
    await assertFails(setDoc(doc(CHI.admin(env), `ai/${SLUG_A}/${sotto}/nuovo`), { il: '2026-11-09T10:00:00.000Z', importo: 100 }))
  })
})

describe('ai/{slug}/riservato/{doc}: l’impronta della chiave', () => {
  it('non la legge nessuno dal browser: né il titolare, né l’admin, né chi non ha fatto l’accesso', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}/riservato/chiave`)))
    await assertFails(getDocs(collection(CHI.clienteA(env), `ai/${SLUG_A}/riservato`)))
    await assertFails(getDoc(doc(CHI.admin(env), `ai/${SLUG_A}/riservato/chiave`)))
    await assertFails(getDoc(doc(CHI.anonimo(env), `ai/${SLUG_A}/riservato/chiave`)))
  })

  it('non la scrive nessuno dal browser', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `ai/${SLUG_A}/riservato/chiave`), { impronta: 'sha256:ffff' }))
    await assertFails(updateDoc(doc(CHI.admin(env), `ai/${SLUG_A}/riservato/chiave`), { impronta: 'sha256:ffff' }))
    await assertFails(deleteDoc(doc(CHI.admin(env), `ai/${SLUG_A}/riservato/chiave`)))
  })
})
