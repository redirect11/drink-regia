'use strict'

// IL PASSAGGIO FRA LA REGIA E L'APP DEL LOCALE (REQ-FLOTTA-030). L'utente,
// 02/11/2026: un single sign-on fra la regia e l'app, «sicuro e robusto»,
// per tutte le istanze. Il titolare passa dall'una all'altra con un codice
// monouso; e a ogni deploy la regia passa all'app i suoi dati.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const p = require('../functions/lib/passaggio.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const cliente = {
  uid: 'regia-1',
  email: 'mario@example.it',
  nome_locale: 'Bar Mario',
  locale: { indirizzo: { via: 'Via Roma 1', cap: '00100', citta: 'Roma', provincia: 'RM' }, telefono: '06 1234567' },
  fatturazione: { ragione_sociale: 'Mario Srl', partita_iva: '01234567890', codice_fiscale: '01234567890', sede_legale: { via: 'Via Milano 2', cap: '20100', citta: 'Milano', provincia: 'MI' } },
}

describe('il codice', () => {
  it('casuale, lungo, diverso ogni volta; nel database solo l’impronta', () => {
    const a = p.nuovoCodice()
    const b = p.nuovoCodice()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(p.impronta(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(p.impronta(a)).not.toContain(a)
    expect(p.impronta(a)).toBe(p.impronta(a))
  })

  it('il corpo dello scambio vuole un codice, nient’altro', () => {
    const c = p.nuovoCodice()
    expect(p.codiceDelCorpo({ codice: ` ${c} ` })).toBe(c)
    for (const codice of [undefined, '', 'corto', `${c}x`, 'a'.repeat(42) + '!']) expect(p.codiceDelCorpo({ codice })).toBeNull()
  })
})

describe('il passaggio', () => {
  it('nasce per un sito https, dura 60 secondi', () => {
    const doc = p.nuovoPassaggio({ verso: 'app', progetto: 'drinkpos-bar', uid: 'loc-1', url: 'https://drinkpos-bar.web.app/', adesso: ADESSO })
    expect(doc).toEqual({ verso: 'app', progetto: 'drinkpos-bar', uid: 'loc-1', origine: 'https://drinkpos-bar.web.app', creato_il: ADESSO.toISOString(), scade_il: '2026-11-02T10:01:00.000Z' })
    expect(() => p.nuovoPassaggio({ verso: 'altrove', uid: 'x', url: 'https://a.it' })).toThrow(/Verso/)
    expect(() => p.nuovoPassaggio({ verso: 'app', uid: 'x', url: 'http://a.it' })).toThrow(/https/)
    expect(() => p.nuovoPassaggio({ verso: 'app', url: 'https://a.it' })).toThrow(/utente/)
  })

  it('vale una volta, entro il minuto, e solo dal suo sito', () => {
    const doc = p.nuovoPassaggio({ verso: 'app', progetto: 'drinkpos-bar', uid: 'loc-1', url: 'https://drinkpos-bar.web.app', adesso: ADESSO })
    const dopo = new Date(ADESSO.getTime() + 30_000)
    expect(p.passaggioValido(doc, { origin: 'https://drinkpos-bar.web.app', adesso: dopo })).toEqual({ ok: true, perche: null })
    expect(p.passaggioValido(null, { origin: 'https://drinkpos-bar.web.app' }).perche).toMatch(/già usato/)
    expect(p.passaggioValido(doc, { origin: 'https://drinkpos-bar.web.app', adesso: new Date(ADESSO.getTime() + 61_000) }).perche).toMatch(/scaduto/)
    expect(p.passaggioValido(doc, { origin: 'https://altro.web.app', adesso: dopo }).perche).toMatch(/altro sito/)
    expect(p.passaggioValido(doc, { adesso: dopo }).perche).toMatch(/altro sito/)
  })
})

describe('il titolare', () => {
  const nelLocale = (extra = {}) => ({ uid: 'loc-1', email: 'Mario@Example.it', emailVerified: true, disabled: false, customClaims: { role: 'admin' }, ...extra })

  it('dalla regia all’app: il suo account nel locale, verificato e admin', () => {
    expect(p.titolareNelLocale(nelLocale(), cliente).ok).toBe(true)
    expect(p.titolareNelLocale(null, cliente).perche).toMatch(/non c’è ancora/)
    expect(p.titolareNelLocale(nelLocale({ disabled: true }), cliente).perche).toMatch(/disattivato/)
    expect(p.titolareNelLocale(nelLocale({ emailVerified: false }), cliente).perche).toMatch(/non è quello del titolare/)
    expect(p.titolareNelLocale(nelLocale({ email: 'altro@example.it' }), cliente).perche).toMatch(/non è quello del titolare/)
    expect(p.titolareNelLocale(nelLocale({ customClaims: { role: 'bartender' } }), cliente).perche).toMatch(/non è admin/)
  })

  it('dall’app alla regia: token appena rinnovato, del titolare, admin', () => {
    const token = (extra = {}) => ({ iat: ADESSO.getTime() / 1000 - 30, email: 'mario@example.it', email_verified: true, role: 'admin', ...extra })
    expect(p.titolareDallApp(token(), cliente, ADESSO).ok).toBe(true)
    expect(p.titolareDallApp(token({ iat: ADESSO.getTime() / 1000 - p.TOKEN_FRESCO_S - 1 }), cliente, ADESSO).perche).toMatch(/troppo vecchio/)
    expect(p.titolareDallApp(token({ email: 'barista@example.it' }), cliente, ADESSO).perche).toMatch(/Solo il titolare/)
    expect(p.titolareDallApp(token({ email_verified: false }), cliente, ADESSO).perche).toMatch(/Solo il titolare/)
    expect(p.titolareDallApp(token({ role: 'bartender' }), cliente, ADESSO).perche).toMatch(/Solo il titolare/)
    expect(p.titolareDallApp(null, cliente, ADESSO).perche).toMatch(/Serve l’accesso/)
  })
})

describe('i dati del titolare nell’app', () => {
  it('nome, indirizzo, telefono e intestazione fiscale, nei campi dell’app', () => {
    expect(p.datiDelLocale(cliente)).toEqual({
      venue_name: 'Bar Mario',
      venue_legal_name: 'Mario Srl',
      venue_address: 'Via Roma 1',
      venue_postal_city: '00100 Roma (RM)',
      venue_city: 'Roma',
      venue_phone: '06 1234567',
      venue_vat_number: '01234567890',
      venue_tax_code: '01234567890',
      venue_legal_address: 'Via Milano 2 - 20100 Milano (MI)',
    })
  })

  it('solo dove l’app è vuota, e solo quello che la regia sa', () => {
    const attuali = { venue_name: 'La Tana del Coniglio', venue_address: '', venue_phone: '  ' }
    const patch = p.soloIVuoti(attuali, p.datiDelLocale({ ...cliente, fatturazione: {} }))
    expect(patch).toEqual({ venue_address: 'Via Roma 1', venue_postal_city: '00100 Roma (RM)', venue_city: 'Roma', venue_phone: '06 1234567' })
    expect(p.soloIVuoti(undefined, { venue_name: 'X' })).toEqual({ venue_name: 'X' })
    expect(p.datiDelLocale({}).venue_legal_address).toBe('')
  })
})

describe('nella regia', () => {
  const codice = readFileSync('functions/index.js', 'utf8')

  it('lo scambio cancella il codice nella stessa transazione in cui lo legge', () => {
    const scambio = codice.slice(codice.indexOf('exports.scambiaPassaggio'), codice.indexOf('// ── IL SITO SI PRESENTA ALLA REGIA'))
    expect(scambio).toContain('db.runTransaction')
    expect(scambio).toContain('tx.delete(ref)')
    expect(scambio).toContain("passa.passaggioValido(doc, { origin: req.get('origin') })")
  })

  it('l’accesso al locale lo firma l’account dell’SDK del suo progetto', () => {
    expect(codice).toContain('serviceAccountId: `firebase-adminsdk-fbsvc@${progetto}.iam.gserviceaccount.com`')
  })

  // Che i codici nel database non li tocchi nessuno dal browser si prova
  // sull'emulatore: tests/regole/registri.test.js, passaggi/{impronta}.

  it('il Terraform dà alla regia, su ogni locale nuovo, lettura degli account e firma', () => {
    const tf = readFileSync('infra/istanza/main.tf', 'utf8')
    expect(tf).toContain('role     = "roles/firebaseauth.viewer"')
    expect(tf).toContain('role               = "roles/iam.serviceAccountTokenCreator"')
    expect(tf).toContain('firebase-adminsdk-fbsvc@${google_project.istanza.project_id}.iam.gserviceaccount.com')
  })
})

// ── IL TITOLARE PER LA REGIA (audit del 09/11/2026, finding 17) ────────
// (REQ-FLOTTA-050) In tana-drink un admin crea altri admin: per toccare
// l'abbonamento (moduli dall'app) o la versione (scelta degli
// aggiornamenti) serve l'account del cliente, non un admin qualunque.
describe('stessoTitolare', () => {
  const titolare = { uid: 'regia-1', email: 'mario@example.it', email_verified: true, role: 'admin' }

  it('lo stesso uid della regia (M7) basta, anche senza email verificata', () => {
    expect(p.stessoTitolare(titolare, cliente)).toBe(true)
    expect(p.stessoTitolare({ uid: 'regia-1', role: 'admin' }, cliente)).toBe(true)
    expect(p.stessoTitolare({ uid: 'regia-1', role: 'admin', email: 'altro@example.it', email_verified: true }, cliente)).toBe(true)
  })

  it('un locale esistente ha un altro uid: vale l’email verificata uguale, maiuscole a parte', () => {
    expect(p.stessoTitolare({ uid: 'tana-7', role: 'admin', email: ' MARIO@example.it ', email_verified: true }, cliente)).toBe(true)
    expect(p.stessoTitolare({ uid: 'tana-7', role: 'admin', email: 'mario@example.it', email_verified: false }, cliente)).toBe(false)
    expect(p.stessoTitolare({ uid: 'tana-7', role: 'admin', email: 'mario@example.it' }, cliente)).toBe(false)
    // Un cliente senza email in archivio non si abbina a nessuno per email.
    expect(p.stessoTitolare({ uid: 'tana-7', role: 'admin', email: '', email_verified: true }, { uid: 'regia-1', email: '' })).toBe(false)
  })

  it('un altro admin del locale no; un bartender con l’uid giusto nemmeno', () => {
    expect(p.stessoTitolare({ uid: 'dip-2', role: 'admin', email: 'dipendente@example.it', email_verified: true }, cliente)).toBe(false)
    expect(p.stessoTitolare({ uid: 'regia-1', role: 'bartender', email: 'mario@example.it', email_verified: true }, cliente)).toBe(false)
    expect(p.stessoTitolare(null, cliente)).toBe(false)
    expect(p.stessoTitolare(titolare, null)).toBe(false)
  })

  it('nelle Functions sta davanti ai moduli dall’app e alla scelta degli aggiornamenti, con un messaggio chiaro', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const tra = (da, a) => codice.slice(codice.indexOf(da), codice.indexOf(a, codice.indexOf(da)))
    const moduli = tra('exports.moduloDallApp', '\n})')
    expect(moduli).toContain("if (!passa.stessoTitolare(chi, { uid: docCliente.id, ...cliente })) return no(403, 'Solo il titolare del locale può gestire i moduli.')")
    // Prima di ogni azione: anche la prova, che si consuma una volta sola.
    expect(moduli.indexOf('passa.stessoTitolare(')).toBeLessThan(moduli.indexOf("corpo.azione === 'prova'"))
    const scelta = tra('exports.sceltaDallApp', '\n})')
    expect(scelta).toContain("if (!passa.stessoTitolare(chi, cliente)) return res.status(403).json({ errore: 'Solo il titolare del locale può scegliere gli aggiornamenti.' })")
    expect(scelta.indexOf('passa.stessoTitolare(')).toBeLessThan(scelta.indexOf('applicaScelta('))
  })
})

// ── CHI È, NEI LOG (audit del 09/11/2026, finding 29) ──────────────────
// (REQ-FLOTTA-051) Nei log delle Functions l'uid, o un'impronta
// dell'email: mai l'indirizzo.
describe('improntaUtente', () => {
  it('l’uid se c’è, altrimenti otto cifre dell’impronta dell’email, mai l’email', () => {
    expect(p.improntaUtente({ uid: 'regia-1', email: 'mario@example.it' })).toBe('regia-1')
    const solaEmail = p.improntaUtente({ email: 'Mario@Example.it ' })
    expect(solaEmail).toMatch(/^email:[0-9a-f]{8}$/)
    expect(solaEmail).toBe(p.improntaUtente({ email: 'mario@example.it' }))
    expect(solaEmail).not.toContain('mario')
    expect(p.improntaUtente(null)).toBe('sconosciuto')
    expect(p.improntaUtente({})).toBe('sconosciuto')
  })

  it('nessun console.* delle Functions scrive un’email di chi agisce', () => {
    const righe = readFileSync('functions/index.js', 'utf8').split('\n')
    const conEmail = righe.filter((r) => /console\.(log|info|warn|error)\(/.test(r) && /\b(chi|token|utente|req\.auth\.token|cliente)\.email\b/.test(r))
    expect(conEmail).toEqual([])
    expect(righe.some((r) => r.includes('passa.improntaUtente(chi)'))).toBe(true)
  })
})
