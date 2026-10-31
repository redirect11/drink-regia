'use strict'

// GLI AGGIORNAMENTI OBBLIGATORI O A SCELTA (REQ-FLOTTA-020). L'utente,
// 31/10/2026: «uno quello attuale [...] il secondo dovrebbe invece mostrare
// prima il changelog con i cambiamenti e chiedere se si vuole aggiornare» e
// «nei vari piani siano garantiti aggiornamenti fino a che si paga». Le due
// regole le accende l'admin; chi ha già un piano le prende al rinnovo, con
// un avviso. Un rilascio obbligatorio arriva a tutti; il Free, con «solo
// finché si paga», riceve solo quelli. Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const a = require('../functions/lib/aggiornamenti.js')
const { daSospendere } = require('../functions/lib/sospensione.js')
const { aggiornamentoDaEvento } = require('../functions/lib/abbonamento.js')

const ADESSO = new Date('2026-11-01T10:00:00Z')
const PRIMA = '2026-10-01T10:00:00Z'
const DOPO = '2026-12-01T10:00:00Z'
const pagante = { slug: 'bar-mario', piano: 'base', abbonamento: { stato: 'attivo' } }
const CON_SCELTA = { a_scelta: true, solo_finche_paga: false }
const SOLO_PAGANTI = { a_scelta: false, solo_finche_paga: true }

describe('le regole e le condizioni in vigore', () => {
  it('le regole sono due interruttori, spenti se non detti', () => {
    expect(a.regolePulite(null)).toEqual({ a_scelta: false, solo_finche_paga: false })
    expect(a.regolePulite({ a_scelta: 'sì', solo_finche_paga: true })).toEqual({ a_scelta: false, solo_finche_paga: true })
  })

  it('un’istanza di prima non ha condizioni: valgono quelle di sempre', () => {
    expect(a.condizioniIn({ stato: 'attiva' }, ADESSO)).toEqual(a.REGOLE_BASE)
  })

  it('le condizioni prossime valgono solo dalla loro data', () => {
    const ist = { condizioni_aggiornamenti: a.REGOLE_BASE, condizioni_prossime: { ...CON_SCELTA, dal: DOPO } }
    expect(a.condizioniIn(ist, ADESSO).a_scelta).toBe(false)
    expect(a.condizioniIn(ist, new Date(DOPO)).a_scelta).toBe(true)
  })
})

describe('come si aggiorna un locale', () => {
  it('obbligatori di norma; a scelta con la regola; la modalità dell’admin vince', () => {
    expect(a.regolaDi({}, pagante, ADESSO)).toEqual({ modalita: 'obbligatori', inclusi: true, motivo: null })
    expect(a.regolaDi({ condizioni_aggiornamenti: CON_SCELTA }, pagante, ADESSO).modalita).toBe('a_scelta')
    expect(a.regolaDi({ condizioni_aggiornamenti: CON_SCELTA, modalita_aggiornamenti: 'obbligatori' }, pagante, ADESSO).modalita).toBe('obbligatori')
    expect(a.regolaDi({ modalita_aggiornamenti: 'a_scelta' }, pagante, ADESSO).modalita).toBe('a_scelta')
    expect(a.regolaDi({ modalita_aggiornamenti: 'boh' }, pagante, ADESSO).modalita).toBe('obbligatori')
  })

  it('«solo finché si paga»: fuori il Free e chi non paga, dentro chi paga e le interne', () => {
    const ist = { condizioni_aggiornamenti: SOLO_PAGANTI }
    expect(a.regolaDi(ist, pagante, ADESSO).inclusi).toBe(true)
    expect(a.regolaDi(ist, { piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } }, ADESSO)).toMatchObject({ inclusi: false, motivo: 'free' })
    expect(a.regolaDi(ist, { piano: 'base', abbonamento: { stato: 'in sospeso' } }, ADESSO)).toMatchObject({ inclusi: false, motivo: 'non_pagato' })
    expect(a.regolaDi(ist, { piano: 'base', abbonamento: { stato: 'disdetto' } }, ADESSO).motivo).toBe('non_pagato')
    // La Tana non paga, ed è nostra.
    expect(a.regolaDi({ ...ist, interna: true }, { piano: 'completo', abbonamento: { stato: 'attivo', origine: 'interna' } }, ADESSO).inclusi).toBe(true)
    // Senza la regola il Free li riceve tutti, come oggi.
    expect(a.regolaDi({}, { piano: 'free' }, ADESSO).inclusi).toBe(true)
  })

  it('nel rilascio: si lancia, si propone o si esclude; l’obbligatorio si lancia sempre', () => {
    const scelta = { condizioni_aggiornamenti: { a_scelta: true, solo_finche_paga: true } }
    const free = { piano: 'free' }
    expect(a.cosaFareNelRilascio({}, pagante, { obbligatorio: false }, ADESSO)).toBe('lancia')
    expect(a.cosaFareNelRilascio(scelta, pagante, {}, ADESSO)).toBe('proponi')
    expect(a.cosaFareNelRilascio(scelta, free, {}, ADESSO)).toBe('escludi')
    expect(a.cosaFareNelRilascio(scelta, free, { obbligatorio: true }, ADESSO)).toBe('lancia')
    expect(a.cosaFareNelRilascio(scelta, pagante, { obbligatorio: true }, ADESSO)).toBe('lancia')
  })
})

describe('le note di una proposta, dal CHANGELOG di tana-drink', () => {
  const MD = [
    '# Changelog',
    '',
    '## 1.12.0-beta — in lavorazione',
    '- in prova',
    '',
    '## 1.11.0 — 1 novembre 2026',
    '- il magazzino nuovo',
    '',
    '## 1.10.3 — 31 ottobre 2026',
    '- una correzione',
    '',
    '---',
    '',
    '## 1.10.0 — 30 ottobre 2026',
    '- la build per cliente',
  ].join('\n')

  it('le versioni dopo quella installata, fino al tag compreso, senza le beta', () => {
    const note = a.noteTra(MD, 'v1.10.0', 'v1.11.0')
    expect(note).toContain('## 1.11.0')
    expect(note).toContain('## 1.10.3')
    expect(note).not.toContain('## 1.10.0')
    expect(note).not.toContain('1.12.0-beta')
    expect(note).not.toMatch(/---/)
  })

  it('senza versione installata solo quella del tag; un tag senza sezione: niente', () => {
    expect(a.noteTra(MD, null, 'v1.10.3')).toBe('## 1.10.3 — 31 ottobre 2026\n- una correzione')
    expect(a.noteTra(MD, 'v1.10.0', 'v1.9.0')).toBe('')
    expect(a.noteTra(MD, 'v1.10.0', 'main')).toBe('')
    expect(a.noteTra('', 'v1.10.0', 'v1.11.0')).toBe('')
  })

  it('le note troppo lunghe si tagliano', () => {
    const lungo = `## 1.11.0 — oggi\n${'x'.repeat(a.NOTE_MAX + 500)}`
    const note = a.noteTra(lungo, 'v1.10.0', 'v1.11.0')
    expect(note.length).toBeLessThanOrEqual(a.NOTE_MAX + 4)
    expect(note.endsWith('…')).toBe(true)
  })

  it('una -beta viene prima della sua uscita', () => {
    expect(a.confronta(a.versioneDi('1.10.2-beta'), a.versioneDi('1.10.2'))).toBeLessThan(0)
    expect(a.confronta(a.versioneDi('v1.10.10'), a.versioneDi('v1.10.9'))).toBeGreaterThan(0)
    expect(a.versioneDi('main')).toBeNull()
  })
})

describe('la proposta e la scelta del titolare', () => {
  const proposta = () => a.nuovaProposta('v1.11.0', { rilascio: 'v1.11.0', note: '## 1.11.0', adesso: ADESSO })

  it('nasce in attesa, senza scelta', () => {
    expect(proposta()).toEqual({ tag: 'v1.11.0', rilascio: 'v1.11.0', note: '## 1.11.0', proposta_il: ADESSO.toISOString(), saltata_il: null, attesa: true, scelta_letta_il: null })
  })

  it('vale solo sul tag proposto, con una scelta che si conosce', () => {
    const p = proposta()
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'aggiorna', il: ADESSO.toISOString() }, p)).toBe('aggiorna')
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'salta', il: ADESSO.toISOString() }, p)).toBe('salta')
    expect(a.sceltaValida({ tag: 'v1.10.0', scelta: 'aggiorna' }, p)).toBeNull()
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'installa' }, p)).toBeNull()
    expect(a.sceltaValida(null, p)).toBeNull()
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'aggiorna' }, { ...p, attesa: false })).toBeNull()
  })

  it('una scelta già letta non si rilegge; dopo «salta» resta possibile «aggiorna»', () => {
    const il = ADESSO.toISOString()
    const saltata = { ...proposta(), saltata_il: il, scelta_letta_il: il }
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'salta', il }, saltata, { giaLetta: il })).toBeNull()
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'salta', il: DOPO }, saltata)).toBeNull()
    expect(a.sceltaValida({ tag: 'v1.11.0', scelta: 'aggiorna', il: DOPO }, saltata, { giaLetta: il })).toBe('aggiorna')
  })

  it('le date di Firestore, ISO o Date, diventano ISO', () => {
    expect(a.dataDi({ toDate: () => ADESSO })).toBe(ADESSO.toISOString())
    expect(a.dataDi(ADESSO)).toBe(ADESSO.toISOString())
    expect(a.dataDi('non è una data')).toBeNull()
    expect(a.dataDi(null)).toBeNull()
  })

  it('una proposta è superata quando il locale arriva a quella versione o oltre', () => {
    const p = proposta()
    expect(a.propostaSuperata(p, 'v1.11.0')).toBe(true)
    expect(a.propostaSuperata(p, 'v1.12.0')).toBe(true)
    expect(a.propostaSuperata(p, 'v1.10.3')).toBe(false)
    expect(a.propostaSuperata({ ...p, attesa: false }, 'v1.12.0')).toBe(false)
  })
})

describe('il cambio delle regole: nulla cambia fino al rinnovo, e si avvisa', () => {
  it('dal rinnovo se lo si sa, se no dopo il preavviso', () => {
    expect(a.dataDelCambio({ abbonamento: { rinnovo_il: DOPO } }, ADESSO)).toBe(new Date(DOPO).toISOString())
    const preavviso = new Date(ADESSO.getTime() + a.GIORNI_PREAVVISO * 86400000).toISOString()
    expect(a.dataDelCambio({ abbonamento: { rinnovo_il: PRIMA } }, ADESSO)).toBe(preavviso)
    expect(a.dataDelCambio({ piano: 'free' }, ADESSO)).toBe(preavviso)
  })

  it('un locale attivo tiene le sue condizioni, e riceve le prossime con l’avviso', () => {
    const cliente = { ...pagante, abbonamento: { stato: 'attivo', rinnovo_il: DOPO } }
    const patch = a.cambioPerIstanza({ stato: 'attiva' }, cliente, SOLO_PAGANTI, ADESSO)
    expect(patch.condizioni_aggiornamenti).toEqual(a.REGOLE_BASE)
    expect(patch.condizioni_prossime).toEqual({ ...SOLO_PAGANTI, dal: new Date(DOPO).toISOString() })
    expect(patch.avviso_aggiornamenti).toMatchObject({ id: 'condizioni-2026-11-01', dal: new Date(DOPO).toISOString() })
    expect(patch.avviso_aggiornamenti.testo).toMatch(/^Dal 1 dicembre 2026, al rinnovo/)
    expect(patch.avviso_aggiornamenti.testo).toMatch(/solo finché l’abbonamento è pagato/)
    expect(patch.avviso_aggiornamenti.testo).toMatch(/Fino ad allora per il tuo locale non cambia niente\.$/)
  })

  it('niente per chi non è attivo o è chiuso; tornare indietro toglie l’avviso', () => {
    expect(a.cambioPerIstanza({ stato: 'in corso' }, pagante, SOLO_PAGANTI, ADESSO)).toBeNull()
    expect(a.cambioPerIstanza({ stato: 'attiva', licenza_stato: 'chiusa' }, pagante, SOLO_PAGANTI, ADESSO)).toBeNull()
    expect(a.cambioPerIstanza({ stato: 'attiva' }, pagante, a.REGOLE_BASE, ADESSO)).toBeNull()
    const inAttesa = { stato: 'attiva', condizioni_aggiornamenti: a.REGOLE_BASE, condizioni_prossime: { ...SOLO_PAGANTI, dal: DOPO } }
    expect(a.cambioPerIstanza(inAttesa, pagante, a.REGOLE_BASE, ADESSO)).toEqual({ condizioni_prossime: null, avviso_aggiornamenti: null })
  })

  it('l’avviso dice ogni cambio, in tutte e due le direzioni', () => {
    expect(a.testoAvviso(a.REGOLE_BASE, CON_SCELTA, DOPO)).toMatch(/potrai scegliere se installarlo o saltarlo/)
    expect(a.testoAvviso(CON_SCELTA, a.REGOLE_BASE, DOPO)).toMatch(/si installeranno da soli/)
    expect(a.testoAvviso(SOLO_PAGANTI, a.REGOLE_BASE, DOPO)).toMatch(/arriveranno a tutti i piani/)
  })

  it('alla data, le condizioni prossime diventano quelle in vigore', () => {
    const ist = { condizioni_aggiornamenti: a.REGOLE_BASE, condizioni_prossime: { ...CON_SCELTA, dal: DOPO }, avviso_aggiornamenti: { id: 'x' } }
    expect(a.promozione(ist, ADESSO)).toBeNull()
    expect(a.promozione(ist, new Date(DOPO))).toEqual({ condizioni_aggiornamenti: CON_SCELTA, condizioni_prossime: null, avviso_aggiornamenti: null })
    expect(a.promozione({}, ADESSO)).toBeNull()
  })
})

describe('chi non paga torna al Free, e al pagamento al suo piano', () => {
  const OTTO_GIORNI_FA = new Date(ADESSO.getTime() - 8 * 86400000).toISOString()
  const IERI = new Date(ADESSO.getTime() - 86400000).toISOString()
  const istanze = (extra = {}) => ({ 'bar-mario': { stato: 'attiva', condizioni_aggiornamenti: SOLO_PAGANTI, ...extra } })
  const moroso = (da = OTTO_GIORNI_FA) => ({ slug: 'bar-mario', piano: 'base', abbonamento: { stato: 'in sospeso', aggiornato_il: da } })

  it('dopo i giorni di grazia, non prima', () => {
    expect(a.daRipiegare([moroso()], istanze(), { adesso: ADESSO }).map((x) => x.azione)).toEqual(['ripiega'])
    expect(a.daRipiegare([moroso(IERI)], istanze(), { adesso: ADESSO })).toEqual([])
  })

  it('senza la regola, sul Free, le interne, i sospesi e i chiusi: niente', () => {
    expect(a.daRipiegare([moroso()], { 'bar-mario': { stato: 'attiva' } }, { adesso: ADESSO })).toEqual([])
    expect(a.daRipiegare([{ ...moroso(), piano: 'free' }], istanze(), { adesso: ADESSO })).toEqual([])
    expect(a.daRipiegare([moroso()], istanze({ interna: true }), { adesso: ADESSO })).toEqual([])
    expect(a.daRipiegare([moroso()], istanze({ licenza_stato: 'sospesa' }), { adesso: ADESSO })).toEqual([])
    expect(a.daRipiegare([moroso()], istanze({ licenza_stato: 'chiusa' }), { adesso: ADESSO })).toEqual([])
  })

  it('tornato a pagare, riprende il suo piano', () => {
    const ripiegato = istanze({ ripiego_free: { dal: OTTO_GIORNI_FA, piano_prima: 'base' } })
    expect(a.daRipiegare([pagante], ripiegato, { adesso: ADESSO }).map((x) => x.azione)).toEqual(['ripristina'])
    expect(a.daRipiegare([moroso()], ripiegato, { adesso: ADESSO })).toEqual([])
  })

  it('la sospensione dei morosi salta chi torna al Free, e sospende gli altri come prima', () => {
    const ripiega = (ist) => a.ripiegaInveceDiSospendere(ist, ADESSO)
    expect(daSospendere([moroso()], istanze(), { adesso: ADESSO, ripiega })).toEqual([])
    expect(daSospendere([moroso()], { 'bar-mario': { stato: 'attiva' } }, { adesso: ADESSO, ripiega }).map((x) => x.stato)).toEqual(['sospesa'])
    // Il disdetto si chiude comunque: l'ha chiesto il titolare.
    const disdetto = { ...moroso(), abbonamento: { stato: 'disdetto' } }
    expect(daSospendere([disdetto], istanze(), { adesso: ADESSO, ripiega }).map((x) => x.stato)).toEqual(['chiusa'])
  })
})

describe('quello che sa l’app: settings/bar.licenza.aggiornamenti', () => {
  it('modalità, inclusi, la proposta e l’avviso', () => {
    const ist = {
      condizioni_aggiornamenti: CON_SCELTA,
      proposta_aggiornamento: { tag: 'v1.11.0', note: '## 1.11.0', proposta_il: PRIMA, saltata_il: null, attesa: true, rilascio: 'v1.11.0', scelta_letta_il: null },
      avviso_aggiornamenti: { id: 'condizioni-2026-11-01', testo: 'Dal…', dal: DOPO },
    }
    expect(a.licenzaAggiornamenti(ist, pagante, ADESSO)).toEqual({
      modalita: 'a_scelta',
      inclusi: true,
      motivo: null,
      proposta: { tag: 'v1.11.0', note: '## 1.11.0', proposta_il: PRIMA, saltata_il: null },
      avviso: { id: 'condizioni-2026-11-01', testo: 'Dal…', dal: DOPO },
    })
  })

  it('niente proposta se non è in attesa o se il piano non comprende gli aggiornamenti', () => {
    const p = { tag: 'v1.11.0', attesa: true }
    expect(a.licenzaAggiornamenti({ proposta_aggiornamento: { ...p, attesa: false } }, pagante, ADESSO).proposta).toBeNull()
    const lic = a.licenzaAggiornamenti({ condizioni_aggiornamenti: SOLO_PAGANTI, proposta_aggiornamento: p }, { piano: 'free' }, ADESSO)
    expect(lic).toMatchObject({ inclusi: false, motivo: 'free', proposta: null, avviso: null })
  })
})

describe('il rinnovo da Stripe', () => {
  it('la fine del periodo pagato è il prossimo rinnovo', () => {
    const fine = Date.parse(DOPO) / 1000
    const agg = aggiornamentoDaEvento('invoice.paid', { subscription: 'sub_1', lines: { data: [{ period: { end: fine } }] } }, ADESSO)
    expect(agg.patch['abbonamento.rinnovo_il']).toBe(new Date(DOPO).toISOString())
    expect(aggiornamentoDaEvento('invoice.paid', { subscription: 'sub_1' }, ADESSO).patch['abbonamento.rinnovo_il']).toBeUndefined()
  })
})
