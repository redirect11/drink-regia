// ── istanze/{slug} E richieste/{slug} SULLE REGOLE VERE (REQ-FLOTTA-005, REQ-FLOTTA-006, REQ-DEV-007, REQ-FLOTTA-086)
// REGOLE PROVATE: /istanze/{slug}, /richieste/{slug}
//
// L'istanza la scrive il provisioning o l'admin, il titolare la legge. La
// richiesta di attivazione la crea SOLO la Function chiediAttivazione (C2
// dell'audit del 22/10/2026: prima la creava il browser, senza controlli su
// slug e abbonamento): nessuna create dai client, a nessuna condizione,
// nemmeno dall'admin. Il titolare la legge, l'admin la autorizza, rifiuta o
// rilancia.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, onSnapshot } from 'firebase/firestore'
import { avviaAmbiente, azzera, semina, CHI, UID } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('istanze')
})
afterAll(async () => {
  await env?.cleanup()
})

const SLUG_A = 'bar-centrale-a'
const SLUG_B = 'osteria-del-porto-b'

// L'istanza e la richiesta di A e di B, come le lasciano le Functions.
beforeEach(async () => {
  await azzera(env)
  await semina(env, `istanze/${SLUG_A}`, { slug: SLUG_A, uid: UID.a, progetto: `drinkpos-${SLUG_A}`, stato: 'attiva' })
  await semina(env, `istanze/${SLUG_B}`, { slug: SLUG_B, uid: UID.b, progetto: `drinkpos-${SLUG_B}`, stato: 'attiva' })
  await semina(env, `richieste/${SLUG_A}`, { slug: SLUG_A, uid: UID.a, stato: 'in_attesa', chiesta_il: '2026-11-09T10:00:00.000Z' })
  await semina(env, `richieste/${SLUG_B}`, { slug: SLUG_B, uid: UID.b, stato: 'in_attesa', chiesta_il: '2026-11-09T10:00:00.000Z' })
})

describe.each([
  ['istanze', 'l’istanza'],
  ['richieste', 'la richiesta di attivazione'],
])('%s/{slug}: la lettura', (collezione, cosa) => {
  it(`il titolare legge ${cosa} del suo locale`, async () => {
    await assertSucceeds(getDoc(doc(CHI.clienteA(env), `${collezione}/${SLUG_A}`)))
  })

  it(`il titolare non legge ${cosa} di un altro locale`, async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), `${collezione}/${SLUG_B}`)))
  })

  it('il titolare elenca solo quelle col suo uid: l’elenco intero è dell’admin', async () => {
    await assertSucceeds(getDocs(query(collection(CHI.clienteA(env), collezione), where('uid', '==', UID.a))))
    await assertFails(getDocs(collection(CHI.clienteA(env), collezione)))
  })

  it('chi non ha fatto l’accesso non legge niente', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), `${collezione}/${SLUG_A}`)))
  })

  it('l’admin legge tutto, una per una e in elenco', async () => {
    await assertSucceeds(getDoc(doc(CHI.admin(env), `${collezione}/${SLUG_A}`)))
    await assertSucceeds(getDocs(collection(CHI.admin(env), collezione)))
  })

  // REQ-FLOTTA-086. Per slug, un documento che non c'è è negato come quello
  // di un altro (provato il 13/11/2026), e l'ascolto si ferma. Le regole
  // restano queste (Daniele, 13/11/2026: «serve una soluzione piu sicura e
  // piu robusta»): la dashboard ascolta la query sul suo uid.
  it(`per un cliente nuovo la query sul suo uid torna vuota, senza errore (${cosa})`, async () => {
    const nuovo = env.authenticatedContext('cliente-nuovo', { email: 'nuovo@locale.example', email_verified: true }).firestore()
    const letti = await assertSucceeds(getDocs(query(collection(nuovo, collezione), where('uid', '==', 'cliente-nuovo'), limit(2))))
    expect(letti.size).toBe(0)
  })

  it(`l’ascolto della query sul suo uid riceve ${cosa} creata dopo, e non quella di un altro`, async () => {
    // Il titolare A non ha ancora niente: com'è prima di «Attiva».
    await azzera(env)
    const fotografie = []
    let avvisa = () => {}
    const aspetta = (vale) =>
      new Promise((ok, ko) => {
        const timer = setTimeout(() => ko(new Error(`fotografie arrivate: ${JSON.stringify(fotografie.map(String))}`)), 5000)
        avvisa = () => {
          if (vale()) {
            clearTimeout(timer)
            ok()
          }
        }
        avvisa()
      })
    const stop = onSnapshot(
      query(collection(CHI.clienteA(env), collezione), where('uid', '==', UID.a), limit(2)),
      (s) => {
        fotografie.push(s.docs.map((d) => d.id).sort())
        avvisa()
      },
      (e) => {
        fotografie.push(e)
        avvisa()
      }
    )
    try {
      await aspetta(() => fotografie.length >= 1)
      expect(fotografie[0]).toEqual([])
      await semina(env, `${collezione}/${SLUG_B}`, { slug: SLUG_B, uid: UID.b, stato: 'in corso' })
      await semina(env, `${collezione}/locale-nuovo`, { slug: 'locale-nuovo', uid: UID.a, stato: 'in corso' })
      await aspetta(() => JSON.stringify(fotografie.at(-1)) === JSON.stringify(['locale-nuovo']))
      expect(fotografie.some((f) => f instanceof Error)).toBe(false)
      expect(fotografie.flat()).not.toContain(SLUG_B)
    } finally {
      stop()
    }
  })
})

describe('istanze/{slug}: la scrittura', () => {
  it('il titolare non crea, non cambia e non cancella la sua istanza: la scrive il provisioning', async () => {
    const db = CHI.clienteA(env)
    await assertFails(setDoc(doc(db, 'istanze/nuovo-locale'), { slug: 'nuovo-locale', uid: UID.a, stato: 'attiva' }))
    await assertFails(updateDoc(doc(db, `istanze/${SLUG_A}`), { stato: 'attiva', url: 'https://altrove.example' }))
    await assertFails(deleteDoc(doc(db, `istanze/${SLUG_A}`)))
  })

  it('un altro titolare e chi non ha fatto l’accesso nemmeno', async () => {
    await assertFails(updateDoc(doc(CHI.clienteB(env), `istanze/${SLUG_A}`), { stato: 'errore' }))
    await assertFails(setDoc(doc(CHI.anonimo(env), 'istanze/nuovo-locale'), { slug: 'nuovo-locale', uid: UID.a }))
  })

  it('l’admin registra, cambia e cancella un’istanza dal backoffice', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(setDoc(doc(db, 'istanze/locale-esistente'), { slug: 'locale-esistente', uid: UID.b, stato: 'attiva', origine: 'esistente' }))
    await assertSucceeds(updateDoc(doc(db, `istanze/${SLUG_A}`), { stato: 'sospesa' }))
    await assertSucceeds(deleteDoc(doc(db, `istanze/${SLUG_A}`)))
  })
})

describe('richieste/{slug}: la scrittura', () => {
  it('nessuno crea una richiesta dal browser, nemmeno l’admin: solo la Function chiediAttivazione (C2)', async () => {
    const richiesta = { slug: 'nuovo-locale', uid: UID.a, stato: 'in_coda', chiesta_il: '2026-11-09T10:00:00.000Z' }
    await assertFails(setDoc(doc(CHI.clienteA(env), 'richieste/nuovo-locale'), richiesta))
    await assertFails(setDoc(doc(CHI.clienteA(env), `richieste/${SLUG_B}-bis`), { ...richiesta, slug: SLUG_B }))
    await assertFails(setDoc(doc(CHI.anonimo(env), 'richieste/nuovo-locale'), richiesta))
    await assertFails(setDoc(doc(CHI.admin(env), 'richieste/nuovo-locale'), richiesta))
  })

  it('il titolare non autorizza la sua richiesta né la cancella', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `richieste/${SLUG_A}`), { stato: 'in_coda', autorizzata_il: '2026-11-09T10:00:00.000Z' }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `richieste/${SLUG_A}`)))
  })

  it('l’admin la autorizza, la rifiuta, la rilancia o la cancella', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(updateDoc(doc(db, `richieste/${SLUG_A}`), { stato: 'in_coda', autorizzata_il: '2026-11-09T10:00:00.000Z' }))
    await assertSucceeds(updateDoc(doc(db, `richieste/${SLUG_B}`), { stato: 'errore', errore: 'Richiesta rifiutata', rifiutata_il: '2026-11-09T10:00:00.000Z' }))
    await assertSucceeds(deleteDoc(doc(db, `richieste/${SLUG_B}`)))
  })
})
