'use strict'

// PAGAMENTI ONLINE SPENTI: LA RICHIESTA DI CONTATTO (REQ-FLOTTA-017).
// Decisione dell'utente del 30/10/2026: in produzione i pagamenti con
// Stripe si tengono spenti finché non si è pronti a riceverli; il titolare
// lascia un recapito, il pagamento si concorda fuori dal sito e il piano lo
// attiva l'admin. Qui la regola del server.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { pagamentiOnline, richiestaContatto, NOTA_MAX } = require('../functions/lib/contatti.js')
const { venditaPulita } = require('../functions/lib/free.js')

const cliente = { uid: 'u1', email: 'bar@example.com', nome_locale: 'Bar Mario', slug: 'bar-mario', moduli: [] }
const spenti = venditaPulita({ moduli: { sumup: false } })
const ADESSO = new Date('2026-10-30T10:00:00.000Z')

describe('i pagamenti online', () => {
  it('sono spenti finché l’admin non li accende', () => {
    expect(venditaPulita(null).pagamenti_online).toBe(false)
    expect(pagamentiOnline(venditaPulita(null))).toBe(false)
    expect(pagamentiOnline(venditaPulita({ pagamenti_online: true }))).toBe(true)
    expect(pagamentiOnline(venditaPulita({ pagamenti_online: 'true' }))).toBe(false)
  })
})

describe('la richiesta di contatto', () => {
  it('porta la scelta pulita, il recapito e lo stato aperta', () => {
    const r = richiestaContatto(cliente, { piano: 'base', moduli: ['staff', 'staff', 'inventato'], terminali: '2', telefono: ' +39 333 1234567 ', nota: 'Di mattina' }, spenti, ADESSO)
    expect(r.ok).toBe(true)
    expect(r.documento).toEqual({
      uid: 'u1', email: 'bar@example.com', nome_locale: 'Bar Mario', slug: 'bar-mario',
      scelta: { piano: 'base', moduli: ['staff'], terminali: 2, intervallo: 'mese' },
      telefono: '+39 333 1234567', nota: 'Di mattina', codice: null, stato: 'aperta', chiesta_il: ADESSO.toISOString(),
    })
  })

  // REQ-FLOTTA-028: coi pagamenti spenti il codice sconto viaggia con la
  // richiesta, e lo applica l'admin.
  it('porta il codice sconto scritto nella scelta del piano, se ha la forma di un codice', () => {
    expect(richiestaContatto(cliente, { piano: 'base', codice: ' prova20 ' }, spenti, ADESSO).documento.codice).toBe('PROVA20')
    expect(richiestaContatto(cliente, { piano: 'base', codice: 'no!' }, spenti, ADESSO).documento.codice).toBeNull()
  })

  it('telefono e nota sono facoltativi; la nota perde i caratteri di controllo e si taglia', () => {
    const r = richiestaContatto(cliente, { piano: 'completo', nota: 'a\u0000b\nc' + 'x'.repeat(NOTA_MAX) }, spenti, ADESSO)
    expect(r.documento.telefono).toBeNull()
    expect(r.documento.nota.startsWith('ab\nc')).toBe(true)
    expect(r.documento.nota).toHaveLength(NOTA_MAX)
  })

  it('si rifiuta: senza cliente, coi pagamenti accesi, per il Free, con un modulo fuori vendita, con un telefono strano', () => {
    expect(richiestaContatto(null, { piano: 'base' }, spenti).perche).toMatch(/Nessun locale/)
    expect(richiestaContatto(cliente, { piano: 'base' }, venditaPulita({ pagamenti_online: true })).perche).toMatch(/sono attivi/)
    expect(richiestaContatto(cliente, { piano: 'free' }, spenti).perche).toMatch(/Free non si paga/)
    expect(richiestaContatto(cliente, { piano: 'base', moduli: ['sumup'] }, spenti).perche).toMatch(/Non più in vendita: sumup/)
    expect(richiestaContatto(cliente, { piano: 'base', telefono: 'chiamami' }, spenti).perche).toMatch(/telefono/)
  })

  it('la scelta mensile o annuale arriva all’admin con la richiesta (REQ-FLOTTA-031)', () => {
    expect(richiestaContatto(cliente, { piano: 'base', intervallo: 'anno' }, spenti, ADESSO).documento.scelta.intervallo).toBe('anno')
  })

  it('chi ha già un modulo tolto dalla vendita lo può tenere nella richiesta', () => {
    const r = richiestaContatto({ ...cliente, moduli: ['sumup'] }, { piano: 'base', moduli: ['sumup'] }, spenti, ADESSO)
    expect(r.ok).toBe(true)
    expect(r.documento.scelta.moduli).toEqual(['sumup'])
  })
})
