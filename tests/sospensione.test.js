'use strict'

// SOSPENDERE E CHIUDERE UN'ISTANZA (REQ-FLOTTA-008): lo stato della
// licenza, con il motivo e la data. Quando si sospende da solo per il
// pagamento lo dicono i test di REQ-FLOTTA-023 (scadenze.test.js).

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { patchLicenza } = require('../functions/lib/sospensione.js')

const oggi = new Date('2026-10-22T06:00:00Z')

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
