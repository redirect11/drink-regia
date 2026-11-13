'use strict'

// IL MODELLO AI SI SCEGLIE PER TIPO DI RICHIESTA DAL BACKOFFICE
// (REQ-FLOTTA-092). Daniele, 13/11/2026, su Sonnet: «Per tutto». Fino a
// qui la regia usava un solo modello (piani.json → ai.modello) per ogni
// richiesta; ora ogni tipo ha il suo, lo sceglie l'admin e si salva in
// impostazioni/regia.ai_modelli. Si sceglie solo fra i modelli che hanno un
// prezzo nel listino, perché il costo di una richiesta si calcola da lì.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')
const listino = require('../functions/piani.json')

const SONNET = 'claude-sonnet-5-5'
const OPUS = 'claude-opus-5-5'
const ADESSO = new Date('2026-11-13T10:00:00Z')
const MESE = '2026-11'

const testo = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
const tratto = (codice, da, a) => codice.slice(codice.indexOf(da), codice.indexOf(a, codice.indexOf(da) + 1))
const indice = testo('functions/index.js')

describe('il listino conosce Sonnet', () => {
  // Prezzi della documentazione Anthropic del 03/11/2026, in dollari per
  // milione di token: da riverificare sulla pagina dei prezzi prima del
  // rilascio.
  it('claude-sonnet-5-5 ha il suo prezzo: input 2, output 10, lettura della cache 0,10', () => {
    expect(listino.ai.prezzi_usd_per_milione[SONNET]).toEqual({ input: 2, output: 10, cache_lettura: 0.1 })
  })

  it('i modelli che si possono scegliere sono quelli del listino, e solo quelli', () => {
    expect(ai.modelliDelListino()).toEqual(Object.keys(listino.ai.prezzi_usd_per_milione))
    expect(ai.modelliDelListino()).toContain(SONNET)
  })

  it('il costo di una risposta di Sonnet si fa ai prezzi di Sonnet', () => {
    const r = { model: SONNET, usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 } }
    const usd = 2 + 10
    expect(ai.costoMicroeuro(r)).toBe(Math.ceil(usd * listino.ai.cambio_eur_per_usd * listino.ai.ricarico * 1_000_000))
  })
})

describe('un modello per ogni tipo di richiesta', () => {
  it('i tipi sono descrizione, fattura, tema e chat', () => {
    expect(ai.TIPI_MODELLO).toEqual(['descrizione', 'fattura', 'tema', 'chat'])
  })

  it('senza una scelta salvata vale Sonnet per tutti i tipi', () => {
    for (const tipo of ai.TIPI_MODELLO) {
      expect(ai.modelloPer(tipo, {})).toBe(SONNET)
      expect(ai.modelloPer(tipo, null)).toBe(SONNET)
      expect(ai.modelloPer(tipo, undefined)).toBe(SONNET)
      expect(ai.modelloPer(tipo, { ai_modelli: {} })).toBe(SONNET)
    }
  })

  it('la scelta salvata vale per il suo tipo e per nessun altro', () => {
    const impostazioni = { ai_modelli: { fattura: OPUS } }
    expect(ai.modelloPer('fattura', impostazioni)).toBe(OPUS)
    expect(ai.modelloPer('descrizione', impostazioni)).toBe(SONNET)
    expect(ai.modelloPer('tema', impostazioni)).toBe(SONNET)
  })

  // Le regole lasciano all'admin scrivere impostazioni/regia anche senza
  // la Function: un valore scritto a mano, o rimasto dopo che un modello è
  // uscito dal listino, non deve far partire una richiesta che non si sa
  // prezzare.
  it('un modello fuori dal listino, o un valore rotto, non passa: vale Sonnet', () => {
    expect(ai.modelloPer('fattura', { ai_modelli: { fattura: 'claude-inventato-9' } })).toBe(SONNET)
    expect(ai.modelloPer('fattura', { ai_modelli: { fattura: 42 } })).toBe(SONNET)
    expect(ai.modelloPer('fattura', { ai_modelli: { fattura: null } })).toBe(SONNET)
    expect(ai.modelloPer('fattura', { ai_modelli: OPUS })).toBe(SONNET)
    expect(ai.modelloPer('fattura', { ai_modelli: [OPUS] })).toBe(SONNET)
  })
})

describe('la scelta che arriva dal backoffice', () => {
  it('accetta un tipo conosciuto con un modello del listino, e rende solo quello che è arrivato', () => {
    expect(ai.validaModelliAI({ descrizione: OPUS })).toEqual({ descrizione: OPUS })
    expect(ai.validaModelliAI({ fattura: SONNET, chat: OPUS })).toEqual({ fattura: SONNET, chat: OPUS })
  })

  it('rifiuta un modello che non ha un prezzo nel listino', () => {
    expect(() => ai.validaModelliAI({ descrizione: 'claude-inventato-9' })).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI({ descrizione: '' })).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI({ descrizione: 7 })).toThrow(ai.RichiestaNonValida)
  })

  it('rifiuta un tipo di richiesta che non c’è, e una scelta vuota o che non è una mappa', () => {
    expect(() => ai.validaModelliAI({ traduzione: SONNET })).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI({})).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI(null)).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI([SONNET])).toThrow(ai.RichiestaNonValida)
    expect(() => ai.validaModelliAI(SONNET)).toThrow(ai.RichiestaNonValida)
  })
})

// La richiesta usa il modello scelto, e si paga a quel modello: con i
// fallback i tentativi senza `model` in usage.iterations sono del modello
// chiesto (costoMicroeuro, modelloChiesto).
describe('la richiesta usa il modello scelto', () => {
  const messaggio = ai.preparaMessaggio({ tipo: 'descrizione', nome: 'Gin' })
  const muto = { warn: () => {}, error: () => {} }

  function banco({ modello, risposta } = {}) {
    const stato = {
      parametri: null,
      cassetto: { attivo: true, credito_microeuro: 10_000_000, mese: MESE, speso_mese_microeuro: 0, tetto_mensile_microeuro: 20_000_000 },
      costi: [],
    }
    const client = {
      beta: {
        messages: {
          stream: (parametri) => {
            stato.parametri = parametri
            return { finalMessage: async () => risposta(parametri) }
          },
        },
      },
    }
    const deps = {
      slug: 'bar-prova',
      messaggio,
      log: muto,
      crea: () => ({ Anthropic: {}, client }),
      // Il conteggio dei token (REQ-FLOTTA-093) qui non conta: fallisce, e
      // si torna alla stima per byte.
      conta: async () => {
        throw new Error('non qui')
      },
      prenota: async (stima) => {
        const esito = ai.prenota(stato.cassetto, { id: 'r1', stima, tipo: messaggio.tipo, adesso: ADESSO })
        if (esito.patch) stato.cassetto = { ...stato.cassetto, ...esito.patch }
        return esito
      },
      chiudi: async (costo) => {
        stato.costi.push(costo)
        const { trovata, patch } = ai.chiudiPrenotazione(stato.cassetto, { id: 'r1', costo, adesso: ADESSO })
        if (trovata) stato.cassetto = { ...stato.cassetto, ...patch }
        return stato.cassetto.credito_microeuro
      },
    }
    if (modello !== undefined) deps.modello = modello
    return { stato, deps }
  }

  const risposta = (parametri) => ({
    model: parametri.model,
    stop_reason: 'end_turn',
    // Un tentativo senza `model`: si paga al modello chiesto.
    usage: { input_tokens: 300, output_tokens: 120, iterations: [{ type: 'message', input_tokens: 300, output_tokens: 120 }] },
    content: [{ type: 'text', text: '{"descrizione":"Gin secco","da_verificare":[]}' }],
  })

  it('chiede al modello indicato, e lo paga ai suoi prezzi', async () => {
    const { stato, deps } = banco({ modello: OPUS, risposta })
    const r = await ai.interrogaConPrenotazione(deps)
    expect(r.ok).toBe(true)
    expect(stato.parametri.model).toBe(OPUS)
    expect(stato.parametri.fallbacks).toBe('default')
    expect(stato.costi[0]).toBe(ai.costoMicroeuro(risposta({ model: OPUS }), { modelloChiesto: OPUS }))
    // Sonnet costerebbe meno: il test si accorge se il costo usa il modello sbagliato.
    expect(stato.costi[0]).toBeGreaterThan(ai.costoMicroeuro(risposta({ model: SONNET }), { modelloChiesto: SONNET }))
  })

  it('senza un modello indicato chiede a Sonnet', async () => {
    const { stato, deps } = banco({ risposta })
    await ai.interrogaConPrenotazione(deps)
    expect(stato.parametri.model).toBe(SONNET)
  })

  it('parametriClaude mette il modello che riceve', () => {
    expect(ai.parametriClaude(messaggio, { modello: SONNET }).model).toBe(SONNET)
  })
})

describe('index.js e il sito', () => {
  it('interrogaClaude rilegge impostazioni/regia a ogni richiesta e passa il modello del tipo', () => {
    const f = tratto(indice, 'async function interrogaClaude(', 'exports.creaRicaricaAI')
    expect(f).toContain("db.doc('impostazioni/regia')")
    expect(f).toContain('ai.modelloPer(messaggio.tipo')
  })

  it('la Function del backoffice accetta solo l’admin e solo modelli del listino, e salva in ai_modelli', () => {
    expect(indice).toContain('exports.gestisciModelliAI = onCall(')
    const f = tratto(indice, 'exports.gestisciModelliAI = onCall(', '\n})\n')
    expect(f).toContain("req.auth?.token?.admin !== true) throw new HttpsError('permission-denied'")
    expect(f).toContain('ai.validaModelliAI(')
    expect(f).toContain("db.doc('impostazioni/regia')")
    expect(f).toContain('ai_modelli')
    // Il controllo dell'admin viene prima di tutto il resto.
    expect(f.indexOf('admin !== true')).toBeLessThan(f.indexOf('ai.validaModelliAI('))
  })

  it('il sito salva la scelta solo passando dalla Function', () => {
    const db = testo('src/lib/db.js')
    expect(db).toContain('export async function impostaModelliAI(')
    const f = tratto(db, 'export async function impostaModelliAI(', '\n}\n')
    expect(f).toContain("'gestisciModelliAI'")
    expect(f).not.toContain('setDoc(')
  })
})
