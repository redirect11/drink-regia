'use strict'

// SOSPENDERE E CHIUDERE UN'ISTANZA (REQ-FLOTTA-008): chi non paga da più
// dei giorni di grazia si sospende, chi disdice si chiude, chi torna a
// pagare si riattiva da solo. Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { patchLicenza, daSospendere, GIORNI_DI_GRAZIA } = require('../functions/lib/sospensione.js')

const oggi = new Date('2026-10-22T06:00:00Z')
const giorniFa = (n) => new Date(oggi.getTime() - n * 86400000).toISOString()

describe('patchLicenza', () => {
  it('scrive stato, motivo e data nel documento dell’istanza', () => {
    expect(patchLicenza('sospesa', { motivo: 'pagamento non ricevuto', adesso: oggi })).toEqual({
      'licenza.stato': 'sospesa',
      'licenza.motivo': 'pagamento non ricevuto',
      'licenza.dal': '2026-10-22T06:00:00.000Z',
    })
    expect(patchLicenza('attiva', { adesso: oggi })['licenza.motivo']).toBeNull()
    expect(() => patchLicenza('boh')).toThrow(/non valido/)
  })
})

describe('daSospendere', () => {
  const istanze = { 'bar-a': { stato: 'attiva' }, 'bar-b': { stato: 'attiva', licenza_stato: 'sospesa' }, 'bar-c': { stato: 'attiva' } }

  it('sospende chi è in sospeso da più dei giorni di grazia, non chi lo è da meno', () => {
    const clienti = [
      { slug: 'bar-a', abbonamento: { stato: 'in sospeso', aggiornato_il: giorniFa(GIORNI_DI_GRAZIA + 1) } },
      { slug: 'bar-c', abbonamento: { stato: 'in sospeso', aggiornato_il: giorniFa(2) } },
    ]
    const out = daSospendere(clienti, istanze, { adesso: oggi })
    expect(out.map((x) => [x.cliente.slug, x.stato])).toEqual([['bar-a', 'sospesa']])
    expect(out[0].motivo).toMatch(/7 giorni/)
  })

  it('chi torna a pagare si riattiva; chi disdice si chiude; senza istanza attiva niente', () => {
    const clienti = [
      { slug: 'bar-b', abbonamento: { stato: 'attivo' } },
      { slug: 'bar-c', abbonamento: { stato: 'disdetto' } },
      { slug: 'bar-x', abbonamento: { stato: 'disdetto' } },
    ]
    expect(daSospendere(clienti, istanze, { adesso: oggi }).map((x) => [x.cliente.slug, x.stato])).toEqual([
      ['bar-b', 'attiva'],
      ['bar-c', 'chiusa'],
    ])
  })
})
