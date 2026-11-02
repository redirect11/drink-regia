'use strict'

// LA VERSIONE DEL SITO (REQ-DEV-002). L'utente, 02/11/2026: «a che
// versione del backoffice siamo? Dove vedo la versione?». Sul test il
// piè di pagina diceva solo «develop».

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { versioneDetta } from '../src/lib/versione.js'

describe('la versione a parole', () => {
  it('da un ramo: la versione, il ramo e il commit breve', () => {
    expect(versioneDetta({ versione: 'v0.3.0-beta', ramo: 'develop', commit: 'e1a8a30d5c9f' })).toBe('v0.3.0-beta · develop · e1a8a30')
  })

  it('da un tag: il tag, e il commit se c’è', () => {
    expect(versioneDetta({ versione: 'v0.3.0' })).toBe('v0.3.0')
    expect(versioneDetta({ versione: 'v0.3.0', ramo: '', commit: 'abcdef1234' })).toBe('v0.3.0 · abcdef1')
  })

  it('senza versione lo dice', () => {
    expect(versioneDetta({})).toBe('v?')
    expect(versioneDetta()).toBe('v?')
  })

  it('il deploy passa il tag solo da un tag, e ramo e commit a parte', () => {
    const wf = readFileSync('.github/workflows/deploy.yml', 'utf8')
    expect(wf).toContain("VITE_APP_VERSION: ${{ inputs.versione || (github.ref_type == 'tag' && github.ref_name) || '' }}")
    expect(wf).toContain("VITE_APP_RAMO: ${{ github.ref_type == 'branch' && github.ref_name || '' }}")
    expect(wf).toContain('VITE_APP_COMMIT: ${{ github.sha }}')
  })
})
