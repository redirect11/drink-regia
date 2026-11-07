'use strict'

// IL TRAFFICO DEL SITO (REQ-FLOTTA-042): contatori per giorno, dentro la
// regia, senza cookie né identificativi. L'utente, 07/11/2026: «il traffico
// e altre cose utili». Logica pura; la Function `traccia` incrementa.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chiaveSicura, paginaDi, provenienzaDi, giornoDi, incrementiDi, annidati, PAGINE, EVENTI } = require('../functions/lib/traffico.js')

const ADESSO = new Date('2026-11-07T00:30:00.000Z') // a Roma è già l'1:30 del 7

describe('cosa si conta', () => {
  it('una vista: il giorno a Roma, la pagina, la lingua, la provenienza', () => {
    expect(incrementiDi({ pagina: '/registrati?x=1', lingua: 'it', riferimento: 'https://www.google.com/search?q=drink' }, { adesso: ADESSO })).toEqual({
      giorno: '2026-11-07',
      incrementi: { viste: 1, 'pagine.registrati': 1, 'lingue.it': 1, 'provenienze.google_com': 1 },
    })
  })

  it('«/» è home, «/en» la prima pagina inglese, il backoffice la sua prima parte, il resto «altro»', () => {
    expect(paginaDi('/')).toBe('home')
    expect(paginaDi('')).toBe('home')
    expect(paginaDi('/en#prezzi')).toBe('en')
    expect(paginaDi('/backoffice/locali?vista=attivi')).toBe('backoffice')
    expect(paginaDi('/qualcosa/di/strano')).toBe('altro')
    expect(paginaDi('/../etc')).toBe('altro')
    expect(PAGINE).toContain('dashboard')
  })

  it('la provenienza è il solo dominio, senza www; il nostro sito e un valore vuoto valgono «diretto»', () => {
    expect(provenienzaDi('https://www.instagram.com/p/abc')).toBe('instagram_com')
    expect(provenienzaDi('')).toBe('diretto')
    expect(provenienzaDi('non un url')).toBe('diretto')
    expect(provenienzaDi('https://drink-regia-test.web.app/accedi', ['drink-regia-test.web.app'])).toBe('diretto')
    expect(provenienzaDi('https://app.regiadrink.it/', ['regiadrink.it'])).toBe('diretto')
  })

  it('un passo della vendita conta solo il suo evento; uno sconosciuto non conta niente', () => {
    expect(incrementiDi({ evento: 'registrazione' }, { adesso: ADESSO })).toEqual({ giorno: '2026-11-07', incrementi: { 'eventi.registrazione': 1 } })
    expect(incrementiDi({ evento: 'DROP TABLE' }, { adesso: ADESSO })).toBeNull()
    expect(EVENTI).toEqual(['registrazione', 'free', 'checkout', 'contatto', 'codice', 'attivazione'])
  })

  it('una chiamata vuota o sbagliata non conta; una lingua sconosciuta vale italiano', () => {
    expect(incrementiDi(null)).toBeNull()
    expect(incrementiDi({})).toBeNull()
    expect(incrementiDi('x')).toBeNull()
    expect(incrementiDi({ pagina: '/', lingua: 'de' }, { adesso: ADESSO }).incrementi['lingue.it']).toBe(1)
  })

  it('le chiavi non hanno punti né caratteri strani, e sono corte', () => {
    expect(chiaveSicura('Www.Esempio.IT')).toBe('www_esempio_it')
    expect(chiaveSicura('a'.repeat(100))).toHaveLength(60)
    expect(chiaveSicura('')).toBe('altro')
  })

  it('il giorno è quello di Roma', () => {
    expect(giornoDi(new Date('2026-11-06T23:30:00.000Z'))).toBe('2026-11-07')
    expect(giornoDi(new Date('2026-07-31T22:30:00.000Z'))).toBe('2026-08-01')
  })

  it('gli incrementi col punto diventano un oggetto annidato, con la funzione data sui valori', () => {
    expect(annidati({ viste: 1, 'pagine.home': 1, 'lingue.it': 2 }, (v) => v * 10)).toEqual({ viste: 10, pagine: { home: 10 }, lingue: { it: 20 } })
    expect(annidati({})).toEqual({})
  })
})

// La Function e il sito: `traccia` è aperta (cors), risponde senza corpo,
// incrementa con merge; il sito la chiama a ogni pagina e a ogni passo.
describe('la Function e il sito', () => {
  const index = readFileSync('functions/index.js', 'utf8')
  const db = readFileSync('src/lib/db.js', 'utf8')
  const app = readFileSync('src/App.jsx', 'utf8')

  it('traccia: POST, cors aperto, un set con merge di incrementi, 204 sempre', () => {
    const f = index.slice(index.indexOf('exports.traccia'), index.indexOf('// ── SOSPENDERE'))
    expect(f).toMatch(/onRequest\(\{ \.\.\.OPTS, cors: true \}/)
    expect(f).toMatch(/traffico\.incrementiDi\(req\.body, \{ nostri: DOMINI_NOSTRI \}\)/)
    expect(f).toMatch(/traffico\.annidati\(esito\.incrementi, \(v\) => FieldValue\.increment\(v\)\)/)
    expect(f).toMatch(/\{ merge: true \}/)
    expect(f).not.toMatch(/res\.status\(200\)/)
  })

  it('il sito conta ogni pagina (App.jsx) e i passi: registrazione, free, checkout, contatto, codice, attivazione', () => {
    expect(app).toMatch(/tracciaPagina\(posizione\.pathname, linguaDelPercorso\(posizione\.pathname\)\)/)
    for (const evento of EVENTI) expect(db).toContain(`tracciaEvento('${evento}')`)
    // Mai un errore per il traffico: non si aspetta e non si rilancia.
    expect(db).toMatch(/keepalive: true \}\)\.catch\(\(\) => \{\}\)/)
  })
})
