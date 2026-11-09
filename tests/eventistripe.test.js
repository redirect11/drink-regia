'use strict'

// GLI EVENTI DI STRIPE UNA VOLTA SOLA E IN ORDINE (REQ-FLOTTA-036, audit
// M4): il registro per event.id e l'ordine degli aggiornamenti del
// cliente. Logica pura; la transazione sta in functions/index.js.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { daElaborare, presaInCarico, idEventoValido, inOrdine, PRESA_MS, CONSERVA_MS } = require('../functions/lib/eventistripe.js')
const { aggiornamentoDaEvento } = require('../functions/lib/abbonamento.js')

const ADESSO = new Date('2026-11-02T10:00:00Z')
const T = 1793613600 // secondi, un istante qualunque: event.created

describe('il registro degli eventi', () => {
  it('un evento mai visto si elabora; uno già fatto no, mai più', () => {
    expect(daElaborare(null, ADESSO)).toBe('elabora')
    expect(daElaborare({ stato: 'fatto', preso_il: '2026-10-01T00:00:00Z' }, ADESSO)).toBe('fatto')
  })

  it('uno in corso aspetta; se la presa in carico è scaduta (Function morta a metà) si riprende', () => {
    const presoDa = (ms) => ({ stato: 'in corso', preso_il: new Date(ADESSO.getTime() - ms).toISOString() })
    expect(daElaborare(presoDa(10_000), ADESSO)).toBe('in corso')
    expect(daElaborare(presoDa(PRESA_MS + 1), ADESSO)).toBe('elabora')
    expect(daElaborare({ stato: 'in corso' }, ADESSO)).toBe('elabora')
    // Più lunga del timeout della Function (60 s).
    expect(PRESA_MS).toBeGreaterThan(60_000)
  })

  it('la riga della presa in carico, con la scadenza per il TTL di Firestore', () => {
    const r = presaInCarico({ id: 'evt_1', type: 'invoice.paid', created: T, livemode: false }, ADESSO)
    expect(r).toMatchObject({ tipo: 'invoice.paid', creato: T, livemode: false, stato: 'in corso', preso_il: ADESSO.toISOString(), tentativi: 1 })
    expect(r.scade_il).toBeInstanceOf(Date)
    expect(r.scade_il.getTime() - ADESSO.getTime()).toBe(CONSERVA_MS)
    // Oltre i 30 giorni in cui un evento si rimanda a mano da Stripe.
    expect(CONSERVA_MS).toBeGreaterThan(30 * 24 * 3600 * 1000)
  })

  it('l’id è quello di un evento di Stripe: è il nome di un documento', () => {
    expect(idEventoValido('evt_1NqX2bL')).toBe(true)
    expect(idEventoValido('evt_1/../clienti')).toBe(false)
    expect(idEventoValido('')).toBe(false)
  })
})

describe('gli aggiornamenti in ordine', () => {
  const cliente = (abbonamento) => ({ uid: 'u1', piano: 'base', abbonamento: { origine: 'stripe', stripe_subscription: 'sub_1', ...abbonamento } })
  const pagata = aggiornamentoDaEvento('invoice.paid', { subscription: 'sub_1', lines: { data: [{ period: { end: T + 30 * 86400 } }] } }, ADESSO)
  const disdetta = aggiornamentoDaEvento('customer.subscription.deleted', { id: 'sub_1' }, ADESSO)
  const sospesa = aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', status: 'past_due', metadata: {} }, ADESSO)
  const completo = aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: { piano: 'completo', moduli: '', terminali: '3' } }, ADESSO)

  it('un evento nuovo si scrive e porta avanti l’orologio del cliente', () => {
    const p = inOrdine(cliente({ stato: 'attivo', evento_stripe_creato: T - 10 }), sospesa, { creato: T })
    expect(p['abbonamento.stato']).toBe('in sospeso')
    expect(p['abbonamento.evento_stripe_creato']).toBe(T)
  })

  it('un invoice.paid in ritardo non riaccende un abbonamento disdetto (audit M4)', () => {
    const p = inOrdine(cliente({ stato: 'disdetto', evento_stripe_creato: T }), pagata, { creato: T - 100 })
    expect(p).not.toHaveProperty(['abbonamento.stato'])
    // Il pagamento c'è stato: resta scritto.
    expect(p['abbonamento.ultimo_pagamento']).toBe(ADESSO.toISOString())
  })

  it('disdetto non si riapre da Stripe nemmeno con un orologio più avanti', () => {
    const p = inOrdine(cliente({ stato: 'disdetto', evento_stripe_creato: T }), pagata, { creato: T + 100 })
    expect(p).not.toHaveProperty(['abbonamento.stato'])
  })

  it('una modifica vecchia non riporta indietro piano e stato', () => {
    const p = inOrdine(cliente({ stato: 'in sospeso', evento_stripe_creato: T }), completo, { creato: T - 1 })
    expect(p).toBeNull()
  })

  it('a parità di secondo si scrive: Stripe manda insieme fattura e subscription', () => {
    const p = inOrdine(cliente({ stato: 'in sospeso', evento_stripe_creato: T }), pagata, { creato: T })
    expect(p['abbonamento.stato']).toBe('attivo')
  })

  it('pagato_fino non torna indietro', () => {
    const avanti = new Date((T + 400 * 86400) * 1000).toISOString()
    const p = inOrdine(cliente({ stato: 'attivo', pagato_fino: avanti, evento_stripe_creato: T - 5 }), pagata, { creato: T })
    expect(p).not.toHaveProperty(['abbonamento.pagato_fino'])
    expect(p['abbonamento.stato']).toBe('attivo')
  })

  it('la disdetta arriva anche dopo eventi più recenti: chiude', () => {
    const p = inOrdine(cliente({ stato: 'attivo', evento_stripe_creato: T }), disdetta, { creato: T + 5 })
    expect(p['abbonamento.stato']).toBe('disdetto')
  })

  it('un abbonamento messo fuori da Stripe dall’admin non lo cambiano gli eventi della vecchia subscription', () => {
    const p = inOrdine(cliente({ origine: 'manuale', stato: 'attivo' }), disdetta, { creato: T })
    expect(p).toBeNull()
  })

  it('il checkout completato apre la subscription; una subscription nuova dopo una disdetta riparte', () => {
    const checkout = aggiornamentoDaEvento('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_2', metadata: { uid: 'u1', piano: 'base' } }, ADESSO)
    const p = inOrdine(cliente({ stato: 'disdetto', evento_stripe_creato: T + 999 }), checkout, { creato: T })
    expect(p.abbonamento).toMatchObject({ stato: 'attivo', stripe_subscription: 'sub_2', evento_stripe_creato: T })
  })

  it('un checkout della stessa subscription più vecchio degli eventi già scritti non li scavalca', () => {
    const checkout = aggiornamentoDaEvento('checkout.session.completed', { customer: 'cus_1', subscription: 'sub_1', metadata: { uid: 'u1', piano: 'base' } }, ADESSO)
    expect(inOrdine(cliente({ stato: 'in sospeso', evento_stripe_creato: T }), checkout, { creato: T - 50 })).toBeNull()
  })

  it('un fallimento si registra sempre: è un fatto, non uno stato', () => {
    const fallita = aggiornamentoDaEvento('invoice.payment_failed', { subscription: 'sub_1' }, ADESSO)
    expect(inOrdine(cliente({ stato: 'attivo', evento_stripe_creato: T }), fallita, { creato: T - 100 })).toEqual({ 'abbonamento.ultimo_fallimento': ADESSO.toISOString() })
  })
})

// Le regole di eventi_stripe/{id} (solo l'admin legge, nessun client
// scrive) si provano sull'emulatore: tests/regole/registri.test.js.
describe('il webhook', () => {
  const index = readFileSync('functions/index.js', 'utf8')

  it('il webhook passa dal registro, in transazione, prima di ogni effetto', () => {
    const webhook = index.slice(index.indexOf('exports.stripeWebhook'), index.indexOf('async function elaboraEventoStripe'))
    expect(webhook).toContain('eventi_stripe/${evento.id}')
    expect(webhook).toContain('db.runTransaction')
    expect(webhook.indexOf('daElaborare')).toBeLessThan(webhook.indexOf('elaboraEventoStripe(evento)'))
    expect(webhook).toContain('registro.delete()')
  })

  it('il cliente si aggiorna in transazione, in ordine', () => {
    const elabora = index.slice(index.indexOf('async function elaboraEventoStripe'))
    expect(elabora.slice(0, elabora.indexOf('\n}\n'))).toMatch(/runTransaction[\s\S]*eventiStripe\.inOrdine/)
  })
})
