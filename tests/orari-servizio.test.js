'use strict'

// GLI ORARI DI SERVIZIO DEL LOCALE E LA SOSPENSIONE PER PAGAMENTO FUORI
// SERVIZIO (REQ-FLOTTA-095). Daniele, 13/11/2026: «quando un cliente si
// registra deve specificare gli orari di servizio dell'esercizio. Decidiamo
// la sospensione per Stripe fuori dall'orario di servizio quindi di sicuro
// non subito. In base all'orario in cui gli viene attivato l'abbonamento fa
// fede quell'orario [...]». Qui la logica pura: gli orari (uno per giorno,
// anche oltre la mezzanotte, o «chiuso»), i 7 giorni in cui il titolare li
// corregge da solo, la richiesta di cambio col motivo che l'admin approva o
// rifiuta, e il momento della sospensione per pagamento.
//
// Tutti gli istanti sono UTC; Roma è UTC+1 d'inverno e UTC+2 d'estate. Nel
// 2026 l'ora legale finisce domenica 25/10 (alle 3 si torna alle 2) e
// comincia domenica 29/03 (alle 2 si va alle 3). Il 16/11/2026 è lunedì,
// il 18/11/2026 mercoledì.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as sito from '../src/lib/orari.js'

const require = createRequire(import.meta.url)
// Il modulo si carica dentro ogni test: finché non c'è, ogni test fallisce
// da solo e dice quale criterio manca, invece di un unico errore del file.
const orari = () => require('../functions/lib/orari-servizio.js')
const { prossimoTaglio } = require('../functions/lib/taglio.js')
const { licenzaProtetta } = require('../functions/lib/licenza.js')
const registrazione = require('../functions/lib/registrazione.js')

const aperto = (apre, chiude) => ({ apre, chiude })
const CHIUSO = { chiuso: true }
// Un locale di sera: lunedì chiuso, gli altri giorni dalle 18 alle 2 di notte.
const SERA = {
  lun: CHIUSO,
  mar: aperto('18:00', '02:00'),
  mer: aperto('18:00', '02:00'),
  gio: aperto('18:00', '02:00'),
  ven: aperto('18:00', '02:00'),
  sab: aperto('18:00', '02:00'),
  dom: aperto('18:00', '02:00'),
}
const tutti = (giorno) => Object.fromEntries(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map((g) => [g, giorno]))
const iso = (d) => new Date(d).toISOString()

describe('gli orari di servizio: uno per giorno', () => {
  it('i sette giorni, da lunedì a domenica', () => {
    expect(orari().GIORNI).toEqual(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])
  })

  it('validi: apertura e chiusura in HH:MM, la chiusura anche dopo la mezzanotte, o il giorno chiuso', () => {
    const { problemiOrari } = orari()
    expect(problemiOrari(SERA)).toEqual({})
    expect(problemiOrari(tutti(aperto('07:00', '15:00')))).toEqual({})
    expect(problemiOrari({ ...tutti(CHIUSO), sab: aperto('20:00', '04:30') })).toEqual({})
  })

  it('ogni giorno deve dire apertura e chiusura, o essere chiuso; l’errore sta sul giorno', () => {
    const { problemiOrari } = orari()
    expect(problemiOrari({ ...SERA, mar: undefined })).toHaveProperty('mar')
    expect(problemiOrari({ ...SERA, mar: {} })).toHaveProperty('mar')
    expect(problemiOrari({ ...SERA, mar: { apre: '18:00' } })).toHaveProperty('mar')
    expect(problemiOrari({ ...SERA, mar: { chiude: '02:00' } })).toHaveProperty('mar')
    expect(problemiOrari(null)).toHaveProperty('lun')
  })

  it('un orario scritto male non passa: HH:MM, dalle 00:00 alle 23:59', () => {
    const { problemiOrari } = orari()
    for (const sbagliato of ['', '9:00', '18.00', '24:00', '25:00', '18:60', 'sera', 18]) {
      expect(problemiOrari({ ...SERA, mer: aperto(sbagliato, '02:00') }), String(sbagliato)).toHaveProperty('mer')
      expect(problemiOrari({ ...SERA, mer: aperto('18:00', sbagliato) }), String(sbagliato)).toHaveProperty('mer')
    }
  })

  it('almeno un giorno aperto', () => {
    const problemi = orari().problemiOrari(tutti(CHIUSO))
    expect(problemi).toHaveProperty('orari')
    expect(problemi.orari).toMatch(/almeno un giorno/i)
  })

  // Daniele, 13/11/2026 («per tutti i 10 i punti facciamo come dici»): i
  // locali aperti 24 ore, o con meno di un'ora fra la chiusura e l'apertura
  // dopo, si possono registrare. Un giorno aperto 24 ore si scrive
  // 00:00–24:00 (Daniele, 13/11/2026: «se è h24 fai 0 - 24»).
  it('aperto 24 ore (00:00–24:00) e senza pausa fra un giorno e l’altro si registrano', () => {
    const { problemiOrari, H24 } = orari()
    expect(H24).toEqual({ apre: '00:00', chiude: '24:00' })
    expect(problemiOrari(tutti(aperto('00:00', '24:00')))).toEqual({})
    expect(problemiOrari({ ...SERA, gio: aperto('00:00', '24:00') })).toEqual({})
    expect(problemiOrari(tutti(aperto('08:00', '07:30')))).toEqual({})
    expect(problemiOrari({ ...tutti(CHIUSO), dom: aperto('20:00', '09:00'), lun: aperto('08:00', '12:00') })).toEqual({})
  })

  // Apertura uguale alla chiusura non vuol più dire 24 ore: era ambiguo
  // (aperto 24 ore o un errore di battitura?). L'errore suggerisce la
  // forma giusta; 24:00 vale solo come chiusura di un giorno che apre alle
  // 00:00.
  it('apertura uguale alla chiusura non è valida, e l’errore suggerisce 00:00–24:00', () => {
    const { problemiOrari } = orari()
    for (const ora of ['00:00', '18:00', '10:30']) {
      const p = problemiOrari({ ...SERA, gio: aperto(ora, ora) })
      expect(p, ora).toHaveProperty('gio')
      expect(p.gio, ora).toContain('00:00–24:00')
    }
    expect(problemiOrari({ ...SERA, gio: aperto('18:00', '24:00') }).gio).toMatch(/24:00 vale solo con l’apertura 00:00/)
    expect(problemiOrari({ ...SERA, gio: aperto('24:00', '24:00') })).toHaveProperty('gio')
    expect(problemiOrari({ ...SERA, gio: aperto('24:00', '00:00') })).toHaveProperty('gio')
  })

  // Il segno per l'avviso al titolare: dopo quali giorni la chiusura non
  // lascia un'ora prima dell'apertura dopo. Lì la sospensione per mancato
  // pagamento può arrivare durante il servizio. Domenica guarda a lunedì.
  it('i giorni senza pausa: la chiusura a meno di un’ora dall’apertura dopo, o aperti 24 ore', () => {
    const { giorniSenzaPausa } = orari()
    expect(giorniSenzaPausa(SERA)).toEqual([])
    expect(giorniSenzaPausa(tutti(aperto('08:00', '07:30')))).toEqual(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])
    expect(giorniSenzaPausa(tutti(aperto('00:00', '24:00')))).toEqual(['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'])
    // Aperto 24 ore il sabato, la domenica apre alle 18: c'è pausa.
    expect(giorniSenzaPausa({ ...SERA, sab: aperto('00:00', '24:00') })).toEqual(['ven'])
    expect(giorniSenzaPausa({ ...tutti(CHIUSO), dom: aperto('20:00', '07:30'), lun: aperto('08:00', '12:00') })).toEqual(['dom'])
    // Un'ora esatta basta.
    expect(giorniSenzaPausa({ ...tutti(CHIUSO), mar: aperto('20:00', '07:00'), mer: aperto('08:00', '12:00') })).toEqual([])
    // Il giorno dopo chiuso: la chiusura può arrivare a qualunque ora.
    expect(giorniSenzaPausa({ ...tutti(CHIUSO), mar: aperto('20:00', '11:00') })).toEqual([])
    // Aperto 24 ore un giorno solo, col giorno dopo chiuso: c'è pausa.
    expect(giorniSenzaPausa({ ...tutti(CHIUSO), sab: aperto('00:00', '24:00') })).toEqual([])
    expect(giorniSenzaPausa(null)).toEqual([])
  })

  it('in forma pulita: il giorno chiuso è { chiuso: true } senza ore, quello aperto { apre, chiude }', () => {
    const dalModulo = { ...SERA, lun: { chiuso: true, apre: '18:00', chiude: '02:00' }, mar: { chiuso: false, apre: '18:00', chiude: '02:00' } }
    expect(orari().orariPuliti(dalModulo)).toEqual(SERA)
  })
})

describe('alla registrazione gli orari sono obbligatori', () => {
  const DATI = {
    locale: { nome: 'Bar Mario', tipo: 'bar', via: 'Via Roma 1', cap: '80035', citta: 'Nola', provincia: 'NA', telefono: '081 1234567', sito: '' },
    fatturazione: { ragione_sociale: 'Bar Mario srl', partita_iva: '01234567897', codice_fiscale: '', pec: 'bar@pec.it', sdi: '', stessa_sede: true },
    referente: { nome: 'Mario', cognome: 'Rossi', ruolo: 'titolare', telefono: '', termini: true, privacy: true, marketing: false },
  }
  const ADESSO = new Date('2026-11-13T10:00:00.000Z')
  const registra = (dati) => registrazione.documentoRegistrazione({ uid: 'u1', email: 'mario@example.it', dati, adesso: ADESSO })

  it('senza orari, o con orari sbagliati, la regia rifiuta e indica la casella', () => {
    for (const sbagliati of [undefined, tutti(CHIUSO), { ...SERA, mar: aperto('18:00', '25:00') }]) {
      let errore = null
      try {
        registra({ ...DATI, orari: sbagliati })
      } catch (e) {
        errore = e
      }
      expect(errore).toBeInstanceOf(registrazione.RegistrazioneRifiutata)
      expect(errore.codice).toBe('invalid-argument')
      expect(errore.dettagli).toMatchObject({ campo: 'orari' })
    }
  })

  // Fuori da `locale`: lì il titolare scrive da sé (firestore.rules, i
  // blocchi permessi), e gli orari si cambiano solo dalle Functions.
  it('il cliente nasce con orari_servizio, in cima al documento: i giorni puliti e da quando valgono', () => {
    const cliente = registra({ ...DATI, orari: { ...SERA, lun: { chiuso: true, apre: '', chiude: '' } } })
    expect(cliente.orari_servizio).toMatchObject({ giorni: SERA, impostati_il: ADESSO.toISOString(), richiesta: null })
    expect(cliente.locale).not.toHaveProperty('orari')
    expect(cliente.locale).not.toHaveProperty('orari_servizio')
  })
})

describe('per 7 giorni li corregge il titolare, dopo serve l’approvazione', () => {
  const IMPOSTATI = '2026-11-13T10:00:00.000Z'
  const FINO = '2026-11-20T10:00:00.000Z'
  const cliente = { uid: 'u1', slug: 'bar-mario', orari_servizio: { giorni: SERA, impostati_il: IMPOSTATI, richiesta: null, storia: [] } }
  const PRANZO = { ...SERA, lun: aperto('12:00', '15:00') }
  const rifiuto = (fn) => {
    try {
      fn()
    } catch (e) {
      return e
    }
    return null
  }

  it('i giorni di correzione sono 7, da quando gli orari sono stati scritti', () => {
    const { GIORNI_DI_CORREZIONE, correggibiliFino } = orari()
    expect(GIORNI_DI_CORREZIONE).toBe(7)
    expect(correggibiliFino(cliente)).toBe(FINO)
    expect(correggibiliFino({ uid: 'u2' })).toBeNull()
  })

  it('dentro i 7 giorni il titolare li corregge da solo, e resta la traccia: chi, quando, prima, dopo', () => {
    const adesso = new Date('2026-11-15T21:00:00.000Z')
    const { orari_servizio: dopo } = orari().correzioneDelTitolare(cliente, PRANZO, { uid: 'u1', adesso })
    expect(dopo.giorni).toEqual(PRANZO)
    // La correzione non fa ripartire i 7 giorni.
    expect(dopo.impostati_il).toBe(IMPOSTATI)
    expect(dopo.storia.at(-1)).toEqual({ tipo: 'correzione', chi: 'u1', quando: adesso.toISOString(), prima: SERA, dopo: PRANZO, motivo: null })
  })

  it('al settimo giorno compiuto la correzione diretta si chiude', () => {
    const { correzioneDelTitolare, OrariRifiutati } = orari()
    expect(() => correzioneDelTitolare(cliente, PRANZO, { uid: 'u1', adesso: new Date(Date.parse(FINO) - 1) })).not.toThrow()
    const e = rifiuto(() => correzioneDelTitolare(cliente, PRANZO, { uid: 'u1', adesso: new Date(FINO) }))
    expect(e).toBeInstanceOf(OrariRifiutati)
    expect(e.codice).toBe('failed-precondition')
    expect(e.message).toMatch(/richiesta/i)
  })

  it('una correzione con orari sbagliati si rifiuta', () => {
    const e = rifiuto(() => orari().correzioneDelTitolare(cliente, tutti(CHIUSO), { uid: 'u1', adesso: new Date('2026-11-14T10:00:00Z') }))
    expect(e?.codice).toBe('invalid-argument')
  })

  // Criterio 5: un locale di prima, senza orari, li scrive la prima volta
  // dalla sua area, e da lì partono i suoi 7 giorni.
  it('un locale di prima, senza orari, li scrive la prima volta e da lì partono i 7 giorni', () => {
    const adesso = new Date('2026-12-01T09:00:00.000Z')
    const { orari_servizio: dopo } = orari().correzioneDelTitolare({ uid: 'u2', slug: 'pub-vecchio' }, SERA, { uid: 'u2', adesso })
    expect(dopo).toMatchObject({ giorni: SERA, impostati_il: adesso.toISOString(), richiesta: null })
    expect(dopo.storia.at(-1)).toMatchObject({ chi: 'u2', prima: null, dopo: SERA })
  })

  it('dopo i 7 giorni il titolare manda una richiesta col motivo scritto; gli orari non cambiano finché l’admin non approva', () => {
    const adesso = new Date('2026-12-01T09:00:00.000Z')
    const motivo = '  Da dicembre apriamo anche il lunedì a pranzo.  '
    const { orari_servizio: dopo } = orari().richiestaDiCambio(cliente, PRANZO, motivo, { uid: 'u1', adesso })
    expect(dopo.giorni).toEqual(SERA)
    expect(dopo.richiesta).toEqual({ stato: 'in attesa', giorni: PRANZO, prima: SERA, motivo: 'Da dicembre apriamo anche il lunedì a pranzo.', chiesta_il: adesso.toISOString(), chiesta_da: 'u1' })
  })

  it('la richiesta vuole un motivo vero, orari validi e diversi, e una sola alla volta', () => {
    const { richiestaDiCambio } = orari()
    const adesso = new Date('2026-12-01T09:00:00.000Z')
    for (const motivo of [undefined, '', '   ', 'boh']) {
      expect(rifiuto(() => richiestaDiCambio(cliente, PRANZO, motivo, { uid: 'u1', adesso }))?.codice, String(motivo)).toBe('invalid-argument')
    }
    expect(rifiuto(() => richiestaDiCambio(cliente, tutti(CHIUSO), 'Chiudiamo per sempre il locale.', { uid: 'u1', adesso }))?.codice).toBe('invalid-argument')
    expect(rifiuto(() => richiestaDiCambio(cliente, SERA, 'Gli orari sono questi, confermo.', { uid: 'u1', adesso }))?.codice).toBe('invalid-argument')
    const conRichiesta = richiestaDiCambio(cliente, PRANZO, 'Da dicembre apriamo anche il lunedì a pranzo.', { uid: 'u1', adesso })
    expect(rifiuto(() => richiestaDiCambio({ ...cliente, ...conRichiesta }, PRANZO, 'Lo chiedo di nuovo, con calma.', { uid: 'u1', adesso }))?.codice).toBe('already-exists')
  })

  it('dentro i 7 giorni non serve la richiesta: si correggono da sé', () => {
    const e = rifiuto(() => orari().richiestaDiCambio(cliente, PRANZO, 'Da dicembre apriamo anche il lunedì a pranzo.', { uid: 'u1', adesso: new Date('2026-11-14T10:00:00Z') }))
    expect(e?.codice).toBe('failed-precondition')
  })

  describe('l’admin decide dal backoffice', () => {
    const chiesta = new Date('2026-12-01T09:00:00.000Z')
    const deciso = new Date('2026-12-02T11:00:00.000Z')
    const motivo = 'Da dicembre apriamo anche il lunedì a pranzo.'
    const conRichiesta = () => ({ ...cliente, ...orari().richiestaDiCambio(cliente, PRANZO, motivo, { uid: 'u1', adesso: chiesta }) })

    it('approvata: valgono gli orari nuovi, la richiesta si chiude e la traccia dice chi ha chiesto, chi ha approvato, prima, dopo e motivo', () => {
      const { orari_servizio: dopo } = orari().decisioneSullaRichiesta(conRichiesta(), { esito: 'approvata', admin: 'admin@example.it', adesso: deciso })
      expect(dopo.giorni).toEqual(PRANZO)
      expect(dopo.richiesta).toBeNull()
      expect(dopo.impostati_il).toBe(IMPOSTATI)
      expect(dopo.storia.at(-1)).toEqual({ tipo: 'approvata', chi: 'u1', quando: deciso.toISOString(), prima: SERA, dopo: PRANZO, motivo, chiesta_il: chiesta.toISOString(), deciso_da: 'admin@example.it', nota: null })
    })

    it('rifiutata: gli orari restano quelli di prima, e la traccia lo dice con la nota dell’admin', () => {
      const { orari_servizio: dopo } = orari().decisioneSullaRichiesta(conRichiesta(), { esito: 'rifiutata', admin: 'admin@example.it', adesso: deciso, nota: 'Manca il cartello con gli orari nuovi.' })
      expect(dopo.giorni).toEqual(SERA)
      expect(dopo.richiesta).toBeNull()
      expect(dopo.storia.at(-1)).toMatchObject({ tipo: 'rifiutata', chi: 'u1', prima: SERA, dopo: PRANZO, motivo, deciso_da: 'admin@example.it', nota: 'Manca il cartello con gli orari nuovi.' })
    })

    it('senza una richiesta in attesa, o con un esito che non esiste, non decide niente', () => {
      const { decisioneSullaRichiesta } = orari()
      expect(rifiuto(() => decisioneSullaRichiesta(cliente, { esito: 'approvata', admin: 'admin@example.it', adesso: deciso }))?.codice).toBe('failed-precondition')
      expect(rifiuto(() => decisioneSullaRichiesta(conRichiesta(), { esito: 'forse', admin: 'admin@example.it', adesso: deciso }))?.codice).toBe('invalid-argument')
    })
  })

  // Revisione del 13/11/2026, D8: con gli orari ma senza una data valida
  // (impostati_il mancante o rotto) il sito e la regia applicano la stessa
  // regola: gli orari sono correggibili, e il primo salvataggio fa partire
  // i 7 giorni.
  it('D8: con gli orari ma senza una data valida, gli orari sono correggibili', () => {
    const { correzioneDelTitolare, correggibiliFino } = orari()
    const adesso = new Date('2026-12-01T09:00:00.000Z')
    for (const impostati_il of [undefined, null, '', 'ieri']) {
      const senzaData = { uid: 'u1', orari_servizio: { giorni: SERA, impostati_il, richiesta: null, storia: [] } }
      expect(correggibiliFino(senzaData), String(impostati_il)).toBeNull()
      expect(sito.correggibiliFino(senzaData), String(impostati_il)).toBeNull()
      const { orari_servizio: dopo } = correzioneDelTitolare(senzaData, PRANZO, { uid: 'u1', adesso })
      expect(dopo.giorni).toEqual(PRANZO)
      expect(dopo.impostati_il).toBe(adesso.toISOString())
    }
  })

  // Daniele, 13/11/2026, sugli orari scritti dall'admin: «si». In qualunque
  // momento, per qualunque locale, con la stessa validazione e la traccia.
  describe('l’admin scrive gli orari dal backoffice', () => {
    const adesso = new Date('2026-12-05T15:00:00.000Z')
    const PRANZO_E_SERA = { ...SERA, lun: aperto('12:00', '15:00'), dom: aperto('00:00', '24:00') }

    it('a un locale che non ne ha: gli orari, la traccia (chi è l’admin, prima, dopo, nota) e i 7 giorni del titolare NON partono', () => {
      const { scritturaDellAdmin, correggibiliFino, correzioneDelTitolare, richiestaDiCambio } = orari()
      const { orari_servizio: dopo } = scritturaDellAdmin({ uid: 'u2', slug: 'pub-vecchio' }, PRANZO_E_SERA, { admin: 'admin@example.it', nota: '  Dal sito del locale.  ', adesso })
      expect(dopo.giorni).toEqual(PRANZO_E_SERA)
      expect(dopo.richiesta).toBeNull()
      expect(dopo.impostati_il).toBe(adesso.toISOString())
      expect(dopo.correggibili_fino).toBe(adesso.toISOString())
      expect(dopo.storia).toEqual([{ tipo: 'admin', chi: 'admin@example.it', quando: adesso.toISOString(), prima: null, dopo: PRANZO_E_SERA, motivo: null, nota: 'Dal sito del locale.' }])
      // Il titolare non li corregge da sé: chiede il cambio.
      const scritto = { uid: 'u2', orari_servizio: dopo }
      expect(correggibiliFino(scritto)).toBe(adesso.toISOString())
      expect(sito.correggibiliFino(scritto)).toBe(adesso.toISOString())
      expect(rifiuto(() => correzioneDelTitolare(scritto, SERA, { uid: 'u2', adesso: new Date(adesso.getTime() + 1000) }))?.codice).toBe('failed-precondition')
      expect(() => richiestaDiCambio(scritto, SERA, 'Il lunedì a pranzo non apriamo più.', { uid: 'u2', adesso: new Date(adesso.getTime() + 1000) })).not.toThrow()
    })

    it('con gli orari senza data (D8) vale lo stesso: la scrittura dell’admin non apre i 7 giorni', () => {
      const { scritturaDellAdmin, correggibiliFino } = orari()
      const { orari_servizio: dopo } = scritturaDellAdmin({ orari_servizio: { giorni: SERA } }, PRANZO_E_SERA, { admin: 'admin@example.it', adesso })
      expect(correggibiliFino({ orari_servizio: dopo })).toBe(adesso.toISOString())
      expect(dopo.storia.at(-1)).toMatchObject({ tipo: 'admin', prima: SERA, nota: null })
    })

    it('a un locale con la sua data: i 7 giorni del titolare restano quelli che erano', () => {
      const { scritturaDellAdmin, correggibiliFino, correzioneDelTitolare } = orari()
      const nei7 = new Date('2026-11-15T10:00:00.000Z')
      const { orari_servizio: dopo } = scritturaDellAdmin(cliente, PRANZO_E_SERA, { admin: 'admin@example.it', adesso: nei7 })
      expect(dopo.impostati_il).toBe(IMPOSTATI)
      expect(dopo).not.toHaveProperty('correggibili_fino')
      expect(correggibiliFino({ orari_servizio: dopo })).toBe(FINO)
      expect(() => correzioneDelTitolare({ orari_servizio: dopo }, SERA, { uid: 'u1', adesso: nei7 })).not.toThrow()
    })

    it('in qualunque momento, anche dopo i 7 giorni; una richiesta in attesa resta, e l’admin la decide a parte', () => {
      const { scritturaDellAdmin, richiestaDiCambio } = orari()
      const conRichiesta = { ...cliente, ...richiestaDiCambio(cliente, PRANZO, 'Da dicembre apriamo anche il lunedì a pranzo.', { uid: 'u1', adesso: new Date('2026-12-01T09:00:00.000Z') }) }
      const { orari_servizio: dopo } = scritturaDellAdmin(conRichiesta, PRANZO_E_SERA, { admin: 'admin@example.it', adesso })
      expect(dopo.giorni).toEqual(PRANZO_E_SERA)
      expect(dopo.richiesta).toEqual(conRichiesta.orari_servizio.richiesta)
      expect(dopo.storia.at(-1)).toMatchObject({ tipo: 'admin', prima: SERA, dopo: PRANZO_E_SERA })
    })

    it('la stessa validazione: orari sbagliati si rifiutano, e la nota ha il suo tetto', () => {
      const { scritturaDellAdmin, TESTO_MASSIMO } = orari()
      expect(rifiuto(() => scritturaDellAdmin(cliente, tutti(CHIUSO), { admin: 'admin@example.it', adesso }))?.codice).toBe('invalid-argument')
      expect(rifiuto(() => scritturaDellAdmin(cliente, { ...SERA, mar: aperto('18:00', '18:00') }, { admin: 'admin@example.it', adesso }))?.codice).toBe('invalid-argument')
      expect(rifiuto(() => scritturaDellAdmin(cliente, null, { admin: 'admin@example.it', adesso }))?.codice).toBe('invalid-argument')
      const { orari_servizio: dopo } = scritturaDellAdmin(cliente, SERA, { admin: 'admin@example.it', nota: 'x'.repeat(TESTO_MASSIMO + 10), adesso })
      expect(dopo.storia.at(-1).nota).toHaveLength(TESTO_MASSIMO)
    })
  })
})

describe('il momento della sospensione per pagamento', () => {
  // L'abbonamento attivato alle 21 di Roma (d'estate: le 19 UTC).
  const ALLE_21 = '2026-09-01T19:00:00.000Z'
  const momento = (attivazione, adesso, giorni = SERA, oraTaglio = 5) => iso(orari().momentoSospensione({ giorni, attivazione, adesso: new Date(adesso), oraTaglio }))

  it('alla stessa ora del giorno in cui è stato attivato l’abbonamento, la prima che arriva', () => {
    // Attivato alle 10, il locale apre alle 18: sospeso alle 10.
    const ALLE_10 = '2026-11-02T09:00:00.000Z'
    expect(momento(ALLE_10, '2026-11-18T08:00:00Z')).toBe('2026-11-18T09:00:00.000Z')
    // Arrivati alle 10 in punto: adesso.
    expect(momento(ALLE_10, '2026-11-18T09:00:00Z')).toBe('2026-11-18T09:00:00.000Z')
    // Passate le 10: le 10 di domani.
    expect(momento(ALLE_10, '2026-11-18T10:00:00Z')).toBe('2026-11-19T09:00:00.000Z')
  })

  it('l’ora che conta è quella dell’orologio di Roma: attivato alle 10 d’estate, d’inverno si sospende alle 10', () => {
    expect(momento('2026-07-01T08:00:00.000Z', '2026-11-18T06:00:00Z')).toBe('2026-11-18T09:00:00.000Z')
  })

  // L'esempio di Daniele: «servizio 18:00–02:00, attivato alle 21:00 →
  // sospeso alle 02:00».
  it('un’ora che cade in servizio si sposta alla chiusura: servizio 18–02, attivato alle 21, sospeso alle 2', () => {
    // Mercoledì 18/11 alle 10: le 21 di mercoledì sono in servizio, la
    // chiusura è giovedì alle 2.
    expect(momento(ALLE_21, '2026-11-18T09:00:00Z')).toBe('2026-11-19T01:00:00.000Z')
  })

  // Daniele, 13/11/2026 (punto 7): in servizio si va SEMPRE alla chiusura,
  // anche quando l'apertura è più vicina: il servizio non si interrompe.
  it('in servizio sempre alla chiusura, anche appena dopo l’apertura', () => {
    expect(momento('2026-11-02T17:30:00.000Z', '2026-11-18T09:00:00Z')).toBe('2026-11-19T01:00:00.000Z')
  })

  it('oltre la mezzanotte: l’1 di notte è ancora il servizio della sera prima', () => {
    const ALL_UNA = '2026-11-02T00:00:00.000Z'
    expect(momento(ALL_UNA, '2026-11-18T02:00:00Z')).toBe('2026-11-19T01:00:00.000Z')
  })

  it('un giorno chiuso non sposta niente, ma la coda della sera prima sì', () => {
    // Lunedì chiuso: le 21 di lunedì restano le 21.
    expect(momento(ALLE_21, '2026-11-16T11:00:00Z')).toBe('2026-11-16T20:00:00.000Z')
    // L'1 di notte di lunedì è ancora il servizio di domenica (18–02).
    expect(momento('2026-11-02T00:00:00.000Z', '2026-11-15T23:30:00Z')).toBe('2026-11-16T01:00:00.000Z')
  })

  it('un’ora che cade nell’ora prima dell’apertura si sposta a un’ora prima dell’apertura', () => {
    const ALLE_17_30 = '2026-11-02T16:30:00.000Z'
    expect(momento(ALLE_17_30, '2026-11-18T11:00:00Z')).toBe('2026-11-18T16:00:00.000Z')
    // Se quel momento è già passato si aspetta la chiusura: niente
    // sospensioni a ridosso dell'apertura.
    expect(momento(ALLE_17_30, '2026-11-18T16:10:00Z')).toBe('2026-11-19T01:00:00.000Z')
  })

  it('col cambio dell’ora d’autunno: le 2 della chiusura sono le seconde, quelle dell’ora solare', () => {
    // Sabato 24/10 alle 12; attivato alle 22. Le 22 di sabato sono in
    // servizio; la chiusura è domenica 25/10 alle 2, che quella notte
    // tornano due volte: vale la seconda (01:00 UTC), mai in servizio.
    expect(momento('2026-09-01T20:00:00.000Z', '2026-10-24T10:00:00Z')).toBe('2026-10-25T01:00:00.000Z')
  })

  it('col cambio dell’ora di primavera: un’ora che quel giorno non c’è vale un’ora dopo', () => {
    // Attivato alle 2:30 d'inverno. Domenica 29/03 le 2:30 non esistono:
    // si sospende alle 3:30 dell'ora legale (01:30 UTC). La chiusura del
    // sabato (le 2, che non esistono) è alle 3: le 3:30 sono fuori servizio.
    expect(momento('2026-01-10T01:30:00.000Z', '2026-03-28T22:00:00Z')).toBe('2026-03-29T01:30:00.000Z')
  })

  // Daniele, 13/11/2026 (punto 9): se gli orari non lasciano un momento
  // fuori servizio adatto (fuori servizio e almeno un'ora prima della
  // prossima apertura), la sospensione cade all'ora dell'attivazione anche
  // in servizio. Il titolare lo sa dall'avviso (giorniSenzaPausa).
  it('senza un momento adatto fuori servizio, all’ora dell’attivazione anche in servizio', () => {
    // Aperto 24 ore (00:00–24:00) tutti i giorni.
    expect(momento(ALLE_21, '2026-11-18T09:00:00Z', tutti(aperto('00:00', '24:00')))).toBe('2026-11-18T20:00:00.000Z')
    // Dalle 8 alle 7:30 del giorno dopo: la chiusura cade nell'ora prima
    // dell'apertura dopo, quindi non va bene.
    const SENZA_PAUSA = tutti(aperto('08:00', '07:30'))
    expect(momento(ALLE_21, '2026-11-18T09:00:00Z', SENZA_PAUSA)).toBe('2026-11-18T20:00:00.000Z')
    // Le 7:45 cadono nell'ora prima dell'apertura delle 8, ma le 7 sono
    // ancora il servizio della sera prima: anche lì, l'ora dell'attivazione.
    expect(momento('2026-11-02T06:45:00.000Z', '2026-11-18T02:00:00Z', SENZA_PAUSA)).toBe('2026-11-18T06:45:00.000Z')
    // Un giorno con la pausa basta per quel giorno: il sabato chiude alle 2
    // e la domenica apre alle 8.
    expect(momento(ALLE_21, '2026-11-21T09:00:00Z', { ...SENZA_PAUSA, sab: aperto('08:00', '02:00') })).toBe('2026-11-22T01:00:00.000Z')
  })

  // Daniele, 13/11/2026: «se è h24 fai 0 - 24». Il servizio di un giorno
  // aperto 24 ore finisce alla mezzanotte del giorno dopo.
  it('un giorno aperto 24 ore (00:00–24:00): in servizio si va alla mezzanotte, se il giorno dopo lascia la pausa', () => {
    // Sabato 21/11 aperto 24 ore, domenica e lunedì chiusi: le 21 di sabato
    // sono in servizio, la chiusura è la mezzanotte (le 23 UTC).
    const SAB_H24 = { ...SERA, sab: aperto('00:00', '24:00'), dom: CHIUSO }
    expect(momento(ALLE_21, '2026-11-21T09:00:00Z', SAB_H24)).toBe('2026-11-21T23:00:00.000Z')
    // La domenica apre alle 18: la mezzanotte va bene lo stesso.
    expect(momento(ALLE_21, '2026-11-21T09:00:00Z', { ...SERA, sab: aperto('00:00', '24:00') })).toBe('2026-11-21T23:00:00.000Z')
    // Domenica aperta dalle 00:00 (24 ore anche lei): niente pausa alla
    // mezzanotte, si resta all'ora dell'attivazione.
    expect(momento(ALLE_21, '2026-11-21T09:00:00Z', { ...SERA, sab: aperto('00:00', '24:00'), dom: aperto('00:00', '24:00') })).toBe('2026-11-21T20:00:00.000Z')
    // Il venerdì sera (18–02) finisce dentro il sabato aperto 24 ore.
    expect(momento(ALLE_21, '2026-11-20T09:00:00Z', { ...SERA, sab: aperto('00:00', '24:00') })).toBe('2026-11-20T20:00:00.000Z')
    // Col cambio dell'ora d'autunno: sabato 24/10 aperto 24 ore, domenica
    // chiusa; la mezzanotte è ancora quella dell'ora legale (22:00 UTC).
    expect(momento('2026-09-01T19:00:00.000Z', '2026-10-24T09:00:00Z', { ...tutti(CHIUSO), sab: aperto('00:00', '24:00') })).toBe('2026-10-24T22:00:00.000Z')
  })

  // Revisione del 13/11/2026, D4: la regola non cambia, e fra «non
  // pagato» e la sospensione il locale lavora ancora fino a quasi due
  // giorni. Daniele: «Tenere la regola così e accettare fino a quasi due
  // giorni … ok». I due esempi della voce, coi loro numeri.
  it('D4: fra la decisione e la sospensione fino a quasi due giorni (28,5 ore; circa 46 ore con un servizio dalle 10 alle 08)', () => {
    const ore = (attivazione, adesso, giorni) => (Date.parse(momento(attivazione, adesso, giorni)) - Date.parse(adesso)) / 3600000
    // Servizio 18–02, attivato alle 21:30, deciso alle 21:31 di mercoledì:
    // le 21:30 di giovedì sono in servizio, la chiusura è venerdì alle 2.
    expect(ore('2026-09-01T19:30:00.000Z', '2026-11-18T20:31:00.000Z')).toBeCloseTo(28.48, 2)
    // Servizio dalle 10 alle 08 del giorno dopo, attivato alle 10:01, deciso
    // alle 10:02: le 10:01 di domani sono in servizio, la chiusura è alle 8
    // del giorno dopo ancora.
    expect(ore('2026-11-02T09:01:00.000Z', '2026-11-18T09:02:00.000Z', tutti(aperto('10:00', '08:00')))).toBeCloseTo(45.97, 2)
  })

  // Criterio 5: i locali di prima.
  it('senza orari (o con orari non validi) resta il taglio della giornata di oggi', () => {
    const adesso = new Date('2026-11-18T09:00:00Z')
    expect(momento(ALLE_21, adesso, null)).toBe('2026-11-19T04:00:00.000Z')
    expect(momento(ALLE_21, adesso, null, 6)).toBe(iso(prossimoTaglio(adesso, 6)))
    expect(momento(ALLE_21, adesso, tutti(CHIUSO))).toBe(iso(prossimoTaglio(adesso, 5)))
  })

  it('con gli orari ma senza l’ora dell’attivazione vale l’ora del taglio, sempre fuori servizio', () => {
    expect(momento(null, '2026-11-18T09:00:00Z', SERA, 6)).toBe('2026-11-19T05:00:00.000Z')
  })

  // Criterio 4: l'ora dell'attivazione è clienti/{uid}.abbonamento.dal
  // (scritta al checkout di Stripe, alla creazione a mano, agli sconti).
  it('l’ora dell’attivazione è abbonamento.dal del cliente', () => {
    const { oraDiAttivazione } = orari()
    expect(oraDiAttivazione({ abbonamento: { origine: 'stripe', dal: ALLE_21 } })).toBe(ALLE_21)
    expect(oraDiAttivazione({ abbonamento: { origine: 'manuale', dal: '2026-11-02T09:00:00.000Z' } })).toBe('2026-11-02T09:00:00.000Z')
    expect(oraDiAttivazione({ abbonamento: { origine: 'stripe' } })).toBeNull()
    expect(oraDiAttivazione({ abbonamento: { dal: 'ieri' } })).toBeNull()
    expect(oraDiAttivazione(null)).toBeNull()
  })

  it('quandoSospendere legge orari e attivazione dal cliente', () => {
    const cliente = { orari_servizio: { giorni: SERA }, abbonamento: { origine: 'stripe', stato: 'non pagato', dal: ALLE_21 } }
    expect(iso(orari().quandoSospendere(cliente, { adesso: new Date('2026-11-18T09:00:00Z'), oraTaglio: 5 }))).toBe('2026-11-19T01:00:00.000Z')
    expect(iso(orari().quandoSospendere({ abbonamento: { dal: ALLE_21 } }, { adesso: new Date('2026-11-18T09:00:00Z'), oraTaglio: 5 }))).toBe('2026-11-19T04:00:00.000Z')
  })

  // valida_fino è il momento in cui l'app si ferma da sola, anche senza
  // rete (handover §7): deve essere lo stesso in cui la regia sospende.
  it('valida_fino della licenza cade allo stesso momento, non più al taglio', () => {
    const cliente = {
      slug: 'bar-mario',
      piano: 'base',
      moduli: [],
      terminali: 1,
      abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-10', dal: ALLE_21 },
      orari_servizio: { giorni: SERA, impostati_il: '2026-09-01T19:00:00.000Z' },
    }
    // Pagato fino al 10/11, più 7 giorni di grazia: martedì 17/11 alle
    // 23:59:59 UTC, cioè mercoledì alle 00:59:59 di Roma. Le 21 di
    // mercoledì sono in servizio: giovedì alle 2.
    const lic = licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: new Date('2026-11-13T10:00:00Z'), oraTaglio: 5 })
    expect(lic.valida_fino).toBe('2026-11-19T01:00:00.000Z')
    // Senza orari resta com'era: il taglio dopo la scadenza.
    const { orari_servizio: _, ...senza } = cliente
    expect(licenzaProtetta({ stato: 'attiva' }, senza, { adesso: new Date('2026-11-13T10:00:00Z'), oraTaglio: 5 }).valida_fino).toBe('2026-11-18T04:00:00.000Z')
  })
})

// ── L'INTEGRAZIONE (REQ-FLOTTA-095) ──────────────────────────────────

// Le regole degli orari stanno anche nel sito, per l'errore accanto al
// giorno prima di mandare: devono dire le stesse cose del server.
describe('il sito e la regia dicono le stesse cose sugli orari', () => {
  const CASI = [
    SERA,
    tutti(CHIUSO),
    tutti(aperto('00:00', '00:00')),
    tutti(aperto('00:00', '24:00')),
    { ...SERA, sab: aperto('00:00', '24:00') },
    { ...SERA, sab: aperto('18:00', '24:00') },
    { ...SERA, sab: aperto('24:00', '24:00') },
    { ...SERA, gio: aperto('10:00', '10:00') },
    tutti(aperto('08:00', '07:30')),
    { ...SERA, mar: aperto('18:00', '25:00') },
    { ...SERA, mer: {} },
    { ...SERA, gio: aperto('9:00', '02:00') },
    { ...tutti(CHIUSO), dom: aperto('20:00', '07:30'), lun: aperto('08:00', '12:00') },
    null,
  ]

  it('problemiOrari, giorniSenzaPausa, orariPuliti e correggibiliFino', () => {
    for (const caso of CASI) {
      expect(sito.problemiOrari(caso), JSON.stringify(caso)).toEqual(orari().problemiOrari(caso))
      expect(sito.giorniSenzaPausa(caso), JSON.stringify(caso)).toEqual(orari().giorniSenzaPausa(caso))
    }
    const conOre = { ...SERA, lun: { chiuso: true, apre: '1', chiude: '2' } }
    expect(sito.orariPuliti(conOre)).toEqual(orari().orariPuliti(conOre))
    for (const g of [CHIUSO, aperto('18:00', '02:00'), aperto('07:00', '15:00'), aperto('00:00', '24:00'), null]) expect(sito.giornoDetto(g)).toBe(orari().giornoDetto(g))
    expect(sito.NOMI_GIORNI).toEqual(orari().NOMI_GIORNI)
    const c = { orari_servizio: { impostati_il: '2026-11-13T10:00:00.000Z' } }
    expect(sito.correggibiliFino(c)).toBe(orari().correggibiliFino(c))
    expect([sito.GIORNI, sito.GIORNI_DI_CORREZIONE, sito.MOTIVO_MINIMO, sito.H24]).toEqual([orari().GIORNI, orari().GIORNI_DI_CORREZIONE, orari().MOTIVO_MINIMO, orari().H24])
  })
})

// UN FIRESTORE FINTO, quanto basta alla transazione di cambiaOrari: legge
// il documento e scrive solo alla fine, come quella vera.
function firestoreFinto(documenti = {}) {
  const dati = { ...documenti }
  const scritture = []
  return {
    dati,
    scritture,
    doc: (percorso) => ({ percorso }),
    async runTransaction(fn) {
      const inAttesa = []
      const t = {
        async get(ref) {
          return { exists: dati[ref.percorso] !== undefined, data: () => dati[ref.percorso] }
        },
        update(ref, patch) {
          inAttesa.push([ref.percorso, patch])
        },
      }
      const esito = await fn(t)
      for (const [p, patch] of inAttesa) {
        dati[p] = { ...dati[p], ...patch }
        scritture.push(p)
      }
      return esito
    },
  }
}

describe('cambiaOrari: in transazione sul documento del cliente', () => {
  const cliente = { uid: 'u1', slug: 'bar-mario', orari_servizio: { giorni: SERA, impostati_il: '2026-11-13T10:00:00.000Z', richiesta: null, storia: [] } }
  const PRANZO = { ...SERA, lun: aperto('12:00', '15:00') }

  it('rilegge il cliente, applica il cambio e scrive il blocco intero', async () => {
    const db = firestoreFinto({ 'clienti/u1': cliente })
    const adesso = new Date('2026-11-14T10:00:00Z')
    const scritto = await orari().cambiaOrari(db, 'u1', (c) => orari().correzioneDelTitolare(c, PRANZO, { uid: 'u1', adesso }))
    expect(db.scritture).toEqual(['clienti/u1'])
    expect(db.dati['clienti/u1'].orari_servizio).toEqual(scritto)
    expect(scritto.giorni).toEqual(PRANZO)
    // Il resto del cliente non si tocca.
    expect(db.dati['clienti/u1'].slug).toBe('bar-mario')
  })

  it('senza cliente o con un cambio rifiutato non scrive niente', async () => {
    const db = firestoreFinto({ 'clienti/u1': cliente })
    await expect(orari().cambiaOrari(db, 'nessuno', (c) => c)).rejects.toMatchObject({ codice: 'not-found' })
    await expect(orari().cambiaOrari(db, '', (c) => c)).rejects.toMatchObject({ codice: 'invalid-argument' })
    const dopo = new Date('2026-12-01T10:00:00Z')
    await expect(orari().cambiaOrari(db, 'u1', (c) => orari().correzioneDelTitolare(c, PRANZO, { uid: 'u1', adesso: dopo }))).rejects.toMatchObject({ codice: 'failed-precondition' })
    expect(db.scritture).toEqual([])
  })
})

// La callable degli orari scritti dall'admin (scriviOrariAdmin in
// index.js) è questa funzione: solo col claim admin, e l'uid che arriva dal
// browser si controlla prima di farne un percorso.
describe('orariDellAdmin: la callable degli orari scritti dall’admin', () => {
  const cliente = { uid: 'u1', slug: 'bar-mario', orari_servizio: { giorni: SERA, impostati_il: '2026-11-13T10:00:00.000Z', richiesta: null, storia: [] } }
  const PRANZO = { ...SERA, lun: aperto('12:00', '15:00') }
  const ADMIN = { uid: 'a1', token: { admin: true, email: 'admin@example.it' } }
  const adesso = new Date('2026-12-05T15:00:00.000Z')

  it('l’admin scrive gli orari di un locale, con la traccia a suo nome', async () => {
    const db = firestoreFinto({ 'clienti/u1': cliente, 'clienti/u2': { uid: 'u2', slug: 'pub-vecchio' } })
    const scritto = await orari().orariDellAdmin(db, ADMIN, { uid: 'u1', giorni: PRANZO, nota: 'Al telefono.' }, { adesso })
    expect(db.dati['clienti/u1'].orari_servizio).toEqual(scritto)
    expect(scritto.giorni).toEqual(PRANZO)
    expect(scritto.storia.at(-1)).toMatchObject({ tipo: 'admin', chi: 'admin@example.it', nota: 'Al telefono.' })
    // Anche a un locale che non ne ha; senza email nel token, l'uid.
    const nuovo = await orari().orariDellAdmin(db, { uid: 'a1', token: { admin: true } }, { uid: 'u2', giorni: SERA }, { adesso })
    expect(nuovo).toMatchObject({ giorni: SERA, correggibili_fino: adesso.toISOString() })
    expect(nuovo.storia.at(-1).chi).toBe('a1')
  })

  it('il titolare no, nemmeno sul suo locale; senza accesso nemmeno', async () => {
    const db = firestoreFinto({ 'clienti/u1': cliente })
    for (const auth of [{ uid: 'u1', token: {} }, { uid: 'u1', token: { admin: 'true' } }, null, undefined]) {
      await expect(orari().orariDellAdmin(db, auth, { uid: 'u1', giorni: PRANZO }, { adesso }), JSON.stringify(auth)).rejects.toMatchObject({ codice: 'permission-denied' })
    }
    expect(db.scritture).toEqual([])
  })

  it('l’uid si controlla: niente percorsi costruiti dal browser, e un cliente che non c’è non si crea', async () => {
    const db = firestoreFinto({ 'clienti/u1': cliente })
    for (const uid of ['', undefined, '../impostazioni/regia', 'u1/altro', 'a'.repeat(129)]) {
      await expect(orari().orariDellAdmin(db, ADMIN, { uid, giorni: PRANZO }, { adesso }), String(uid)).rejects.toMatchObject({ codice: 'invalid-argument' })
    }
    await expect(orari().orariDellAdmin(db, ADMIN, { uid: 'nessuno', giorni: PRANZO }, { adesso })).rejects.toMatchObject({ codice: 'not-found' })
    await expect(orari().orariDellAdmin(db, ADMIN, { uid: 'u1', giorni: tutti(CHIUSO) }, { adesso })).rejects.toMatchObject({ codice: 'invalid-argument' })
    expect(db.scritture).toEqual([])
  })
})

// Daniele, 13/11/2026, sull'email: «A me arriva solo la richiesta, poi
// rispondo io a mano al momento». Una email all'admin per richiesta, col
// locale, gli orari di prima e dopo e il motivo; al titolare niente.
describe('l’email all’admin per una richiesta di cambio', () => {
  const comunica = () => require('../functions/lib/comunicazioni.js')
  const PRANZO = { ...SERA, lun: aperto('12:00', '15:00'), dom: aperto('00:00', '24:00') }
  const cliente = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', email: 'titolare@example.it', orari_servizio: { giorni: SERA, impostati_il: '2026-11-13T10:00:00.000Z', richiesta: null, storia: [] } }
  const richiesta = () => orari().richiestaDiCambio(cliente, PRANZO, 'Da dicembre apriamo anche il lunedì a pranzo.', { uid: 'u1', adesso: new Date('2026-12-01T09:30:00.000Z') }).orari_servizio.richiesta

  it('il contenuto: il locale, il titolare, quando, il motivo, gli orari di prima e dopo giorno per giorno', () => {
    const posta = comunica().emailRichiestaOrari(cliente, richiesta(), ['admin@example.it'])
    expect(posta.to).toEqual(['admin@example.it'])
    expect(posta.message.subject).toBe('Bar Mario chiede di cambiare gli orari di servizio')
    const testo = posta.message.text
    expect(testo).toContain('Bar Mario (bar-mario)')
    expect(testo).toContain('titolare@example.it')
    // Le 10:30 di Roma.
    expect(testo).toContain('1 dicembre 2026, 10:30')
    expect(testo).toContain('«Da dicembre apriamo anche il lunedì a pranzo.»')
    expect(testo).toContain('Lunedì: chiuso → 12:00–15:00')
    expect(testo).toContain('Martedì: 18:00–02:00 (fino al giorno dopo) (uguale)')
    expect(testo).toContain('Domenica: 18:00–02:00 (fino al giorno dopo) → aperto 24 ore (00:00–24:00)')
    expect(testo).toMatch(/backoffice/)
  })

  it('senza destinatari o senza richiesta, nessuna email', () => {
    expect(comunica().emailRichiestaOrari(cliente, richiesta(), [])).toBeNull()
    expect(comunica().emailRichiestaOrari(cliente, null, ['admin@example.it'])).toBeNull()
  })

  // L'indirizzo dell'admin è quello dell'account con cui entra nel
  // backoffice (il claim admin): nessun indirizzo scritto nel codice.
  it('i destinatari sono gli account col claim admin, attivi e con l’email', () => {
    const utenti = [
      { uid: 'a1', email: 'admin@example.it', customClaims: { admin: true } },
      { uid: 'a2', email: 'spento@example.it', customClaims: { admin: true }, disabled: true },
      { uid: 'a3', customClaims: { admin: true } },
      { uid: 'u1', email: 'titolare@example.it', customClaims: {} },
      { uid: 'u2', email: 'altro@example.it' },
      { uid: 'a4', email: 'ADMIN@example.it', customClaims: { admin: true } },
      { uid: 'a5', email: 'falso@example.it', customClaims: { admin: 'true' } },
    ]
    expect(comunica().indirizziAdmin(utenti)).toEqual(['admin@example.it'])
    expect(comunica().indirizziAdmin(undefined)).toEqual([])
  })

  it('l’id dell’email viene dalla richiesta: lo stesso per la stessa, un altro per la successiva', () => {
    const { idEmailRichiestaOrari } = comunica()
    const r = richiesta()
    expect(idEmailRichiestaOrari('u1', r)).toBe(idEmailRichiestaOrari('u1', { ...r }))
    expect(idEmailRichiestaOrari('u1', r)).toMatch(/^orari_u1_\d+$/)
    expect(idEmailRichiestaOrari('u1', { ...r, chiesta_il: '2027-01-10T09:00:00.000Z' })).not.toBe(idEmailRichiestaOrari('u1', r))
    expect(idEmailRichiestaOrari('u1', { ...r, chiesta_il: 'ieri' })).toBeNull()
  })

  // Una richiesta ripetuta (la callable rilanciata dal browser, un ritento)
  // non manda due email: il documento della coda ha l'id della richiesta e
  // si crea solo se non c'è.
  it('parte una volta sola per richiesta', async () => {
    const { accodaUnaVolta } = comunica()
    const coda = {}
    const db = {
      collection: (nome) => ({
        doc: (id) => ({
          async create(dati) {
            if (coda[`${nome}/${id}`]) throw Object.assign(new Error('6 ALREADY_EXISTS: Document already exists'), { code: 6 })
            coda[`${nome}/${id}`] = dati
          },
        }),
      }),
    }
    const posta = comunica().emailRichiestaOrari(cliente, richiesta(), ['admin@example.it'])
    const id = comunica().idEmailRichiestaOrari('u1', richiesta())
    expect(await accodaUnaVolta(db, id, { ...posta, motivo: 'richiesta_orari' })).toBe(true)
    expect(await accodaUnaVolta(db, id, { ...posta, motivo: 'richiesta_orari' })).toBe(false)
    expect(Object.keys(coda)).toEqual([`mail/${id}`])
    expect(coda[`mail/${id}`].to).toEqual(['admin@example.it'])
    // Senza email o senza id, niente.
    expect(await accodaUnaVolta(db, id, null)).toBe(false)
    expect(await accodaUnaVolta(db, null, posta)).toBe(false)
    // Un altro errore non si nasconde.
    const rotto = { collection: () => ({ doc: () => ({ create: async () => Promise.reject(new Error('permesso negato')) }) }) }
    await expect(accodaUnaVolta(rotto, id, posta)).rejects.toThrow('permesso negato')
  })
})

describe('il compito della sospensione', () => {
  it('«sospensione» è un tipo di compito delle scadenze', () => {
    expect(require('../functions/lib/scadenze.js').TIPI).toContain('sospensione')
  })
})

// Le Functions, provate sul testo come il resto di index.js
// (tests/registrazione.test.js): senza le dipendenze delle Functions il
// file non si carica.
describe('functions/index.js', () => {
  const index = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
  const corpo = (nome) => {
    const da = index.slice(index.indexOf(`exports.${nome} =`))
    return da.slice(0, da.indexOf('\n})'))
  }
  const funzione = (nome) => {
    const da = index.slice(index.indexOf(`function ${nome}(`))
    return da.slice(0, da.indexOf('\n}'))
  }

  it('correggiOrari e chiediCambioOrari: solo con l’accesso, e sempre sul cliente di chi chiama', () => {
    for (const nome of ['correggiOrari', 'chiediCambioOrari']) {
      const fn = corpo(nome)
      expect(fn, nome).toContain("if (!req.auth?.uid) throw new HttpsError('unauthenticated'")
      expect(fn, nome).toContain('const uid = req.auth.uid')
      expect(fn, nome).toContain('orari.cambiaOrari(db, uid,')
      expect(fn, nome).toContain('throw erroreOrari(e)')
    }
    expect(corpo('correggiOrari')).toContain('orari.correzioneDelTitolare(c, req.data?.giorni, { uid })')
    expect(corpo('chiediCambioOrari')).toContain('orari.richiestaDiCambio(c, req.data?.giorni, req.data?.motivo, { uid })')
  })

  // L'email all'admin parte dopo che la richiesta è salvata, una volta
  // sola (accodaUnaVolta con l'id della richiesta); se non parte, la
  // richiesta resta e l'admin la trova nel backoffice.
  it('chiediCambioOrari avvisa l’admin per email dopo aver salvato la richiesta; la correzione e la decisione no', () => {
    const fn = corpo('chiediCambioOrari')
    expect(fn).toContain('await avvisaAdminDellaRichiesta(uid, os.richiesta).catch(')
    expect(fn.indexOf('orari.cambiaOrari(')).toBeLessThan(fn.indexOf('avvisaAdminDellaRichiesta('))
    const avvisa = funzione('avvisaAdminDellaRichiesta')
    expect(avvisa).toContain('comunica.indirizziAdmin(')
    expect(avvisa).toContain('comunica.emailRichiestaOrari(')
    expect(avvisa).toContain('comunica.accodaUnaVolta(db, comunica.idEmailRichiestaOrari(uid, richiesta),')
    expect(corpo('correggiOrari')).not.toContain('avvisaAdmin')
    expect(corpo('decidiCambioOrari')).not.toContain('accodaEmail')
    expect(corpo('scriviOrariAdmin')).not.toContain('accodaEmail')
  })

  it('decidiCambioOrari: solo l’admin', () => {
    const fn = corpo('decidiCambioOrari')
    expect(fn).toContain("if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied'")
    expect(fn).toContain('orari.decisioneSullaRichiesta(c, scelta)')
  })

  // Daniele, 13/11/2026: «si». Il controllo dell'admin e dell'uid sta in
  // orariDellAdmin, provata sopra; la callable la chiama e basta. Le
  // scadenze si ricalcolano da licenzaSegueIlPiano, come per ogni cambio
  // degli orari (momentoSpostato).
  it('scriviOrariAdmin: passa da orariDellAdmin con l’accesso di chi chiama', () => {
    const fn = corpo('scriviOrariAdmin')
    expect(fn).toContain('return { orari_servizio: await orari.orariDellAdmin(db, req.auth, req.data) }')
    expect(fn).toContain('throw erroreOrari(e)')
    expect(corpo('licenzaSegueIlPiano')).toContain("JSON.stringify(prima?.orari_servizio?.giorni ?? null) !== JSON.stringify(dopo.orari_servizio?.giorni ?? null)")
  })

  it('i rifiuti degli orari diventano HttpsError col loro codice', () => {
    expect(funzione('erroreOrari')).toContain('if (e instanceof orari.OrariRifiutati) return new HttpsError(e.codice, e.message, e.dettagli || undefined)')
  })

  it('scriviLicenza trattiene lo stato per pagamento fino al suo momento e programma il compito; il compito riscrive solo se aspetta quel momento', () => {
    // Il momento e il controllo del compito sono le funzioni pure provate
    // sopra («il flusso della sospensione per pagamento»).
    expect(funzione('scriviLicenza')).toContain('const statoDal = orari.momentoDelloStato(ist, cliente, { oraTaglio: taglio.oraDelTaglio(bar.data()), giorniGrazia: opzioni.giorniGrazia })')
    expect(funzione('scriviLicenza')).toContain("await programma('sospensione', slug, sospensione)")
    expect(funzione('scriviLicenza')).toContain('sospensione_al: sospensioneAl')
    expect(funzione('verificaLicenza')).toContain('const statoDal = orari.momentoDelloStato(ist, cliente,')
    expect(index).toContain('if (!orari.compitoSospensioneValido(ist, quando)) return')
    expect(index).not.toContain('function momentoDelloStato(')
  })

  // Revisione del 13/11/2026, D7: il compito e «riattiva» insieme.
  it('scriviLicenza rilegge l’istanza prima di scrivere e, se lo stato è cambiato, ricalcola (al massimo tre giri)', () => {
    const fn = funzione('scriviLicenza')
    expect(fn).toContain('if (orari.statoCambiato(ist, (await ref.get()).data()) && tentativo < 3) return scriviLicenza(slug, { subito, tentativo: tentativo + 1 })')
    // La rilettura sta prima della scrittura della licenza.
    expect(fn.indexOf('orari.statoCambiato(')).toBeLessThan(fn.indexOf('istanza.doc(LICENZA_PROTETTA).set('))
  })

  // D5: «programmaScadenze» rimette in coda anche la sospensione che aspetta.
  it('programmaScadenze riprogramma il compito della sospensione', () => {
    expect(corpo('programmaScadenze')).toContain("if (ist.sospensione_al?.dal) await prova(`${slug} sospensione`, () => programma('sospensione', slug, ist.sospensione_al.dal))")
  })

  // Nota della revisione: niente «è di nuovo attivo» a chi non si è mai fermato.
  it('«riattiva» manda l’email solo se il locale si era fermato davvero', () => {
    const fn = funzione('eseguiAzionePagamento')
    expect(fn).toContain('const fermo = orari.fermoDavvero(')
    expect(fn.indexOf('const fermo = orari.fermoDavvero(')).toBeLessThan(fn.indexOf("await scriviStatoIstanza(cliente.slug, 'attiva', null)"))
    expect(fn).toContain('if (!fermo) return null')
  })

  it('la licenza si riscrive quando cambiano gli orari o l’ora dell’attivazione (valida_fino)', () => {
    expect(corpo('licenzaSegueIlPiano')).toContain('momentoSpostato')
  })
})

// Il documento del cliente non cresce senza fine: la traccia tiene gli
// ultimi cambi, e motivo e nota hanno un tetto.
describe('i tetti al documento del cliente', () => {
  it('la traccia tiene gli ultimi cambi; motivo e nota si accorciano', () => {
    const { STORIA_MASSIMA, TESTO_MASSIMO, correzioneDelTitolare, richiestaDiCambio, decisioneSullaRichiesta } = orari()
    const vecchia = Array.from({ length: STORIA_MASSIMA }, (_, i) => ({ tipo: 'correzione', quando: String(i) }))
    const cliente = { orari_servizio: { giorni: SERA, impostati_il: '2026-11-13T10:00:00.000Z', richiesta: null, storia: vecchia } }
    const { orari_servizio: corretto } = correzioneDelTitolare(cliente, tutti(aperto('07:00', '15:00')), { uid: 'u1', adesso: new Date('2026-11-14T10:00:00Z') })
    expect(corretto.storia).toHaveLength(STORIA_MASSIMA)
    expect(corretto.storia[0].quando).toBe('1')
    expect(corretto.storia.at(-1).tipo).toBe('correzione')
    const dopo = new Date('2026-12-01T10:00:00Z')
    const lungo = 'x'.repeat(TESTO_MASSIMO + 500)
    const conRichiesta = { ...cliente, ...richiestaDiCambio(cliente, tutti(aperto('07:00', '15:00')), lungo, { uid: 'u1', adesso: dopo }) }
    expect(conRichiesta.orari_servizio.richiesta.motivo).toHaveLength(TESTO_MASSIMO)
    const deciso = decisioneSullaRichiesta(conRichiesta, { esito: 'rifiutata', admin: 'admin', adesso: dopo, nota: lungo })
    expect(deciso.orari_servizio.storia.at(-1).nota).toHaveLength(TESTO_MASSIMO)
    expect(deciso.orari_servizio.storia).toHaveLength(STORIA_MASSIMA)
  })
})

// ── IL FLUSSO DELLA SOSPENSIONE PER PAGAMENTO (revisione del 13/11/2026) ──
// D1: valida_fino e il momento della sospensione non devono differire di
// un giorno. D3: il momento e il controllo del compito sono funzioni pure,
// provate col flusso intero: decisione, attesa, compito, pagamento nel
// mezzo, sospensione dell'admin, compito vecchio o ripetuto.
describe('il flusso della sospensione per pagamento', () => {
  const { licenzaDaScrivere } = require('../functions/lib/taglio.js')
  // Una subscription ancorata alle 09:15:59 UTC, l'abbonamento attivato alle
  // 09:16:02 UTC (le 10:16 di Roma). Il periodo pagato finisce il 16/12:
  // con 7 giorni di grazia la scadenza è il 23/12 alle 09:15:59 UTC.
  const STRIPE = {
    slug: 'bar-mario',
    piano: 'base',
    moduli: [],
    terminali: 1,
    abbonamento: { origine: 'stripe', stato: 'non pagato', pagato_fino: '2026-12-16T09:15:59.000Z', dal: '2026-11-16T09:16:02.000Z' },
    orari_servizio: { giorni: SERA, impostati_il: '2026-11-16T09:16:02.000Z' },
  }
  // La regia decide qualche secondo dopo la scadenza (il compito del
  // pagamento, poi la domanda a Stripe).
  const DECISA = { stato: 'attiva', licenza_stato: 'sospesa', licenza_per: 'pagamento', licenza_motivo: 'pagamento non ricevuto', licenza_dal: '2026-12-23T09:16:03.000Z' }

  it('D1: decisa pochi secondi dopo la scadenza, la sospensione cade dove cade valida_fino, non il giorno dopo', () => {
    const { momentoDelloStato, quandoSospendere } = orari()
    const validaFino = licenzaProtetta({ stato: 'attiva' }, STRIPE, { oraTaglio: 5 }).valida_fino
    // Le 10:16 di Roma del 23/12, fuori servizio (il locale apre alle 18).
    expect(validaFino).toBe('2026-12-23T09:16:00.000Z')
    expect(momentoDelloStato(DECISA, STRIPE, { oraTaglio: 5 })).toBe(validaFino)
    // Partendo dalla decisione sarebbe stato il 24/12: il difetto trovato.
    expect(quandoSospendere(STRIPE, { adesso: new Date(DECISA.licenza_dal), oraTaglio: 5 }).toISOString()).toBe('2026-12-24T09:16:00.000Z')
    // Il momento è già passato: la licenza sospesa si scrive subito, come
    // l'app senza rete, che si è fermata a valida_fino.
    const attiva = { stato: 'attiva', motivo: null, dal: null, piano: 'base' }
    const sospesa = { ...attiva, stato: 'sospesa', motivo: 'pagamento non ricevuto' }
    expect(licenzaDaScrivere(attiva, sospesa, { statoDal: validaFino, adesso: new Date(DECISA.licenza_dal) })).toMatchObject({ licenza: { stato: 'sospesa' }, sospensione: null })
  })

  it('D1: decisa oltre un’ora dopo la scadenza (un compito rilanciato), si parte dalla decisione', () => {
    const { momentoDelloStato, FINESTRA_SCADENZA } = orari()
    expect(FINESTRA_SCADENZA).toBe(60 * 60 * 1000)
    const tardi = { ...DECISA, licenza_dal: '2026-12-25T15:00:00.000Z' }
    // Venerdì 25/12 alle 16 di Roma: le 10:16 di sabato 26.
    expect(momentoDelloStato(tardi, STRIPE, { oraTaglio: 5 })).toBe('2026-12-26T09:16:00.000Z')
    // Decisa prima della scadenza (Stripe ha finito i tentativi prima): dalla decisione.
    const prima = { ...DECISA, licenza_dal: '2026-12-20T15:00:00.000Z' }
    expect(momentoDelloStato(prima, STRIPE, { oraTaglio: 5 })).toBe('2026-12-21T09:16:00.000Z')
  })

  it('D3: nessun momento per uno stato che non è fermo per il pagamento: attivo, o dell’admin (immediato)', () => {
    const { momentoDelloStato } = orari()
    expect(momentoDelloStato({ ...DECISA, licenza_stato: 'attiva', licenza_per: null }, STRIPE)).toBeNull()
    expect(momentoDelloStato({ ...DECISA, licenza_per: 'admin' }, STRIPE)).toBeNull()
    expect(momentoDelloStato({ ...DECISA, licenza_per: 'titolare', licenza_stato: 'chiusa' }, STRIPE)).toBeNull()
    expect(momentoDelloStato({ ...DECISA, licenza_dal: null }, STRIPE)).toBeNull()
    // La chiusura per pagamento (la disdetta) segue la stessa strada.
    expect(momentoDelloStato({ ...DECISA, licenza_stato: 'chiusa', licenza_motivo: 'abbonamento disdetto' }, STRIPE, { oraTaglio: 5 })).toBe('2026-12-23T09:16:00.000Z')
  })

  it('D3: il compito vale solo per il momento atteso e lo stato ancora fermo; vecchio o dopo «riattiva» non scrive; ripetuto dà lo stesso esito', () => {
    const { compitoSospensioneValido } = orari()
    const quando = '2026-11-19T01:00:00.000Z'
    const inAttesa = { ...DECISA, licenza_dal: '2026-11-18T09:00:00.000Z', sospensione_al: { dal: quando, stato: 'sospesa' } }
    expect(compitoSospensioneValido(inAttesa, quando)).toBe(true)
    // Ripetuto (Cloud Tasks ritenta): stesso esito finché nulla cambia.
    expect(compitoSospensioneValido(inAttesa, new Date(quando))).toBe(true)
    // Un compito vecchio, per un altro momento.
    expect(compitoSospensioneValido(inAttesa, '2026-11-18T01:00:00.000Z')).toBe(false)
    // Dopo «riattiva» (pagato nel mezzo): stato attivo e sospensione_al vuoto.
    expect(compitoSospensioneValido({ ...inAttesa, licenza_stato: 'attiva', licenza_per: null, sospensione_al: null }, quando)).toBe(false)
    // Già scritta: scriviLicenza ha vuotato sospensione_al, il compito ripetuto non fa niente.
    expect(compitoSospensioneValido({ ...inAttesa, sospensione_al: null }, quando)).toBe(false)
    // Diventata dell'admin nel frattempo («Sospendi subito»).
    expect(compitoSospensioneValido({ ...inAttesa, licenza_per: 'admin' }, quando)).toBe(false)
    expect(compitoSospensioneValido(inAttesa, 'domani')).toBe(false)
  })

  it('D3: dall’inizio alla fine, con «riattiva» nel mezzo', () => {
    const { momentoDelloStato } = orari()
    const attiva = { stato: 'attiva', motivo: null, dal: null, piano: 'base' }
    const sospesa = { ...attiva, stato: 'sospesa', motivo: 'pagamento non ricevuto', dal: '2026-11-18T09:00:00.000Z' }
    const ist = { ...DECISA, licenza_dal: '2026-11-18T09:00:00.000Z' }
    const cliente = { ...STRIPE, abbonamento: { ...STRIPE.abbonamento, pagato_fino: '2026-11-11T09:00:00.000Z', dal: '2026-09-01T19:00:00.000Z' } }
    // Decisa mercoledì 18/11 alle 10 di Roma; attivato alle 21: in servizio,
    // quindi giovedì alle 2.
    const statoDal = momentoDelloStato(ist, cliente, { oraTaglio: 5 })
    expect(statoDal).toBe('2026-11-19T01:00:00.000Z')
    // Alla decisione: trattenuta, e il compito si programma.
    expect(licenzaDaScrivere(attiva, sospesa, { statoDal, adesso: new Date('2026-11-18T09:00:05Z') })).toMatchObject({ licenza: { stato: 'attiva' }, sospensione: statoDal })
    // Riscritta più tardi (un altro cambio): il momento non si sposta.
    expect(momentoDelloStato(ist, cliente, { oraTaglio: 5 })).toBe(statoDal)
    // Al compito: arriva.
    expect(licenzaDaScrivere(attiva, sospesa, { statoDal, adesso: new Date(statoDal) })).toMatchObject({ licenza: { stato: 'sospesa' }, sospensione: null })
    // Pagato nel mezzo: «riattiva» rimette l'istanza attiva, nessun momento,
    // la licenza resta attiva e sospensione_al torna vuoto.
    const riattivata = { ...ist, licenza_stato: 'attiva', licenza_per: null }
    expect(momentoDelloStato(riattivata, cliente, { oraTaglio: 5 })).toBeNull()
    expect(licenzaDaScrivere(attiva, attiva, { statoDal: null, adesso: new Date('2026-11-18T20:00:00Z') })).toMatchObject({ licenza: { stato: 'attiva' }, sospensione: null })
  })

  it('D7: lo stato cambiato fra la lettura e la scrittura si riconosce', () => {
    const { statoCambiato } = orari()
    expect(statoCambiato(DECISA, { ...DECISA })).toBe(false)
    // Il momento atteso spostato o vuotato da un'altra scrittura (D7).
    expect(statoCambiato(DECISA, { ...DECISA, sospensione_al: { dal: 'x' } })).toBe(true)
    const inAttesa = { ...DECISA, sospensione_al: { dal: '2026-12-24T09:16:00.000Z', stato: 'sospesa' } }
    expect(statoCambiato(inAttesa, { ...inAttesa, sospensione_al: { ...inAttesa.sospensione_al } })).toBe(false)
    expect(statoCambiato(inAttesa, { ...inAttesa, sospensione_al: null })).toBe(true)
    expect(statoCambiato(DECISA, { ...DECISA, licenza_stato: 'attiva' })).toBe(true)
    expect(statoCambiato(DECISA, { ...DECISA, licenza_per: 'admin' })).toBe(true)
    expect(statoCambiato(DECISA, { ...DECISA, licenza_dal: '2026-12-24T00:00:00.000Z' })).toBe(true)
    expect(statoCambiato(null, undefined)).toBe(false)
  })

  it('l’email «di nuovo attivo» solo per un locale che si era fermato davvero', () => {
    const { fermoDavvero } = orari()
    expect(fermoDavvero({ ...DECISA, sospensione_al: null })).toBe(true)
    expect(fermoDavvero({ ...DECISA, licenza_stato: 'chiusa' })).toBe(true)
    // La sospensione aspettava ancora il suo momento: mai fermo.
    expect(fermoDavvero({ ...DECISA, sospensione_al: { dal: '2026-12-24T09:16:00.000Z', stato: 'sospesa' } })).toBe(false)
    expect(fermoDavvero({ ...DECISA, licenza_stato: 'attiva' })).toBe(false)
    expect(fermoDavvero(undefined)).toBe(false)
  })

  it('l’uid che arriva dal browser (l’admin) si controlla prima di farne un percorso', async () => {
    const { cambiaOrari } = orari()
    const db = { doc: () => ({}), runTransaction: async () => ({}) }
    for (const uid of ['../impostazioni/regia', 'u1/altro', 'a'.repeat(129), 'uid con spazi']) {
      await expect(cambiaOrari(db, uid, (c) => c), uid).rejects.toMatchObject({ codice: 'invalid-argument' })
    }
  })
})
