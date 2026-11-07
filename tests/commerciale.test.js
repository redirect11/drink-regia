'use strict'

// IL COMMERCIALE, I NUMERI (REQ-FLOTTA-041, REQ-FLOTTA-042): il canone di un
// cliente, la classe, il riepilogo del periodo, le tabelle e il CSV. L'utente,
// 07/11/2026: «una dashboard che mi mostra il guadagno, le attivazioni, il
// traffico». Qui i numeri; la pagina in Commerciale.test.jsx.

import { describe, it, expect } from 'vitest'
import { canoneMensile, classifica, riepilogo, tabellaAbbonamenti, csv, COLONNE_ABBONAMENTI, COLONNE_MOVIMENTI, giorniDelPeriodo, giornoDi, variazione, periodoDi, CLASSI } from '../src/lib/commerciale.js'
import { PIANI, MODULI, prezzoMensile } from '../src/lib/piani.js'

const ADESSO = new Date('2026-11-07T12:00:00.000Z')
const giorniFa = (n) => new Date(ADESSO.getTime() - n * 86400000).toISOString()
const cliente = (slug, extra = {}) => ({ uid: `u-${slug}`, slug, nome_locale: slug, email: `${slug}@x.it`, creato_il: giorniFa(10), ...extra })
const riga = (c, istanza = { stato: 'attiva' }, stato = 'attiva', cassetto = null) => ({ cliente: c, istanza, richiesta: null, stato, cassetto })

const base = (slug, extra = {}) => cliente(slug, { piano: 'base', moduli: [], terminali: 1, abbonamento: { stato: 'attivo', origine: 'stripe', dal: giorniFa(10) }, ...extra })

describe('il canone mensile di un cliente', () => {
  it('è il prezzo del piano coi moduli e i terminali, al netto dello sconto; annuale vale il mensile', () => {
    expect(canoneMensile(base('a'), ADESSO)).toBe(PIANI.base.prezzo)
    expect(canoneMensile(base('b', { moduli: ['magazzino'], terminali: 4 }), ADESSO)).toBe(prezzoMensile({ piano: 'base', moduli: ['magazzino'], terminali: 4 }))
    expect(canoneMensile(base('c', { sconto: { codice: 'X', percentuale: 50 } }), ADESSO)).toBe(Math.round(PIANI.base.prezzo * 50) / 100)
    expect(canoneMensile(base('d', { abbonamento: { stato: 'attivo', origine: 'stripe', intervallo: 'anno' } }), ADESSO)).toBe(PIANI.base.prezzo)
  })

  it('un Fondatore paga il suo prezzo finché l’offerta vale', () => {
    const f = base('f', { abbonamento: { stato: 'attivo', origine: 'stripe', fondatore: { numero: 1, fino_al: giorniFa(-30) } } })
    expect(canoneMensile(f, ADESSO)).toBe(25)
    const scaduto = base('g', { abbonamento: { stato: 'attivo', origine: 'stripe', fondatore: { numero: 1, fino_al: giorniFa(1) } } })
    expect(canoneMensile(scaduto, ADESSO)).toBe(PIANI.base.prezzo)
  })

  it('vale zero per il Free, le interne, gli sconti al 100%, chi non è attivo, chi non ha un piano', () => {
    expect(canoneMensile(cliente('free', { piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } }), ADESSO)).toBe(0)
    expect(canoneMensile(base('i', { abbonamento: { stato: 'attivo', origine: 'interna' } }), ADESSO)).toBe(0)
    expect(canoneMensile(base('s', { abbonamento: { stato: 'attivo', origine: 'sconto' } }), ADESSO)).toBe(0)
    expect(canoneMensile(base('n', { abbonamento: { stato: 'non pagato', origine: 'manuale' } }), ADESSO)).toBe(0)
    expect(canoneMensile(cliente('x'), ADESSO)).toBe(0)
    expect(canoneMensile(null, ADESSO)).toBe(0)
    // In sospeso (Stripe ritenta) conta ancora.
    expect(canoneMensile(base('p', { abbonamento: { stato: 'in sospeso', origine: 'stripe' } }), ADESSO)).toBe(PIANI.base.prezzo)
  })
})

describe('la classe di un cliente', () => {
  it('pagante, free, gratis, in attesa, fermo, disdetto, eliminato', () => {
    expect(classifica(riga(base('a')))).toBe(CLASSI.PAGANTE)
    expect(classifica(riga(cliente('f', { piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } })))).toBe(CLASSI.FREE)
    expect(classifica(riga(base('i', { abbonamento: { stato: 'attivo', origine: 'interna' } })))).toBe(CLASSI.GRATIS)
    expect(classifica(riga(cliente('n'), null, 'da attivare'))).toBe(CLASSI.IN_ATTESA)
    expect(classifica(riga(base('m', { abbonamento: { stato: 'non pagato', origine: 'manuale' } }), { stato: 'attiva', licenza_stato: 'sospesa' }))).toBe(CLASSI.FERMO)
    expect(classifica(riga(base('s'), { stato: 'attiva', licenza_stato: 'sospesa' }))).toBe(CLASSI.FERMO)
    expect(classifica(riga(base('d', { abbonamento: { stato: 'disdetto', origine: 'stripe' } }), { stato: 'attiva', licenza_stato: 'chiusa' }))).toBe(CLASSI.DISDETTO)
    expect(classifica(riga(base('e'), { stato: 'eliminata' }, 'eliminata'))).toBe(CLASSI.ELIMINATO)
  })
})

describe('il riepilogo del periodo', () => {
  const righe = [
    riga(base('pagante-uno', { creato_il: giorniFa(3) }), { stato: 'attiva' }, 'attiva', { credito_microeuro: 7_000_000, mese: giornoDi(ADESSO).slice(0, 7), speso_mese_microeuro: 1_500_000 }),
    riga(base('pagante-due', { piano: 'completo', terminali: 5, creato_il: giorniFa(40), abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: giornoDi(giorniFa(-5)) }, prove: { staff: { scade_il: giorniFa(-3) } } })),
    riga(cliente('free-uno', { piano: 'free', creato_il: giorniFa(20), abbonamento: { stato: 'attivo', origine: 'gratuito' } })),
    riga(base('fermo-uno', { abbonamento: { stato: 'non pagato', origine: 'manuale', ultimo_fallimento: giorniFa(2) } }), { stato: 'attiva', licenza_stato: 'sospesa' }),
    riga(cliente('senza-piano', { creato_il: giorniFa(1) }), null, 'da approvare'),
    riga(base('eliminato', { creato_il: giorniFa(60) }), { stato: 'eliminata' }, 'eliminata'),
  ]
  const movimenti = [
    { id: 'm1', il: giorniFa(2), tipo: 'abbonamento', uid: 'u-pagante-uno', slug: 'pagante-uno', importo: 114.7, iva: 25.23, totale: 139.93 },
    { id: 'm2', il: giorniFa(5), tipo: 'ricarica_ai', uid: 'u-pagante-uno', slug: 'pagante-uno', importo: 25, iva: 5.5, totale: 30.5 },
    { id: 'm3', il: giorniFa(45), tipo: 'manuale', uid: 'u-pagante-due', slug: 'pagante-due', importo: 69, iva: 15.18, totale: 84.18 },
    { id: 'm4', il: giorniFa(200), tipo: 'manuale', uid: 'u-pagante-due', slug: 'pagante-due', importo: 10, iva: 2.2, totale: 12.2 },
  ]
  const traffico = [
    { giorno: giornoDi(giorniFa(1)), viste: 40, pagine: { home: 30, registrati: 10 }, provenienze: { diretto: 25, google_com: 15 }, lingue: { it: 35, en: 5 }, eventi: { registrazione: 2, checkout: 1 } },
    { giorno: giornoDi(giorniFa(10)), viste: 20, pagine: { home: 20 }, provenienze: { instagram_com: 20 }, lingue: { it: 20 }, eventi: { attivazione: 1 } },
    { giorno: giornoDi(giorniFa(40)), viste: 100, pagine: { home: 100 }, provenienze: { diretto: 100 }, lingue: { it: 100 }, eventi: {} },
  ]
  const contatti = [{ stato: 'aperta' }, { stato: 'gestita' }]
  const r = riepilogo({ righe, movimenti, traffico, contatti, fondatori: { assegnati: { a: {}, b: {} } } }, { giorni: 30, adesso: ADESSO })

  it('conta i clienti per classe, i nuovi del periodo e di quello prima, le app attive', () => {
    expect(r.clienti).toMatchObject({ totale: 6, nuovi: 4, nuoviPrima: 1, paganti: 2, free: 1, gratis: 0, inAttesa: 1, fermi: 1, disdetti: 0, eliminati: 1, istanzeAttive: 3 })
  })

  it('il canone mensile somma i paganti; l’incasso somma l’imponibile dei movimenti nel periodo, per tipo, col confronto', () => {
    const mrr = PIANI.base.prezzo + prezzoMensile({ piano: 'completo', terminali: 5 })
    expect(r.ricavi.mrr).toBe(Math.round(mrr * 100) / 100)
    expect(r.ricavi.arr).toBe(Math.round(mrr * 12 * 100) / 100)
    expect(r.ricavi.arpu).toBe(Math.round((mrr / 2) * 100) / 100)
    expect(r.ricavi.incasso).toBe(139.7)
    expect(r.ricavi.incassoPrecedente).toBe(69)
    expect(r.ricavi.variazione).toBe(102)
    expect(r.ricavi.perTipo).toEqual({ abbonamento: 114.7, ricarica_ai: 25, manuale: 0 })
    expect(r.ricavi.iva).toBe(30.73)
    expect(r.ricavi.lordo).toBe(170.43)
    expect(r.ricavi.movimentiNelPeriodo).toBe(2)
  })

  it('il credito AI: venduto nel periodo, residuo nei cassetti, speso questo mese', () => {
    expect(r.ai).toEqual({ venduto: 25, creditoResiduo: 7, spesoMese: 1.5, cassetti: 1 })
  })

  it('cosa si vende: per piano, per modulo (comprati, inclusi, in prova), terminali in più, Fondatori', () => {
    expect(r.perPiano.find((p) => p.id === 'base')).toMatchObject({ quanti: 1, mrr: PIANI.base.prezzo })
    expect(r.perPiano.find((p) => p.id === 'completo').quanti).toBe(1)
    expect(r.perPiano.find((p) => p.id === 'free').quanti).toBe(1)
    const staff = r.perModulo.find((m) => m.id === 'staff')
    expect(staff).toMatchObject({ comprati: 0, inclusi: 1, inProva: 1 })
    expect(r.perModulo).toHaveLength(MODULI.length)
    expect(r.terminaliInPiu).toBe(2)
    expect(r.fondatori).toEqual({ posti: 20, assegnati: 2, liberi: 18 })
  })

  it('la conversione dall’inizio: paganti su registrati, senza gli eliminati', () => {
    expect(r.conversione).toEqual({ registrati: 5, conPiano: 4, paganti: 2, tasso: 40, free: 1 })
  })

  it('le serie per giorno: 30 giorni, gli incassi e le registrazioni sul loro giorno, le viste dal traffico', () => {
    expect(r.serie.giorni).toHaveLength(30)
    expect(r.serie.giorni[29]).toBe(giornoDi(ADESSO))
    expect(r.serie.incassi[27]).toBe(114.7)
    expect(r.serie.incassi[24]).toBe(25)
    expect(r.serie.incassi.reduce((s, v) => s + v, 0)).toBe(139.7)
    expect(r.serie.registrazioni.reduce((s, v) => s + v, 0)).toBe(4)
    expect(r.serie.viste[28]).toBe(40)
    expect(r.serie.viste[19]).toBe(20)
  })

  it('il traffico del periodo: viste, pagine, provenienze, lingue, l’imbuto', () => {
    expect(r.traffico.viste).toBe(60)
    expect(r.traffico.vistePrima).toBe(100)
    expect(r.traffico.perPagina).toEqual([
      { nome: 'home', viste: 50 },
      { nome: 'registrati', viste: 10 },
    ])
    expect(r.traffico.provenienze[0]).toEqual({ nome: 'diretto', viste: 25 })
    expect(r.traffico.lingue).toEqual({ it: 55, en: 5 })
    expect(r.traffico.imbuto).toEqual([
      { passo: 'Viste', quanti: 60 },
      { passo: 'Registrazioni', quanti: 2 },
      { passo: 'Scelta del piano', quanti: 1 },
      { passo: 'Attivazioni chieste', quanti: 1 },
    ])
    expect(r.traffico.giorniConDati).toBe(2)
  })

  it('le scadenze dei prossimi 14 giorni e cosa chiede attenzione', () => {
    expect(r.scadenze.map((s) => [s.tipo, s.slug, s.scaduta])).toEqual([
      ['prova', 'pagante-due', false],
      ['pagamento', 'pagante-due', false],
    ])
    expect(r.scadenze[0].dettaglio).toBe('Personale e ore')
    expect(r.attenzione).toEqual({ pagamentiFalliti: [{ slug: 'fermo-uno', nome: 'fermo-uno', il: giorniFa(2) }], contattiAperti: 1, daApprovare: 1, attivazioniFallite: 0, fermi: 1 })
  })

  it('gli ultimi movimenti, i più recenti prima; e senza niente non si rompe', () => {
    expect(r.ultimiMovimenti.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    const vuoto = riepilogo({}, { giorni: 7, adesso: ADESSO })
    expect(vuoto.clienti.totale).toBe(0)
    expect(vuoto.ricavi).toMatchObject({ mrr: 0, incasso: 0, variazione: 0 })
    expect(vuoto.serie.giorni).toHaveLength(7)
    expect(vuoto.traffico.imbuto[0].quanti).toBe(0)
  })
})

describe('gli abbonamenti in tabella e il CSV', () => {
  const righe = [riga(base('bar-uno', { moduli: ['magazzino'], sconto: { codice: 'PROVA-10', percentuale: 10 }, abbonamento: { stato: 'attivo', origine: 'stripe', dal: giorniFa(5), rinnovo_il: giorniFa(-25), fondatore: { numero: 3 } } })), riga(cliente('bar-due'), null, 'da attivare')]
  const movimenti = [{ id: 'm', il: giorniFa(1), tipo: 'abbonamento', uid: 'u-bar-uno', importo: 50, iva: 11, totale: 61, slug: 'bar-uno', origine: 'stripe', riferimento: 'in_1', descrizione: 'Piano; "Base"' }]

  it('una riga per cliente, chi paga di più per primo', () => {
    const t = tabellaAbbonamenti(righe, movimenti, ADESSO)
    expect(t.map((x) => x.slug)).toEqual(['bar-uno', 'bar-due'])
    expect(t[0]).toMatchObject({ classe: 'pagante', piano: 'Base', moduli: ['Magazzino e fornitori'], canone: Math.round(prezzoMensile({ piano: 'base', moduli: ['magazzino'] }) * 90) / 100, sconto: 'PROVA-10', fondatore: true, pagato: 50, fino: giorniFa(-25) })
    expect(t[1]).toMatchObject({ classe: 'in_attesa', piano: null, canone: 0, pagato: 0 })
  })

  it('il CSV ha punto e virgola, virgola decimale, le virgolette raddoppiate', () => {
    const testo = csv(tabellaAbbonamenti(righe, movimenti, ADESSO), COLONNE_ABBONAMENTI)
    const righeCsv = testo.split('\r\n')
    expect(righeCsv[0]).toBe('Locale;Identificativo;Email;Classe;Piano;Moduli;Terminali;Canone mensile;Origine;Stato;Dal;Fino;Sconto;Fondatore;Pagato in tutto;Registrato il')
    expect(righeCsv[1]).toMatch(/^bar-uno;bar-uno;bar-uno@x\.it;Paganti;Base;"Magazzino e fornitori";1;42,93;stripe;attivo;\d{4}-\d{2}-\d{2};\d{4}-\d{2}-\d{2};PROVA-10;sì;50;\d{4}-\d{2}-\d{2}$/)
    const m = csv(movimenti, COLONNE_MOVIMENTI).split('\r\n')
    expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2};abbonamento;bar-uno;50;11;61;stripe;in_1;"Piano; ""Base"""$/)
  })
})

describe('i pezzi piccoli', () => {
  it('i giorni del periodo finiscono oggi, a Roma', () => {
    const g = giorniDelPeriodo(3, new Date('2026-11-06T23:30:00.000Z'))
    expect(g).toEqual(['2026-11-05', '2026-11-06', '2026-11-07'])
    expect(giornoDi('non una data')).toBeNull()
  })

  it('la variazione in percentuale; da zero non si dice', () => {
    expect(variazione(150, 100)).toBe(50)
    expect(variazione(50, 100)).toBe(-50)
    expect(variazione(10, 0)).toBeNull()
    expect(variazione(0, 0)).toBe(0)
  })

  it('il periodo dall’indirizzo: uno sconosciuto vale 30 giorni', () => {
    expect(periodoDi('7').giorni).toBe(7)
    expect(periodoDi('x').giorni).toBe(30)
    expect(periodoDi(null).giorni).toBe(30)
  })
})
