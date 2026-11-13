'use strict'

// LE PICCOLE FALLE DELL'AUDIT DEL 09/11/2026 sulla vendita e sul sito:
// l'indirizzo di ritorno del Checkout (finding 25, REQ-FLOTTA-054) e le
// cose piccole del finding 28 (REQ-FLOTTA-057): le impostazioni leggibili
// solo dall'admin, lo script dell'admin senza un progetto predefinito, i
// link delle istanze solo in https.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { ritornoAmmesso } = require('../functions/lib/abbonamento.js')

// FINDING 25: `ritorno` doveva solo cominciare con http(s), e Stripe
// rimandava lì a pagamento finito. Ora solo un'origine della regia.
describe('l’indirizzo di ritorno del Checkout (REQ-FLOTTA-054)', () => {
  const nostri = ['drink-regia.web.app', 'drink-regia.firebaseapp.com', 'regiadrink.it']

  it('passa solo un’origine https fra i domini della regia, e se ne tiene solo l’origine', () => {
    expect(ritornoAmmesso('https://drink-regia.web.app', nostri)).toBe('https://drink-regia.web.app')
    expect(ritornoAmmesso('https://drink-regia.web.app/', nostri)).toBe('https://drink-regia.web.app')
    expect(ritornoAmmesso('https://regiadrink.it/dashboard?x=1#y', nostri)).toBe('https://regiadrink.it')
    expect(ritornoAmmesso('https://Drink-Regia.firebaseapp.com', nostri)).toBe('https://drink-regia.firebaseapp.com')
  })

  it('un dominio altrui, un sottodominio, http, uno schema strano o un valore vuoto: niente', () => {
    for (const r of [
      'https://altro.example',
      'https://drink-regia.web.app.evil.example',
      'https://evil.example/drink-regia.web.app',
      'https://evil.example?x=https://drink-regia.web.app',
      'https://utente@drink-regia.web.app@evil.example',
      'http://drink-regia.web.app',
      'javascript:alert(1)',
      'ftp://drink-regia.web.app',
      'drink-regia.web.app',
      '',
      null,
      undefined,
      42,
    ]) {
      expect(ritornoAmmesso(r, nostri), String(r)).toBeNull()
    }
    // Senza domini noti non passa niente.
    expect(ritornoAmmesso('https://drink-regia.web.app', [])).toBeNull()
  })

  it('fuori dalla produzione passa anche localhost in http, per provare in locale; in produzione no', () => {
    expect(ritornoAmmesso('http://localhost:5173', nostri, { produzione: false })).toBe('http://localhost:5173')
    expect(ritornoAmmesso('http://127.0.0.1:4173/', nostri, { produzione: false })).toBe('http://127.0.0.1:4173')
    expect(ritornoAmmesso('http://localhost:5173', nostri, { produzione: true })).toBeNull()
    expect(ritornoAmmesso('http://localhost:5173', nostri)).toBeNull()
    expect(ritornoAmmesso('http://localhost.evil.example', nostri, { produzione: false })).toBeNull()
  })

  it('le due callable col Checkout (creaCheckout, creaRicaricaAI) passano da ritornoPulito, che rifiuta con invalid-argument', () => {
    const index = readFileSync('functions/index.js', 'utf8')
    expect(index).toMatch(/function ritornoPulito\(ritorno\) \{\s*const origine = ritornoAmmesso\(ritorno, DOMINI_NOSTRI, \{ produzione: PROGETTO_REGIA === 'drink-regia' \}\)\s*if \(!origine\) throw new HttpsError\('invalid-argument'/)
    for (const fn of ['creaCheckout', 'creaRicaricaAI']) {
      const da = index.indexOf(`exports.${fn} =`)
      const corpo = index.slice(da, index.indexOf('\n})', da))
      expect(corpo, fn).toContain('const ritorno = ritornoPulito(req.data?.ritorno)')
      expect(corpo, fn).not.toMatch(/\^https\?:/)
    }
    // Il vecchio controllo non c'è più da nessuna parte.
    expect(index).not.toMatch(/\/\^https\?:\\\/\\\/\/\.test\(ritorno\)/)
  })
})

// FINDING 28, le cose piccole (REQ-FLOTTA-057).
describe('le cose piccole del finding 28 (REQ-FLOTTA-057)', () => {
  it('le impostazioni della regia le legge solo l’admin: il sito dei clienti non le legge', () => {
    const regole = readFileSync('firestore.rules', 'utf8')
    const blocco = regole.slice(regole.indexOf('match /impostazioni/{doc}')).replace(/\/\/.*$/gm, '')
    expect(blocco).toContain('allow read: if admin();')
    expect(blocco).not.toContain('allow read: if autenticato();')
    // Chi legge impostazioni/* nel sito: solo il backoffice, via db.js.
    const db = readFileSync('src/lib/db.js', 'utf8')
    const lettori = [...db.matchAll(/export function (\w+)\(cb\) \{\s*serve\(\)\s*return onSnapshot\(doc\(db, 'impostazioni'/g)].map((m) => m[1])
    expect(lettori.sort()).toEqual(['osservaImpostazioniRegia', 'osservaRegoleAggiornamenti'])
    const { readdirSync } = require('node:fs')
    for (const f of readdirSync('src/pages')) {
      const pagina = readFileSync(`src/pages/${f}`, 'utf8')
      for (const l of lettori) if (pagina.includes(l)) expect(f, l).toBe('Backoffice.jsx')
    }
  })

  it('admin-regia.mjs vuole --project ogni volta: nessun predefinito sulla produzione', () => {
    const script = readFileSync('scripts/admin-regia.mjs', 'utf8')
    expect(script).not.toMatch(/arg\('project'\) \|\| 'drink-regia'/)
    expect(script).toContain("const PROGETTO = arg('project')")
    expect(script).toMatch(/if \(!EMAIL \|\| !PROGETTO \|\| PROGETTO\.startsWith\('--'\)\) \{/)
    expect(script).toContain('--project <id del progetto>')
  })

  it('hrefSicuro: solo un https diventa un link', async () => {
    const { hrefSicuro } = await import('../src/lib/istanze.js')
    expect(hrefSicuro('https://drinkpos-bar.web.app')).toBe('https://drinkpos-bar.web.app')
    expect(hrefSicuro('https://bar.regiadrink.it/menu?x=1')).toBe('https://bar.regiadrink.it/menu?x=1')
    for (const u of ['http://drinkpos-bar.web.app', 'javascript:alert(1)', 'data:text/html,ciao', 'ftp://x', 'drinkpos-bar.web.app', '', null, undefined, 42, {}]) {
      expect(hrefSicuro(u), String(u)).toBeNull()
    }
    // Dashboard e backoffice ci passano.
    expect(readFileSync('src/pages/Dashboard.jsx', 'utf8')).toContain('const indirizzoApp = hrefSicuro(istanza?.url) || urlDi(cliente.slug)')
    expect(readFileSync('src/pages/Backoffice.jsx', 'utf8')).toContain('{hrefSicuro(istanza?.url) && (')
  })
})
