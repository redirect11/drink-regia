'use strict'

// LE PROVE DEI MODULI (REQ-FLOTTA-016): l'admin sceglie quali moduli si
// possono provare e per quanti giorni; il titolare ne accende una per
// modulo, una volta sola; la licenza accende il modulo fino alla scadenza,
// anche sul Free; poi si spegne, salvo che il modulo sia stato comprato.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const p = require('../functions/lib/prove.js')
const { venditaPulita } = require('../functions/lib/free.js')
const { moduliLicenza, patchLicenzaPiano, sceltaCambiata } = require('../functions/lib/licenza.js')

const adesso = new Date('2026-10-30T10:00:00Z')
const vendita = venditaPulita({ prove: { magazzino: 14, statistiche: 7 } })
const attiva = { stato: 'attiva', licenza_stato: 'attiva' }
const base = { uid: 'u1', slug: 'bar-mario', piano: 'base', moduli: ['staff'] }

describe('le prove decise dall’admin', () => {
  it('solo i moduli con dei giorni si provano; i giorni si puliscono', () => {
    expect(vendita.prove).toMatchObject({ magazzino: 14, statistiche: 7, staff: 0, sumup: 0 })
    expect(p.provePulite({ prove: { magazzino: 500, staff: -3, clienti: 'boh', sumup: 2.7 } })).toMatchObject({ magazzino: p.GIORNI_MAX, staff: 0, clienti: 0, sumup: 2 })
    expect(Object.values(venditaPulita(null).prove).every((g) => g === 0)).toBe(true)
  })
})

describe('accendere una prova', () => {
  it('un modulo provabile, non ancora suo né già provato: sì, coi giorni e la scadenza', () => {
    expect(p.puoProvare(base, attiva, 'magazzino', vendita, adesso)).toEqual({ ok: true, perche: null, giorni: 14, scade_il: '2026-11-13T10:00:00.000Z' })
  })

  it('anche sul Free, se l’admin lo permette', () => {
    expect(p.puoProvare({ ...base, piano: 'free', moduli: [] }, attiva, 'statistiche', vendita, adesso).ok).toBe(true)
  })

  it('no: senza giorni, fuori vendita, già suo, già provato, locale non attivo o sospeso', () => {
    expect(p.puoProvare(base, attiva, 'sumup', vendita, adesso).perche).toMatch(/non si può provare/)
    expect(p.puoProvare(base, attiva, 'magazzino', venditaPulita({ prove: { magazzino: 14 }, moduli: { magazzino: false } }), adesso).perche).toMatch(/non è in vendita/)
    expect(p.puoProvare({ ...base, moduli: ['magazzino'] }, attiva, 'magazzino', vendita, adesso).perche).toMatch(/già attivo nel piano/)
    expect(p.puoProvare({ ...base, piano: 'completo' }, attiva, 'magazzino', vendita, adesso).ok).toBe(false)
    expect(p.puoProvare({ ...base, prove_fatte: ['magazzino'] }, attiva, 'magazzino', vendita, adesso).perche).toMatch(/La prova di .* è già stata usata: si prova una volta sola/)

    expect(p.puoProvare(base, { stato: 'in corso' }, 'magazzino', vendita, adesso).perche).toMatch(/non è attivo/)
    expect(p.puoProvare(base, { ...attiva, licenza_stato: 'sospesa' }, 'magazzino', vendita, adesso).perche).toMatch(/sospeso o chiuso/)
    expect(p.puoProvare(base, attiva, 'boh', vendita, adesso).perche).toMatch(/sconosciuto/)
  })
})

// LA BASE DI UN MODULO (tana-drink REQ-LIC-015, 07/11/2026): gli ordini dal
// telefono vogliono il menù digitale, perché il cliente ordina da lì. Senza,
// la prova non si accende: sarebbe un modulo che non fa niente.
describe('un modulo che ne richiede un altro', () => {
  const conProve = venditaPulita({ prove: { ordini_cliente: 7, menu_tavoli: 7 } })

  it('senza la sua base non si prova, e il motivo la nomina', () => {
    expect(p.puoProvare(base, attiva, 'ordini_cliente', conProve, adesso)).toMatchObject({
      ok: false,
      perche: 'Ordini dal telefono del cliente richiede Menù digitale e tavoli.',
    })
  })

  it('con la base comprata, nel piano o in prova sì', () => {
    expect(p.puoProvare({ ...base, moduli: ['menu_tavoli'] }, attiva, 'ordini_cliente', conProve, adesso).ok).toBe(true)
    const inProva = { ...base, prove: { menu_tavoli: { scade_il: '2026-11-05T10:00:00Z' } } }
    expect(p.puoProvare(inProva, attiva, 'ordini_cliente', conProve, adesso).ok).toBe(true)
  })

  it('una base in prova scaduta non vale', () => {
    const scaduta = { ...base, prove: { menu_tavoli: { scade_il: '2026-10-29T10:00:00Z' } } }
    expect(p.baseMancante(scaduta, 'ordini_cliente', adesso)).toBe('Menù digitale e tavoli')
  })

  it('un modulo senza base richiesta non chiede niente', () => {
    expect(p.baseMancante(base, 'magazzino', adesso)).toBeNull()
  })
})

describe('la prova nella licenza', () => {
  const inProva = { ...base, prove: { magazzino: { dal: '2026-10-30T10:00:00Z', scade_il: '2026-11-13T10:00:00Z' } } }

  it('il modulo in prova si accende, coi suoi moduli di dettaglio, e la licenza dice fino a quando', () => {
    const patch = patchLicenzaPiano(inProva, adesso)
    expect(patch['licenza.moduli']).toMatchObject({ staff: true, magazzino: true, conta: true, fatture: true, scadenzario: true, statistiche: false })
    expect(patch['licenza.prove']).toEqual({ magazzino: '2026-11-13T10:00:00Z' })
  })

  it('sul Free la prova si accende, i moduli comprati no', () => {
    expect(moduliLicenza({ piano: 'free', moduli: ['staff'], prove: ['statistiche'] })).toMatchObject({ staff: false, statistiche: true })
  })

  it('scaduta, non si accende più e la licenza non la nomina', () => {
    const dopo = new Date('2026-11-14T00:00:00Z')
    const patch = patchLicenzaPiano(inProva, dopo)
    expect(patch['licenza.moduli'].magazzino).toBe(false)
    expect(patch['licenza.prove']).toEqual({})
  })

  it('accendere o togliere una prova fa riscrivere la licenza', () => {
    expect(sceltaCambiata(base, inProva)).toBe(true)
    expect(sceltaCambiata(inProva, { ...inProva })).toBe(false)
  })
})

describe('ogni mattina', () => {
  it('si tolgono le prove scadute e quelle dei moduli ormai comprati; le altre restano', () => {
    const cliente = {
      ...base,
      moduli: ['staff', 'statistiche'],
      prove: {
        magazzino: { scade_il: '2026-10-29T00:00:00Z' },
        statistiche: { scade_il: '2026-11-05T00:00:00Z' },
        clienti: { scade_il: '2026-11-05T00:00:00Z' },
      },
    }
    expect(p.proveDaTogliere(cliente, adesso).sort()).toEqual(['magazzino', 'statistiche'])
    expect(p.proveAttive(cliente, adesso).sort()).toEqual(['clienti', 'statistiche'])
  })
})
