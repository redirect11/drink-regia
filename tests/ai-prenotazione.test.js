'use strict'

// LA PRENOTAZIONE DEL CREDITO AI (REQ-FLOTTA-088). Audit di sicurezza del
// 13/11/2026, Daniele: «questi andrebbero sistemati». Prima N richieste in
// parallelo vedevano lo stesso credito e passavano tutte: il credito andava
// sotto zero, e un locale solo poteva occupare la Function di tutta la
// flotta. Ora la stima massima si prenota in una transazione PRIMA della
// chiamata, e dopo si corregge col costo vero.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')
const listino = require('../functions/piani.json')

const AI = listino.ai
const ADESSO = new Date('2026-11-13T10:00:00Z')
const MESE = '2026-11'
const pieno = () => ({ attivo: true, credito_microeuro: 10_000_000, mese: MESE, speso_mese_microeuro: 0, tetto_mensile_microeuro: 20_000_000 })
const fra = (ms) => new Date(ADESSO.getTime() + ms)

const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
const tratto = (da, a) => codice.slice(codice.indexOf(da), codice.indexOf(a, codice.indexOf(da) + 1))

describe('la stima massima', () => {
  it('usa il prezzo più alto del listino: il fallback può costare più del modello chiesto', () => {
    const m = ai.preparaMessaggio({ tipo: 'descrizione', nome: 'Gin' })
    const usd = (p) => (m.stimaInputToken * p.input + m.max_tokens * p.output) / 1e6
    const piuCaro = Math.max(...Object.values(AI.prezzi_usd_per_milione).map(usd))
    expect(ai.stimaMassimaMicroeuro(m)).toBe(Math.ceil(piuCaro * AI.cambio_eur_per_usd * AI.ricarico * 1_000_000))
    // Con il listino di oggi il modello chiesto non è il più caro.
    expect(ai.stimaMassimaMicroeuro(m)).toBeGreaterThan(Math.ceil(usd(AI.prezzi_usd_per_milione[AI.modello]) * AI.cambio_eur_per_usd * AI.ricarico * 1_000_000))
  })
})

describe('la prenotazione prima della chiamata', () => {
  it('scala la stima dal credito, la somma al mese e segna la richiesta in corso', () => {
    const p = ai.prenota(pieno(), { id: 'r1', stima: 300_000, tipo: 'descrizione', adesso: ADESSO })
    expect(p.ok).toBe(true)
    expect(p.patch.credito_microeuro).toBe(9_700_000)
    expect(p.patch.speso_mese_microeuro).toBe(300_000)
    expect(p.patch.mese).toBe(MESE)
    expect(p.patch.prenotazioni).toEqual({ r1: { il: ADESSO.toISOString(), stima: 300_000, tipo: 'descrizione', mese: MESE } })
    expect(p.scadute).toEqual([])
  })

  it('due richieste insieme non spendono lo stesso credito: la seconda vede quello che resta', () => {
    const cassetto = { ...pieno(), credito_microeuro: 500_000 }
    const prima = ai.prenota(cassetto, { id: 'r1', stima: 300_000, tipo: 'fattura', adesso: ADESSO })
    expect(prima.ok).toBe(true)
    const seconda = ai.prenota({ ...cassetto, ...prima.patch }, { id: 'r2', stima: 300_000, tipo: 'fattura', adesso: ADESSO })
    expect(seconda).toMatchObject({ ok: false, http: 402, codice: 'credito' })
  })

  it('rifiuta senza cassetto, col cassetto spento, a credito finito o sotto la stima, oltre il tetto', () => {
    const r = (cassetto, stima = 1) => ai.prenota(cassetto, { id: 'r', stima, tipo: 'descrizione', adesso: ADESSO })
    expect(r(null)).toMatchObject({ ok: false, http: 402, codice: 'senza-cassetto', patch: null })
    expect(r({ ...pieno(), attivo: false })).toMatchObject({ ok: false, http: 402, codice: 'spento' })
    expect(r({ ...pieno(), credito_microeuro: 0 })).toMatchObject({ ok: false, codice: 'credito' })
    expect(r({ ...pieno(), credito_microeuro: -5 })).toMatchObject({ ok: false, codice: 'credito' })
    expect(r({ ...pieno(), credito_microeuro: 299_999 }, 300_000)).toMatchObject({ ok: false, codice: 'credito' })
    expect(r({ ...pieno(), speso_mese_microeuro: 19_800_000 }, 300_000)).toMatchObject({ ok: false, codice: 'tetto' })
  })

  it('oltre il tetto delle richieste contemporanee del locale: 429 occupato', () => {
    expect(ai.MAX_CONTEMPORANEE).toBe(2)
    let cassetto = pieno()
    for (const id of ['r1', 'r2']) {
      const p = ai.prenota(cassetto, { id, stima: 100_000, tipo: 'descrizione', adesso: ADESSO })
      expect(p.ok).toBe(true)
      cassetto = { ...cassetto, ...p.patch }
    }
    const terza = ai.prenota(cassetto, { id: 'r3', stima: 100_000, tipo: 'descrizione', adesso: ADESSO })
    expect(terza).toMatchObject({ ok: false, http: 429, codice: 'occupato', perche: 'Troppe richieste AI insieme: riprova tra poco.' })
    // Il credito non si tocca per un rifiuto.
    expect(terza.patch).toBeNull()
  })
})

describe('la correzione dopo la risposta', () => {
  const prenotato = () => {
    const p = ai.prenota(pieno(), { id: 'r1', stima: 300_000, tipo: 'descrizione', adesso: ADESSO })
    return { ...pieno(), ...p.patch }
  }

  it('restituisce la differenza fra stima e costo vero e toglie la prenotazione', () => {
    const c = ai.chiudiPrenotazione(prenotato(), { id: 'r1', costo: 12_000, adesso: fra(5_000) })
    expect(c.trovata).toBe(true)
    expect(c.patch.credito_microeuro).toBe(10_000_000 - 12_000)
    expect(c.patch.speso_mese_microeuro).toBe(12_000)
    expect(c.patch.prenotazioni).toEqual({})
  })

  it('una chiamata fallita senza costo restituisce tutta la stima', () => {
    const c = ai.chiudiPrenotazione(prenotato(), { id: 'r1', costo: 0, adesso: fra(5_000) })
    expect(c.patch.credito_microeuro).toBe(10_000_000)
    expect(c.patch.speso_mese_microeuro).toBe(0)
    expect(c.patch.prenotazioni).toEqual({})
  })

  it('prenotata a fine mese e chiusa nel mese nuovo: il mese nuovo porta il costo vero', () => {
    const fineMese = new Date('2026-11-30T22:59:00Z')
    const p = ai.prenota({ ...pieno(), speso_mese_microeuro: 4_000_000 }, { id: 'r1', stima: 300_000, tipo: 'fattura', adesso: fineMese })
    const c = ai.chiudiPrenotazione({ ...pieno(), ...p.patch }, { id: 'r1', costo: 50_000, adesso: new Date('2026-11-30T23:01:00Z') })
    expect(c.patch.mese).toBe('2026-12')
    expect(c.patch.speso_mese_microeuro).toBe(50_000)
    expect(c.patch.credito_microeuro).toBe(10_000_000 - 50_000)
  })

  it('una prenotazione che non c’è più (già considerata interrotta) non si corregge due volte', () => {
    expect(ai.chiudiPrenotazione(pieno(), { id: 'sparita', costo: 12_000, adesso: ADESSO })).toEqual({ trovata: false, patch: null })
  })
})

describe('le prenotazioni rimaste appese', () => {
  it('scadono dopo il timeout della Function con un margine, e il timeout della Function viene da qui', () => {
    expect(ai.TIMEOUT_AI_SECONDI).toBe(300)
    expect(ai.SCADENZA_PRENOTAZIONE_MS).toBeGreaterThan(ai.TIMEOUT_AI_SECONDI * 1000)
    expect(codice).toMatch(/timeoutSeconds: ai\.TIMEOUT_AI_SECONDI/)
  })

  it('una scaduta non blocca il locale: non conta fra le contemporanee', () => {
    let cassetto = pieno()
    for (const id of ['r1', 'r2']) cassetto = { ...cassetto, ...ai.prenota(cassetto, { id, stima: 100_000, tipo: 'descrizione', adesso: ADESSO }).patch }
    const dopo = fra(ai.SCADENZA_PRENOTAZIONE_MS + 1)
    const p = ai.prenota(cassetto, { id: 'r3', stima: 100_000, tipo: 'descrizione', adesso: dopo })
    expect(p.ok).toBe(true)
    expect(Object.keys(p.patch.prenotazioni)).toEqual(['r3'])
    expect(p.scadute.map((s) => s.id).sort()).toEqual(['r1', 'r2'])
  })

  it('una scaduta si considera consumata alla stima, non restituita: Anthropic potrebbe averla già fatturata', () => {
    const p1 = ai.prenota(pieno(), { id: 'r1', stima: 300_000, tipo: 'fattura', adesso: ADESSO })
    const cassetto = { ...pieno(), ...p1.patch }
    const dopo = fra(ai.SCADENZA_PRENOTAZIONE_MS + 1)
    const p = ai.prenota(cassetto, { id: 'r2', stima: 100_000, tipo: 'descrizione', adesso: dopo })
    // Il credito resta quello scalato dalla prima, meno la nuova stima.
    expect(p.patch.credito_microeuro).toBe(10_000_000 - 300_000 - 100_000)
    expect(p.patch.speso_mese_microeuro).toBe(300_000 + 100_000)
    // La riga di consumo dice che è stata interrotta, con la stima come costo.
    const riga = ai.rigaInterrotta(p.scadute[0], dopo)
    expect(riga).toMatchObject({ tipo: 'fattura', costo_microeuro: 300_000, esito: 'interrotta', mese: MESE, prenotata_il: ADESSO.toISOString() })
  })

  it('anche un rifiuto pulisce le scadute, così le righe «interrotta» si scrivono una volta sola', () => {
    const p1 = ai.prenota(pieno(), { id: 'r1', stima: 300_000, tipo: 'fattura', adesso: ADESSO })
    const cassetto = { ...pieno(), ...p1.patch, attivo: false }
    const p = ai.prenota(cassetto, { id: 'r2', stima: 100_000, tipo: 'descrizione', adesso: fra(ai.SCADENZA_PRENOTAZIONE_MS + 1) })
    expect(p.ok).toBe(false)
    expect(p.scadute.map((s) => s.id)).toEqual(['r1'])
    expect(p.patch).toEqual({ prenotazioni: {} })
  })
})

describe('il credito chiesto dall’installazione tiene conto della stima', () => {
  it('«attivo» vuol dire che una descrizione può partire, non un micro-euro', () => {
    const stima = ai.stimaMassimaMicroeuro(ai.preparaMessaggio({ tipo: 'descrizione', nome: 'Prodotto' }))
    expect(ai.rispostaCredito({ ...pieno(), credito_microeuro: stima - 1 }, ADESSO)).toMatchObject({ attivo: false, motivo: 'credito' })
    expect(ai.rispostaCredito({ ...pieno(), credito_microeuro: stima }, ADESSO)).toMatchObject({ attivo: true, motivo: null })
  })
})

describe('le Functions usano la prenotazione', () => {
  it('interrogaClaude prenota in transazione prima del modello e corregge in transazione dopo', () => {
    const f = tratto('async function interrogaClaude(', '\n}\n')
    const prenota = f.indexOf('ai.prenota(')
    const modello = f.indexOf('messages.stream(')
    expect(prenota).toBeGreaterThan(0)
    expect(prenota).toBeLessThan(modello)
    expect(f.lastIndexOf('runTransaction', prenota)).toBeGreaterThan(-1)
    // La correzione è una transazione (chiudi), chiamata col costo vero dopo la risposta.
    const chiudi = f.indexOf('ai.chiudiPrenotazione(')
    expect(f.lastIndexOf('runTransaction', chiudi)).toBeGreaterThan(prenota)
    expect(f.indexOf('chiudi(costo', modello)).toBeGreaterThan(modello)
    expect(f).toContain('ai.rigaInterrotta(')
    // Il vecchio controllo fuori transazione non c'è più.
    expect(f).not.toContain('ai.puoChiedere(')
  })

  it('una chiamata fallita restituisce la prenotazione prima di rispondere 503', () => {
    const f = tratto('async function interrogaClaude(', '\n}\n')
    const errore = f.indexOf('} catch (e) {')
    expect(f.indexOf('restituisci(', errore)).toBeGreaterThan(errore)
    expect(f.indexOf('restituisci(', errore)).toBeLessThan(f.indexOf('http: 503', errore))
  })

  it('richiestaAI ha una concorrenza per istanza esplicita, il tema dal mockup istanze e concorrenza basse', () => {
    expect(tratto('exports.richiestaAI = ', 'async (req, res)')).toMatch(/maxInstances: 10, concurrency: 3/)
    expect(tratto('exports.temaDaMockup = ', 'async (req)')).toMatch(/maxInstances: 2, concurrency: 2/)
  })
})
