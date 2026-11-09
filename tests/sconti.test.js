'use strict'

// I CODICI SCONTO (REQ-FLOTTA-028). L'utente, 02/11/2026, sulla Tana:
// «Dobbiamo trattarlo come abbonamento premium e tracciare i moduli attivi.
// Ha un codice sconto allegato con una durata illimitata per avere tutti i
// servizi attivi.» I codici stanno nella regia; con Stripe diventeranno
// coupon.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { scontoAttivo, prezzoConSconto, scontoDetto, usiDetti } from '../src/lib/sconti.js'


const require = createRequire(import.meta.url)
const s = require('../functions/lib/sconti.js')
const { licenzaProtetta } = require('../functions/lib/licenza.js')
const { scadenzaPagamento } = require('../functions/lib/scadenze.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const TANA = { codice: 'TANA-100', percentuale: 100, durata_mesi: null, usi_massimi: null, descrizione: 'La Tana', attivo: true }
const aMano = { slug: 'tana-drink', piano: 'completo', moduli: [], abbonamento: { stato: 'attivo', origine: 'interna', dal: '2026-10-24T00:00:00.000Z' } }

describe('un codice', () => {
  it('pulito: maiuscolo, percentuale da 1 a 100, durata in mesi o illimitata', () => {
    expect(s.scontoPulito({ codice: ' tana-100 ', percentuale: 100, durata_mesi: '', descrizione: ' La Tana ' })).toEqual(TANA)
    expect(s.scontoPulito({ codice: 'PROVA20', percentuale: 20, durata_mesi: 3 })).toMatchObject({ codice: 'PROVA20', percentuale: 20, durata_mesi: 3 })
  })

  it('niente codici strani, percentuali o durate fuori misura', () => {
    expect(s.scontoPulito({ codice: 'ab', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    expect(s.scontoPulito({ codice: 'X Y Z', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    for (const percentuale of [0, 101, 12.5, 'tanto']) expect(s.scontoPulito({ codice: 'OK1', percentuale }).errore).toMatch(/Percentuale/)
    for (const durata_mesi of [0, 121, 1.5]) expect(s.scontoPulito({ codice: 'OK1', percentuale: 10, durata_mesi }).errore).toMatch(/Durata/)
  })

  it('la fine di uno sconto a tempo: tanti mesi dal giorno in cui si applica', () => {
    expect(s.fineSconto('2026-11-02T10:00:00.000Z', 3)).toBe('2027-02-02')
    expect(s.fineSconto('2026-11-02T10:00:00.000Z', null)).toBeNull()
  })
})

describe('applicato a un cliente', () => {
  it('100% illimitato: abbonamento attivo che non si paga e non scade, moduli dal piano', () => {
    const { patch } = s.scontoApplicato(aMano, TANA, ADESSO)
    expect(patch.sconto).toEqual({ codice: 'TANA-100', percentuale: 100, durata_mesi: null, dal: ADESSO.toISOString(), fino: null })
    expect(patch.abbonamento).toMatchObject({ stato: 'attivo', origine: 'sconto', pagato_fino_al: null, dal: '2026-10-24T00:00:00.000Z' })
    const cliente = { ...aMano, ...patch }
    expect(scadenzaPagamento(cliente)).toBeNull()
    const lic = licenzaProtetta({ stato: 'attiva', interna: true }, cliente)
    expect(lic.valida_fino).toBeNull()
    // Tutti i servizi attivi: il piano Completo, fatture comprese.
    expect(Object.values(lic.moduli).every((v) => v === true)).toBe(true)
    expect(lic.moduli.fatture).toBe(true)
  })

  it('100% a tempo: pagato fino alla fine dello sconto, poi grazia e sospensione di sempre', () => {
    const { patch } = s.scontoApplicato(aMano, { ...TANA, codice: 'ANNO-1', durata_mesi: 12 }, ADESSO)
    expect(patch.abbonamento).toMatchObject({ stato: 'attivo', origine: 'manuale', pagato_fino_al: '2027-11-02' })
    expect(scadenzaPagamento({ ...aMano, ...patch })).toBe('2027-11-09T23:59:59.000Z')
  })

  it('uno sconto parziale cambia solo il prezzo, non il pagamento', () => {
    const { patch } = s.scontoApplicato(aMano, { ...TANA, codice: 'META', percentuale: 50 }, ADESSO)
    expect(patch).toEqual({ sconto: expect.objectContaining({ codice: 'META', percentuale: 50 }) })
  })

  it('niente con un codice disattivato, un 100% su Stripe o su un Free', () => {
    expect(s.scontoApplicato(aMano, { ...TANA, attivo: false }).errore).toMatch(/disattivato/)
    expect(s.scontoApplicato(aMano, null).errore).toMatch(/sconosciuto/)
    expect(s.scontoApplicato({ abbonamento: { origine: 'stripe' } }, TANA).errore).toMatch(/Stripe/)
    expect(s.scontoApplicato({ abbonamento: { origine: 'gratuito' } }, TANA).errore).toMatch(/Free/)
    // Un parziale su Stripe sì: cambia il prezzo mostrato.
    expect(s.scontoApplicato({ abbonamento: { origine: 'stripe' } }, { ...TANA, percentuale: 20 }).errore).toBeUndefined()
  })

  it('tolto un 100% illimitato, è un piano a mano pagato fino a oggi', () => {
    expect(s.scontoTolto({ abbonamento: { stato: 'attivo', origine: 'sconto' } }, ADESSO).patch).toEqual({ sconto: null, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-02' } })
    expect(s.scontoTolto({ abbonamento: { origine: 'manuale', pagato_fino_al: '2027-01-01' } }, ADESSO).patch).toEqual({ sconto: null })
  })
})

// L'utente, 02/11/2026: «Aggiungiamo limite di utilizzo del codice».
describe('il limite di usi', () => {
  const DIECI = { ...TANA, codice: 'DIECI', percentuale: 20, usi_massimi: 10, usi: 0 }
  const fra = (minuti) => new Date(ADESSO.getTime() + minuti * 60000)

  it('si scrive alla creazione: un intero da 1 a 100000, o vuoto per nessun limite', () => {
    expect(s.scontoPulito({ codice: 'DIECI', percentuale: 20, usi_massimi: '10' }).usi_massimi).toBe(10)
    expect(s.scontoPulito({ codice: 'DIECI', percentuale: 20, usi_massimi: '' }).usi_massimi).toBeNull()
    for (const v of [0, -1, 2.5, 'tanti', 100001]) expect(s.scontoPulito({ codice: 'DIECI', percentuale: 20, usi_massimi: v }).errore).toMatch(/Usi da 1 a 100000/)
    expect(s.limitePulito(null)).toEqual({ usi_massimi: null })
  })

  it('esaurito quando gli usi presi più i Checkout in corso arrivano al limite; senza limite mai', () => {
    expect(s.esaurito({ ...DIECI, usi: 9 }, ADESSO)).toBe(false)
    expect(s.esaurito({ ...DIECI, usi: 10 }, ADESSO)).toBe(true)
    const conUno = { ...DIECI, usi: 9, prenotazioni: { altro: { scade_il: fra(20).toISOString() } } }
    expect(s.esaurito(conUno, ADESSO)).toBe(true)
    // La prenotazione del titolare stesso non gli toglie il suo uso.
    expect(s.esaurito(conUno, ADESSO, 'altro')).toBe(false)
    // Una prenotazione scaduta non tiene niente.
    expect(s.esaurito({ ...conUno, prenotazioni: { altro: { scade_il: fra(-1).toISOString() } } }, ADESSO)).toBe(false)
    expect(s.esaurito({ ...TANA, usi: 5000 }, ADESSO)).toBe(false)
  })

  it('l’ultimo uso lo tiene da parte un Checkout solo: il secondo trova il codice esaurito', () => {
    const quasi = { ...DIECI, usi: 9 }
    const primo = s.prenotaUso(quasi, 'u1', fra(35), ADESSO)
    expect(primo.esito).toBe('prenotato')
    expect(Date.parse(primo.prenotazioni.u1.scade_il)).toBe(fra(45).getTime())
    expect(s.prenotaUso({ ...quasi, prenotazioni: primo.prenotazioni }, 'u2', fra(35), ADESSO).esito).toBe('esaurito')
    // Lo stesso titolare che riapre il Checkout rinnova la sua.
    expect(s.prenotaUso({ ...quasi, prenotazioni: primo.prenotazioni }, 'u1', fra(40), ADESSO).esito).toBe('prenotato')
    // Le scadute si tolgono.
    const vecchie = { ...DIECI, prenotazioni: { via: { scade_il: fra(-5).toISOString() } } }
    expect(s.prenotaUso(vecchie, 'u1', fra(35), ADESSO).prenotazioni).not.toHaveProperty('via')
  })

  it('un uso confermato fa salire il contatore e toglie la prenotazione; una sessione non nata la libera', () => {
    const tenuto = { ...DIECI, usi: 3, prenotazioni: { u1: { scade_il: fra(30).toISOString() }, u2: { scade_il: fra(30).toISOString() } } }
    expect(s.usoConfermato(tenuto, 'u1')).toEqual({ usi: 4, prenotazioni: { u2: tenuto.prenotazioni.u2 } })
    expect(s.usoConfermato({ codice: 'X' }, 'u1')).toEqual({ usi: 1, prenotazioni: {} })
    expect(s.prenotazioneTolta(tenuto, 'u2')).toEqual({ prenotazioni: { u1: tenuto.prenotazioni.u1 } })
  })

  it('vale anche per l’admin: un codice esaurito non si applica, e chi lo ha già non consuma un altro uso', () => {
    const pieno = { ...DIECI, usi: 10 }
    expect(s.scontoApplicato(aMano, pieno, ADESSO).errore).toMatch(/esaurito.*alza il limite/)
    expect(s.scontoApplicato(aMano, { ...DIECI, usi: 2 }, ADESSO).uso).toBe(true)
    const giaSuo = { ...aMano, sconto: { codice: 'DIECI', percentuale: 20 } }
    expect(s.scontoApplicato(giaSuo, pieno, ADESSO)).toMatchObject({ uso: false })
    expect(s.scontoApplicato(giaSuo, pieno, ADESSO).errore).toBeUndefined()
  })

  it('nel backoffice: quanti usi, su quanti, ed esaurito', () => {
    expect(usiDetti({ usi: 1 })).toBe('1 uso')
    expect(usiDetti({})).toBe('0 usi')
    expect(usiDetti({ usi: 3, usi_massimi: 10 })).toBe('3 usi su 10')
    expect(usiDetti({ usi: 10, usi_massimi: 10 })).toBe('10 usi su 10, esaurito')
  })
})

describe('nel sito', () => {
  const conSconto = (extra = {}) => ({ sconto: { codice: 'META', percentuale: 50, fino: null, ...extra } })

  it('il prezzo dopo lo sconto, al centesimo', () => {
    expect(prezzoConSconto(49, conSconto(), ADESSO)).toBe(24.5)
    expect(prezzoConSconto(49, { sconto: { codice: 'TANA-100', percentuale: 100 } }, ADESSO)).toBe(0)
    expect(prezzoConSconto(33, { sconto: { codice: 'X', percentuale: 33 } }, ADESSO)).toBe(22.11)
    expect(prezzoConSconto(49, {}, ADESSO)).toBe(49)
  })

  it('uno sconto a tempo finito non vale più', () => {
    expect(scontoAttivo(conSconto({ fino: '2026-11-02' }), ADESSO)).not.toBeNull()
    expect(scontoAttivo(conSconto({ fino: '2026-11-01' }), ADESSO)).toBeNull()
    expect(prezzoConSconto(49, conSconto({ fino: '2026-10-01' }), ADESSO)).toBe(49)
    expect(scontoAttivo({ sconto: { codice: 'X' } }, ADESSO)).toBeNull()
  })

  it('a parole', () => {
    expect(scontoDetto({ sconto: { codice: 'TANA-100', percentuale: 100, fino: null } }, ADESSO)).toBe('TANA-100, 100%, illimitato')
    expect(scontoDetto(conSconto({ fino: '2026-12-31' }), ADESSO)).toMatch(/^META, 50% fino al 31\/12\/2026$/)
    expect(scontoDetto({}, ADESSO)).toBeNull()
  })
})

// LE REGOLE si provano sull'emulatore (REQ-DEV-007): che il titolare cambi
// solo i suoi dati anagrafici e mai moduli, terminali, prove o sconto
// (verifica del 02/11/2026) sta in tests/regole/clienti.test.js; che i
// codici li legga solo l'admin e li scrivano solo le Functions in
// tests/regole/registri.test.js.
