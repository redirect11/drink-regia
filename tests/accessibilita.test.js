'use strict'

// LA PROVA AXE NEL COLLAUDO (REQ-FLOTTA-125, punto D, criterio 4). La
// prova vera è e2e/accessibilita.spec.js, che gira con Playwright contro
// il sito di test; qui si tiene fermo quello che la rende una garanzia:
// che esista, che controlli i livelli A e AA, che passi anche dietro
// l'accesso, e che e2e.yml la faccia girare (le «Prove in sola lettura»
// saltano solo i titoli con «collaudo»). Senza questo, toglierla o
// spegnerla non farebbe rosso niente.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leggi = (f) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')
const spec = leggi('e2e/accessibilita.spec.js')
const pkg = JSON.parse(leggi('package.json'))

describe('la prova di accessibilità con axe-core', () => {
  it('usa axe-core da devDependency, mai nel sito pubblicato', () => {
    expect(pkg.devDependencies['@axe-core/playwright']).toBeTruthy()
    expect(pkg.dependencies['@axe-core/playwright']).toBeUndefined()
    expect(spec).toMatch(/import AxeBuilder from '@axe-core\/playwright'/)
  })

  it('controlla i livelli A e AA delle WCAG 2.0, 2.1 e 2.2, e una violazione fa fallire', () => {
    expect(spec).toContain("['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']")
    expect(spec).toMatch(/\.withTags\(REGOLE_WCAG\)/)
    expect(spec).toMatch(/expect\(trovate, [^)]*\)\.toEqual\(\[\]\)/)
  })

  it('passa sulle pagine pubbliche, sulla dashboard e sul backoffice', () => {
    for (const p of ['/', '/en', '/registrati', '/accedi', '/termini', '/privacy']) expect(spec).toContain(`'${p}'`)
    expect(spec).toMatch(/SEZIONI_TITOLARE/)
    expect(spec).toMatch(/entra\(page, 'admin'\)/)
    expect(spec).toMatch(/for \(const s of SEZIONI\)/)
  })

  // --grep-invert guarda i titoli delle prove, e il nome del file non è
  // collaudo-*.spec.js: così la prova gira a ogni giro, non solo sui tag.
  it('gira fra le prove in sola lettura di e2e.yml: nessun titolo con «collaudo»', () => {
    const titoli = [...spec.matchAll(/(?:test|test\.describe)\(\s*([`'])(.*?)\1/g)].map((m) => m[2])
    expect(titoli.length).toBeGreaterThan(5)
    for (const t of titoli) expect(t).not.toMatch(/collaudo/i)
    expect(leggi('.github/workflows/e2e.yml')).toContain('npx playwright test --grep-invert collaudo')
  })
})
