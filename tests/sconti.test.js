'use strict'

// I CODICI SCONTO (REQ-FLOTTA-028). L'utente, 02/11/2026, sulla Tana:
// «Dobbiamo trattarlo come abbonamento premium e tracciare i moduli attivi.
// Ha un codice sconto allegato con una durata illimitata per avere tutti i
// servizi attivi.» I codici stanno nella regia; con Stripe diventeranno
// coupon.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { scontoAttivo, prezzoConSconto, scontoDetto } from '../src/lib/sconti.js'

const require = createRequire(import.meta.url)
const s = require('../functions/lib/sconti.js')
const { licenzaProtetta } = require('../functions/lib/licenza.js')
const { scadenzaPagamento } = require('../functions/lib/scadenze.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const TANA = { codice: 'TANA-100', percentuale: 100, durata_mesi: null, descrizione: 'La Tana', attivo: true }
const aMano = { slug: 'tana-drink', piano: 'completo', moduli: [], abbonamento: { stato: 'attivo', origine: 'interna', dal: '2026-10-24T00:00:00.000Z' } }

describe('un codice', () => {
  it('pulito: maiuscolo, percentuale da 1 a 100, durata in mesi o illimitata', () => {
    expect(s.scontoPulito({ codice: ' tana-100 ', percentuale: 100, durata_mesi: '', descrizione: ' La Tana ' })).toEqual(TANA)
    expect(s.scontoPulito({ codice: 'PROVA20', percentuale: 20, durata_mesi: 3 })).toMatchObject({ codice: 'PROVA20', percentuale: 20, durata_mesi: 3 })
  })

  it('niente codici strani, percentuali o durate fuori misura', () => {
    expect(s.scontoPulito({ codice: 'ab', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    expect(s.scontoPulito({ codice: 'X Y Z', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    for (const percentuale of [0, 101, 12.5, 'tanto']) expect(s.scontoPulito({ codice: 'OK1', percentuale }).errore).toMatch(/Percentuale/)
    for (const durata_mesi of [0, 121, 1.5]) expect(s.scontoPulito({ codice: 'OK1', percentuale: 10, durata_mesi }).errore).toMatch(/Durata/)
  })

  it('la fine di uno sconto a tempo: tanti mesi dal giorno in cui si applica', () => {
    expect(s.fineSconto('2026-11-02T10:00:00.000Z', 3)).toBe('2027-02-02')
    expect(s.fineSconto('2026-11-02T10:00:00.000Z', null)).toBeNull()
  })
})

describe('applicato a un cliente', () => {
  it('100% illimitato: abbonamento attivo che non si paga e non scade, moduli dal piano', () => {
    const { patch } = s.scontoApplicato(aMano, TANA, ADESSO)
    expect(patch.sconto).toEqual({ codice: 'TANA-100', percentuale: 100, durata_mesi: null, dal: ADESSO.toISOString(), fino: null })
    expect(patch.abbonamento).toMatchObject({ stato: 'attivo', origine: 'sconto', pagato_fino_al: null, dal: '2026-10-24T00:00:00.000Z' })
    const cliente = { ...aMano, ...patch }
    expect(scadenzaPagamento(cliente)).toBeNull()
    const lic = licenzaProtetta({ stato: 'attiva', interna: true }, cliente)
    expect(lic.valida_fino).toBeNull()
    // Tutti i servizi attivi: il piano Completo, fatture comprese.
    expect(Object.values(lic.moduli).every((v) => v === true)).toBe(true)
    expect(lic.moduli.fatture).toBe(true)
  })

  it('100% a tempo: pagato fino alla fine dello sconto, poi grazia e sospensione di sempre', () => {
    const { patch } = s.scontoApplicato(aMano, { ...TANA, codice: 'ANNO-1', durata_mesi: 12 }, ADESSO)
    expect(patch.abbonamento).toMatchObject({ stato: 'attivo', origine: 'manuale', pagato_fino_al: '2027-11-02' })
    expect(scadenzaPagamento({ ...aMano, ...patch })).toBe('2027-11-09T23:59:59.000Z')
  })

  it('uno sconto parziale cambia solo il prezzo, non il pagamento', () => {
    const { patch } = s.scontoApplicato(aMano, { ...TANA, codice: 'META', percentuale: 50 }, ADESSO)
    expect(patch).toEqual({ sconto: expect.objectContaining({ codice: 'META', percentuale: 50 }) })
  })

  it('niente con un codice disattivato, un 100% su Stripe o su un Free', () => {
    expect(s.scontoApplicato(aMano, { ...TANA, attivo: false }).errore).toMatch(/disattivato/)
    expect(s.scontoApplicato(aMano, null).errore).toMatch(/sconosciuto/)
    expect(s.scontoApplicato({ abbonamento: { origine: 'stripe' } }, TANA).errore).toMatch(/Stripe/)
    expect(s.scontoApplicato({ abbonamento: { origine: 'gratuito' } }, TANA).errore).toMatch(/Free/)
    // Un parziale su Stripe sì: cambia il prezzo mostrato.
    expect(s.scontoApplicato({ abbonamento: { origine: 'stripe' } }, { ...TANA, percentuale: 20 }).errore).toBeUndefined()
  })

  it('tolto un 100% illimitato, è un piano a mano pagato fino a oggi', () => {
    expect(s.scontoTolto({ abbonamento: { stato: 'attivo', origine: 'sconto' } }, ADESSO).patch).toEqual({ sconto: null, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-02' } })
    expect(s.scontoTolto({ abbonamento: { origine: 'manuale', pagato_fino_al: '2027-01-01' } }, ADESSO).patch).toEqual({ sconto: null })
  })
})

describe('nel sito', () => {
  const conSconto = (extra = {}) => ({ sconto: { codice: 'META', percentuale: 50, fino: null, ...extra } })

  it('il prezzo dopo lo sconto, al centesimo', () => {
    expect(prezzoConSconto(49, conSconto(), ADESSO)).toBe(24.5)
    expect(prezzoConSconto(49, { sconto: { codice: 'TANA-100', percentuale: 100 } }, ADESSO)).toBe(0)
    expect(prezzoConSconto(33, { sconto: { codice: 'X', percentuale: 33 } }, ADESSO)).toBe(22.11)
    expect(prezzoConSconto(49, {}, ADESSO)).toBe(49)
  })

  it('uno sconto a tempo finito non vale più', () => {
    expect(scontoAttivo(conSconto({ fino: '2026-11-02' }), ADESSO)).not.toBeNull()
    expect(scontoAttivo(conSconto({ fino: '2026-11-01' }), ADESSO)).toBeNull()
    expect(prezzoConSconto(49, conSconto({ fino: '2026-10-01' }), ADESSO)).toBe(49)
    expect(scontoAttivo({ sconto: { codice: 'X' } }, ADESSO)).toBeNull()
  })

  it('a parole', () => {
    expect(scontoDetto({ sconto: { codice: 'TANA-100', percentuale: 100, fino: null } }, ADESSO)).toBe('TANA-100, 100%, illimitato')
    expect(scontoDetto(conSconto({ fino: '2026-12-31' }), ADESSO)).toMatch(/^META, 50% fino al 31\/12\/2026$/)
    expect(scontoDetto({}, ADESSO)).toBeNull()
  })
})

describe('le regole', () => {
  const regole = readFileSync('firestore.rules', 'utf8')

  // Verifica del 02/11/2026: la regola vietava un elenco e lasciava passare
  // moduli, terminali e prove, che la regia trasforma in licenza.
  it('il titolare cambia solo i suoi dati anagrafici, mai moduli, terminali, prove o sconto', () => {
    expect(regole).toContain("affectedKeys().hasOnly(['locale', 'fatturazione', 'referente', 'consensi'])")
    expect(regole).not.toContain("affectedKeys().hasAny(['piano', 'abbonamento', 'uid', 'slug', 'interna', 'esistente'])")
  })

  it('i codici li legge solo l’admin, e li scrivono solo le Functions', () => {
    const blocco = regole.slice(regole.indexOf('match /sconti/{codice}'), regole.indexOf('match /impostazioni/{doc}'))
    expect(blocco).toContain('allow read: if admin();')
    expect(blocco).toContain('allow write: if false;')
  })
})
