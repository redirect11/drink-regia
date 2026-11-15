'use strict'

// I REGISTRI STRUTTURATI DELLE FUNCTIONS (REQ-FLOTTA-110). Daniele,
// 14/11/2026: «la dashboard la vorrei piu sofisticata per il logging e il
// monitoring. Roba piu seria», poi «niente allarmi google. Noi che
// possiamo fare internamente?». Una riga JSON per ogni chiamata, con
// funzione, locale, esito e durata; gli errori inattesi col loro stack;
// nessun dato personale.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'

const require = createRequire(import.meta.url)
const r = require('../functions/lib/registro.js')

const ENV = { FUNCTION_TARGET: 'presentazione' }
// Un orologio finto: ogni lettura avanza di 40 ms.
const orologio = () => {
  let t = 1000
  return () => (t += 40)
}

// Una risposta HTTP finta, abbastanza per il registro: status, json,
// headersSent e l'evento 'finish' quando si risponde.
function risposta() {
  const res = new EventEmitter()
  res.statusCode = 200
  res.headersSent = false
  res.status = (s) => {
    res.statusCode = s
    return res
  }
  res.json = (corpo) => {
    res.corpo = corpo
    res.headersSent = true
    res.emit('finish')
    return res
  }
  res.send = res.json
  return res
}

describe('le righe', () => {
  it('una richiesta HTTP: funzione, locale, esito dallo status, durata e versione', () => {
    expect(r.rigaRichiesta({ funzione: 'presentazione', slug: 'prova-bar', status: 200, durata_ms: 80, versione: 'v1.10.50-beta' })).toEqual({
      severity: 'INFO',
      message: 'presentazione 200 prova-bar',
      funzione: 'presentazione',
      tipo: 'http',
      slug: 'prova-bar',
      esito: 'ok',
      status: 200,
      durata_ms: 80,
      versione: 'v1.10.50-beta',
    })
    expect(r.rigaRichiesta({ funzione: 'x', status: 401, durata_ms: 1 })).toMatchObject({ esito: 'rifiutata', severity: 'INFO', slug: null })
    expect(r.rigaRichiesta({ funzione: 'x', status: 503, durata_ms: 1 })).toMatchObject({ esito: 'errore', severity: 'ERROR' })
  })

  it('un locale o una versione che non hanno la loro forma non entrano nei registri', () => {
    const riga = r.rigaRichiesta({ funzione: 'x', slug: 'mario.rossi@example.com', status: 200, durata_ms: 1, versione: '<script>' })
    expect(riga.slug).toBe(null)
    expect(riga.versione).toBe(null)
    expect(JSON.stringify(riga)).not.toContain('@')
  })

  it('una callable: ok, un rifiuto, un guasto', () => {
    expect(r.rigaChiamata({ funzione: 'gestisciTemi', codice: null, durata_ms: 5 })).toMatchObject({ tipo: 'chiamata', esito: 'ok', codice: null, severity: 'INFO' })
    expect(r.rigaChiamata({ funzione: 'gestisciTemi', codice: 'permission-denied', durata_ms: 5 })).toMatchObject({ esito: 'rifiutata', severity: 'INFO' })
    expect(r.rigaChiamata({ funzione: 'gestisciTemi', codice: 'internal', durata_ms: 5 })).toMatchObject({ esito: 'errore', severity: 'ERROR' })
  })

  it('un errore: lo stack in testa al messaggio, per Error Reporting, e senza email', () => {
    const e = new Error('invio fallito a mario.rossi@example.com')
    const riga = r.rigaErrore({ funzione: 'gestisciCollaboratori', slug: 'prova-bar', errore: e })
    expect(riga.severity).toBe('ERROR')
    expect(riga.message).toMatch(/^Error: invio fallito a «email»\n\s+at /)
    expect(riga.message).not.toContain('example.com')
    expect(riga).toMatchObject({ funzione: 'gestisciCollaboratori', slug: 'prova-bar', esito: 'errore' })
  })

  it('il nome della Function lo dà Google', () => {
    expect(r.nomeFunzione({ FUNCTION_TARGET: 'richiestaAI', K_SERVICE: 'richiestaai' })).toBe('richiestaAI')
    expect(r.nomeFunzione({ K_SERVICE: 'richiestaai' })).toBe('richiestaai')
    expect(r.nomeFunzione({})).toBe('sconosciuta')
  })
})

describe('una Function HTTP col suo registro', () => {
  it('una riga quando risponde, col locale e la versione che il gestore ha detto', async () => {
    const righe = []
    const f = r.conRegistro(
      async (req, res) => {
        res.locals.slug = 'prova-e2e'
        res.locals.versione = 'v1.10.50-beta'
        res.status(200).json({ ok: true })
      },
      { scrivi: (x) => righe.push(x), env: ENV, adesso: orologio() },
    )
    await f({ method: 'POST' }, risposta())
    expect(righe).toEqual([expect.objectContaining({ funzione: 'presentazione', slug: 'prova-e2e', status: 200, esito: 'ok', durata_ms: 40, versione: 'v1.10.50-beta' })])
  })

  it('il preflight del browser (OPTIONS) non si scrive', async () => {
    const righe = []
    const f = r.conRegistro(async (req, res) => res.status(204).send(''), { scrivi: (x) => righe.push(x), env: ENV })
    await f({ method: 'OPTIONS' }, risposta())
    expect(righe).toEqual([])
  })

  it('un errore inatteso: la riga dell’errore con lo stack, un 500 a chi chiama, e la riga della richiesta', async () => {
    const righe = []
    const f = r.conRegistro(
      async (req, res) => {
        res.locals.slug = 'prova-bar'
        throw new Error('7 PERMISSION_DENIED')
      },
      { scrivi: (x) => righe.push(x), env: ENV, adesso: orologio() },
    )
    const res = risposta()
    await f({ method: 'POST' }, res)
    expect(res.statusCode).toBe(500)
    expect(res.corpo).toEqual({ errore: 'Errore della regia: riprova fra poco.' })
    expect(righe[0]).toMatchObject({ severity: 'ERROR', funzione: 'presentazione', slug: 'prova-bar', esito: 'errore' })
    expect(righe[0].message).toMatch(/^Error: 7 PERMISSION_DENIED\n\s+at /)
    expect(righe[1]).toMatchObject({ tipo: 'http', status: 500, esito: 'errore' })
  })
})

describe('una callable col suo registro', () => {
  it('ok: una riga, e il risultato com’era', async () => {
    const righe = []
    const f = r.conRegistroChiamata(async () => ({ ok: 1 }), { scrivi: (x) => righe.push(x), env: { FUNCTION_TARGET: 'impostaTemi' } })
    expect(await f({ data: { slug: 'prova-bar' } })).toEqual({ ok: 1 })
    expect(righe).toEqual([expect.objectContaining({ funzione: 'impostaTemi', tipo: 'chiamata', slug: 'prova-bar', esito: 'ok' })])
  })

  it('un rifiuto (HttpsError col suo codice): una riga, niente stack, e l’errore torna uguale', async () => {
    const righe = []
    const errore = Object.assign(new Error('Solo l’amministratore.'), { code: 'permission-denied' })
    const f = r.conRegistroChiamata(
      async () => {
        throw errore
      },
      { scrivi: (x) => righe.push(x), env: ENV },
    )
    await expect(f({ data: {} })).rejects.toBe(errore)
    expect(righe).toEqual([expect.objectContaining({ esito: 'rifiutata', codice: 'permission-denied' })])
  })

  it('un guasto (un errore qualunque): la riga della chiamata e quella dell’errore con lo stack', async () => {
    const righe = []
    const errore = Object.assign(new Error('deadline exceeded'), { code: 4 })
    const f = r.conRegistroChiamata(
      async () => {
        throw errore
      },
      { scrivi: (x) => righe.push(x), env: ENV },
    )
    await expect(f({ data: { slug: 'prova-bar' } })).rejects.toBe(errore)
    expect(righe[0]).toMatchObject({ esito: 'errore', codice: 'internal', severity: 'ERROR' })
    expect(righe[1].message).toMatch(/^Error: deadline exceeded\n/)
  })
})

describe('index.js: ogni Function HTTP e callable passa dal registro', () => {
  const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')

  it('onRequest e onCall sono quelle col registro, le altre si chiamano diversamente', () => {
    expect(codice).toContain("const { onRequest: onRequestSenzaRegistro } = require('firebase-functions/v2/https')")
    expect(codice).toContain("const { onCall: onCallSenzaRegistro, HttpsError } = require('firebase-functions/v2/https')")
    expect(codice).toContain('const onRequest = (opzioni, gestore) => onRequestSenzaRegistro(opzioni, registro.conRegistro(gestore))')
    expect(codice).toContain('const onCall = (opzioni, gestore) => onCallSenzaRegistro(opzioni, registro.conRegistroChiamata(gestore))')
    // Nessuna Function scavalca il registro.
    expect(codice.match(/onRequestSenzaRegistro\(/g)).toHaveLength(1)
    expect(codice.match(/onCallSenzaRegistro\(/g)).toHaveLength(1)
  })

  it('le Function che parlano con i locali dicono al registro di quale locale si tratta', () => {
    const corpo = (nome, fine) => {
      const i = codice.indexOf(`exports.${nome} = onRequest(`)
      expect(i, nome).toBeGreaterThan(0)
      return codice.slice(i, codice.indexOf(fine, i))
    }
    expect(codice.slice(codice.indexOf('async function presentaIlSito'))).toMatch(/const slug = trovata\.id\n\s+res\.locals\.slug = slug\n\s+res\.locals\.versione = corpo\.versione/)
    expect(corpo('richiestaAI', 'IL FREE NON HA L')).toContain('res.locals.slug = slug')
    expect(corpo('sceltaDallApp', 'clienteDi(')).toContain('if (trovata) res.locals.slug = trovata.id')
    expect(corpo('moduloDallApp', 'ritornoValido')).toContain('if (trovata) res.locals.slug = trovata.id')
    expect(corpo('esitoProvisioning', 'const ref = db.doc(`istanze/${esito.slug}`)')).toContain('res.locals.slug = esito.slug')
  })
})
