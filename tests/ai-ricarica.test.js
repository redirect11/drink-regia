'use strict'

// IL CREDITO DICE SE SI PUÒ RICARICARE E DOVE (REQ-FLOTTA-091). Richiesta
// di tana-drink del 13/11/2026: «nella risposta di tipo: 'credito' ci
// servirebbe sapere se il locale può comprare credito e dove […] Con
// ricaricabile: false l'app dirà di rivolgersi all'assistenza invece di
// mandare al sito.»

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const ai = require('../functions/lib/ai.js')

const ADESSO = new Date('2026-11-13T10:00:00Z')
const MESE = '2026-11'
const cassetto = { attivo: true, credito_microeuro: 5_000_000, mese: MESE, speso_mese_microeuro: 0, tetto_mensile_microeuro: 20_000_000 }
const aperto = { istanza: { stato: 'attiva' }, vendita: { pagamenti_online: true }, sitoChiuso: false, regiaUrl: 'https://regia.example.it' }

const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
const tratto = (da, a) => codice.slice(codice.indexOf(da), codice.indexOf(a, codice.indexOf(da) + 1))

describe('si può ricaricare, e dove', () => {
  it('coi pagamenti online, il sito aperto e l’indirizzo della regia: sì, alla sezione «Credito AI»', () => {
    expect(ai.ricaricaDelLocale(aperto)).toEqual({ ricaricabile: true, ricarica_url: 'https://regia.example.it/dashboard/credito-ai' })
  })

  it('dell’indirizzo della regia conta solo l’origine', () => {
    expect(ai.ricaricaDelLocale({ ...aperto, regiaUrl: 'https://regia.example.it/qualcosa/' }).ricarica_url).toBe('https://regia.example.it/dashboard/credito-ai')
  })

  it('coi pagamenti online spenti, il sito chiuso, un locale interno o senza indirizzo: no, e niente indirizzo', () => {
    const no = { ricaricabile: false, ricarica_url: null }
    expect(ai.ricaricaDelLocale({ ...aperto, vendita: { pagamenti_online: false } })).toEqual(no)
    expect(ai.ricaricaDelLocale({ ...aperto, vendita: null })).toEqual(no)
    expect(ai.ricaricaDelLocale({ ...aperto, sitoChiuso: true })).toEqual(no)
    expect(ai.ricaricaDelLocale({ ...aperto, istanza: { stato: 'attiva', interna: true } })).toEqual(no)
    expect(ai.ricaricaDelLocale({ ...aperto, regiaUrl: null })).toEqual(no)
    expect(ai.ricaricaDelLocale({ ...aperto, regiaUrl: 'ftp://regia.example.it' })).toEqual(no)
  })
})

describe('la risposta del credito porta i due campi', () => {
  it('nella risposta 200 ci sono ricaricabile e ricarica_url, accanto a quelli di prima', () => {
    const r = ai.rispostaCredito(cassetto, ADESSO, ai.ricaricaDelLocale(aperto))
    expect(r).toMatchObject({ ok: true, tipo: 'credito', credito_eur: 5, ricaricabile: true, ricarica_url: 'https://regia.example.it/dashboard/credito-ai' })
    expect(Object.keys(r).sort()).toEqual(['attivo', 'credito_eur', 'motivo', 'ok', 'ricaricabile', 'ricarica_url', 'speso_mese_eur', 'tetto_mensile_eur', 'tipo'])
  })

  it('anche col credito finito, che è quando serve', () => {
    const r = ai.rispostaCredito({ ...cassetto, credito_microeuro: 0 }, ADESSO, ai.ricaricaDelLocale({ ...aperto, sitoChiuso: true }))
    expect(r).toMatchObject({ ok: true, attivo: false, motivo: 'credito', ricaricabile: false, ricarica_url: null })
  })

  it('senza dire niente della ricarica non è ricaricabile', () => {
    expect(ai.rispostaCredito(cassetto, ADESSO)).toMatchObject({ ok: true, ricaricabile: false, ricarica_url: null })
  })

  it('le risposte 402 restano come sono', () => {
    const r = ai.rispostaCredito(null, ADESSO, ai.ricaricaDelLocale(aperto))
    expect(r).toEqual({ ok: false, http: 402, codice: 'senza-cassetto', errore: expect.any(String) })
    expect(ai.rispostaCredito({ ...cassetto, attivo: false }, ADESSO, ai.ricaricaDelLocale(aperto))).not.toHaveProperty('ricaricabile')
  })
})

describe('richiestaAI e il contratto', () => {
  it('il credito chiesto dall’app passa per ricaricaDelLocale, coi dati letti sul server', () => {
    const f = tratto("if (req.body?.tipo === 'credito')", 'let messaggio')
    expect(f).toContain('ai.ricaricaDelLocale(')
    expect(f).toContain('REGIA_URL')
    expect(f).toContain('sitoChiusoOra(')
  })

  it('docs/handover.md §7 dice i due campi e l’assistenza', () => {
    const h = readFileSync('docs/handover.md', 'utf8')
    expect(h).toContain('ricaricabile')
    expect(h).toContain('ricarica_url')
  })
})
