'use strict'

// IL COSTO MASSIMO SI MISURA PRIMA DI PRENOTARE: IL CREDITO NON VA MAI
// SOTTO ZERO (REQ-FLOTTA-093). Daniele, 13/11/2026, sullo sforamento del
// credito: «Non deve mai succedere». Fino a qui la stima dell'ingresso di
// un PDF o di una foto andava per byte, e un PDF scansionato poteva costare
// più della stima (REQ-FLOTTA-088, punto 9). Ora, prima della prenotazione,
// la regia conta i token d'ingresso esatti con client.messages.countTokens
// dell'SDK Anthropic (gratuito, con un suo limite di richieste al minuto;
// «una stima, può differire di poco»), e la stima diventa:
//   ingresso contato × (1 + 5%) × 2 tentativi + max_tokens d'uscita,
// al prezzo più alto del listino. Due tentativi perché il ripiego
// `fallbacks: 'default'` può rifare la richiesta con un altro modello e far
// pagare l'ingresso due volte. Se il conteggio fallisce si torna alla stima
// per byte di prima.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')
const listino = require('../functions/piani.json')

const ADESSO = new Date('2026-11-13T10:00:00Z')
const MESE = '2026-11'
const MODELLI = Object.keys(listino.ai.prezzi_usd_per_milione)

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
// Quanto ingresso può avere al massimo ciascun tentativo, dato il conteggio.
const ingressoMassimo = (contati) => Math.ceil(contati * (1 + MARGINE))

describe('le costanti della misura', () => {
  it('il margine sul conteggio è il 5%, i tentativi pagati al massimo 2', () => {
    expect(ai.MARGINE_CONTEGGIO).toBe(MARGINE)
    expect(ai.TENTATIVI_MASSIMI).toBe(TENTATIVI)
  })
})

describe('la stima col conteggio', () => {
  it('è ingresso contato × (1 + margine) × tentativi più max_tokens, al prezzo più alto del listino', () => {
    for (const m of Object.values(messaggi)) {
      const contati = 2_345
      const usage = { input_tokens: ingressoMassimo(contati) * TENTATIVI, output_tokens: m.max_tokens }
      const attesa = Math.max(...MODELLI.map((modello) => ai.costoMicroeuro({ model: modello, usage }, { modelloChiesto: modello })))
      expect(ai.stimaMassimaMicroeuro(m, { inputContati: contati })).toBe(attesa)
    }
  })

  it('senza conteggio resta la stima per byte di oggi', () => {
    for (const m of Object.values(messaggi)) {
      const usage = { input_tokens: m.stimaInputToken, output_tokens: m.max_tokens }
      const attesa = Math.max(...MODELLI.map((modello) => ai.costoMicroeuro({ model: modello, usage }, { modelloChiesto: modello })))
      expect(ai.stimaMassimaMicroeuro(m)).toBe(attesa)
      expect(ai.stimaMassimaMicroeuro(m, {})).toBe(attesa)
    }
  })

  it('un conteggio che non è un numero intero positivo non vale: si torna alla stima per byte', () => {
    const m = messaggi.fattura
    for (const rotto of [NaN, -1, Infinity, '1000', null]) {
      expect(ai.stimaMassimaMicroeuro(m, { inputContati: rotto })).toBe(ai.stimaMassimaMicroeuro(m))
    }
  })
})

// L'INVARIANTE. Per ogni risposta che rispetta i limiti — ingresso di ogni
// tentativo ≤ contato × (1 + margine), uscita di tutti i tentativi insieme
// ≤ max_tokens, al massimo 2 tentativi, con qualunque modello, anche uno
// che il listino non conosce — il costo vero non supera la stima. Quindi il
// credito, che alla prenotazione copriva la stima, dopo la chiusura è ≥ 0.
describe('il costo vero non supera mai la stima', () => {
  const sconosciuto = 'claude-che-non-ce-9'
  const coppie = [...MODELLI, sconosciuto].flatMap((a) => [...MODELLI, sconosciuto].map((b) => [a, b]))

  it('per ogni tipo, ogni conteggio, ogni coppia di modelli e ogni divisione dell’uscita', () => {
    let provate = 0
    for (const m of Object.values(messaggi)) {
      for (const contati of [1, 37, 1_500, 12_345, 250_000]) {
        const stima = ai.stimaMassimaMicroeuro(m, { inputContati: contati })
        const ingresso = ingressoMassimo(contati)
        const divisioni = [
          [m.max_tokens, 0],
          [0, m.max_tokens],
          [Math.floor(m.max_tokens / 2), Math.ceil(m.max_tokens / 2)],
          [1, m.max_tokens - 1],
        ]
        for (const [a, b] of coppie) {
          // Un tentativo solo, col modello chiesto.
          const una = { model: a, usage: { input_tokens: ingresso, output_tokens: m.max_tokens } }
          expect(ai.costoMicroeuro(una, { modelloChiesto: a })).toBeLessThanOrEqual(stima)
          provate++
          for (const [u1, u2] of divisioni) {
            // Due tentativi: il primo rifiutato, il ripiego che risponde.
            const due = {
              model: b,
              usage: {
                input_tokens: ingresso,
                output_tokens: u2,
                iterations: [
                  { type: 'message', model: a, input_tokens: ingresso, output_tokens: u1 },
                  { type: 'fallback_message', model: b, input_tokens: ingresso, output_tokens: u2 },
                ],
              },
            }
            expect(ai.costoMicroeuro(due, { modelloChiesto: a })).toBeLessThanOrEqual(stima)
            // Lo stesso con l'ingresso letto in parte dalla cache, che costa meno.
            const cache = structuredClone(due)
            for (const t of cache.usage.iterations) {
              t.cache_read_input_tokens = Math.floor(ingresso / 2)
              t.input_tokens = ingresso - t.cache_read_input_tokens
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
      chiudi: async (costo) => {
        stato.ordine.push('chiudi')
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

  it('si contano lo stesso modello, le stesse istruzioni e lo stesso messaggio che partono', async () => {
    for (const m of Object.values(messaggi)) {
      const { stato, deps } = banco({ messaggio: m, conta: async () => ({ input_tokens: 1000 }) })
      await ai.interrogaConPrenotazione(deps)
      const parte = ai.parametriClaude(m, { modello: 'claude-sonnet-5-5' })
      expect(stato.contati[0]).toMatchObject({ model: parte.model, system: parte.system, messages: parte.messages })
    }
  })

  it('senza un conteggio iniettato si usa client.messages.countTokens dell’SDK', async () => {
    const { stato, deps } = banco({ contaDelClient: { input_tokens: 640 } })
    await ai.interrogaConPrenotazione(deps)
    expect(stato.ordine.slice(0, 3)).toEqual(['crea', 'conta-client', 'prenota'])
    expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione, { inputContati: 640 })])
  })

  it('se il conteggio fallisce (errore, limite raggiunto) si torna alla stima per byte, e la richiesta parte', async () => {
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

  it('un conteggio senza un numero valido vale come fallito', async () => {
    for (const strano of [{}, { input_tokens: -3 }, { input_tokens: 'mille' }, null]) {
      const { stato, deps } = banco({ conta: async () => strano })
      await ai.interrogaConPrenotazione(deps)
      expect(stato.stime).toEqual([ai.stimaMassimaMicroeuro(messaggi.descrizione)])
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
    // byte di oggi non lo coprirebbe.
    const contati = 60_000
    const m = messaggi.fattura
    const stima = ai.stimaMassimaMicroeuro(m, { inputContati: contati })
    const ingresso = ingressoMassimo(contati)
    const [caro] = [...MODELLI].sort((x, y) => listino.ai.prezzi_usd_per_milione[y].output - listino.ai.prezzi_usd_per_milione[x].output)
    const usage = {
      input_tokens: ingresso,
      output_tokens: m.max_tokens,
      iterations: [
        { type: 'message', model: caro, input_tokens: ingresso, output_tokens: 0 },
        { type: 'fallback_message', model: caro, input_tokens: ingresso, output_tokens: m.max_tokens },
      ],
    }
    const errori = []
    const { stato, deps } = banco({ messaggio: m, credito: stima, conta: async () => ({ input_tokens: contati }), usage, log: { warn: () => {}, error: (...a) => errori.push(a.join(' ')) } })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.cassetto.credito_microeuro).toBeGreaterThanOrEqual(0)
    expect(errori.filter((e) => e.includes('[ai] SFORAMENTO'))).toEqual([])
  })

  // Se capita lo stesso è un difetto: si registra con una riga cercabile.
  // Cosa fare del credito in quel caso lo decide Daniele (la voce del
  // registro lo dice): qui non si prova.
  it('un costo vero sopra la stima lascia nei log una riga «[ai] SFORAMENTO» col locale', async () => {
    const errori = []
    const { deps } = banco({
      conta: async () => ({ input_tokens: 10 }),
      usage: { input_tokens: 500_000, output_tokens: 4_000 },
      log: { warn: () => {}, error: (...a) => errori.push(a.join(' ')) },
    })
    await ai.interrogaConPrenotazione(deps)
    const righe = errori.filter((e) => e.includes('[ai] SFORAMENTO'))
    expect(righe).toHaveLength(1)
    expect(righe[0]).toContain('bar-prova')
  })
})

describe('il contratto', () => {
  it('docs/handover.md §7 non dice più che il credito può scendere sotto zero', () => {
    const h = readFileSync('docs/handover.md', 'utf8').replace(/\s+/g, ' ')
    expect(h).not.toContain('Il credito può scendere di poco sotto zero')
    expect(h).toContain('countTokens')
  })
})
