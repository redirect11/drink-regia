// ── clienti/{uid} SULLE REGOLE VERE (REQ-FLOTTA-003, REQ-DEV-007) ────────
// REGOLE PROVATE: /clienti/{uid}, /clienti/{uid}/temi_su_misura/{id}
//
// Il documento del titolare: lo legge solo lui (e l'admin); nasce alla
// registrazione con la forma che il sito gli dà (nuovoCliente); dopo, il
// titolare cambia solo i blocchi anagrafici (H1 del 22/10/2026, chiusa il
// 02/11/2026) e dentro quei blocchi la partita IVA resta di 11 cifre e i
// consensi dati non si cancellano, «validi o com'erano» (un locale
// esistente nasce con fatturazione {} e consensi a null e non deve restare
// bloccato). Piano, moduli, abbonamento e il resto li scrivono solo l'admin
// e le Functions. Fino al 09/11/2026 si provava sul testo delle regole.

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest'
import { assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy } from 'firebase/firestore'
import { createRequire } from 'node:module'
import { avviaAmbiente, azzera, semina, CHI, UID, EMAIL } from './ambiente.js'
import { nuovoCliente } from '../../src/lib/clienti.js'

const { datiEsistente, documentiEsistente } = createRequire(import.meta.url)('../../functions/lib/esistente.js')

let env

beforeAll(async () => {
  env = await avviaAmbiente('clienti')
})
afterAll(async () => {
  await env?.cleanup()
})
beforeEach(async () => {
  await azzera(env)
})

// Il documento come lo scrive il sito alla registrazione (src/lib/db.js,
// creaCliente → nuovoCliente): è l'unico punto che crea clienti/{uid} dal
// browser, e la prova parte da quello, non da un documento inventato.
const registrazione = (uid, email, nome = 'Bar Centrale') =>
  nuovoCliente({
    uid,
    email,
    locale: { nome, tipo: 'bar', via: 'Via Roma 1', cap: '10100', citta: 'Torino', provincia: 'to', telefono: '011 1234567' },
    fatturazione: { ragione_sociale: 'Centrale srl', partita_iva: '12345678901', pec: 'pec@centrale.example', stessa_sede: true },
    referente: { nome: 'Anna', cognome: 'Rossi', ruolo: 'titolare', telefono: '333 1234567' },
    adesso: new Date('2026-11-09T10:00:00Z'),
  })

// Un cliente già registrato, con quello che la regia ci scrive sopra dopo
// (piano, moduli, abbonamento…): il punto di partenza delle modifiche.
const CLIENTE_A = {
  ...registrazione(UID.a, EMAIL.a, 'Bar Centrale A'),
  piano: 'base',
  moduli: ['magazzino'],
  terminali: 2,
  prove: {},
  temi: [],
  abbonamento: { stato: 'attivo', origine: 'stripe' },
}
const CLIENTE_B = { ...registrazione(UID.b, EMAIL.b, 'Osteria del Porto B'), piano: 'free' }

describe('clienti/{uid}: la lettura', () => {
  beforeEach(async () => {
    await semina(env, `clienti/${UID.a}`, CLIENTE_A)
    await semina(env, `clienti/${UID.b}`, CLIENTE_B)
  })

  it('il titolare legge il suo documento', async () => {
    await assertSucceeds(getDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`)))
  })

  it('il titolare non legge il documento di un altro titolare', async () => {
    await assertFails(getDoc(doc(CHI.clienteA(env), `clienti/${UID.b}`)))
  })

  it('il titolare non elenca i clienti', async () => {
    await assertFails(getDocs(collection(CHI.clienteA(env), 'clienti')))
  })

  it('chi non ha fatto l’accesso non legge nessun cliente', async () => {
    await assertFails(getDoc(doc(CHI.anonimo(env), `clienti/${UID.a}`)))
  })

  it('l’admin legge ogni cliente e l’elenco del backoffice', async () => {
    const db = CHI.admin(env)
    await assertSucceeds(getDoc(doc(db, `clienti/${UID.a}`)))
    await assertSucceeds(getDoc(doc(db, `clienti/${UID.b}`)))
    await assertSucceeds(getDocs(query(collection(db, 'clienti'), orderBy('creato_il', 'desc'))))
  })
})

// LA REGISTRAZIONE NON PASSA PIÙ DAL BROWSER (REQ-FLOTTA-045, audit del
// 09/11/2026, finding 4): le regole controllavano la forma dello slug, non
// che fosse unico, e due titolari con lo stesso nome di locale finivano
// sullo stesso slug. Ora il documento lo scrive la Function registraCliente,
// che in transazione verifica che lo slug sia libero; qui la create è
// `if false` per chiunque, anche con un documento perfetto.
describe('clienti/{uid}: la registrazione (create) è solo della Function registraCliente', () => {
  it('il titolare non crea il suo documento dal browser, nemmeno come lo scriveva il sito', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), registrazione(UID.a, EMAIL.a)))
  })

  it('non lo crea sull’uid di un altro', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `clienti/${UID.b}`), registrazione(UID.b, EMAIL.a)))
  })

  it('chi non ha fatto l’accesso non crea niente', async () => {
    await assertFails(setDoc(doc(CHI.anonimo(env), `clienti/${UID.a}`), registrazione(UID.a, EMAIL.a)))
  })

  it('l’admin dal browser non crea il documento di un altro: per quello c’è la Function creaCliente', async () => {
    await assertFails(setDoc(doc(CHI.admin(env), `clienti/${UID.a}`), registrazione(UID.a, EMAIL.a)))
  })

  // Il buco del finding 4, chiuso: due titolari con lo stesso nome di locale
  // non scrivono più lo stesso slug, perché dal browser non scrive nessuno;
  // chi arriva secondo riceve «already-exists» dalla Function.
  it('due titolari con lo stesso slug: nessuno dei due scrive dal browser (finding 4, chiuso)', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), registrazione(UID.a, EMAIL.a, 'Bar Centrale')))
    await assertFails(setDoc(doc(CHI.clienteB(env), `clienti/${UID.b}`), registrazione(UID.b, EMAIL.b, 'Bar Centrale')))
  })
})

describe('clienti/{uid}: le modifiche del titolare (H1)', () => {
  beforeEach(async () => {
    await semina(env, `clienti/${UID.a}`, CLIENTE_A)
  })

  it('cambia i suoi dati anagrafici: locale, referente, fatturazione, consensi', async () => {
    await assertSucceeds(
      updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), {
        'locale.telefono': '011 7654321',
        'referente.nome': 'Marco',
        'fatturazione.ragione_sociale': 'Centrale di Marco srl',
        'consensi.marketing': true,
      }),
    )
  })

  it.each(['piano', 'moduli', 'temi', 'terminali', 'prove', 'sconto', 'abbonamento', 'email', 'slug', 'uid', 'interna', 'esistente', 'nome_locale', 'tentativi_codice'])(
    'non tocca «%s»: lo scrivono solo l’admin e le Functions',
    async (campo) => {
      await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { [campo]: 'completo' }))
    },
  )

  // Gli orari di servizio (REQ-FLOTTA-095) stanno in cima al documento,
  // fuori dai blocchi che il titolare cambia: dopo 7 giorni si cambiano solo
  // con l'approvazione dell'admin, e le Functions sono le sole a scriverli.
  it('non tocca gli orari di servizio, né in parte né interi', async () => {
    const titolare = doc(CHI.clienteA(env), `clienti/${UID.a}`)
    await assertFails(updateDoc(titolare, { orari_servizio: { giorni: {}, impostati_il: '2030-01-01T00:00:00.000Z', richiesta: null, storia: [] } }))
    await assertFails(updateDoc(titolare, { 'orari_servizio.giorni.lun': { chiuso: true } }))
    await assertFails(updateDoc(titolare, { 'orari_servizio.impostati_il': '2030-01-01T00:00:00.000Z' }))
    await assertFails(updateDoc(titolare, { 'orari_servizio.richiesta': { stato: 'approvata' } }))
  })

  it('cambia la partita IVA solo con un’altra di 11 cifre', async () => {
    await assertSucceeds(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'fatturazione.partita_iva': '09876543210' }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'fatturazione.partita_iva': '123' }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'fatturazione.partita_iva': deleteField() }))
  })

  it('non toglie il blocco della fatturazione, che porterebbe via la partita IVA', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { fatturazione: deleteField() }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { fatturazione: {} }))
  })

  it('non cancella i consensi dati', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'consensi.termini_il': null }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'consensi.privacy_il': deleteField() }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { consensi: { marketing: false } }))
  })

  it('i blocchi restano mappe', async () => {
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { locale: 'chiuso' }))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { referente: null }))
  })

  it('un altro titolare non lo modifica, e nemmeno chi non ha fatto l’accesso', async () => {
    await assertFails(updateDoc(doc(CHI.clienteB(env), `clienti/${UID.a}`), { 'locale.telefono': '000' }))
    await assertFails(updateDoc(doc(CHI.anonimo(env), `clienti/${UID.a}`), { 'locale.telefono': '000' }))
  })

  it('l’admin cambia anche piano, moduli e abbonamento', async () => {
    await assertSucceeds(updateDoc(doc(CHI.admin(env), `clienti/${UID.a}`), { piano: 'completo', moduli: [], 'abbonamento.stato': 'sospeso' }))
  })

  // VALIDO, O COM'ERA (02/11/2026): la Tana, registrata come esistente,
  // nasce con fatturazione {} e consensi a null. Il titolare modifica il
  // resto, e quei campi li può solo mettere giusti.
  describe('un locale registrato come esistente, senza partita IVA né consensi', () => {
    beforeEach(async () => {
      const dati = datiEsistente({ nome_locale: 'La Tana', slug: 'tana-drink', email: EMAIL.a, progetto: 'tana-drink', url: 'https://tana-drink.web.app' })
      await semina(env, `clienti/${UID.a}`, documentiEsistente(dati, { uid: UID.a }).cliente)
    })

    it('il titolare cambia il locale anche se fatturazione e consensi mancano', async () => {
      await assertSucceeds(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'locale.telefono': '011 1111111' }))
    })

    it('mette la partita IVA giusta, non una sbagliata', async () => {
      await assertSucceeds(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'fatturazione.partita_iva': '12345678901' }))
      await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'fatturazione.partita_iva': 'IT123' }))
    })

    it('dà i consensi, con la data', async () => {
      await assertSucceeds(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`), { 'consensi.termini_il': '2026-11-09T10:00:00.000Z', 'consensi.privacy_il': '2026-11-09T10:00:00.000Z' }))
    })
  })
})

describe('clienti/{uid}: la cancellazione', () => {
  beforeEach(async () => {
    await semina(env, `clienti/${UID.a}`, CLIENTE_A)
  })

  it('il titolare non cancella il suo documento', async () => {
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `clienti/${UID.a}`)))
  })

  it('l’admin sì', async () => {
    await assertSucceeds(deleteDoc(doc(CHI.admin(env), `clienti/${UID.a}`)))
  })
})

// I TEMI SU MISURA (REQ-FLOTTA-040): li legge il titolare, li scrivono solo
// le Functions.
describe('clienti/{uid}/temi_su_misura/{id}', () => {
  const TEMA = { id: 'notte-al-porto', stato: 'pronto', creato_il: '2026-11-01T10:00:00.000Z' }
  beforeEach(async () => {
    await semina(env, `clienti/${UID.a}/temi_su_misura/notte-al-porto`, TEMA)
  })

  it('il titolare legge i suoi temi, uno e in elenco', async () => {
    const db = CHI.clienteA(env)
    await assertSucceeds(getDoc(doc(db, `clienti/${UID.a}/temi_su_misura/notte-al-porto`)))
    await assertSucceeds(getDocs(query(collection(db, `clienti/${UID.a}/temi_su_misura`), orderBy('creato_il', 'desc'))))
  })

  it('un altro titolare e chi non ha fatto l’accesso non li leggono', async () => {
    await assertFails(getDoc(doc(CHI.clienteB(env), `clienti/${UID.a}/temi_su_misura/notte-al-porto`)))
    await assertFails(getDocs(collection(CHI.clienteB(env), `clienti/${UID.a}/temi_su_misura`)))
    await assertFails(getDoc(doc(CHI.anonimo(env), `clienti/${UID.a}/temi_su_misura/notte-al-porto`)))
  })

  it('l’admin li legge', async () => {
    await assertSucceeds(getDocs(collection(CHI.admin(env), `clienti/${UID.a}/temi_su_misura`)))
  })

  it('nessuno li scrive dal browser, nemmeno il titolare o l’admin', async () => {
    await assertFails(setDoc(doc(CHI.clienteA(env), `clienti/${UID.a}/temi_su_misura/nuovo`), TEMA))
    await assertFails(updateDoc(doc(CHI.clienteA(env), `clienti/${UID.a}/temi_su_misura/notte-al-porto`), { stato: 'pubblicato' }))
    await assertFails(deleteDoc(doc(CHI.clienteA(env), `clienti/${UID.a}/temi_su_misura/notte-al-porto`)))
    await assertFails(setDoc(doc(CHI.admin(env), `clienti/${UID.a}/temi_su_misura/nuovo`), TEMA))
    await assertFails(deleteDoc(doc(CHI.admin(env), `clienti/${UID.a}/temi_su_misura/notte-al-porto`)))
  })
})
