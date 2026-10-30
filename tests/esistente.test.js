'use strict'

// UN LOCALE CHE ESISTE GIÀ, SENZA PROVISIONING (REQ-AI-003): la Tana entra
// nella regia come cliente esistente, «senza rompere niente» (l'utente,
// 24/10/2026). Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { slugDaNome, datiEsistente, documentiEsistente, scriveLicenza, DatiNonValidi, gestioneEsistente } = require('../functions/lib/esistente.js')
const { daSospendere } = require('../functions/lib/sospensione.js')

const TANA = { nome_locale: 'La Tana del Coniglio', email: 'Titolare@Example.it', progetto: 'tana-drink', url: 'https://tana-drink.web.app/', slug: 'tana-drink' }
const ADESSO = new Date('2026-10-24T10:00:00Z')

describe('i dati del locale esistente', () => {
  it('si puliscono: email minuscola, url senza barra finale, interna di partenza, due terminali', () => {
    expect(datiEsistente(TANA)).toEqual({
      nome: 'La Tana del Coniglio',
      slug: 'tana-drink',
      email: 'titolare@example.it',
      progetto: 'tana-drink',
      url: 'https://tana-drink.web.app',
      terminali: 2,
      interna: true,
      // REQ-FLOTTA-018: di norma pubblica da sé, dalla sua cartella.
      gestione: { aggiornamenti_dalla_regia: false, cliente: 'tana-drink', build: {} },
    })
  })

  it('senza slug lo si ricava dal nome', () => {
    expect(slugDaNome('La Tana del Coniglio')).toBe('la-tana-del-coniglio')
    expect(datiEsistente({ ...TANA, slug: '' }).slug).toBe('la-tana-del-coniglio')
  })

  it('un dato sbagliato si ferma prima di scrivere', () => {
    expect(() => datiEsistente({ ...TANA, slug: 'Tana' })).toThrow(DatiNonValidi)
    expect(() => datiEsistente({ ...TANA, email: 'no' })).toThrow(/Email/)
    expect(() => datiEsistente({ ...TANA, progetto: 'Tana Drink' })).toThrow(/Progetto/)
    expect(() => datiEsistente({ ...TANA, url: 'http://tana-drink.web.app' })).toThrow(/https/)
    expect(() => datiEsistente({ ...TANA, nome_locale: '' })).toThrow(/nome/)
  })
})

describe('i documenti', () => {
  const { cliente, istanza } = documentiEsistente(datiEsistente(TANA), { uid: 'u-tana', adesso: ADESSO })

  it('il cliente ha piano completo e abbonamento attivo, segnato interno ed esistente', () => {
    expect(cliente).toMatchObject({
      uid: 'u-tana',
      slug: 'tana-drink',
      piano: 'completo',
      abbonamento: { stato: 'attivo', origine: 'interna' },
      interna: true,
      esistente: true,
    })
  })

  it('l’istanza è attiva sul progetto che ha già, e non riceve la licenza dalla regia', () => {
    expect(istanza).toMatchObject({
      slug: 'tana-drink',
      progetto: 'tana-drink',
      url: 'https://tana-drink.web.app',
      stato: 'attiva',
      origine: 'esistente',
      interna: true,
      licenza_dalla_regia: false,
    })
    expect(scriveLicenza(istanza)).toBe(false)
    // Le istanze nate dal provisioning non hanno il campo: la regia scrive
    // la loro licenza come ha sempre fatto.
    expect(scriveLicenza({ stato: 'attiva', progetto: 'drinkpos-bar-mario' })).toBe(true)
  })

  it('un locale esistente non interno paga come gli altri', () => {
    const d = datiEsistente({ ...TANA, interna: false })
    expect(documentiEsistente(d, { uid: 'u', adesso: ADESSO }).cliente.abbonamento.origine).toBe('manuale')
  })
})

// REQ-FLOTTA-018: «io farei la A» (l'utente, 30/10/2026). La Tana si
// può affidare alla regia per gli aggiornamenti; la licenza resta sua.
describe('gli aggiornamenti dalla regia', () => {
  it('di norma no: un locale esistente pubblica da sé, con la cartella uguale allo slug', () => {
    const { istanza } = documentiEsistente(datiEsistente(TANA), { uid: 'u', adesso: ADESSO })
    expect(istanza).toMatchObject({ aggiornamenti_dalla_regia: false, cliente: 'tana-drink', build: {} })
  })

  it('affidata alla regia: la sua cartella e le chiavi pubbliche della build, vuote tolte', () => {
    const g = gestioneEsistente({ aggiornamenti_dalla_regia: true, cliente: 'tana', build: { VITE_RECAPTCHA_SITE_KEY: ' 6Lc-abc_123 ', VITE_FIREBASE_VAPID_KEY: '' } }, { slug: 'tana-drink' })
    expect(g).toEqual({ aggiornamenti_dalla_regia: true, cliente: 'tana', build: { VITE_RECAPTCHA_SITE_KEY: '6Lc-abc_123' } })
    // La licenza no: resta del suo progetto finché non lo si collega.
    const { istanza } = documentiEsistente(datiEsistente({ ...TANA, aggiornamenti_dalla_regia: true, cliente: 'tana' }), { uid: 'u', adesso: ADESSO })
    expect(istanza).toMatchObject({ aggiornamenti_dalla_regia: true, cliente: 'tana', licenza_dalla_regia: false })
  })

  it('una chiave che non è della build, un valore strano o una cartella sbagliata si rifiutano', () => {
    expect(() => gestioneEsistente({ build: { VITE_ALTRO: 'x' } }, { slug: 'tana-drink' })).toThrow(DatiNonValidi)
    expect(() => gestioneEsistente({ build: { VITE_RECAPTCHA_SITE_KEY: 'a b' } }, { slug: 'tana-drink' })).toThrow(/non è valido/)
    expect(() => gestioneEsistente({ build: { VITE_RECAPTCHA_SITE_KEY: 'x\nVITE_ALTRO=y' } }, { slug: 'tana-drink' })).toThrow(/non è valido/)
    expect(() => gestioneEsistente({ cliente: '../tana' }, { slug: 'tana-drink' })).toThrow(/Cartella/)
    expect(() => gestioneEsistente({ cliente: 'Tana' }, { slug: 'tana-drink' })).toThrow(/Cartella/)
  })

  it('un progetto della regia non si registra mai come locale', () => {
    expect(() => datiEsistente({ ...TANA, progetto: 'drink-regia' })).toThrow(/della regia/)
    expect(() => datiEsistente({ ...TANA, progetto: 'drink-regia-test' })).toThrow(/della regia/)
  })
})

describe('la sospensione dei morosi', () => {
  it('salta l’installazione interna anche se l’abbonamento risulta disdetto o in sospeso', () => {
    const vecchio = new Date(ADESSO.getTime() - 30 * 86400000).toISOString()
    const clienti = [
      { slug: 'tana-drink', abbonamento: { stato: 'disdetto' } },
      { slug: 'bar-tana', abbonamento: { stato: 'in sospeso', aggiornato_il: vecchio } },
      { slug: 'bar-altro', abbonamento: { stato: 'disdetto' } },
    ]
    const istanze = {
      'tana-drink': { stato: 'attiva', interna: true },
      'bar-tana': { stato: 'attiva', interna: true },
      'bar-altro': { stato: 'attiva' },
    }
    expect(daSospendere(clienti, istanze, { adesso: ADESSO }).map((x) => x.cliente.slug)).toEqual(['bar-altro'])
  })
})
