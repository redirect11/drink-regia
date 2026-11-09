// ── impostazioni/{doc} SULLE REGOLE VERE (REQ-FLOTTA-011, REQ-DEV-007) ───
// REGOLE PROVATE: /impostazioni/{doc}
//
// Le impostazioni della regia: il deploy automatico (impostazioni/regia),
// le regole degli aggiornamenti a scelta (impostazioni/aggiornamenti). Le
// scrive l'admin dal backoffice.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { avviaAmbiente, azzera, semina, CHI, EMAIL } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('impostazioni')
})
afterAll(async () => {
  await env?.cleanup()
})

const REGIA = { deploy_automatico: true, giorni_grazia: 7, aggiornate_il: '2026-11-01T10:00:00.000Z' }
const AGGIORNAMENTI = { proponi_sempre: false, cambiato_il: '2026-11-01T10:00:00.000Z', cambiato_da: EMAIL.admin }

beforeEach(async () => {
  await azzera(env)
  await semina(env, 'impostazioni/regia', REGIA)
  await semina(env, 'impostazioni/aggiornamenti', AGGIORNAMENTI)
})

describe('impostazioni/{doc}: la lettura', () => {
  it('l’admin legge le impostazioni, una e in elenco', async () => {
    await assertSucceeds(getDoc(doc(CHI.admin(env), 'impostazioni/regia')))
    await assertSucceeds(getDocs(collection(CHI.admin(env), 'impostazioni')))
  })

  it('chi non ha fatto l’accesso non le legge', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), 'impostazioni/regia')))
  })

  // SOLO L'ADMIN (REQ-FLOTTA-057, audit del 09/11/2026, finding 28): prima
  // le leggeva ogni autenticato, e un titolare qualunque vedeva se il deploy
  // automatico è acceso e i giorni di grazia dei pagamenti a mano. La
  // dashboard del titolare non le usa; le legge solo il backoffice.
  it('un titolare non le legge: sono informazioni interne della regia', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), 'impostazioni/regia')))
    await assertFails(getDoc(doc(CHI.clienteB(env), 'impostazioni/aggiornamenti')))
  })
})

describe('impostazioni/{doc}: la scrittura', () => {
  it('l’admin accende il deploy automatico e cambia le regole degli aggiornamenti', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(setDoc(doc(db, 'impostazioni/regia'), { deploy_automatico: false, aggiornate_il: '2026-11-09T10:00:00.000Z' }, { merge: true }))
    await assertSucceeds(setDoc(doc(db, 'impostazioni/aggiornamenti'), { ...AGGIORNAMENTI, proponi_sempre: true }))
    await assertSucceeds(deleteDoc(doc(db, 'impostazioni/aggiornamenti')))
  })

  it('un titolare non le scrive, e nemmeno chi non ha fatto l’accesso', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), 'impostazioni/regia'), { deploy_automatico: false }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), 'impostazioni/regia'), { giorni_grazia: 365 }))
    await assertFails(setDoc(doc(CHI.clienteB(env), 'impostazioni/nuova'), { x: 1 }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), 'impostazioni/regia')))
    await assertFails(updateDoc(doc(CHI.anonimo(env), 'impostazioni/regia'), { deploy_automatico: false }))
  })
})
