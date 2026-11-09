'use strict'

// OGNI `match` DI firestore.rules HA LA SUA PROVA SULL'EMULATORE (REQ-DEV-007).
//
// I test di tests/regole/ girano solo con l'emulatore (`npm run
// test:regole`); questo gira con `npm test`, senza, e fa il conto: ogni file
// di tests/regole/ dichiara in testa quali `match` prova
// (`// REGOLE PROVATE: /clienti/{uid}, …`), e qui le dichiarazioni si
// confrontano con le `match` lette da firestore.rules. Una collezione nuova
// nelle regole senza un test che la bussi fa rosso qui, a ogni push, prima
// che la CI delle pull request accenda l'emulatore; una dichiarazione
// rimasta dopo che la regola è sparita, pure.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = process.cwd()
const REGOLE = readFileSync(join(RADICE, 'firestore.rules'), 'utf8')
const CARTELLA = join(RADICE, 'tests/regole')
const FILE_DI_PROVA = readdirSync(CARTELLA).filter((f) => f.endsWith('.test.js'))

// Le `match` delle regole, coi percorsi interi (le annidate portano il
// percorso del padre). Si conta l'apertura e la chiusura delle graffe per
// sapere dentro quale `match` si sta: i segnaposto `{uid}` si tolgono
// prima, così non contano come graffe; le `{}` delle espressioni (`get(x,
// {})`) si bilanciano da sole.
export function percorsiDelleMatch(testo) {
  const pulito = testo.replace(/\/\/.*$/gm, '').replace(/\{(\w+)(=\*\*)?\}/g, '<$1$2>')
  const aperte = []
  const trovati = []
  for (const token of pulito.match(/match\s+\S+\s*\{|\{|\}/g) || []) {
    if (token.startsWith('match')) {
      const segmento = token.match(/match\s+(\S+)/)[1]
      aperte.push({ segmento, graffe: 1 })
      const percorso = aperte.map((a) => a.segmento).join('')
      if (!percorso.startsWith('/databases/<database>/documents/')) continue
      trovati.push(percorso.slice('/databases/<database>/documents'.length).replace(/<(\w+(=\*\*)?)>/g, '{$1}'))
    } else if (token === '{') {
      if (aperte.length) aperte[aperte.length - 1].graffe++
    } else if (aperte.length) {
      aperte[aperte.length - 1].graffe--
      if (aperte[aperte.length - 1].graffe === 0) aperte.pop()
    }
  }
  return trovati
}

// Le dichiarazioni in testa ai file di prova: `// REGOLE PROVATE: a, b`,
// anche su più righe dello stesso file.
function dichiarate(file) {
  const testo = readFileSync(join(CARTELLA, file), 'utf8')
  return [...testo.matchAll(/^\/\/ REGOLE PROVATE: (.+)$/gm)].flatMap((m) => m[1].split(',').map((p) => p.trim()).filter(Boolean))
}

describe('la copertura delle regole Firestore', () => {
  const nelleRegole = percorsiDelleMatch(REGOLE)
  const neiTest = Object.fromEntries(FILE_DI_PROVA.map((f) => [f, dichiarate(f)]))
  const tutteDichiarate = Object.values(neiTest).flat()

  it('il parser legge le match, anche annidate', () => {
    expect(nelleRegole).toContain('/clienti/{uid}')
    expect(nelleRegole).toContain('/ai/{slug}/consumi/{id}')
    expect(nelleRegole).toContain('/vendita/{doc}/storico/{voce}')
    expect(new Set(nelleRegole).size).toBe(nelleRegole.length)
  })

  it('ogni match di firestore.rules è provata da un file di tests/regole/', () => {
    const scoperte = nelleRegole.filter((p) => !tutteDichiarate.includes(p))
    expect(scoperte, 'match senza un test sull’emulatore (aggiungilo e dichiaralo in «REGOLE PROVATE»)').toEqual([])
  })

  it('nessun test dichiara una match che nelle regole non c’è più', () => {
    const stantie = tutteDichiarate.filter((p) => !nelleRegole.includes(p))
    expect(stantie, 'dichiarazioni «REGOLE PROVATE» senza una match nelle regole').toEqual([])
  })

  it('ogni file di tests/regole/ dichiara cosa prova e bussa davvero a quelle collezioni', () => {
    for (const [file, percorsi] of Object.entries(neiTest)) {
      expect(percorsi.length, `${file} senza «REGOLE PROVATE»`).toBeGreaterThan(0)
      const testo = readFileSync(join(CARTELLA, file), 'utf8')
      for (const percorso of percorsi) {
        // L'ultima collezione del percorso (`consumi` di /ai/{slug}/consumi/{id})
        // compare nel corpo del test, in un percorso scritto o in una
        // template string.
        const collezione = percorso.split('/').filter((s) => s && !s.startsWith('{')).pop()
        expect(testo, `${file} dichiara ${percorso} ma non nomina «${collezione}»`).toMatch(new RegExp(`['\`/]${collezione}[/'\`]`))
      }
    }
  })
})
