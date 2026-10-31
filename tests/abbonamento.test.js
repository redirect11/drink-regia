'use strict'

// L'ABBONAMENTO CON STRIPE (REQ-FLOTTA-007): dalla scelta alle righe del
// Checkout, dagli eventi del webhook al documento del cliente. Logica
// pura delle Functions, provata senza chiavi.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chiaveStripeVera, sceltaPulita, righeCheckout, metadatiDi, aggiornamentoDaEvento } = require('../functions/lib/abbonamento.js')
const listino = require('../functions/piani.json')

describe('sceltaPulita', () => {
  it('toglie moduli sconosciuti o già inclusi, e i terminali partono da 1', () => {
    expect(sceltaPulita({ piano: 'completo', moduli: ['staff', 'x'], terminali: 0 })).toEqual({ piano: 'completo', moduli: [], terminali: 1 })
    expect(sceltaPulita({ piano: 'oro', moduli: ['staff', 'staff'], terminali: '3' })).toEqual({ piano: 'base', moduli: ['staff'], terminali: 3 })
  })
})

describe('righeCheckout', () => {
  it('piano, moduli in più e terminali oltre quelli inclusi, in centesimi e mensili', () => {
    const righe = righeCheckout({ piano: 'base', moduli: ['staff'], terminali: 2 })
    expect(righe.map((r) => [r.price_data.product_data.name, r.price_data.unit_amount, r.quantity])).toEqual([
      ['Piano Base', listino.piani.base.prezzo * 100, 1],
      ['Personale e ore', 1000, 1],
      ['Terminale in più', listino.terminale_in_piu * 100, 1],
    ])
    expect(righe.every((r) => r.price_data.recurring.interval === 'month' && r.price_data.currency === 'eur')).toBe(true)
  })

  it('il completo è una riga sola', () => {
    expect(righeCheckout({ piano: 'completo', moduli: listino.moduli.map((m) => m.id), terminali: 2 })).toHaveLength(1)
  })
})

describe('metadatiDi', () => {
  it('sono stringhe, con la scelta pulita', () => {
    expect(metadatiDi('u1', { piano: 'base', moduli: ['magazzino', 'staff'], terminali: 2 })).toEqual({
      uid: 'u1',
      piano: 'base',
      moduli: 'magazzino,staff',
      terminali: '2',
    })
  })
})

describe('aggiornamentoDaEvento', () => {
  const ora = new Date('2026-10-22T10:00:00Z')

  it('il checkout completato scrive piano, moduli e abbonamento attivo', () => {
    const a = aggiornamentoDaEvento(
      'checkout.session.completed',
      { customer: 'cus_1', subscription: 'sub_1', metadata: { uid: 'u1', piano: 'base', moduli: 'staff', terminali: '2' } },
      ora
    )
    expect(a).toEqual({
      uid: 'u1',
      patch: {
        piano: 'base',
        moduli: ['staff'],
        terminali: 2,
        abbonamento: { stato: 'attivo', origine: 'stripe', stripe_customer: 'cus_1', stripe_subscription: 'sub_1', dal: '2026-10-22T10:00:00.000Z' },
      },
    })
  })

  it('un abbonamento modificato porta la scelta nuova dai metadati (REQ-FLOTTA-010)', () => {
    const a = aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', metadata: { piano: 'completo', moduli: '', terminali: '3' } }, ora)
    expect(a).toEqual({ stripe_subscription: 'sub_1', patch: { piano: 'completo', moduli: [], terminali: 3, 'abbonamento.aggiornato_il': '2026-10-22T10:00:00.000Z' } })
    expect(aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', metadata: {} }, ora)).toBeNull()
  })

  // REQ-FLOTTA-023: lo stato del locale lo dice lo stato dell'abbonamento,
  // non il singolo pagamento. Stripe ritenta (in sospeso), poi, finiti i
  // tentativi, «non pagato»; il cambio di stato fa il resto.
  it('lo stato della subscription diventa quello del cliente, col rinnovo', () => {
    const fine = Date.parse('2026-11-22T00:00:00Z') / 1000
    const stato = (status, extra = {}) => aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', metadata: {}, status, ...extra }, ora)?.patch
    expect(stato('past_due')['abbonamento.stato']).toBe('in sospeso')
    expect(stato('unpaid')['abbonamento.stato']).toBe('non pagato')
    expect(stato('active')['abbonamento.stato']).toBe('attivo')
    expect(stato('trialing')['abbonamento.stato']).toBe('attivo')
    expect(stato('canceled')['abbonamento.stato']).toBe('disdetto')
    expect(stato('incomplete')).toBeUndefined()
    expect(stato('active', { current_period_end: fine })['abbonamento.rinnovo_il']).toBe('2026-11-22T00:00:00.000Z')
    expect(stato('active', { items: { data: [{ current_period_end: fine }] } })['abbonamento.rinnovo_il']).toBe('2026-11-22T00:00:00.000Z')
    // Piano e stato insieme.
    expect(aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', status: 'active', metadata: { piano: 'base' } }, ora).patch).toMatchObject({ piano: 'base', 'abbonamento.stato': 'attivo' })
  })

  it('un pagamento fallito si registra e basta, una disdetta chiude, un evento ignoto non fa niente', () => {
    // Stripe ritenta: lo stato lo porta la subscription (REQ-FLOTTA-023).
    expect(aggiornamentoDaEvento('invoice.payment_failed', { subscription: 'sub_1' }, ora).patch).toEqual({ 'abbonamento.ultimo_fallimento': '2026-10-22T10:00:00.000Z' })
    expect(aggiornamentoDaEvento('customer.subscription.deleted', { id: 'sub_1' }, ora)).toEqual({
      stripe_subscription: 'sub_1',
      patch: { 'abbonamento.stato': 'disdetto', 'abbonamento.aggiornato_il': '2026-10-22T10:00:00.000Z' },
    })
    expect(aggiornamentoDaEvento('charge.refunded', { id: 'ch_1' }, ora)).toBeNull()
    expect(aggiornamentoDaEvento('checkout.session.completed', { metadata: {} }, ora)).toBeNull()
  })
})

// In produzione il segreto di Stripe nasce col segnaposto finché non ci
// sono le chiavi live (30/10/2026): un segnaposto vale «non configurato».
describe('la chiave di Stripe', () => {
  it('vera: segreta o ristretta, di test o live', () => {
    for (const k of ['sk_test_abc123', 'sk_live_ABC123', 'rk_live_x9', ' sk_test_abc ']) expect(chiaveStripeVera(k)).toBe(true)
  })
  it('il segnaposto, il vuoto e le chiavi pubbliche non sono chiavi', () => {
    for (const k of ['non-configurato', '', null, undefined, 'pk_live_abc', 'sk_abc', 'whsec_abc']) expect(chiaveStripeVera(k)).toBe(false)
  })
})
