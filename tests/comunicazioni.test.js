'use strict'

// LE COMUNICAZIONI AUTOMATICHE AL TITOLARE (REQ-FLOTTA-027). L'utente,
// 02/11/2026: «Gestire anche le comunicazioni automatiche di reminder di
// pagamenti, pagamento riuscito etc.» Con Stripe le manda Stripe; la regia
// manda i promemoria dei pagamenti a mano, il pagamento ricevuto, e il
// locale tornato al Free o riattivato.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const c = require('../functions/lib/comunicazioni.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const aMano = (extra = {}) => ({ nome_locale: 'Bar Mario', email: 'mario@example.it', abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-30', ...extra } })

describe('i promemoria di un pagamento a mano', () => {
  it('7 giorni prima di «pagato fino al» e il giorno dopo, alle 9 di Roma', () => {
    expect(c.orariPromemoria(aMano(), ADESSO)).toEqual([
      { tipo: 'prima', il: '2026-11-23T08:00:00.000Z' },
      { tipo: 'scaduto', il: '2026-12-01T08:00:00.000Z' },
    ])
    // Quelli già passati no.
    expect(c.orariPromemoria(aMano(), new Date('2026-11-25T00:00:00Z'))).toEqual([{ tipo: 'scaduto', il: '2026-12-01T08:00:00.000Z' }])
  })

  it('niente con Stripe (li manda Stripe), col Free, senza data o con l’abbonamento fermo', () => {
    expect(c.orariPromemoria({ abbonamento: { stato: 'attivo', origine: 'stripe', pagato_fino_al: '2026-11-30' } }, ADESSO)).toEqual([])
    expect(c.orariPromemoria({ abbonamento: { stato: 'attivo', origine: 'gratuito' } }, ADESSO)).toEqual([])
    expect(c.orariPromemoria(aMano({ pagato_fino_al: null }), ADESSO)).toEqual([])
    expect(c.orariPromemoria(aMano({ stato: 'non pagato' }), ADESSO)).toEqual([])
    expect(c.orariPromemoria(null, ADESSO)).toEqual([])
  })

  it('un compito riconosce il suo promemoria; con un pagamento registrato nel frattempo, niente', () => {
    expect(c.promemoriaDelCompito(aMano(), '2026-11-23T08:00:00.000Z')).toBe('prima')
    expect(c.promemoriaDelCompito(aMano(), '2026-12-01T08:00:00.000Z')).toBe('scaduto')
    expect(c.promemoriaDelCompito(aMano({ pagato_fino_al: '2026-12-31' }), '2026-11-23T08:00:00.000Z')).toBeNull()
  })

  it('un promemoria già mandato non si rimanda', () => {
    const chiave = c.chiavePromemoria(aMano(), 'prima')
    expect(chiave).toBe('2026-11-30:prima')
    expect(c.giaMandato({ avvisi_pagamento: [chiave] }, chiave)).toBe(true)
    expect(c.giaMandato({}, chiave)).toBe(false)
  })

  it('i testi: la data, e dopo la scadenza fino a quando l’app funziona', () => {
    const prima = c.emailPromemoria(aMano(), 'prima')
    expect(prima.to).toBe('mario@example.it')
    expect(prima.message.subject).toBe('Bar Mario: l\'abbonamento è pagato fino al 30 novembre 2026')
    const scaduto = c.emailPromemoria(aMano(), 'scaduto', { validaFino: '2026-12-07T23:59:59.000Z' })
    expect(scaduto.message.subject).toMatch(/il pagamento dell'abbonamento è scaduto$/)
    expect(scaduto.message.text).toMatch(/L'app continua a funzionare fino all'8 dicembre 2026/)
    expect(scaduto.message.text).toMatch(/Se hai già pagato, ignora questo messaggio/)
    expect(c.emailPromemoria(aMano(), 'scaduto').message.text).not.toMatch(/continua a funzionare/)
  })
})

describe('l’articolo davanti alla data', () => {
  it('il 30, l’8, l’11, il 1°; al 30, all’8, al 1°', () => {
    expect(c.conArticolo('2026-11-30T10:00:00Z')).toBe('il 30 novembre 2026')
    expect(c.conArticolo('2026-12-08T10:00:00Z')).toBe("l'8 dicembre 2026")
    expect(c.conArticolo('2026-12-11T10:00:00Z')).toBe("l'11 dicembre 2026")
    expect(c.conArticolo('2026-12-01T10:00:00Z')).toBe('il 1° dicembre 2026')
    expect(c.conArticolo('2026-11-30T10:00:00Z', 'al')).toBe('al 30 novembre 2026')
    expect(c.conArticolo('2026-12-08T10:00:00Z', 'al')).toBe("all'8 dicembre 2026")
    expect(c.conArticolo('2026-12-01T10:00:00Z', 'al')).toBe('al 1° dicembre 2026')
  })
})

describe('il pagamento ricevuto e il locale che cambia', () => {
  it('il pagamento ricevuto dice fino a quando è pagato', () => {
    expect(c.emailPagamentoRicevuto(aMano({ pagato_fino_al: '2026-12-31' })).message.text).toMatch(/è pagato fino al 31 dicembre 2026/)
  })

  it('al Free i dati restano; di nuovo attivo, e la cancellazione annullata se c’era', () => {
    expect(c.emailStato(aMano(), 'ripiega').message.text).toMatch(/passato al piano Free.*i dati restano tutti/s)
    expect(c.emailStato(aMano(), 'riattiva').message.text).toMatch(/di nuovo attivo con il suo piano, e la cancellazione dei dati è annullata/)
    expect(c.emailStato(aMano(), 'ripristina').message.text).not.toMatch(/cancellazione/)
    expect(c.emailStato(aMano(), 'sospendi')).toBeNull()
  })

  it('senza email non si scrive niente', () => {
    expect(c.emailPagamentoRicevuto({ abbonamento: { pagato_fino_al: '2026-12-31' } })).toBeNull()
    expect(c.emailStato({ nome_locale: 'Bar' }, 'ripiega')).toBeNull()
  })
})
