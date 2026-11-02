'use strict'

// L'ABBONAMENTO CON STRIPE (REQ-FLOTTA-007, REQ-FLOTTA-021): dalla scelta
// alle righe del Checkout, dagli eventi del webhook al documento del
// cliente. Logica pura delle Functions, provata senza chiavi.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  chiaveStripeVera,
  sceltaPulita,
  centesimi,
  righeCheckout,
  rigaAttivazione,
  metadatiDi,
  giorniDiProva,
  sessioneCheckout,
  intervalloDi,
  aggiornamentoDaEvento,
  prenotazioneDaRilasciare,
  fondatoreDaConfermare,
  DURATA_SESSIONE_MS,
} = require('../functions/lib/abbonamento.js')
const listino = require('../functions/piani.json')

describe('sceltaPulita', () => {
  it('toglie moduli sconosciuti o già inclusi, e i terminali partono da 1', () => {
    expect(sceltaPulita({ piano: 'completo', moduli: ['staff', 'x'], terminali: 0 })).toEqual({ piano: 'completo', moduli: [], terminali: 1, intervallo: 'mese' })
    expect(sceltaPulita({ piano: 'oro', moduli: ['staff', 'staff'], terminali: '3' })).toEqual({ piano: 'base', moduli: ['staff'], terminali: 3, intervallo: 'mese' })
  })

  it('l’intervallo è mese o anno; tutto il resto vale mese (REQ-FLOTTA-021)', () => {
    expect(sceltaPulita({ intervallo: 'anno' }).intervallo).toBe('anno')
    for (const v of ['mese', 'year', 'annuale', '', null, 12, { anno: true }]) expect(sceltaPulita({ intervallo: v }).intervallo).toBe('mese')
  })
})

describe('centesimi', () => {
  it('interi, anche dai prezzi coi decimali', () => {
    expect(centesimi(32.7)).toBe(3270)
    expect(32.7 * 100).not.toBe(3270)
    expect(centesimi(82)).toBe(8200)
    expect(centesimi(0.1 + 0.2)).toBe(30)
    expect(centesimi('x')).toBe(0)
  })
})

describe('righeCheckout', () => {
  const voci = (righe) => righe.map((r) => [r.price_data.product_data.name, r.price_data.unit_amount, r.quantity])

  it('piano, moduli in più e terminali oltre i tre inclusi, in centesimi interi e mensili', () => {
    const righe = righeCheckout({ piano: 'base', moduli: ['staff'], terminali: 5 })
    expect(voci(righe)).toEqual([
      ['Piano Base', 3270, 1],
      ['Personale e ore', 1000, 1],
      ['Terminale in più', 1200, 2],
    ])
    expect(righe.every((r) => r.price_data.recurring.interval === 'month' && r.price_data.currency === 'eur')).toBe(true)
    expect(righe.every((r) => Number.isInteger(r.price_data.unit_amount))).toBe(true)
  })

  it('fino a tre terminali nessuna riga in più', () => {
    expect(voci(righeCheckout({ piano: 'base', terminali: 3 }))).toEqual([['Piano Base', 3270, 1]])
  })

  it('il completo è una riga sola', () => {
    expect(righeCheckout({ piano: 'completo', moduli: listino.moduli.map((m) => m.id), terminali: 3 })).toHaveLength(1)
  })

  it('annuale: ogni riga costa dieci mensilità, all’anno (REQ-FLOTTA-021)', () => {
    const righe = righeCheckout({ piano: 'base', moduli: ['staff'], terminali: 4, intervallo: 'anno' })
    expect(voci(righe)).toEqual([
      ['Piano Base', 32700, 1],
      ['Personale e ore', 10000, 1],
      ['Terminale in più', 12000, 1],
    ])
    expect(righe.every((r) => r.price_data.recurring.interval === 'year')).toBe(true)
    expect(voci(righeCheckout({ piano: 'completo', intervallo: 'anno' }))).toEqual([['Piano Completo', 69000, 1]])
  })

  it('nessuna riga una tantum: le righe vanno anche sulla subscription nei cambi di piano', () => {
    expect(righeCheckout({ piano: 'base' }).every((r) => r.price_data.recurring)).toBe(true)
  })
})

describe('rigaAttivazione', () => {
  it('82 € una tantum, senza recurring; gratuita per i Fondatori', () => {
    expect(rigaAttivazione()).toEqual({ quantity: 1, price_data: { currency: 'eur', unit_amount: 8200, product_data: { name: 'Attivazione' } } })
    expect(rigaAttivazione({ fondatore: true })).toBeNull()
  })
})

describe('metadatiDi', () => {
  it('sono stringhe, con la scelta pulita', () => {
    expect(metadatiDi('u1', { piano: 'base', moduli: ['magazzino', 'staff'], terminali: 2 })).toEqual({
      uid: 'u1',
      piano: 'base',
      moduli: 'magazzino,staff',
      terminali: '2',
      intervallo: 'mese',
    })
    expect(metadatiDi('u1', { piano: 'base', intervallo: 'anno' }).intervallo).toBe('anno')
  })
})

describe('la prova al Checkout (REQ-FLOTTA-021)', () => {
  it('parte spenta dal listino: nessun giorno di prova', () => {
    expect(listino.prova_nel_checkout).toBe(false)
    expect(giorniDiProva({})).toBe(0)
  })

  // Il listino è lo stesso oggetto che legge abbonamento.js (cache di
  // require): acceso qui per la durata del test, e rimesso com'era.
  const conProva = (fn) => {
    listino.prova_nel_checkout = true
    try {
      fn()
    } finally {
      listino.prova_nel_checkout = false
    }
  }

  it('accesa: prova_giorni sul primo abbonamento, niente prova a chi ne ha già avuto uno', () => {
    conProva(() => {
      expect(giorniDiProva({ abbonamento: {} })).toBe(30)
      expect(giorniDiProva(null)).toBe(30)
      expect(giorniDiProva({ abbonamento: { stripe_subscription: 'sub_vecchia' } })).toBe(0)
      const s = sessioneCheckout({ uid: 'u1', cliente: { email: 't@x.it' }, scelta: { piano: 'base' }, ritorno: 'https://r.test' })
      expect(s.subscription_data.trial_period_days).toBe(30)
      // L'attivazione resta nella sessione: con la prova accesa Stripe la
      // addebita subito. È la domanda aperta per l'utente (REQ-FLOTTA-021).
      expect(s.line_items.some((r) => r.price_data.product_data.name === 'Attivazione')).toBe(true)
    })
  })
})

describe('sessioneCheckout', () => {
  const adesso = new Date('2026-11-02T10:00:00Z')
  const base = { uid: 'u1', cliente: { email: 't@x.it', abbonamento: {} }, ritorno: 'https://regia.test', adesso }

  it('mensile a listino: righe ricorrenti più l’attivazione, nessuno sconto, scadenza a 35 minuti', () => {
    const s = sessioneCheckout({ ...base, scelta: { piano: 'base', terminali: 4 } })
    expect(s.mode).toBe('subscription')
    expect(s.line_items.map((r) => [r.price_data.product_data.name, r.price_data.unit_amount, Boolean(r.price_data.recurring)])).toEqual([
      ['Piano Base', 3270, true],
      ['Terminale in più', 1200, true],
      ['Attivazione', 8200, false],
    ])
    expect(s.discounts).toBeUndefined()
    expect(s.customer_email).toBe('t@x.it')
    expect(s.customer).toBeUndefined()
    expect(s.metadata).toEqual({ uid: 'u1', piano: 'base', moduli: '', terminali: '4', intervallo: 'mese' })
    expect(s.subscription_data).toEqual({ metadata: s.metadata })
    expect(s.expires_at).toBe(Math.floor((adesso.getTime() + DURATA_SESSIONE_MS) / 1000))
    expect(DURATA_SESSIONE_MS).toBeGreaterThan(30 * 60 * 1000)
    expect(s.success_url).toBe('https://regia.test/dashboard?pagamento=ok')
    expect(s.cancel_url).toBe('https://regia.test/dashboard?pagamento=annullato')
  })

  it('Fondatore: il coupon, il segno nei metadati della sessione e della subscription, niente attivazione', () => {
    const s = sessioneCheckout({ ...base, scelta: { piano: 'base' }, coupon: 'fondatori-base-mese-770' })
    expect(s.discounts).toEqual([{ coupon: 'fondatori-base-mese-770' }])
    expect(s.metadata.fondatore).toBe('1')
    expect(s.subscription_data.metadata.fondatore).toBe('1')
    expect(s.line_items.map((r) => r.price_data.product_data.name)).toEqual(['Piano Base'])
  })

  it('annuale: righe all’anno, attivazione una tantum', () => {
    const s = sessioneCheckout({ ...base, scelta: { piano: 'completo', intervallo: 'anno' } })
    expect(s.line_items.map((r) => [r.price_data.unit_amount, r.price_data.recurring?.interval || null])).toEqual([
      [69000, 'year'],
      [8200, null],
    ])
    expect(s.metadata.intervallo).toBe('anno')
  })

  it('un cliente che ha già un customer Stripe lo riusa, senza email', () => {
    const s = sessioneCheckout({ ...base, cliente: { email: 't@x.it', abbonamento: { stripe_customer: 'cus_1' } }, scelta: { piano: 'base' } })
    expect(s.customer).toBe('cus_1')
    expect(s.customer_email).toBeUndefined()
  })
})

describe('intervalloDi', () => {
  it('dai metadati della subscription, o dalla prima riga per quelle nate prima', () => {
    expect(intervalloDi({ metadata: { intervallo: 'anno' } })).toBe('anno')
    expect(intervalloDi({ metadata: {}, items: { data: [{ price: { recurring: { interval: 'year' } } }] } })).toBe('anno')
    expect(intervalloDi({ metadata: {}, items: { data: [{ price: { recurring: { interval: 'month' } } }] } })).toBe('mese')
    expect(intervalloDi(null)).toBe('mese')
  })
})

describe('gli eventi dei Fondatori (REQ-FLOTTA-021)', () => {
  it('una sessione Fondatori scaduta libera la prenotazione di quella sessione', () => {
    expect(prenotazioneDaRilasciare('checkout.session.expired', { expires_at: 1793620800, metadata: { uid: 'u1', fondatore: '1' } })).toEqual({
      uid: 'u1',
      scadenza: new Date(1793620800 * 1000),
    })
    expect(prenotazioneDaRilasciare('checkout.session.expired', { metadata: { uid: 'u1', fondatore: '1' } })).toEqual({ uid: 'u1', scadenza: null })
    expect(prenotazioneDaRilasciare('checkout.session.expired', { metadata: { uid: 'u1' } })).toBeNull()
    expect(prenotazioneDaRilasciare('checkout.session.completed', { metadata: { uid: 'u1', fondatore: '1' } })).toBeNull()
  })

  it('un checkout completato da Fondatore va confermato; una ricarica AI mai', () => {
    expect(fondatoreDaConfermare('checkout.session.completed', { metadata: { uid: 'u1', fondatore: '1' } })).toBe('u1')
    expect(fondatoreDaConfermare('checkout.session.completed', { metadata: { uid: 'u1' } })).toBeNull()
    expect(fondatoreDaConfermare('checkout.session.completed', { metadata: { uid: 'u1', fondatore: '1', tipo: 'ricarica_ai' } })).toBeNull()
    expect(fondatoreDaConfermare('invoice.paid', { metadata: { uid: 'u1', fondatore: '1' } })).toBeNull()
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
        abbonamento: { stato: 'attivo', intervallo: 'mese', origine: 'stripe', stripe_customer: 'cus_1', stripe_subscription: 'sub_1', dal: '2026-10-22T10:00:00.000Z' },
      },
    })
    const annuale = aggiornamentoDaEvento('checkout.session.completed', { metadata: { uid: 'u1', piano: 'base', intervallo: 'anno' } }, ora)
    expect(annuale.patch.abbonamento.intervallo).toBe('anno')
  })

  it('una fattura pagata conferma, e il rinnovo è la fine più lontana fra le righe (l’attivazione finisce subito)', () => {
    const a = aggiornamentoDaEvento(
      'invoice.paid',
      { subscription: 'sub_1', lines: { data: [{ period: { end: 1793620800 } }, { period: { end: 1796299200 } }] } },
      ora
    )
    expect(a).toEqual({
      stripe_subscription: 'sub_1',
      patch: { 'abbonamento.stato': 'attivo', 'abbonamento.ultimo_pagamento': '2026-10-22T10:00:00.000Z', 'abbonamento.rinnovo_il': new Date(1796299200 * 1000).toISOString() },
    })
    expect(aggiornamentoDaEvento('invoice.paid', { subscription: 'sub_1' }, ora).patch['abbonamento.rinnovo_il']).toBeUndefined()
    expect(aggiornamentoDaEvento('invoice.paid', {}, ora)).toBeNull()
  })

  it('un abbonamento modificato porta la scelta nuova dai metadati (REQ-FLOTTA-010)', () => {
    const a = aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', metadata: { piano: 'completo', moduli: '', terminali: '3' } }, ora)
    expect(a).toEqual({ stripe_subscription: 'sub_1', patch: { piano: 'completo', moduli: [], terminali: 3, 'abbonamento.aggiornato_il': '2026-10-22T10:00:00.000Z' } })
    expect(aggiornamentoDaEvento('customer.subscription.updated', { id: 'sub_1', metadata: {} }, ora)).toBeNull()
  })

  it('un pagamento fallito sospende, una disdetta chiude, un evento ignoto non fa niente', () => {
    expect(aggiornamentoDaEvento('invoice.payment_failed', { subscription: 'sub_1' }, ora).patch['abbonamento.stato']).toBe('in sospeso')
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
