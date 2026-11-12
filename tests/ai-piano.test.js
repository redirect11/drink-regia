'use strict'

// IL FREE NON HA L'AI (REQ-FLOTTA-087). Daniele, 13/11/2026: «I free non
// hanno l'ai»; e sull'audit di sicurezza dello stesso giorno: «questi
// andrebbero sistemati». Fino a qui il blocco stava solo nell'interfaccia
// dell'app: un locale tornato al Free conservava la sua Function AI e,
// mandando la richiesta a mano, usava il credito (anche regalato).

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')
const { licenzaProtetta, patchLicenzaPiano } = require('../functions/lib/licenza.js')
const listino = require('../functions/piani.json')

const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
const tratto = (da, a) => codice.slice(codice.indexOf(da), codice.indexOf(a, codice.indexOf(da) + 1))

describe('il piano decide se il locale ha l’AI', () => {
  const istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova' }

  it('la licenza del Free porta ai: false fra i limiti, come comande e stampa', () => {
    expect(listino.piani.free.limiti.ai).toBe(false)
    expect(patchLicenzaPiano({ piano: 'free' })['licenza.limiti'].ai).toBe(false)
    expect(licenzaProtetta(istanza, { piano: 'free' }, { slug: 'bar-prova' }).limiti.ai).toBe(false)
    // I piani a pagamento non hanno limiti: l'AI c'è.
    expect(patchLicenzaPiano({ piano: 'base' })['licenza.limiti']).toBeNull()
  })

  it('un piano a pagamento ha l’AI; il Free no', () => {
    expect(ai.aiConcessa(istanza, { piano: 'base' })).toBe(true)
    expect(ai.aiConcessa(istanza, { piano: 'completo' })).toBe(true)
    expect(ai.aiConcessa(istanza, { piano: 'free' })).toBe(false)
  })

  it('tornato al Free perché non paga: niente AI, anche se il piano scelto è ancora a pagamento', () => {
    const ripiegata = { ...istanza, ripiego_free: { dal: '2026-11-01T00:00:00Z', piano_prima: 'base' }, licenza_piano: 'free' }
    expect(ai.aiConcessa(ripiegata, { piano: 'base' })).toBe(false)
  })

  it('se istanza e cliente non dicono lo stesso piano vale il più restrittivo', () => {
    // La copia del piano sull'istanza dice Free, il cliente dice Base.
    expect(ai.aiConcessa({ ...istanza, licenza_piano: 'free' }, { piano: 'base' })).toBe(false)
    // Il cliente è passato al Free, la copia sull'istanza non ancora.
    expect(ai.aiConcessa({ ...istanza, licenza_piano: 'base' }, { piano: 'free' })).toBe(false)
  })

  it('senza cliente la licenza non si calcola, e l’AI non si concede', () => {
    expect(ai.aiConcessa(istanza, null)).toBe(false)
  })

  it('il rifiuto è sobrio e ha il suo codice', () => {
    expect(ai.SENZA_AI_NEL_PIANO).toBe('Il piano Free non comprende le funzioni AI.')
  })
})

describe('le Functions rifiutano un locale Free', () => {
  it('richiestaAI risponde 402 piano dopo il gettone e prima di ogni tipo, «credito» compreso', () => {
    const porta = tratto('exports.richiestaAI = ', 'async function interrogaClaude(')
    const gettone = porta.indexOf('res.status(401)')
    const piano = porta.indexOf("codice: 'piano'")
    expect(gettone).toBeGreaterThan(0)
    expect(piano).toBeGreaterThan(gettone)
    expect(piano).toBeLessThan(porta.indexOf("req.body?.tipo === 'credito'"))
    expect(porta).toMatch(/status\(402\)\.json\(\{ codice: 'piano', errore: ai\.SENZA_AI_NEL_PIANO \}\)/)
  })

  it('il tema dal mockup controlla il piano prima del modello', () => {
    const tema = tratto('exports.temaDaMockup = ', 'exports.licenzaSegueITemiSuMisura')
    expect(tema).toContain('aiDelLocale(')
    expect(tema.indexOf('aiDelLocale(')).toBeLessThan(tema.indexOf('interrogaClaude('))
  })

  it('un Free non compra credito, e l’admin non gli ricarica né gli regala credito', () => {
    const ricarica = tratto('exports.creaRicaricaAI = ', 'exports.gestisciCassettoAI')
    expect(ricarica).toContain('aiDelLocale(')
    expect(ricarica.indexOf('aiDelLocale(')).toBeLessThan(ricarica.indexOf('checkout.sessions.create'))
    const cassetto = tratto('exports.gestisciCassettoAI = ', 'exports.impostaAggiornamentiEsistente')
    expect(cassetto).toContain('aiDelLocale(')
    expect(cassetto.indexOf('aiDelLocale(')).toBeLessThan(cassetto.indexOf("azione === 'ricarica'"))
  })

  it('il controllo è uno solo, ai.aiConcessa, su istanza e cliente', () => {
    const helper = tratto('async function aiDelLocale(', '\n}\n')
    expect(helper).toContain('ai.aiConcessa(')
    expect(helper).toContain('istanze/')
    expect(helper).toContain('clienteDi(')
  })
})
