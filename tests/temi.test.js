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
const stili = require('../functions/lib/stili.js')

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

// I TEMI SU MISURA DI UN LOCALE (REQ-FLOTTA-040). L'utente, 06/11/2026: un
// servizio premium col mockup di Canva e il credito AI, e i temi fatti da
// noi su richiesta. Stanno in clienti/{uid}/temi_su_misura e arrivano
// all'app con la licenza; possono portare una ricetta (lib/stili.js).
describe('i temi su misura', () => {
  const ricetta = { versione: 1, caratteri: { titolo: 'playfair-display', voce: 'inter', testo: 'inter' }, voce: { forma: 'riga', prezzo: 'puntini' }, impaginazione: 'per-categoria' }
  const suMisura = { ...oro, id: 'su-misura-1', ricetta }

  it('un tema come gli altri, più la ricetta se c’è; una ricetta storta si rifiuta', () => {
    const { tema } = t.temaSuMisuraPulito(suMisura)
    expect(tema.ricetta).toMatchObject({ versione: 1, caratteri: { titolo: 'playfair-display' }, voce: { forma: 'riga', prezzo: 'puntini', separatore: 'nessuno' }, impaginazione: 'per-categoria' })
    expect(t.temaSuMisuraPulito(oro).tema).not.toHaveProperty('ricetta')
    expect(t.temaSuMisuraPulito({ ...suMisura, ricetta: { versione: 1 } }).errore).toMatch(/La ricetta: Il carattere titolo/)
    expect(t.temaSuMisuraPulito({ ...suMisura, stile: 'notte' }).errore).toMatch(/esclusivo/)
  })

  it('le azioni: uno nuovo nasce bozza con l’origine; salvando senza ricetta la ricetta va via; si pubblica e si ritira', () => {
    const nato = t.azioneSuTemaSuMisura(null, 'salva', suMisura, { da: 'admin@x', adesso: ADESSO, origine: 'fornitore' }).doc
    expect(nato).toMatchObject({ id: 'su-misura-1', stato: 'bozza', origine: 'fornitore', ricetta: { impaginazione: 'per-categoria' }, creato_il: ADESSO.toISOString() })
    expect(t.azioneSuTemaSuMisura(null, 'salva', suMisura, { origine: 'inventata' }).doc.origine).toBe('fornitore')
    const senza = t.azioneSuTemaSuMisura(nato, 'salva', { ...oro, id: 'su-misura-1' }, { adesso: ADESSO }).doc
    expect(senza).not.toHaveProperty('ricetta')
    expect(senza.origine).toBe('fornitore')
    expect(t.azioneSuTemaSuMisura(nato, 'pubblica', null, { adesso: ADESSO }).doc.stato).toBe('pubblicato')
    expect(t.azioneSuTemaSuMisura({ ...nato, stato: 'pubblicato' }, 'ritira', null, { adesso: ADESSO }).doc.stato).toBe('ritirato')
    expect(t.azioneSuTemaSuMisura({ ...nato, stile: 'barocco' }, 'pubblica', null).errore).toMatch(/Non si pubblica/)
  })

  it('nella licenza vanno i pubblicati e validi, con la ricetta, in ordine di nome', () => {
    const docs = [{ ...suMisura, nome: 'Zefiro', stato: 'pubblicato' }, { ...oro, id: 'alba', nome: 'Aurora', stato: 'pubblicato' }, { ...oro, id: 'bozza', nome: 'Bozza', stato: 'bozza' }, { ...oro, id: 'rotto', nome: 'Rotto', stato: 'pubblicato', stile: 'barocco' }]
    const lic = t.temiSuMisuraPerLicenza(docs)
    expect(lic.map((x) => x.id)).toEqual(['alba', 'su-misura-1'])
    // Pulito come ogni tema, e la ricetta intera, coi valori che non diceva.
    expect(lic[1]).toEqual({ id: 'su-misura-1', nome: 'Zefiro', descrizione: oro.descrizione, prezzo: 0, tavolozza: { base: 'notte-blu', colori: { '--accent': '#d4af37' } }, stile: 'deco', ricetta: stili.ricettaPulita(ricetta).ricetta })
    expect(lic[1].ricetta.sfondo).toBe('tinta')
    expect(lic[0]).not.toHaveProperty('ricetta')
    expect(t.temiSuMisuraPerLicenza(undefined)).toEqual([])
  })

  // Il tema dal mockup: la risposta del modello (lib/ai.js, «tema») → il
  // tema, controllato come ogni altro, con la struttura scelta dal titolare
  // e i colori che si leggono.
  const risposta = {
    nome: 'Bosco',
    descrizione: 'Verde profondo e oro.',
    tavolozza: { base: 'tana-scuro', colori: { '--bg': '#10201A', '--bg-2': '#17302a', '--card': '#1b3a30', '--accent': '#d4af37', '--accent-2': '#c9a227', '--text': '#f3f1e8', '--muted': '#a8b8a8' } },
    stile_vicino: 'deco',
    ricetta: { caratteri: { titolo: 'cormorant-garamond', voce: 'inter', testo: 'inter' }, titoli: { maiuscolo: true, corsivo: false, allineamento: 'centro', dimensione: 'grande', spaziatura: 'larga' }, intestazione: 'filetto', voce: { forma: 'riga', prezzo: 'puntini', separatore: 'filetto', immagine: 'nascosta' }, cornice: 'sottile', angoli: 'vivi', sfondo: 'carta' },
    da_verificare: ['Il carattere del mockup non c’è: usato Cormorant Garamond.', '  '],
  }

  it('dal mockup: id suo, origine mockup, la struttura scelta dal titolare, le note da verificare', () => {
    const { tema, errore } = t.temaDalMockup(risposta, { struttura: 'per-macro-categoria', adesso: ADESSO })
    expect(errore).toBeUndefined()
    expect(tema).toMatchObject({
      id: t.idTemaSuMisura(ADESSO),
      nome: 'Bosco',
      prezzo: 0,
      tavolozza: { base: 'tana-scuro', colori: { '--bg': '#10201a', '--accent': '#d4af37' } },
      stile: 'deco',
      origine: 'mockup',
      ricetta: { versione: 1, caratteri: { titolo: 'cormorant-garamond' }, voce: { prezzo: 'puntini' }, impaginazione: 'per-macro-categoria' },
      da_verificare: ['Il carattere del mockup non c’è: usato Cormorant Garamond.'],
    })
    expect(t.idTemaSuMisura(ADESSO)).toMatch(/^su-misura-[a-z0-9]+$/)
    // La struttura del modello, se mai la scrivesse, non conta.
    expect(t.temaDalMockup({ ...risposta, ricetta: { ...risposta.ricetta, impaginazione: 'unica' } }, { struttura: 'per-categoria' }).tema.ricetta.impaginazione).toBe('per-categoria')
  })

  it('dal mockup: colori che non si leggono, colori mancanti, valori fuori vocabolario o struttura sconosciuta si rifiutano', () => {
    const colori = risposta.tavolozza.colori
    expect(t.temaDalMockup(risposta, { struttura: 'a-fisarmonica' }).errore).toMatch(/Struttura/)
    expect(t.temaDalMockup({ ...risposta, tavolozza: { base: 'tana-scuro', colori: { ...colori, '--text': '#2a3a30' } } }, { struttura: 'unica' }).errore).toMatch(/contrasto sotto 4,5/)
    expect(t.temaDalMockup({ ...risposta, tavolozza: { base: 'tana-scuro', colori: { ...colori, '--muted': '#2a3a30' } } }, { struttura: 'unica' }).errore).toMatch(/contrasto sotto 3/)
    const senzaCard = Object.fromEntries(Object.entries(colori).filter(([k]) => k !== '--card'))
    expect(t.temaDalMockup({ ...risposta, tavolozza: { base: 'tana-scuro', colori: senzaCard } }, { struttura: 'unica' }).errore).toMatch(/Mancano i colori: --card/)
    expect(t.temaDalMockup({ ...risposta, stile_vicino: 'notte' }, { struttura: 'unica' }).errore).toMatch(/esclusivo/)
    expect(t.temaDalMockup({ ...risposta, ricetta: { ...risposta.ricetta, sfondo: 'video' } }, { struttura: 'unica' }).errore).toMatch(/sfondo è uno fra/)
    expect(t.temaDalMockup({ ...risposta, nome: '' }, { struttura: 'unica' }).errore).toMatch(/nome/)
  })

  it('nelle Functions: il mockup passa dal credito del cassetto e dal controllo del tema; i temi del locale riscrivono la licenza; il titolare solo toglie e rimette', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const mockup = codice.slice(codice.indexOf('exports.temaDaMockup'), codice.indexOf('exports.licenzaSegueITemiSuMisura'))
    // Le opzioni delle Functions AI: il segreto della chiave e, con la
    // federazione, l'account di servizio dedicato.
    expect(mockup).toContain('onCall(OPTS_AI,')
    const opts = codice.slice(codice.indexOf('const OPTS_AI'), codice.indexOf('const OPTS_AI') + 400)
    expect(opts).toContain('secrets: [ANTHROPIC_API_KEY]')
    expect(opts).toContain('serviceAccount: process.env.AI_SERVICE_ACCOUNT')
    expect(mockup).toContain('req.auth.token?.email_verified !== true')
    expect(mockup).toContain("ai.preparaMessaggio({ ...(req.data || {}), tipo: 'tema' })")
    expect(mockup).toContain('await interrogaClaude(cliente.slug, messaggio)')
    expect(mockup).toContain('temi.temaDalMockup(esito.risultato, { struttura: messaggio.struttura })')
    expect(mockup).toContain('db.doc(`clienti/${uid}/temi_su_misura/${tema.id}`).set(doc)')
    // La licenza la riscrive il trigger, non le Functions che scrivono i
    // temi: quella dal mockup gira con l'account AI, che nei progetti dei
    // locali non entra.
    expect(mockup).not.toContain('scriviLicenza(')
    const trigger = codice.slice(codice.indexOf('exports.licenzaSegueITemiSuMisura'), codice.indexOf('exports.gestisciTemiSuMisura'))
    expect(trigger).toContain("onDocumentWritten({ ...OPTS, document: 'clienti/{uid}/temi_su_misura/{id}' }")
    expect(trigger).toContain('await scriviLicenza(cliente.slug)')
    // Il mockup non si salva: nel documento vanno solo il tipo, la struttura e il costo.
    expect(mockup).not.toMatch(/mockup: \{[^}]*file/)
    const gestisci = codice.slice(codice.indexOf('exports.gestisciTemiSuMisura'), codice.indexOf('exports.chiediTemaSuMisura'))
    expect(gestisci).toContain("if (!admin && !['pubblica', 'ritira'].includes(azione))")
    expect(gestisci).toContain('temi.azioneSuTemaSuMisura(prima, azione, req.data?.tema')
    expect(gestisci).not.toContain('scriviLicenza(')
    const chiedi = codice.slice(codice.indexOf('exports.chiediTemaSuMisura'), codice.indexOf('// ── IL SITO SI PRESENTA ALLA REGIA'))
    expect(chiedi).toContain('contatti.richiestaTemaSuMisura(')
    expect(chiedi).toContain('db.doc(`contatti/${contatti.idRichiestaTema(req.auth.uid)}`).set(r.documento)')
    // Da un'installazione (richiestaAI) il tema non si chiede.
    const porta = codice.slice(codice.indexOf('exports.richiestaAI'), codice.indexOf('async function interrogaClaude'))
    expect(porta).toContain('if (!ai.TIPI_INSTALLAZIONE.includes(messaggio.tipo)) return res.status(400)')
    // La licenza legge i temi su misura dalla sottoraccolta del cliente.
    expect(codice).toContain('db.collection(`clienti/${cliente.uid}/temi_su_misura`).get()')
    const regole = readFileSync('firestore.rules', 'utf8')
    const blocco = regole.slice(regole.indexOf('match /clienti/{uid}/temi_su_misura/{id}'), regole.indexOf('match /sconti/{codice}'))
    expect(blocco).toContain('allow read: if mio(uid) || admin();')
    expect(blocco).toContain('allow write: if false;')
  })
})
