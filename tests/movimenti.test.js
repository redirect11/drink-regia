'use strict'

// IL LIBRO DEI MOVIMENTI (REQ-FLOTTA-041): ogni incasso una riga, con l'id
// della fattura o della sessione, l'imponibile a parte dall'IVA. L'utente,
// 07/11/2026: «una dashboard che mi mostra il guadagno». Logica pura; le
// scritture stanno in functions/index.js.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { movimentoDaFattura, movimentoDaRicarica, movimentoManuale, movimentoValido, TIPI } = require('../functions/lib/movimenti.js')

const ADESSO = new Date('2026-11-07T10:00:00.000Z')

describe('una fattura di Stripe pagata', () => {
  const fattura = {
    id: 'in_1',
    created: 1793613600,
    status_transitions: { paid_at: 1793617200 },
    amount_paid: 13993, // 82 + 32,70 = 114,70 + 22% = 139,93
    total: 13993,
    subtotal: 11470,
    tax: 2523,
    lines: {
      data: [
        { description: 'Attivazione', period: { start: 1793613600, end: 1793613600 } },
        { description: 'Piano Base', period: { start: 1793613600, end: 1796205600 } },
      ],
    },
  }

  it('diventa un movimento «abbonamento» con imponibile, IVA e totale, e il periodo coperto', () => {
    const m = movimentoDaFattura(fattura, { uid: 'u1', slug: 'bar-prova' })
    expect(m).toMatchObject({ id: 'fattura-in_1', tipo: 'abbonamento', uid: 'u1', slug: 'bar-prova', origine: 'stripe', riferimento: 'in_1', importo: 114.7, iva: 25.23, totale: 139.93 })
    expect(m.il).toBe(new Date(1793617200 * 1000).toISOString())
    expect(m.periodo).toEqual({ dal: new Date(1793613600 * 1000).toISOString(), al: new Date(1796205600 * 1000).toISOString() })
    expect(m.descrizione).toBe('Attivazione; Piano Base')
    expect(movimentoValido(m)).toBe(true)
  })

  it('l’imponibile si ricava da quello che è entrato: con un coupon il subtotal mente', () => {
    // Fondatori: 25 € invece di 32,70; Stripe mette nel subtotal il listino.
    const m = movimentoDaFattura({ ...fattura, amount_paid: 3050, tax: 550, subtotal: 3270 }, { uid: 'u1' })
    expect(m.importo).toBe(25)
    expect(m.totale).toBe(30.5)
  })

  it('senza importo (uno sconto al 100%, una prova) o senza cliente non c’è niente da registrare', () => {
    expect(movimentoDaFattura({ ...fattura, amount_paid: 0 }, { uid: 'u1' })).toBeNull()
    expect(movimentoDaFattura(fattura, {})).toBeNull()
    expect(movimentoDaFattura(null, { uid: 'u1' })).toBeNull()
  })

  it('senza la data del pagamento vale quella della fattura, e senza quella adesso', () => {
    expect(movimentoDaFattura({ ...fattura, status_transitions: {} }, { uid: 'u1' }).il).toBe(new Date(1793613600 * 1000).toISOString())
    expect(movimentoDaFattura({ ...fattura, status_transitions: {}, created: null }, { uid: 'u1', adesso: ADESSO }).il).toBe(ADESSO.toISOString())
  })
})

describe('una ricarica del credito AI pagata', () => {
  const ricarica = { slug: 'bar-prova', uid: 'u1', sessione: 'cs_1', pacchetto: 'ai-25', importo_microeuro: 25_000_000 }

  it('è un movimento «ricarica_ai»: l’imponibile è il credito, l’IVA la differenza col totale', () => {
    const m = movimentoDaRicarica({ created: 1793613600, amount_total: 3050 }, ricarica)
    expect(m).toMatchObject({ id: 'ricarica-cs_1', tipo: 'ricarica_ai', importo: 25, iva: 5.5, totale: 30.5, origine: 'stripe', slug: 'bar-prova', descrizione: 'Credito AI ai-25' })
    expect(movimentoValido(m)).toBe(true)
  })

  it('senza sessione o senza credito non si registra', () => {
    expect(movimentoDaRicarica({}, { ...ricarica, sessione: null })).toBeNull()
    expect(movimentoDaRicarica({}, { ...ricarica, importo_microeuro: 0 })).toBeNull()
    expect(movimentoDaRicarica({}, null)).toBeNull()
  })
})

describe('un pagamento registrato dall’admin', () => {
  it('l’importo è IVA esclusa, scritto anche con la virgola; l’IVA si aggiunge col listino', () => {
    const m = movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: '32,70', iva: 22, descrizione: 'Bonifico di novembre', da: 'admin@x.it', adesso: ADESSO })
    expect(m).toMatchObject({ tipo: 'manuale', origine: 'manuale', importo: 32.7, iva: 7.19, totale: 39.89, da: 'admin@x.it', descrizione: 'Bonifico di novembre' })
    expect(m.id).toBe(`manuale-${ADESSO.getTime()}-bar-prova`)
    expect(m.il).toBe(ADESSO.toISOString())
    expect(movimentoValido(m)).toBe(true)
  })

  it('un credito AI accreditato a mano è una ricarica, col riferimento dato', () => {
    const m = movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: 10, tipo: 'ricarica_ai', riferimento: 'ricarica-manuale-1' })
    expect(m).toMatchObject({ id: 'ricarica-manuale-1', tipo: 'ricarica_ai', riferimento: 'ricarica-manuale-1', importo: 10 })
  })

  it('un importo che non va, o un cliente sconosciuto, è un errore detto', () => {
    expect(movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: 'x' }).errore).toMatch(/Importo in euro/)
    expect(movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: -3 }).errore).toMatch(/Importo in euro/)
    expect(movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: 100001 }).errore).toMatch(/Importo in euro/)
    expect(movimentoManuale({ uid: null, slug: 'bar-prova', importo: 10 }).errore).toMatch(/Cliente sconosciuto/)
    expect(movimentoManuale({ uid: 'u1', slug: 'x', importo: 10 }).errore).toMatch(/Cliente sconosciuto/)
    expect(movimentoValido({ errore: 'x' })).toBe(false)
  })

  it('un tipo sconosciuto diventa «manuale»; i tipi sono tre', () => {
    expect(movimentoManuale({ uid: 'u1', slug: 'bar-prova', importo: 10, tipo: 'regalo' }).tipo).toBe('manuale')
    expect(TIPI).toEqual(['abbonamento', 'ricarica_ai', 'manuale'])
  })
})

// Dove le Functions scrivono il libro: il webhook (fattura pagata, ricarica
// pagata), il pagamento registrato dall'admin, il credito accreditato a
// mano. Un omaggio no. E le regole lo lasciano leggere solo all'admin.
describe('le scritture e le regole', () => {
  const index = readFileSync('functions/index.js', 'utf8')
  const regole = readFileSync('firestore.rules', 'utf8')

  it('il webhook registra la fattura pagata e la ricarica accreditata; l’admin il bonifico e il credito a mano', () => {
    expect(index).toMatch(/evento\.type === 'invoice\.paid'[\s\S]*movimentoDaFattura\(evento\.data\?\.object, \{ uid, slug: cli\?\.slug \}\)/)
    expect(index).toMatch(/esito === 'accreditata'\) await scriviMovimento\(movimenti\.movimentoDaRicarica/)
    expect(index).toMatch(/exports\.registraPagamento[\s\S]*movimentoManuale\(\{ uid: doc\.id[\s\S]*if \(incasso\) await scriviMovimento\(incasso\)/)
    expect(index).toMatch(/azione === 'ricarica'[\s\S]*tipo: 'ricarica_ai'[\s\S]*azione === 'omaggio'/)
    // L'omaggio non passa da scriviMovimento.
    const omaggio = index.slice(index.indexOf("azione === 'omaggio'"), index.indexOf("azione === 'tetto'"))
    expect(omaggio).not.toMatch(/scriviMovimento/)
  })

  it('movimenti/ e traffico/ li legge solo l’admin e non li scrive nessun client', () => {
    expect(regole).toMatch(/match \/movimenti\/\{id\} \{\s*allow read: if admin\(\);\s*allow write: if false;/)
    expect(regole).toMatch(/match \/traffico\/\{giorno\} \{\s*allow read: if admin\(\);\s*allow write: if false;/)
  })
})
