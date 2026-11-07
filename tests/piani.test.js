import listino from '../functions/piani.json'
'use strict'

// I PIANI E I PREZZI (REQ-FLOTTA-002, REQ-FLOTTA-031): in un posto solo, e
// il conto del mese torna. Le regole si provano sul listino; le cifre di
// DEC-0005 (02/11/2026) si provano anche come cifre, perché un listino
// cambiato per sbaglio deve far fallire un test.

import { describe, it, expect } from 'vitest'
import {
  PIANI,
  MODULI,
  prezzoMensile,
  moduliDellaScelta,
  TERMINALE_IN_PIU,
  ATTIVAZIONE,
  IVA,
  FONDATORI,
  ANNUALE,
  PROVA_GIORNI,
  euro,
  conIva,
  prezzoAnnuale,
  prezzoFondatori,
  richiedeDi,
  baseMancante,
  senzaOrfani,
} from '../src/lib/piani.js'

// LA BASE DI UN MODULO nel sito (tana-drink REQ-LIC-015, 07/11/2026): la
// stessa regola di functions/lib/prove.js, perché la scelta del piano non
// proponga quello che il server rifiuta.
describe('la base di un modulo, nel sito', () => {
  it('gli ordini dal telefono richiedono il menù digitale; gli altri niente', () => {
    expect(richiedeDi('ordini_cliente')).toEqual(['menu_tavoli'])
    expect(richiedeDi('magazzino')).toEqual([])
    expect(richiedeDi('boh')).toEqual([])
  })

  it('la base manca se non è nel piano, né scelta, né in prova', () => {
    expect(baseMancante({ piano: 'base', moduli: [] }, 'ordini_cliente')).toBe('Menù digitale e tavoli')
    expect(baseMancante({ piano: 'base', moduli: ['menu_tavoli'] }, 'ordini_cliente')).toBeNull()
    expect(baseMancante({ piano: 'base', moduli: [], prove: ['menu_tavoli'] }, 'ordini_cliente')).toBeNull()
    expect(baseMancante({ piano: 'completo', moduli: [] }, 'ordini_cliente')).toBeNull()
    expect(baseMancante({ piano: 'base', moduli: [] }, 'magazzino')).toBeNull()
  })

  it('togliendo la base dalla scelta se ne va anche chi la richiede', () => {
    expect(senzaOrfani('base', ['clienti', 'ordini_cliente'])).toEqual(['clienti'])
    expect(senzaOrfani('base', ['menu_tavoli', 'ordini_cliente'])).toEqual(['menu_tavoli', 'ordini_cliente'])
    expect(senzaOrfani('completo', ['ordini_cliente'])).toEqual(['ordini_cliente'])
  })
})

describe('il listino di DEC-0005', () => {
  it('Base 32,70 € con tre terminali, Completo 69 € con tre, attivazione 82 €, IVA 22', () => {
    expect([PIANI.base.prezzo, PIANI.base.terminali]).toEqual([32.7, 3])
    expect([PIANI.completo.prezzo, PIANI.completo.terminali]).toEqual([69, 3])
    expect([ATTIVAZIONE, IVA, TERMINALE_IN_PIU]).toEqual([82, 22, 12])
  })

  it('Fondatori: 20 posti, 12 mesi, Base a 25 €, attivazione gratuita; annuale a 10 mensilità; prova di 30 giorni', () => {
    expect(FONDATORI).toMatchObject({ posti: 20, mesi: 12, prezzi: { base: 25 }, attivazione: 0 })
    expect(ANNUALE.mensilita).toBe(10)
    expect(listino.prova_giorni).toBe(30)
  })

  // La prova si mostra solo se il Checkout la applica: finché
  // prova_nel_checkout è spenta, a schermo non c'è (PROVA_GIORNI = 0).
  it('la prova a schermo segue prova_nel_checkout', () => {
    expect(PROVA_GIORNI).toBe(listino.prova_nel_checkout === true ? listino.prova_giorni : 0)
  })
})

describe('prezzoMensile', () => {
  it('il base è il base; i moduli e i terminali oltre i tre si sommano, al centesimo', () => {
    expect(prezzoMensile()).toBe(32.7)
    expect(prezzoMensile({ piano: 'base', moduli: ['magazzino'] })).toBe(47.7)
    // Fino a tre terminali sono inclusi: il quarto si paga.
    expect(prezzoMensile({ piano: 'base', terminali: 3 })).toBe(32.7)
    // 32,7 + 12 in virgola mobile fa 44,699999…: il conto torna al centesimo.
    expect(prezzoMensile({ piano: 'base', terminali: 4 })).toBe(44.7)
    expect(prezzoMensile({ piano: 'base', moduli: ['menu_tavoli', 'clienti'], terminali: 5 })).toBe(74.7)
  })

  it('il completo include tutti i moduli e tre terminali: chiederli di nuovo non costa', () => {
    expect(prezzoMensile({ piano: 'completo', moduli: MODULI.map((m) => m.id), terminali: 3 })).toBe(PIANI.completo.prezzo)
    expect(prezzoMensile({ piano: 'completo', terminali: 4 })).toBe(PIANI.completo.prezzo + TERMINALE_IN_PIU)
  })

  it('un piano sconosciuto o un modulo inventato non valgono niente', () => {
    expect(prezzoMensile({ piano: 'oro', moduli: ['teletrasporto'] })).toBe(PIANI.base.prezzo)
  })
})

describe('moduliDellaScelta', () => {
  it('è quello che la licenza dell’istanza accende', () => {
    expect(moduliDellaScelta({ piano: 'base', moduli: ['staff', 'staff', 'niente'] })).toEqual(['staff'])
    expect(moduliDellaScelta({ piano: 'completo' })).toEqual(MODULI.map((m) => m.id))
  })
})

describe('conIva', () => {
  it('aggiunge il 22% e arrotonda al centesimo', () => {
    expect(conIva(32.7)).toBe(39.89)
    expect(conIva(82)).toBe(100.04)
    expect(conIva(25)).toBe(30.5)
    expect(conIva(69)).toBe(84.18)
    expect(conIva(0)).toBe(0)
  })
})

describe('prezzoAnnuale', () => {
  it('dieci mensilità, al centesimo', () => {
    expect(prezzoAnnuale(32.7)).toBe(327)
    expect(prezzoAnnuale(69)).toBe(690)
    expect(prezzoAnnuale(prezzoMensile({ piano: 'base', terminali: 4 }))).toBe(447)
  })

  it('per un Fondatore annuale: dieci volte il prezzo Fondatori', () => {
    expect(prezzoAnnuale(prezzoFondatori('base'))).toBe(250)
  })
})

describe('prezzoFondatori', () => {
  it('il prezzo dell’offerta per i piani coperti, null per gli altri', () => {
    expect(prezzoFondatori('base')).toBe(25)
    expect(prezzoFondatori('completo')).toBeNull()
    expect(prezzoFondatori('free')).toBeNull()
    expect(prezzoFondatori('oro')).toBeNull()
  })
})

describe('euro', () => {
  it('scrive gli importi all’italiana', () => {
    expect(euro(24)).toBe('24 €')
    expect(euro(82)).toBe('82 €')
    expect(euro(1250)).toBe('1.250 €')
    expect(euro(1250000)).toBe('1.250.000 €')
  })

  it('i centesimi solo se ci sono, sempre a due cifre', () => {
    expect(euro(32.7)).toBe('32,70 €')
    expect(euro(39.89)).toBe('39,89 €')
    expect(euro(0.05)).toBe('0,05 €')
    expect(euro(1250.5)).toBe('1.250,50 €')
  })

  it('le somme in virgola mobile arrivano al centesimo giusto', () => {
    expect(euro(32.7 + 12)).toBe('44,70 €')
    expect(euro(0.1 + 0.2)).toBe('0,30 €')
    expect(euro(32.7 * 10)).toBe('327 €')
    expect(euro(-7.7)).toBe('-7,70 €')
  })
})
