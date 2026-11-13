'use strict'

// IL COSTO MASSIMO SI MISURA PRIMA DI PRENOTARE: IL CREDITO NON VA MAI
// SOTTO ZERO (REQ-FLOTTA-093). Daniele, 13/11/2026, sullo sforamento del
// credito: «Non deve mai succedere»; e sui dubbi della prima stesura, lo
// stesso giorno: «per tutti i 10 i punti facciamo come dici».
//
// Prima della prenotazione la regia conta i token d'ingresso esatti con
// client.messages.countTokens dell'SDK Anthropic (gratuito, con un suo
// limite di richieste al minuto; «una stima, può differire di poco»). La
// stima mette da parte due tentativi completi, perché il ripiego
// `fallbacks: 'default'` può rifare la richiesta dopo un rifiuto a metà
// risposta, e il secondo tentativo riceve come contesto il testo già
// scritto:
//   I = ceil(contato × 1,05)
//   ingresso = I (primo) + I + max_tokens (secondo)
//   uscita   = 2 × max_tokens
// ogni voce al prezzo più alto del listino. Senza conteggio: la
// descrizione usa la stima per byte con la stessa forma, una richiesta con
// un file risponde 503 senza prenotare. Se il costo vero supera lo stesso
// la stima (un difetto) il credito si ferma a zero e la differenza va in
// `da_recuperare_microeuro`.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')
const listino = require('../functions/piani.json')

const AI = listino.ai
const ADESSO = new Date('2026-11-13T10:00:00Z')
const MESE = '2026-11'
const MODELLI = Object.keys(AI.prezzi_usd_per_milione)
const PREZZI = Object.values(AI.prezzi_usd_per_milione)

const messaggi = {
  descrizione: ai.preparaMessaggio({ tipo: 'descrizione', nome: 'Gin' }),
  // «%PDF-1.4» e l'intestazione di un PNG: bastano a passare i controlli.
  fattura: ai.preparaMessaggio({ tipo: 'fattura', file: 'JVBERi0xLjQK', media_type: 'application/pdf' }),
  tema: ai.preparaMessaggio({ tipo: 'tema', file: 'iVBORw0KGgo=', media_type: 'image/png', struttura: 'unica' }),
}

// Il margine e i tentativi decisi (13/11/2026), scritti qui come numeri e
// non letti da ai.js: se mancassero lì, i conti sotto non passerebbero per
// caso.
const MARGINE = 0.05
const TENTATIVI = 2
// Quanto ingresso può avere al massimo il primo tentativo, dato il conteggio.
const ingressoMassimo = (contati) => Math.ceil(contati * (1 + MARGINE))
// La stima attesa, da un ingresso di base (contato col margine, o la stima
// per byte): due tentativi completi, ogni voce al prezzo più alto.
function stimaAttesa(base, maxTokens) {
  const pin = Math.max(...PREZZI.map((p) => p.input))
  const pout = Math.max(...PREZZI.map((p) => p.output))
  const ingresso = base + (base + maxTokens)
  const uscita = TENTATIVI * maxTokens
  const usd = (ingresso * pin + uscita * pout) / 1_000_000
  return Math.ceil(usd * AI.cambio_eur_per_usd * AI.ricarico * 1_000_000)
}

describe('le costanti della misura', () => {
  it('il margine sul conteggio è il 5%, i tentativi messi da parte 2', () => {
    expect(ai.MARGINE_CONTEGGIO).toBe(MARGINE)
    expect(ai.TENTATIVI_MASSIMI).toBe(TENTATIVI)
  })
})

describe('la stima', () => {
  it('col conteggio: due tentativi completi, il secondo col testo già scritto come contesto, al prezzo più alto', () => {
    for (const m of Object.values(messaggi)) {
      expect(ai.stimaMassimaMicroeuro(m, { inputContati: 2_345 })).toBe(stimaAttesa(ingressoMassimo(2_345), m.max_tokens))
    }
  })

  it('senza conteggio: la stessa forma, con la stima per byte al posto del contato', () => {
    for (const m of Object.values(messaggi)) {
      expect(ai.stimaMassimaMicroeuro(m)).toBe(stimaAttesa(m.stimaInputToken, m.max_tokens))
      expect(ai.stimaMassimaMicroeuro(m, {})).toBe(stimaAttesa(m.stimaInputToken, m.max_tokens))
    }
  })

  it('un conteggio che non è un numero intero positivo non vale: resta la stima per byte', () => {
    const m = messaggi.descrizione
    for (const rotto of [NaN, -1, 0, 1.5, Infinity, '1000', null]) {
      expect(ai.stimaMassimaMicroeuro(m, { inputContati: rotto })).toBe(ai.stimaMassimaMicroeuro(m))
    }
  })

  it('si conta quello che parte: modello, istruzioni, messaggio e output_config, senza i parametri del ripiego', () => {
    for (const m of Object.values(messaggi)) {
      const parte = ai.parametriClaude(m, { modello: 'claude-sonnet-5-5' })
      expect(ai.parametriConteggio(m, { modello: 'claude-sonnet-5-5' })).toEqual({
        model: parte.model,
        system: parte.system,
        messages: parte.messages,
        output_config: parte.output_config,
      })
    }
  })
})

// L'INVARIANTE. Per ogni risposta che rispetta i limiti — al massimo due
// tentativi, ingresso del primo ≤ I, del secondo ≤ I + max_tokens, uscita
// di ciascuno ≤ max_tokens, con qualunque modello, anche uno che il
// listino non conosce — il costo vero non supera la stima. Quindi il
// credito, che alla prenotazione copriva la stima, dopo la chiusura è ≥ 0.
describe('il costo vero non supera mai la stima', () => {
  const sconosciuto = 'claude-che-non-ce-9'
  const coppie = [...MODELLI, sconosciuto].flatMap((a) => [...MODELLI, sconosciuto].map((b) => [a, b]))

  it('per ogni tipo, ogni conteggio, ogni coppia di modelli e ogni divisione dell’uscita', () => {
    let provate = 0
    for (const m of Object.values(messaggi)) {
      const T = m.max_tokens
      for (const contati of [1, 37, 1_500, 12_345, 250_000]) {
        const stima = ai.stimaMassimaMicroeuro(m, { inputContati: contati })
        const I = ingressoMassimo(contati)
        const divisioni = [
          [T, T],
          [T, 0],
          [0, T],
          [1, T],
          [Math.floor(T / 2), T],
        ]
        for (const [a, b] of coppie) {
          // Un tentativo solo, col modello chiesto.
          const una = { model: a, usage: { input_tokens: I, output_tokens: T } }
          expect(ai.costoMicroeuro(una, { modelloChiesto: a })).toBeLessThanOrEqual(stima)
          provate++
          for (const [u1, u2] of divisioni) {
            // Due tentativi: il primo rifiutato a metà, il ripiego che
            // riparte col testo già scritto nel suo ingresso.
            const due = {
              model: b,
              usage: {
                input_tokens: I + T,
                output_tokens: u2,
                iterations: [
                  { type: 'message', model: a, input_tokens: I, output_tokens: u1 },
                  { type: 'fallback_message', model: b, input_tokens: I + T, output_tokens: u2 },
                ],
              },
            }
            expect(ai.costoMicroeuro(due, { modelloChiesto: a })).toBeLessThanOrEqual(stima)
            // Lo stesso con l'ingresso letto in parte dalla cache, che costa meno.
            const cache = structuredClone(due)
            for (const t of cache.usage.iterations) {
              t.cache_read_input_tokens = Math.floor(t.input_tokens / 2)
              t.input_tokens -= t.cache_read_input_tokens
            }
            expect(ai.costoMicroeuro(cache, { modelloChiesto: a })).toBeLessThanOrEqual(stima)
            provate += 2
          }
        }
      }
    }
    expect(provate).toBeGreaterThan(1000)
  })
})

// LO SFORAMENTO, SE CAPITA LO STESSO (un difetto): il credito si ferma a
// zero, e quello che manca si segna da recuperare. La riga dei consumi
// tiene il costo vero (la scrive interrogaConPrenotazione col costo).
describe('la chiusura con un costo sopra la stima', () => {
  const conPrenotazione = (credito, stima, extra = {}) => ({
    attivo: true,
    credito_microeuro: credito,
    mese: MESE,
    speso_mese_microeuro: stima,
    tetto_mensile_microeuro: 20_000_000,
    prenotazioni: { r1: { il: ADESSO.toISOString(), stima, tipo: 'fattura', mese: MESE } },
    ...extra,
  })

  it('il credito si ferma a zero e la differenza va in da_recuperare_microeuro', () => {
    const { trovata, patch } = ai.chiudiPrenotazione(conPrenotazione(50, 100), { id: 'r1', costo: 400, adesso: ADESSO })
    expect(trovata).toBe(true)
    expect(patch.credito_microeuro).toBe(0)
    expect(patch.da_recuperare_microeuro).toBe(250)
    // Lo speso del mese porta il costo vero.
    expect(patch.speso_mese_microeuro).toBe(400)
  })

  it('si somma a quello che c’era già da recuperare', () => {
    const { patch } = ai.chiudiPrenotazione(conPrenotazione(50, 100, { da_recuperare_microeuro: 10 }), { id: 'r1', costo: 400, adesso: ADESSO })
    expect(patch.da_recuperare_microeuro).toBe(260)
  })

  it('un costo sopra la stima che il credito copre ancora non lascia niente da recuperare', () => {
    const { patch } = ai.chiudiPrenotazione(conPrenotazione(1_000, 100), { id: 'r1', costo: 400, adesso: ADESSO })
    expect(patch.credito_microeuro).toBe(700)
    expect(patch).not.toHaveProperty('da_recuperare_microeuro')
  })

  it('un costo dentro la stima non tocca da_recuperare_microeuro', () => {
    const { patch } = ai.chiudiPrenotazione(conPrenotazione(0, 100, { da_recuperare_microeuro: 10 }), { id: 'r1', costo: 80, adesso: ADESSO })
    expect(patch.credito_microeuro).toBe(20)
    expect(patch).not.toHaveProperty('da_recuperare_microeuro')
  })
})

describe('il conteggio prima della prenotazione', () => {
  class APIError extends Error {}
  const Anthropic = { APIError }
  const muto = { warn: () => {}, error: () => {} }

  const risposta = (usage) => ({
    model: 'claude-sonnet-5-5',
    stop_reason: 'end_turn',
    usage,
    content: [{ type: 'text', text: '{"descrizione":"Gin secco","da_verificare":[]}' }],
  })

  // Un cassetto in memoria con le stesse transazioni di index.js, e un
  // client finto che registra l'ordine delle cose.
  function banco({ messaggio = messaggi.descrizione, credito = 10_000_000, conta, usage = { input_tokens: 200, output_tokens: 80 }, contaDelClient, log = muto } = {}) {
    const stato = {
      ordine: [],
      cassetto: { attivo: true, credito_microeuro: credito, mese: MESE, speso_mese_microeuro: 0, tetto_mensile_microeuro: 1_000_000_000 },
      stime: [],
      chiamate: 0,
      contati: [],
      righe: [],
    }
    const client = {
      messages: {
        countTokens: async (p) => {
          stato.ordine.push('conta-client')
          stato.contati.push(p)
          if (!contaDelClient) throw new Error('conteggio non disponibile')
          return contaDelClient
        },
      },
      beta: {
        messages: {
          stream: () => ({
            finalMessage: async () => {
              stato.ordine.push('modello')
              stato.chiamate++
              return risposta(usage)
            },
          }),
        },
      },
    }
    const deps = {
      slug: 'bar-prova',
      messaggio,
      modello: 'claude-sonnet-5-5',
      log,
      crea: () => {
        stato.ordine.push('crea')
        return { Anthropic, client }
      },
      prenota: async (stima) => {
        stato.ordine.push('prenota')
        stato.stime.push(stima)
        const esito = ai.prenota(stato.cassetto, { id: 'r1', stima, tipo: messaggio.tipo, adesso: ADESSO })
        if (esito.patch) stato.cassetto = { ...stato.cassetto, ...esito.patch }
        return esito
      },
      chiudi: async (costo, riga) => {
        stato.ordine.push('chiudi')
        if (riga) stato.righe.push(riga)
        const { trovata, patch } = ai.chiudiPrenotazione(stato.cassetto, { id: 'r1', costo, adesso: ADESSO })
        if (trovata) stato.cassetto = { ...stato.cassetto, ...patch }
        return stato.cassetto.credito_microeuro
      },
    }
    if (conta !== undefined) {
      deps.conta = async (p) => {
        stato.ordine.push('conta')
        stato.contati.push(p)
        return conta(p)
      }
    }
    return { stato, deps }
  }

  it('si conta dopo aver creato il client e prima di prenotare, e la prenotazione usa il conteggio', async () => {
    const { stato, deps } = banco({ conta: async () => ({ input_tokens: 812 }) })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.ordine).toEqual(['crea', 'conta', 'prenota', 'modello', 'chiudi'])
    expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione, { inputContati: 812 })])
  })

  it('si contano gli stessi parametri che partono', async () => {
    for (const m of Object.values(messaggi)) {
      const { stato, deps } = banco({ messaggio: m, conta: async () => ({ input_tokens: 1000 }) })
      await ai.interrogaConPrenotazione(deps)
      expect(stato.contati[0]).toEqual(ai.parametriConteggio(m, { modello: 'claude-sonnet-5-5' }))
    }
  })

  it('senza un conteggio iniettato si usa client.messages.countTokens dell’SDK', async () => {
    const { stato, deps } = banco({ contaDelClient: { input_tokens: 640 } })
    await ai.interrogaConPrenotazione(deps)
    expect(stato.ordine.slice(0, 3)).toEqual(['crea', 'conta-client', 'prenota'])
    expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione, { inputContati: 640 })])
  })

  it('una descrizione senza conteggio (errore, limite raggiunto) usa la stima per byte, e parte', async () => {
    const { stato, deps } = banco({
      conta: async () => {
        throw new Error('429 rate_limit_error')
      },
    })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione)])
    expect(stato.chiamate).toBe(1)
  })

  it('una descrizione con un conteggio senza un numero valido usa la stima per byte', async () => {
    for (const strano of [{}, { input_tokens: -3 }, { input_tokens: 'mille' }, null]) {
      const { stato, deps } = banco({ conta: async () => strano })
      await ai.interrogaConPrenotazione(deps)
      expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione)])
    }
  })

  it('una richiesta con un file senza conteggio: 503 «riprova tra poco», niente prenotazione, niente modello', async () => {
    for (const m of [messaggi.fattura, messaggi.tema]) {
      for (const conta of [
        async () => {
          throw new Error('429 rate_limit_error')
        },
        async () => ({ input_tokens: 'mille' }),
      ]) {
        const { stato, deps } = banco({ messaggio: m, conta })
        const r = await ai.interrogaConPrenotazione(deps)
        expect(r).toEqual({ ok: false, http: 503, codice: 'servizio', errore: 'Il servizio AI è occupato: riprova tra poco.' })
        expect(stato.stime).toEqual([])
        expect(stato.chiamate).toBe(0)
        expect(stato.cassetto.credito_microeuro).toBe(10_000_000)
      }
    }
  })

  it('se il credito non copre la stima misurata: 402 credito, e il modello non si chiama', async () => {
    const stima = ai.stimaMassimaMicroeuro(messaggi.descrizione, { inputContati: 900 })
    const { stato, deps } = banco({ credito: stima - 1, conta: async () => ({ input_tokens: 900 }) })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r).toMatchObject({ ok: false, http: 402, codice: 'credito' })
    expect(stato.chiamate).toBe(0)
  })

  it('col credito pari alla stima e la risposta più cara che i limiti permettono, dopo la chiusura il credito è ≥ 0', async () => {
    // Un PDF piccolo ma scansionato: pochi byte, tanti token. La stima per
    // byte di prima non lo copriva.
    const contati = 60_000
    const m = messaggi.fattura
    const T = m.max_tokens
    const stima = ai.stimaMassimaMicroeuro(m, { inputContati: contati })
    const I = ingressoMassimo(contati)
    const [caro] = [...MODELLI].sort((x, y) => AI.prezzi_usd_per_milione[y].output - AI.prezzi_usd_per_milione[x].output)
    const usage = {
      input_tokens: I + T,
      output_tokens: T,
      iterations: [
        { type: 'message', model: caro, input_tokens: I, output_tokens: T },
        { type: 'fallback_message', model: caro, input_tokens: I + T, output_tokens: T },
      ],
    }
    const errori = []
    const { stato, deps } = banco({ messaggio: m, credito: stima, conta: async () => ({ input_tokens: contati }), usage, log: { warn: () => {}, error: (...a) => errori.push(a.join(' ')) } })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.cassetto.credito_microeuro).toBeGreaterThanOrEqual(0)
    expect(stato.cassetto.da_recuperare_microeuro ?? 0).toBe(0)
    expect(errori.filter((e) => e.includes('[ai] SFORAMENTO'))).toEqual([])
  })

  it('un costo vero sopra la stima: credito a zero, il resto da recuperare, la riga dei consumi col costo vero, e «[ai] SFORAMENTO» nei log', async () => {
    const errori = []
    const contati = 10
    const stima = ai.stimaMassimaMicroeuro(messaggi.descrizione, { inputContati: contati })
    const credito = stima + 1_000
    const usage = { input_tokens: 5_000_000, output_tokens: 4_000 }
    const costo = ai.costoMicroeuro(risposta(usage), { modelloChiesto: 'claude-sonnet-5-5' })
    expect(costo).toBeGreaterThan(credito)
    const { stato, deps } = banco({ credito, conta: async () => ({ input_tokens: contati }), usage, log: { warn: () => {}, error: (...a) => errori.push(a.join(' ')) } })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.cassetto.credito_microeuro).toBe(0)
    expect(stato.cassetto.da_recuperare_microeuro).toBe(costo - credito)
    expect(stato.righe[0].costo_microeuro).toBe(costo)
    const righe = errori.filter((e) => e.includes('[ai] SFORAMENTO'))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('bar-prova')
  })
})

describe('index.js e il contratto', () => {
  it('interrogaClaude scrive la patch della chiusura così com’è, compreso da_recuperare_microeuro', () => {
    const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
    const f = codice.slice(codice.indexOf('async function interrogaClaude('), codice.indexOf('exports.creaRicaricaAI'))
    expect(f).toContain('ai.chiudiPrenotazione(')
    expect(f).toContain('t.update(cassettoRef, patch)')
  })

  it('docs/handover.md §7 non dice più che il credito può scendere sotto zero, e dice del conteggio e del da recuperare', () => {
    const h = readFileSync('docs/handover.md', 'utf8').replace(/\s+/g, ' ')
    expect(h).not.toContain('Il credito può scendere di poco sotto zero')
    expect(h).toContain('countTokens')
    expect(h).toContain('da_recuperare_microeuro')
  })
})
