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

// Revisione del 13/11/2026 (B3): una voce di `prenotazioni` senza un `il`
// valido faceva lanciare rigaInterrotta (meseDi di una data non valida), e
// l'AI del locale restava bloccata per sempre: ogni richiesta ripartiva
// dalla stessa voce rotta.
describe('una prenotazione rotta non blocca il locale', () => {
  const rotte = () => ({
    ...pieno(),
    prenotazioni: { senzaOra: { stima: 100_000, tipo: 'fattura' }, oraFinta: { il: 'ieri', stima: 50_000 }, vuota: null, numero: { il: 12345 } },
  })

  it('si tratta come scaduta, col mese corrente, senza lanciare', () => {
    const p = ai.prenota(rotte(), { id: 'r1', stima: 100_000, tipo: 'descrizione', adesso: ADESSO })
    expect(p.ok).toBe(true)
    expect(p.scadute.map((x) => x.id).sort()).toEqual(['numero', 'oraFinta', 'senzaOra', 'vuota'])
    expect(Object.keys(p.patch.prenotazioni)).toEqual(['r1'])
    for (const x of p.scadute) {
      const riga = ai.rigaInterrotta(x, ADESSO)
      expect(riga).toMatchObject({ mese: MESE, esito: 'interrotta', prenotata_il: null })
      expect(Number.isFinite(riga.costo_microeuro)).toBe(true)
    }
    expect(ai.rigaInterrotta(p.scadute.find((x) => x.id === 'senzaOra'), ADESSO)).toMatchObject({ tipo: 'fattura', costo_microeuro: 100_000 })
  })

  it('anche un mese scritto male cede al mese corrente', () => {
    expect(ai.rigaInterrotta({ il: 'x', mese: 42, stima: 1 }, ADESSO).mese).toBe(MESE)
    expect(ai.rigaInterrotta({ il: ADESSO.toISOString(), mese: '2026-10' }, fra(1)).mese).toBe('2026-10')
  })

  it('una mappa delle prenotazioni che non è una mappa non conta niente', () => {
    expect(ai.prenota({ ...pieno(), prenotazioni: 'rotta' }, { id: 'r1', stima: 1, tipo: 'descrizione', adesso: ADESSO })).toMatchObject({ ok: true, scadute: [] })
  })

  it('la chiusura di una prenotazione con la stima rotta non porta il credito a NaN', () => {
    const c = ai.chiudiPrenotazione({ ...pieno(), prenotazioni: { r1: { il: ADESSO.toISOString(), mese: MESE } } }, { id: 'r1', costo: 12_000, adesso: ADESSO })
    expect(c.patch.credito_microeuro).toBe(10_000_000 - 12_000)
    expect(Number.isFinite(c.patch.speso_mese_microeuro)).toBe(true)
  })
})

// Revisione del 13/11/2026 (B1): il client del modello si creava dopo la
// prenotazione e fuori dal try, e un suo errore lasciava la stima appesa;
// un errore nei conti o nella chiusura dava un 500 muto. Qui la stessa
// orchestrazione di interrogaClaude, con Firestore e Anthropic finti.
describe('la richiesta col credito prenotato, da capo a fondo', () => {
  class APIError extends Error {}
  class RateLimitError extends APIError {}
  class InternalServerError extends APIError {}
  class APIConnectionError extends APIError {}
  const Anthropic = { APIError, RateLimitError, InternalServerError, APIConnectionError }
  const messaggio = ai.preparaMessaggio({ tipo: 'descrizione', nome: 'Gin' })
  const STIMA = ai.stimaMassimaMicroeuro(messaggio)
  const buona = () => ({
    model: AI.modello,
    stop_reason: 'end_turn',
    usage: { input_tokens: 200, output_tokens: 80 },
    content: [{ type: 'text', text: '{"descrizione":"Gin secco","da_verificare":[]}' }],
  })
  const muto = { warn: () => {}, error: () => {} }

  // Un cassetto in memoria che fa quello che fanno le due transazioni di
  // index.js: prenota e chiudiPrenotazione sulla stessa logica.
  function banco({ risposta = buona(), errore = null, creaRotto = false, prenotaRotta = false, chiudiRotta = false } = {}) {
    const stato = { cassetto: pieno(), chiamate: 0, prenotate: 0, chiusure: [] }
    const client = {
      beta: {
        messages: {
          stream: () => ({
            finalMessage: async () => {
              stato.chiamate++
              if (errore) throw errore
              return risposta
            },
          }),
        },
      },
    }
    const deps = {
      slug: 'bar-prova',
      messaggio,
      log: muto,
      crea: () => {
        if (creaRotto) throw new Error('configurazione mancante')
        return { Anthropic, client }
      },
      prenota: async (stima) => {
        stato.prenotate++
        if (prenotaRotta) throw new Error('transazione fallita')
        const esito = ai.prenota(stato.cassetto, { id: 'r1', stima, tipo: messaggio.tipo, adesso: ADESSO })
        if (esito.patch) stato.cassetto = { ...stato.cassetto, ...esito.patch }
        return esito
      },
      chiudi: async (costo, riga) => {
        stato.chiusure.push({ costo, riga })
        if (chiudiRotta) throw new Error('transazione fallita')
        const { trovata, patch } = ai.chiudiPrenotazione(stato.cassetto, { id: 'r1', costo, adesso: fra(5_000) })
        if (trovata) stato.cassetto = { ...stato.cassetto, ...patch }
        return stato.cassetto.credito_microeuro
      },
    }
    return { stato, deps }
  }

  it('una risposta buona si paga al costo vero, e la prenotazione si chiude', async () => {
    const { stato, deps } = banco()
    const costo = ai.costoMicroeuro(buona())
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: true, risultato: { descrizione: 'Gin secco' }, costo_eur: ai.inEuro(costo), credito_eur: ai.inEuro(10_000_000 - costo) })
    expect(stato.cassetto.prenotazioni).toEqual({})
    expect(stato.chiusure[0].riga).toMatchObject({ esito: 'ok', costo_microeuro: costo })
  })

  it('il client del modello si crea prima della prenotazione: se non si crea, niente prenotazione e 503', async () => {
    const { stato, deps } = banco({ creaRotto: true })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 503, codice: 'servizio', errore: 'Il servizio AI non è disponibile in questo momento.' })
    expect(stato.prenotate).toBe(0)
    expect(stato.cassetto.credito_microeuro).toBe(10_000_000)
  })

  it('una prenotazione che non si scrive dà 503 «riprova», e il modello non si chiama', async () => {
    const { stato, deps } = banco({ prenotaRotta: true })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 503, codice: 'servizio', errore: 'Il servizio AI è occupato: riprova tra poco.' })
    expect(stato.chiamate).toBe(0)
  })

  it('un rifiuto della prenotazione esce col suo codice, senza chiamare il modello', async () => {
    const { stato, deps } = banco()
    stato.cassetto = { ...stato.cassetto, credito_microeuro: 0 }
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 402, codice: 'credito', credito_eur: 0 })
    expect(stato.chiamate).toBe(0)
  })

  it('una chiamata fallita restituisce tutta la stima e risponde 503', async () => {
    const { stato, deps } = banco({ errore: new RateLimitError('troppe') })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 503, errore: 'Il servizio AI è occupato: riprova tra poco.' })
    expect(stato.chiusure).toEqual([{ costo: 0, riga: null }])
    expect(stato.cassetto.credito_microeuro).toBe(10_000_000)
  })

  it('una chiamata fallita la cui restituzione fallisce risponde comunque 503, non 500', async () => {
    const { deps } = banco({ errore: new Error('rete'), chiudiRotta: true })
    await expect(ai.interrogaConPrenotazione(deps)).resolves.toMatchObject({ ok: false, http: 503, errore: 'Il servizio AI non è disponibile in questo momento.' })
  })

  it('se il costo non si calcola si paga la stima, che è il caso peggiore riservato', async () => {
    const strana = {
      ...buona(),
      get usage() {
        throw new Error('usage illeggibile')
      },
    }
    const { stato, deps } = banco({ risposta: strana })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.chiusure[0].costo).toBe(STIMA)
    expect(r.costo_eur).toBe(ai.inEuro(STIMA))
    expect(stato.chiusure[0].riga).toMatchObject({ costo_microeuro: STIMA })
  })

  it('una risposta che non si legge è un 422 col suo costo, non un 500', async () => {
    const rotta = {
      ...buona(),
      get content() {
        throw new Error('rotto')
      },
    }
    const { deps } = banco({ risposta: rotta })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 422, codice: 'illeggibile' })
    expect(r.costo_eur).toBeGreaterThan(0)
  })

  it('se la chiusura fallisce dopo la risposta: il locale riceve il risultato, paga una volta sola la stima, e niente 500', async () => {
    const { stato, deps } = banco({ chiudiRotta: true })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: true, risultato: { descrizione: 'Gin secco' }, costo_eur: ai.inEuro(STIMA), credito_eur: ai.inEuro(10_000_000 - STIMA) })
    // Una sola chiusura tentata (nessun secondo addebito), e la prenotazione
    // resta: scadrà e si chiuderà alla stima, una volta.
    expect(stato.chiusure).toHaveLength(1)
    expect(Object.keys(stato.cassetto.prenotazioni)).toEqual(['r1'])
    const dopo = ai.prenota(stato.cassetto, { id: 'r2', stima: 1, tipo: 'descrizione', adesso: fra(ai.SCADENZA_PRENOTAZIONE_MS + 1) })
    expect(dopo.patch.credito_microeuro).toBe(10_000_000 - STIMA - 1)
    expect(dopo.scadute.map((x) => x.id)).toEqual(['r1'])
  })

  it('anche il 422 regge una chiusura fallita', async () => {
    const { deps } = banco({ risposta: { ...buona(), stop_reason: 'refusal' }, chiudiRotta: true })
    await expect(ai.interrogaConPrenotazione(deps)).resolves.toMatchObject({ ok: false, http: 422, codice: 'rifiuto', costo_eur: ai.inEuro(STIMA) })
  })
})

describe('le Functions usano la prenotazione', () => {
  it('interrogaClaude collega le due transazioni e il client all’orchestrazione di lib/ai.js', () => {
    const f = tratto('async function interrogaClaude(', '\n}\n')
    expect(f).toContain('ai.interrogaConPrenotazione(')
    expect(f).toContain('crea: claude')
    const prenota = f.indexOf('ai.prenota(')
    const chiudi = f.indexOf('ai.chiudiPrenotazione(')
    expect(prenota).toBeGreaterThan(0)
    expect(f.lastIndexOf('runTransaction', prenota)).toBeGreaterThan(-1)
    expect(f.lastIndexOf('runTransaction', chiudi)).toBeGreaterThan(prenota)
    expect(f).toContain('ai.rigaInterrotta(')
    // Il vecchio controllo fuori transazione non c'è più, e la chiamata al
    // modello sta in lib/ai.js, dentro i suoi try.
    expect(f).not.toContain('ai.puoChiedere(')
    expect(f).not.toContain('messages.stream(')
  })

  it('richiestaAI ha una concorrenza per istanza esplicita, il tema dal mockup istanze e concorrenza basse', () => {
    expect(tratto('exports.richiestaAI = ', 'async (req, res)')).toMatch(/maxInstances: 10, concurrency: 3/)
    expect(tratto('exports.temaDaMockup = ', 'async (req)')).toMatch(/maxInstances: 2, concurrency: 2/)
  })
})
