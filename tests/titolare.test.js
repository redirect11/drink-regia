'use strict'

// IL TITOLARE, ADMIN DEL SUO LOCALE (REQ-FLOTTA-029). L'utente,
// 02/11/2026: «Quando viene deployato qualcosa, bisogna sempre aggiungere
// come utente admin chi ha richiesto la sottoscrizione. Magari chiedere di
// creare una password». prova-bar e prova-free erano nati senza nessuno
// che potesse entrare.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { emailTitolare, uidTitolare, cosaFareColTitolare, segnaposto, pianoTitolare } = require('../functions/lib/titolare.js')

describe('l’email del titolare', () => {
  it('pulita e minuscola; vuota se manca; null se non è un’email', () => {
    expect(emailTitolare(' Mario@Example.IT ')).toBe('mario@example.it')
    expect(emailTitolare('')).toBe('')
    expect(emailTitolare(undefined)).toBe('')
    expect(emailTitolare('mario')).toBeNull()
    expect(emailTitolare('mario@ex ample.it')).toBeNull()
  })
})

describe('cosa fare col titolare', () => {
  it('nessun account: si crea, si fa admin, gli si manda il link per la password', () => {
    expect(cosaFareColTitolare(null)).toEqual({ crea: true, ruolo: { role: 'admin' }, link: true })
  })

  it('un cliente del bar con la stessa email diventa admin; gli altri claim restano', () => {
    const cliente = { customClaims: { altro: 1 }, providerData: [{ providerId: 'password' }], metadata: { lastSignInTime: 'ieri' } }
    expect(cosaFareColTitolare(cliente)).toEqual({ crea: false, ruolo: { altro: 1, role: 'admin' }, link: false })
  })

  it('un admin con la sua password non si tocca', () => {
    expect(cosaFareColTitolare({ customClaims: { role: 'admin' }, passwordHash: 'x', metadata: { lastSignInTime: 'ieri' } })).toEqual({ crea: false, ruolo: null, link: false })
  })

  it('un admin che non ha mai impostato la password riceve di nuovo il link; uno entrato con Google no', () => {
    expect(cosaFareColTitolare({ customClaims: { role: 'admin' }, providerData: [], metadata: {} }).link).toBe(true)
    expect(cosaFareColTitolare({ customClaims: { role: 'admin' }, providerData: [{ providerId: 'google.com' }], metadata: { lastSignInTime: 'ieri' } }).link).toBe(false)
  })
})

describe('nei workflow', () => {
  for (const wf of ['provisiona-istanza.yml', 'aggiorna-istanza.yml']) {
    it(`${wf}: dopo il deploy, prima dell'esito, con l'email controllata`, () => {
      const t = readFileSync(`.github/workflows/${wf}`, 'utf8')
      const titolare = t.indexOf('- name: Il titolare, admin del suo locale')
      expect(titolare).toBeGreaterThan(t.indexOf('npx firebase-tools deploy'))
      expect(titolare).toBeLessThan(t.indexOf('- name: Esito alla regia'))
      // M7: l'uid della regia arriva allo script, non resta solo un input.
      expect(t).toContain('node scripts/titolare-istanza.mjs --project "$PROGETTO" --uid "$UID_TITOLARE" --email "$EMAIL_TITOLARE"')
      expect(t).toContain('UID_TITOLARE: ${{ inputs.uid }}')
      expect(t).toMatch(/\[\[ "\$UID_TITOLARE" =~ \^\[A-Za-z0-9\]/)
      expect(t).toContain('"::error::Email del titolare non valida."')
    })
  }

  it('mai su un locale esistente: la Tana ha i suoi admin', () => {
    expect(readFileSync('.github/workflows/aggiorna-istanza.yml', 'utf8')).toContain("if: env.EMAIL_TITOLARE != '' && env.ESISTENTE != 'true'")
    expect(readFileSync('functions/index.js', 'utf8')).toContain("email: esistente ? '' : cliente?.email || ''")
  })

  it('la password non la genera nessuno: la imposta il titolare dal link di Firebase', () => {
    const script = readFileSync('scripts/titolare-istanza.mjs', 'utf8')
    expect(script).toContain("requestType: 'PASSWORD_RESET'")
    expect(script).toContain("auth.createUser({ ...(cosa.uid ? { uid: cosa.uid } : {}), email: EMAIL, emailVerified: true })")
    expect(script).not.toMatch(/password:\s/)
  })
})

// ── M7: LO STESSO UID DELLA REGIA ──────────────────────────────────────
// Il workflow riceveva l'uid del titolare e non lo usava: nel locale
// l'account nasceva con un uid suo. Ora nasce con quello della regia; un
// segnaposto mai usato con un altro uid si ricrea; un account usato resta.
describe('l’uid del titolare', () => {
  it('lettere e cifre fino a 128; vuoto se manca; null se non è un uid', () => {
    expect(uidTitolare(' AbC123 ')).toBe('AbC123')
    expect(uidTitolare('')).toBe('')
    expect(uidTitolare(undefined)).toBe('')
    expect(uidTitolare('a/b')).toBeNull()
    expect(uidTitolare('x'.repeat(129))).toBeNull()
  })
})

describe('il piano per il titolare (M7)', () => {
  const EMAIL = 'mario@example.it'
  const usato = (uid, extra = {}) => ({ uid, email: EMAIL, customClaims: { role: 'admin' }, providerData: [{ providerId: 'password' }], metadata: { lastSignInTime: 'ieri' }, ...extra })
  const vuoto = (uid, extra = {}) => ({ uid, email: EMAIL, customClaims: { role: 'admin' }, providerData: [], metadata: {}, ...extra })

  it('istanza nuova: si crea con lo STESSO uid della regia, admin, col link', () => {
    expect(pianoTitolare({ uid: 'U1', email: EMAIL })).toEqual({ azione: 'crea', uid: 'U1', ruolo: { role: 'admin' }, link: true, avvisi: [], daCancellare: null })
  })

  it('rilancio sulla stessa istanza dopo che è entrato: niente da fare (idempotente)', () => {
    const u = usato('U1')
    expect(pianoTitolare({ uid: 'U1', email: EMAIL, perUid: u, perEmail: u })).toEqual({ azione: 'tieni', uid: 'U1', ruolo: null, link: false, avvisi: [], daCancellare: null })
  })

  it('rilancio prima che abbia impostato la password: niente da creare, il link riparte', () => {
    const u = vuoto('U1')
    expect(pianoTitolare({ uid: 'U1', email: EMAIL, perUid: u, perEmail: u })).toMatchObject({ azione: 'tieni', ruolo: null, link: true })
  })

  it('istanza nata prima di M7 col segnaposto mai usato: si ricrea con l’uid della regia', () => {
    expect(pianoTitolare({ uid: 'U1', email: EMAIL, perEmail: vuoto('VECCHIO') })).toEqual({ azione: 'ricrea', uid: 'U1', ruolo: { role: 'admin' }, link: true, avvisi: [], daCancellare: 'VECCHIO' })
  })

  it('un account con l’email del titolare già usato non si cancella mai: resta, admin, con un avviso', () => {
    const p = pianoTitolare({ uid: 'U1', email: EMAIL, perEmail: usato('ALTRO', { customClaims: {} }) })
    expect(p).toMatchObject({ azione: 'tieni', uid: 'ALTRO', ruolo: { role: 'admin' }, daCancellare: null })
    expect(p.avvisi[0]).toMatch(/altro uid/)
  })

  it('segnaposto solo se senza password, mai entrato, senza altri accessi e con al più il ruolo admin', () => {
    expect(segnaposto(vuoto('A'))).toBe(true)
    expect(segnaposto(vuoto('A', { customClaims: {} }))).toBe(true)
    expect(segnaposto(vuoto('A', { passwordHash: 'x' }))).toBe(false)
    expect(segnaposto(vuoto('A', { metadata: { lastSignInTime: 'ieri' } }))).toBe(false)
    expect(segnaposto(vuoto('A', { providerData: [{ providerId: 'google.com' }] }))).toBe(false)
    expect(segnaposto(vuoto('A', { customClaims: { role: 'bartender' } }))).toBe(false)
    expect(segnaposto(null)).toBe(false)
  })

  it('appena creato con l’Admin SDK l’emulatore segna un accesso alla creazione: è ancora mai entrato', () => {
    const t = 'Mon, 02 Nov 2026 14:55:47 GMT'
    expect(segnaposto(vuoto('A', { metadata: { creationTime: t, lastSignInTime: t, lastRefreshTime: null } }))).toBe(true)
    expect(segnaposto(vuoto('A', { metadata: { creationTime: t, lastSignInTime: t, lastRefreshTime: t } }))).toBe(false)
    expect(segnaposto(vuoto('A', { metadata: { creationTime: t, lastSignInTime: 'Tue, 03 Nov 2026 09:00:00 GMT' } }))).toBe(false)
  })

  it('l’account della regia con un’altra email: resta lui, admin; il link no, andrebbe a un altro', () => {
    const p = pianoTitolare({ uid: 'U1', email: EMAIL, perUid: vuoto('U1', { email: 'vecchia@example.it', customClaims: {} }), perEmail: vuoto('ALTRO') })
    expect(p).toMatchObject({ azione: 'tieni', uid: 'U1', ruolo: { role: 'admin' }, link: false, daCancellare: null })
    expect(p.avvisi).toHaveLength(2)
  })

  it('senza uid (lancio a mano) lavora per email, come prima', () => {
    expect(pianoTitolare({ email: EMAIL })).toMatchObject({ azione: 'crea', uid: null, link: true })
    expect(pianoTitolare({ email: EMAIL }).avvisi[0]).toMatch(/uid/)
    expect(pianoTitolare({ email: EMAIL, perEmail: usato('X') })).toMatchObject({ azione: 'tieni', uid: 'X', ruolo: null, link: false })
  })

  it('i claim che ci sono restano: si aggiunge solo il ruolo', () => {
    expect(pianoTitolare({ uid: 'U1', email: EMAIL, perUid: usato('U1', { customClaims: { altro: 1 } }), perEmail: usato('U1', { customClaims: { altro: 1 } }) }).ruolo).toEqual({ altro: 1, role: 'admin' })
  })
})

describe('lo script (M7)', () => {
  const script = readFileSync('scripts/titolare-istanza.mjs', 'utf8')
  it('cerca per uid e per email, cancella solo il segnaposto indicato dal piano', () => {
    expect(script).toContain('auth.getUser(UID)')
    expect(script).toContain('auth.getUserByEmail(EMAIL)')
    expect(script).toContain('if (cosa.daCancellare) await auth.deleteUser(cosa.daCancellare)')
    expect(script.match(/deleteUser/g)).toHaveLength(1)
  })

  it('la regia passa l’uid del cliente anche agli aggiornamenti, mai per un locale esistente', () => {
    expect(readFileSync('functions/index.js', 'utf8')).toContain("uid: esistente ? '' : cliente?.uid || ''")
  })
})
