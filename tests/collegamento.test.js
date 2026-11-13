'use strict'

// ISTANZA E TITOLARE SCOLLEGATI (REQ-FLOTTA-086). Daniele, 13/11/2026: «fai
// il tasto di collegamento nel backoffice, ma deve apparire solo se per
// qualche motivo istanza e regia risultano scollegati». Qui la parte del
// server: cosa si scrive (functions/lib/collegamento.js), come la Function
// collegaIstanza lo fa, e che il prossimo «Aggiorna» non chiuda fuori il
// titolare dal suo locale.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { pianoCollegamento, appDelTitolare } = require('../functions/lib/collegamento.js')
const { pianoTitolare } = require('../functions/lib/titolare.js')

const ADESSO = new Date('2026-11-13T10:00:00.000Z')
const cliente = { uid: 'NUOVO', slug: 'prova-free', email: 'titolare@example.it', nome_locale: 'Prova Free' }
const istanza = (extra = {}) => ({ slug: 'prova-free', stato: 'attiva', uid: 'VECCHIO', progetto: 'drinkpos-prova-free', ...extra })
const piano = (dati = {}) => pianoCollegamento({ cliente, istanza: istanza(), richiesta: null, cassetto: null, da: 'admin@example.it', adesso: ADESSO, ...dati })

describe('pianoCollegamento: quando si collega', () => {
  it('un’istanza legata a un altro uid passa al titolare, con la traccia di chi, quando e da quale uid', () => {
    expect(piano()).toEqual({
      ok: true,
      vecchio: 'VECCHIO',
      nuovo: 'NUOVO',
      istanza: { uid: 'NUOVO', collegamento: { il: ADESSO.toISOString(), da: 'admin@example.it', uid_prima: 'VECCHIO' } },
      richiesta: null,
      cassetto: null,
    })
  })

  it('un’istanza senza uid (un lancio fallito su GitHub) si collega: l’uid di prima è null', () => {
    const p = piano({ istanza: istanza({ uid: null, stato: 'errore' }) })
    expect(p).toMatchObject({ ok: true, vecchio: null, nuovo: 'NUOVO' })
    expect(p.istanza.collegamento.uid_prima).toBeNull()
  })

  it('dell’istanza si scrivono solo uid e traccia: niente stato, progetto, licenza', () => {
    expect(Object.keys(piano().istanza).sort()).toEqual(['collegamento', 'uid'])
  })

  it('richiesta e cassetto AI col vecchio uid, o senza, passano al titolare', () => {
    const p = piano({ richiesta: { uid: 'VECCHIO', stato: 'attiva' }, cassetto: { uid: '' } })
    expect(p.richiesta).toEqual({ uid: 'NUOVO' })
    expect(p.cassetto).toEqual({ uid: 'NUOVO' })
  })

  it('richiesta e cassetto già del titolare, o che non ci sono, restano come sono', () => {
    const p = piano({ richiesta: { uid: 'NUOVO' }, cassetto: null })
    expect(p.ok).toBe(true)
    expect(p.richiesta).toBeNull()
    expect(p.cassetto).toBeNull()
  })
})

describe('pianoCollegamento: quando no', () => {
  it('senza cliente o senza istanza: non trovato', () => {
    expect(piano({ cliente: null })).toMatchObject({ ok: false, codice: 'not-found' })
    expect(piano({ istanza: null })).toMatchObject({ ok: false, codice: 'not-found' })
  })

  it('un’istanza eliminata non si collega', () => {
    expect(piano({ istanza: istanza({ stato: 'eliminata' }) })).toMatchObject({ ok: false, codice: 'failed-precondition', perche: expect.stringMatching(/eliminat/) })
  })

  it('un’istanza già collegata al titolare non si tocca', () => {
    expect(piano({ istanza: istanza({ uid: 'NUOVO' }) })).toMatchObject({ ok: false, codice: 'failed-precondition', perche: expect.stringMatching(/già collegata/) })
  })

  it('una richiesta o un cassetto legati a un terzo account fermano tutto, con l’uid del terzo', () => {
    const r = piano({ richiesta: { uid: 'TERZO' } })
    expect(r).toMatchObject({ ok: false, codice: 'failed-precondition' })
    expect(r.perche).toMatch(/TERZO/)
    const c = piano({ cassetto: { uid: 'TERZO' } })
    expect(c).toMatchObject({ ok: false, codice: 'failed-precondition' })
    expect(c.perche).toMatch(/TERZO/)
  })

  it('con l’istanza senza uid, un uid qualsiasi sulla richiesta è di un terzo', () => {
    expect(piano({ istanza: istanza({ uid: '' }), richiesta: { uid: 'QUALCUNO' } })).toMatchObject({ ok: false, codice: 'failed-precondition' })
  })
})

describe('la Function collegaIstanza', () => {
  const index = readFileSync('functions/index.js', 'utf8')
  const inizio = index.indexOf('exports.collegaIstanza = onCall(')
  const corpo = index.slice(inizio, index.indexOf('\nexports.', inizio + 1))

  it('esiste, ed è solo dell’admin', () => {
    expect(inizio).toBeGreaterThan(-1)
    expect(corpo).toContain("if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied'")
  })

  it('rilegge tutto in una transazione: il cliente dello slug (uno solo), istanza, richiesta, cassetto', () => {
    expect(corpo).toContain('db.runTransaction(')
    expect(corpo).toContain('registrazione.clientePerSlug(db, slug, t)')
    expect(corpo).toContain('SlugAmbiguo')
    expect(corpo).toContain('collegamento.pianoCollegamento(')
    for (const p of ['istanze/${slug}', 'richieste/${slug}', 'ai/${slug}']) expect(corpo).toContain(p)
  })

  it('risponde con l’uid vecchio e il nuovo', () => {
    expect(corpo).toMatch(/return \{ ok: true, vecchio: [^,]+, nuovo: /)
  })
})

// LA DASHBOARD CHIEDE ALLA REGIA (statoMiaApp). Daniele, 13/11/2026, sulle
// regole aperte ai documenti che non ci sono: «non va bene serve una
// soluzione piu sicura e piu robusta». La dashboard ascolta la query sul suo
// uid; se l'istanza non compare, chiede qui, per il SUO locale e basta.
describe('appDelTitolare: cosa dire al titolare della sua app', () => {
  it('nessuna istanza: «nessuna», si attiva come sempre', () => {
    expect(appDelTitolare('NUOVO', null)).toBe('nessuna')
  })

  it('istanza col suo uid: «collegata»', () => {
    expect(appDelTitolare('NUOVO', istanza({ uid: 'NUOVO' }))).toBe('collegata')
  })

  it('istanza con un altro uid, o senza uid ma col progetto: «scollegata»', () => {
    expect(appDelTitolare('NUOVO', istanza())).toBe('scollegata')
    expect(appDelTitolare('NUOVO', istanza({ uid: null }))).toBe('scollegata')
  })

  it('un lancio fallito prima del progetto (senza uid né progetto) è «nessuna»: il titolare rilancia', () => {
    expect(appDelTitolare('NUOVO', { slug: 'prova-free', stato: 'errore', errore: 'Lancio fallito (GitHub 500)', progetto: null })).toBe('nessuna')
  })
})

describe('la Function statoMiaApp', () => {
  const index = readFileSync('functions/index.js', 'utf8')
  const inizio = index.indexOf('exports.statoMiaApp = onCall(')
  const corpo = index.slice(inizio, index.indexOf('\nexports.', inizio + 1))

  it('esiste e vuole l’accesso', () => {
    expect(inizio).toBeGreaterThan(-1)
    expect(corpo).toContain("throw new HttpsError('unauthenticated'")
  })

  it('non prende niente dalla chiamata: il locale è quello di clienti/{uid} di chi chiama', () => {
    expect(corpo).not.toContain('req.data')
    expect(corpo).toContain('db.doc(`clienti/${uid}`)')
    expect(corpo).toContain('const uid = req.auth?.uid')
  })

  it('risponde solo { app }', () => {
    expect(corpo).toContain('return { app: collegamento.appDelTitolare(uid, ')
    expect(corpo).toContain("return { app: 'nessuna' }")
  })
})

describe('il lancio fallito scrive l’uid sull’istanza', () => {
  it('come il lancio riuscito: così la query del titolare la trova', () => {
    expect(readFileSync('functions/index.js', 'utf8')).toContain("documentoIstanza({ slug: richiesta.slug, stato: 'errore', errore: `Lancio fallito (GitHub ${res.status})` }, null), uid: richiesta.uid || null }")
  })
})

describe('il prossimo «Aggiorna» dopo il collegamento (pianoTitolare)', () => {
  const EMAIL = 'titolare@example.it'
  const usato = (uid) => ({ uid, email: EMAIL, customClaims: { role: 'admin' }, providerData: [{ providerId: 'password' }], metadata: { lastSignInTime: 'ieri' } })

  it('la regia manda al workflow l’uid del cliente, cioè quello nuovo', () => {
    expect(readFileSync('functions/index.js', 'utf8')).toContain("uid: esistente ? '' : cliente?.uid || ''")
  })

  it('nel locale l’account già usato col vecchio uid resta, admin, con un avviso: il titolare non resta fuori', () => {
    const p = pianoTitolare({ uid: 'NUOVO', email: EMAIL, perUid: null, perEmail: usato('VECCHIO') })
    expect(p).toMatchObject({ azione: 'tieni', uid: 'VECCHIO', ruolo: null, daCancellare: null })
    expect(p.avvisi).toHaveLength(1)
    expect(p.avvisi[0]).toMatch(/VECCHIO/)
  })
})
