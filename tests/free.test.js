'use strict'

// IL PIANO FREE E LA VENDITA (REQ-FLOTTA-015): un piano a 0 € coi suoi
// limiti, senza Stripe, che nasce col profilo leggero; l'admin decide se il
// Free e ogni modulo sono in vendita, e spegnere la vendita non tocca chi
// c'è già.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const f = require('../functions/lib/free.js')
const listino = require('../functions/piani.json')

const adesso = new Date('2026-10-30T10:00:00Z')
const nuovo = { uid: 'u1', slug: 'bar-mario' }
const inVendita = f.venditaPulita({ free: true })

describe('il listino', () => {
  it('il Free è gratuito, a un terminale, senza moduli, col profilo leggero e i limiti decisi', () => {
    expect(listino.piani.free).toMatchObject({ nome: 'Free', prezzo: 0, gratuito: true, terminali: 1, include: [], profilo: 'leggero' })
    expect(f.limitiDi('free')).toEqual({ prodotti_max: 10, conti_aperti_max: 5, sconti: false, storico_giorni: 7, utenti_max: 1, marchio: true, comande: false, stampa: false })
    expect(f.eGratuito('free')).toBe(true)
    expect(f.eGratuito('base')).toBe(false)
  })

  it('i piani a pagamento: profilo completo e nessun limite', () => {
    for (const p of ['base', 'completo']) {
      expect(f.profiloDi(p)).toBe('completo')
      expect(f.limitiDi(p)).toBeNull()
    }
  })
})

describe('la vendita', () => {
  it('senza documento: il Free è spento, i moduli sono tutti in vendita', () => {
    const v = f.venditaPulita(null)
    expect(v.free).toBe(false)
    expect(Object.values(v.moduli).every(Boolean)).toBe(true)
  })

  // IL SITO CHIUSO (REQ-FLOTTA-043, l'utente, 07/11/2026): in produzione,
  // finché l'admin non apre, le Functions della vendita rifiutano.
  it('«sito aperto» vale true, false o non deciso; non deciso è chiuso solo in produzione', () => {
    expect(f.venditaPulita(null).sito_aperto).toBeNull()
    expect(f.venditaPulita({ sito_aperto: 'true' }).sito_aperto).toBeNull()
    expect(f.venditaPulita({ sito_aperto: true }).sito_aperto).toBe(true)
    expect(f.venditaPulita({ sito_aperto: false }).sito_aperto).toBe(false)
    expect(f.sitoChiuso(f.venditaPulita(null), true)).toBe(true)
    expect(f.sitoChiuso(f.venditaPulita(null), false)).toBe(false)
    expect(f.sitoChiuso(f.venditaPulita({ sito_aperto: true }), true)).toBe(false)
    expect(f.sitoChiuso(f.venditaPulita({ sito_aperto: false }), false)).toBe(true)
    expect(f.SITO_CHIUSO).toMatch(/non è ancora aperto/)
  })

  it('col sito chiuso ogni porta della vendita si ferma: attivazione, Checkout, codice, cambio, contatto, Free, prova, ricarica AI, tema su misura, moduli dall’app', async () => {
    const { readFileSync } = await import('node:fs')
    const index = readFileSync('functions/index.js', 'utf8')
    expect(index).toMatch(/const SITO_IN_PRODUZIONE = PROGETTO_REGIA === 'drink-regia'/)
    // chiediTemaSuMisura dall'audit del 09/11/2026, finding 26 (REQ-FLOTTA-055).
    for (const fn of ['chiediAttivazione', 'creaCheckout', 'attivaConCodice', 'cambiaScelta', 'chiediContatto', 'scegliFree', 'provaModulo', 'creaRicaricaAI', 'chiediTemaSuMisura']) {
      const corpo = index.slice(index.indexOf(`exports.${fn} =`))
      expect(corpo.slice(0, corpo.indexOf('\n})')), fn).toMatch(/await solOSitoAperto\(\)/)
    }
    const app = index.slice(index.indexOf('exports.moduloDallApp ='))
    expect(app.slice(0, app.indexOf('\n})'))).toMatch(/if \(await sitoChiusoOra\(\)\) return no\(409, free\.SITO_CHIUSO\)/)
  })

  it('un modulo spento non si compra di nuovo, ma chi lo ha lo tiene; e quelli inclusi nel piano passano', () => {
    const v = f.venditaPulita({ moduli: { sumup: false } })
    expect(f.moduliFuoriVendita({ moduli: [] }, { piano: 'base', moduli: ['sumup', 'staff'] }, v)).toEqual(['sumup'])
    expect(f.moduliFuoriVendita({ moduli: ['sumup'] }, { piano: 'base', moduli: ['sumup'] }, v)).toEqual([])
    expect(f.moduliFuoriVendita({}, { piano: 'completo', moduli: ['sumup'] }, v)).toEqual([])
  })
})

describe('scegliere il Free', () => {
  it('un locale nuovo, col Free in vendita, sì', () => {
    expect(f.puoScegliereFree(nuovo, null, inVendita)).toEqual({ ok: true, perche: null })
  })

  it('col Free fuori vendita no, anche se qualcuno lo chiede a mano', () => {
    expect(f.puoScegliereFree(nuovo, null, f.venditaPulita({ free: false })).perche).toMatch(/non è disponibile/)
  })

  it('chi paga non scende al Free; chi è già Free non lo ri-sceglie; un eliminato no', () => {
    expect(f.puoScegliereFree({ ...nuovo, abbonamento: { stato: 'attivo', origine: 'stripe' } }, null, inVendita).perche).toMatch(/già un abbonamento/)
    expect(f.puoScegliereFree({ ...nuovo, abbonamento: { stato: 'disdetto', stripe_subscription: 'sub_1' } }, null, inVendita).ok).toBe(false)
    expect(f.puoScegliereFree({ ...nuovo, abbonamento: { stato: 'attivo', origine: 'gratuito' } }, null, inVendita).perche).toMatch(/già sul piano Free/)
    expect(f.puoScegliereFree(nuovo, { stato: 'eliminata' }, inVendita).perche).toMatch(/eliminato/)
    expect(f.puoScegliereFree(null, null, inVendita).ok).toBe(false)
  })

  it('il Free è un abbonamento attivo a costo zero che non passa da Stripe', () => {
    expect(f.sceltaFree(adesso)).toEqual({
      piano: 'free', moduli: [], terminali: 1,
      abbonamento: { stato: 'attivo', origine: 'gratuito', dal: '2026-10-30T10:00:00.000Z' },
    })
  })
})

describe('dal Free a un piano a pagamento', () => {
  const leggera = { stato: 'attiva', profilo: 'leggero' }

  it('un locale leggero che compra passa al profilo completo', () => {
    expect(f.serveProfiloCompleto(leggera, { piano: 'base' })).toBe(true)
    expect(f.serveProfiloCompleto(leggera, { piano: 'completo' })).toBe(true)
  })

  it('resta leggero sul Free; già completo, o non attivo, niente', () => {
    expect(f.serveProfiloCompleto(leggera, { piano: 'free' })).toBe(false)
    expect(f.serveProfiloCompleto({ stato: 'attiva', profilo: 'completo' }, { piano: 'base' })).toBe(false)
    expect(f.serveProfiloCompleto({ stato: 'attiva' }, { piano: 'base' })).toBe(false)
    expect(f.serveProfiloCompleto({ stato: 'in corso', profilo: 'leggero' }, { piano: 'base' })).toBe(false)
  })
})
