'use strict'

// LA REGISTRAZIONE LATO SERVER E LO SLUG UNICO (REQ-FLOTTA-045). Audit di
// sicurezza del 09/11/2026, finding 4: il documento clienti/{uid} lo
// scriveva il browser senza che nessuno controllasse che lo slug fosse
// libero, e ogni ricerca per slug tornava «il primo». Qui: la Function
// scrive in transazione dopo aver guardato, lo stesso documento che
// scriveva il sito; e clientePerSlug si ferma davanti a due clienti.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { nuovoCliente as nuovoClienteDelSito } from '../src/lib/clienti.js'

const require = createRequire(import.meta.url)
const r = require('../functions/lib/registrazione.js')

const ADESSO = new Date('2026-11-09T10:00:00.000Z')
const DATI = {
  locale: { nome: ' Bar Mario ', tipo: 'bar', via: 'Via Roma 1', cap: '80035', citta: 'Nola', provincia: 'na', telefono: '081 1234567', sito: '' },
  fatturazione: { ragione_sociale: 'Bar Mario srl', partita_iva: 'IT01234567897', codice_fiscale: '', pec: 'Bar@PEC.it', sdi: '', stessa_sede: true },
  referente: { nome: 'Mario', cognome: 'Rossi', ruolo: 'titolare', telefono: '', termini: true, privacy: true, marketing: false },
}

// UN FIRESTORE FINTO, quanto basta: documenti per percorso, la query per
// slug su `clienti` e la transazione, che registra le letture e scrive solo
// alla fine, come quella vera. `letture` e `scritture` servono ai test.
function firestoreFinto(documenti = {}) {
  const dati = { ...documenti }
  const scritture = []
  const letture = []
  const snapDoc = (percorso) => ({ exists: dati[percorso] !== undefined, id: percorso.split('/').pop(), data: () => dati[percorso], ref: { path: percorso } })
  const query = (collezione, campo, valore, quanti) => ({
    tipo: 'query',
    esegui() {
      letture.push(`${collezione} dove ${campo} == ${valore} (${quanti})`)
      const docs = Object.keys(dati)
        .filter((p) => p.startsWith(`${collezione}/`) && p.split('/').length === 2 && dati[p]?.[campo] === valore)
        .slice(0, quanti)
        .map(snapDoc)
      return { docs, size: docs.length, empty: docs.length === 0 }
    },
    async get() {
      return this.esegui()
    },
  })
  const db = {
    collection: (nome) => ({
      where: (campo, op, valore) => ({ limit: (quanti) => query(nome, campo, valore, quanti) }),
    }),
    doc: (percorso) => ({ tipo: 'doc', percorso, async get() { letture.push(percorso); return snapDoc(percorso) } }),
    async runTransaction(fn) {
      const inAttesa = []
      const t = {
        async get(x) {
          return x.tipo === 'query' ? x.esegui() : (letture.push(x.percorso), snapDoc(x.percorso))
        },
        set(ref, valore) {
          inAttesa.push([ref.percorso, valore])
        },
      }
      await fn(t)
      for (const [p, v] of inAttesa) {
        dati[p] = v
        scritture.push(p)
      }
    },
    dati,
    scritture,
    letture,
  }
  return db
}

describe('il documento del cliente, lato server', () => {
  it('è lo stesso che scriveva il sito, campo per campo', () => {
    const delSito = nuovoClienteDelSito({ uid: 'u1', email: 'Mario@Example.IT', ...DATI, adesso: ADESSO })
    const delServer = r.nuovoCliente({ uid: 'u1', email: 'Mario@Example.IT', ...DATI, adesso: ADESSO })
    expect(delServer).toEqual(delSito)
    expect(delServer.slug).toBe('bar-mario')
    expect(delServer.consensi).toEqual({ termini_il: ADESSO.toISOString(), privacy_il: ADESSO.toISOString(), marketing: false })
  })

  // REQ-FLOTTA-065: all'app per ora va sempre «bar», ma il tipo scelto
  // alla registrazione resta com'è, così il giorno che servirà è già lì.
  it('il tipo di locale scelto resta com’è, anche quello che l’app oggi non usa', () => {
    for (const tipo of ['pizzeria', 'ristorante', 'enoteca', 'cocktail bar']) {
      expect(r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, locale: { ...DATI.locale, tipo } }).locale.tipo).toBe(tipo)
    }
    expect(r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, locale: { ...DATI.locale, tipo: 'discoteca' } }).locale.tipo).toBe('altro')
  })

  it('con la sede legale diversa la tiene a parte, come il sito', () => {
    const fatturazione = { ...DATI.fatturazione, stessa_sede: false, via: 'Via Sede 2', cap: '80100', citta: 'Napoli', provincia: 'na' }
    expect(r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, fatturazione, adesso: ADESSO })).toEqual(nuovoClienteDelSito({ uid: 'u1', email: 'm@x.it', ...DATI, fatturazione, adesso: ADESSO }))
  })

  it('lo slug viene dal nome, o è quello scelto dal titolare; in tutti e due i casi deve essere valido', () => {
    expect(r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, slug: 'bar-mario-nola', adesso: ADESSO }).slug).toBe('bar-mario-nola')
    expect(() => r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, locale: { ...DATI.locale, nome: 'Bar' } })).toThrow(/corto/)
    expect(() => r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, slug: 'Bar Mario!' })).toThrow(/minuscole/)
    expect(() => r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, slug: 'demo' })).toThrow(/corto|riservato/)
    let errore
    try {
      r.nuovoCliente({ uid: 'u1', email: 'm@x.it', ...DATI, slug: '1bar-mario' })
    } catch (e) {
      errore = e
    }
    expect(errore).toBeInstanceOf(r.RegistrazioneRifiutata)
    expect(errore).toMatchObject({ codice: 'invalid-argument', dettagli: { campo: 'slug' } })
  })

  it('problemaSlug dice le stesse cose del sito', () => {
    expect(r.problemaSlug('bar-mario')).toBeNull()
    expect(r.problemaSlug('')).toMatch(/nome/)
    expect(r.problemaSlug('bar')).toMatch(/corto/)
    expect(r.problemaSlug('1bar-mario')).toMatch(/lettera/)
    expect(r.problemaSlug('demo')).toMatch(/riservato|corto/)
    expect(r.problemaSlug('a'.repeat(31))).toMatch(/lungo/)
  })

  // Quello che controllavano le regole Firestore, più i consensi dati davvero.
  it('rifiuta senza accesso, senza email, senza i consensi, con la partita IVA sbagliata', () => {
    const prova = (args) => {
      try {
        r.documentoRegistrazione({ uid: 'u1', email: 'm@x.it', dati: DATI, ...args })
      } catch (e) {
        return e
      }
      return null
    }
    expect(prova({ uid: null })).toMatchObject({ codice: 'unauthenticated' })
    expect(prova({ email: '' })).toMatchObject({ codice: 'failed-precondition' })
    expect(prova({ dati: { ...DATI, referente: { ...DATI.referente, privacy: false } } })).toMatchObject({ codice: 'invalid-argument', dettagli: { campo: 'consensi' } })
    expect(prova({ dati: { ...DATI, referente: { ...DATI.referente, termini: 'sì' } } })).toMatchObject({ codice: 'invalid-argument', dettagli: { campo: 'consensi' } })
    expect(prova({ dati: { ...DATI, fatturazione: { ...DATI.fatturazione, partita_iva: '123' } } })).toMatchObject({ codice: 'invalid-argument', dettagli: { campo: 'partita_iva' } })
    expect(prova({})).toBeNull()
  })
})

describe('registraCliente, in transazione', () => {
  it('con lo slug libero scrive clienti/{uid} con uid ed email dell’account, dopo aver letto slug, istanza e documento', async () => {
    const db = firestoreFinto({ 'clienti/altro': { slug: 'osteria-nova' } })
    const scritto = await r.registraCliente(db, { uid: 'u1', email: 'Mario@Example.IT', dati: { ...DATI, uid: 'furbo', email: 'altro@x.it' }, adesso: ADESSO })
    expect(db.scritture).toEqual(['clienti/u1'])
    expect(db.dati['clienti/u1']).toEqual(scritto)
    // Il documento del sito, più la forma base dell'email (REQ-FLOTTA-083).
    expect(scritto).toEqual({ ...nuovoClienteDelSito({ uid: 'u1', email: 'mario@example.it', ...DATI, adesso: ADESSO }), email_norma: 'mario@example.it' })
    expect(db.letture).toEqual(['clienti dove slug == bar-mario (2)', 'istanze/bar-mario', 'clienti/u1', 'clienti dove email_norma == mario@example.it (2)'])
  })

  it('con lo slug di un altro cliente rifiuta con already-exists, dice di sceglierne un altro, e non scrive niente', async () => {
    const db = firestoreFinto({ 'clienti/altro': { slug: 'bar-mario' } })
    const errore = await r.registraCliente(db, { uid: 'u1', email: 'm@x.it', dati: DATI }).catch((e) => e)
    expect(errore).toBeInstanceOf(r.RegistrazioneRifiutata)
    expect(errore).toMatchObject({ codice: 'already-exists', message: r.SLUG_IN_USO, dettagli: { campo: 'slug', slug: 'bar-mario' } })
    expect(errore.message).toBe('Questo identificativo è già in uso: scegline un altro.')
    expect(db.scritture).toEqual([])
    // Con uno slug scelto a mano che è libero, passa.
    const scritto = await r.registraCliente(db, { uid: 'u1', email: 'm@x.it', dati: { ...DATI, slug: 'bar-mario-nola' } })
    expect(scritto.slug).toBe('bar-mario-nola')
    expect(db.scritture).toEqual(['clienti/u1'])
  })

  it('uno slug che ha già un’istanza (un locale eliminato) è preso lo stesso', async () => {
    const db = firestoreFinto({ 'istanze/bar-mario': { stato: 'eliminata' } })
    await expect(r.registraCliente(db, { uid: 'u1', email: 'm@x.it', dati: DATI })).rejects.toMatchObject({ codice: 'already-exists', dettagli: { campo: 'slug' } })
    expect(db.scritture).toEqual([])
  })

  it('un account che ha già un locale non ne registra un secondo', async () => {
    const db = firestoreFinto({ 'clienti/u1': { slug: 'osteria-nova' } })
    await expect(r.registraCliente(db, { uid: 'u1', email: 'm@x.it', dati: DATI })).rejects.toMatchObject({ codice: 'already-exists', dettagli: { campo: 'account' } })
    expect(db.dati['clienti/u1']).toEqual({ slug: 'osteria-nova' })
  })

  it('i dati sbagliati si fermano prima della transazione', async () => {
    const db = firestoreFinto()
    await expect(r.registraCliente(db, { uid: 'u1', email: 'm@x.it', dati: { ...DATI, referente: {} } })).rejects.toMatchObject({ codice: 'invalid-argument' })
    expect(db.letture).toEqual([])
  })
})

describe('clientePerSlug', () => {
  it('nessuno → null; uno → il documento con ref, id e data()', async () => {
    const db = firestoreFinto({ 'clienti/u1': { slug: 'bar-mario', piano: 'base' } })
    expect(await r.clientePerSlug(db, 'osteria-nova')).toBeNull()
    const doc = await r.clientePerSlug(db, 'bar-mario')
    expect(doc.id).toBe('u1')
    expect(doc.data()).toEqual({ slug: 'bar-mario', piano: 'base' })
    expect(doc.ref.path).toBe('clienti/u1')
    // Si chiedono due documenti, non uno: è così che si vede il doppione.
    expect(db.letture).toEqual(['clienti dove slug == osteria-nova (2)', 'clienti dove slug == bar-mario (2)'])
  })

  it('due → un errore esplicito, mai «il primo»', async () => {
    const db = firestoreFinto({ 'clienti/u1': { slug: 'bar-mario' }, 'clienti/u2': { slug: 'bar-mario' } })
    const errore = await r.clientePerSlug(db, 'bar-mario').catch((e) => e)
    expect(errore).toBeInstanceOf(r.SlugAmbiguo)
    expect(errore.message).toBe('Identificativo ambiguo: più di un cliente con lo slug bar-mario.')
  })
})

// Le Functions: la callable e l'uso dell'helper dappertutto, provati sul
// testo come il resto di index.js.
describe('functions/index.js', () => {
  const index = readFileSync('functions/index.js', 'utf8')
  const corpo = (nome) => {
    const da = index.slice(index.indexOf(`exports.${nome} =`))
    return da.slice(0, da.indexOf('\n})'))
  }

  it('registraCliente: serve l’accesso, il sito aperto, e la lib in transazione; i rifiuti diventano HttpsError col loro codice e i dettagli', () => {
    const fn = corpo('registraCliente')
    expect(fn).toContain("if (!req.auth?.uid) throw new HttpsError('unauthenticated'")
    expect(fn).toContain('await solOSitoAperto()')
    expect(fn).toContain('registrazione.registraCliente(db, { uid: req.auth.uid, email: req.auth.token?.email, dati: req.data })')
    expect(fn).toContain('if (e instanceof registrazione.RegistrazioneRifiutata) throw new HttpsError(e.codice, e.message, e.dettagli || undefined)')
    expect(fn).toMatch(/onCall\(OPTS,/)
  })

  it('nessuna ricerca per slug con limit(1): tutte passano da docClientePerSlug, che traduce lo slug ambiguo in failed-precondition', () => {
    expect(index).not.toMatch(/where\('slug'/)
    expect(index.match(/docClientePerSlug\(/g).length).toBeGreaterThanOrEqual(13)
    const helper = index.slice(index.indexOf('async function docClientePerSlug'), index.indexOf('async function clienteDi'))
    expect(helper).toContain('registrazione.clientePerSlug(db, slug)')
    expect(helper).toContain("if (e instanceof registrazione.SlugAmbiguo) throw new HttpsError('failed-precondition', e.message)")
    // moduloDallApp è una onRequest: l'errore torna all'app come 409.
    const app = corpo('moduloDallApp')
    expect(app).toMatch(/docCliente = await docClientePerSlug\(trovata\.id\)[\s\S]*if \(e instanceof HttpsError\) return no\(409, e\.message\)/)
  })

  it('la lib chiede due documenti', () => {
    const lib = readFileSync('functions/lib/registrazione.js', 'utf8')
    expect(lib).toContain(".where('slug', '==', String(slug || '')).limit(2)")
    expect(lib).toContain('if (snap.size > 1) throw new SlugAmbiguo(slug)')
  })
})

// UN ACCOUNT PER PERSONA (REQ-FLOTTA-083, Daniele, 12/11/2026: «non
// dobbiamo accettarle in alcun modo da chi si registra»).
describe('le email col «+» e le varianti di un account che c’è già', () => {
  it('la forma base: minuscole, senza «+qualcosa», per Gmail senza punti', () => {
    expect(r.emailNorma('Mario.Rossi+Bar2@Gmail.com')).toBe('mariorossi@gmail.com')
    expect(r.emailNorma('mario.rossi@googlemail.com')).toBe('mariorossi@gmail.com')
    expect(r.emailNorma('mario.rossi+x@libero.it')).toBe('mario.rossi@libero.it')
    expect(r.emailNorma(' Info@Bar.IT ')).toBe('info@bar.it')
  })
  it('chi si registra con un’email col «+» si ferma prima della transazione', async () => {
    const db = firestoreFinto()
    await expect(r.registraCliente(db, { uid: 'u1', email: 'mario+bar2@gmail.com', dati: DATI })).rejects.toMatchObject({ codice: 'invalid-argument', dettagli: { campo: 'email' } })
    expect(db.letture).toEqual([])
    expect(r.EMAIL_CON_PIU).toBe('Per registrarti usa il tuo indirizzo senza «+…»: un account è uno per persona.')
  })
  it('una variante di un’email che ha già un account si rifiuta, e non si scrive niente', async () => {
    const db = firestoreFinto({ 'clienti/altro': { slug: 'osteria-nova', email_norma: 'mariorossi@gmail.com' } })
    const errore = await r.registraCliente(db, { uid: 'u1', email: 'Mario.Rossi@gmail.com', dati: DATI }).catch((e) => e)
    expect(errore).toMatchObject({ codice: 'already-exists', message: 'Esiste già un account con questa email: entra con quello.', dettagli: { campo: 'email' } })
    expect(db.scritture).toEqual([])
  })
  it('l’admin può creare un locale con un’email col «+», e quel cliente non riserva la forma base', () => {
    const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
    const crea = codice.slice(codice.indexOf('exports.creaCliente = '), codice.indexOf('exports.', codice.indexOf('exports.creaCliente = ') + 10))
    expect(crea).toContain("...(String(email).includes('+') ? {} : { email_norma: registrazione.emailNorma(email) })")
  })
  it('lo script per i clienti di prima scrive la forma base solo dove manca e senza «+»', () => {
    const script = readFileSync('scripts/email-norma.mjs', 'utf8')
    expect(script).toContain('emailNorma')
    expect(script).toMatch(/if \(c\.email_norma \|\| !c\.email \|\| String\(c\.email\)\.includes\('\+'\)\) continue/)
  })
})
