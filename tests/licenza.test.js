'use strict'

// LA LICENZA DAL PIANO (REQ-FLOTTA-010): quello che si compra nella regia
// diventa le funzioni premium dell'app, e si riscrive quando cambia.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { moduliLicenza, patchLicenzaPiano, licenzaIniziale, sceltaCambiata, licenzaProtetta, stessaLicenza, TUTTI } = require('../functions/lib/licenza.js')
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
    expect(free['licenza.limiti']).toEqual({ prodotti_max: 10, conti_aperti_max: 5, sconti: false, storico_giorni: 7, utenti_max: 1, marchio: true })
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

  it('valida_fino: «pagato fino al» più la grazia per un piano a mano; niente per Free, Stripe, omaggi e interne', () => {
    const aMano = { ...cliente, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-30' } }
    expect(licenzaProtetta({ stato: 'attiva' }, aMano, { adesso: ADESSO }).valida_fino).toBe('2026-12-07T23:59:59.000Z')
    expect(licenzaProtetta({ stato: 'attiva' }, aMano, { giorniGrazia: 0, adesso: ADESSO }).valida_fino).toBe('2026-11-30T23:59:59.000Z')
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
