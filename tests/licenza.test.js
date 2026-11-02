'use strict'

// LA LICENZA DAL PIANO (REQ-FLOTTA-010): quello che si compra nella regia
// diventa le funzioni premium dell'app, e si riscrive quando cambia.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { moduliLicenza, patchLicenzaPiano, licenzaIniziale, sceltaCambiata, licenzaProtetta, stessaLicenza, perIlDatabase, scadenzaCoerente, TUTTI } = require('../functions/lib/licenza.js')
const { readFileSync } = require('node:fs')

describe('moduliLicenza', () => {
  it('il base senza moduli non accende niente; il magazzino porta conta, fatture e scadenzario; il completo tutto', () => {
    const spenti = Object.fromEntries(TUTTI.map((m) => [m, false]))
    expect(moduliLicenza({ piano: 'base' })).toEqual(spenti)
    expect(moduliLicenza({ piano: 'base', moduli: ['magazzino', 'staff'] })).toEqual({
      ...spenti,
      magazzino: true,
      conta: true,
      fatture: true,
      scadenzario: true,
      staff: true,
    })
    expect(moduliLicenza({ piano: 'completo' })).toEqual(Object.fromEntries(TUTTI.map((m) => [m, true])))
    expect(moduliLicenza({ piano: 'oro', moduli: ['x'] })).toEqual(spenti)
  })
})

describe('patchLicenzaPiano e sceltaCambiata', () => {
  it('la patch porta piano, moduli, terminali e data', () => {
    const p = patchLicenzaPiano({ piano: 'base', moduli: ['magazzino'], terminali: 2 }, new Date('2026-10-22T10:00:00Z'))
    expect(p['licenza.moduli'].magazzino).toBe(true)
    expect(p['licenza.moduli'].statistiche).toBe(false)
    expect(p).toEqual({
      'licenza.piano': 'base',
      'licenza.moduli': p['licenza.moduli'],
      'licenza.terminali': 2,
      'licenza.limiti': null,
      'licenza.prove': {},
      'licenza.scritta_il': '2026-10-22T10:00:00.000Z',
    })
  })

  // REQ-FLOTTA-015: il Free porta i suoi limiti e nessun modulo; passando
  // a un piano a pagamento i limiti tornano null, cioè nessuno.
  it('il Free: nessun modulo, i limiti del piano; a pagamento i limiti spariscono', () => {
    const free = patchLicenzaPiano({ piano: 'free', moduli: ['magazzino'] })
    expect(Object.values(free['licenza.moduli']).every((v) => v === false)).toBe(true)
    expect(free['licenza.limiti']).toEqual({ prodotti_max: 10, conti_aperti_max: 5, sconti: false, storico_giorni: 7, utenti_max: 1, marchio: true, comande: false })
    expect(patchLicenzaPiano({ piano: 'completo' })['licenza.limiti']).toBeNull()
  })

  it('cambia se cambiano piano, moduli o terminali; l’ordine dei moduli non conta', () => {
    expect(sceltaCambiata({ piano: 'base', moduli: ['a', 'b'] }, { piano: 'base', moduli: ['b', 'a'] })).toBe(false)
    expect(sceltaCambiata({ piano: 'base' }, { piano: 'completo' })).toBe(true)
    expect(sceltaCambiata({ piano: 'base', terminali: 1 }, { piano: 'base', terminali: 2 })).toBe(true)
  })
})

// La prima licenza la scrive il workflow dell'attivazione, che dal
// 29/10/2026 sta nella regia (scripts/licenza-istanza.mjs): la stessa
// mappa delle Functions, non una copia in tana-drink.
describe('licenzaIniziale', () => {
  const adesso = new Date('2026-10-29T10:00:00Z')
  const dati = { piano: 'base', moduli: ['staff'], slug: 'bar-mario', nome: 'Bar Mario Centrale', regiaUrl: 'https://drink-regia.web.app' }

  it('su un’istanza nuova: licenza attiva con i moduli del piano, e il nome del locale', () => {
    const p = licenzaIniziale({}, dati, adesso)
    expect(p.licenza).toEqual({
      piano: 'base',
      moduli: moduliLicenza({ piano: 'base', moduli: ['staff'] }),
      limiti: null,
      stato: 'attiva',
      slug: 'bar-mario',
      regia_url: 'https://drink-regia.web.app',
      scritta_il: '2026-10-29T10:00:00.000Z',
    })
    expect(p.venue_name).toBe('Bar Mario Centrale')
    expect(p.venue_short_name).toBe('Bar')
  })

  it('lo stato scritto dalla regia resta, e il nome scelto dal locale non si tocca', () => {
    const attuale = { licenza: { stato: 'sospesa', terminali: 2 }, venue_name: 'Da Mario', venue_short_name: 'Mario' }
    const p = licenzaIniziale(attuale, dati, adesso)
    expect(p.licenza.stato).toBe('sospesa')
    expect(p.licenza.terminali).toBe(2)
    expect(p).not.toHaveProperty('venue_name')
    expect(p).not.toHaveProperty('venue_short_name')
  })

  it('un piano sconosciuto vale come base', () => {
    expect(licenzaIniziale({}, { ...dati, piano: 'oro' }, adesso).licenza.piano).toBe('base')
  })
})

// LA LICENZA PROTETTA (BUG-125 di tana-drink): in licenza/attuale, che
// dall'app nessuno scrive. La regia la CALCOLA dai suoi dati, intera, e non
// la copia da settings/bar, dove un bartender la può aver riscritta. Stesso
// contenuto di prima.
describe('la licenza protetta, dai dati della regia', () => {
  const ADESSO = new Date('2026-11-01T10:00:00Z')
  const cliente = { slug: 'bar-mario', piano: 'base', moduli: ['staff'], terminali: 2, abbonamento: { stato: 'attivo' } }

  it('piano, moduli, terminali, limiti e prove dal cliente; stato dall’istanza; la regia e gli aggiornamenti', () => {
    const lic = licenzaProtetta({ stato: 'attiva' }, cliente, { slug: 'bar-mario', regiaUrl: 'https://drink-regia.web.app', adesso: ADESSO })
    expect(lic).toMatchObject({
      piano: 'base',
      terminali: 2,
      limiti: null,
      prove: {},
      stato: 'attiva',
      motivo: null,
      dal: null,
      slug: 'bar-mario',
      regia_url: 'https://drink-regia.web.app',
      aggiornamenti: { modalita: 'obbligatori', inclusi: true, motivo: null, proposta: null, avviso: null },
      scritta_il: ADESSO.toISOString(),
    })
    expect(lic.moduli).toEqual(moduliLicenza({ piano: 'base', moduli: ['staff'] }))
    // Le stesse chiavi che il piano scriveva in settings/bar.
    for (const k of Object.keys(patchLicenzaPiano(cliente, ADESSO))) expect(lic).toHaveProperty(k.replace('licenza.', ''))
  })

  it('valida_fino: «pagato fino al» più la grazia per un piano a mano, al taglio dopo; niente per Free, Stripe, omaggi e interne', () => {
    const aMano = { ...cliente, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-30' } }
    // Scade il 7/12 a fine giornata: si ferma al taglio dopo, le 5 di Roma
    // dell'8 (le 4 UTC), mai a mezzanotte in pieno servizio (REQ-FLOTTA-024).
    expect(licenzaProtetta({ stato: 'attiva' }, aMano, { adesso: ADESSO }).valida_fino).toBe('2026-12-08T04:00:00.000Z')
    expect(licenzaProtetta({ stato: 'attiva' }, aMano, { giorniGrazia: 0, adesso: ADESSO }).valida_fino).toBe('2026-12-01T04:00:00.000Z')
    expect(licenzaProtetta({ stato: 'attiva' }, aMano, { giorniGrazia: 0, oraTaglio: 6, adesso: ADESSO }).valida_fino).toBe('2026-12-01T05:00:00.000Z')
    // Con Stripe (02/11/2026): la fine del periodo pagato più la grazia, al taglio dopo.
    const stripe = { ...cliente, abbonamento: { stato: 'attivo', origine: 'stripe', pagato_fino: '2026-11-22T10:00:00.000Z' } }
    expect(licenzaProtetta({ stato: 'attiva' }, stripe, { adesso: ADESSO }).valida_fino).toBe('2026-11-30T04:00:00.000Z')
    expect(licenzaProtetta({ stato: 'attiva' }, { ...aMano, abbonamento: { ...aMano.abbonamento, pagato_fino_al: null } }, { adesso: ADESSO }).valida_fino).toBeNull()
    expect(licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: ADESSO }).valida_fino).toBeNull()
    expect(licenzaProtetta({ stato: 'attiva' }, { piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } }, { adesso: ADESSO }).valida_fino).toBeNull()
    expect(licenzaProtetta({ stato: 'attiva', interna: true }, aMano, { adesso: ADESSO }).valida_fino).toBeNull()
    expect(licenzaProtetta({ stato: 'attiva', ripiego_free: { dal: 'x' } }, aMano, { adesso: ADESSO }).valida_fino).toBeNull()
    // Conta per «stessa licenza»: un pagamento registrato la cambia.
    const a = licenzaProtetta({ stato: 'attiva' }, aMano, { adesso: ADESSO })
    expect(stessaLicenza(a, { ...a, valida_fino: '2027-01-07T23:59:59.000Z' })).toBe(false)
  })

  it('sospesa o chiusa porta il motivo e la data; attiva no', () => {
    const ist = { stato: 'attiva', licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto', licenza_dal: '2026-10-30T06:00:00Z' }
    expect(licenzaProtetta(ist, cliente, { adesso: ADESSO })).toMatchObject({ stato: 'sospesa', motivo: 'pagamento non ricevuto', dal: '2026-10-30T06:00:00Z' })
    const riattivata = { ...ist, licenza_stato: 'attiva' }
    expect(licenzaProtetta(riattivata, cliente, { adesso: ADESSO }).motivo).toBeNull()
  })

  it('tornato al Free per un pagamento mancato: la licenza è quella del Free, coi suoi limiti', () => {
    const lic = licenzaProtetta({ stato: 'attiva', ripiego_free: { dal: '2026-10-30' } }, cliente, { adesso: ADESSO })
    expect(lic.piano).toBe('free')
    expect(lic.limiti).not.toBeNull()
    expect(Object.values(lic.moduli).some(Boolean)).toBe(false)
  })

  it('stessa licenza: non contano la data di scrittura, la data dello stato e l’ordine delle chiavi', () => {
    const a = licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: ADESSO })
    const b = { ...licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: new Date('2026-11-02T10:00:00Z') }), dal: 'x' }
    b.moduli = Object.fromEntries(Object.entries(b.moduli).reverse())
    expect(stessaLicenza(a, b)).toBe(true)
    expect(stessaLicenza(a, { ...a, piano: 'completo' })).toBe(false)
    expect(stessaLicenza(a, { ...a, moduli: { ...a.moduli, magazzino: true } })).toBe(false)
    expect(stessaLicenza(a, null)).toBe(false)
  })

  it('ogni aggiornamento dalla regia la scrive prima del deploy, e senza non parte', () => {
    const src = readFileSync('functions/index.js', 'utf8')
    const corpo = src.slice(src.indexOf('async function lanciaAggiornamento('), src.indexOf('async function tutteLeIstanze('))
    const scritta = corpo.indexOf('await scriviLicenza(slug)')
    expect(scritta).toBeGreaterThan(0)
    expect(scritta).toBeLessThan(corpo.indexOf('dispatchGitHub('))
    expect(corpo).toMatch(/if \(!licenza\.ok\) return /)
  })

  it('l’attivazione la scrive in licenza/attuale prima della consegna', () => {
    const script = readFileSync('scripts/licenza-istanza.mjs', 'utf8')
    const protetta = script.indexOf("db.doc('licenza/attuale').set(patch.licenza)")
    expect(protetta).toBeGreaterThan(0)
    expect(protetta).toBeLessThan(script.indexOf("db.doc('settings/bar').set(patch, { merge: true })"))
  })
})

// Le regole che tana-drink chiede alla regia (01/11/2026), per ogni licenza.
describe("il contratto con l'app", () => {
  const listino = require('../functions/piani.json')
  const piani = Object.keys(listino.piani)

  it('moduli nomina tutti i moduli, sempre: uno che manca per l’app vale «non incluso»', () => {
    for (const piano of piani) {
      for (const moduli of [[], ['magazzino'], ['staff', 'sumup']]) {
        const lic = licenzaProtetta({ stato: 'attiva' }, { slug: 'bar-mario', piano, moduli, abbonamento: { stato: 'attivo' } })
        expect(Object.keys(lic.moduli).sort()).toEqual([...TUTTI].sort())
        expect(Object.values(lic.moduli).every((v) => typeof v === 'boolean')).toBe(true)
      }
    }
  })

  it('gli sconti si spengono solo con limiti.sconti: false, un booleano', () => {
    for (const piano of piani) {
      const sconti = listino.piani[piano].limiti?.sconti
      expect(sconti === undefined || typeof sconti === 'boolean').toBe(true)
    }
    expect(listino.piani.free.limiti.sconti).toBe(false)
  })

  it("l'attivazione scrive la licenza prima dell'app, e mai partendo da settings/bar.licenza", () => {
    const wf = readFileSync('.github/workflows/provisiona-istanza.yml', 'utf8')
    const licenza = wf.indexOf('node scripts/licenza-istanza.mjs')
    expect(licenza).toBeGreaterThan(0)
    expect(licenza).toBeLessThan(wf.indexOf('npx firebase-tools deploy'))
    const script = readFileSync('scripts/licenza-istanza.mjs', 'utf8')
    expect(script).toContain("db.doc('licenza/attuale').get()")
    expect(script).toContain('licenza: protetta.exists ? protetta.data() : undefined')
  })

  it('le Functions non cancellano mai licenza/attuale: un locale si ferma con lo stato', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    expect(codice).not.toMatch(/LICENZA_PROTETTA\)\.delete|licenza\/attuale'\)\.delete/)
  })
})

// L'utente, 02/11/2026: senza licenza valida il prodotto non parte; con
// l'opzione della regia diventa Free; e il titolare sa quando i suoi dati
// verranno cancellati (REQ-FLOTTA-025).
describe('cosa succede alla scadenza, e la cancellazione dei dati', () => {
  const cliente = { slug: 'bar-mario', piano: 'base', abbonamento: { stato: 'attivo', origine: 'manuale' } }

  it('alla_scadenza: «free» con «solo finché si paga», se no «ferma»', () => {
    expect(licenzaProtetta({ stato: 'attiva' }, cliente).alla_scadenza).toBe('ferma')
    expect(licenzaProtetta({ stato: 'attiva', condizioni_aggiornamenti: { solo_finche_paga: true } }, cliente).alla_scadenza).toBe('free')
    expect(licenzaProtetta({ stato: 'attiva', interna: true, condizioni_aggiornamenti: { solo_finche_paga: true } }, cliente).alla_scadenza).toBe('ferma')
  })

  it('cancellazione: la data e chi l’ha voluta, solo con una cancellazione programmata', () => {
    const programmata = { stato: 'attiva', eliminazione: { stato: 'programmata', quando: '2027-01-31T10:00:00.000Z', richiedente: 'conservazione' } }
    expect(licenzaProtetta(programmata, cliente).cancellazione).toEqual({ il: '2027-01-31T10:00:00.000Z', richiedente: 'conservazione' })
    expect(licenzaProtetta({ ...programmata, eliminazione: { ...programmata.eliminazione, stato: 'annullata' } }, cliente).cancellazione).toBeNull()
    expect(licenzaProtetta({ stato: 'attiva' }, cliente).cancellazione).toBeNull()
    // Cambia la licenza: si riscrive quando la cancellazione si programma o si annulla.
    expect(stessaLicenza(licenzaProtetta(programmata, cliente), licenzaProtetta({ stato: 'attiva' }, cliente))).toBe(false)
  })
})

// tana-drink, 02/11/2026: le regole leggono la scadenza solo da
// valida_fino_ts come Timestamp; senza, lato server la licenza non scade.
describe('la scadenza per le regole: valida_fino_ts', () => {
  // Un Timestamp finto: quello vero (firebase-admin) ha toMillis().
  const ts = (d) => ({ toMillis: () => d.getTime() })

  it('stesso istante di valida_fino come Timestamp, o null se non scade', () => {
    const scade = perIlDatabase({ piano: 'base', valida_fino: '2026-12-08T04:00:00.000Z' }, ts)
    expect(scade.valida_fino).toBe('2026-12-08T04:00:00.000Z')
    expect(scade.valida_fino_ts.toMillis()).toBe(Date.parse('2026-12-08T04:00:00.000Z'))
    expect(perIlDatabase({ piano: 'base', valida_fino: null }, ts).valida_fino_ts).toBeNull()
  })

  it('la verifica vuole i due campi d’accordo', () => {
    expect(scadenzaCoerente(perIlDatabase({ valida_fino: '2026-12-08T04:00:00.000Z' }, ts))).toBe(true)
    expect(scadenzaCoerente({ valida_fino: null, valida_fino_ts: null })).toBe(true)
    expect(scadenzaCoerente({ valida_fino: null })).toBe(true)
    // Una licenza scritta prima di valida_fino_ts: per le regole non scadrebbe.
    expect(scadenzaCoerente({ valida_fino: '2026-12-08T04:00:00.000Z' })).toBe(false)
    expect(scadenzaCoerente({ valida_fino: '2026-12-08T04:00:00.000Z', valida_fino_ts: '2026-12-08T04:00:00.000Z' })).toBe(false)
    expect(scadenzaCoerente({ valida_fino: '2026-12-08T04:00:00.000Z', valida_fino_ts: ts(new Date('2026-12-09T04:00:00.000Z')) })).toBe(false)
    expect(scadenzaCoerente({ valida_fino: null, valida_fino_ts: ts(new Date()) })).toBe(false)
  })

  it('le Functions la scrivono con valida_fino_ts, in licenza/attuale e in settings/bar', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    expect(codice).toContain('perIlDatabase(licenza, (d) => Timestamp.fromDate(d))')
    expect(codice).toContain('await istanza.doc(LICENZA_PROTETTA).set(doc)')
    expect(codice).toContain("set({ licenza: doc }, { mergeFields: ['licenza'] })")
  })
})
