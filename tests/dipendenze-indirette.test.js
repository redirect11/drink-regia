// LE DIPENDENZE INDIRETTE FORZATE (REQ-DEV-010). Gli avvisi di sicurezza di
// GitHub (Dependabot) riguardavano pacchetti che non scegliamo noi: li
// portano firebase, firebase-tools e firebase-admin, che chiedono ancora le
// versioni vecchie. Dependabot non poteva aggiornarli («security update not
// possible»), quindi le versioni corrette le forziamo con `overrides`.
// Questo test guarda i lockfile, cioè quello che si installa davvero: se un
// aggiornamento di Firebase riporta dentro una versione vulnerabile, o se
// qualcuno toglie un override, fallisce qui e non in un avviso da leggere.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

// firebase-tools è CommonJS e si carica com'è, come fa la sua CLI.
const require = createRequire(import.meta.url)

const RADICE = join(import.meta.dirname, '..')
const lock = (cartella) => JSON.parse(readFileSync(join(RADICE, cartella, 'package-lock.json'), 'utf8')).packages

// Le versioni installate di un pacchetto, ovunque stia nell'albero.
const versioni = (pacchetti, nome) =>
  Object.entries(pacchetti)
    .filter(([percorso]) => percorso === `node_modules/${nome}` || percorso.endsWith(`/node_modules/${nome}`))
    .map(([, p]) => p.version)

const numeri = (v) => v.split('.').map((n) => parseInt(n, 10))
const almeno = (v, minima) => {
  const [a, b] = [numeri(v), numeri(minima)]
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return true
}

describe('le dipendenze indirette con avvisi di sicurezza', () => {
  const sito = lock('.')
  const functions = lock('functions')

  it('@grpc/grpc-js è almeno 1.14.5 (GHSA-m9gg-hp2v-232j), nel sito e nelle Functions', () => {
    for (const v of [...versioni(sito, '@grpc/grpc-js'), ...versioni(functions, '@grpc/grpc-js')]) expect(almeno(v, '1.14.5'), v).toBe(true)
  })

  it('uuid è almeno 11.1.1, nel sito e nelle Functions', () => {
    const tutte = [...versioni(sito, 'uuid'), ...versioni(functions, 'uuid')]
    expect(tutte.length).toBeGreaterThan(0)
    for (const v of tutte) expect(almeno(v, '11.1.1'), v).toBe(true)
  })

  it('fast-xml-parser nelle Functions è almeno 5.12.0', () => {
    for (const v of versioni(functions, 'fast-xml-parser')) expect(almeno(v, '5.12.0'), v).toBe(true)
  })

  // IL DEPLOY VUOTO (tag v0.3.0-beta.7, 11/11/2026): minimatch 11 forzato
  // sotto glob 10 faceva elencare a firebase-tools zero file, e il sito di
  // test è uscito vuoto. Questa è la stessa funzione che il deploy usa per
  // scegliere cosa caricare: se un override la rompe, lo si vede qui e non
  // su un sito. Per questo minimatch sotto glob non è più forzato.
  it('firebase-tools elenca i file che pubblicherebbe: un override non deve svuotare il deploy', () => {
    const { listFiles } = require('firebase-tools/lib/listFiles')
    const ignora = JSON.parse(readFileSync(join(RADICE, 'firebase.json'), 'utf8')).hosting.ignore
    const trovati = listFiles(join(RADICE, 'public'), ignora)
    expect(trovati).toContain('favicon.svg')
    expect(trovati).toContain('fonts/OFL.txt')
  })
})
