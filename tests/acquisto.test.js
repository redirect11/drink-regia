'use strict'

// IL CODICE SCONTO ALL'ACQUISTO E IL DEPLOY CHE PASSA DALL'ADMIN
// (REQ-FLOTTA-028, REQ-FLOTTA-011). L'utente, 02/11/2026: «per ora, tutti
// gli acquisti andati a buon fine richiedono che sia io admin a procedere
// con il deploy […] gli acquisti possono avere anche i codici sconto mi
// raccomando», e alle domande: il codice lo scrivono il titolare e l'admin,
// col prezzo Fondatori vale il più conveniente, al 100% senza Stripe.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const a = require('../functions/lib/acquisto.js')
const { sessioneCheckout, aggiornamentoDaEvento, fondatoreDaConfermare } = require('../functions/lib/abbonamento.js')
const { fineSconto } = require('../functions/lib/sconti.js')

const ADESSO = new Date('2026-11-02T10:00:00.000Z')
const codice = (percentuale, durata_mesi = null, extra = {}) => ({ codice: 'PROVA', percentuale, durata_mesi, attivo: true, ...extra })
const sconto = (percentuale, mesi = null) => a.scontoDelCodice(codice(percentuale, mesi), ADESSO)

describe('lo sconto di un acquisto', () => {
  it('i mesi che restano sono mesi di calendario, e uno cominciato conta intero', () => {
    expect(a.mesiRestanti(null, ADESSO)).toBeNull()
    expect(a.mesiRestanti(fineSconto(ADESSO.toISOString(), 3), ADESSO)).toBe(3)
    expect(a.mesiRestanti('2027-02-03', ADESSO)).toBe(4)
    expect(a.mesiRestanti('2026-11-20', ADESSO)).toBe(1)
  })

  it('un codice del registro parte oggi; uno disattivato non vale', () => {
    expect(sconto(20, 3)).toEqual({ codice: 'PROVA', percentuale: 20, durata_mesi: 3, dal: ADESSO.toISOString(), fino: '2027-02-02' })
    expect(sconto(100)).toMatchObject({ durata_mesi: null, fino: null })
    expect(a.scontoDelCodice(codice(20, null, { attivo: false }), ADESSO)).toBeNull()
    expect(a.scontoDelCodice(null)).toBeNull()
  })

  it('quello che l’admin ha già dato vale finché è in corso, anche se il codice è stato disattivato', () => {
    const dato = { codice: 'TANA-100', percentuale: 100, durata_mesi: null, dal: '2026-10-24T00:00:00Z', fino: null }
    expect(a.scontoInCorso({ sconto: dato }, ADESSO)).toEqual(dato)
    expect(a.scontoInCorso({ sconto: { ...dato, fino: '2026-11-01' } }, ADESSO)).toBeNull()
    expect(a.scontoInCorso({ sconto: null }, ADESSO)).toBeNull()
  })

  it('il coupon di Stripe: in percentuale, per i mesi che restano o per sempre', () => {
    expect(a.couponSconto(sconto(20, 3), { adesso: ADESSO }).coupon).toEqual({
      id: 'sconto-PROVA-20-mese-3m',
      percent_off: 20,
      duration: 'repeating',
      duration_in_months: 3,
      name: 'Codice PROVA: 20%',
      metadata: { sconto: 'PROVA' },
    })
    expect(a.couponSconto(sconto(20), { adesso: ADESSO }).coupon).toMatchObject({ id: 'sconto-PROVA-20-mese-forever', duration: 'forever' })
  })

  it('col pagamento annuale: meno di un anno non vale, fino a due anni copre la prima fattura, oltre si contano anni interi', () => {
    expect(a.couponSconto(sconto(20, 6), { intervallo: 'anno', adesso: ADESSO }).errore).toMatch(/vale col pagamento mensile/)
    expect(a.couponSconto(sconto(20, 18), { intervallo: 'anno', adesso: ADESSO }).coupon).toMatchObject({ duration: 'once' })
    // 36 mesi: tre fatture annuali (0, 12, 24), non la quarta a 36.
    expect(a.couponSconto(sconto(20, 36), { intervallo: 'anno', adesso: ADESSO }).coupon).toMatchObject({ duration: 'repeating', duration_in_months: 35 })
    expect(a.couponSconto(sconto(20), { intervallo: 'anno', adesso: ADESSO }).coupon).toMatchObject({ duration: 'forever' })
  })
})

describe('il codice o i Fondatori: vale il più conveniente nel primo anno', () => {
  it('sul Base mensile i Fondatori fanno risparmiare 174,40 €: un 20% no, un 50% sì', () => {
    // (32,70 − 25,00) × 12 mesi + 82 € di attivazione gratuita.
    expect(a.risparmioFondatori({ piano: 'base' })).toBe(17440)
    expect(a.risparmioCodice({ piano: 'base' }, sconto(20), ADESSO)).toBe(9488)
    expect(a.scontoCheVale({ scelta: { piano: 'base' }, sconto: sconto(20), fondatore: true, adesso: ADESSO })).toBe('fondatori')
    expect(a.scontoCheVale({ scelta: { piano: 'base' }, sconto: sconto(50), fondatore: true, adesso: ADESSO })).toBe('codice')
  })

  it('un codice breve conta solo i suoi mesi; senza posto Fondatori vale il codice; senza codice i Fondatori', () => {
    expect(a.risparmioCodice({ piano: 'base' }, sconto(50, 2), ADESSO)).toBe(Math.round(((3270 * 2 + 8200) * 50) / 100))
    expect(a.scontoCheVale({ scelta: { piano: 'base' }, sconto: sconto(5), fondatore: false })).toBe('codice')
    expect(a.scontoCheVale({ scelta: { piano: 'base' }, fondatore: true })).toBe('fondatori')
    expect(a.scontoCheVale({ scelta: { piano: 'base' }, fondatore: false })).toBeNull()
    // Il Completo non è coperto dall'offerta: il posto non c'entra.
    expect(a.scontoCheVale({ scelta: { piano: 'completo' }, fondatore: true })).toBeNull()
  })
})

describe('il Checkout e il webhook col codice', () => {
  const base = { uid: 'u1', cliente: { email: 'bar@example.com' }, scelta: { piano: 'base' }, ritorno: 'https://regia.example', aliquotaIva: 'txr_1', adesso: ADESSO }

  it('il coupon del codice va nel Checkout senza il segno dei Fondatori, e coi metadati dello sconto', () => {
    const s = sconto(20, 3)
    const sessione = sessioneCheckout({ ...base, coupon: 'sconto-PROVA-20-mese-3m', fondatore: false, sconto: a.metadatiSconto(s) })
    expect(sessione.discounts).toEqual([{ coupon: 'sconto-PROVA-20-mese-3m' }])
    expect(sessione.metadata).toMatchObject({ sconto: 'PROVA', sconto_percentuale: '20', sconto_mesi: '3', sconto_fino: '2027-02-02' })
    expect(sessione.metadata).not.toHaveProperty('fondatore')
    // L'attivazione si paga (col 20%): non è quella gratuita dei Fondatori.
    expect(sessione.line_items.at(-1).price_data.unit_amount).toBe(8200)
    expect(fondatoreDaConfermare('checkout.session.completed', { metadata: sessione.metadata })).toBeNull()
    // Coi Fondatori, come prima.
    expect(sessioneCheckout({ ...base, coupon: 'fondatori-base' }).metadata.fondatore).toBe('1')
  })

  it('il webhook scrive lo sconto sul cliente; senza codice non lo tocca', () => {
    const md = { uid: 'u1', piano: 'base', moduli: '', terminali: '1', intervallo: 'mese', ...a.metadatiSconto(sconto(20, 3)) }
    const agg = aggiornamentoDaEvento('checkout.session.completed', { metadata: md, customer: 'cus_1', subscription: 'sub_1' }, ADESSO)
    expect(agg.patch.sconto).toEqual({ codice: 'PROVA', percentuale: 20, durata_mesi: 3, dal: ADESSO.toISOString(), fino: '2027-02-02' })
    const senza = aggiornamentoDaEvento('checkout.session.completed', { metadata: { uid: 'u1', piano: 'base' } }, ADESSO)
    expect(senza.patch).not.toHaveProperty('sconto')
  })
})

describe('un codice al 100% dal titolare', () => {
  const cliente = { uid: 'u1', slug: 'bar-mario', abbonamento: { stato: 'attivo', origine: 'gratuito', dal: '2026-10-01T00:00:00Z', stripe_customer: 'cus_1' } }

  it('illimitato: il piano scelto è attivo e non si paga; il resto dell’abbonamento resta', () => {
    const { patch } = a.attivazioneConCodice({ cliente, codice: codice(100), scelta: { piano: 'completo', terminali: 2 }, adesso: ADESSO })
    expect(patch).toMatchObject({ piano: 'completo', moduli: [], terminali: 2, sconto: { codice: 'PROVA', percentuale: 100, fino: null } })
    expect(patch.abbonamento).toEqual({ stato: 'attivo', origine: 'sconto', pagato_fino_al: null, intervallo: 'mese', dal: '2026-10-01T00:00:00Z', stripe_customer: 'cus_1' })
  })

  it('a tempo: un piano a mano pagato fino alla fine dello sconto', () => {
    const { patch } = a.attivazioneConCodice({ cliente: { uid: 'u1', slug: 'bar-mario' }, codice: codice(100, 6), scelta: { piano: 'base' }, adesso: ADESSO })
    expect(patch.abbonamento).toMatchObject({ stato: 'attivo', origine: 'manuale', pagato_fino_al: '2027-05-02', dal: ADESSO.toISOString() })
  })

  it('si rifiuta: senza locale, un codice che non c’è o non è al 100%, un abbonamento Stripe attivo, un locale eliminato, un modulo fuori vendita', () => {
    const prova = (extra) => a.attivazioneConCodice({ cliente, codice: codice(100), scelta: { piano: 'base' }, ...extra }).errore
    expect(prova({ cliente: null })).toMatch(/Nessun locale/)
    expect(prova({ codice: null })).toMatch(/sconosciuto/)
    expect(prova({ codice: codice(20) })).toMatch(/vale al pagamento/)
    expect(prova({ cliente: { ...cliente, abbonamento: { stato: 'attivo', origine: 'stripe' } } })).toMatch(/pagamento online/)
    expect(prova({ istanza: { stato: 'eliminata' } })).toMatch(/eliminato/)
    expect(prova({ fuori: ['sumup'] })).toMatch(/Non più in vendita: sumup/)
  })
})

// Il limite di usi (02/11/2026, l'utente: «Aggiungiamo limite di utilizzo
// del codice»): il titolare consuma un uso al pagamento o col 100%.
describe('il limite di usi all’acquisto', () => {
  const cliente = { uid: 'u1', slug: 'bar-mario', abbonamento: { stato: 'attivo', origine: 'gratuito' } }

  it('un codice al 100% esaurito non attiva niente; uno con usi liberi conta un uso', () => {
    expect(a.attivazioneConCodice({ cliente, codice: codice(100, null, { usi_massimi: 5, usi: 5 }), scelta: { piano: 'base' }, adesso: ADESSO }).errore).toMatch(/esaurito/)
    expect(a.attivazioneConCodice({ cliente, codice: codice(100, null, { usi_massimi: 5, usi: 4 }), scelta: { piano: 'base' }, adesso: ADESSO }).uso).toBe(true)
    // Chi ha già lo sconto non ne consuma un altro.
    const giaSuo = { ...cliente, sconto: { codice: 'PROVA', percentuale: 100 } }
    expect(a.attivazioneConCodice({ cliente: giaSuo, codice: codice(100, null, { usi_massimi: 5, usi: 5 }), scelta: { piano: 'base' }, adesso: ADESSO }).uso).toBe(false)
  })

  it('il Checkout porta il segno dell’uso, e il webhook lo conta una volta al pagamento', () => {
    const md = { uid: 'u1', ...a.metadatiSconto(sconto(20, 3), { uso: true }) }
    expect(md.sconto_uso).toBe('1')
    expect(a.usoDaContare('checkout.session.completed', { metadata: md })).toEqual({ codice: 'PROVA', uid: 'u1' })
    expect(a.usoDaContare('checkout.session.expired', { metadata: md })).toBeNull()
    // Lo sconto già dato dall'admin, riusato al pagamento: nessun uso nuovo.
    expect(a.metadatiSconto(sconto(20, 3))).not.toHaveProperty('sconto_uso')
    expect(a.usoDaContare('checkout.session.completed', { metadata: { uid: 'u1', ...a.metadatiSconto(sconto(20, 3)) } })).toBeNull()
  })
})

describe('nelle Functions', () => {
  const codiceFn = readFileSync('functions/index.js', 'utf8')
  const tra = (da, a) => codiceFn.slice(codiceFn.indexOf(da), codiceFn.indexOf(a, codiceFn.indexOf(da)))

  it('il deploy automatico è spento finché l’admin non lo accende', () => {
    expect(tra('exports.chiediAttivazione', 'exports.avviaProvisioning')).toContain('automatico: impostazioni.deploy_automatico === true')
  })

  it('un Free che compra non si ripubblica da solo: aspetta l’admin, che lo autorizza', () => {
    const segue = tra('exports.licenzaSegueIlPiano', 'exports.autorizzaProfiloCompleto')
    expect(segue).toContain("if (impostazioni.deploy_automatico !== true) {")
    expect(segue).toContain('profilo_completo_da_autorizzare')
    const autorizza = tra('exports.autorizzaProfiloCompleto', '// ── IL PIANO FREE E LA VENDITA')
    expect(autorizza).toContain("req.auth?.token?.admin !== true")
    expect(autorizza).toContain("lanciaAggiornamento(slug, REF_APP, { profilo: 'completo' })")
  })

  it('il Checkout sceglie lo sconto prima di prenotare un posto Fondatori; il codice al 100% non ci passa', () => {
    const checkout = tra('exports.creaCheckout', 'async function liberaPosto')
    expect(checkout).toContain('acquisto.scontoCheVale({ scelta, sconto, fondatore: puoFondatore, adesso })')
    expect(checkout.indexOf('scontoCheVale')).toBeLessThan(checkout.indexOf('fondatori.prenota'))
    expect(checkout).toContain("if (sconto?.percentuale === 100) throw")
    for (const f of ['exports.verificaCodiceSconto', 'exports.attivaConCodice']) {
      expect(tra(f, '\n})')).toContain("req.auth.token?.email_verified !== true")
    }
  })

  it('il limite di usi: il Checkout tiene da parte l’uso e lo libera se la sessione non nasce; 100% e admin contano in transazione', () => {
    const checkout = tra('exports.creaCheckout', 'async function liberaPosto')
    expect(checkout).toContain('prenotaUsoCodice(sconto.codice, uid')
    expect(checkout).toContain('if (usoTenuto) await liberaUsoCodice(sconto.codice, uid)')
    expect(checkout).toContain('acquisto.metadatiSconto(sconto, { uso })')
    expect(tra('async function elaboraEventoStripe', '\n}\n')).toContain('await contaUsoCodice(daContare.codice, daContare.uid)')
    expect(tra('exports.attivaConCodice', '\n})')).toContain('if (e.uso) t.update(refCodice, sconti.usoConfermato(doc, uid))')
    expect(tra('exports.applicaSconto', '\n})')).toContain('if (e.uso) t.update(refCodice, sconti.usoConfermato(s, doc.id))')
    // Il limite si cambia anche dopo, solo dall'admin.
    const gestione = tra('exports.gestisciSconti', '\n})')
    expect(gestione).toContain("if (azione === 'limite')")
    expect(gestione).toContain("req.auth?.token?.admin !== true")
  })

})
