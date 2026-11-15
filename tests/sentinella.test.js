'use strict'

// LA SENTINELLA DELLA REGIA (REQ-FLOTTA-111). Daniele, 14/11/2026: «niente
// allarmi google. Noi che possiamo fare internamente?», e sul canale degli
// avvisi: «Solo nel backoffice». Una Function programmata ogni 15 minuti
// guarda i siti, gli errori, le presentazioni e (una volta l'ora) i
// permessi; quello che non va diventa un allarme in Firestore, aperto una
// volta sola e chiuso quando il controllo torna in ordine. Un workflow
// GitHub fa da guardiano esterno, per quando a cadere è la regia stessa.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const s = require('../functions/lib/sentinella.js')

const ADESSO = new Date('2026-11-15T10:00:00.000Z')
const ORA = ADESSO.toISOString()
const SOGLIE = { errori: 3, presentazione_ore: 48, sito_secondi: 10 }

const istanza = (extra = {}) => ({
  slug: 'prova-bar',
  progetto: 'drinkpos-prova-bar',
  stato: 'attiva',
  url: 'https://drinkpos-prova-bar.web.app',
  versione: 'v1.10.50-beta',
  aggiornata_il: '2026-11-12T10:00:00.000Z',
  presentazione: { versione: 'v1.10.50-beta', il: '2026-11-14T09:00:00.000Z' },
  ...extra,
})

describe('le soglie', () => {
  it('senza documento valgono le predefinite', () => {
    expect(s.soglie(undefined)).toEqual(SOGLIE)
    expect(s.SOGLIE_PREDEFINITE).toEqual(SOGLIE)
  })

  it('un valore fuori dal suo intervallo si riporta dentro; uno che non è un numero torna al predefinito', () => {
    expect(s.soglie({ errori: 0, presentazione_ore: 10000, sito_secondi: 'tanti' })).toEqual({ errori: 1, presentazione_ore: 720, sito_secondi: 10 })
    expect(s.soglie({ errori: 5.7, sito_secondi: 1 })).toEqual({ errori: 5, presentazione_ore: 48, sito_secondi: 2 })
  })
})

describe('i siti', () => {
  it('si guardano la regia e i locali attivi con un indirizzo https; non la demo, i simulati, la semina, i sospesi e gli eliminati', () => {
    const siti = s.sitiDaGuardare({
      regia: 'https://drink-regia-test.web.app',
      istanze: [
        istanza(),
        istanza({ slug: 'prova-sospesa', stato: 'sospesa' }),
        istanza({ slug: 'prova-eliminata', stato: 'eliminata' }),
        istanza({ slug: 'prova-simulata', simulata: true, url: 'https://prova-simulata.simulata.invalid' }),
        istanza({ slug: 'prova-seminata', semina: true }),
        istanza({ slug: 'drinkpos-demo', progetto: 'drinkpos-demo', url: 'https://drinkpos-demo.web.app' }),
        istanza({ slug: 'prova-senza-url', url: null }),
        istanza({ slug: 'prova-http', url: 'http://drinkpos-prova-http.web.app' }),
      ],
    })
    expect(siti).toEqual([
      { soggetto: 'regia', url: 'https://drink-regia-test.web.app' },
      { soggetto: 'prova-bar', url: 'https://drinkpos-prova-bar.web.app' },
    ])
  })

  it('un sito che risponde 4xx o 5xx, o non risponde, è un problema; 2xx e 3xx vanno bene', () => {
    const segnali = s.segnaliSiti(
      [
        { soggetto: 'regia', url: 'https://drink-regia-test.web.app', status: 200 },
        { soggetto: 'prova-bar', url: 'https://drinkpos-prova-bar.web.app', status: 301 },
        { soggetto: 'prova-due', url: 'https://drinkpos-prova-due.web.app', status: 503 },
        { soggetto: 'prova-tre', url: 'https://drinkpos-prova-tre.web.app', status: null, errore: 'timeout' },
      ],
      SOGLIE
    )
    expect(segnali.map((x) => x.chiave)).toEqual(['sito--prova-due', 'sito--prova-tre'])
    expect(segnali[0]).toMatchObject({ controllo: 'siti', livello: 'problema', slug: 'prova-due' })
    expect(segnali[0].dettaglio).toContain('503')
    expect(segnali[1].dettaglio).toContain('10 s')
  })

  it('la regia stessa ha la sua chiave e nessun locale', () => {
    const [segnale] = s.segnaliSiti([{ soggetto: 'regia', url: 'https://drink-regia.web.app', status: 502 }], SOGLIE)
    expect(segnale).toMatchObject({ chiave: 'sito--regia', slug: null })
    expect(segnale.titolo).toContain('regia')
  })
})

// Le righe come le scrive functions/lib/registro.js (REQ-FLOTTA-110).
const chiamata = (funzione, esito, quando = '2026-11-15T09:50:00.000Z') => ({
  timestamp: quando,
  severity: esito === 'errore' ? 'ERROR' : 'INFO',
  resource: { labels: { service_name: funzione.toLowerCase() } },
  jsonPayload: { funzione, tipo: 'http', esito, message: `${funzione} ${esito === 'errore' ? 500 : 200}` },
})
const stack = (funzione, testo, quando = '2026-11-15T09:50:00.000Z') => ({
  timestamp: quando,
  severity: 'ERROR',
  resource: { labels: { service_name: funzione.toLowerCase() } },
  jsonPayload: { funzione, esito: 'errore', message: `Error: ${testo}\n    at gestore (index.js:1:1)` },
})

describe('gli errori', () => {
  it('si contano le chiamate finite in errore per Function; dalla soglia in su è un allarme', () => {
    const voci = [chiamata('presentazione', 'errore'), chiamata('presentazione', 'errore'), chiamata('presentazione', 'errore'), chiamata('temiDelLocale', 'errore'), chiamata('presentazione', 'ok')]
    const segnali = s.segnaliErrori(voci, SOGLIE)
    expect(segnali).toEqual([expect.objectContaining({ chiave: 'errori--presentazione', controllo: 'errori', livello: 'attenzione', slug: null })])
    expect(segnali[0].dettaglio).toMatch(/^3 errori/)
  })

  it('la riga dello stack non conta due volte: si contano le chiamate, e lo stack dà il dettaglio, senza email', () => {
    const voci = [1, 2, 3].flatMap((i) => [
      chiamata('gestisciCollaboratori', 'errore', `2026-11-15T09:5${i}:00.000Z`),
      stack('gestisciCollaboratori', `invio fallito a mario.rossi@example.com (${i})`, `2026-11-15T09:5${i}:00.000Z`),
    ])
    const [segnale] = s.segnaliErrori(voci, SOGLIE)
    expect(segnale.dettaglio).toMatch(/^3 errori/)
    expect(segnale.dettaglio).toContain('invio fallito a «email» (3)')
    expect(segnale.dettaglio).not.toContain('example.com')
  })

  it('le Function senza registro (i trigger) contano le loro righe d’errore per servizio', () => {
    const riga = { timestamp: '2026-11-15T09:50:00.000Z', severity: 'ERROR', resource: { labels: { service_name: 'licenzasegueilpiano' } }, textPayload: 'Error: 14 UNAVAILABLE' }
    const segnali = s.segnaliErrori([riga, riga, riga], SOGLIE)
    expect(segnali.map((x) => x.chiave)).toEqual(['errori--licenzasegueilpiano'])
  })

  it('sotto la soglia non c’è allarme', () => {
    expect(s.segnaliErrori([chiamata('presentazione', 'errore'), chiamata('presentazione', 'errore')], SOGLIE)).toEqual([])
  })

  it('la finestra parte dal giro prima, mai più indietro di un’ora; al primo giro sono 15 minuti', () => {
    expect(s.finestraErrori(null, ADESSO)).toBe('2026-11-15T09:45:00.000Z')
    expect(s.finestraErrori('2026-11-15T09:44:00.000Z', ADESSO)).toBe('2026-11-15T09:44:00.000Z')
    expect(s.finestraErrori('2026-11-15T05:00:00.000Z', ADESSO)).toBe('2026-11-15T09:00:00.000Z')
  })
})

describe('le presentazioni', () => {
  it('una versione presentata diversa da quella pubblicata, da più ore della soglia: attenzione', () => {
    const segnali = s.segnaliPresentazioni([istanza({ presentazione: { versione: 'v1.10.40-beta', il: '2026-11-12T09:00:00.000Z' } })], SOGLIE, ADESSO)
    expect(segnali).toEqual([expect.objectContaining({ chiave: 'presentazione--prova-bar', controllo: 'presentazioni', livello: 'attenzione', slug: 'prova-bar' })])
    expect(segnali[0].dettaglio).toContain('v1.10.40-beta')
    expect(segnali[0].dettaglio).toContain('v1.10.50-beta')
  })

  // REQ-FLOTTA-112: il 15/11 prova-e2e si presentava con la 1.10.50 (dalle
  // anteprime degli e2e) e la regia aveva pubblicato la 1.10.29: l'allarme
  // diceva «versione vecchia», ed era più nuova.
  it('più vecchia o più nuova di quella pubblicata: lo dice giusto', () => {
    const [vecchia] = s.segnaliPresentazioni([istanza({ presentazione: { versione: 'v1.10.40-beta', il: '2026-11-12T09:00:00.000Z' } })], SOGLIE, ADESSO)
    expect(vecchia.titolo).toBe('prova-bar è fermo a una versione vecchia')
    const [nuova] = s.segnaliPresentazioni([istanza({ versione: 'v1.10.29-beta', presentazione: { versione: 'v1.10.50-beta', il: '2026-11-14T09:00:00.000Z' } })], SOGLIE, ADESSO)
    expect(nuova.titolo).toBe('prova-bar ha una versione più nuova di quella pubblicata')
    expect(nuova.dettaglio).toBe('Si presenta con la v1.10.50-beta, la regia ha pubblicato la v1.10.29-beta: è arrivata da fuori dalla regia.')
  })

  it('dentro la soglia non si dice niente: l’app si presenta alla prossima apertura', () => {
    expect(s.segnaliPresentazioni([istanza({ aggiornata_il: '2026-11-14T10:00:00.000Z', presentazione: { versione: 'v1.10.40-beta' } })], SOGLIE, ADESSO)).toEqual([])
  })

  it('il conto parte dalla fine dell’ultimo aggiornamento, se c’è', () => {
    const ist = istanza({ aggiornamento: { stato: 'riuscito', finito_il: '2026-11-15T08:00:00.000Z' }, presentazione: { versione: 'v1.10.40-beta' } })
    expect(s.segnaliPresentazioni([ist], SOGLIE, ADESSO)).toEqual([])
  })

  it('un locale attivo che non si è mai presentato', () => {
    const [segnale] = s.segnaliPresentazioni([istanza({ presentazione: undefined })], SOGLIE, ADESSO)
    expect(segnale.titolo).toContain('mai')
  })

  it('un locale esistente che la regia non aggiorna: la versione diversa non conta, il «mai presentato» sì', () => {
    const esistente = { origine: 'esistente' }
    expect(s.segnaliPresentazioni([istanza({ ...esistente, presentazione: { versione: 'v1.10.40-beta' } })], SOGLIE, ADESSO)).toEqual([])
    expect(s.segnaliPresentazioni([istanza({ ...esistente, presentazione: undefined })], SOGLIE, ADESSO)).toHaveLength(1)
  })

  it('non si guardano demo, simulati, semina, sospesi ed eliminati', () => {
    const mai = { presentazione: undefined }
    const altri = [
      istanza({ ...mai, slug: 'drinkpos-demo', progetto: 'drinkpos-demo' }),
      istanza({ ...mai, simulata: true }),
      istanza({ ...mai, semina: true }),
      istanza({ ...mai, stato: 'sospesa' }),
      istanza({ ...mai, stato: 'eliminata' }),
    ]
    expect(s.segnaliPresentazioni(altri, SOGLIE, ADESSO)).toEqual([])
  })
})

describe('i permessi', () => {
  it('un ruolo che manca è un problema, con la riga che lo dà', () => {
    const permessi = { 'prova-bar': { progetto: ['datastore.entities.get', 'datastore.entities.update'], firma: ['iam.serviceAccounts.signBlob'] } }
    const [segnale] = s.segnaliPermessi([istanza()], permessi)
    expect(segnale).toMatchObject({ chiave: 'permessi--prova-bar', controllo: 'permessi', livello: 'problema', slug: 'prova-bar' })
    expect(segnale.dettaglio).toContain('roles/firebaseauth.viewer')
    expect(segnale.dettaglio).toContain('scripts/account-runtime.mjs')
  })

  it('una domanda senza risposta non è un permesso che manca', () => {
    expect(s.segnaliPermessi([istanza()], { 'prova-bar': { progetto: null, firma: null } })).toEqual([])
    expect(s.segnaliPermessi([istanza()], {})).toEqual([])
  })
})

describe('il giro', () => {
  it('siti, errori e presentazioni a ogni giro; i permessi una volta l’ora', () => {
    expect(s.controlliDelGiro(null, ADESSO)).toEqual(['siti', 'errori', 'presentazioni', 'permessi'])
    expect(s.controlliDelGiro({ controlli: { permessi: { il: '2026-11-15T09:30:00.000Z', ok: true } } }, ADESSO)).toEqual(['siti', 'errori', 'presentazioni'])
    expect(s.controlliDelGiro({ controlli: { permessi: { il: '2026-11-15T08:59:00.000Z', ok: true } } }, ADESSO)).toContain('permessi')
  })

  it('un sito giù si conferma al giro dopo: un intoppo di un momento non apre un allarme', () => {
    const sito = { chiave: 'sito--prova-bar', controllo: 'siti' }
    const errori = { chiave: 'errori--presentazione', controllo: 'errori' }
    const primo = s.conferma([sito, errori], { inOsservazione: {}, aperti: [], adesso: ADESSO })
    expect(primo.segnali).toEqual([errori])
    expect(primo.in_osservazione).toEqual({ 'sito--prova-bar': ORA })
    const dopo = new Date('2026-11-15T10:15:00.000Z')
    const secondo = s.conferma([sito], { inOsservazione: primo.in_osservazione, aperti: [], adesso: dopo })
    expect(secondo.segnali).toEqual([sito])
    expect(secondo.in_osservazione).toEqual({ 'sito--prova-bar': ORA })
  })

  it('un sito con l’allarme già aperto resta confermato; uno tornato su esce dall’osservazione', () => {
    const sito = { chiave: 'sito--prova-bar', controllo: 'siti' }
    expect(s.conferma([sito], { inOsservazione: {}, aperti: ['sito--prova-bar'], adesso: ADESSO }).segnali).toEqual([sito])
    expect(s.conferma([], { inOsservazione: { 'sito--prova-bar': ORA }, aperti: [], adesso: ADESSO }).in_osservazione).toEqual({})
  })
})

describe('gli allarmi', () => {
  const segnale = { chiave: 'sito--prova-bar', controllo: 'siti', livello: 'problema', titolo: 'Il sito di prova-bar non risponde', dettaglio: 'HTTP 503', slug: 'prova-bar' }

  it('un segnale nuovo apre un allarme, col documento che ha la chiave per nome', () => {
    expect(s.aggiornaAllarmi({ allarmi: [], segnali: [segnale], eseguiti: ['siti'], adesso: ADESSO })).toEqual([
      { id: 'sito--prova-bar', dati: { ...segnale, aperto: true, aperto_il: ORA, visto_il: ORA, chiuso_il: null, volte: 1 } },
    ])
  })

  it('un allarme già aperto non si riapre: si aggiornano il dettaglio e quando è stato visto', () => {
    const aperto = { id: 'sito--prova-bar', ...segnale, dettaglio: 'HTTP 502', aperto: true, aperto_il: '2026-11-15T09:00:00.000Z', visto_il: '2026-11-15T09:45:00.000Z', chiuso_il: null, volte: 1 }
    expect(s.aggiornaAllarmi({ allarmi: [aperto], segnali: [segnale], eseguiti: ['siti'], adesso: ADESSO })).toEqual([
      { id: 'sito--prova-bar', dati: { livello: 'problema', titolo: segnale.titolo, dettaglio: 'HTTP 503', visto_il: ORA } },
    ])
  })

  it('un controllo fatto che non trova più il problema chiude l’allarme', () => {
    const aperto = { id: 'sito--prova-bar', ...segnale, aperto: true, aperto_il: '2026-11-15T09:00:00.000Z', volte: 1 }
    expect(s.aggiornaAllarmi({ allarmi: [aperto], segnali: [], eseguiti: ['siti'], adesso: ADESSO })).toEqual([{ id: 'sito--prova-bar', dati: { aperto: false, chiuso_il: ORA } }])
  })

  it('un controllo che non si è potuto fare non chiude niente', () => {
    const aperto = { id: 'sito--prova-bar', ...segnale, aperto: true, aperto_il: '2026-11-15T09:00:00.000Z', volte: 1 }
    expect(s.aggiornaAllarmi({ allarmi: [aperto], segnali: [], eseguiti: ['errori'], adesso: ADESSO })).toEqual([])
  })

  it('un problema che torna riapre lo stesso allarme e conta le volte', () => {
    const chiuso = { id: 'sito--prova-bar', ...segnale, aperto: false, aperto_il: '2026-11-14T09:00:00.000Z', chiuso_il: '2026-11-14T10:00:00.000Z', volte: 2 }
    expect(s.aggiornaAllarmi({ allarmi: [chiuso], segnali: [segnale], eseguiti: ['siti'], adesso: ADESSO })).toEqual([
      { id: 'sito--prova-bar', dati: { ...segnale, aperto: true, aperto_il: ORA, visto_il: ORA, chiuso_il: null, volte: 3 } },
    ])
  })

  it('la chiave diventa un nome di documento valido', () => {
    expect(s.chiave('errori', 'una/Function strana')).toBe('errori--una_Function_strana')
  })
})

describe('la prova di vita', () => {
  it('la sentinella è viva se ha finito un giro negli ultimi 45 minuti', () => {
    expect(s.viva({ ultimo_giro_il: '2026-11-15T09:30:00.000Z' }, ADESSO)).toEqual({ viva: true, minuti: 30 })
    expect(s.viva({ ultimo_giro_il: '2026-11-15T09:00:00.000Z' }, ADESSO)).toEqual({ viva: false, minuti: 60 })
    expect(s.viva(null, ADESSO)).toEqual({ viva: false, minuti: null })
  })
})

describe('index.js e il guardiano esterno', () => {
  const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')

  it('la sentinella gira ogni 15 minuti, ora di Roma, e un giro andato male non si ripete', () => {
    expect(codice).toContain("const { onSchedule } = require('firebase-functions/v2/scheduler')")
    expect(codice).toContain("exports.sentinella = onSchedule({ ...OPTS, schedule: 'every 15 minutes', timeZone: 'Europe/Rome', retryCount: 0, timeoutSeconds: 300 }")
    // Una sola Function a tempo in tutta la regia.
    expect(codice.match(/onSchedule\(/g)).toHaveLength(1)
  })

  it('il giro a mano è solo dell’admin; la prova di vita risponde a tutti, solo coi minuti', () => {
    const i = codice.indexOf('exports.giroSentinella = onCall(')
    expect(i).toBeGreaterThan(0)
    expect(codice.slice(i, i + 300)).toContain('req.auth?.token?.admin !== true')
    expect(codice).toContain('exports.sentinellaViva = onRequest(')
  })

  it('il guardiano: ogni mezz’ora, le due regie, nessun segreto e nessun permesso', () => {
    const wf = readFileSync('.github/workflows/guardiano.yml', 'utf8').replace(/\r\n/g, '\n')
    expect(wf).toMatch(/schedule:\n\s+- cron: '\d+,\d+ \* \* \* \*'/)
    expect(wf).toContain('permissions: {}')
    expect(wf).toContain('regia: [drink-regia, drink-regia-test]')
    expect(wf).toContain('sentinellaViva')
    expect(wf).not.toContain('secrets.')
  })
})
