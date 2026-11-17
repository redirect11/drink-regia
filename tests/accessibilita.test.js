'use strict'

// LA PROVA AXE NEL COLLAUDO (REQ-FLOTTA-125, punto D, criterio 4). La
// prova vera è e2e/accessibilita.spec.js, che gira con Playwright contro
// il sito di test; qui si tiene fermo quello che la rende una garanzia:
// che esista, che controlli i livelli A e AA, che passi anche dietro
// l'accesso, e che e2e.yml la faccia girare (le «Prove in sola lettura»
// saltano solo i titoli con «collaudo»). Senza questo, toglierla o
// spegnerla non farebbe rosso niente.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
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

  // Revisione del 17/11/2026: il salto da h1 a h3 non deve tornare, anche
  // se per axe l'ordine dei titoli è una buona pratica e non un livello.
  it('controlla anche l’ordine dei titoli', () => {
    expect(spec).toContain("REGOLE_IN_PIU = ['heading-order']")
    expect(spec).toMatch(/\.withRules\(REGOLE_IN_PIU\)/)
  })

  // Le correzioni a 320 px (index.css) e i riquadri che scorrono da
  // tastiera (scrollable-region-focusable) si vedono solo nella vista stretta.
  it('prova la vista a 320 px senza scorrimento di lato, anche dietro l’accesso', () => {
    expect(spec).toContain('const STRETTO = { width: 320')
    expect(spec).toMatch(/scrollWidth - document\.documentElement\.clientWidth/)
    expect(spec).toContain("indirizzoSezione('credito-ai')")
    expect(spec).toContain('`${BASE}/commerciale`')
  })

  // WCAG 2.1.1 (revisione del 17/11/2026): Safari non lascia scorrere da
  // tastiera un riquadro che non ha il fuoco. Ogni riquadro che scorre di
  // lato nel codice delle pagine si raggiunge col Tab e ha un nome.
  it('ogni riquadro che scorre si raggiunge col Tab e ha un nome', () => {
    const pagine = readdirSync(join(process.cwd(), 'src/pages')).filter((f) => f.endsWith('.jsx'))
    const riquadri = pagine.flatMap((f) => [...leggi(`src/pages/${f}`).matchAll(/<div className="tabella-(?:scorre|larga)"[^>]*>/g)].map((m) => `${f}: ${m[0]}`))
    expect(riquadri.length).toBeGreaterThanOrEqual(10)
    for (const r of riquadri) {
      expect(r).toContain('role="region"')
      expect(r).toContain('tabIndex={0}')
      expect(r).toMatch(/aria-label=/)
    }
  })

  // Sul sito di test (17/11/2026, run 43992997761) Backoffice › Commerciale
  // scorreva di lato di 214 px a 320 px: il «, 1 da gestire» per i lettori
  // di schermo (.solo-lettori, position: absolute) del contatore di
  // «Salute», in fondo al sotto-menù, usciva dal riquadro che scorre,
  // perché il riquadro non era posizionato e un elemento assoluto si
  // misura sul primo antenato posizionato. Ogni riquadro che scorre di
  // lato è position: relative, così quello che ha dentro resta dentro.
  it('ogni riquadro che scorre di lato tiene dentro anche gli elementi posizionati', () => {
    const css = leggi('src/index.css')
    for (const classe of ['sotto-menu', 'tabella-scorre', 'tabella-larga']) {
      const regola = css.match(new RegExp(`^\\.${classe} \\{[^}]*\\}`, 'm'))?.[0]
      expect(regola, `.${classe}`).toMatch(/overflow-x: auto/)
      expect(regola, `.${classe}`).toMatch(/position: relative/)
    }
  })

  // Sul sito di test una prova con undici pagine rischiava il limite di
  // 60 secondi, e una prova ferma il rilascio: una prova per sezione.
  it('una prova per sezione, non tutte le sezioni in una prova', () => {
    expect(spec).toMatch(/for \(const s of SEZIONI\) \{\s*test\(/)
    expect(spec).toMatch(/for \(const s of SEZIONI_TITOLARE\) \{\s*test\(/)
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
