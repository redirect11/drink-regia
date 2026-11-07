'use strict'

// «CAMBIA PIANO» DELL'ADMIN (REQ-FLOTTA-016): piano, moduli e terminali,
// con Stripe (addebito proporzionale) o fuori da Stripe (bonifico, omaggio);
// mai fuori da Stripe con un abbonamento Stripe che continua ad addebitare;
// ogni cambio nello storico.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { cambioAdmin } = require('../functions/lib/cambiopiano.js')

const adesso = new Date('2026-10-30T10:00:00Z')
const conStripe = { uid: 'u1', piano: 'base', moduli: [], abbonamento: { stato: 'attivo', stripe_subscription: 'sub_1' } }
const aMano = { uid: 'u2', piano: 'base', moduli: [], abbonamento: { stato: 'attivo', origine: 'manuale' } }
const free = { uid: 'u3', piano: 'free', moduli: [], abbonamento: { stato: 'attivo', origine: 'gratuito' } }

describe('cambia piano dall’admin', () => {
  it('con Stripe: la scelta pulita, niente da scrivere sul cliente (lo fa il webhook), e lo storico', () => {
    const c = cambioAdmin(conStripe, { piano: 'base', moduli: ['magazzino', 'boh'], terminali: 2, modo: 'stripe' }, { da: 'admin@x.it', adesso })
    expect(c).toMatchObject({ ok: true, scelta: { piano: 'base', moduli: ['magazzino'], terminali: 2 }, cliente: null })
    expect(c.storico).toEqual({ il: '2026-10-30T10:00:00.000Z', da: 'admin@x.it', modo: 'stripe', piano: 'base', moduli: ['magazzino'], terminali: 2 })
  })

  it('l’admin non sceglie l’intervallo: con Stripe resta quello della subscription, fuori da Stripe non si scrive (REQ-FLOTTA-031)', () => {
    const c = cambioAdmin(conStripe, { piano: 'base', intervallo: 'anno', modo: 'stripe' }, { adesso })
    expect(c.scelta).toEqual({ piano: 'base', moduli: [], terminali: 1 })
    expect(cambioAdmin(aMano, { piano: 'completo', intervallo: 'anno', modo: 'fuori' }, { adesso }).cliente.intervallo).toBeUndefined()
  })

  it('fuori da Stripe: si scrive il piano con un abbonamento manuale che lo dice', () => {
    const c = cambioAdmin(free, { piano: 'completo', modo: 'fuori' }, { adesso })
    expect(c.cliente).toMatchObject({ piano: 'completo', abbonamento: { stato: 'attivo', origine: 'manuale', nota: expect.stringMatching(/fuori da Stripe/) } })
  })

  it('verso il Free, fuori da Stripe: abbonamento gratuito, senza moduli', () => {
    const c = cambioAdmin(aMano, { piano: 'free', moduli: ['staff'], modo: 'fuori' }, { adesso })
    expect(c.cliente).toMatchObject({ piano: 'free', moduli: [], terminali: 1, abbonamento: { origine: 'gratuito' } })
  })

  // tana-drink REQ-LIC-015, i buchi della PR #91 (07/11/2026).
  it('no a un modulo senza la sua base, con Stripe e fuori; con la base nel piano o scelta sì', () => {
    expect(cambioAdmin(conStripe, { piano: 'base', moduli: ['ordini_cliente'], modo: 'stripe' }).perche).toBe('Ordini dal telefono del cliente richiede Menù digitale e tavoli.')
    expect(cambioAdmin(aMano, { piano: 'base', moduli: ['ordini_cliente'], modo: 'fuori' }).perche).toMatch(/richiede Menù digitale/)
    expect(cambioAdmin(aMano, { piano: 'base', moduli: ['menu_tavoli', 'ordini_cliente'], modo: 'fuori' }).ok).toBe(true)
    expect(cambioAdmin(aMano, { piano: 'completo', moduli: ['ordini_cliente'], modo: 'fuori' }).ok).toBe(true)
  })

  it('no: Stripe senza abbonamento, il Free su Stripe, fuori da Stripe con Stripe che addebita', () => {
    expect(cambioAdmin(aMano, { piano: 'completo', modo: 'stripe' }).perche).toMatch(/non ha un abbonamento Stripe/)
    expect(cambioAdmin(conStripe, { piano: 'free', modo: 'stripe' }).perche).toMatch(/non passa da Stripe/)
    expect(cambioAdmin(conStripe, { piano: 'completo', modo: 'fuori' }).perche).toMatch(/disdicilo prima/)
    expect(cambioAdmin({ ...conStripe, abbonamento: { ...conStripe.abbonamento, stato: 'disdetto' } }, { piano: 'completo', modo: 'fuori' }).ok).toBe(true)
  })

  it('no: piano o modo sconosciuti, cliente mancante', () => {
    expect(cambioAdmin(aMano, { piano: 'oro', modo: 'fuori' }).perche).toMatch(/Piano sconosciuto/)
    expect(cambioAdmin(aMano, { piano: 'base' }).perche).toMatch(/come si paga/)
    expect(cambioAdmin(null, { piano: 'base', modo: 'fuori' }).ok).toBe(false)
  })
})
