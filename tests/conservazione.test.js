'use strict'

// LA CONSERVAZIONE DEI DATI DI UN LOCALE FERMO (REQ-FLOTTA-025). L'utente,
// 02/11/2026: chi non paga, se l'opzione è accesa, diventa Free senza
// perdere i dati; altrimenti «dobbiamo cancellare i suoi dati entro un tot
// e avvisarlo quando stiamo per cancellarli». Decisioni: 90 giorni; al Free
// niente; avvisi subito, a 7 giorni e il giorno prima; per email, nella
// dashboard e nell'app.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const c = require('../functions/lib/conservazione.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const attiva = { stato: 'attiva', progetto: 'drinkpos-bar-mario', licenza_stato: 'sospesa' }
const programmata = (extra = {}) => ({ ...attiva, eliminazione: { ...c.conservazioneChiesta({ motivo: 'pagamento non ricevuto', adesso: ADESSO }), ...extra } })

describe('quando si conservano i dati', () => {
  it('un locale fermo della flotta sì; la Tana, le interne, gli esistenti no', () => {
    expect(c.daConservare(attiva)).toBe(true)
    expect(c.daConservare({ ...attiva, interna: true })).toBe(false)
    expect(c.daConservare({ ...attiva, origine: 'esistente' })).toBe(false)
    expect(c.daConservare({ ...attiva, progetto: null })).toBe(false)
    expect(c.daConservare({ ...attiva, stato: 'eliminata' })).toBe(false)
  })

  it('una cancellazione già programmata o partita resta quella: non si sposta', () => {
    for (const stato of ['programmata', 'in coda', 'in corso']) expect(c.daConservare({ ...attiva, eliminazione: { stato } })).toBe(false)
    expect(c.daConservare({ ...attiva, eliminazione: { stato: 'annullata' } })).toBe(true)
  })

  it('90 giorni da adesso, un’eliminazione programmata come le altre', () => {
    expect(c.GIORNI_CONSERVAZIONE).toBe(90)
    expect(c.conservazioneChiesta({ motivo: 'abbonamento disdetto', adesso: ADESSO })).toEqual({
      stato: 'programmata',
      quando: '2027-01-31T10:00:00.000Z',
      subito: false,
      richiedente: 'conservazione',
      motivo: 'abbonamento disdetto',
      chiesta_il: ADESSO.toISOString(),
      chiesta_da: 'regia',
      errore: null,
      avvisi: [],
    })
  })

  it('tornare a lavorare annulla la conservazione, non le cancellazioni del titolare o dell’admin', () => {
    expect(c.daAnnullare(programmata())).toBe(true)
    expect(c.daAnnullare(programmata({ richiedente: 'titolare' }))).toBe(false)
    expect(c.daAnnullare(programmata({ richiedente: 'admin' }))).toBe(false)
    expect(c.daAnnullare(programmata({ stato: 'annullata' }))).toBe(false)
    expect(c.daAnnullare(attiva)).toBe(false)
  })
})

describe('gli avvisi', () => {
  it('a 7 giorni e il giorno prima; quelli già passati no', () => {
    expect(c.orariAvvisi('2027-01-31T10:00:00.000Z', ADESSO)).toEqual([
      { giorni: 7, il: '2027-01-24T10:00:00.000Z' },
      { giorni: 1, il: '2027-01-30T10:00:00.000Z' },
    ])
    expect(c.orariAvvisi('2026-11-05T10:00:00.000Z', ADESSO)).toEqual([{ giorni: 1, il: '2026-11-04T10:00:00.000Z' }])
  })

  it('un compito riconosce il suo avviso; con la cancellazione spostata o annullata, niente', () => {
    const ist = programmata()
    expect(c.avvisoDelCompito(ist, '2027-01-24T10:00:00.000Z')).toBe(7)
    expect(c.avvisoDelCompito(ist, '2027-01-30T10:00:00.000Z')).toBe(1)
    expect(c.avvisoDelCompito(ist, '2027-01-25T10:00:00.000Z')).toBeNull()
    expect(c.avvisoDelCompito(programmata({ stato: 'annullata' }), '2027-01-24T10:00:00.000Z')).toBeNull()
  })

  it('un avviso già mandato non si rimanda', () => {
    const ist = programmata({ avvisi: [{ chiave: '2027-01-31T10:00:00.000Z:7' }] })
    expect(c.giaAvvisato(ist, '2027-01-31T10:00:00.000Z:7')).toBe(true)
    expect(c.giaAvvisato(ist, '2027-01-31T10:00:00.000Z:1')).toBe(false)
  })

  it('l’email dice la data, il backup per 180 giorni e come evitarla', () => {
    const titolare = { nome_locale: 'Bar Mario', email: 'mario@example.it' }
    const primo = c.emailAvviso(titolare, programmata())
    expect(primo.to).toBe('mario@example.it')
    expect(primo.message.subject).toBe('Bar Mario: i dati del locale verranno cancellati il 31 gennaio 2027')
    expect(primo.message.text).toMatch(/il locale è fermo, il 31 gennaio 2027 cancelleremo/)
    expect(primo.message.text).toMatch(/180 giorni/)
    expect(primo.message.text).toMatch(/riattivare l'abbonamento/)
    expect(c.emailAvviso(titolare, programmata(), 7).message.subject).toMatch(/fra 7 giorni$/)
    expect(c.emailAvviso(titolare, programmata(), 1).message.subject).toMatch(/domani$/)
    // Chiusura chiesta dal titolare: la può annullare lui.
    expect(c.emailAvviso(titolare, programmata({ richiedente: 'titolare' })).message.text).toMatch(/annullare la chiusura/)
    expect(c.emailAvviso(titolare, programmata({ richiedente: 'admin' })).message.text).toMatch(/il locale è stato chiuso/)
    // Senza email (un cliente senza indirizzo) non si scrive niente.
    expect(c.emailAvviso({ nome_locale: 'Bar Mario' }, programmata())).toBeNull()
  })
})

describe('quello che sa l’app', () => {
  it('la data e chi ha voluto la cancellazione, solo se programmata', () => {
    expect(c.cancellazioneDellaLicenza(programmata())).toEqual({ il: '2027-01-31T10:00:00.000Z', richiedente: 'conservazione' })
    expect(c.cancellazioneDellaLicenza(programmata({ richiedente: undefined }))).toEqual({ il: '2027-01-31T10:00:00.000Z', richiedente: 'admin' })
    expect(c.cancellazioneDellaLicenza(programmata({ stato: 'in corso' }))).toBeNull()
    expect(c.cancellazioneDellaLicenza(attiva)).toBeNull()
  })
})
