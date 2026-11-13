'use strict'

// «CAMBIA PIANO» DELL'ADMIN (REQ-FLOTTA-016): piano, moduli e terminali,
// con Stripe (addebito proporzionale) o fuori da Stripe (bonifico, omaggio);
// mai fuori da Stripe con un abbonamento Stripe che continua ad addebitare;
// ogni cambio nello storico.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { cambioAdmin, eRiduzione, decisioneManuale } = require('../functions/lib/cambiopiano.js')
const { sceltaCambiata } = require('../functions/lib/licenza.js')

const adesso = new Date('2026-10-30T10:00:00Z')
const conStripe = { uid: 'u1', piano: 'base', moduli: [], abbonamento: { stato: 'attivo', stripe_subscription: 'sub_1' } }
const aMano = { uid: 'u2', piano: 'base', moduli: [], abbonamento: { stato: 'attivo', origine: 'manuale' } }
const free = { uid: 'u3', piano: 'free', moduli: [], abbonamento: { stato: 'attivo', origine: 'gratuito' } }

describe('cambia piano dall’admin', () => {
  it('con Stripe: la scelta pulita, niente da scrivere sul cliente (lo fa il webhook), e lo storico', () => {
    const c = cambioAdmin(conStripe, { piano: 'base', moduli: ['magazzino', 'boh'], terminali: 2, modo: 'stripe' }, { da: 'admin@x.it', adesso })
    expect(c).toMatchObject({ ok: true, scelta: { piano: 'base', moduli: ['magazzino'], terminali: 2 }, cliente: null })
    expect(c.storico).toEqual({ il: '2026-10-30T10:00:00.000Z', da: 'admin@x.it', modo: 'stripe', piano: 'base', moduli: ['magazzino'], terminali: 2 })
  })

  it('l’admin non sceglie l’intervallo: con Stripe resta quello della subscription, fuori da Stripe non si scrive (REQ-FLOTTA-031)', () => {
    const c = cambioAdmin(conStripe, { piano: 'base', intervallo: 'anno', modo: 'stripe' }, { adesso })
    expect(c.scelta).toEqual({ piano: 'base', moduli: [], terminali: 1 })
    expect(cambioAdmin(aMano, { piano: 'completo', intervallo: 'anno', modo: 'fuori' }, { adesso }).cliente.intervallo).toBeUndefined()
  })

  it('fuori da Stripe: si scrive il piano con un abbonamento manuale che lo dice', () => {
    const c = cambioAdmin(free, { piano: 'completo', modo: 'fuori' }, { adesso })
    expect(c.cliente).toMatchObject({ piano: 'completo', abbonamento: { stato: 'attivo', origine: 'manuale', nota: expect.stringMatching(/fuori da Stripe/) } })
  })

  it('verso il Free, fuori da Stripe: abbonamento gratuito, senza moduli', () => {
    const c = cambioAdmin(aMano, { piano: 'free', moduli: ['staff'], modo: 'fuori' }, { adesso })
    expect(c.cliente).toMatchObject({ piano: 'free', moduli: [], terminali: 1, abbonamento: { origine: 'gratuito' } })
  })

  // tana-drink REQ-LIC-015, i buchi della PR #91 (07/11/2026).
  // Dal 07/11/2026 il menù digitale è compreso nel Base e nel Completo: gli
  // ordini dal telefono hanno sempre la loro base, e il Free i moduli li
  // toglie. La regola della base è provata in prove.test.js (problemaBasi).
  it('gli ordini dal telefono passano col Base e col Completo, che hanno il menù', () => {
    expect(cambioAdmin(conStripe, { piano: 'base', moduli: ['ordini_cliente'], modo: 'stripe' }).ok).toBe(true)
    expect(cambioAdmin(aMano, { piano: 'base', moduli: ['ordini_cliente'], modo: 'fuori' }).ok).toBe(true)
    expect(cambioAdmin(aMano, { piano: 'free', moduli: ['ordini_cliente'], modo: 'fuori' }).scelta.moduli).toEqual([])
    expect(cambioAdmin(aMano, { piano: 'completo', moduli: ['ordini_cliente'], modo: 'fuori' }).ok).toBe(true)
  })

  it('no: Stripe senza abbonamento, il Free su Stripe, fuori da Stripe con Stripe che addebita', () => {
    expect(cambioAdmin(aMano, { piano: 'completo', modo: 'stripe' }).perche).toMatch(/non ha un abbonamento Stripe/)
    expect(cambioAdmin(conStripe, { piano: 'free', modo: 'stripe' }).perche).toMatch(/non passa da Stripe/)
    expect(cambioAdmin(conStripe, { piano: 'completo', modo: 'fuori' }).perche).toMatch(/disdicilo prima/)
    expect(cambioAdmin({ ...conStripe, abbonamento: { ...conStripe.abbonamento, stato: 'disdetto' } }, { piano: 'completo', modo: 'fuori' }).ok).toBe(true)
  })

  it('no: piano o modo sconosciuti, cliente mancante', () => {
    expect(cambioAdmin(aMano, { piano: 'oro', modo: 'fuori' }).perche).toMatch(/Piano sconosciuto/)
    expect(cambioAdmin(aMano, { piano: 'base' }).perche).toMatch(/come si paga/)
    expect(cambioAdmin(null, { piano: 'base', modo: 'fuori' }).ok).toBe(false)
  })
})

// REQ-FLOTTA-046, audit di sicurezza del 09/11/2026, finding 5 (M2 del
// 22/10): dalla dashboard, su un abbonamento a mano, si scrive subito solo
// quello che toglie; quello che aggiunge è una richiesta all'assistenza.
describe('il cambio del titolare su un abbonamento a mano', () => {
  const manuale = { uid: 'u2', email: 'bar@example.it', nome_locale: 'Bar Mario', slug: 'bar-mario', piano: 'base', moduli: ['magazzino', 'staff'], terminali: 3, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-12-31' } }

  it('una riduzione si riconosce: stesso piano o più economico, nessuna funzione nuova, terminali non di più', () => {
    expect(eRiduzione(manuale, { piano: 'base', moduli: ['magazzino'], terminali: 3 })).toBe(true)
    expect(eRiduzione(manuale, { piano: 'base', moduli: ['magazzino', 'staff'], terminali: 2 })).toBe(true)
    expect(eRiduzione(manuale, { piano: 'base', moduli: ['magazzino', 'staff'], terminali: 3 })).toBe(true)
    expect(eRiduzione(manuale, { piano: 'base', moduli: [], terminali: 1 })).toBe(true)
    // Un modulo in più, un terminale in più, il piano più caro: no.
    expect(eRiduzione(manuale, { piano: 'base', moduli: ['magazzino', 'staff', 'clienti'], terminali: 3 })).toBe(false)
    expect(eRiduzione(manuale, { piano: 'base', moduli: ['magazzino'], terminali: 4 })).toBe(false)
    expect(eRiduzione(manuale, { piano: 'completo', moduli: [], terminali: 1 })).toBe(false)
    // Dal Completo al Base coi moduli che aveva già accesi: è una riduzione,
    // perché il Completo li comprendeva tutti.
    expect(eRiduzione({ ...manuale, piano: 'completo', moduli: [] }, { piano: 'base', moduli: ['clienti', 'sumup'], terminali: 3 })).toBe(true)
  })

  it('la riduzione si scrive subito, pulita e senza intervallo, come prima', () => {
    const d = decisioneManuale(manuale, { piano: 'base', moduli: ['magazzino', 'boh'], terminali: 2, intervallo: 'anno' })
    expect(d).toEqual({ via: 'manuale', patch: { piano: 'base', moduli: ['magazzino'], terminali: 2 } })
  })

  it('un aumento è una richiesta di contatto, con la scelta e quello che il cliente ha oggi; il piano non si tocca e la licenza non cambia', () => {
    const d = decisioneManuale(manuale, { piano: 'completo', moduli: ['magazzino'], terminali: 20 }, { adesso })
    expect(d.via).toBe('richiesta')
    expect(d.patch).toBeUndefined()
    expect(d.documento).toEqual({
      uid: 'u2',
      email: 'bar@example.it',
      nome_locale: 'Bar Mario',
      slug: 'bar-mario',
      scelta: { piano: 'completo', moduli: [], terminali: 20 },
      telefono: null,
      nota: expect.stringMatching(/abbonamento gestito a mano/),
      codice: null,
      dalla_dashboard: { piano: 'base', moduli: ['magazzino', 'staff'], terminali: 3 },
      stato: 'aperta',
      chiesta_il: '2026-10-30T10:00:00.000Z',
    })
    // Niente da scrivere su clienti/{uid}: il documento resta quello di
    // prima, e licenzaSegueIlPiano non vede nessun cambio.
    expect(sceltaCambiata(manuale, { ...manuale })).toBe(false)
  })

  it('la Function scrive la richiesta in contatti/ e risponde «richiesta»; il piano lo scrive solo per la riduzione', () => {
    const index = readFileSync('functions/index.js', 'utf8')
    const corpo = index.slice(index.indexOf('exports.cambiaScelta ='))
    const manualeFn = corpo.slice(corpo.indexOf("origine === 'manuale'"), corpo.indexOf('\n})'))
    expect(manualeFn).toContain('decisioneManuale({ uid, ...cliente }, scelta)')
    expect(manualeFn).toMatch(/if \(d\.via === 'richiesta'\) \{\s*await db\.doc\(`contatti\/\$\{uid\}`\)\.set\(d\.documento\)[\s\S]*return \{ ok: true, via: 'richiesta' \}/)
    expect(manualeFn).toContain('await db.doc(`clienti/${uid}`).set(d.patch, { merge: true })')
    expect(manualeFn).not.toContain('metadatiDi(uid, scelta)')
  })
})
