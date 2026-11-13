'use strict'

// IL SITO SI PRESENTA ALLA REGIA (REQ-FLOTTA-026). L'utente, 02/11/2026:
// «non deve essere il deploy ad avvisare la regia ma l'istanza del sito
// stesso [...] regia e il sito custom del bar si devono parlare dopo il
// deploy». Al primo avvio di ogni versione l'app chiama la regia; la regia
// la riconosce, si segna la versione e, se manca, le scrive la licenza.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const p = require('../functions/lib/presentazione.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')

describe('il corpo della presentazione', () => {
  it('una versione dell’app, con o senza la «v»', () => {
    expect(p.corpoPresentazione({ versione: 'v1.10.4' })).toEqual({ versione: 'v1.10.4' })
    expect(p.corpoPresentazione({ versione: ' 1.10.4 ' })).toEqual({ versione: 'v1.10.4' })
    expect(p.corpoPresentazione({ versione: '1.11.0-beta.2' })).toEqual({ versione: 'v1.11.0-beta.2' })
  })

  it('niente altro', () => {
    for (const versione of [undefined, null, '', 'ultima', '1.10', 'v1.10.4; rm', '1.10.4-' + 'x'.repeat(30), 1104]) {
      expect(p.corpoPresentazione({ versione })).toBeNull()
    }
    expect(p.corpoPresentazione(null)).toBeNull()
  })
})

describe('quello che la regia si segna', () => {
  it('la prima volta di una versione, e l’ultima; mai chi ha aperto l’app', () => {
    const prima = p.registroPresentazione(null, { versione: 'v1.10.4', uid: 'u1', adesso: ADESSO })
    // Audit del 09/11/2026, finding 29 (REQ-FLOTTA-051): l'uid di un
    // dipendente del locale non si salva nella regia, anche se passato.
    expect(prima).toEqual({ presentazione: { versione: 'v1.10.4', il: ADESSO.toISOString(), prima_il: ADESSO.toISOString() } })
    const dopo = new Date('2026-11-03T08:00:00.000Z')
    expect(p.registroPresentazione(prima, { versione: 'v1.10.4', adesso: dopo }).presentazione).toEqual({
      versione: 'v1.10.4',
      il: dopo.toISOString(),
      prima_il: ADESSO.toISOString(),
    })
    const codice = readFileSync('functions/index.js', 'utf8')
    expect(codice).toContain('presenta.registroPresentazione(ist, { versione: corpo.versione })')
    // Una versione nuova riparte da capo.
    expect(p.registroPresentazione(prima, { versione: 'v1.11.0', adesso: dopo }).presentazione.prima_il).toBe(dopo.toISOString())
  })

  it('la stessa versione vista da poco non si riscrive: dieci tablet, una scrittura', () => {
    const ist = p.registroPresentazione(null, { versione: 'v1.10.4', adesso: ADESSO })
    expect(p.daRegistrare(ist, 'v1.10.4', new Date(ADESSO.getTime() + 60_000))).toBe(false)
    expect(p.daRegistrare(ist, 'v1.10.4', new Date(ADESSO.getTime() + p.RISCRIVI_DOPO + 1))).toBe(true)
    expect(p.daRegistrare(ist, 'v1.11.0', ADESSO)).toBe(true)
    expect(p.daRegistrare(null, 'v1.10.4', ADESSO)).toBe(true)
  })
})

describe('la licenza del sito che si presenta', () => {
  it('manca: si scrive, è l’attivazione; c’è: la regia la tiene aggiornata da sé', () => {
    expect(p.cosaFareConLaLicenza({ stato: 'attiva' }, { esiste: false })).toBe('scrivi')
    expect(p.cosaFareConLaLicenza({ stato: 'attiva' }, { esiste: true })).toBe('presente')
  })

  it('un locale esistente con la sua licenza, o un’istanza non attiva: non si scrive niente', () => {
    expect(p.cosaFareConLaLicenza({ licenza_dalla_regia: false }, { esiste: false, riceve: false })).toBe('non_dalla_regia')
    expect(p.cosaFareConLaLicenza({ stato: 'in corso' }, { esiste: false, riceve: false })).toBe('non_attiva')
  })

  it('l’app sa a quale regia presentarsi: il progetto della regia è nella build', () => {
    expect(readFileSync('.github/workflows/provisiona-istanza.yml', 'utf8')).toContain("VITE_REGIA_PROGETTO: ${{ inputs.ambiente == 'test' && 'drink-regia-test' || 'drink-regia' }}")
    // La demo a nessuna regia (REQ-FLOTTA-019): tests/flotta.test.js.
    expect(readFileSync('.github/workflows/aggiorna-istanza.yml', 'utf8')).toContain("(inputs.ambiente == 'test' && 'drink-regia-test' || 'drink-regia')")
  })

  it('la Function verifica il token col progetto del locale e scrive la prima licenza senza taglio', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const inizio = codice.indexOf('exports.presentazione = onRequest')
    const corpo = codice.slice(inizio, codice.indexOf('// ── IL PIANO CHE CAMBIA', inizio))
    expect(corpo).toContain('getAuth(appDi(progetto)).verifyIdToken(token)')
    expect(corpo).toContain("scriviLicenza(slug, { subito: true })")
    expect(corpo.indexOf('verifyIdToken')).toBeLessThan(corpo.indexOf('scriviLicenza'))
  })
})
