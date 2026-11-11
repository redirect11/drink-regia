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

  it('nessun minimatch fra 7.0.0 e 11.0.0: le versioni vecchie (3, 5, 6) non hanno il difetto', () => {
    for (const v of versioni(sito, 'minimatch')) {
      const colpita = almeno(v, '7.0.0') && !almeno(v, '11.0.1')
      expect(colpita, v).toBe(false)
    }
  })
})
