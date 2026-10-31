'use strict'

// LE SCADENZE A EVENTI (REQ-FLOTTA-023). L'utente, 31/10/2026: «non possiamo
// mettere un qualcosa che tiene traccia del periodo delle licenze ed esegue
// operazioni in base ad eventi piuttosto che farlo ogni mattina?». Niente
// giri quotidiani: il locale cambia quando cambia lo stato del suo
// abbonamento (Stripe, o la scadenza di un pagamento a mano), e ogni altra
// scadenza ha un compito alla sua data. Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const s = require('../functions/lib/scadenze.js')
const { cambioAdmin } = require('../functions/lib/cambiopiano.js')

const ADESSO = new Date('2026-11-01T10:00:00Z')
const GIORNO = 86400000
const SOLO_PAGANTI = { a_scelta: false, solo_finche_paga: true }
const cliente = (stato, extra = {}) => ({ slug: 'bar-mario', piano: 'base', abbonamento: { stato, ...extra } })
const attiva = (extra = {}) => ({ stato: 'attiva', ...extra })

describe('i compiti alla loro data', () => {
  it('arrivano alla data, o fra 29 giorni se è più in là (Cloud Tasks non va oltre i 30)', () => {
    const fra10 = new Date(ADESSO.getTime() + 10 * GIORNO).toISOString()
    const fra90 = new Date(ADESSO.getTime() + 90 * GIORNO).toISOString()
    expect(s.orarioCompito(fra10, ADESSO).toISOString()).toBe(fra10)
    expect(s.orarioCompito(fra90, ADESSO).getTime()).toBe(ADESSO.getTime() + s.ANTICIPO_MAX)
    // Arrivato prima della data: si riprogramma; alla data no.
    expect(s.daRiprogrammare(fra90, ADESSO)).toBe(true)
    expect(s.daRiprogrammare(ADESSO.toISOString(), ADESSO)).toBe(false)
  })

  it('un nome per compito: lo stesso non si programma due volte, uno spostato è un altro', () => {
    const a = s.idCompito('pagamento', 'bar-mario', '2026-12-01T00:00:00Z', ADESSO)
    expect(a).toBe(s.idCompito('pagamento', 'bar-mario', '2026-12-01T00:00:00Z', ADESSO))
    expect(a).not.toBe(s.idCompito('pagamento', 'bar-mario', '2026-12-31T00:00:00Z', ADESSO))
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(s.idCompito('prova', 'bar mario/x', '2026-12-01T00:00:00Z', ADESSO)).toMatch(/^prova-bar_mario_x-/)
  })
})

describe('il pagamento a mano: «pagato fino al»', () => {
  it('scade alla fine del giorno pagato, più i giorni di grazia', () => {
    const c = cliente('attivo', { origine: 'manuale', pagato_fino_al: '2026-11-30' })
    expect(s.scadenzaPagamento(c, 7)).toBe('2026-12-07T23:59:59.000Z')
    expect(s.scadenzaPagamento(c, 0)).toBe('2026-11-30T23:59:59.000Z')
  })

  it('senza data, con Stripe o col Free non scade', () => {
    expect(s.scadenzaPagamento(cliente('attivo', { origine: 'manuale' }))).toBeNull()
    expect(s.scadenzaPagamento(cliente('attivo', { origine: 'stripe', pagato_fino_al: '2026-11-30' }))).toBeNull()
    expect(s.scadenzaPagamento(cliente('attivo', { origine: 'gratuito' }))).toBeNull()
  })

  it('il compito vale solo se la scadenza è ancora quella e l’abbonamento è attivo', () => {
    const c = cliente('attivo', { origine: 'manuale', pagato_fino_al: '2026-11-30' })
    const quando = s.scadenzaPagamento(c)
    const dopo = new Date(Date.parse(quando) + 1000)
    expect(s.pagamentoScaduto(c, quando, { adesso: dopo })).toBe(true)
    // Ha pagato di nuovo: la scadenza si è spostata, il compito vecchio no.
    const ripagato = cliente('attivo', { origine: 'manuale', pagato_fino_al: '2026-12-31' })
    expect(s.pagamentoScaduto(ripagato, quando, { adesso: dopo })).toBe(false)
    expect(s.pagamentoScaduto(cliente('non pagato', { origine: 'manuale', pagato_fino_al: '2026-11-30' }), quando, { adesso: dopo })).toBe(false)
    expect(s.pagamentoScaduto(c, quando, { adesso: new Date(Date.parse(quando) - 1000) })).toBe(false)
  })

  it('la data dell’admin: un giorno, vuota, o sbagliata', () => {
    expect(s.dataPagata('2026-11-30')).toBe('2026-11-30')
    expect(s.dataPagata('2026-11-30T12:00:00Z')).toBe('2026-11-30')
    expect(s.dataPagata('')).toBeNull()
    expect(s.dataPagata('30/11/2026')).toBeUndefined()
    expect(s.dataPagata('2026-13-45')).toBeUndefined()
  })

  it('«Cambia piano» fuori da Stripe la scrive; una data sbagliata si rifiuta', () => {
    const c = { uid: 'u1', slug: 'bar-mario', abbonamento: {} }
    expect(cambioAdmin(c, { piano: 'base', modo: 'fuori', pagato_fino_al: '2026-11-30' }).cliente.abbonamento.pagato_fino_al).toBe('2026-11-30')
    expect(cambioAdmin(c, { piano: 'base', modo: 'fuori' }).cliente.abbonamento.pagato_fino_al).toBeNull()
    expect(cambioAdmin(c, { piano: 'base', modo: 'fuori', pagato_fino_al: 'domani' })).toMatchObject({ ok: false, perche: expect.stringMatching(/non è valida/) })
  })
})

describe('cosa fa al locale un cambio di stato dell’abbonamento', () => {
  const az = (da, a, ist = attiva(), extra = {}) => s.azioneDiPagamento(cliente(da), { ...cliente(a), ...extra }, ist)

  it('Stripe ritenta: in sospeso non cambia niente; finiti i tentativi il locale si ferma', () => {
    expect(az('attivo', 'in sospeso')).toBeNull()
    expect(az('in sospeso', 'non pagato')).toEqual({ azione: 'sospendi', motivo: 'pagamento non ricevuto' })
    expect(az('attivo', 'non pagato')).toEqual({ azione: 'sospendi', motivo: 'pagamento non ricevuto' })
  })

  it('con «solo finché si paga» torna al Free invece di fermarsi', () => {
    expect(az('in sospeso', 'non pagato', attiva({ condizioni_aggiornamenti: SOLO_PAGANTI }))).toEqual({ azione: 'ripiega', motivo: null })
  })

  it('disdetto si chiude; già chiuso no', () => {
    expect(az('attivo', 'disdetto')).toEqual({ azione: 'chiudi', motivo: 'abbonamento disdetto' })
    expect(az('attivo', 'disdetto', attiva({ licenza_stato: 'chiusa' }))).toBeNull()
  })

  it('torna a pagare: si riattiva solo una sospensione per il pagamento, e il Free torna al suo piano', () => {
    expect(az('non pagato', 'attivo', attiva({ licenza_stato: 'sospesa', licenza_per: 'pagamento' }))).toEqual({ azione: 'riattiva', motivo: null })
    // Sospeso dall'admin: lo riattiva l'admin.
    expect(az('non pagato', 'attivo', attiva({ licenza_stato: 'sospesa', licenza_per: 'admin' }))).toBeNull()
    expect(az('non pagato', 'attivo', attiva({ ripiego_free: { dal: '2026-10-30' } }))).toEqual({ azione: 'ripristina', motivo: null })
    expect(az('non pagato', 'attivo')).toBeNull()
  })

  it('niente per le interne, i locali non attivi, chi è già fermo, il Free, e senza cambio', () => {
    expect(az('attivo', 'non pagato', attiva({ interna: true }))).toBeNull()
    expect(az('attivo', 'non pagato', { stato: 'in corso' })).toBeNull()
    expect(az('attivo', 'non pagato', null)).toBeNull()
    expect(az('attivo', 'non pagato', attiva({ licenza_stato: 'sospesa' }))).toBeNull()
    expect(az('attivo', 'non pagato', attiva({ ripiego_free: { dal: 'x' } }))).toBeNull()
    expect(az('attivo', 'non pagato', attiva(), { piano: 'free' })).toBeNull()
    expect(az('attivo', 'attivo')).toBeNull()
  })
})
