'use strict'

// GLI STILI A RICETTA (REQ-FLOTTA-034). L'utente, 02/11/2026: «anche gli
// stili, non limitarti a quelli che abbiamo integrato. Creane di nuovi. In
// qualche modo dobbiamo poter caricare anche gli stili», poi «Stile a
// ricetta» e «una scelta ampia di caratteri dentro l'app». La forma del
// menù come scelta fra valori fissi, che l'app disegna col suo motore.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { STILI_RICETTA, stiliDaMostrare, nomeStile } from '../src/lib/temi.js'

const require = createRequire(import.meta.url)
const s = require('../functions/lib/stili.js')
const t = require('../functions/lib/temi.js')

const ricetta = (extra = {}) => ({
  versione: 1,
  caratteri: { titolo: 'bebas-neue', voce: 'inter', testo: 'inter' },
  ...extra,
})
const stile = (extra = {}) => ({ id: 'prova', nome: 'Prova', descrizione: 'Uno stile di prova.', ricetta: ricetta(), ...extra })

describe('uno stile a ricetta', () => {
  it('pulito: quello che la ricetta non dice prende il primo valore', () => {
    expect(s.stilePulito(stile())).toEqual({
      stile: {
        id: 'prova',
        nome: 'Prova',
        descrizione: 'Uno stile di prova.',
        prezzo: 0,
        ricetta: {
          versione: 1,
          caratteri: { titolo: 'bebas-neue', voce: 'inter', testo: 'inter' },
          titoli: { maiuscolo: false, corsivo: false, allineamento: 'sinistra', dimensione: 'normale', spaziatura: 'normale' },
          intestazione: 'nessuna',
          voce: { forma: 'card', prezzo: 'accanto', separatore: 'nessuno', immagine: 'tonda' },
          cornice: 'nessuna',
          angoli: 'morbidi',
          sfondo: 'tinta',
          impaginazione: 'unica',
        },
      },
    })
  })

  // REQ-FLOTTA-040 (l'utente, 06/11/2026): «si possa scegliere tra varie
  // strutture di menu, ad esempio tutto in una pagina, una pagina per
  // categoria o una per macro categoria».
  it('la struttura del menù è una dimensione della ricetta: una pagina, per categoria, per macro categoria', () => {
    expect(s.IMPAGINAZIONI).toEqual(['unica', 'per-categoria', 'per-macro-categoria'])
    expect(s.stilePulito(stile({ ricetta: ricetta({ impaginazione: 'per-macro-categoria' }) })).stile.ricetta.impaginazione).toBe('per-macro-categoria')
    expect(s.stilePulito(stile({ ricetta: ricetta({ impaginazione: 'a-fisarmonica' }) })).errore).toMatch(/impaginazione è uno fra/)
    // La ricetta da sola, per un tema su misura.
    expect(s.ricettaPulita(ricetta({ impaginazione: 'per-categoria' })).ricetta.impaginazione).toBe('per-categoria')
    expect(s.ricettaPulita(null).errore).toMatch(/Manca la ricetta/)
  })

  it('colori propri facoltativi, come la Lavagna', () => {
    expect(s.stilePulito(stile({ ricetta: ricetta({ colori: { '--bg': '#24332D' } }) })).stile.ricetta.colori).toEqual({ '--bg': '#24332d' })
    expect(s.stilePulito(stile({ ricetta: ricetta({ colori: {} }) })).stile.ricetta).not.toHaveProperty('colori')
    expect(s.stilePulito(stile({ ricetta: ricetta({ colori: { '--btn': '#ffffff' } }) })).errore).toMatch(/non è uno dei sette/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ colori: { '--bg': 'verde' } }) })).errore).toMatch(/#rrggbb/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ colori: 'tanti' }) })).errore).toMatch(/elenco di #rrggbb/)
  })

  it('un valore fuori dal vocabolario si rifiuta, non si indovina', () => {
    expect(s.stilePulito(stile({ id: 'x' })).errore).toMatch(/Identificativo/)
    expect(s.stilePulito(stile({ id: 'deco' })).errore).toMatch(/scritto nell’app/)
    expect(s.stilePulito(stile({ nome: '' })).errore).toMatch(/nome/)
    expect(s.stilePulito(stile({ descrizione: 'd'.repeat(241) })).errore).toMatch(/240/)
    expect(s.stilePulito(stile({ prezzo: 2 })).errore).toMatch(/tutti gratis/)
    expect(s.stilePulito(stile({ ricetta: null })).errore).toMatch(/Manca la ricetta/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ versione: 2 }) })).errore).toMatch(/versione 1/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ caratteri: { titolo: 'comic-sans', voce: 'inter', testo: 'inter' } }) })).errore).toMatch(/carattere titolo/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ titoli: { maiuscolo: 'sì' } }) })).errore).toMatch(/titoli.maiuscolo/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ voce: { forma: 'carosello' } }) })).errore).toMatch(/voce.forma è uno fra/)
    expect(s.stilePulito(stile({ ricetta: ricetta({ sfondo: 'video' }) })).errore).toMatch(/sfondo è uno fra/)
  })
})

describe('gli stili del repository', () => {
  it('ognuno è valido, con un id suo, diverso dagli stili dell’app', () => {
    expect(s.STILI_DEL_REPOSITORY.length).toBeGreaterThan(0)
    for (const x of s.STILI_DEL_REPOSITORY) expect([x.id, s.stilePulito(x).errore]).toEqual([x.id, undefined])
    const ids = s.STILI_DEL_REPOSITORY.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of s.STILI_DELL_APP) expect(ids).not.toContain(id)
  })

  it('nel catalogo: i pubblicati in ordine di nome; lo stesso id nel database vince', () => {
    const repo = [stile({ id: 'zeta', nome: 'Zeta', stato: 'pubblicato' }), stile({ id: 'alfa', nome: 'Alfa', stato: 'pubblicato' })]
    expect(s.catalogoStili([], repo).map((x) => x.id)).toEqual(['alfa', 'zeta'])
    expect(s.catalogoStili([{ ...repo[0], stato: 'ritirato' }], repo).map((x) => x.id)).toEqual(['alfa'])
    expect(s.catalogoStili([], repo)[0]).toEqual({ id: 'alfa', nome: 'Alfa', descrizione: 'Uno stile di prova.', prezzo: 0, ricetta: s.stilePulito(repo[1]).stile.ricetta })
    expect(s.catalogoStili(undefined, [])).toEqual([])
    expect(s.stileDalRepository('osteria')).toMatchObject({ dal_repository: true, stato: 'pubblicato' })
    expect(s.stileDalRepository('nessuno')).toBeNull()
  })
})

describe('i temi con gli stili a ricetta', () => {
  it('un tema usa uno stile a ricetta pubblicato; uno ritirato o sconosciuto no', () => {
    const tema = { id: 'prova-tema', nome: 'Prova', tavolozza: { base: 'crema' }, stile: 'osteria' }
    expect(t.temaPulito(tema).errore).toBeUndefined()
    expect(t.temaPulito(tema, { stiliRicetta: [] }).errore).toMatch(/Lo stile è uno fra/)
    expect(t.catalogoPubblico([], [{ ...tema, stato: 'pubblicato' }], { stiliRicetta: [] })).toEqual([])
    expect(t.catalogoPubblico([], [{ ...tema, stato: 'pubblicato' }]).map((x) => x.id)).toEqual(['prova-tema'])
  })

  it('ogni stile a ricetta del repository ha almeno un tema che lo usa', () => {
    const usati = new Set(t.TEMI_DEL_REPOSITORY.map((x) => x.stile))
    for (const x of s.STILI_DEL_REPOSITORY) expect([x.id, usati.has(x.id)]).toEqual([x.id, true])
  })
})

describe('nel sito e nella regia', () => {
  it('il backoffice vede gli stili del repository, con sopra le copie del database', () => {
    expect(STILI_RICETTA.map((x) => x.id)).toEqual(s.STILI_DEL_REPOSITORY.map((x) => x.id))
    expect(stiliDaMostrare([{ id: 'osteria', stato: 'ritirato' }]).find((x) => x.id === 'osteria').stato).toBe('ritirato')
    expect(stiliDaMostrare(undefined)).toHaveLength(STILI_RICETTA.length)
    expect(nomeStile('osteria')).toBe('Osteria')
    expect(nomeStile('deco')).toBe('Deco')
    expect(nomeStile('ignoto')).toBe('ignoto')
  })

  it('il catalogo dà anche gli stili; ritirarli è dell’admin; il database solo dalle Functions', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const gestione = codice.slice(codice.indexOf('exports.gestisciStili'), codice.indexOf('// ── IL SITO SI PRESENTA ALLA REGIA'))
    expect(gestione).toContain('req.auth?.token?.admin !== true')
    expect(gestione).toContain('stili.stileDalRepository(id)')
    const regole = readFileSync('firestore.rules', 'utf8')
    const blocco = regole.slice(regole.indexOf('match /stili/{id}'), regole.indexOf('match /sconti/{codice}'))
    expect(blocco).toContain('allow read: if admin();')
    expect(blocco).toContain('allow write: if false;')
  })
})
