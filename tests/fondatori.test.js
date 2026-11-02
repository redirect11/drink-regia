'use strict'

// L'OFFERTA FONDATORI (REQ-FLOTTA-031): i primi 20 locali su un piano
// coperto pagano il prezzo Fondatori per 12 mesi, poi il listino. Il posto
// si prenota alla sessione e si assegna al pagamento; mai due volte lo
// stesso numero, mai oltre i posti. Logica pura, provata senza Firestore:
// la transazione in index.js legge il documento, chiama queste funzioni e
// scrive quello che restituiscono.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const f = require('../functions/lib/fondatori.js')

const ADESSO = new Date('2026-11-02T10:00:00Z')
const tra = (min) => new Date(ADESSO.getTime() + min * 60 * 1000)

// Il documento dopo n titolari che hanno pagato da Fondatori.
function conAssegnati(n) {
  let doc = {}
  for (let i = 1; i <= n; i++) {
    doc = f.prenota(doc, `u${i}`, tra(35), ADESSO).doc
    doc = f.conferma(doc, `u${i}`, ADESSO).doc
  }
  return doc
}

describe('il piano coperto', () => {
  it('oggi solo il Base', () => {
    expect(f.coperto('base')).toBe(true)
    expect(f.coperto('completo')).toBe(false)
    expect(f.coperto('free')).toBe(false)
    expect(f.coperto('oro')).toBe(false)
    expect([f.POSTI, f.MESI]).toEqual([20, 12])
  })
})

describe('prenota', () => {
  it('su un documento che non c’è ancora: il primo posto, con la scadenza della sessione più il margine', () => {
    const p = f.prenota(undefined, 'u1', tra(35), ADESSO)
    expect(p.esito).toBe('prenotato')
    expect(p.doc.prenotazioni.u1.scade_il).toBe(new Date(tra(35).getTime() + f.MARGINE_MS).toISOString())
    expect(f.postiLiberi(p.doc, ADESSO)).toBe(19)
  })

  it('le prenotazioni in corso contano: con 20 sessioni aperte la ventunesima paga il listino', () => {
    let doc = {}
    for (let i = 1; i <= 20; i++) doc = f.prenota(doc, `u${i}`, tra(35), ADESSO).doc
    expect(f.postiLiberi(doc, ADESSO)).toBe(0)
    expect(f.prenota(doc, 'u21', tra(35), ADESSO).esito).toBe('esauriti')
  })

  it('una prenotazione scaduta non conta e si toglie dal documento', () => {
    const vecchia = f.prenota({}, 'u1', tra(35), ADESSO).doc
    const dopo = new Date(tra(35).getTime() + f.MARGINE_MS + 1000)
    expect(f.postiLiberi(vecchia, dopo)).toBe(20)
    const p = f.prenota(vecchia, 'u2', new Date(dopo.getTime() + 35 * 60000), dopo)
    expect(Object.keys(p.doc.prenotazioni)).toEqual(['u2'])
  })

  it('lo stesso titolare con una seconda sessione rinnova la sua prenotazione, non ne prende due', () => {
    let doc = {}
    for (let i = 1; i <= 19; i++) doc = f.prenota(doc, `u${i}`, tra(35), ADESSO).doc
    doc = f.prenota(doc, 'u20', tra(35), ADESSO).doc
    const di_nuovo = f.prenota(doc, 'u20', tra(50), tra(15))
    expect(di_nuovo.esito).toBe('prenotato')
    expect(Object.keys(di_nuovo.doc.prenotazioni)).toHaveLength(20)
  })

  it('chi è già Fondatore non prenota di nuovo', () => {
    expect(f.prenota(conAssegnati(1), 'u1', tra(35), ADESSO).esito).toBe('gia_fondatore')
  })

  it('non cambia il documento ricevuto', () => {
    const doc = conAssegnati(1)
    const copia = JSON.parse(JSON.stringify(doc))
    f.prenota(doc, 'u2', tra(35), ADESSO)
    expect(doc).toEqual(copia)
  })
})

describe('conferma', () => {
  it('il pagamento dà il numero, e il segno sul cliente dura 12 mesi', () => {
    const doc = f.prenota({}, 'u1', tra(35), ADESSO).doc
    const c = f.conferma(doc, 'u1', tra(5))
    expect(c.esito).toBe('assegnato')
    expect(c.fondatore).toEqual({ numero: 1, dal: tra(5).toISOString(), fino_al: '2027-11-02T10:05:00.000Z' })
    expect(c.doc.prenotazioni.u1).toBeUndefined()
    expect(c.doc.assegnati.u1).toEqual({ numero: 1, dal: tra(5).toISOString() })
  })

  it('i numeri vanno da 1 a 20, mai due volte lo stesso', () => {
    const doc = conAssegnati(20)
    const numeri = Object.values(doc.assegnati).map((a) => a.numero).sort((a, b) => a - b)
    expect(numeri).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(f.postiLiberi(doc, ADESSO)).toBe(0)
    expect(f.prenota(doc, 'u21', tra(35), ADESSO).esito).toBe('esauriti')
  })

  it('il webhook ripetuto ritrova lo stesso numero', () => {
    const doc = conAssegnati(3)
    const c = f.conferma(doc, 'u2', tra(60))
    expect(c.esito).toBe('gia_assegnato')
    expect(c.fondatore.numero).toBe(2)
    expect(c.doc).toEqual(f.statoPulito(doc))
  })

  it('una prenotazione scaduta si conferma ancora se c’è posto', () => {
    const doc = f.prenota({}, 'u1', tra(35), ADESSO).doc
    expect(f.conferma(doc, 'u1', tra(60 * 24)).esito).toBe('assegnato')
  })

  it('mai un ventunesimo: prenotazione scaduta e posti presi da altri, il cliente va verificato', () => {
    let doc = f.prenota({}, 'tardi', tra(35), ADESSO).doc
    const dopo = new Date(tra(35).getTime() + f.MARGINE_MS + 1000)
    for (let i = 1; i <= 20; i++) {
      doc = f.prenota(doc, `u${i}`, new Date(dopo.getTime() + 35 * 60000), dopo).doc
      doc = f.conferma(doc, `u${i}`, dopo).doc
    }
    const c = f.conferma(doc, 'tardi', dopo)
    expect(c.esito).toBe('esauriti')
    expect(c.fondatore).toBeNull()
    expect(Object.keys(c.doc.assegnati)).toHaveLength(20)
  })
})

describe('rilascia', () => {
  it('la sessione scaduta libera il posto prenotato, non quello assegnato', () => {
    const doc = f.prenota(conAssegnati(1), 'u2', tra(35), ADESSO).doc
    const via = f.rilascia(doc, 'u2', tra(35))
    expect(via.prenotazioni.u2).toBeUndefined()
    expect(f.rilascia(via, 'u1').assegnati.u1.numero).toBe(1)
    expect(f.rilascia(undefined, 'u1')).toEqual({ assegnati: {}, prenotazioni: {} })
  })

  it('la scadenza di una sessione vecchia non libera la prenotazione di quella nuova', () => {
    let doc = f.prenota({}, 'u1', tra(35), ADESSO).doc
    doc = f.prenota(doc, 'u1', tra(55), tra(20)).doc
    expect(f.rilascia(doc, 'u1', tra(35)).prenotazioni.u1).toBeDefined()
    expect(f.rilascia(doc, 'u1', tra(55)).prenotazioni.u1).toBeUndefined()
    // Senza scadenza (la sessione non è nata) si libera comunque.
    expect(f.rilascia(doc, 'u1').prenotazioni.u1).toBeUndefined()
  })
})

describe('piuMesi', () => {
  it('lo stesso giorno n mesi dopo, senza sconfinare', () => {
    expect(f.piuMesi('2026-11-02T10:00:00.000Z', 12).toISOString()).toBe('2027-11-02T10:00:00.000Z')
    expect(f.piuMesi('2028-02-29T08:00:00.000Z', 12).toISOString()).toBe('2029-02-28T08:00:00.000Z')
    expect(f.piuMesi('2026-01-31T08:00:00.000Z', 1).toISOString()).toBe('2026-02-28T08:00:00.000Z')
  })
})

describe('couponFondatori', () => {
  it('mensile: la differenza col listino, per 12 fatture, poi Stripe torna al listino da sé', () => {
    expect(f.couponFondatori('base', 'mese')).toEqual({
      id: 'fondatori-base-mese-770',
      amount_off: 770,
      currency: 'eur',
      duration: 'repeating',
      duration_in_months: 12,
      name: 'Fondatori: 25 € per 12 mesi',
      metadata: { fondatori: '1', piano: 'base', intervallo: 'mese' },
    })
  })

  it('annuale: dieci mensilità di differenza, sulla prima fattura annuale soltanto', () => {
    const c = f.couponFondatori('base', 'anno')
    expect(c).toMatchObject({ id: 'fondatori-base-anno-7700', amount_off: 7700, duration: 'once' })
    expect(c.duration_in_months).toBeUndefined()
    // 10 × 32,70 − 77 = 250 = 10 × 25.
    expect(32700 - c.amount_off).toBe(25000)
  })

  it('niente coupon per i piani non coperti; il nome resta entro i 40 caratteri di Stripe', () => {
    expect(f.couponFondatori('completo', 'mese')).toBeNull()
    expect(f.couponFondatori('oro')).toBeNull()
    expect(f.couponFondatori('base').name.length).toBeLessThanOrEqual(40)
  })
})

describe('scontoDaTogliere', () => {
  it('un Fondatore che passa a un piano non coperto perde lo sconto; sul Base lo tiene', () => {
    expect(f.scontoDaTogliere({ fondatore: '1' }, 'completo')).toBe(true)
    expect(f.scontoDaTogliere({ fondatore: '1' }, 'base')).toBe(false)
    expect(f.scontoDaTogliere({}, 'completo')).toBe(false)
    expect(f.scontoDaTogliere(undefined, 'completo')).toBe(false)
  })
})
