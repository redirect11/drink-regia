'use strict'

// LE STAMPANTI DEL LOCALE NELLA RICHIESTA (REQ-FLOTTA-081, Daniele,
// 12/11/2026: «nella richiesta di acquisto va specificato quale stampante
// non fiscale usano … mettiamo anche quale stampante rt hanno»).

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const st = require('../functions/lib/stampanti.js')
const contatti = require('../functions/lib/contatti.js')
const elenco = require('../functions/stampanti.json')

describe('l’elenco', () => {
  it('le non fiscali in tre gruppi, come le ha dette Daniele', () => {
    expect(elenco.non_fiscali.map((g) => g.gruppo)).toEqual(['supportata', 'da_provare', 'non_supportata'])
    expect(elenco.non_fiscali[0].modelli).toEqual(['Epson TM-m30II', 'Epson TM-m30III'])
    expect(elenco.non_fiscali[1].modelli).toContain('Epson TM-T20III Ethernet')
    expect(elenco.non_fiscali[2].modelli).toContain('Star mC-Print3')
    expect(elenco.non_fiscali[2].modelli).toContain('Sunmi T2 o un altro terminale con stampante dentro')
  })
  it('gli RT come marche, e il file è uno solo per pagina e Functions', () => {
    expect(elenco.fiscali).toEqual(expect.arrayContaining(['Epson', 'Custom', 'RCH']))
    expect(readFileSync('src/lib/stampanti.js', 'utf8')).toContain("from '../../functions/stampanti.json'")
  })
})

describe('la scelta pulita', () => {
  it('una voce dell’elenco, «altra» con marca e modello, o nessuna', () => {
    const ok = st.stampantiPulite({ non_fiscale: { scelta: 'Epson TM-m30III' }, fiscale: { scelta: 'altra', altra: '  Olivetti Nettuna 7000 ' } })
    expect(ok).toEqual({ ok: true, perche: null, stampanti: { non_fiscale: { scelta: 'Epson TM-m30III', altra: null }, fiscale: { scelta: 'altra', altra: 'Olivetti Nettuna 7000' } } })
    expect(st.stampantiPulite({ non_fiscale: { scelta: 'nessuna' }, fiscale: { scelta: 'non_so' } }).ok).toBe(true)
  })
  it('si rifiuta una voce inventata, «altra» senza testo, o una scelta che manca', () => {
    expect(st.stampantiPulite({ non_fiscale: { scelta: 'HP LaserJet' }, fiscale: { scelta: 'Epson' } }).ok).toBe(false)
    expect(st.stampantiPulite({ non_fiscale: { scelta: 'altra', altra: 'x' }, fiscale: { scelta: 'Epson' } }).ok).toBe(false)
    expect(st.stampantiPulite({ non_fiscale: { scelta: 'Epson TM-m30II' } }).ok).toBe(false)
    expect(st.stampantiPulite({ non_fiscale: { scelta: 'altra', altra: 'a'.repeat(81) }, fiscale: { scelta: 'Epson' } }).ok).toBe(false)
  })
  it('l’«altra» perde i caratteri di controllo', () => {
    const r = st.stampantiPulite({ non_fiscale: { scelta: 'altra', altra: 'Marca\u0000 Modello' }, fiscale: { scelta: 'Epson' } })
    expect(r.stampanti.non_fiscale.altra).toBe('Marca Modello')
  })
  it('detta in una riga per il backoffice', () => {
    expect(st.stampantiDette({ non_fiscale: { scelta: 'Epson TM-m30III', altra: null }, fiscale: { scelta: 'altra', altra: 'Olivetti X' } })).toBe('Stampante: Epson TM-m30III · RT: Olivetti X')
    expect(st.stampantiDette({ non_fiscale: { scelta: 'nessuna', altra: null }, fiscale: { scelta: 'non_so', altra: null } })).toBe('Stampante: non ancora · RT: non lo sa')
    expect(st.stampantiDette(null)).toBeNull()
  })
})

describe('con la richiesta', () => {
  const cliente = { uid: 'u1', email: 'bar@example.com', nome_locale: 'Bar', slug: 'bar-mario' }
  const scelta = { piano: 'base', moduli: [], terminali: 1, intervallo: 'mese' }
  it('la richiesta di contatto porta le stampanti, e ne rifiuta di sbagliate', () => {
    const r = contatti.richiestaContatto(cliente, { ...scelta, stampanti: { non_fiscale: { scelta: 'Epson TM-m10' }, fiscale: { scelta: 'Custom' } } }, { pagamenti_online: false, moduli: {} })
    expect(r.documento.stampanti).toEqual({ non_fiscale: { scelta: 'Epson TM-m10', altra: null }, fiscale: { scelta: 'Custom', altra: null } })
    const no = contatti.richiestaContatto(cliente, { ...scelta, stampanti: { non_fiscale: { scelta: 'inventata' }, fiscale: { scelta: 'Custom' } } }, { pagamenti_online: false, moduli: {} })
    expect(no.ok).toBe(false)
  })
  it('l’acquisto le salva nella scheda del cliente prima del Checkout', () => {
    const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
    const checkout = codice.slice(codice.indexOf('exports.creaCheckout'), codice.indexOf('exports.', codice.indexOf('exports.creaCheckout') + 10))
    expect(checkout).toContain('stampanti.stampantiPulite(req.data.stampanti)')
    expect(checkout.indexOf('stampanti.stampantiPulite(')).toBeLessThan(checkout.indexOf('checkout.sessions.create'))
    expect(checkout).toContain("{ stampanti: st.stampanti, stampanti_il:")
  })
})
