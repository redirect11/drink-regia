'use strict'

// I TETTI DELLE FUNCTIONS (REQ-FLOTTA-119). Daniele, 15/11/2026: «non
// voglio trovarmi a pagare migliaia di euro». Una Function senza tetto
// Google la accende fino a 100 istanze; un indirizzo pubblico che legge
// Firestore a ogni chiamata, bombardato apposta, fa pagare le letture.
// Quindi: un tetto per tutte (OPTS), uno più basso per i cataloghi
// pubblici, e i cataloghi tenuti in memoria per un minuto.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const codice = readFileSync('functions/index.js', 'utf8')
const contratto = readFileSync('docs/contratto-regia-app.md', 'utf8')
const tratto = (da, a) => {
  const i = codice.indexOf(da)
  expect(i, `manca ${da}`).toBeGreaterThan(-1)
  return codice.slice(i, codice.indexOf(a, i + da.length))
}
const sezione = (titolo) => {
  const i = contratto.indexOf(titolo)
  expect(i, `manca ${titolo}`).toBeGreaterThan(-1)
  return contratto.slice(i, contratto.indexOf('\n### ', i + titolo.length))
}

describe('la memoria di un minuto (functions/lib/memoria.js)', () => {
  const { inMemoria } = require('../functions/lib/memoria.js')

  it('entro il tempo risponde dalla memoria, dopo ricarica', async () => {
    let ora = 0
    let caricate = 0
    const leggi = inMemoria(60000, async () => ++caricate, { adesso: () => ora })
    expect(await leggi()).toBe(1)
    ora = 59999
    expect(await leggi()).toBe(1)
    ora = 60000
    expect(await leggi()).toBe(2)
    expect(caricate).toBe(2)
  })

  it('le richieste che arrivano insieme aspettano la stessa lettura', async () => {
    let caricate = 0
    let libera
    const leggi = inMemoria(60000, () => new Promise((r) => { caricate++; libera = r }), { adesso: () => 0 })
    const tutte = Promise.all([leggi(), leggi(), leggi()])
    libera('catalogo')
    expect(await tutte).toEqual(['catalogo', 'catalogo', 'catalogo'])
    expect(caricate).toBe(1)
  })

  it('un errore arriva a tutte le chiamate insieme, con una lettura sola', async () => {
    let volte = 0
    const leggi = inMemoria(60000, async () => {
      volte++
      throw new Error('Firestore non risponde')
    }, { adesso: () => 0 })
    const esiti = await Promise.allSettled([leggi(), leggi()])
    expect(esiti.map((e) => e.status)).toEqual(['rejected', 'rejected'])
    expect(volte).toBe(1)
  })

  it('una lettura che non risponde si abbandona, e la chiamata dopo riprova', async () => {
    let volte = 0
    const leggi = inMemoria(60000, () => (++volte === 1 ? new Promise(() => {}) : Promise.resolve('ok')), { adesso: () => 0, scadenzaMs: 20 })
    await expect(leggi()).rejects.toThrow('lettura senza risposta dopo 20 ms')
    expect(await leggi()).toBe('ok')
    expect(volte).toBe(2)
  })

  it('un errore non resta in memoria: la richiesta dopo riprova', async () => {
    let volte = 0
    const leggi = inMemoria(60000, async () => {
      volte++
      if (volte === 1) throw new Error('Firestore non risponde')
      return 'ok'
    }, { adesso: () => 0 })
    await expect(leggi()).rejects.toThrow('Firestore non risponde')
    expect(await leggi()).toBe('ok')
  })
})

describe('i tetti delle Functions', () => {
  it('le opzioni comuni hanno un tetto di istanze', () => {
    expect(tratto('const OPTS = {', '\n}')).toMatch(/maxInstances: 10\b/)
  })

  it('ogni Function parte dalle opzioni comuni, quindi ha il tetto', () => {
    const dichiarazioni = [...codice.matchAll(/exports\.(\w+) = on\w+\(\s*([^\n]*)/g)]
    expect(dichiarazioni.length).toBeGreaterThan(60)
    const senza = dichiarazioni.filter(([, , opzioni]) => !/^(\{ \.\.\.OPTS(_AI)?\b|OPTS(_AI)?\b)/.test(opzioni.trim())).map(([, nome]) => nome)
    expect(senza, 'Function senza le opzioni comuni').toEqual([])
  })

  it('i due cataloghi pubblici hanno un tetto basso e rispondono dalla memoria', () => {
    for (const nome of ['catalogoTemi', 'catalogoModuli']) {
      const f = tratto(`exports.${nome} = `, '\n})')
      expect(f, nome).toMatch(/maxInstances: 3\b/)
      expect(f, `${nome} non legge Firestore a ogni chiamata`).not.toMatch(/db\.(collection|doc)\(|await vendita\(\)/)
    }
    expect(tratto('exports.catalogoTemi = ', '\n})')).toContain('await catalogoTemiInMemoria()')
    expect(codice).toContain('const catalogoTemiInMemoria = inMemoria(MEMORIA_CATALOGHI_MS, ')
    expect(codice).toMatch(/const MEMORIA_CATALOGHI_MS = 60 \* 1000/)
  })

  it('la prova di vita della sentinella e il sito chiuso di moduloDallApp leggono dalla memoria', () => {
    const viva = tratto('exports.sentinellaViva = ', '\n})')
    expect(viva).toContain('await statoSentinellaInMemoria()')
    expect(viva).not.toMatch(/db\.(collection|doc)\(/)
    const modulo = tratto('exports.moduloDallApp = ', '\n})')
    expect(modulo).toContain('if (await sitoChiusoInMemoria()) return no(409, free.SITO_CHIUSO)')
    expect(modulo).not.toContain('sitoChiusoOra()')
    expect(codice).toContain('const sitoChiusoInMemoria = async () => free.sitoChiuso(await listinoInMemoria(), SITO_IN_PRODUZIONE)')
  })

  it('le callback dei workflow ritentano se la regia è piena', () => {
    for (const wf of ['provisiona-istanza', 'aggiorna-istanza', 'elimina-istanza']) {
      const y = readFileSync(`.github/workflows/${wf}.yml`, 'utf8')
      expect(y, wf).toContain('const manda = (n) => fetch(url, {')
      expect(y, wf).toContain('r.status === 429 && n < 5 ? attendi(n) : r')
      expect(y, wf).toContain('manda(1).then(')
      expect(y, wf).not.toMatch(/^\s+fetch\(url, /m)
    }
  })

  it('il contratto lo dice per i due cataloghi', () => {
    for (const titolo of ['### 8. Il catalogo dei temi', '### 9. I moduli']) {
      const s = sezione(titolo)
      expect(s, titolo).toMatch(/in memoria fino a un minuto/)
      expect(s, titolo).toMatch(/entro (sei|due)/)
      expect(s, titolo).toMatch(/`429`/)
    }
  })
})
