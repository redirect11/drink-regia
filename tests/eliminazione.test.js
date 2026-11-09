'use strict'

// L'ELIMINAZIONE DI UN LOCALE (REQ-FLOTTA-014): solo un locale chiuso,
// confermata col nome dell'app, subito o 30 giorni dopo la chiusura, sempre
// dopo un backup verificato che resta 180 giorni e scarica solo il titolare.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const e = require('../functions/lib/eliminazione.js')

const adesso = new Date('2026-10-29T10:00:00Z')
const chiusa = { stato: 'attiva', progetto: 'drinkpos-prova-bar', licenza_stato: 'chiusa', licenza_dal: '2026-10-20T10:00:00Z' }

describe('puoEliminare', () => {
  it('un locale della flotta chiuso sì', () => {
    expect(e.puoEliminare(chiusa)).toEqual({ ok: true, perche: null })
  })

  it('aperto, sospeso, esistente, interno, la demo o già eliminato no', () => {
    expect(e.puoEliminare({ ...chiusa, licenza_stato: 'attiva' }).perche).toMatch(/Prima si chiude/)
    expect(e.puoEliminare({ ...chiusa, licenza_stato: 'sospesa' }).ok).toBe(false)
    expect(e.puoEliminare({ ...chiusa, origine: 'esistente' }).perche).toMatch(/esistente/)
    expect(e.puoEliminare({ ...chiusa, interna: true }).perche).toMatch(/interna/)
    expect(e.puoEliminare({ ...chiusa, progetto: 'drinkpos-demo' }).perche).toMatch(/demo/)
    expect(e.puoEliminare({ ...chiusa, stato: 'eliminata' }).ok).toBe(false)
    expect(e.puoEliminare({ ...chiusa, eliminazione: { stato: 'in corso' } }).perche).toMatch(/già partita/)
    expect(e.puoEliminare(null).ok).toBe(false)
  })

  it('una eliminazione programmata o fallita si può chiedere di nuovo', () => {
    expect(e.puoEliminare({ ...chiusa, eliminazione: { stato: 'programmata' } }).ok).toBe(true)
    expect(e.puoEliminare({ ...chiusa, eliminazione: { stato: 'fallita' } }).ok).toBe(true)
  })
})

describe('confermaValida', () => {
  it('solo il nome dell’app scritto per intero', () => {
    expect(e.confermaValida(chiusa, 'drinkpos-prova-bar')).toBe(true)
    expect(e.confermaValida(chiusa, '  drinkpos-prova-bar ')).toBe(true)
    expect(e.confermaValida(chiusa, 'prova-bar')).toBe(false)
    expect(e.confermaValida(chiusa, 'DRINKPOS-PROVA-BAR')).toBe(false)
    expect(e.confermaValida(chiusa, '')).toBe(false)
    expect(e.confermaValida({}, '')).toBe(false)
  })
})

describe('quando si elimina', () => {
  it('subito è adesso; altrimenti 30 giorni dopo la chiusura', () => {
    expect(e.quandoEliminare(chiusa, { subito: true, adesso })).toEqual(adesso)
    expect(e.quandoEliminare(chiusa, { adesso }).toISOString()).toBe('2026-11-19T10:00:00.000Z')
  })

  it('una chiusura vecchia non programma nel passato', () => {
    expect(e.quandoEliminare({ ...chiusa, licenza_dal: '2026-01-01T00:00:00Z' }, { adesso })).toEqual(adesso)
  })

  it('la richiesta: in coda se subito, programmata se no, con chi l’ha chiesta', () => {
    expect(e.eliminazioneChiesta(chiusa, { subito: true, da: 'admin@x.it', adesso })).toEqual({
      stato: 'in coda', quando: adesso.toISOString(), subito: true, richiedente: 'admin', chiesta_il: adesso.toISOString(), chiesta_da: 'admin@x.it', errore: null,
    })
    expect(e.eliminazioneChiesta(chiusa, { adesso }).stato).toBe('programmata')
  })

  it('ogni giorno partono le programmate arrivate alla data', () => {
    const istanze = {
      'prova-bar': { ...chiusa, eliminazione: { stato: 'programmata', quando: '2026-10-28T00:00:00Z' } },
      'prova-due': { ...chiusa, progetto: 'drinkpos-prova-due', eliminazione: { stato: 'programmata', quando: '2026-11-30T00:00:00Z' } },
      riaperto: { ...chiusa, progetto: 'drinkpos-riaperto', licenza_stato: 'attiva', eliminazione: { stato: 'programmata', quando: '2026-10-01T00:00:00Z' } },
    }
    // Un locale riaperto nel frattempo non si elimina, anche se la data è passata.
    expect(e.daEliminareOggi(istanze, adesso)).toEqual(['prova-bar'])
  })
})

// Il titolare chiede la cancellazione dalla sua dashboard: sempre a 30
// giorni, mai subito, e la può annullare finché non parte.
describe('la richiesta del titolare', () => {
  const attiva = { stato: 'attiva', progetto: 'drinkpos-prova-bar', licenza_stato: 'attiva' }

  it('da un locale attivo o sospeso sì; da uno chiuso dall’admin, interno o esistente no', () => {
    expect(e.puoChiedereTitolare(attiva).ok).toBe(true)
    expect(e.puoChiedereTitolare({ ...attiva, licenza_stato: 'sospesa' }).ok).toBe(true)
    expect(e.puoChiedereTitolare({ ...attiva, licenza_stato: undefined }).ok).toBe(true)
    expect(e.puoChiedereTitolare({ ...attiva, licenza_stato: 'chiusa' }).perche).toMatch(/già chiuso/)
    expect(e.puoChiedereTitolare({ ...attiva, interna: true }).ok).toBe(false)
    expect(e.puoChiedereTitolare({ ...attiva, origine: 'esistente' }).ok).toBe(false)
    expect(e.puoChiedereTitolare({ ...attiva, stato: 'in corso' }).ok).toBe(false)
  })

  it('è programmata a 30 giorni da adesso, e ricorda com’era la licenza', () => {
    const r = e.richiestaTitolare({ ...attiva, licenza_stato: 'sospesa' }, { da: 'titolare@bar.it', adesso })
    expect(r).toMatchObject({ stato: 'programmata', subito: false, richiedente: 'titolare', licenza_prima: 'sospesa', chiesta_da: 'titolare@bar.it' })
    expect(r.quando).toBe('2026-11-28T10:00:00.000Z')
  })

  it('il titolare annulla solo la sua; l’admin qualunque; partita non più', () => {
    const sua = { eliminazione: { stato: 'programmata', richiedente: 'titolare' } }
    const dell_admin = { eliminazione: { stato: 'programmata', richiedente: 'admin' } }
    expect(e.puoAnnullare(sua, 'titolare').ok).toBe(true)
    expect(e.puoAnnullare(dell_admin, 'titolare').perche).toMatch(/scrivici/)
    expect(e.puoAnnullare(dell_admin, 'admin').ok).toBe(true)
    expect(e.puoAnnullare({ eliminazione: { stato: 'in corso', richiedente: 'titolare' } }, 'titolare').ok).toBe(false)
  })
})

describe('l’esito del workflow', () => {
  const archivio = { percorso: 'istanze/prova-bar/2026-10-29T10-00-00Z', zip: 'istanze/prova-bar/2026-10-29T10-00-00Z/archivio.zip', byte: 1024, conteggi: { documenti: 40, file: 3, utenti: 2 } }
  const run = { run_id: 77, inviato_il: '2026-10-29T10:00:00.000Z' }

  it('eliminata con l’archivio, e il run che l’ha mandata', () => {
    expect(e.esitoEliminazione({ slug: 'prova-bar', operazione: 'eliminazione', stato: 'eliminata', archivio, ...run })).toEqual({ slug: 'prova-bar', stato: 'eliminata', archivio, errore: null, ...run })
    // Senza run_id l'esito si legge lo stesso: a rifiutarlo è vincoliEsito.
    expect(e.esitoEliminazione({ slug: 'prova-bar', operazione: 'eliminazione', stato: 'errore' })).toMatchObject({ run_id: null, inviato_il: null })
  })

  // Audit del 09/11/2026, finding 12: il bucket lo sa la regia, e il
  // percorso resta nella cartella di quel locale.
  it('il bucket nel corpo si ignora; il percorso è semplice e dentro istanze/<slug>/', () => {
    const letto = e.esitoEliminazione({ slug: 'prova-bar', operazione: 'eliminazione', stato: 'eliminata', archivio: { ...archivio, bucket: 'bucket-di-un-altro' } })
    expect(letto.archivio).toEqual(archivio)
    expect(letto.archivio).not.toHaveProperty('bucket')
    for (const a of [
      { ...archivio, percorso: 'istanze/altro-bar/2026-10-29', zip: 'istanze/altro-bar/2026-10-29/archivio.zip' },
      { ...archivio, percorso: 'istanze/prova-bar/../altro-bar', zip: 'istanze/prova-bar/../altro-bar/archivio.zip' },
      { ...archivio, zip: 'istanze/prova-bar/altrove/archivio.zip' },
      { ...archivio, percorso: '/istanze/prova-bar/x', zip: '/istanze/prova-bar/x/archivio.zip' },
      { ...archivio, percorso: 'istanze/prova-bar/x y', zip: 'istanze/prova-bar/x y/archivio.zip' },
      { ...archivio, zip: 'istanze/prova-bar/2026-10-29T10-00-00Z/archivio.zip?x=1' },
      { ...archivio, percorso: '' },
    ]) {
      expect(e.esitoEliminazione({ slug: 'prova-bar', operazione: 'eliminazione', stato: 'eliminata', archivio: a }), JSON.stringify(a)).toBeNull()
    }
  })

  it('eliminata SENZA archivio non si accetta: il progetto non sparisce senza backup', () => {
    expect(e.esitoEliminazione({ slug: 'prova-bar', operazione: 'eliminazione', stato: 'eliminata' })).toBeNull()
  })

  it('non è un esito di eliminazione: null', () => {
    expect(e.esitoEliminazione({ slug: 'prova-bar', stato: 'attiva' })).toBeNull()
    expect(e.esitoEliminazione({ slug: 'X', operazione: 'eliminazione', stato: 'errore' })).toBeNull()
  })

  it('riuscita: l’istanza è eliminata e l’archivio scade dopo 180 giorni', () => {
    const d = e.documentoEliminazione({ stato: 'eliminata', archivio }, { ...chiusa, eliminazione: { stato: 'in corso', chiesta_da: 'admin@x.it' } }, adesso)
    expect(d.stato).toBe('eliminata')
    expect(d.eliminazione).toMatchObject({ stato: 'eliminata', archivio, chiesta_da: 'admin@x.it', scade_il: '2027-04-27T10:00:00.000Z' })
  })

  it('fallita: il locale resta com’era, si segna solo l’errore', () => {
    const d = e.documentoEliminazione({ stato: 'errore', errore: 'Backup non verificato' }, chiusa, adesso)
    expect(d).not.toHaveProperty('stato')
    expect(d.eliminazione).toMatchObject({ stato: 'fallita', errore: 'Backup non verificato' })
  })

  it('il titolare scarica finché l’archivio non scade', () => {
    const ist = { eliminazione: { stato: 'eliminata', archivio, scade_il: '2027-04-27T10:00:00Z' } }
    expect(e.archivioScaricabile(ist, adesso)).toBe(true)
    expect(e.archivioScaricabile(ist, new Date('2027-05-01T00:00:00Z'))).toBe(false)
    expect(e.archivioScaricabile({ eliminazione: { stato: 'fallita' } }, adesso)).toBe(false)
  })

  it('il link firmato è sul bucket della regia (ARCHIVIO_BUCKET), mai su uno scritto sull’istanza', () => {
    const codice = readFileSync('functions/index.js', 'utf8')
    const fn = codice.slice(codice.indexOf('exports.scaricaArchivio'), codice.indexOf('\n})', codice.indexOf('exports.scaricaArchivio')))
    expect(fn).toContain('getStorage().bucket(ARCHIVIO_BUCKET)')
    expect(fn).not.toMatch(/archivio\.bucket|\{ bucket/)
    expect(codice).toContain("const ARCHIVIO_BUCKET = process.env.ARCHIVIO_BUCKET || null")
    // Ogni regia ha il suo, nel file di configurazione del progetto.
    expect(readFileSync('functions/.env.drink-regia', 'utf8')).toMatch(/^ARCHIVIO_BUCKET=drink-regia-archivio$/m)
    expect(readFileSync('functions/.env.drink-regia-test', 'utf8')).toMatch(/^ARCHIVIO_BUCKET=drink-regia-test-archivio$/m)
  })
})
