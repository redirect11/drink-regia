'use strict'

// REQUISITI E TEST SI TENGONO PER MANO, come in tana-drink: ogni file di
// test è citato da almeno un requisito, e ogni test citato esiste. Senza
// questo il registro invecchia in silenzio.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = process.cwd()
const registro = readFileSync(join(RADICE, 'requirements/requirements.yaml'), 'utf8')
const citati = [...registro.matchAll(/^\s+- (tests\/[^\s]+)$/gm)].map((m) => m[1])
const presenti = readdirSync(join(RADICE, 'tests')).filter((f) => /\.test\.jsx?$/.test(f)).map((f) => `tests/${f}`)

describe('il registro dei requisiti', () => {
  it('ogni test citato esiste', () => {
    const mancanti = [...new Set(citati)].filter((t) => !existsSync(join(RADICE, t)))
    expect(mancanti, 'requisiti che puntano a test inesistenti').toEqual([])
  })

  it('ogni file di test è citato da un requisito', () => {
    const orfani = presenti.filter((t) => !citati.includes(t))
    expect(orfani, 'test che nessun requisito cita').toEqual([])
  })

  it('ogni requisito ha id, title, status e test_cases', () => {
    const voci = registro.split(/^\s+- id: /m).slice(1)
    for (const v of voci) {
      expect(v).toMatch(/^\s*title:/m)
      expect(v).toMatch(/^\s*status: (implemented|todo|partial|deprecated)/m)
      expect(v).toMatch(/^\s*test_cases:/m)
    }
  })
})
