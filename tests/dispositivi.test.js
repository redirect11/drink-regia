// I DISPOSITIVI DI UN LOCALE, A PAROLE (REQ-FLOTTA-112). tana-drink, 15/11/2026:
// ogni dispositivo si presenta col suo codice; la scheda dice quanti sono e
// quali sono indietro rispetto alla versione più alta, contando solo quelli
// visti negli ultimi 30 giorni.

import { describe, it, expect } from 'vitest'
import { dispositiviDetti } from '../src/lib/dispositivi.js'

const ADESSO = new Date('2026-11-15T10:00:00.000Z')
const giorniFa = (g) => new Date(ADESSO.getTime() - g * 24 * 3600 * 1000).toISOString()

describe('i dispositivi a parole', () => {
  it('quanti sono e quelli indietro, per versione, il più indietro prima', () => {
    const p = {
      versione: 'v1.10.51-beta',
      dispositivi: {
        a: { versione: 'v1.10.51-beta', il: giorniFa(0) },
        b: { versione: 'v1.10.40-beta', il: giorniFa(1) },
        c: { versione: 'v1.10.50-beta', il: giorniFa(2) },
        d: { versione: 'v1.10.50-beta', il: giorniFa(3) },
      },
    }
    expect(dispositiviDetti(p, ADESSO)).toBe('4 dispositivi · 1 sulla v1.10.40-beta, 2 sulla v1.10.50-beta')
  })

  it('tutti sulla stessa versione; uno solo', () => {
    expect(dispositiviDetti({ versione: 'v1.10.51-beta', dispositivi: { a: { versione: 'v1.10.51-beta', il: giorniFa(0) }, b: { versione: 'v1.10.51-beta', il: giorniFa(0) } } }, ADESSO)).toBe('2 dispositivi')
    expect(dispositiviDetti({ versione: 'v1.10.51-beta', dispositivi: { a: { versione: 'v1.10.51-beta', il: giorniFa(0) } } }, ADESSO)).toBe('1 dispositivo')
  })

  it('l’app senza codice conta come un dispositivo e lo dice', () => {
    const p = { versione: 'v1.10.51-beta', dispositivi: { a: { versione: 'v1.10.51-beta', il: giorniFa(0) }, senza_codice: { versione: 'v1.10.40-beta', il: giorniFa(5) } } }
    expect(dispositiviDetti(p, ADESSO)).toBe('2 dispositivi · 1 sulla v1.10.40-beta (app senza codice)')
  })

  it('chi non si presenta da 30 giorni non conta; senza dispositivi non si dice niente', () => {
    const p = { versione: 'v1.10.51-beta', dispositivi: { a: { versione: 'v1.10.51-beta', il: giorniFa(0) }, b: { versione: 'v1.10.4', il: giorniFa(31) } } }
    expect(dispositiviDetti(p, ADESSO)).toBe('1 dispositivo')
    expect(dispositiviDetti({ versione: 'v1.10.51-beta' }, ADESSO)).toBe('')
    expect(dispositiviDetti(null, ADESSO)).toBe('')
    expect(dispositiviDetti({ versione: 'v1', dispositivi: { b: { versione: 'v1.10.4', il: giorniFa(40) } } }, ADESSO)).toBe('')
  })
})
