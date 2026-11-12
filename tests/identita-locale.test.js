'use strict'

// L'AI DEL LOCALE SENZA CHIAVE (REQ-FLOTTA-077, Daniele, 12/11/2026:
// «niente chiave»). Il locale si fa riconoscere col gettone di Google del
// suo progetto; la regia controlla firma e destinatario e risale al locale.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const id = require('../functions/lib/identita-locale.js')

describe('il gettone nell’intestazione', () => {
  it('un gettone di Google ha tre parti; la chiave vecchia no', () => {
    expect(id.tokenDaBearer('Bearer eyJhbGciOi.eyJpc3Mi.c2lnbmF0dXJl')).toBe('eyJhbGciOi.eyJpc3Mi.c2lnbmF0dXJl')
    expect(id.tokenDaBearer('Bearer bar-mario.segretolungosegretolungo')).toBeNull()
    expect(id.tokenDaBearer('eyJhbGciOi.eyJpc3Mi.c2lnbmF0dXJl')).toBeNull()
    expect(id.tokenDaBearer('')).toBeNull()
  })
  it('il destinatario è la richiestaAI della regia', () => {
    expect(id.audienceAI('drink-regia-test')).toBe('https://europe-west1-drink-regia-test.cloudfunctions.net/richiestaAI')
    expect(id.audienceAI(null)).toBeNull()
  })
})

describe('chi ha chiesto il gettone', () => {
  const base = { iss: 'https://accounts.google.com', email_verified: true }
  it('l’account predefinito del progetto: il numero del progetto', () => {
    expect(id.chiDalGettone({ ...base, email: '600871952552-compute@developer.gserviceaccount.com' })).toEqual({ numero_progetto: '600871952552' })
  })
  it('un account dedicato: il nome del progetto', () => {
    expect(id.chiDalGettone({ ...base, email: 'ai-locale@drinkpos-bar-mario.iam.gserviceaccount.com' })).toEqual({ progetto: 'drinkpos-bar-mario' })
  })
  it('un indirizzo qualunque, non verificato, o un emittente diverso: nessuno', () => {
    expect(id.chiDalGettone({ ...base, email: 'mario@gmail.com' })).toBeNull()
    expect(id.chiDalGettone({ ...base, email_verified: false, email: '600871952552-compute@developer.gserviceaccount.com' })).toBeNull()
    expect(id.chiDalGettone({ ...base, iss: 'https://altro.example', email: '600871952552-compute@developer.gserviceaccount.com' })).toBeNull()
    expect(id.chiDalGettone(null)).toBeNull()
  })
  it('chiede l’AI solo un locale attivo e non simulato', () => {
    expect(id.puoChiedere({ stato: 'attiva' })).toBe(true)
    expect(id.puoChiedere({ stato: 'attiva', simulata: true })).toBe(false)
    expect(id.puoChiedere({ stato: 'in corso' })).toBe(false)
    expect(id.puoChiedere(null)).toBe(false)
  })
})

describe('nella porta dell’AI', () => {
  const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
  const porta = codice.slice(codice.indexOf('exports.richiestaAI = onRequest('), codice.indexOf('const esito = await interrogaClaude(', codice.indexOf('exports.richiestaAI = onRequest(')))
  const trova = codice.slice(codice.indexOf('async function localeDalGettone('), codice.indexOf('exports.richiestaAI = onRequest('))
  it('il gettone prima, la chiave vecchia solo se non c’è un gettone', () => {
    expect(porta.indexOf('identita.tokenDaBearer(')).toBeGreaterThan(0)
    expect(porta.indexOf('identita.tokenDaBearer(')).toBeLessThan(porta.indexOf('ai.leggiBearer('))
    expect(porta).toContain("return res.status(401).json({ errore: 'Locale non riconosciuto.' })")
  })
  it('la firma e il destinatario li controlla Google; il locale è uno solo, e può chiedere', () => {
    expect(trova).toContain('verifyIdToken({ idToken: gettone, audience })')
    expect(trova).toContain('identita.audienceAI(PROGETTO_REGIA)')
    expect(trova).toContain("chi.numero_progetto ? ['numero_progetto', chi.numero_progetto] : ['progetto', chi.progetto]")
    expect(trova).toContain('.limit(2)')
    expect(trova).toContain('if (trovate.size !== 1) return null')
    expect(trova).toContain('identita.puoChiedere(')
  })
  it('google-auth-library è una dipendenza dichiarata delle Functions', () => {
    const pacchetto = JSON.parse(readFileSync('functions/package.json', 'utf8'))
    expect(pacchetto.dependencies['google-auth-library']).toMatch(/^\^10\./)
  })
  it('il contratto lo dice', () => {
    const handover = readFileSync('docs/handover.md', 'utf8')
    expect(handover).toContain('**Dal 12/11/2026 senza chiave** (REQ-FLOTTA-077')
    expect(handover).toContain('getIdTokenClient(url)')
  })
})
