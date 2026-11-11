// IL CODICE È PROPRIETARIO (REQ-DEV-011). Il repository è pubblico dal
// 10/11/2026 solo per avere la CI di GitHub senza limiti di minuti: il
// codice resta di Stonebit, tutti i diritti riservati, mai una licenza
// open source. Un repository pubblico senza LICENSE lascia il dubbio, e un
// package.json senza `license` passa per «ISC» in più di uno strumento:
// questo test tiene ferme le tre cose che lo dicono (LICENSE, i
// package.json, il README) e l'elenco dei file di terzi.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
// I file che git conosce: quelli pubblicati, senza node_modules né build.
const tracciati = execFileSync('git', ['ls-files'], { cwd: RADICE, encoding: 'utf8' }).split('\n').filter(Boolean)

describe('il codice è proprietario', () => {
  it('LICENSE riserva tutti i diritti, in italiano e in inglese, e non è una licenza open source', () => {
    const licenza = leggi('LICENSE')
    expect(licenza).toContain('Tutti i diritti riservati.')
    expect(licenza).toContain('All rights reserved.')
    expect(licenza).toContain('Daniele Napolitano (Stonebit)')
    expect(licenza).toMatch(/"Stonebit", "Lime" e "Lime SmartOrders" non sono concessi in uso/)
    expect(licenza).not.toMatch(/MIT License|Apache License|GNU (Lesser |Affero )?General Public|Permission is hereby granted|Creative Commons/i)
  })

  it('ogni package.json del repository è privato e senza licenza d’uso', () => {
    const pacchetti = tracciati.filter((f) => /(^|\/)package\.json$/.test(f))
    expect(pacchetti).toEqual(expect.arrayContaining(['package.json', 'functions/package.json']))
    for (const f of pacchetti) {
      const p = JSON.parse(leggi(f))
      expect(p.license, f).toBe('UNLICENSED')
      expect(p.private, f).toBe(true)
    }
  })

  it('il README rimanda a LICENSE', () => {
    const readme = leggi('README.md')
    expect(readme).toMatch(/^## Licenza$/m)
    expect(readme).toContain('[LICENSE](LICENSE)')
  })

  it('ogni carattere copiato nel repository sta in THIRD_PARTY_NOTICES.md, con la sua licenza accanto', () => {
    const avvisi = leggi('THIRD_PARTY_NOTICES.md')
    const caratteri = tracciati.filter((f) => /\.(woff2?|ttf|otf)$/.test(f))
    expect(caratteri.length).toBeGreaterThan(0)
    for (const f of caratteri) expect(avvisi, f).toContain(f)
    expect(existsSync(join(RADICE, 'public/fonts/OFL.txt'))).toBe(true)
    expect(avvisi).toContain('public/fonts/OFL.txt')
  })

  it('CLAUDE.md porta le regole comuni di Stonebit', () => {
    const regole = leggi('CLAUDE.md')
    expect(regole).toMatch(/^## Stonebit — regole comuni$/m)
    expect(regole).toContain('mai licenze open source')
  })
})
