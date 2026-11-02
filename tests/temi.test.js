'use strict'

// IL CATALOGO DEI TEMI (REQ-FLOTTA-032), richiesta dall'app (tana-drink,
// REQ-MENU-023). L'utente, 02/11/2026: «Una sezione marketplace per i temi
// in aspetto [...] Serve un posto dove pubblicarne di nuovi». Pubblica solo
// il fornitore, dalla regia; un tema è una ricetta, non codice; per ora
// tutti gratis. La validazione è quella dell'app, più severa dove l'app
// aggiusta.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { BASI as BASI_SITO, STILI as STILI_SITO, CHIAVI_COLORE as CHIAVI_SITO, coloriDelTema, temaVuoto } from '../src/lib/temi.js'

const require = createRequire(import.meta.url)
const t = require('../functions/lib/temi.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const oro = { id: 'grand-hotel-oro', nome: 'Grand Hotel oro', descrizione: 'Il blu di mezzanotte con l’oro.', tavolozza: { base: 'notte-blu', colori: { '--accent': '#D4AF37' } }, stile: 'deco' }

describe('un tema da pubblicare', () => {
  it('pulito: id in minuscolo, colori in minuscolo, prezzo zero', () => {
    expect(t.temaPulito({ ...oro, id: 'Grand-Hotel-Oro' })).toEqual({
      tema: { id: 'grand-hotel-oro', nome: 'Grand Hotel oro', descrizione: 'Il blu di mezzanotte con l’oro.', prezzo: 0, tavolozza: { base: 'notte-blu', colori: { '--accent': '#d4af37' } }, stile: 'deco' },
    })
    // Un colore vuoto vale «come la base».
    expect(t.temaPulito({ ...oro, tavolozza: { base: 'crema', colori: { '--bg': '' } } }).tema.tavolozza).toEqual({ base: 'crema', colori: {} })
  })

  it('le regole dell’app: id, nome, descrizione, base, stile, colori', () => {
    expect(t.temaPulito({ ...oro, id: 'x' }).errore).toMatch(/Identificativo/)
    expect(t.temaPulito({ ...oro, id: '-oro' }).errore).toMatch(/Identificativo/)
    expect(t.temaPulito({ ...oro, id: 'a'.repeat(42) }).errore).toMatch(/Identificativo/)
    expect(t.temaPulito({ ...oro, nome: '' }).errore).toMatch(/nome/)
    expect(t.temaPulito({ ...oro, nome: 'n'.repeat(41) }).errore).toMatch(/40 caratteri/)
    expect(t.temaPulito({ ...oro, descrizione: 'd'.repeat(241) }).errore).toMatch(/240/)
    expect(t.temaPulito({ ...oro, tavolozza: { base: 'arcobaleno' } }).errore).toMatch(/base della tavolozza/)
    expect(t.temaPulito({ ...oro, stile: 'barocco' }).errore).toMatch(/Lo stile è uno fra/)
    expect(t.temaPulito({ ...oro, tavolozza: { base: 'crema', colori: { '--btn': '#ffffff' } } }).errore).toMatch(/non è uno dei sette/)
    expect(t.temaPulito({ ...oro, tavolozza: { base: 'crema', colori: { '--bg': 'red' } } }).errore).toMatch(/#rrggbb/)
    expect(t.temaPulito({ ...oro, tavolozza: { base: 'crema', colori: { '--bg': '#fff' } } }).errore).toMatch(/#rrggbb/)
  })

  it('«notte» è esclusivo della Tana; e per ora niente temi a pagamento', () => {
    expect(t.temaPulito({ ...oro, stile: 'notte' }).errore).toMatch(/esclusivo/)
    expect(t.temaPulito({ ...oro, prezzo: 3 }).errore).toMatch(/tutti gratis/)
  })

  it('basi, stili e colori sono gli stessi nella regia e nell’anteprima del sito', () => {
    expect(BASI_SITO.map((b) => b.id)).toEqual(t.BASI)
    expect(STILI_SITO.map((s) => s.id)).toEqual(t.STILI)
    expect(CHIAVI_SITO.map((c) => c.key)).toEqual(t.CHIAVI_COLORE)
    for (const b of BASI_SITO) expect(Object.keys(b.colori)).toEqual(t.CHIAVI_COLORE)
  })
})

describe('le azioni dell’admin', () => {
  it('un tema nuovo nasce bozza; uno pubblicato ritoccato resta pubblicato', () => {
    const { doc } = t.azioneSuTema(null, 'salva', oro, { da: 'admin@x.it', adesso: ADESSO })
    expect(doc).toMatchObject({ id: 'grand-hotel-oro', stato: 'bozza', creato_il: ADESSO.toISOString(), aggiornato_il: ADESSO.toISOString(), aggiornato_da: 'admin@x.it' })
    const pubblicato = { ...doc, stato: 'pubblicato' }
    expect(t.azioneSuTema(pubblicato, 'salva', { ...oro, nome: 'Oro' }).doc).toMatchObject({ stato: 'pubblicato', nome: 'Oro' })
    expect(t.azioneSuTema(pubblicato, 'salva', { ...oro, nome: '' }).errore).toMatch(/nome/)
  })

  it('pubblica ricontrolla; ritira solo un pubblicato; il resto no', () => {
    const { doc } = t.azioneSuTema(null, 'salva', oro, { adesso: ADESSO })
    expect(t.azioneSuTema(doc, 'pubblica', null, { adesso: ADESSO }).doc).toMatchObject({ stato: 'pubblicato', pubblicato_il: ADESSO.toISOString() })
    expect(t.azioneSuTema({ ...doc, stile: 'notte' }, 'pubblica').errore).toMatch(/Non si pubblica: .*esclusivo/)
    expect(t.azioneSuTema(doc, 'ritira').errore).toMatch(/solo un tema pubblicato/)
    expect(t.azioneSuTema({ ...doc, stato: 'pubblicato' }, 'ritira', null, { adesso: ADESSO }).doc).toMatchObject({ stato: 'ritirato', ritirato_il: ADESSO.toISOString() })
    expect(t.azioneSuTema(null, 'pubblica').errore).toMatch(/sconosciuto/)
    expect(t.azioneSuTema(doc, 'vendi').errore).toMatch(/sconosciuta/)
    expect(t.azioneSuTema(doc, 'salva', { ...oro, id: 'altro-id' }).errore).toMatch(/non cambia/)
  })
})

describe('il catalogo pubblico', () => {
  it('solo i pubblicati e validi, coi soli campi del tema, in ordine di nome', () => {
    const docs = [
      { ...oro, prezzo: 0, stato: 'pubblicato', creato_il: 'x', aggiornato_da: 'admin@x.it' },
      { ...oro, id: 'bozza-1', nome: 'Bozza', stato: 'bozza' },
      { ...oro, id: 'via', nome: 'Ritirato', stato: 'ritirato' },
      { ...oro, id: 'aurora', nome: 'Aurora', stato: 'pubblicato', tavolozza: { base: 'crema' } },
      { ...oro, id: 'rotto', nome: 'Rotto', stato: 'pubblicato', stile: 'barocco' },
    ]
    expect(t.catalogoPubblico(docs)).toEqual([
      { id: 'aurora', nome: 'Aurora', descrizione: 'Il blu di mezzanotte con l’oro.', prezzo: 0, tavolozza: { base: 'crema', colori: {} }, stile: 'deco' },
      { id: 'grand-hotel-oro', nome: 'Grand Hotel oro', descrizione: 'Il blu di mezzanotte con l’oro.', prezzo: 0, tavolozza: { base: 'notte-blu', colori: { '--accent': '#D4AF37' } }, stile: 'deco' },
    ])
    expect(t.catalogoPubblico(undefined)).toEqual([])
  })
})

describe('nel sito e nella regia', () => {
  it('i colori del tema: la base con sopra i ritocchi', () => {
    expect(coloriDelTema({ base: 'crema', colori: { '--accent': '#000000' } })).toMatchObject({ '--bg': '#f6f1e7', '--accent': '#000000' })
    expect(coloriDelTema({ base: 'sconosciuta' })['--bg']).toBe('#0e0e15')
    expect(coloriDelTema(undefined)['--bg']).toBe('#0e0e15')
    expect(temaVuoto()).toEqual({ id: '', nome: '', descrizione: '', tavolozza: { base: 'tana-scuro', colori: {} }, stile: 'classico' })
  })

  it('il catalogo è pubblico in GET, col CORS aperto; la gestione solo per l’admin', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const catalogo = codice.slice(codice.indexOf('exports.catalogoTemi'), codice.indexOf('exports.gestisciTemi'))
    expect(catalogo).toContain("res.set('Access-Control-Allow-Origin', '*')")
    expect(catalogo).toContain("res.set('Access-Control-Allow-Methods', 'GET')")
    expect(catalogo).toContain("where('stato', '==', 'pubblicato')")
    expect(catalogo).toContain('temi.catalogoPubblico(docs)')
    const gestione = codice.slice(codice.indexOf('exports.gestisciTemi'), codice.indexOf('// ── IL SITO SI PRESENTA ALLA REGIA'))
    expect(gestione).toContain("req.auth?.token?.admin !== true")
  })

  it('i temi nel database li legge l’admin e li scrivono solo le Functions', () => {
    const regole = readFileSync('firestore.rules', 'utf8')
    const blocco = regole.slice(regole.indexOf('match /temi/{id}'), regole.indexOf('match /sconti/{codice}'))
    expect(blocco).toContain('allow read: if admin();')
    expect(blocco).toContain('allow write: if false;')
  })
})
