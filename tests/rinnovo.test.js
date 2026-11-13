'use strict'

// IL RINNOVO DI UN LOCALE SOSPESO (REQ-FLOTTA-090). Daniele, 13/11/2026:
// «Il servizio viene sospeso subito ma dobbiamo portare l'utente alla
// schermata di pagamento per il rinnovo in qualche modo (se prevediamo di
// accettare pagamenti altrimenti sito sospeso e si danno le info di
// contatto per contattarci)». Qui la logica pura: l'indirizzo del rinnovo
// nella licenza, la fattura da pagare, cosa dice l'area del titolare; e il
// controllo sul sorgente della callable, che non si fida del browser.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { situazioneRinnovo, abbonamentoDetto, PARAMETRO_RINNOVO } from '../src/lib/rinnovo.js'
import { EMAIL_CONTATTI } from '../src/lib/prodotto.js'

const require = createRequire(import.meta.url)
const { rinnovoUrl, fatturaDelRinnovo, PERCORSO_RINNOVO } = require('../functions/lib/rinnovo.js')

describe('l’indirizzo del rinnovo, per la licenza', () => {
  it('è la sezione del piano nell’area del titolare, con ?rinnovo=1, sull’origine della regia', () => {
    expect(PERCORSO_RINNOVO).toBe('/dashboard/piano?rinnovo=1')
    expect(rinnovoUrl('https://drink-regia-test.web.app')).toBe('https://drink-regia-test.web.app/dashboard/piano?rinnovo=1')
    expect(rinnovoUrl('https://drink-regia.web.app/')).toBe('https://drink-regia.web.app/dashboard/piano?rinnovo=1')
    expect(rinnovoUrl('https://drink-regia.web.app/accesso?x=1#y')).toBe('https://drink-regia.web.app/dashboard/piano?rinnovo=1')
    // In locale, sugli emulatori.
    expect(rinnovoUrl('http://localhost:5173')).toBe('http://localhost:5173/dashboard/piano?rinnovo=1')
  })

  it('senza un indirizzo http o https buono: null', () => {
    for (const v of [null, undefined, '', 'drink-regia.web.app', 'javascript:alert(1)', 'ftp://x.it', 42]) expect(rinnovoUrl(v)).toBeNull()
  })

  it('il parametro è lo stesso che legge l’area del titolare', () => {
    expect(PERCORSO_RINNOVO).toContain(`?${PARAMETRO_RINNOVO}=1`)
  })
})

describe('la fattura da pagare per il rinnovo', () => {
  const fattura = (extra = {}) => ({ id: 'in_1', status: 'open', amount_remaining: 3900, hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/test_x', ...extra })

  it('l’ultima fattura della subscription, aperta e con qualcosa da pagare: la sua pagina di Stripe', () => {
    expect(fatturaDelRinnovo({ id: 'sub_1', latest_invoice: fattura() })).toBe('https://invoice.stripe.com/i/acct_1/test_x')
  })

  it('pagata, annullata, in bozza, a zero, non espansa o senza pagina https: niente (si va al portale)', () => {
    for (const status of ['paid', 'void', 'draft', 'uncollectible']) expect(fatturaDelRinnovo({ latest_invoice: fattura({ status }) })).toBeNull()
    expect(fatturaDelRinnovo({ latest_invoice: fattura({ amount_remaining: 0 }) })).toBeNull()
    expect(fatturaDelRinnovo({ latest_invoice: 'in_1' })).toBeNull()
    expect(fatturaDelRinnovo({ latest_invoice: fattura({ hosted_invoice_url: 'http://invoice.stripe.com/i/x' }) })).toBeNull()
    expect(fatturaDelRinnovo({ latest_invoice: fattura({ hosted_invoice_url: 'javascript:alert(1)' }) })).toBeNull()
    expect(fatturaDelRinnovo({ latest_invoice: fattura({ hosted_invoice_url: null }) })).toBeNull()
    expect(fatturaDelRinnovo(null)).toBeNull()
    expect(fatturaDelRinnovo({})).toBeNull()
  })
})

describe('la callable pagamentoRinnovo, sul sorgente', () => {
  // I fine riga come li lascia git sulla macchina (CRLF su Windows): la
  // fine della callable si cerca coi soli \n.
  const index = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
  const inizio = index.indexOf('exports.pagamentoRinnovo')
  const corpo = index.slice(inizio, index.indexOf('\n})\n', inizio))

  it('esiste, col segreto di Stripe, e vuole l’accesso', () => {
    expect(inizio).toBeGreaterThan(0)
    expect(corpo).toContain('secrets: [STRIPE_SECRET_KEY]')
    expect(corpo).toMatch(/if \(!req\.auth\?\.uid\) throw new HttpsError\('unauthenticated'/)
  })

  it('legge il cliente di chi chiama e la SUA subscription: niente dal browser', () => {
    expect(corpo).toContain('db.doc(`clienti/${req.auth.uid}`)')
    expect(corpo).not.toMatch(/req\.data/)
    expect(corpo).toContain('cliente.abbonamento.stripe_subscription')
    expect(corpo).toMatch(/subscriptions\.retrieve\(sub, \{ expand: \['latest_invoice'\] \}\)/)
    expect(corpo).toContain('fatturaDelRinnovo(')
  })

  it('coi pagamenti online spenti rifiuta; senza Stripe dice di scriverci', () => {
    expect(corpo).toMatch(/if \(!contatti\.pagamentiOnline\(await vendita\(\)\)\) throw new HttpsError\('failed-precondition', PAGAMENTI_SPENTI\)/)
    expect(corpo).toMatch(/origine === 'stripe'/)
  })

  it('senza fattura aperta apre il portale clienti, che torna al rinnovo della regia', () => {
    expect(corpo).toContain('billingPortal.sessions.create')
    expect(corpo).toContain('return_url: rinnovoUrl(REGIA_URL)')
  })

  it('la licenza riceve rinnovo_url da licenzaProtetta, con l’indirizzo della regia: nessun altro posto lo calcola', () => {
    const licenza = readFileSync('functions/lib/licenza.js', 'utf8')
    expect(licenza).toContain('rinnovo_url: rinnovoUrl(regiaUrl)')
    expect(licenza).toMatch(/CHIAVI_PROTETTA = \[[^\]]*'rinnovo_url'/)
  })
})

// Dati inventati: nessuna persona reale.
const STRIPE = { origine: 'stripe', stripe_customer: 'cus_1', stripe_subscription: 'sub_1' }
const cliente = (abbonamento = {}) => ({ slug: 'bar-prova', piano: 'base', abbonamento: { stato: 'attivo', ...STRIPE, ...abbonamento } })
const istanza = (extra = {}) => ({ stato: 'attiva', progetto: 'drinkpos-bar-prova', ...extra })
const ONLINE = { pagamenti_online: true }
const SPENTI = { pagamenti_online: false }
const DAL = '2026-11-10T09:00:00.000Z'

describe('cosa dice l’area del titolare', () => {
  it('un locale in regola: niente', () => {
    expect(situazioneRinnovo({ cliente: cliente(), istanza: istanza(), vendita: ONLINE })).toBeNull()
    expect(situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'attiva' }), vendita: ONLINE })).toBeNull()
    // Un cliente senza ancora un abbonamento, o senza istanza: niente da rinnovare.
    expect(situazioneRinnovo({ cliente: { slug: 'bar-prova' }, istanza: null, vendita: ONLINE })).toBeNull()
  })

  it('sospeso per il pagamento, pagamenti online accesi, Stripe: si paga, con la data', () => {
    const s = situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento', licenza_dal: DAL }), vendita: ONLINE })
    expect(s).toMatchObject({ tipo: 'sospeso', perPagamento: true, paga: true, dal: DAL })
  })

  it('un locale di prima, sospeso col motivo «pagamento non ricevuto» e senza licenza_per, vale per il pagamento', () => {
    const s = situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza({ licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto' }), vendita: ONLINE })
    expect(s).toMatchObject({ tipo: 'sospeso', perPagamento: true, paga: true })
  })

  it('pagamenti online spenti: sospeso, solo i contatti', () => {
    const s = situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento' }), vendita: SPENTI })
    expect(s).toMatchObject({ tipo: 'sospeso', paga: false })
    // Anche senza sapere ancora la vendita: spenti finché non si legge.
    expect(situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento' }), vendita: null }).paga).toBe(false)
  })

  it('sospeso dall’admin: solo i contatti, anche coi pagamenti accesi e l’abbonamento attivo', () => {
    const s = situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'admin', licenza_motivo: 'verifica' }), vendita: ONLINE })
    expect(s).toMatchObject({ tipo: 'sospeso', perPagamento: false, paga: false })
  })

  it('un abbonamento a mano: solo i contatti, il rinnovo si concorda', () => {
    const s = situazioneRinnovo({
      cliente: { slug: 'bar-prova', piano: 'base', abbonamento: { stato: 'non pagato', origine: 'manuale' } },
      istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento' }),
      vendita: ONLINE,
    })
    expect(s).toMatchObject({ tipo: 'sospeso', perPagamento: true, paga: false })
  })

  it('chiuso: mai il pagamento, i contatti e la cancellazione programmata se c’è', () => {
    const quando = '2027-02-08T09:00:00.000Z'
    const s = situazioneRinnovo({
      cliente: cliente({ stato: 'disdetto' }),
      istanza: istanza({ licenza_stato: 'chiusa', licenza_per: 'pagamento', licenza_dal: DAL, eliminazione: { stato: 'programmata', quando } }),
      vendita: ONLINE,
    })
    expect(s).toMatchObject({ tipo: 'chiuso', paga: false, cancellazione: quando })
    expect(situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'chiusa' }), vendita: ONLINE })).toMatchObject({ tipo: 'chiuso', cancellazione: null })
  })

  it('il locale lavora ma l’abbonamento è in ritardo o non pagato: si avvisa, e si paga se si può', () => {
    expect(situazioneRinnovo({ cliente: cliente({ stato: 'in sospeso' }), istanza: istanza(), vendita: ONLINE })).toMatchObject({ tipo: 'in ritardo', paga: true })
    expect(situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza(), vendita: ONLINE })).toMatchObject({ tipo: 'non pagato', paga: true })
    expect(situazioneRinnovo({ cliente: cliente({ stato: 'in sospeso' }), istanza: istanza(), vendita: SPENTI })).toMatchObject({ tipo: 'in ritardo', paga: false })
  })

  it('la sospensione per il pagamento che aspetta il taglio della giornata: si dice quando arriva', () => {
    const s = situazioneRinnovo({
      cliente: cliente({ stato: 'non pagato' }),
      istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento', licenza_dal: DAL, riduzione_al_taglio: { dal: '2026-11-11T04:00:00.000Z', cosa: ['lo stato sospesa'] } }),
      vendita: ONLINE,
    })
    expect(s.alTaglio).toBe('2026-11-11T04:00:00.000Z')
    const senza = situazioneRinnovo({ cliente: cliente({ stato: 'non pagato' }), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento', riduzione_al_taglio: { dal: 'x', cosa: ['il modulo staff'] } }), vendita: ONLINE })
    expect(senza.alTaglio).toBeNull()
  })

  // REQ-FLOTTA-095: la sospensione per pagamento arriva al suo momento, fuori
  // dall'orario di servizio; istanze/{slug}.sospensione_al dice quando.
  it('la sospensione per il pagamento che aspetta il suo momento fuori servizio: si dice quando arriva', () => {
    const s = situazioneRinnovo({
      cliente: cliente({ stato: 'non pagato' }),
      istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'pagamento', licenza_dal: DAL, sospensione_al: { dal: '2026-11-11T01:00:00.000Z', stato: 'sospesa' } }),
      vendita: ONLINE,
    })
    expect(s).toMatchObject({ tipo: 'sospeso', siFerma: '2026-11-11T01:00:00.000Z', alTaglio: null })
    // Una dell'admin non aspetta niente.
    const admin = situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'sospesa', licenza_per: 'admin', sospensione_al: { dal: '2026-11-11T01:00:00.000Z' } }), vendita: ONLINE })
    expect(admin.siFerma).toBeNull()
  })

  // Revisione del 13/11/2026 (D2): anche la chiusura per pagamento aspetta
  // il suo momento; quella dell'admin no.
  it('la chiusura per pagamento che aspetta il suo momento ha siFerma; quella dell’admin no', () => {
    const sospensione_al = { dal: '2026-11-11T01:00:00.000Z', stato: 'chiusa' }
    const s = situazioneRinnovo({ cliente: cliente({ stato: 'disdetto' }), istanza: istanza({ licenza_stato: 'chiusa', licenza_per: 'pagamento', sospensione_al }), vendita: ONLINE })
    expect(s).toMatchObject({ tipo: 'chiuso', siFerma: '2026-11-11T01:00:00.000Z' })
    expect(situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'chiusa', licenza_per: 'admin', sospensione_al }), vendita: ONLINE }).siFerma).toBeNull()
  })

  it('i contatti sono quelli del prodotto', () => {
    expect(situazioneRinnovo({ cliente: cliente(), istanza: istanza({ licenza_stato: 'sospesa' }), vendita: ONLINE }).email).toBe(EMAIL_CONTATTI)
  })
})

describe('lo stato dell’abbonamento a parole', () => {
  it('in italiano, sia dai nostri stati sia da quelli grezzi di Stripe', () => {
    expect(abbonamentoDetto('attivo')).toBe('attivo')
    expect(abbonamentoDetto('in sospeso')).toBe('in ritardo col pagamento')
    expect(abbonamentoDetto('past_due')).toBe('in ritardo col pagamento')
    expect(abbonamentoDetto('non pagato')).toBe('non pagato')
    expect(abbonamentoDetto('unpaid')).toBe('non pagato')
    expect(abbonamentoDetto('disdetto')).toBe('disdetto')
    expect(abbonamentoDetto('canceled')).toBe('disdetto')
    expect(abbonamentoDetto('trialing')).toBe('attivo')
  })

  it('uno stato sconosciuto non si mostra grezzo', () => {
    for (const v of ['incomplete', 'paused', 'qualcosa', null, undefined]) expect(abbonamentoDetto(v)).toBe('da verificare')
  })
})
