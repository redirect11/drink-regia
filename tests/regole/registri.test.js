// ── I REGISTRI DELLA REGIA SULLE REGOLE VERE (REQ-DEV-007) ───────────────
// REGOLE PROVATE: /rilasci/{tag}, /eventi_stripe/{id}, /fondatori/{doc}, /controlli/{doc}, /temi/{id}, /stili/{id}, /sconti/{codice}, /movimenti/{id}, /traffico/{giorno}, /passaggi/{impronta}
//
// Le collezioni che scrivono solo le Functions e legge solo l'admin: i
// rilasci a ondate (REQ-FLOTTA-012), il registro degli eventi di Stripe
// (REQ-FLOTTA-036), i posti Fondatori (REQ-FLOTTA-021), i controlli delle
// licenze, il catalogo dei temi (REQ-FLOTTA-032) e degli stili
// (REQ-FLOTTA-034), i codici sconto (REQ-FLOTTA-028), il libro dei
// movimenti (REQ-FLOTTA-041) e il traffico del sito (REQ-FLOTTA-042). Un
// titolare non li vede: dentro ci sono gli slug e i soldi degli altri
// locali. Un client che li scrivesse varrebbe un posto Fondatore regalato,
// un evento di Stripe rifatto, un incasso inventato.
// I passaggi fra la regia e l'app (REQ-FLOTTA-030) sono codici monouso: non
// li legge e non li scrive nessuno dal browser, nemmeno l'admin.
// Stessa matrice per tutte: ogni attore, ogni operazione.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { avviaAmbiente, azzera, semina, CHI, UID } from './ambiente.js'

let env

beforeAll(async () => {
  env = await avviaAmbiente('registri')
})
afterAll(async () => {
  await env?.cleanup()
})

// Collezione, un documento com'è davvero, e chi lo scrive in produzione.
const SOLO_ADMIN_LEGGE = [
  ['rilasci', 'v0.3.0', { tag: 'v0.3.0', stato: 'in_corso', ondate: [] }, 'la Function gestisciRilascio'],
  ['eventi_stripe', 'evt_1', { tipo: 'invoice.paid', creato: 1762682400, elaborato_il: '2026-11-09T10:00:00.000Z' }, 'il webhook di Stripe'],
  ['fondatori', 'posti', { totali: 20, presi: 3 }, 'le Functions, in transazione'],
  ['controlli', 'licenze', { controllato_il: '2026-11-09T10:00:00.000Z', locali: { 'bar-centrale-a': 'ok' } }, 'le Functions'],
  ['temi', 'notte', { id: 'notte', stato: 'pubblicato', aggiornato_il: '2026-11-09T10:00:00.000Z' }, 'le Functions'],
  ['stili', 'osteria', { id: 'osteria', stato: 'pubblicato', aggiornato_il: '2026-11-09T10:00:00.000Z' }, 'le Functions'],
  ['sconti', 'FONDATORI100', { percentuale: 100, usi: 0, creato_il: '2026-11-09T10:00:00.000Z' }, 'le Functions'],
  ['movimenti', 'm1', { tipo: 'fattura', importo: 29, uid: UID.a, il: '2026-11-09T10:00:00.000Z' }, 'il webhook e l’admin via Function'],
  ['traffico', '2026-11-09', { giorno: '2026-11-09', viste: 12, registrazioni: 1 }, 'la Function traccia'],
]

describe.each(SOLO_ADMIN_LEGGE)('%s/{id}', (collezione, id, documento, chiScrive) => {
  const percorso = `${collezione}/${id}`
  beforeEach(async () => {
    await azzera(env)
    await semina(env, percorso, documento)
  })

  it('l’admin legge il documento e l’elenco', async () => {
    await assertSucceeds(getDoc(doc(CHI.admin(env), percorso)))
    await assertSucceeds(getDocs(collection(CHI.admin(env), collezione)))
  })

  it('un titolare non legge niente, nemmeno un documento che parla di lui', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), percorso)))
    await assertFails(getDocs(collection(CHI.clienteA(env), collezione)))
    await assertFails(getDoc(doc(CHI.clienteB(env), percorso)))
  })

  it('chi non ha fatto l’accesso non legge niente', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), percorso)))
  })

  it(`nessuno scrive dal browser, nemmeno l’admin: scrive ${chiScrive}`, async () => {
    for (const attore of ['anonimo', 'clienteA', 'clienteB', 'admin']) {
      const db = CHI[attore](env)
      await assertFails(setDoc(doc(db, `${collezione}/nuovo`), documento))
      await assertFails(updateDoc(doc(db, percorso), { toccato: true }))
      await assertFails(deleteDoc(doc(db, percorso)))
    }
  })
})

describe('passaggi/{impronta}: i codici monouso fra la regia e l’app', () => {
  const CODICE = { uid: UID.a, slug: 'bar-centrale-a', scade_il: '2026-11-09T10:01:00.000Z' }
  beforeEach(async () => {
    await azzera(env)
    await semina(env, 'passaggi/impronta-1', CODICE)
  })

  it('non li legge nessuno dal browser: né il titolare a cui appartengono, né l’admin', async () => {
    for (const attore of ['anonimo', 'clienteA', 'clienteB', 'admin']) {
      await assertFails(getDoc(doc(CHI[attore](env), 'passaggi/impronta-1')))
      await assertFails(getDocs(collection(CHI[attore](env), 'passaggi')))
    }
  })

  it('non li scrive nessuno dal browser', async () => {
    for (const attore of ['anonimo', 'clienteA', 'clienteB', 'admin']) {
      await assertFails(setDoc(doc(CHI[attore](env), 'passaggi/impronta-2'), CODICE))
      await assertFails(updateDoc(doc(CHI[attore](env), 'passaggi/impronta-1'), { scade_il: '2099-01-01T00:00:00.000Z' }))
      await assertFails(deleteDoc(doc(CHI[attore](env), 'passaggi/impronta-1')))
    }
  })
})
