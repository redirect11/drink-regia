'use strict'

// LE RIDUZIONI DELLA LICENZA AL TAGLIO DELLA GIORNATA (REQ-FLOTTA-024).
// tana-drink, 01/11/2026: «I passaggi a un piano più piccolo vanno fatti
// fuori dall'orario di servizio (per esempio al taglio della giornata,
// alle 5)»: con le regole che leggono la licenza a ogni scrittura, un
// modulo spento in servizio fa rifiutare le scritture in coda di un tablet
// senza rete. Quello che toglie aspetta il taglio; quello che aggiunge no.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { ORA_DEL_TAGLIO, oraDelTaglio, prossimoTaglio, cosaRiduce, licenzaDaScrivere } = require('../functions/lib/taglio.js')
const { licenzaProtetta } = require('../functions/lib/licenza.js')

const ADESSO = new Date('2026-11-01T15:00:00.000Z')
const cliente = { slug: 'bar-mario', piano: 'completo', moduli: [], terminali: 2, abbonamento: { stato: 'attivo', origine: 'manuale' } }
const completo = licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: ADESSO })
const base = licenzaProtetta({ stato: 'attiva' }, { ...cliente, piano: 'base', terminali: 1 }, { adesso: ADESSO })
const free = licenzaProtetta({ stato: 'attiva' }, { ...cliente, piano: 'free', terminali: 1 }, { adesso: ADESSO })

describe("l'ora del taglio", () => {
  it('quella del locale (settings/bar.business_day_cutoff_hour), o le 5 come in tana-drink', () => {
    expect(ORA_DEL_TAGLIO).toBe(5)
    expect(oraDelTaglio({ business_day_cutoff_hour: 6 })).toBe(6)
    expect(oraDelTaglio({ business_day_cutoff_hour: 0 })).toBe(0)
    for (const strana of [undefined, null, {}, { business_day_cutoff_hour: 24 }, { business_day_cutoff_hour: -1 }, { business_day_cutoff_hour: 'x' }, { business_day_cutoff_hour: 4.5 }]) {
      expect(oraDelTaglio(strana)).toBe(5)
    }
  })

  it("il prossimo taglio è l'ora di Roma, oggi se non è passata, se no domani", () => {
    // 1 novembre, ora solare (UTC+1): le 5 di Roma sono le 4 UTC.
    expect(prossimoTaglio(new Date('2026-11-01T15:00:00Z')).toISOString()).toBe('2026-11-02T04:00:00.000Z')
    expect(prossimoTaglio(new Date('2026-11-01T03:59:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z')
    expect(prossimoTaglio(new Date('2026-11-01T04:00:00Z')).toISOString()).toBe('2026-11-02T04:00:00.000Z')
    // D'estate (UTC+2) sono le 3 UTC; con un taglio alle 6, le 4.
    expect(prossimoTaglio(new Date('2026-07-10T20:00:00Z')).toISOString()).toBe('2026-07-11T03:00:00.000Z')
    expect(prossimoTaglio(new Date('2026-07-10T20:00:00Z'), 6).toISOString()).toBe('2026-07-11T04:00:00.000Z')
    // A cavallo del cambio d'ora (25/10/2026 alle 3 si torna all'ora solare).
    expect(prossimoTaglio(new Date('2026-10-24T20:00:00Z')).toISOString()).toBe('2026-10-25T04:00:00.000Z')
    expect(prossimoTaglio(new Date('2026-03-28T20:00:00Z')).toISOString()).toBe('2026-03-29T03:00:00.000Z')
  })
})

describe('cosa toglie una licenza nuova', () => {
  it('un modulo, un terminale, i limiti del Free; niente se aggiunge soltanto', () => {
    expect(cosaRiduce(completo, base)).toEqual(expect.arrayContaining(['il modulo magazzino', 'i terminali da 2 a 1']))
    expect(cosaRiduce(base, free)).toContain('i limiti del piano free')
    expect(cosaRiduce(base, completo)).toEqual([])
    expect(cosaRiduce(free, base)).toEqual([])
    expect(cosaRiduce(completo, completo)).toEqual([])
    // Il primo documento non riduce niente: non c'era niente.
    expect(cosaRiduce(null, free)).toEqual([])
  })

  it('uno stato che ferma il locale conta solo se lo vuole il pagamento', () => {
    const sospesa = { ...completo, stato: 'sospesa', motivo: 'pagamento non ricevuto' }
    expect(cosaRiduce(completo, sospesa)).toEqual([])
    expect(cosaRiduce(completo, sospesa, { statoAlTaglio: true })).toEqual(['lo stato sospesa'])
    expect(cosaRiduce(sospesa, completo, { statoAlTaglio: true })).toEqual([])
  })
})

describe('la licenza da scrivere adesso', () => {
  it('senza riduzioni, o al taglio, la nuova', () => {
    expect(licenzaDaScrivere(base, completo)).toEqual({ licenza: completo, riduzioni: [] })
    expect(licenzaDaScrivere(completo, free, { subito: true })).toEqual({ licenza: free, riduzioni: [] })
    expect(licenzaDaScrivere(null, free).licenza).toBe(free)
  })

  it('con una riduzione, fino al taglio quella di prima più le aggiunte; il resto è già nuovo', () => {
    const nuova = { ...base, moduli: { ...base.moduli, sumup: true }, aggiornamenti: { modalita: 'a_scelta' }, valida_fino: '2026-12-07T23:59:59.000Z' }
    const prima = { ...completo, moduli: { ...completo.moduli, sumup: false } }
    const { licenza, riduzioni } = licenzaDaScrivere(prima, nuova)
    expect(riduzioni.length).toBeGreaterThan(0)
    expect(licenza.piano).toBe('completo')
    expect(Object.entries(licenza.moduli).every(([, v]) => v === true)).toBe(true)
    expect(licenza.terminali).toBe(2)
    expect(licenza.limiti).toBeNull()
    expect(licenza.aggiornamenti).toEqual({ modalita: 'a_scelta' })
    expect(licenza.valida_fino).toBe('2026-12-07T23:59:59.000Z')
  })

  it('verso il Free: i limiti restano quelli di prima fino al taglio', () => {
    const { licenza } = licenzaDaScrivere(base, free)
    expect(licenza.limiti).toBeNull()
    expect(licenza.piano).toBe('base')
    expect(licenzaDaScrivere(base, free, { subito: true }).licenza.limiti).toEqual(free.limiti)
  })

  it('una sospensione per il pagamento aspetta il taglio; una dell’admin no', () => {
    const sospesa = { ...completo, stato: 'sospesa', motivo: 'pagamento non ricevuto', dal: '2026-11-01T15:00:00.000Z' }
    expect(licenzaDaScrivere(completo, sospesa, { statoAlTaglio: true }).licenza).toMatchObject({ stato: 'attiva', motivo: null, dal: null })
    expect(licenzaDaScrivere(completo, sospesa).licenza.stato).toBe('sospesa')
    expect(licenzaDaScrivere(completo, sospesa, { statoAlTaglio: true, subito: true }).licenza.stato).toBe('sospesa')
  })

  it('riscriverla mentre aspetta dà la stessa licenza (la verifica la riconosce)', () => {
    const tenuta = licenzaDaScrivere(completo, free).licenza
    expect(licenzaDaScrivere(tenuta, free).licenza).toEqual(tenuta)
  })
})
