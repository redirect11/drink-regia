'use strict'

// LA LICENZA DAL PIANO (REQ-FLOTTA-010): quello che si compra nella regia
// diventa le funzioni premium dell'app, e si riscrive quando cambia.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { moduliLicenza, patchLicenzaPiano, sceltaCambiata, TUTTI } = require('../functions/lib/licenza.js')

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
      'licenza.scritta_il': '2026-10-22T10:00:00.000Z',
    })
  })

  it('cambia se cambiano piano, moduli o terminali; l’ordine dei moduli non conta', () => {
    expect(sceltaCambiata({ piano: 'base', moduli: ['a', 'b'] }, { piano: 'base', moduli: ['b', 'a'] })).toBe(false)
    expect(sceltaCambiata({ piano: 'base' }, { piano: 'completo' })).toBe(true)
    expect(sceltaCambiata({ piano: 'base', terminali: 1 }, { piano: 'base', terminali: 2 })).toBe(true)
  })
})
