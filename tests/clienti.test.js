'use strict'

// IL CLIENTE (REQ-FLOTTA-003): lo slug dal nome del locale è il prefisso
// del progetto Firebase dell'istanza, quindi vale la regola dei project id;
// il documento nasce a blocchi, con i consensi datati.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { createRequire } from 'node:module'
import { slugDi, problemaSlug, nuovoCliente, contattoDi } from '../src/lib/clienti.js'

const { datiEsistente, documentiEsistente } = createRequire(import.meta.url)('../functions/lib/esistente.js')

describe('slugDi', () => {
  it('minuscole, senza accenti, trattini', () => {
    expect(slugDi('La Tana del Coniglio')).toBe('la-tana-del-coniglio')
    expect(slugDi('  Caffè  Sant’Anna  ')).toBe('caffe-sant-anna')
    expect(slugDi('Bar 2000!!')).toBe('bar-2000')
  })

  it('non supera i 30 caratteri e non finisce con un trattino', () => {
    const lungo = slugDi('Un nome di locale davvero molto lungo per un bar')
    expect(lungo.length).toBeLessThanOrEqual(30)
    expect(lungo).not.toMatch(/-$/)
  })
})

describe('problemaSlug', () => {
  it('accetta uno slug buono e spiega quelli cattivi', () => {
    expect(problemaSlug('bar-mario')).toBeNull()
    expect(problemaSlug('')).toMatch(/nome/)
    expect(problemaSlug('bar')).toMatch(/corto/)
    expect(problemaSlug('1bar-mario')).toMatch(/lettera/)
    expect(problemaSlug('demo')).toMatch(/riservato|corto/)
  })
})

describe('nuovoCliente', () => {
  const dati = {
    uid: 'u1',
    email: ' Mario@Example.IT ',
    locale: { nome: ' Bar Mario ', tipo: 'bar', via: 'Via Roma 1', cap: '80035', citta: 'Nola', provincia: 'na', telefono: '081 1234567', sito: '' },
    fatturazione: { ragione_sociale: 'Bar Mario srl', partita_iva: 'IT01234567897', codice_fiscale: '', pec: 'Bar@PEC.it', sdi: '', stessa_sede: true },
    referente: { nome: 'Mario', cognome: 'Rossi', ruolo: 'titolare', telefono: '', marketing: false },
    adesso: new Date('2026-10-22T10:00:00Z'),
  }

  it('nasce a blocchi, con slug, email pulita, sede legale uguale al locale e consensi datati', () => {
    const c = nuovoCliente(dati)
    expect(c.versione_schema).toBe(2)
    expect(c.email).toBe('mario@example.it')
    expect(c.nome_locale).toBe('Bar Mario')
    expect(c.slug).toBe('bar-mario')
    expect(c.locale.indirizzo).toEqual({ via: 'Via Roma 1', cap: '80035', citta: 'Nola', provincia: 'NA' })
    expect(c.fatturazione.partita_iva).toBe('01234567897')
    expect(c.fatturazione.pec).toBe('bar@pec.it')
    expect(c.fatturazione.sede_legale).toEqual(c.locale.indirizzo)
    expect(c.referente).toEqual({ nome: 'Mario', cognome: 'Rossi', ruolo: 'titolare', telefono: '' })
    expect(c.consensi).toEqual({ termini_il: '2026-10-22T10:00:00.000Z', privacy_il: '2026-10-22T10:00:00.000Z', marketing: false })
    expect(c.creato_il).toBe('2026-10-22T10:00:00.000Z')
  })

  it('con la sede legale diversa la tiene a parte', () => {
    const c = nuovoCliente({ ...dati, fatturazione: { ...dati.fatturazione, stessa_sede: false, via: 'Via Sede 2', cap: '80100', citta: 'Napoli', provincia: 'na' } })
    expect(c.fatturazione.sede_legale).toEqual({ via: 'Via Sede 2', cap: '80100', citta: 'Napoli', provincia: 'NA' })
  })

  it('con un nome che non dà uno slug valido si ferma', () => {
    expect(() => nuovoCliente({ ...dati, locale: { ...dati.locale, nome: 'Bar' } })).toThrow(/corto/)
  })

  it('contattoDi legge il referente, o il contatto dei documenti vecchi', () => {
    expect(contattoDi(nuovoCliente(dati))).toBe('Mario Rossi')
    expect(contattoDi({ contatto: 'Giulia' })).toBe('Giulia')
    expect(contattoDi({})).toBe('')
  })
})

// AUDIT H1 (22/10/2026, chiusa il 02/11/2026): il titolare non scrive sul
// suo documento i campi che diventano licenza. Le regole si provano qui sul
// testo, come nel resto del repository: il repository non ha ancora
// l'emulatore fra le dipendenze.
describe('le regole di clienti/{uid} (H1)', () => {
  const regole = readFileSync('firestore.rules', 'utf8')
  const blocco = regole.slice(regole.indexOf('match /clienti/{uid}'), regole.indexOf('match /istanze/{slug}')).replace(/\/\/.*$/gm, '')
  const update = blocco.slice(blocco.indexOf('allow update'), blocco.indexOf('allow delete'))

  it('il titolare cambia solo i suoi dati anagrafici: piano, moduli, terminali, prove, sconto, abbonamento solo admin e Functions', () => {
    expect(update).toContain("affectedKeys().hasOnly(['locale', 'fatturazione', 'referente', 'consensi'])")
    for (const campo of ['piano', 'moduli', 'temi', 'terminali', 'prove', 'sconto', 'abbonamento', 'email', 'slug', 'uid', 'interna', 'esistente']) {
      expect(update).not.toMatch(new RegExp(`hasOnly\\(\\[[^\\]]*'${campo}'`))
    }
  })

  it('dentro i blocchi permessi: la partita IVA resta valida e i consensi non si cancellano', () => {
    expect(update).toContain("((nuovo('fatturazione', 'partita_iva') is string && nuovo('fatturazione', 'partita_iva').matches('^[0-9]{11}$')) || comEra('fatturazione', 'partita_iva'))")
    expect(update).toContain("(nuovo('consensi', 'termini_il') is string || comEra('consensi', 'termini_il'))")
    expect(update).toContain("(nuovo('consensi', 'privacy_il') is string || comEra('consensi', 'privacy_il'))")
  })

  // Valido, o com'era: un locale esistente (la Tana) nasce con
  // fatturazione {} e consensi a null, e non deve restare bloccato.
  it('«com’era» confronta il documento nuovo con quello di prima, campo per campo', () => {
    const funzioni = blocco.slice(blocco.indexOf('function nuovo'), blocco.indexOf('allow update'))
    expect(funzioni).toContain('return request.resource.data.get(blocco, {}).get(campo, null);')
    expect(funzioni).toContain('return resource.data.get(blocco, {}).get(campo, null);')
    expect(funzioni).toContain('return nuovo(blocco, campo) == vecchio(blocco, campo);')
    const esistente = documentiEsistente(datiEsistente({ nome_locale: 'La Tana', slug: 'tana-drink', email: 't@example.it', progetto: 'tana-drink', url: 'https://tana-drink.web.app' }), { uid: 'u' }).cliente
    expect(esistente.fatturazione).toEqual({})
    expect(esistente.consensi).toMatchObject({ termini_il: null, privacy_il: null })
  })

  // REQ-FLOTTA-045 (audit del 09/11/2026, finding 4): nemmeno la creazione.
  // Il documento lo scrive la Function registraCliente, che controlla che
  // lo slug sia libero; le regole non hanno più nessuna create.
  it('il sito non scrive mai clienti/{uid} dal browser: registrazione compresa, tutto passa dalle Functions', () => {
    const file = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? file(join(dir, d.name)) : [join(dir, d.name)]))
    const scritture = file('src')
      .filter((f) => /\.(js|jsx)$/.test(f))
      // Il percorso con «/» anche su Windows, dove join() mette «\».
      .flatMap((f) => readFileSync(f, 'utf8').split('\n').filter((r) => /(setDoc|updateDoc|deleteDoc|addDoc)\(doc\(db, 'clienti'/.test(r)).map((r) => `${f.split(sep).join('/')}: ${r.trim()}`))
    expect(scritture).toEqual([])
    // L'istruzione intera, fino al suo «;»: fra la create e la update ci
    // sono i commenti e le funzioni d'appoggio della update.
    const daCreate = blocco.slice(blocco.indexOf('allow create'))
    expect(daCreate.slice(0, daCreate.indexOf(';') + 1).replace(/\s+/g, ' ')).toBe('allow create: if false;')
    expect(blocco).not.toContain('request.resource.data.slug.matches')
  })
})
