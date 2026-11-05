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
import { BASI as BASI_SITO, STILI as STILI_SITO, ESCLUSIVI as ESCLUSIVI_SITO, CHIAVI_COLORE as CHIAVI_SITO, coloriDelTema, temaVuoto, nomeStile } from '../src/lib/temi.js'

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

  it('«notte» e «meraviglie» sono esclusivi della Tana; e per ora niente temi a pagamento', () => {
    expect(t.temaPulito({ ...oro, stile: 'notte' }).errore).toMatch(/esclusivo/)
    expect(t.temaPulito({ ...oro, stile: 'meraviglie' }).errore).toMatch(/esclusivo/)
    expect(t.temaPulito({ ...oro, prezzo: 3 }).errore).toMatch(/tutti gratis/)
  })

  it('basi, stili, esclusivi e colori sono gli stessi nella regia e nell’anteprima del sito', () => {
    expect(BASI_SITO.map((b) => b.id)).toEqual(t.BASI)
    expect(STILI_SITO.map((s) => s.id)).toEqual(t.STILI)
    expect(ESCLUSIVI_SITO.map((s) => s.id)).toEqual(t.ESCLUSIVI)
    expect(nomeStile('meraviglie')).toBe('Meraviglie')
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
    expect(t.catalogoPubblico(docs, [])).toEqual([
      { id: 'aurora', nome: 'Aurora', descrizione: 'Il blu di mezzanotte con l’oro.', prezzo: 0, tavolozza: { base: 'crema', colori: {} }, stile: 'deco' },
      { id: 'grand-hotel-oro', nome: 'Grand Hotel oro', descrizione: 'Il blu di mezzanotte con l’oro.', prezzo: 0, tavolozza: { base: 'notte-blu', colori: { '--accent': '#D4AF37' } }, stile: 'deco' },
    ])
    expect(t.catalogoPubblico(undefined, [])).toEqual([])
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
    // Tutti i documenti: uno ritirato nel database copre quello del repository.
    expect(catalogo).toContain("['temi', 'stili'].map((c) => db.collection(c).get()")
    expect(catalogo).toContain('temi.catalogoPubblico(docsTemi, undefined, { stiliRicetta: catalogoStili.map((s) => s.id) })')
    expect(catalogo).toContain('stili: catalogoStili')
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

// I TEMI IN LICENZA DEI LOCALI (REQ-FLOTTA-039, richiesta da tana-drink del
// 05/11/2026): gli esclusivi stanno in clienti/{uid}.temi e la licenza li
// nomina; quello che il locale ha installato dall'app la regia lo legge dal
// suo settings/bar, al momento, senza salvarlo.
describe('i temi in licenza dei locali', () => {
  it('l’elenco si pulisce: minuscolo, senza doppioni, in ordine; vuoto se manca; null se non è un elenco di id', () => {
    expect(t.temiPuliti(['Notte', 'meraviglie', 'notte '])).toEqual(['meraviglie', 'notte'])
    expect(t.temiPuliti(undefined)).toEqual([])
    expect(t.temiPuliti([])).toEqual([])
    // Un id che l'app non conosce passa: l'app lo ignora, e si può scrivere prima che l'app lo abbia.
    expect(t.temiPuliti(['aurora-2027'])).toEqual(['aurora-2027'])
    for (const brutto of ['notte', [''], ['Notte!'], [3], [{ id: 'notte' }], Array(21).fill('notte')]) expect(t.temiPuliti(brutto)).toBeNull()
  })

  it('gli installati dall’app: solo id validi, i temi con nome e stile, lo stile in uso', () => {
    const bar = {
      stili_installati: ['lavagna', 'Deco!', 7],
      temi_installati: [
        { id: 'grand-hotel', nome: ' Grand Hotel ', stile: 'deco', tavolozza: { base: 'notte-blu' } },
        { id: 'senza-nome', stile: 'barocco?' },
        { nome: 'senza id' },
      ],
      stile_menu: 'notte',
    }
    expect(t.installatiDalLocale(bar)).toEqual({
      stili_installati: ['lavagna'],
      temi_installati: [
        { id: 'grand-hotel', nome: 'Grand Hotel', stile: 'deco' },
        { id: 'senza-nome', nome: 'senza-nome', stile: null },
      ],
      stile_menu: 'notte',
    })
    expect(t.installatiDalLocale(undefined)).toEqual({ stili_installati: [], temi_installati: [], stile_menu: null })
  })

  it('nelle Functions: i temi li scrive solo l’admin, puliti; gli installati si leggono dal progetto del locale e non si scrivono', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const imposta = codice.slice(codice.indexOf('exports.impostaTemi'), codice.indexOf('exports.temiDelLocale'))
    expect(imposta).toContain("req.auth?.token?.admin !== true")
    expect(imposta).toContain('temi.temiPuliti(req.data?.temi)')
    expect(imposta).toContain('await doc.ref.update({ temi: temiNuovi })')
    const legge = codice.slice(codice.indexOf('exports.temiDelLocale'), codice.indexOf("// ── L'ELIMINAZIONE DI UN LOCALE"))
    expect(legge).toContain("req.auth?.token?.admin !== true")
    expect(legge).toContain("firestoreDi(ist.progetto).doc('settings/bar').get()")
    expect(legge).toContain('return temi.installatiDalLocale(bar)')
    expect(legge).not.toMatch(/\.(set|update|add)\(/)
  })
})

// I TEMI DEL REPOSITORY (REQ-FLOTTA-033). L'utente, 02/11/2026: «senza
// spendere crediti, tu potresti creare temi, o un agente, e li carica sul
// marketplace». Stanno in functions/temi/catalogo.json; il deploy li
// pubblica; qui si controlla che l'app li accetti e che si leggano.
describe('i temi del repository', () => {
  it('ognuno passa le regole dell’app, con un id suo', () => {
    expect(t.TEMI_DEL_REPOSITORY.length).toBeGreaterThan(0)
    for (const tema of t.TEMI_DEL_REPOSITORY) expect([tema.id, t.temaPulito(tema).errore]).toEqual([tema.id, undefined])
    const ids = t.TEMI_DEL_REPOSITORY.map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    // Non rifanno quelli che l'app ha già nel suo catalogo iniziale.
    for (const giaNellApp of ['classico', 'lavagna', 'grand-hotel', 'riviera', 'pastello', 'gazzetta', 'inchiostro', 'notte']) expect(ids).not.toContain(giaNellApp)
  })

  it('si leggono: testo, testo tenue e prezzo contrastano col fondo e con la card', () => {
    for (const tema of t.TEMI_DEL_REPOSITORY) {
      const k = { ...coloriDelTema(tema.tavolozza) }
      expect([tema.id, t.contrasto(k['--text'], k['--bg']) >= 7]).toEqual([tema.id, true])
      expect([tema.id, t.contrasto(k['--text'], k['--card']) >= 7]).toEqual([tema.id, true])
      expect([tema.id, t.contrasto(k['--muted'], k['--card']) >= 4.5]).toEqual([tema.id, true])
      expect([tema.id, t.contrasto(k['--accent'], k['--card']) >= 3]).toEqual([tema.id, true])
    }
    expect(t.contrasto('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(t.contrasto('#777777', '#777777')).toBe(1)
  })

  it('nel catalogo con quelli del database: lo stesso id vince il database (così si ritira)', () => {
    const repo = [{ ...oro, prezzo: 0, stato: 'pubblicato' }, { ...oro, id: 'aurora', nome: 'Aurora', stato: 'pubblicato' }]
    expect(t.catalogoPubblico([], repo).map((x) => x.id)).toEqual(['aurora', 'grand-hotel-oro'])
    expect(t.catalogoPubblico([{ ...oro, stato: 'ritirato' }], repo).map((x) => x.id)).toEqual(['aurora'])
    expect(t.catalogoPubblico([]).length).toBe(t.TEMI_DEL_REPOSITORY.length)
    expect(t.dalRepository(t.TEMI_DEL_REPOSITORY[0].id)).toMatchObject({ dal_repository: true, stato: 'pubblicato' })
    expect(t.dalRepository('nessuno')).toBeNull()
  })
})
