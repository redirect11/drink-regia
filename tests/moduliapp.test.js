'use strict'

// I MODULI COMPRATI DALL'APP DEL LOCALE (REQ-FLOTTA-037). Da tana-drink
// (REQ-LIC-012), 02/11/2026: il titolare prova, aggiunge e disdice un modulo
// da «Marketplace → Moduli» nel gestionale. Le decisioni dell'utente: al
// mese come nel listino, la prova coi giorni dell'admin, compra solo il
// titolare. Il contratto dal lato dell'app: tana-drink/docs/marketplace-moduli.md.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const m = require('../functions/lib/moduliapp.js')
const { venditaPulita } = require('../functions/lib/free.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const vendita = venditaPulita({ prove: { magazzino: 14 }, moduli: { sumup: false } })
const istanza = { stato: 'attiva', progetto: 'drink-bar-mario', url: 'https://bar-mario.example.it' }
const stripe = { stato: 'attivo', origine: 'stripe', stripe_subscription: 'sub_1' }
const base = { slug: 'bar-mario', piano: 'base', moduli: ['clienti'], terminali: 2, abbonamento: stripe }

describe('il listino per l’app', () => {
  it('solo i moduli in vendita, col prezzo mensile IVA esclusa e i giorni di prova; niente nomi', () => {
    const { moduli } = m.catalogoModuli(vendita)
    expect(moduli.find((x) => x.id === 'magazzino')).toEqual({ id: 'magazzino', prezzo: 15, prova_giorni: 14 })
    expect(moduli.find((x) => x.id === 'clienti')).toEqual({ id: 'clienti', prezzo: 6, prova_giorni: 0 })
    expect(moduli.some((x) => x.id === 'sumup')).toBe(false)
    expect(Object.keys(moduli[0]).sort()).toEqual(['id', 'prezzo', 'prova_giorni'])
  })
})

describe('la richiesta', () => {
  it('un modulo, una delle tre azioni e il ritorno', () => {
    expect(m.corpoModulo({ modulo: 'clienti', azione: 'prova', ritorno: 'https://x' })).toEqual({ modulo: 'clienti', azione: 'prova', ritorno: 'https://x' })
    for (const body of [null, {}, { modulo: 'clienti', azione: 'compra' }, { modulo: 'Clienti!', azione: 'prova' }, { modulo: ['clienti'], azione: 'prova' }]) {
      expect(m.corpoModulo(body)).toBeNull()
    }
  })

  it('il ritorno sta sui domini dell’installazione: Hosting del progetto e indirizzo registrato', () => {
    for (const r of [
      'https://drink-bar-mario.web.app/bar?tab=marketplace&sezione=moduli',
      'https://drink-bar-mario.firebaseapp.com/bar',
      'https://bar-mario.example.it/bar?tab=marketplace',
    ]) {
      expect(m.ritornoValido(r, istanza)).toBe(r)
    }
    expect(m.ritornoValido('https://altro.example.it/bar', { ...istanza, domini: ['altro.example.it'] })).toBeTruthy()
  })

  it('niente altri domini, niente http, credenziali o porte nell’indirizzo', () => {
    for (const r of [
      '',
      'non un indirizzo',
      'http://drink-bar-mario.web.app/bar',
      'https://drink-altro.web.app/bar',
      'https://drink-bar-mario.web.app.evil.example/bar',
      'https://utente:pw@drink-bar-mario.web.app/bar',
      'https://drink-bar-mario.web.app:8443/bar',
      'javascript:alert(1)',
    ]) {
      expect(m.ritornoValido(r, istanza)).toBeNull()
    }
  })
})

describe('aggiungere un modulo', () => {
  it('su un abbonamento Stripe attivo: stesso piano, stessi terminali, i moduli più questo', () => {
    expect(m.sceltaPerAggiungere(base, istanza, 'magazzino', vendita)).toEqual({ scelta: { piano: 'base', moduli: ['clienti', 'magazzino'], terminali: 2 } })
  })

  it('un modulo in prova diventa comprato', () => {
    const inProva = { ...base, prove: { magazzino: { scade_il: '2026-11-10T00:00:00Z' } }, prove_fatte: ['magazzino'] }
    expect(m.sceltaPerAggiungere(inProva, istanza, 'magazzino', vendita).scelta.moduli).toContain('magazzino')
  })

  it('no sul Free, su un piano scritto a mano o regalato, su un abbonamento non attivo', () => {
    const errore = (cliente) => m.sceltaPerAggiungere(cliente, istanza, 'magazzino', vendita).errore
    expect(errore({ ...base, piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } })).toBe('I moduli si aggiungono ai piani a pagamento: il piano si cambia dall’area clienti.')
    expect(errore({ ...base, abbonamento: { stato: 'attivo', origine: 'manuale' } })).toMatch(/gestito dall’assistenza/)
    expect(errore({ ...base, abbonamento: { stato: 'attivo', origine: 'sconto' } })).toMatch(/gestito dall’assistenza/)
    expect(errore({ ...base, abbonamento: { ...stripe, stato: 'in sospeso' } })).toMatch(/non è attivo/)
  })

  it('no per un modulo già attivo, fuori vendita o sconosciuto, o un locale fermo', () => {
    expect(m.sceltaPerAggiungere(base, istanza, 'clienti', vendita).errore).toMatch(/già attivo/)
    expect(m.sceltaPerAggiungere({ ...base, piano: 'completo' }, istanza, 'magazzino', vendita).errore).toMatch(/già attivo/)
    expect(m.sceltaPerAggiungere(base, istanza, 'sumup', vendita).errore).toMatch(/non è in vendita/)
    expect(m.sceltaPerAggiungere(base, istanza, 'boh', vendita).errore).toBe('Modulo sconosciuto.')
    expect(m.sceltaPerAggiungere(base, { ...istanza, licenza_stato: 'sospesa' }, 'magazzino', vendita).errore).toBe('Il locale è sospeso.')
    expect(m.sceltaPerAggiungere(base, { ...istanza, stato: 'sospesa' }, 'magazzino', vendita).errore).toBe('Il locale non è attivo.')
  })
})

describe('disdire un modulo', () => {
  it('si toglie dall’abbonamento; si spegne da oggi, col conguaglio', () => {
    expect(m.sceltaPerDisdire(base, istanza, 'clienti', ADESSO)).toEqual({ scelta: { piano: 'base', moduli: [], terminali: 2 } })
    expect(m.dalGiorno(ADESSO)).toBe('2026-11-02')
  })

  it('anche un modulo non più in vendita: chi lo ha lo può togliere', () => {
    expect(m.sceltaPerDisdire({ ...base, moduli: ['sumup'] }, istanza, 'sumup', ADESSO).scelta.moduli).toEqual([])
  })

  it('no per un modulo compreso nel piano, in prova o non attivo, e sui piani che non passano da Stripe', () => {
    expect(m.sceltaPerDisdire({ ...base, piano: 'completo', moduli: [] }, istanza, 'magazzino', ADESSO).errore).toBe('Il modulo è compreso nel piano: si toglie cambiando piano.')
    expect(m.sceltaPerDisdire({ ...base, prove: { magazzino: { scade_il: '2026-11-10T00:00:00Z' } } }, istanza, 'magazzino', ADESSO).errore).toMatch(/in prova/)
    expect(m.sceltaPerDisdire(base, istanza, 'magazzino', ADESSO).errore).toBe('Il modulo non è attivo.')
    expect(m.sceltaPerDisdire({ ...base, abbonamento: { stato: 'attivo', origine: 'manuale' } }, istanza, 'clienti', ADESSO).errore).toMatch(/gestito dall’assistenza/)
  })
})

describe('i messaggi', () => {
  it('impersonali: l’app li mostra al titolare così come sono, senza «tu»', () => {
    const codice = readFileSync('functions/lib/moduliapp.js', 'utf8') + readFileSync('functions/lib/prove.js', 'utf8')
    const messaggi = [...codice.matchAll(/(?:errore|perche):\s*[`'](.+?)[`']/g)].map((x) => x[1])
    expect(messaggi.length).toBeGreaterThan(8)
    for (const t of messaggi) expect(t).not.toMatch(/\b(tu|tuo|tua|tuoi|hai|scegli|scrivici)\b|l’hai/i)
  })
})

describe('nelle Functions', () => {
  const codiceFn = readFileSync('functions/index.js', 'utf8')
  const tra = (da, a) => codiceFn.slice(codiceFn.indexOf(da), codiceFn.indexOf(a, codiceFn.indexOf(da)))
  const porta = tra('exports.moduloDallApp', '\n})')

  it('il listino è un GET pubblico col CORS aperto', () => {
    const catalogo = tra('exports.catalogoModuli', '\n})')
    expect(catalogo).toContain("res.set('Access-Control-Allow-Origin', '*')")
    expect(catalogo).toContain('moduliApp.catalogoModuli(await vendita())')
  })

  it('i controlli nell’ordine del contratto: installazione, titolare, ritorno, modulo in vendita', () => {
    const ordine = ['progettoDelToken(token)', "stato === 'eliminata'", 'verifyIdToken(token)', 'aggiornamenti.eTitolare(chi)', 'moduliApp.ritornoValido(', 'moduliApp.moduloInVendita(']
    const posti = ordine.map((x) => porta.indexOf(x))
    expect(posti.every((p) => p > 0)).toBe(true)
    expect([...posti].sort((a, b) => a - b)).toEqual(posti)
    expect(porta).toContain("return res.status(204).send('')")
    expect(porta).toContain("return no(403, ")
  })

  it('la prova è una funzione sola per la dashboard e per l’app', () => {
    expect(tra('exports.provaModulo', '\n})')).toContain('await accendiProva(ref, cliente, ist,')
    expect(porta).toContain('await accendiProva(docCliente.ref, cliente, ist, corpo.modulo, inVendita)')
    expect(tra('async function accendiProva', '\n}\n')).toContain("programma('prova', cliente.slug, puo.scade_il)")
  })

  it('aggiungere e disdire cambiano la subscription come «Cambia piano»; nessun Checkout dal ritorno', () => {
    expect(porta).toContain('await aggiornaSubscription(stripe, cliente.abbonamento.stripe_subscription, docCliente.id, d.scelta)')
    expect(porta).not.toContain('checkout.sessions.create')
    expect(porta).toContain("{ ok: true, dal: moduliApp.dalGiorno(adesso) }")
  })
})
