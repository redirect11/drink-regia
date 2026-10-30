'use strict'

// LA LICENZA DAL PIANO (REQ-FLOTTA-010): quello che si compra nella regia
// diventa le funzioni premium dell'app, e si riscrive quando cambia.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { moduliLicenza, patchLicenzaPiano, licenzaIniziale, sceltaCambiata, TUTTI } = require('../functions/lib/licenza.js')

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
