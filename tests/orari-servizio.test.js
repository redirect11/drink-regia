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

  it('apertura e chiusura non coincidono', () => {
    expect(orari().problemiOrari({ ...SERA, gio: aperto('18:00', '18:00') })).toHaveProperty('gio')
  })

  it('almeno un giorno aperto', () => {
    const problemi = orari().problemiOrari(tutti(CHIUSO))
    expect(problemi).toHaveProperty('orari')
    expect(problemi.orari).toMatch(/almeno un giorno/i)
  })

  // Fuori servizio deve esserci posto per la sospensione: la chiusura di un
  // giorno sta almeno un'ora prima dell'apertura del giorno dopo, che è il
  // margine prima dell'apertura (criterio 3). Domenica guarda a lunedì.
  it('fra la chiusura di un giorno e l’apertura del giorno dopo c’è almeno un’ora', () => {
    const { problemiOrari } = orari()
    expect(problemiOrari({ ...tutti(aperto('08:00', '07:30')) })).toHaveProperty('lun')
    expect(problemiOrari({ ...tutti(CHIUSO), dom: aperto('20:00', '07:30'), lun: aperto('08:00', '12:00') })).toHaveProperty('dom')
    // Un'ora esatta basta.
    expect(problemiOrari({ ...tutti(CHIUSO), mar: aperto('20:00', '07:00'), mer: aperto('08:00', '12:00') })).toEqual({})
    // Il giorno dopo chiuso: la chiusura può arrivare a qualunque ora.
    expect(problemiOrari({ ...tutti(CHIUSO), mar: aperto('20:00', '11:00') })).toEqual({})
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
    for (const sbagliati of [undefined, tutti(CHIUSO), { ...SERA, mar: aperto('18:00', '18:00') }]) {
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
    // 23:59:59 UTC, cioè mercoledì all'1 di Roma. Le 21 di mercoledì sono
    // in servizio: giovedì alle 2.
    const lic = licenzaProtetta({ stato: 'attiva' }, cliente, { adesso: new Date('2026-11-13T10:00:00Z'), oraTaglio: 5 })
    expect(lic.valida_fino).toBe('2026-11-19T01:00:00.000Z')
    // Senza orari resta com'era: il taglio dopo la scadenza.
    const { orari_servizio: _, ...senza } = cliente
    expect(licenzaProtetta({ stato: 'attiva' }, senza, { adesso: new Date('2026-11-13T10:00:00Z'), oraTaglio: 5 }).valida_fino).toBe('2026-11-18T04:00:00.000Z')
  })
})
