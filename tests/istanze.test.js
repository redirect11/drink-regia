'use strict'

// LO STATO DI UN'ISTANZA (REQ-FLOTTA-004): da quello che c'è nei documenti
// a una parola piana, e la regola di quando si può chiedere l'attivazione.

import { describe, it, expect } from 'vitest'
import { STATI, statoIstanza, statoDetto, puoAttivare, progettoDi, urlDi, riduzioneDetta } from '../src/lib/istanze.js'

describe('statoIstanza', () => {
  it('l’istanza vince sulla richiesta, e senza niente è «da attivare»', () => {
    expect(statoIstanza(null, null)).toBe(STATI.DA_ATTIVARE)
    expect(statoIstanza(null, { stato: STATI.IN_CODA })).toBe(STATI.IN_CODA)
    expect(statoIstanza({ stato: STATI.ATTIVA }, { stato: STATI.IN_CODA })).toBe(STATI.ATTIVA)
    expect(statoDetto(STATI.ATTIVA)).toBe('Attiva')
    expect(statoDetto('boh')).toBe('Non ancora attivata')
  })
})

describe('puoAttivare', () => {
  const cliente = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base' }

  it('serve un piano', () => {
    expect(puoAttivare({ ...cliente, piano: null }, null, null)).toEqual({ ok: false, perche: expect.stringMatching(/piano/) })
  })

  it('con un abbonamento non attivo si ferma', () => {
    expect(puoAttivare({ ...cliente, abbonamento: { stato: 'scaduto' } }, null, null).ok).toBe(false)
    expect(puoAttivare({ ...cliente, abbonamento: { stato: 'attivo' } }, null, null).ok).toBe(true)
  })

  it('non si chiede due volte: in coda, in corso o attiva, niente tasto', () => {
    expect(puoAttivare(cliente, null, { stato: STATI.IN_CODA }).ok).toBe(false)
    expect(puoAttivare(cliente, { stato: STATI.ATTIVA }, null).ok).toBe(false)
    // Dopo un errore sì: si riprova.
    expect(puoAttivare(cliente, { stato: STATI.ERRORE }, null).ok).toBe(true)
  })
})

// La richiesta non la costruisce più il browser (audit del 22/10/2026, C2):
// la scrive la Function, provata in tests/provisioning.test.js. Qui resta
// come la dashboard racconta gli stati.
describe('gli stati raccontati e i nomi', () => {
  // REQ-FLOTTA-011: col deploy automatico spento la richiesta aspetta l'admin.
  it('una richiesta «da approvare» si racconta, e non si chiede di nuovo', () => {
    expect(statoDetto(STATI.DA_APPROVARE)).toMatch(/autorizzazione/)
    expect(puoAttivare({ uid: 'u1', slug: 'bar-mario', piano: 'base' }, null, { stato: STATI.DA_APPROVARE }).ok).toBe(false)
  })

  it('il progetto e l’indirizzo nascono dallo slug', () => {
    expect(progettoDi('bar-mario')).toBe('drinkpos-bar-mario')
    expect(urlDi('bar-mario')).toMatch(/^https:\/\/bar-mario\./)
  })
})

describe('riduzioneDetta', () => {
  it('quando arriva al locale una licenza che toglie qualcosa, e cosa toglie (REQ-FLOTTA-024)', () => {
    const detta = riduzioneDetta({ riduzione_al_taglio: { dal: '2026-11-02T04:00:00.000Z', cosa: ['il modulo magazzino', 'i terminali da 2 a 1'] } })
    expect(detta).toMatch(/^Dal taglio della giornata \(.*05:00.*\): il modulo magazzino, i terminali da 2 a 1\.$/)
    expect(riduzioneDetta({ riduzione_al_taglio: { dal: '2026-11-02T04:00:00.000Z' } })).toMatch(/05:00\)\.$/)
    expect(riduzioneDetta({ riduzione_al_taglio: null })).toBeNull()
    expect(riduzioneDetta(null)).toBeNull()
  })
})
