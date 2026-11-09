// ── LA VENDITA E I CONTATTI SULLE REGOLE VERE (REQ-FLOTTA-015, REQ-FLOTTA-017, REQ-DEV-007)
// REGOLE PROVATE: /vendita/{doc}, /vendita/{doc}/storico/{voce}, /contatti/{uid}
//
// Cosa è in vendita lo legge anche chi non ha fatto l'accesso (la prima
// pagina mostra il Free solo se lo è); lo cambia solo l'admin, e ogni cambio
// resta nello storico, che non si riscrive. Le richieste di contatto coi
// pagamenti spenti le scrive la Function chiediContatto; il titolare legge
// la sua, l'admin le segna gestite e non tocca altro.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { avviaAmbiente, azzera, semina, CHI, UID, EMAIL } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('vendita')
})
afterAll(async () => {
  await env?.cleanup()
})

const LISTINO = { free: true, pagamenti: true, aggiornata_il: '2026-11-01T10:00:00.000Z', aggiornata_da: EMAIL.admin }
const VOCE = { cambio: { free: false }, il: '2026-11-01T10:00:00.000Z', da: EMAIL.admin }
const CONTATTO = (uid, email) => ({ uid, email, nome_locale: 'Bar Centrale', piano: 'base', messaggio: 'Vorrei attivare', stato: 'nuova', chiesta_il: '2026-11-09T10:00:00.000Z' })

beforeEach(async () => {
  await azzera(env)
  await semina(env, 'vendita/listino', LISTINO)
  await semina(env, 'vendita/listino/storico/v1', VOCE)
  await semina(env, `contatti/${UID.a}`, CONTATTO(UID.a, EMAIL.a))
  await semina(env, `contatti/${UID.b}`, CONTATTO(UID.b, EMAIL.b))
})

describe('vendita/{doc}: il listino', () => {
  it('lo legge chi non ha fatto l’accesso: la prima pagina deve sapere cosa è in vendita', async () => {
    await assertSucceeds(getDoc(doc(CHI.anonimo(env), 'vendita/listino')))
  })

  it('lo leggono il titolare e l’admin', async () => {
    await assertSucceeds(getDoc(doc(CHI.clienteA(env), 'vendita/listino')))
    await assertSucceeds(getDoc(doc(CHI.admin(env), 'vendita/listino')))
  })

  it('lo cambia solo l’admin', async () => {
    await assertSucceeds(setDoc(doc(CHI.admin(env), 'vendita/listino'), { ...LISTINO, free: false }, { merge: true }))
    await assertFails(setDoc(doc(CHI.clienteA(env), 'vendita/listino'), { ...LISTINO, free: false }, { merge: true }))
    await assertFails(updateDoc(doc(CHI.anonimo(env), 'vendita/listino'), { free: false }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), 'vendita/listino')))
  })
})

describe('vendita/{doc}/storico/{voce}: lo storico dei cambi', () => {
  it('l’admin lo legge e aggiunge una voce a ogni cambio', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(getDocs(query(collection(db, 'vendita/listino/storico'), orderBy('il', 'desc'))))
    await assertSucceeds(addDoc(collection(db, 'vendita/listino/storico'), { ...VOCE, il: '2026-11-09T10:00:00.000Z' }))
  })

  it('nemmeno l’admin riscrive o cancella una voce: lo storico non si corregge', async () => {
    await assertFails(updateDoc(doc(CHI.admin(env), 'vendita/listino/storico/v1'), { cambio: { free: true } }))
    await assertFails(deleteDoc(doc(CHI.admin(env), 'vendita/listino/storico/v1')))
  })

  it('il titolare e chi non ha fatto l’accesso non lo leggono né lo scrivono', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), 'vendita/listino/storico/v1')))
    await assertFails(getDocs(collection(CHI.anonimo(env), 'vendita/listino/storico')))
    await assertFails(addDoc(collection(CHI.clienteA(env), 'vendita/listino/storico'), VOCE))
  })
})

describe('contatti/{uid}: le richieste di contatto', () => {
  it('il titolare legge la sua richiesta, non quella di un altro, e non l’elenco', async () => {
    await assertSucceeds(getDoc(doc(CHI.clienteA(env), `contatti/${UID.a}`)))
    await assertFails(getDoc(doc(CHI.clienteA(env), `contatti/${UID.b}`)))
    await assertFails(getDocs(collection(CHI.clienteA(env), 'contatti')))
  })

  it('chi non ha fatto l’accesso non legge niente', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), `contatti/${UID.a}`)))
  })

  it('l’admin legge tutte le richieste', async () => {
    await assertSucceeds(getDocs(query(collection(CHI.admin(env), 'contatti'), orderBy('chiesta_il', 'desc'))))
  })

  it('nessuno crea una richiesta dal browser, nemmeno l’admin: la scrive la Function chiediContatto', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), 'contatti/nuovo-uid'), CONTATTO('nuovo-uid', EMAIL.a)))
    await assertFails(setDoc(doc(CHI.anonimo(env), 'contatti/nuovo-uid'), CONTATTO('nuovo-uid', EMAIL.a)))
    await assertFails(setDoc(doc(CHI.admin(env), 'contatti/nuovo-uid'), CONTATTO('nuovo-uid', EMAIL.a)))
  })

  it('l’admin la segna gestita (stato, gestita_il, gestita_da) e non cambia altro', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(updateDoc(doc(db, `contatti/${UID.a}`), { stato: 'gestita', gestita_il: '2026-11-09T11:00:00.000Z', gestita_da: EMAIL.admin }))
    await assertFails(updateDoc(doc(db, `contatti/${UID.b}`), { messaggio: 'riscritto' }))
    await assertFails(updateDoc(doc(db, `contatti/${UID.b}`), { stato: 'gestita', piano: 'completo' }))
  })

  it('il titolare non cambia la sua richiesta e nessuno la cancella', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `contatti/${UID.a}`), { stato: 'gestita' }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `contatti/${UID.a}`)))
    await assertFails(deleteDoc(doc(CHI.admin(env), `contatti/${UID.a}`)))
  })
})
