'use strict'

// L'ADMIN ELIMINA UN CLIENTE SENZA ISTANZA (REQ-FLOTTA-059): chi si è
// registrato e non ha mai attivato, o la cui istanza è già stata eliminata,
// sparisce dalla regia con l'account. Un'istanza viva o un'attivazione in
// corso lo impediscono.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const { percheNonEliminabile, documentiDaCancellare } = createRequire(import.meta.url)('../functions/lib/eliminazione-cliente.js')

describe('percheNonEliminabile', () => {
  it('senza istanza e senza richiesta si può', () => {
    expect(percheNonEliminabile({})).toBeNull()
    expect(percheNonEliminabile({ istanza: null, richiesta: null })).toBeNull()
  })

  it('con un’istanza che ha un progetto vivo no: prima si chiude e si elimina quella', () => {
    expect(percheNonEliminabile({ istanza: { progetto: 'drinkpos-bar', stato: 'attiva' } })).toMatch(/istanza/)
    expect(percheNonEliminabile({ istanza: { progetto: 'drinkpos-bar', stato: 'errore' } })).toMatch(/istanza/)
  })

  it('con l’istanza già eliminata col suo progetto si può', () => {
    expect(percheNonEliminabile({ istanza: { progetto: 'drinkpos-bar', stato: 'eliminata' } })).toBeNull()
  })

  it('con un’attivazione in coda o in corso si aspetta; una rifiutata o in errore non blocca', () => {
    expect(percheNonEliminabile({ richiesta: { stato: 'in coda' } })).toMatch(/attivazione in corso/)
    expect(percheNonEliminabile({ richiesta: { stato: 'in corso' } })).toMatch(/attivazione in corso/)
    expect(percheNonEliminabile({ richiesta: { stato: 'errore' } })).toBeNull()
    expect(percheNonEliminabile({ richiesta: { stato: 'da approvare' } })).toBeNull()
  })
})

describe('documentiDaCancellare', () => {
  it('il cliente, la richiesta, i contatti (anche quello del tema) e l’istanza eliminata', () => {
    expect(documentiDaCancellare('u1', 'bar-mario')).toEqual(['clienti/u1', 'richieste/bar-mario', 'contatti/u1', 'contatti/u1_tema', 'istanze/bar-mario'])
  })
})
