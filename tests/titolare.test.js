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
const { emailTitolare, cosaFareColTitolare } = require('../functions/lib/titolare.js')

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
      expect(t).toContain('node scripts/titolare-istanza.mjs --project "$PROGETTO" --email "$EMAIL_TITOLARE"')
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
    expect(script).toContain("auth.createUser({ email: EMAIL, emailVerified: true })")
    expect(script).not.toMatch(/password:\s/)
  })
})
