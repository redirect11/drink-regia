'use strict'

// I COLLABORATORI DI UN LOCALE (REQ-FLOTTA-098, REQ-FLOTTA-099). Daniele,
// 14/11/2026: «se invece volessi fare in modo che anche altri admin possano
// fare il claim e vedere la dashboard. Ad esempio un collaboratore di
// flavio», e alla proposta (invito del titolare, collegamento dal
// backoffice): «implementa 1 e 2». Il titolare resta uno, quello che paga;
// i collaboratori vedono il locale e aprono l'app, niente di quello che
// tocca l'abbonamento. Dati inventati: nessuna persona reale.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const c = require('../functions/lib/collaboratori.js')

const ADESSO = new Date('2026-11-14T10:00:00.000Z')
const titolare = { uid: 'tit-1', slug: 'bar-mario', email: 'Mario.Rossi@gmail.com', nome_locale: 'Bar Mario', piano: 'completo', moduli: ['staff'], terminali: 2 }
const membro = (extra = {}) => ({ uid: 'col-1', email: 'luca@example.it', slug: 'bar-mario', ruolo: 'collaboratore', aggiunto_il: '2026-11-14T09:00:00.000Z', ...extra })
const rifiuto = (fn) => {
  try {
    fn()
  } catch (e) {
    return e
  }
  return null
}

describe('l’email del collaboratore', () => {
  it('si pulisce: spazi e maiuscole', () => {
    expect(c.emailCollaboratore('  Luca@Example.IT ')).toBe('luca@example.it')
  })

  it('una non valida, o col «+», si rifiuta (un account è uno per persona, REQ-FLOTTA-083)', () => {
    for (const v of ['', 'luca', 'luca@', '@example.it', null, 'luca@@example.it']) {
      const e = rifiuto(() => c.emailCollaboratore(v))
      expect(e).toBeInstanceOf(c.CollaboratoreRifiutato)
      expect(e.code).toBe('invalid-argument')
    }
    expect(rifiuto(() => c.emailCollaboratore('luca+bar@example.it')).message).toMatch(/«\+…»/)
  })
})

describe('chi si può aggiungere', () => {
  const base = { email: 'luca@example.it', titolare, membri: [], clienteDellAccount: null, membroDellAccount: null }

  it('una persona nuova, o un account senza locale: sì', () => {
    expect(c.problemaAggiunta(base)).toBeNull()
  })

  it('il titolare stesso no, anche scritto in un’altra forma di Gmail', () => {
    expect(c.problemaAggiunta({ ...base, email: 'mariorossi@gmail.com' })).toMatch(/titolare/)
  })

  it('il titolare di un altro locale no: un account ha un locale solo', () => {
    expect(c.problemaAggiunta({ ...base, clienteDellAccount: { slug: 'altro-bar' } })).toMatch(/già titolare/)
  })

  it('chi c’è già, o collabora con un altro locale, no', () => {
    expect(c.problemaAggiunta({ ...base, membroDellAccount: membro() })).toMatch(/già un collaboratore di questo locale/)
    expect(c.problemaAggiunta({ ...base, membroDellAccount: membro({ slug: 'altro-bar' }) })).toMatch(/un altro locale/)
  })

  it('al massimo cinque per locale', () => {
    const cinque = Array.from({ length: c.MASSIMO }, (_, i) => membro({ uid: `col-${i}` }))
    expect(c.MASSIMO).toBe(5)
    expect(c.problemaAggiunta({ ...base, membri: cinque })).toMatch(/Al massimo 5/)
    expect(c.problemaAggiunta({ ...base, membri: cinque.slice(1) })).toBeNull()
  })
})

describe('il documento del collaboratore', () => {
  it('dice chi è, di quale locale, chi l’ha aggiunto e quando', () => {
    expect(c.nuovoMembro({ uid: 'col-1', email: 'luca@example.it', slug: 'bar-mario', da: 'admin', adesso: ADESSO })).toEqual({
      uid: 'col-1',
      email: 'luca@example.it',
      email_norma: 'luca@example.it',
      slug: 'bar-mario',
      ruolo: 'collaboratore',
      aggiunto_da: 'admin',
      aggiunto_il: ADESSO.toISOString(),
    })
  })

  it('chi l’ha aggiunto è il titolare o l’admin, nient’altro', () => {
    expect(c.nuovoMembro({ uid: 'u', email: 'a@b.it', slug: 'bar-mario', da: 'chiunque', adesso: ADESSO }).aggiunto_da).toBe('titolare')
  })

  it('l’elenco per il titolare: email e data, in ordine di arrivo', () => {
    const elenco = c.elencoCollaboratori([membro({ uid: 'b', email: 'b@example.it', aggiunto_il: '2026-11-14T09:30:00.000Z' }), membro({ uid: 'a', email: 'a@example.it' })])
    expect(elenco).toEqual([
      { uid: 'a', email: 'a@example.it', aggiunto_il: '2026-11-14T09:00:00.000Z', aggiunto_da: null },
      { uid: 'b', email: 'b@example.it', aggiunto_il: '2026-11-14T09:30:00.000Z', aggiunto_da: null },
    ])
  })
})

describe('il segno nel token', () => {
  it('si aggiunge accanto agli altri claim, e si toglie lasciandoli', () => {
    expect(c.claimConLocale({ admin: true }, 'bar-mario')).toEqual({ admin: true, collabora: 'bar-mario' })
    expect(c.claimConLocale(null, 'bar-mario')).toEqual({ collabora: 'bar-mario' })
    expect(c.claimSenzaLocale({ admin: true, collabora: 'bar-mario' })).toEqual({ admin: true })
    expect(c.claimSenzaLocale(undefined)).toEqual({})
  })
})

describe('quello che vede il collaboratore', () => {
  const istanza = { stato: 'attiva', url: 'https://bar-mario.example.it', presentazione: { versione: 'v1.10.43' }, build: { VITE_X: 'chiave' }, uid: 'tit-1' }

  it('il locale, il piano e l’app; niente dati del titolare, della fatturazione o della build', () => {
    const v = c.vistaCollaboratore({ membro: membro(), cliente: { ...titolare, fatturazione: { piva: '0' }, abbonamento: { stato: 'attivo' } }, istanza })
    expect(v).toEqual({
      slug: 'bar-mario',
      nome_locale: 'Bar Mario',
      piano: 'completo',
      moduli: ['staff'],
      terminali: 2,
      app: { stato: 'attiva', url: 'https://bar-mario.example.it', versione: 'v1.10.43' },
    })
    expect(JSON.stringify(v)).not.toMatch(/gmail|piva|chiave|tit-1|abbonamento/)
  })

  it('senza app attiva, nessun indirizzo', () => {
    expect(c.vistaCollaboratore({ membro: membro(), cliente: titolare, istanza: { ...istanza, stato: 'sospesa' } }).app).toEqual({ stato: 'sospesa', url: null, versione: 'v1.10.43' })
    expect(c.vistaCollaboratore({ membro: membro(), cliente: titolare, istanza: null }).app).toEqual({ stato: null, url: null, versione: null })
  })

  it('niente vista senza il documento, o se il locale non è più quello', () => {
    expect(c.vistaCollaboratore({ membro: null, cliente: titolare, istanza })).toBeNull()
    expect(c.vistaCollaboratore({ membro: membro(), cliente: null, istanza })).toBeNull()
    expect(c.vistaCollaboratore({ membro: membro({ slug: 'altro-bar' }), cliente: titolare, istanza })).toBeNull()
    expect(c.vistaCollaboratore({ membro: membro(), cliente: titolare, istanza: { ...istanza, stato: 'eliminata' } })).toBeNull()
  })
})
