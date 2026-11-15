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
    expect(p.corpoPresentazione({ versione: 'v1.10.4' })).toEqual({ versione: 'v1.10.4', dispositivo: null })
    expect(p.corpoPresentazione({ versione: ' 1.10.4 ' })).toEqual({ versione: 'v1.10.4', dispositivo: null })
    expect(p.corpoPresentazione({ versione: '1.11.0-beta.2' })).toEqual({ versione: 'v1.11.0-beta.2', dispositivo: null })
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
    // Senza codice del dispositivo (l'app fino alla 1.10.50) vale come un
    // dispositivo solo, «senza_codice» (REQ-FLOTTA-112).
    expect(prima).toEqual({
      presentazione: {
        versione: 'v1.10.4',
        minima: 'v1.10.4',
        il: ADESSO.toISOString(),
        prima_il: ADESSO.toISOString(),
        dispositivi: { senza_codice: { versione: 'v1.10.4', il: ADESSO.toISOString() } },
      },
    })
    expect(JSON.stringify(prima)).not.toContain('u1')
    const dopo = new Date('2026-11-03T08:00:00.000Z')
    expect(p.registroPresentazione(prima, { versione: 'v1.10.4', adesso: dopo }).presentazione).toMatchObject({
      versione: 'v1.10.4',
      il: dopo.toISOString(),
      prima_il: ADESSO.toISOString(),
    })
    const codice = readFileSync('functions/index.js', 'utf8')
    expect(codice).toContain('presenta.registroPresentazione(attuale, { ...corpo, anteprima })')
    // Una versione nuova riparte da capo.
    expect(p.registroPresentazione(prima, { versione: 'v1.11.0', adesso: dopo }).presentazione.prima_il).toBe(dopo.toISOString())
  })

  it('la stessa versione vista da poco non si riscrive: dieci tablet, una scrittura', () => {
    const ist = p.registroPresentazione(null, { versione: 'v1.10.4', adesso: ADESSO })
    expect(p.daRegistrare(ist, { versione: 'v1.10.4' }, new Date(ADESSO.getTime() + 60_000))).toBe(false)
    expect(p.daRegistrare(ist, { versione: 'v1.10.4' }, new Date(ADESSO.getTime() + p.RISCRIVI_DOPO + 1))).toBe(true)
    expect(p.daRegistrare(ist, { versione: 'v1.11.0' }, ADESSO)).toBe(true)
    expect(p.daRegistrare(null, { versione: 'v1.10.4' }, ADESSO)).toBe(true)
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

  // REQ-FLOTTA-108 (verifica del 14/11/2026): drinkpos-prova-e2e senza i
  // ruoli del nuovo account della regia di test riceveva un 500 muto.
  it('la licenza che non si legge è un 503 col motivo nel registro, e nessun errore resta muto', () => {
    const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
    const inizio = codice.indexOf('exports.presentazione = onRequest')
    const corpo = codice.slice(inizio, codice.indexOf('// ── IL PIANO CHE CAMBIA', inizio))
    const lettura = corpo.indexOf('.doc(LICENZA_PROTETTA).get()')
    expect(lettura).toBeGreaterThan(0)
    // La lettura sta in un try, e il suo catch scrive il motivo e risponde 503.
    const prima = corpo.slice(0, lettura)
    expect(prima.lastIndexOf('try {')).toBeGreaterThan(prima.lastIndexOf('}'))
    const dopo = corpo.slice(lettura)
    expect(dopo).toMatch(/catch \(e\) \{\n\s+console\.error\(`\[presentazione\] \$\{slug\}: la licenza non si legge: /)
    expect(dopo.slice(0, dopo.indexOf('const cosa ='))).toContain('res.status(503)')
    // Il resto: un errore inatteso si scrive col suo dettaglio prima del 500.
    expect(corpo).toContain("console.error('[presentazione] errore inatteso:', e)")
    expect(corpo).toContain('res.status(500)')
  })

  it('il contratto dice che il 503 vale anche per la licenza che non si legge', () => {
    const doc = readFileSync('docs/contratto-regia-app.md', 'utf8')
    expect(doc).toContain('`503` licenza che non si legge o non si scrive')
  })
})

// LA VERSIONE PER DISPOSITIVO (REQ-FLOTTA-112). tana-drink, 15/11/2026, su
// decisione di Daniele: ogni dispositivo manda un suo codice casuale, così
// la regia sa la versione più alta e la più bassa ancora in giro. Il 14/11
// la presentazione di un tablet alla 1.10.40 aveva preso il posto della
// 1.10.50 già arrivata agli altri.
const CODICE_A = 'AAAAAAAAAAAAAAAAAAAAAA'
const CODICE_B = 'b-b_b-b_b-b_b-b_b-b_bb'
const CODICE_C = 'Cc0123456789Cc01234567'
const giorniDopo = (g) => new Date(ADESSO.getTime() + g * 24 * 3600 * 1000)
const presenta = (prima, corpo, adesso = ADESSO) => p.registroPresentazione(prima, { ...corpo, adesso })

describe('la versione per dispositivo (REQ-FLOTTA-112)', () => {
  it('il codice del dispositivo: 22 caratteri base64url; un codice sbagliato si ignora, la versione resta buona', () => {
    expect(p.corpoPresentazione({ versione: '1.10.51-beta', dispositivo: CODICE_B })).toEqual({ versione: 'v1.10.51-beta', dispositivo: CODICE_B })
    for (const dispositivo of ['corto', `${CODICE_A}A`, 'AAAAAAAAAAAAAAAAAAAAA=', 'AAAAAAAAAAAAAAAAAAAA+/', 12345, { a: 1 }, null]) {
      expect(p.corpoPresentazione({ versione: '1.10.51-beta', dispositivo })).toEqual({ versione: 'v1.10.51-beta', dispositivo: null })
    }
  })

  it('le versioni in ordine: la beta prima della sua uscita, beta.2 prima di beta.10, con o senza la v', () => {
    const ordine = ['v1.10.4', 'v1.10.40-beta', 'v1.10.40-beta.2', 'v1.10.40-beta.10', 'v1.10.40', 'v1.10.50-beta', 'v1.11.0']
    const mescolate = [...ordine].reverse()
    expect(mescolate.sort(p.confrontaVersioni)).toEqual(ordine)
    expect(p.confrontaVersioni('1.10.50-beta', 'v1.10.50-beta')).toBe(0)
  })

  it('la versione è la più alta fra i dispositivi, non l’ultima arrivata; la minima è la più bassa', () => {
    const a = presenta(null, { versione: 'v1.10.50-beta', dispositivo: CODICE_A })
    const b = presenta(a, { versione: 'v1.10.40-beta', dispositivo: CODICE_B }, giorniDopo(1))
    expect(b.presentazione).toMatchObject({ versione: 'v1.10.50-beta', minima: 'v1.10.40-beta', il: giorniDopo(1).toISOString(), prima_il: ADESSO.toISOString() })
    expect(b.presentazione.dispositivi).toEqual({
      [CODICE_A]: { versione: 'v1.10.50-beta', il: ADESSO.toISOString() },
      [CODICE_B]: { versione: 'v1.10.40-beta', il: giorniDopo(1).toISOString() },
    })
    // Il tablet indietro si aggiorna: la minima sale, la più alta resta.
    const c = presenta(b, { versione: 'v1.10.50-beta', dispositivo: CODICE_B }, giorniDopo(2))
    expect(c.presentazione).toMatchObject({ versione: 'v1.10.50-beta', minima: 'v1.10.50-beta', prima_il: ADESSO.toISOString() })
    // Una versione più alta riparte da capo con prima_il.
    const d = presenta(c, { versione: 'v1.10.51-beta', dispositivo: CODICE_C }, giorniDopo(3))
    expect(d.presentazione).toMatchObject({ versione: 'v1.10.51-beta', minima: 'v1.10.50-beta', prima_il: giorniDopo(3).toISOString() })
  })

  it('le app senza codice contano come un dispositivo solo, accanto a quelli col codice', () => {
    const a = presenta(null, { versione: 'v1.10.51-beta', dispositivo: CODICE_A })
    const b = presenta(a, { versione: 'v1.10.40-beta' }, giorniDopo(1))
    expect(Object.keys(b.presentazione.dispositivi).sort()).toEqual([CODICE_A, p.SENZA_CODICE].sort())
    expect(b.presentazione).toMatchObject({ versione: 'v1.10.51-beta', minima: 'v1.10.40-beta' })
  })

  it('il registro di prima (senza dispositivi) diventa il dispositivo senza codice, con la sua data', () => {
    const vecchio = { presentazione: { versione: 'v1.10.40-beta', il: ADESSO.toISOString(), prima_il: ADESSO.toISOString() } }
    const nuovo = presenta(vecchio, { versione: 'v1.10.51-beta', dispositivo: CODICE_A }, giorniDopo(1))
    expect(nuovo.presentazione.dispositivi[p.SENZA_CODICE]).toEqual({ versione: 'v1.10.40-beta', il: ADESSO.toISOString() })
    expect(nuovo.presentazione).toMatchObject({ versione: 'v1.10.51-beta', minima: 'v1.10.40-beta' })
  })

  it('un dispositivo che non si presenta da 30 giorni esce dal conto, e ci torna se si ripresenta', () => {
    const a = presenta(null, { versione: 'v1.10.40-beta', dispositivo: CODICE_A })
    const dentro = presenta(a, { versione: 'v1.10.51-beta', dispositivo: CODICE_B }, giorniDopo(29))
    expect(dentro.presentazione.minima).toBe('v1.10.40-beta')
    const fuori = presenta(a, { versione: 'v1.10.51-beta', dispositivo: CODICE_B }, giorniDopo(31))
    expect(fuori.presentazione.dispositivi).not.toHaveProperty(CODICE_A)
    expect(fuori.presentazione.minima).toBe('v1.10.51-beta')
    const torna = presenta(fuori, { versione: 'v1.10.40-beta', dispositivo: CODICE_A }, giorniDopo(32))
    expect(torna.presentazione.minima).toBe('v1.10.40-beta')
    expect(p.DISPOSITIVO_SCADE).toBe(30 * 24 * 3600 * 1000)
  })

  it('al massimo 50 dispositivi: oltre, esce quello visto meno di recente', () => {
    const dispositivi = Object.fromEntries(
      Array.from({ length: p.MAX_DISPOSITIVI }, (_, i) => [`d${String(i).padStart(21, '0')}`, { versione: 'v1.10.50-beta', il: new Date(ADESSO.getTime() + i * 60_000).toISOString() }])
    )
    const prima = { presentazione: { versione: 'v1.10.50-beta', minima: 'v1.10.50-beta', il: ADESSO.toISOString(), prima_il: ADESSO.toISOString(), dispositivi } }
    const dopo = presenta(prima, { versione: 'v1.10.51-beta', dispositivo: CODICE_A }, giorniDopo(1))
    expect(Object.keys(dopo.presentazione.dispositivi)).toHaveLength(p.MAX_DISPOSITIVI)
    expect(dopo.presentazione.dispositivi).toHaveProperty(CODICE_A)
    expect(dopo.presentazione.dispositivi).not.toHaveProperty(`d${'0'.repeat(21)}`)
    expect(p.MAX_DISPOSITIVI).toBe(50)
  })

  it('un dispositivo si riscrive al più ogni 6 ore, se la versione non cambia', () => {
    const a = presenta(null, { versione: 'v1.10.51-beta', dispositivo: CODICE_A })
    expect(p.RISCRIVI_DOPO).toBe(6 * 3600 * 1000)
    expect(p.daRegistrare(a, { versione: 'v1.10.51-beta', dispositivo: CODICE_A }, new Date(ADESSO.getTime() + 3600_000))).toBe(false)
    expect(p.daRegistrare(a, { versione: 'v1.10.51-beta', dispositivo: CODICE_A }, new Date(ADESSO.getTime() + p.RISCRIVI_DOPO + 1))).toBe(true)
    expect(p.daRegistrare(a, { versione: 'v1.10.52-beta', dispositivo: CODICE_A }, new Date(ADESSO.getTime() + 60_000))).toBe(true)
    // Un dispositivo nuovo si segna subito.
    expect(p.daRegistrare(a, { versione: 'v1.10.51-beta', dispositivo: CODICE_B }, new Date(ADESSO.getTime() + 60_000))).toBe(true)
  })
})

describe('le presentazioni dai canali di anteprima (REQ-FLOTTA-112)', () => {
  it('un’anteprima è <sito>--<canale>.web.app o .firebaseapp.com; i domini dei locali mai', () => {
    expect(p.daAnteprima('https://drinkpos-prova-e2e--e2e-123-a1b2c3d4.web.app')).toBe(true)
    expect(p.daAnteprima('https://drinkpos-prova-e2e--e2e-123-a1b2c3d4.firebaseapp.com')).toBe(true)
    for (const origine of ['https://drinkpos-prova-e2e.web.app', 'https://drinkpos-prova-e2e.firebaseapp.com', 'https://ordini.latana.it', 'https://a--b.example.com', 'http://localhost:5173', 'null', '', undefined, 'non è un indirizzo']) {
      expect(p.daAnteprima(origine)).toBe(false)
    }
  })

  it('un’anteprima non cambia la versione installata: si segna a parte, l’ultima', () => {
    const installata = presenta(null, { versione: 'v1.10.29-beta', dispositivo: CODICE_A })
    const dopo = presenta(installata, { versione: 'v1.10.50-beta', dispositivo: CODICE_B, anteprima: true }, giorniDopo(1))
    expect(dopo.presentazione).toEqual({ ...installata.presentazione, anteprima: { versione: 'v1.10.50-beta', il: giorniDopo(1).toISOString() } })
    // Un locale che si è presentato solo da un'anteprima resta «mai presentato».
    expect(presenta(null, { versione: 'v1.10.50-beta', anteprima: true }).presentazione).toEqual({ anteprima: { versione: 'v1.10.50-beta', il: ADESSO.toISOString() } })
    // Un'anteprima vista da poco non si riscrive: l'e2e si presenta due volte di fila.
    expect(p.daRegistrare(dopo, { versione: 'v1.10.50-beta', anteprima: true }, new Date(giorniDopo(1).getTime() + 20_000))).toBe(false)
    expect(p.daRegistrare(dopo, { versione: 'v1.10.51-beta', anteprima: true }, new Date(giorniDopo(1).getTime() + 20_000))).toBe(true)
  })

  it('la Function guarda l’origine della chiamata e scrive in una transazione', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    expect(codice).toContain("presenta.daAnteprima(req.get('origin'))")
    expect(codice).toMatch(/db\.runTransaction\(async \(t\) => \{\s*const attuale = \(await t\.get\(trovata\.ref\)\)\.data\(\)/)
  })
})
