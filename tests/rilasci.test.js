'use strict'

// I RILASCI A ONDATE (REQ-FLOTTA-012): un tag di tana-drink arriva ai
// locali un'ondata alla volta — prova, interne, pilota, tutti gli altri —
// e un aggiornamento fallito ferma il rilascio senza segnare il locale in
// errore. Logica pura delle Functions. Decisione dell'utente del
// 27/10/2026.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const r = require('../functions/lib/rilasci.js')
const { esitoValido, eAggiornamento, documentoAggiornamento } = require('../functions/lib/provisioning.js')

const ADESSO = new Date('2026-10-27T10:00:00Z')

const flotta = () => ({
  'demo-prova': { stato: 'attiva', gruppo_rilascio: 'prova', versione: 'v1.10.0' },
  'tana-drink': { stato: 'attiva', origine: 'esistente', interna: true, versione: 'v1.10.0' },
  'bar-pilota': { stato: 'attiva', gruppo_rilascio: 'pilota', versione: 'v1.10.0' },
  'bar-mario': { stato: 'attiva', versione: 'v1.10.0' },
  'bar-sospeso': { stato: 'attiva', licenza_stato: 'sospesa', versione: 'v1.10.0' },
  'bar-chiuso': { stato: 'attiva', licenza_stato: 'chiusa', versione: 'v1.9.0' },
  'bar-in-corso': { stato: 'in corso' },
})

// Quello che fa l'esito del workflow su un'istanza, come in index.js.
const esito = (istanze, slug, stato, extra = {}) => {
  const e = esitoValido({ slug, stato, versione: stato === 'attiva' ? extra.versione || 'v1.11.0' : null, ref: extra.ref || 'v1.11.0', ...extra })
  istanze[slug] = documentoAggiornamento(e, istanze[slug], ADESSO)
}
const lancia = (istanze, slug, ref, opz = {}) => {
  istanze[slug] = { ...istanze[slug], aggiornamento: r.aggiornamentoLanciato(istanze[slug], ref, { adesso: ADESSO, ...opz }) }
}

describe('un rilascio nasce da un tag, con le ondate in ordine', () => {
  it('main o un ramo non sono un rilascio', () => {
    expect(() => r.nuovoRilascio('main', flotta())).toThrow(/tag vX\.Y\.Z/)
    expect(() => r.nuovoRilascio('feature/flotta', flotta())).toThrow(r.RilascioNonValido)
  })

  it('prova, interne, pilota, tutti gli altri; le chiuse e le non attive restano fuori', () => {
    const ril = r.nuovoRilascio('v1.11.0', flotta(), { da: 'admin@x.it', adesso: ADESSO })
    expect(ril.ondate.map((o) => [o.nome, o.slugs])).toEqual([
      ['prova', ['demo-prova']],
      ['interna', ['tana-drink']],
      ['pilota', ['bar-pilota']],
      ['generale', ['bar-mario', 'bar-sospeso']],
    ])
    expect(ril).toMatchObject({ ref: 'v1.11.0', stato: 'in corso', ondata: -1, creato_da: 'admin@x.it' })
  })

  it('le ondate vuote non ci sono, e senza istanze attive non c’è rilascio', () => {
    const ril = r.nuovoRilascio('v1.11.0', { 'bar-mario': { stato: 'attiva' } })
    expect(ril.ondate.map((o) => o.nome)).toEqual(['generale'])
    expect(() => r.nuovoRilascio('v1.11.0', { 'bar-x': { stato: 'errore' } })).toThrow(/Nessuna istanza attiva/)
  })

  it('un gruppo sconosciuto vale generale; un’interna della flotta va con le interne', () => {
    expect(r.ondataDi({ gruppo_rilascio: 'boh' })).toBe('generale')
    expect(r.ondataDi({ interna: true })).toBe('interna')
    expect(r.ondataDi({ origine: 'esistente' })).toBe('interna')
  })
})

// REQ-FLOTTA-018: la Tana affidata alla regia resta nell'ondata interna,
// ma l'aggiornamento lo lancia la regia invece di aspettarlo.
describe('un locale esistente affidato alla regia', () => {
  it('lo aggiorna la regia, nella sua ondata; senza l’affidamento si aspetta la versione', () => {
    expect(r.daFlotta({ origine: 'esistente' })).toBe(false)
    expect(r.daFlotta({ origine: 'esistente', aggiornamenti_dalla_regia: true })).toBe(true)
    expect(r.daFlotta({ stato: 'attiva' })).toBe(true)
    const istanze = { ...flotta(), 'tana-drink': { ...flotta()['tana-drink'], aggiornamenti_dalla_regia: true } }
    let ril = r.nuovoRilascio('v1.11.0', istanze)
    expect(ril.ondate.map((o) => o.nome)).toEqual(['prova', 'interna', 'pilota', 'generale'])
    ril = r.avanzamento(ril, istanze).rilascio
    istanze['demo-prova'].aggiornamento = { rilascio: 'v1.11.0', stato: 'riuscito' }
    expect(r.avanzamento(ril, istanze).daLanciare).toEqual(['tana-drink'])
  })
})

describe('un’ondata alla volta', () => {
  it('la prima parte subito; la seconda solo quando la prima è finita', () => {
    const istanze = flotta()
    let ril = r.nuovoRilascio('v1.11.0', istanze, { adesso: ADESSO })
    const primo = r.avanzamento(ril, istanze, ADESSO)
    expect(primo.daLanciare).toEqual(['demo-prova'])
    ril = primo.rilascio
    expect(ril.ondata).toBe(0)
    expect(ril.ondate[0].avviata_il).toBe(ADESSO.toISOString())
    // Lanciato ma non finito: non si va avanti.
    lancia(istanze, 'demo-prova', 'v1.11.0', { rilascio: 'v1.11.0' })
    expect(r.puoAvanzare(ril, istanze)).toMatchObject({ ok: false, perche: expect.stringMatching(/ancora in corso/) })
    esito(istanze, 'demo-prova', 'attiva')
    expect(r.puoAvanzare(ril, istanze)).toMatchObject({ ok: true, prossima: 1 })
  })

  it('le installazioni interne non si lanciano: si aspetta la versione che riferiscono', () => {
    const istanze = flotta()
    let ril = r.avanzamento(r.nuovoRilascio('v1.11.0', istanze), istanze).rilascio
    lancia(istanze, 'demo-prova', 'v1.11.0', { rilascio: 'v1.11.0' })
    esito(istanze, 'demo-prova', 'attiva')
    const interne = r.avanzamento(ril, istanze)
    expect(interne.daLanciare).toEqual([])
    ril = interne.rilascio
    expect(r.puoAvanzare(ril, istanze)).toMatchObject({ ok: false, perche: expect.stringMatching(/repository/) })
    // La Tana pubblica dal suo repository e riferisce la versione.
    esito(istanze, 'tana-drink', 'attiva', { versione: 'v1.11.0' })
    expect(istanze['tana-drink'].stato).toBe('attiva')
    expect(r.esitoDi(istanze['tana-drink'], ril)).toBe('riuscito')
    expect(r.avanzamento(ril, istanze).daLanciare).toEqual(['bar-pilota'])
  })

  it('l’ultima ondata finita chiude il rilascio', () => {
    const istanze = { 'bar-mario': { stato: 'attiva', versione: 'v1.10.0' } }
    const { rilascio: ril } = r.avanzamento(r.nuovoRilascio('v1.11.0', istanze), istanze)
    lancia(istanze, 'bar-mario', 'v1.11.0', { rilascio: 'v1.11.0' })
    expect(r.dopoEsito(ril, istanze, ADESSO)).toBeNull()
    esito(istanze, 'bar-mario', 'attiva')
    expect(r.dopoEsito(ril, istanze, ADESSO)).toMatchObject({ stato: 'completato' })
    expect(r.puoAvanzare({ ...ril, stato: 'completato' }, istanze).ok).toBe(false)
  })
})

describe('un aggiornamento fallito', () => {
  const avviato = () => {
    const istanze = { 'bar-mario': { stato: 'attiva', versione: 'v1.10.0' }, 'bar-luigi': { stato: 'attiva', versione: 'v1.10.0' } }
    const { rilascio } = r.avanzamento(r.nuovoRilascio('v1.11.0', istanze), istanze)
    lancia(istanze, 'bar-mario', 'v1.11.0', { rilascio: 'v1.11.0' })
    lancia(istanze, 'bar-luigi', 'v1.11.0', { rilascio: 'v1.11.0' })
    return { istanze, rilascio }
  }

  it('lascia il locale attivo con la versione di prima, e ferma il rilascio', () => {
    const { istanze, rilascio } = avviato()
    esito(istanze, 'bar-mario', 'errore', { errore: 'Aggiornamento failure: GitHub Actions run 1' })
    expect(istanze['bar-mario']).toMatchObject({
      stato: 'attiva',
      versione: 'v1.10.0',
      aggiornamento: { stato: 'fallito', errore: 'Aggiornamento failure: GitHub Actions run 1', versione_precedente: 'v1.10.0' },
    })
    const fermo = r.dopoEsito(rilascio, istanze, ADESSO)
    expect(fermo).toMatchObject({ stato: 'fermo', fermato_perche: 'Aggiornamento fallito: bar-mario' })
    expect(r.puoAvanzare(fermo, istanze)).toMatchObject({ ok: false, perche: expect.stringMatching(/falliti/) })
  })

  it('si riprova: riuscito, il rilascio fermo si chiude se era l’ultima ondata', () => {
    const { istanze, rilascio } = avviato()
    esito(istanze, 'bar-mario', 'errore')
    esito(istanze, 'bar-luigi', 'attiva')
    const fermo = r.dopoEsito(rilascio, istanze, ADESSO)
    lancia(istanze, 'bar-mario', 'v1.11.0', { rilascio: 'v1.11.0' })
    esito(istanze, 'bar-mario', 'attiva')
    expect(r.dopoEsito(fermo, istanze, ADESSO)).toMatchObject({ stato: 'completato' })
  })

  it('si torna alla versione di prima: per questo rilascio il locale è fuori', () => {
    const { istanze, rilascio } = avviato()
    esito(istanze, 'bar-mario', 'errore')
    expect(r.versioneDiRitorno(istanze['bar-mario'])).toBe('v1.10.0')
    lancia(istanze, 'bar-mario', 'v1.10.0', { rilascio: 'v1.11.0', ritorno: true })
    // Tornando, la «precedente» resta quella di prima del rilascio.
    expect(istanze['bar-mario'].aggiornamento.versione_precedente).toBe('v1.10.0')
    expect(r.esitoDi(istanze['bar-mario'], rilascio)).toBe('escluso')
    esito(istanze, 'bar-mario', 'attiva', { versione: 'v1.10.0', ref: 'v1.10.0' })
    esito(istanze, 'bar-luigi', 'attiva')
    expect(r.contaOndata(rilascio.ondate[0], istanze, rilascio)).toMatchObject({ riuscito: 1, escluso: 1, fallito: 0 })
    expect(r.dopoEsito(rilascio, istanze, ADESSO)).toMatchObject({ stato: 'completato' })
  })

  it('senza una versione precedente vera non si torna indietro', () => {
    expect(r.versioneDiRitorno({ aggiornamento: { versione_precedente: null } })).toBeNull()
    expect(r.versioneDiRitorno({ aggiornamento: { versione_precedente: 'main' } })).toBeNull()
  })
})

describe('l’esito del workflow: attivazione o aggiornamento', () => {
  it('su un’istanza già attiva, o su un locale esistente, è un aggiornamento', () => {
    const e = esitoValido({ slug: 'bar-mario', stato: 'errore' })
    expect(eAggiornamento(e, { stato: 'attiva' })).toBe(true)
    expect(eAggiornamento(e, { stato: 'errore' })).toBe(false)
    expect(eAggiornamento(e, null)).toBe(false)
    expect(eAggiornamento(esitoValido({ slug: 'tana-drink', stato: 'attiva' }), { origine: 'esistente' })).toBe(true)
  })

  it('il workflow può dirlo, e vince', () => {
    expect(eAggiornamento(esitoValido({ slug: 'bar-mario', stato: 'attiva', operazione: 'attivazione' }), { stato: 'attiva' })).toBe(false)
    expect(eAggiornamento(esitoValido({ slug: 'bar-mario', stato: 'attiva', operazione: 'aggiornamento' }), null)).toBe(true)
    expect(esitoValido({ slug: 'bar-mario', stato: 'attiva', operazione: 'boh' }).operazione).toBeNull()
  })

  it('un aggiornamento fallito senza messaggio lo dice come aggiornamento', () => {
    const doc = documentoAggiornamento(esitoValido({ slug: 'bar-mario', stato: 'errore' }), { stato: 'attiva', versione: 'v1.10.0' }, ADESSO)
    expect(doc.aggiornamento.errore).toBe('Aggiornamento fallito')
    expect(doc.stato).toBe('attiva')
  })
})

describe('il riepilogo per il backoffice', () => {
  it('conta per ondata e dice cosa si può fare', () => {
    const istanze = flotta()
    const ril = r.conRiepilogo(r.nuovoRilascio('v1.11.0', istanze), istanze)
    expect(ril.puo_avanzare).toBe(true)
    expect(ril.prossima).toBe('prova')
    expect(ril.riepilogo[3]).toEqual({ nome: 'generale', 'in attesa': 2, 'in corso': 0, riuscito: 0, fallito: 0, escluso: 0, proposto: 0, saltato: 0, 'non incluso': 0 })
    // La Tana è già sulla versione? conta come riuscita anche prima.
    istanze['tana-drink'].versione = 'v1.11.0'
    expect(r.conRiepilogo(ril, istanze).riepilogo[1].riuscito).toBe(1)
  })
})

// REQ-FLOTTA-020: con gli aggiornamenti a scelta un locale riceve una
// proposta invece del deploy, e chi non ha gli aggiornamenti nel piano
// resta fuori. Né l'uno né l'altro ferma l'ondata.
describe('gli aggiornamenti a scelta nel rilascio', () => {
  const avviato = () => {
    const istanze = { 'bar-mario': { stato: 'attiva', versione: 'v1.10.0' }, 'bar-luigi': { stato: 'attiva', versione: 'v1.10.0' }, 'bar-free': { stato: 'attiva', versione: 'v1.10.0' } }
    const { rilascio } = r.avanzamento(r.nuovoRilascio('v1.11.0', istanze), istanze)
    return { istanze, rilascio }
  }

  it('un rilascio nasce normale, o obbligatorio se lo si dice', () => {
    const istanze = { 'bar-mario': { stato: 'attiva' } }
    expect(r.nuovoRilascio('v1.11.0', istanze)).toMatchObject({ obbligatorio: false, non_inclusi: [] })
    expect(r.nuovoRilascio('v1.11.0', istanze, { obbligatorio: true }).obbligatorio).toBe(true)
  })

  it('proposto, saltato e non incluso non fermano l’ondata, e chiudono il rilascio', () => {
    const { istanze, rilascio } = avviato()
    istanze['bar-mario'].proposta_aggiornamento = { tag: 'v1.11.0', rilascio: 'v1.11.0', attesa: true, saltata_il: null }
    istanze['bar-luigi'].proposta_aggiornamento = { tag: 'v1.11.0', rilascio: 'v1.11.0', attesa: true, saltata_il: '2026-11-02T10:00:00Z' }
    const ril = { ...rilascio, non_inclusi: ['bar-free'] }
    expect(r.esitoDi(istanze['bar-mario'], ril, 'bar-mario')).toBe('proposto')
    expect(r.esitoDi(istanze['bar-luigi'], ril, 'bar-luigi')).toBe('saltato')
    expect(r.esitoDi(istanze['bar-free'], ril, 'bar-free')).toBe('non incluso')
    expect(r.contaOndata(ril.ondate[0], istanze, ril)).toMatchObject({ proposto: 1, saltato: 1, 'non incluso': 1, 'in attesa': 0 })
    expect(r.dopoEsito(ril, istanze, ADESSO)).toMatchObject({ stato: 'completato' })
  })

  it('una proposta accettata diventa un aggiornamento come gli altri', () => {
    const { istanze, rilascio } = avviato()
    istanze['bar-mario'].proposta_aggiornamento = { tag: 'v1.11.0', rilascio: 'v1.11.0', attesa: false }
    lancia(istanze, 'bar-mario', 'v1.11.0', { rilascio: 'v1.11.0' })
    expect(r.esitoDi(istanze['bar-mario'], rilascio, 'bar-mario')).toBe('in corso')
    esito(istanze, 'bar-mario', 'errore')
    expect(r.dopoEsito(rilascio, istanze, ADESSO)).toMatchObject({ stato: 'fermo' })
  })

  it('la proposta di un altro rilascio non conta per questo', () => {
    const { istanze, rilascio } = avviato()
    istanze['bar-mario'].proposta_aggiornamento = { tag: 'v1.10.5', rilascio: 'v1.10.5', attesa: true }
    expect(r.esitoDi(istanze['bar-mario'], rilascio, 'bar-mario')).toBe('in attesa')
  })
})
