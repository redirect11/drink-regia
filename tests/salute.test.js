'use strict'

// LA SALUTE DELLA FLOTTA (REQ-FLOTTA-109). Daniele, 14/11/2026, dopo la
// verifica a mano del 500 di drinkpos-prova-e2e: «dove le vedi queste
// cose?», e sulla proposta di una sezione «Salute» nel backoffice che
// mostri per ogni locale l'ultima presentazione, gli errori delle 24 ore e
// i permessi che mancano: «quete due». Qui la logica pura
// (functions/lib/salute.js) e la forma della Function.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const s = require('../functions/lib/salute.js')

const ADESSO = new Date('2026-11-14T20:00:00.000Z')
const oreFa = (n) => new Date(ADESSO.getTime() - n * 3600000).toISOString()

describe('quali locali si controllano', () => {
  it('quelli con un progetto, attivi o sospesi; non la demo, i simulati, la semina, gli eliminati, quelli senza progetto', () => {
    expect(s.daControllare({ slug: 'prova-bar', progetto: 'drinkpos-prova-bar', stato: 'attiva' })).toBe(true)
    expect(s.daControllare({ slug: 'tana-drink', progetto: 'tana-drink', stato: 'attiva', licenza_dalla_regia: false })).toBe(true)
    expect(s.daControllare({ slug: 'moroso', progetto: 'drinkpos-moroso', stato: 'sospesa' })).toBe(true)
    expect(s.daControllare({ slug: 'drinkpos-demo', progetto: 'drinkpos-demo', stato: 'attiva' })).toBe(false)
    expect(s.daControllare({ slug: 'finto', progetto: 'drinkpos-finto', stato: 'attiva', simulata: true })).toBe(false)
    // La semina della regia di test: un nome di progetto senza progetto.
    expect(s.daControllare({ slug: 'base-mix-moduli', progetto: 'drinkpos-base-mix-moduli', stato: 'attiva', semina: true })).toBe(false)
    expect(s.daControllare({ slug: 'via', progetto: 'drinkpos-via', stato: 'eliminata' })).toBe(false)
    expect(s.daControllare({ slug: 'nuovo', stato: 'in corso' })).toBe(false)
    expect(s.daControllare(null)).toBe(false)
  })
})

describe('i permessi che mancano', () => {
  it('si chiedono a Google i permessi dei tre ruoli che Terraform dà alla regia', () => {
    expect(s.PERMESSI_PROGETTO).toEqual(['datastore.entities.get', 'datastore.entities.update', 'firebaseauth.users.get'])
    expect(s.PERMESSI_FIRMA).toEqual(['iam.serviceAccounts.signBlob'])
  })

  it('tutti concessi: niente manca', () => {
    expect(s.ruoliMancanti({ progetto: [...s.PERMESSI_PROGETTO], firma: [...s.PERMESSI_FIRMA] })).toEqual([])
  })

  it('il caso di drinkpos-prova-e2e: nessun permesso, mancano tutti e tre i ruoli, ognuno una volta sola', () => {
    expect(s.ruoliMancanti({ progetto: [], firma: [] })).toEqual([
      { ruolo: 'roles/datastore.user', dove: 'progetto' },
      { ruolo: 'roles/firebaseauth.viewer', dove: 'progetto' },
      { ruolo: 'roles/iam.serviceAccountTokenCreator', dove: 'account firebase-adminsdk-fbsvc' },
    ])
  })

  it('manca solo la firma', () => {
    expect(s.ruoliMancanti({ progetto: [...s.PERMESSI_PROGETTO], firma: [] })).toEqual([
      { ruolo: 'roles/iam.serviceAccountTokenCreator', dove: 'account firebase-adminsdk-fbsvc' },
    ])
  })

  it('una prova che non ha risposto non si spaccia per un permesso mancante', () => {
    expect(s.ruoliMancanti({ progetto: null, firma: [...s.PERMESSI_FIRMA] })).toEqual([])
  })
})

describe('l’ultima presentazione', () => {
  it('versione, ore da allora, e la versione che la regia ha pubblicato', () => {
    const ist = { presentazione: { versione: 'v1.10.50-beta', il: oreFa(3), prima_il: oreFa(5) }, versione: 'v1.10.50-beta' }
    expect(s.statoPresentazione(ist, ADESSO)).toEqual({
      versione: 'v1.10.50-beta',
      minima: 'v1.10.50-beta',
      dispositivi: 0,
      anteprima: null,
      il: oreFa(3),
      prima_il: oreFa(5),
      ore_fa: 3,
      pubblicata: 'v1.10.50-beta',
      diversa: false,
    })
  })

  it('diversa da quella pubblicata (il caso di tana-drink-test alla 1.10.40), con o senza la v', () => {
    const ist = { presentazione: { versione: 'v1.10.40-beta', il: oreFa(1) }, versione: '1.10.50-beta' }
    expect(s.statoPresentazione(ist, ADESSO).diversa).toBe(true)
    expect(s.statoPresentazione({ presentazione: { versione: 'v1.10.50', il: oreFa(1) }, versione: '1.10.50' }, ADESSO).diversa).toBe(false)
  })

  it('un locale esistente non ha una versione pubblicata dalla regia: non è «diversa»', () => {
    expect(s.statoPresentazione({ presentazione: { versione: 'v1.10.49', il: oreFa(2) } }, ADESSO)).toMatchObject({ pubblicata: null, diversa: false })
  })

  it('mai presentato', () => {
    expect(s.statoPresentazione({}, ADESSO)).toEqual({ versione: null, minima: null, dispositivi: 0, anteprima: null, il: null, prima_il: null, ore_fa: null, pubblicata: null, diversa: false })
  })

  // REQ-FLOTTA-112: la più bassa fra i dispositivi, quanti sono (solo quelli
  // visti negli ultimi 30 giorni) e l'ultima anteprima, a parte.
  it('i dispositivi: la versione più bassa, quanti sono, l’ultima anteprima', () => {
    const ist = {
      versione: 'v1.10.51-beta',
      presentazione: {
        versione: 'v1.10.51-beta',
        minima: 'v1.10.40-beta',
        il: oreFa(1),
        dispositivi: { a: { versione: 'v1.10.51-beta', il: oreFa(1) }, b: { versione: 'v1.10.40-beta', il: oreFa(48) }, vecchio: { versione: 'v1.10.4', il: oreFa(31 * 24) } },
        anteprima: { versione: 'v1.10.52-beta', il: oreFa(2) },
      },
    }
    expect(s.statoPresentazione(ist, ADESSO)).toMatchObject({ versione: 'v1.10.51-beta', minima: 'v1.10.40-beta', dispositivi: 2, anteprima: { versione: 'v1.10.52-beta', il: oreFa(2) }, diversa: false })
  })
})

describe('gli errori delle 24 ore, dai registri della regia', () => {
  const voci = [
    { timestamp: oreFa(1), resource: { labels: { service_name: 'presentazione' } }, httpRequest: { status: 500 } },
    { timestamp: oreFa(2), resource: { labels: { service_name: 'presentazione' } }, httpRequest: { status: 503 } },
    { timestamp: oreFa(3), resource: { labels: { service_name: 'richiestaai' } }, httpRequest: { status: 502 } },
    { timestamp: oreFa(1), resource: { labels: { service_name: 'presentazione' } }, severity: 'ERROR', textPayload: '[presentazione] prova-e2e: la licenza non si legge: 7 PERMISSION_DENIED' },
    { timestamp: oreFa(4), resource: { labels: { service_name: 'gestiscicollaboratori' } }, severity: 'ERROR', jsonPayload: { message: 'invio fallito a mario.rossi@example.com' } },
  ]

  it('per Function: quante risposte 5xx e quando l’ultima', () => {
    const r = s.riassuntoRegistri(voci, ['prova-e2e', 'prova-bar'])
    expect(r.per_function).toEqual([
      { servizio: 'presentazione', errori: 2, ultimo: oreFa(1) },
      { servizio: 'richiestaai', errori: 1, ultimo: oreFa(3) },
    ])
  })

  it('le righe d’errore, dalla più recente, col locale quando la riga lo nomina, e senza email', () => {
    const r = s.riassuntoRegistri(voci, ['prova-e2e', 'prova-bar'])
    expect(r.righe).toEqual([
      { il: oreFa(1), servizio: 'presentazione', slug: 'prova-e2e', testo: '[presentazione] prova-e2e: la licenza non si legge: 7 PERMISSION_DENIED' },
      { il: oreFa(4), servizio: 'gestiscicollaboratori', slug: null, testo: 'invio fallito a «email»' },
    ])
  })

  it('un nome di locale dentro un altro nome non conta: prova-bar non è prova-bar-due', () => {
    const r = s.riassuntoRegistri([{ timestamp: oreFa(1), resource: { labels: { service_name: 'x' } }, severity: 'ERROR', textPayload: 'guasto su prova-bar-due' }], ['prova-bar'])
    expect(r.righe[0].slug).toBe(null)
  })

  it('al massimo 30 righe, e un testo lungo si taglia', () => {
    const tante = Array.from({ length: 40 }, (_, i) => ({ timestamp: oreFa(i % 20), resource: { labels: { service_name: 'x' } }, severity: 'ERROR', textPayload: 'a'.repeat(600) }))
    const r = s.riassuntoRegistri(tante, [])
    expect(r.righe).toHaveLength(30)
    expect(r.righe[0].testo.length).toBeLessThanOrEqual(301)
  })
})

describe('il giudizio su un locale', () => {
  it('un permesso che manca è un problema; errori, nessuna presentazione o una versione diversa chiedono attenzione', () => {
    const presentato = { versione: 'v1', diversa: false }
    expect(s.giudizio({ mancanti: [{ ruolo: 'roles/datastore.user' }], presentazione: presentato, errori: 0 })).toBe('problema')
    expect(s.giudizio({ mancanti: [], presentazione: presentato, errori: 2 })).toBe('attenzione')
    expect(s.giudizio({ mancanti: [], presentazione: { versione: null, diversa: false }, errori: 0 })).toBe('attenzione')
    expect(s.giudizio({ mancanti: [], presentazione: { versione: 'v1', diversa: true }, errori: 0 })).toBe('attenzione')
    expect(s.giudizio({ mancanti: [], presentazione: presentato, errori: 0 })).toBe('ok')
  })
})

describe('il rapporto per il backoffice', () => {
  it('ogni locale col suo giudizio; la demo e i simulati ci sono, ma «non controllati»', () => {
    const istanze = [
      { slug: 'prova-e2e', progetto: 'drinkpos-prova-e2e', stato: 'attiva', presentazione: { versione: 'v1.10.50-beta', il: oreFa(2) }, versione: 'v1.10.50-beta' },
      { slug: 'drinkpos-demo', progetto: 'drinkpos-demo', stato: 'attiva' },
    ]
    const permessi = { 'prova-e2e': { progetto: [], firma: [] } }
    const registri = { leggibili: true, voci: [{ timestamp: oreFa(1), resource: { labels: { service_name: 'presentazione' } }, severity: 'ERROR', textPayload: '[presentazione] prova-e2e: la licenza non si legge' }] }
    const r = s.rapporto({ istanze, permessi, registri, adesso: ADESSO })
    expect(r.controllato_il).toBe(ADESSO.toISOString())
    expect(r.registri).toMatchObject({ leggibili: true, perche: null })
    const e2e = r.locali.find((l) => l.slug === 'prova-e2e')
    expect(e2e).toMatchObject({ controllato: true, giudizio: 'problema', errori: 1, progetto: 'drinkpos-prova-e2e' })
    expect(e2e.mancanti).toHaveLength(3)
    expect(r.locali.find((l) => l.slug === 'drinkpos-demo')).toMatchObject({ controllato: false, giudizio: null, mancanti: [] })
    // Prima i problemi, poi l'attenzione, poi il resto.
    expect(r.locali[0].slug).toBe('prova-e2e')
  })

  it('registri non leggibili: si dice perché, e gli errori non contano', () => {
    const r = s.rapporto({ istanze: [], permessi: {}, registri: { leggibili: false, perche: 'manca roles/logging.viewer' }, adesso: ADESSO })
    expect(r.registri).toEqual({ leggibili: false, perche: 'manca roles/logging.viewer', per_function: [], righe: [] })
  })
})

describe('la Function e i permessi', () => {
  const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
  const sezione = codice.indexOf('// ── LA SALUTE DELLA FLOTTA')
  const inizio = codice.indexOf('exports.saluteDellaFlotta = onCall(')
  const fine = codice.indexOf('\n})\n', inizio)
  const tutto = codice.slice(sezione, fine)

  it('c’è, è solo dell’amministratore, e non è una Function HTTP aperta', () => {
    expect(sezione).toBeGreaterThan(0)
    expect(inizio).toBeGreaterThan(sezione)
    expect(codice.slice(inizio, fine)).toContain("if (req.auth?.token?.admin !== true) throw new HttpsError('permission-denied'")
  })

  it('i permessi li chiede a Google con testIamPermissions: non tocca i dati del locale e non crea credenziali', () => {
    expect(tutto).toContain(':testIamPermissions')
    expect(tutto).not.toContain('createCustomToken')
    expect(tutto).not.toContain('firestoreDi(')
  })

  it('i registri sono quelli della regia stessa, delle ultime 24 ore', () => {
    expect(tutto).toContain('logging.googleapis.com/v2/entries:list')
    expect(tutto).toContain('`projects/${PROGETTO_REGIA}`')
  })

  it('l’account della regia ha il ruolo per leggere i suoi registri', () => {
    const script = readFileSync('scripts/account-runtime.mjs', 'utf8')
    expect(script).toContain("'roles/logging.viewer'")
  })
})
