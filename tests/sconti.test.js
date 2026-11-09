'use strict'

// I CODICI SCONTO (REQ-FLOTTA-028). L'utente, 02/11/2026, sulla Tana:
// «Dobbiamo trattarlo come abbonamento premium e tracciare i moduli attivi.
// Ha un codice sconto allegato con una durata illimitata per avere tutti i
// servizi attivi.» I codici stanno nella regia; con Stripe diventeranno
// coupon.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { scontoAttivo, prezzoConSconto, scontoDetto, usiDetti, CODICE_VALIDO, REGOLA_CODICE, LIMITE_PER_IL_CENTO, generaCodice } from '../src/lib/sconti.js'


const require = createRequire(import.meta.url)
const s = require('../functions/lib/sconti.js')
const { licenzaProtetta } = require('../functions/lib/licenza.js')
const { scadenzaPagamento } = require('../functions/lib/scadenze.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const TANA = { codice: 'TANA-100', percentuale: 100, durata_mesi: null, usi_massimi: null, descrizione: 'La Tana', attivo: true }
const aMano = { slug: 'tana-drink', piano: 'completo', moduli: [], abbonamento: { stato: 'attivo', origine: 'interna', dal: '2026-10-24T00:00:00.000Z' } }

describe('un codice', () => {
  it('pulito: maiuscolo, percentuale da 1 a 100, durata in mesi o illimitata', () => {
    expect(s.scontoPulito({ codice: ' tana-100 ', percentuale: 100, durata_mesi: '', usi_massimi: 1, descrizione: ' La Tana ' })).toEqual({ ...TANA, usi_massimi: 1 })
    expect(s.scontoPulito({ codice: 'PROVA-20', percentuale: 20, durata_mesi: 3 })).toMatchObject({ codice: 'PROVA-20', percentuale: 20, durata_mesi: 3 })
  })

  it('niente codici strani, percentuali o durate fuori misura', () => {
    expect(s.scontoPulito({ codice: 'ab', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    expect(s.scontoPulito({ codice: 'X Y Z', percentuale: 10 }).errore).toMatch(/Codice non valido/)
    for (const percentuale of [0, 101, 12.5, 'tanto']) expect(s.scontoPulito({ codice: 'CODICE-01', percentuale }).errore).toMatch(/Percentuale/)
    for (const durata_mesi of [0, 121, 1.5]) expect(s.scontoPulito({ codice: 'CODICE-01', percentuale: 10, durata_mesi }).errore).toMatch(/Durata/)
  })

  // Audit del 09/11/2026, finding 15: un codice si indovinava.
  it('un codice nuovo ha almeno 8 caratteri e 2 cifre; un 100% ha sempre un limite di usi', () => {
    for (const codice of ['TANA', 'PROVA20', 'SOLOLETTERE', 'UNACIFRA1', 'TANA 100']) expect(s.scontoPulito({ codice, percentuale: 10 }).errore, codice).toBe(s.REGOLA_CODICE)
    for (const codice of ['TANA-100', 'PROVA-20', 'A1B2C3D4', '2026-NATALE', 'BARCA-4821']) expect(s.scontoPulito({ codice, percentuale: 10 }).codice, codice).toBe(codice)
    expect(s.scontoPulito({ codice: 'TANA-100', percentuale: 100 }).errore).toBe(s.LIMITE_PER_IL_CENTO)
    expect(s.scontoPulito({ codice: 'TANA-100', percentuale: 100, usi_massimi: '' }).errore).toBe(s.LIMITE_PER_IL_CENTO)
    expect(s.scontoPulito({ codice: 'TANA-100', percentuale: 100, usi_massimi: 3 })).toMatchObject({ percentuale: 100, usi_massimi: 3 })
    expect(s.scontoPulito({ codice: 'TANA-99X', percentuale: 99 })).toMatchObject({ percentuale: 99, usi_massimi: null })
    // I codici creati prima (TANA, PROVA20) si cercano ancora: i vincoli
    // valgono alla creazione.
    expect(s.CODICE.test('TANA')).toBe(true)
    expect(s.CODICE.test('PROVA20')).toBe(true)
    expect(s.CODICE_NUOVO.test('PROVA20')).toBe(false)
    // Il sito dice le stesse cose, parola per parola, prima di chiamare.
    expect(CODICE_VALIDO.source).toBe(s.CODICE_NUOVO.source)
    expect(REGOLA_CODICE).toBe(s.REGOLA_CODICE)
    expect(LIMITE_PER_IL_CENTO).toBe(s.LIMITE_PER_IL_CENTO)
  })

  it('il codice proposto dal backoffice: cinque lettere senza O e I, un trattino, quattro cifre, dal generatore casuale', () => {
    expect(generaCodice((n) => Uint32Array.from({ length: n }, (_, i) => i * 7 + 3))).toBe('DLTAH-8529')
    for (let n = 0; n < 50; n++) {
      const c = generaCodice()
      expect(c).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[0-9]{4}$/)
      expect(CODICE_VALIDO.test(c)).toBe(true)
      expect(s.scontoPulito({ codice: c, percentuale: 10 }).codice).toBe(c)
    }
    expect(new Set(Array.from({ length: 20 }, () => generaCodice())).size).toBeGreaterThan(1)
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
  const DIECI = { ...TANA, codice: 'DIECI-10', percentuale: 20, usi_massimi: 10, usi: 0 }
  const fra = (minuti) => new Date(ADESSO.getTime() + minuti * 60000)

  it('si scrive alla creazione: un intero da 1 a 100000, o vuoto per nessun limite', () => {
    expect(s.scontoPulito({ codice: 'DIECI-10', percentuale: 20, usi_massimi: '10' }).usi_massimi).toBe(10)
    expect(s.scontoPulito({ codice: 'DIECI-10', percentuale: 20, usi_massimi: '' }).usi_massimi).toBeNull()
    for (const v of [0, -1, 2.5, 'tanti', 100001]) expect(s.scontoPulito({ codice: 'DIECI-10', percentuale: 20, usi_massimi: v }).errore).toMatch(/Usi da 1 a 100000/)
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
    const giaSuo = { ...aMano, sconto: { codice: 'DIECI-10', percentuale: 20 } }
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

describe('le regole', () => {
  const regole = readFileSync('firestore.rules', 'utf8')

  // Verifica del 02/11/2026: la regola vietava un elenco e lasciava passare
  // moduli, terminali e prove, che la regia trasforma in licenza.
  it('il titolare cambia solo i suoi dati anagrafici, mai moduli, terminali, prove o sconto', () => {
    expect(regole).toContain("affectedKeys().hasOnly(['locale', 'fatturazione', 'referente', 'consensi'])")
    expect(regole).not.toContain("affectedKeys().hasAny(['piano', 'abbonamento', 'uid', 'slug', 'interna', 'esistente'])")
  })

  it('i codici li legge solo l’admin, e li scrivono solo le Functions', () => {
    const blocco = regole.slice(regole.indexOf('match /sconti/{codice}'), regole.indexOf('match /impostazioni/{doc}'))
    expect(blocco).toContain('allow read: if admin();')
    expect(blocco).toContain('allow write: if false;')
  })
})

// I TENTATIVI SUI CODICI (audit del 09/11/2026, finding 15): la verifica
// diceva se un codice esiste, senza limite: un oracolo per indovinarli.
describe('i tentativi sui codici', () => {
  const T0 = new Date('2026-11-09T10:00:00.000Z')
  const dopo = (minuti) => new Date(T0.getTime() + minuti * 60 * 1000)

  it('il primo tentativo apre la finestra; i seguenti contano; passata l’ora si riparte da uno', () => {
    const t1 = s.tentativoFallito(undefined, T0)
    expect(t1).toEqual({ conteggio: 1, finestra_da: T0.toISOString() })
    const t2 = s.tentativoFallito(t1, dopo(10))
    expect(t2).toEqual({ conteggio: 2, finestra_da: T0.toISOString() })
    expect(s.tentativoFallito(t2, dopo(60))).toEqual({ conteggio: 1, finestra_da: dopo(60).toISOString() })
    expect(s.tentativoFallito({ conteggio: 'x', finestra_da: 'non una data' }, T0)).toEqual({ conteggio: 1, finestra_da: T0.toISOString() })
  })

  it('dieci in un’ora sono troppi; all’undicesimo si aspetta; passata l’ora no', () => {
    let t
    for (let n = 0; n < 9; n++) {
      t = s.tentativoFallito(t, dopo(n))
      expect(s.troppiTentativi(t, dopo(n))).toBe(false)
    }
    t = s.tentativoFallito(t, dopo(9))
    expect(t.conteggio).toBe(10)
    expect(s.troppiTentativi(t, dopo(9))).toBe(true)
    expect(s.troppiTentativi(t, dopo(59))).toBe(true)
    expect(s.troppiTentativi(t, dopo(60))).toBe(false)
    expect(s.troppiTentativi(undefined, T0)).toBe(false)
    expect(s.troppiTentativi(null, T0)).toBe(false)
    expect(s.TENTATIVI_MAX).toBe(10)
    expect(s.FINESTRA_TENTATIVI_MS).toBe(3600000)
    expect(s.TROPPI_TENTATIVI).toBe('Troppi tentativi, riprova fra un’ora.')
  })

  // Le Functions: il controllo prima di cercare, il conteggio a ogni
  // fallimento, l'azzeramento al successo. Sul testo, come il resto.
  it('verificaCodiceSconto e attivaConCodice: rifiutano con resource-exhausted, contano i fallimenti, azzerano al successo', () => {
    const index = readFileSync('functions/index.js', 'utf8')
    const fn = (nome) => {
      const da = index.indexOf(`exports.${nome} =`)
      return index.slice(da, index.indexOf('\n})', da))
    }
    expect(index).toMatch(/function soloSeNonTroppiTentativi\(cliente, adesso\) \{\s*if \(sconti\.troppiTentativi\(cliente\?\.tentativi_codice, adesso\)\) throw new HttpsError\('resource-exhausted', sconti\.TROPPI_TENTATIVI\)/)
    const verifica = fn('verificaCodiceSconto')
    expect(verifica).toContain('soloSeNonTroppiTentativi(cliente, adesso)')
    expect(verifica.indexOf('soloSeNonTroppiTentativi')).toBeLessThan(verifica.indexOf('scontoPerAcquisto'))
    expect(verifica).toMatch(/if \(errore\) \{\s*await segnaTentativoCodice\(uid, adesso\)\s*throw new HttpsError\('failed-precondition', errore\)/)
    expect(verifica).toContain('if (cliente.tentativi_codice) await db.doc(`clienti/${uid}`).update(tentativiAzzerati(cliente))')
    const attiva = fn('attivaConCodice')
    expect(attiva).toContain('soloSeNonTroppiTentativi(prima, adesso)')
    expect(attiva.indexOf('soloSeNonTroppiTentativi')).toBeLessThan(attiva.indexOf('sconti.CODICE.test(codice)'))
    expect(attiva).toMatch(/if \(!sconti\.CODICE\.test\(codice\)\) \{\s*await segnaTentativoCodice\(uid, adesso\)/)
    expect(attiva).toMatch(/if \(e\.errore\) \{\s*if \(cliente\) t\.update\(ref, \{ tentativi_codice: sconti\.tentativoFallito\(cliente\.tentativi_codice, adesso\) \}\)/)
    expect(attiva).toContain('t.update(ref, { ...e.patch, ...tentativiAzzerati(cliente) })')
    // Il contatore si toglie, non si azzera a zero: FieldValue.delete.
    expect(index).toContain('const tentativiAzzerati = (cliente) => (cliente?.tentativi_codice ? { tentativi_codice: FieldValue.delete() } : {})')
    // Senza cliente non si crea un documento per contare.
    expect(index).toMatch(/if \(cliente\) t\.update\(ref, \{ tentativi_codice: sconti\.tentativoFallito\(cliente\.tentativi_codice, adesso\) \}\)\s*\}\)\s*\}/)
  })

  it('il contatore lo scrivono solo le Functions: il titolare non lo crea e non lo cambia', () => {
    const regole = readFileSync('firestore.rules', 'utf8')
    const blocco = regole.slice(regole.indexOf('match /clienti/{uid}'), regole.indexOf('match /istanze/{slug}')).replace(/\/\/.*$/gm, '')
    expect(blocco).toContain("hasOnly(['uid', 'versione_schema', 'email', 'nome_locale', 'slug', 'locale', 'fatturazione', 'referente', 'consensi', 'creato_il'])")
    expect(blocco).toContain("affectedKeys().hasOnly(['locale', 'fatturazione', 'referente', 'consensi'])")
    expect(blocco).not.toContain('tentativi_codice')
  })
})
