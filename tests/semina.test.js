'use strict'

// I LOCALI DI PROVA DELLA REGIA DI TEST (REQ-DEV-004): le persone e i loro
// documenti, come li scrive scripts/semina-test.mjs e come li leggono i
// test Playwright (e2e/). L'utente, 07/11/2026: «creare un po' di utenti
// che abbiano varie attivazioni del prodotto (gratuito, completo, mix di
// moduli, basic, etc...)».

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PERSONE, ADMIN, persona, emailDi, uidDi, documentoCliente, documentoIstanza, documentoRichiesta, documentiCassetto, documentiContatti, documentiSconti, movimentiDiProva, trafficoDiProva, postiFondatori, progettoAmmesso, passwordDiProva } from '../scripts/lib-semina.mjs'
import { SLUG_VALIDO, nuovoCliente } from '../src/lib/clienti.js'
import { problemiAccount } from '../src/lib/validazione.js'
import { canoneMensile, classifica, riepilogo, CLASSI } from '../src/lib/commerciale.js'
import { statoIstanza } from '../src/lib/istanze.js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { daLanciare } = require('../functions/lib/provisioning.js')
const { scriveLicenza } = require('../functions/lib/esistente.js')
const { movimentoValido } = require('../functions/lib/movimenti.js')

const ADESSO = new Date('2026-11-07T10:00:00.000Z')
const righe = PERSONE.map((p) => {
  const istanza = documentoIstanza(p, ADESSO)
  const richiesta = documentoRichiesta(p, ADESSO)
  return { cliente: documentoCliente(p, ADESSO), istanza, richiesta, stato: statoIstanza(istanza, richiesta), cassetto: documentiCassetto(p, ADESSO)?.cassetto || null }
})

describe('le persone', () => {
  it('coprono i casi che il prodotto conosce, ognuna con slug, email e uid validi e diversi', () => {
    const casi = PERSONE.map((p) => p.caso)
    expect(casi).toEqual(['free', 'base-manuale', 'completo-stripe', 'base-moduli', 'fondatore', 'sconto-100', 'prova-modulo', 'moroso', 'disdetto', 'da-approvare', 'senza-piano', 'eliminato'])
    expect(new Set(casi).size).toBe(PERSONE.length)
    // Lo slug è unico (REQ-FLOTTA-045): la semina scrive con l'Admin SDK,
    // fuori dalla Function che lo garantisce, e non deve creare doppioni.
    expect(new Set(PERSONE.map((p) => p.slug)).size).toBe(PERSONE.length)
    for (const p of PERSONE) {
      expect(p.slug).toMatch(SLUG_VALIDO)
      expect(emailDi(p.slug)).toMatch(/^[a-z0-9-]+@semina\.example$/)
      expect(uidDi(p.slug)).toBe(`semina-${p.slug}`)
    }
    expect(persona('free').slug).toBe('free-angolo')
    expect(ADMIN.slug).toMatch(SLUG_VALIDO)
  })

  it('ogni classe del commerciale ha almeno una persona', () => {
    const classi = new Set(righe.map(classifica))
    for (const c of Object.values(CLASSI)) expect(classi, c).toContain(c)
  })

  it('il cliente ha i blocchi della registrazione come li scrive il sito, il segno della semina e la sua situazione', () => {
    const base = documentoCliente(persona('base-manuale'), ADESSO)
    const vero = nuovoCliente({ uid: 'x', email: 'x@y.it', locale: { nome: 'Bar Tre Terminali' }, fatturazione: {}, referente: {} })
    expect(Object.keys(base)).toEqual(expect.arrayContaining(Object.keys(vero)))
    expect(base).toMatchObject({ semina: true, piano: 'base', terminali: 4, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2027-09-03' } })
    expect(base.fatturazione.partita_iva).toMatch(/^\d{11}$/)
    expect(base.consensi.termini_il).toBe('2026-09-23T10:00:00.000Z')
    const stripe = documentoCliente(persona('completo-stripe'), ADESSO)
    expect(stripe.abbonamento).toMatchObject({ origine: 'stripe', stripe_customer: 'cus_semina_completo-stripe', stripe_subscription: 'sub_semina_completo-stripe', intervallo: 'mese', pagato_fino: '2026-12-02T10:00:00.000Z', rinnovo_il: '2026-12-02T10:00:00.000Z' })
    expect(documentoCliente(persona('fondatore'), ADESSO).abbonamento.fondatore).toMatchObject({ numero: 1 })
    expect(documentoCliente(persona('sconto-100'), ADESSO).sconto).toMatchObject({ codice: 'SEMINA-100', percentuale: 100, fino: null })
    expect(documentoCliente(persona('prova-modulo'), ADESSO).prove.magazzino.scade_il).toBe('2027-01-06T10:00:00.000Z')
    expect(documentoCliente(persona('senza-piano'), ADESSO).piano).toBeUndefined()
    expect(documentoCliente(persona('moroso'), ADESSO).abbonamento.stato).toBe('non pagato')
  })

  it('le istanze sono «esistenti» senza licenza dalla regia, mai un progetto vero; chi aspetta o non ha un piano non ne ha', () => {
    for (const p of PERSONE) {
      const ist = documentoIstanza(p, ADESSO)
      if (!p.piano || p.richiesta) {
        expect(ist).toBeNull()
        continue
      }
      expect(ist).toMatchObject({ origine: 'esistente', licenza_dalla_regia: false, interna: false, progetto: `drinkpos-${p.slug}`, semina: true })
      expect(scriveLicenza(ist)).toBe(false)
    }
    expect(documentoIstanza(persona('moroso'), ADESSO)).toMatchObject({ stato: 'attiva', licenza_stato: 'sospesa', licenza_per: 'pagamento' })
    expect(documentoIstanza(persona('eliminato'), ADESSO)).toMatchObject({ stato: 'eliminata', eliminazione: { stato: 'eliminata' } })
    expect(documentoIstanza(persona('free'), ADESSO).profilo).toBe('leggero')
  })

  it('una richiesta di prova non fa mai partire il provisioning', () => {
    const r = documentoRichiesta(persona('da-approvare'), ADESSO)
    expect(r).toMatchObject({ stato: 'da approvare', slug: 'da-approvare', semina: true })
    expect(daLanciare(null, r)).toBe(false)
    expect(documentoRichiesta(persona('free'), ADESSO)).toBeNull()
    expect(() => documentoRichiesta({ ...persona('da-approvare'), richiesta: 'in coda' }, ADESSO)).toThrow(/in coda/)
  })

  it('il cassetto AI ha il credito uguale a ricariche meno consumi meno un po’ di storia', () => {
    const c = documentiCassetto(persona('completo-stripe'), ADESSO)
    const ricaricato = c.ricariche.reduce((s, r) => s + r.importo_microeuro, 0)
    const speso = c.consumi.reduce((s, x) => s + x.costo_microeuro, 0)
    expect(c.cassetto).toMatchObject({ slug: 'completo-stripe', speso_mese_microeuro: speso, credito_microeuro: ricaricato - speso - 2_000_000, mese: '2026-11', semina: true })
    expect(c.ricariche.map((r) => r.origine)).toEqual(['stripe', 'omaggio'])
    expect(documentiCassetto(persona('free'), ADESSO)).toBeNull()
  })
})

describe('contatti, sconti, movimenti, traffico, Fondatori', () => {
  it('tre richieste di contatto: una aperta, una gestita, una dall’app', () => {
    const c = documentiContatti(ADESSO)
    expect(c.map((x) => [x.id, x.stato])).toEqual([
      ['semina-senza-piano', 'aperta'],
      ['semina-da-approvare', 'gestita'],
      ['semina-base-tre-terminali_staff', 'aperta'],
    ])
    expect(c[2].nota).toMatch(/^Dall’app:/)
  })

  it('tre codici sconto, tutti segnati', () => {
    const s = documentiSconti(ADESSO)
    expect(s.map((x) => x.codice)).toEqual(['BENVENUTO-20', 'SEMINA-100', 'ESTATE-10'])
    expect(s.every((x) => x.semina === true)).toBe(true)
  })

  it('i movimenti sono validi, coprono i mesi passati, hanno l’attivazione nella prima fattura e la ricarica AI', () => {
    const m = movimentiDiProva(ADESSO)
    expect(m.length).toBeGreaterThan(8)
    expect(m.every(movimentoValido)).toBe(true)
    expect(m.every((x) => x.semina === true && Date.parse(x.il) <= ADESSO.getTime())).toBe(true)
    const prima = m.find((x) => x.id === 'fattura-in_semina_completo-stripe_1')
    expect(prima).toMatchObject({ tipo: 'abbonamento', importo: 151, iva: 33.22, totale: 184.22, descrizione: 'Attivazione; Piano completo' })
    const seconda = m.find((x) => x.id === 'fattura-in_semina_completo-stripe_2')
    expect(seconda.importo).toBe(69)
    expect(m.find((x) => x.tipo === 'ricarica_ai')).toMatchObject({ slug: 'completo-stripe', importo: 25 })
    // Il Fondatore paga 25, senza attivazione; l'annuale paga dieci mensilità.
    expect(m.find((x) => x.slug === 'fondatore-base').importo).toBe(25)
    expect(m.find((x) => x.slug === 'base-mix-moduli').importo).toBe(627 + 82)
    // Chi è eliminato, chi aspetta e chi non paga con Stripe o a mano non ha movimenti.
    expect(m.some((x) => ['eliminato-chiuso', 'da-approvare', 'free-angolo', 'sconto-cento'].includes(x.slug))).toBe(false)
  })

  it('il traffico: 60 giorni fino a oggi, gli stessi numeri a ogni semina, le somme tornano', () => {
    const t = trafficoDiProva(ADESSO)
    expect(t).toHaveLength(60)
    expect(t[59].giorno).toBe('2026-11-07')
    expect(t[0].giorno).toBe('2026-09-09')
    expect(trafficoDiProva(ADESSO)).toEqual(t)
    for (const g of t) {
      expect(Object.values(g.pagine).reduce((s, v) => s + v, 0)).toBe(g.viste)
      expect(Object.values(g.lingue).reduce((s, v) => s + v, 0)).toBe(g.viste)
      expect(Object.values(g.provenienze).reduce((s, v) => s + v, 0)).toBe(g.viste)
      expect(Object.values(g.pagine).every((v) => v >= 0)).toBe(true)
      expect(g.semina).toBe(true)
    }
    expect(t.some((g) => g.eventi.registrazione > 0)).toBe(true)
  })

  it('i posti Fondatori di prova sono quelli delle persone Fondatrici', () => {
    expect(postiFondatori(ADESSO)).toEqual({ 'semina-fondatore-base': { numero: 1, il: '2026-09-08T10:00:00.000Z', slug: 'fondatore-base', semina: true } })
  })

  it('il riepilogo del commerciale sulle persone ha numeri sensati', () => {
    const r = riepilogo({ righe, movimenti: movimentiDiProva(ADESSO), traffico: trafficoDiProva(ADESSO), contatti: documentiContatti(ADESSO), fondatori: { assegnati: postiFondatori(ADESSO) } }, { giorni: 30, adesso: ADESSO })
    // «da approvare» ha già il piano pagato a mano: per il commerciale paga.
    expect(r.clienti).toMatchObject({ totale: 12, paganti: 6, free: 1, gratis: 1, inAttesa: 1, fermi: 1, disdetti: 1, eliminati: 1 })
    expect(r.ricavi.mrr).toBe(righe.reduce((s, x) => s + canoneMensile(x.cliente, ADESSO), 0))
    expect(r.ricavi.incasso).toBeGreaterThan(0)
    expect(r.traffico.viste).toBeGreaterThan(500)
    expect(r.attenzione.contattiAperti).toBe(2)
    expect(r.fondatori.assegnati).toBe(1)
  })
})

describe('le guardie dello script', () => {
  it('semina solo un progetto di test; la produzione mai', () => {
    expect(progettoAmmesso('drink-regia-test')).toBe(true)
    expect(progettoAmmesso('drink-regia')).toBe(false)
    expect(progettoAmmesso('tana-drink')).toBe(false)
    expect(progettoAmmesso(null)).toBe(false)
  })

  it('la password di prova passa i controlli della registrazione e non si stampa', () => {
    const pwd = passwordDiProva(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))
    expect(problemiAccount({ email: 'a@b.it', password: pwd, conferma: pwd })).toEqual({})
    const script = readFileSync('scripts/semina-test.mjs', 'utf8')
    expect(script).not.toMatch(/console\.log\([^)]*pwd/)
    expect(script).toMatch(/progettoAmmesso\(PROGETTO\)/)
    expect(script).toMatch(/where\('semina', '==', true\)/)
  })
})
