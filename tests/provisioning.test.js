'use strict'

// L'ATTIVAZIONE DI UN'ISTANZA (REQ-FLOTTA-006): dalla richiesta al lancio
// del workflow, e dall'esito ai documenti. Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, documentoIstanza, bearerValido } = require('../functions/lib/provisioning.js')

const richiesta = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff', 'magazzino'], stato: 'in coda' }
const cliente = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff'], terminali: 1, abbonamento: { stato: 'attivo' } }
const ADESSO = new Date('2026-10-22T10:00:00Z')

// Audit del 22/10/2026, C2: la richiesta la scrive il server, dal documento
// del cliente, e solo con l'abbonamento attivo.
describe('preparaRichiesta', () => {
  it('la richiesta nasce dal cliente, in coda, con piano e moduli puliti', () => {
    const esito = preparaRichiesta(cliente, { emailVerificata: true, adesso: ADESSO })
    expect(esito.ok).toBe(true)
    expect(esito.richiesta).toEqual({
      uid: 'u1',
      slug: 'bar-mario',
      nome_locale: 'Bar Mario',
      piano: 'base',
      moduli: ['staff'],
      stato: 'in coda',
      chiesta_il: '2026-10-22T10:00:00.000Z',
      chiesta_da: 'titolare',
    })
  })

  it('un modulo che non è nel listino, o già incluso nel piano, non passa', () => {
    const completo = { ...cliente, piano: 'completo', moduli: ['staff', 'inventato'] }
    expect(preparaRichiesta(completo, { emailVerificata: true }).richiesta.moduli).toEqual([])
  })

  // REQ-FLOTTA-011: col deploy automatico spento la richiesta aspetta l'admin.
  it('col deploy automatico spento la richiesta nasce «da approvare»', () => {
    expect(preparaRichiesta(cliente, { emailVerificata: true, automatico: false }).richiesta.stato).toBe('da approvare')
  })

  it('senza email verificata, senza piano o senza abbonamento attivo non si attiva', () => {
    expect(preparaRichiesta(cliente, { emailVerificata: false })).toEqual({ ok: false, perche: expect.stringMatching(/email/), richiesta: null })
    expect(preparaRichiesta({ ...cliente, piano: null }, { emailVerificata: true }).perche).toMatch(/piano/)
    expect(preparaRichiesta({ ...cliente, abbonamento: { stato: 'sospeso' } }, { emailVerificata: true }).perche).toMatch(/abbonamento/)
    expect(preparaRichiesta({ ...cliente, abbonamento: null }, { emailVerificata: true }).ok).toBe(false)
    expect(preparaRichiesta(null, { emailVerificata: true }).ok).toBe(false)
    expect(preparaRichiesta({ ...cliente, slug: 'x' }, { emailVerificata: true }).ok).toBe(false)
  })

  it('non si chiede due volte: da approvare, in coda, in corso o attiva fermano; dopo un errore si riprova', () => {
    for (const stato of ['da approvare', 'in coda', 'in corso']) {
      expect(preparaRichiesta(cliente, { emailVerificata: true, richiesta: { stato } }).ok).toBe(false)
    }
    expect(preparaRichiesta(cliente, { emailVerificata: true, istanza: { stato: 'attiva' } }).ok).toBe(false)
    expect(preparaRichiesta(cliente, { emailVerificata: true, istanza: { stato: 'errore' }, richiesta: { stato: 'errore' } }).ok).toBe(true)
  })
})

describe('richiestaCoerente', () => {
  it('parte solo la richiesta del cliente con quello slug e l’abbonamento attivo', () => {
    expect(richiestaCoerente(richiesta, cliente).ok).toBe(true)
    expect(richiestaCoerente(richiesta, { ...cliente, slug: 'bar-luigi' }).perche).toMatch(/slug/)
    expect(richiestaCoerente(richiesta, { ...cliente, uid: 'u2' }).perche).toMatch(/titolare/)
    expect(richiestaCoerente(richiesta, { ...cliente, abbonamento: { stato: 'scaduto' } }).perche).toMatch(/bbonamento/)
    expect(richiestaCoerente(richiesta, null).ok).toBe(false)
    expect(richiestaCoerente({ ...richiesta, slug: 'X' }, cliente).ok).toBe(false)
  })
})

describe('dispatchPayload', () => {
  it('è il corpo del workflow_dispatch, con gli input come stringhe', () => {
    expect(dispatchPayload(richiesta, { ref: 'develop' })).toEqual({
      ref: 'develop',
      inputs: { slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: 'staff,magazzino', uid: 'u1', ref: 'develop' },
    })
  })

  it('senza uno slug valido non parte niente', () => {
    expect(() => dispatchPayload({ slug: 'X' })).toThrow(/slug/)
  })
})

describe('dispatchAggiornamento', () => {
  it('lancia aggiorna-istanza.yml con lo slug e la versione dell’app', () => {
    expect(dispatchAggiornamento({ slug: 'bar-mario', nome_locale: 'Bar Mario' }, { ref: 'v1.10.0' })).toEqual({
      ref: 'v1.10.0',
      inputs: { slug: 'bar-mario', nome_locale: 'Bar Mario', ref: 'v1.10.0' },
    })
    expect(() => dispatchAggiornamento({ slug: 'x' })).toThrow(/slug/)
  })
})

describe('daLanciare', () => {
  it('una richiesta nuova in coda parte; in corso o attiva no', () => {
    expect(daLanciare(null, richiesta)).toBe(true)
    expect(daLanciare(null, { ...richiesta, stato: 'in corso' })).toBe(false)
  })

  // REQ-FLOTTA-011: «da approvare» non parte; l'autorizzazione (→ in coda) sì.
  it('una richiesta da approvare non parte finché l’admin non la autorizza', () => {
    const daApprovare = { ...richiesta, stato: 'da approvare' }
    expect(daLanciare(null, daApprovare)).toBe(false)
    expect(daLanciare(daApprovare, { ...daApprovare, stato: 'in coda', autorizzata_il: 'x' })).toBe(true)
  })

  it('un rilancio dell’admin parte; un altro aggiornamento no', () => {
    const inErrore = { ...richiesta, stato: 'errore' }
    expect(daLanciare(inErrore, { ...richiesta, rilanciata_il: 'x' })).toBe(true)
    const inCoda = { ...richiesta, rilanciata_il: 'x' }
    expect(daLanciare(inCoda, { ...inCoda, nota: 'ritoccata' })).toBe(false)
    expect(daLanciare(inCoda, { ...inCoda, rilanciata_il: 'y' })).toBe(true)
  })
})

describe('esitoValido e documentoIstanza', () => {
  it('accetta solo slug e stati noti, e riempie il documento senza perdere quello che c’era', () => {
    expect(esitoValido({ slug: 'bar-mario', stato: 'boh' })).toBeNull()
    expect(esitoValido(null)).toBeNull()
    const esito = esitoValido({ slug: 'bar-mario', stato: 'attiva', url: 'https://bar-mario.drink.app', versione: 'v1.10.0', ambiente: 'produzione', ref: 'main' })
    const doc = documentoIstanza(esito, { uid: 'u1', progetto: 'drinkpos-bar-mario' }, new Date('2026-10-22T10:00:00Z'))
    expect(doc).toEqual({
      uid: 'u1',
      slug: 'bar-mario',
      stato: 'attiva',
      url: 'https://bar-mario.drink.app',
      progetto: 'drinkpos-bar-mario',
      versione: 'v1.10.0',
      ambiente: 'produzione',
      ref: 'main',
      errore: null,
      aggiornata_il: '2026-10-22T10:00:00.000Z',
    })
  })

  it('un errore porta il suo messaggio, o uno di riserva', () => {
    expect(esitoValido({ slug: 'bar-mario', stato: 'errore' }).errore).toBe('Attivazione fallita')
    expect(esitoValido({ slug: 'bar-mario', stato: 'errore', errore: 'quota' }).errore).toBe('quota')
  })
})

describe('bearerValido', () => {
  it('vuole esattamente il segreto', () => {
    expect(bearerValido('Bearer abc', 'abc')).toBe(true)
    expect(bearerValido('Bearer abd', 'abc')).toBe(false)
    expect(bearerValido('abc', 'abc')).toBe(false)
    expect(bearerValido('Bearer abc', '')).toBe(false)
  })
})
