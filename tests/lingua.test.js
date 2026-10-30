// @vitest-environment happy-dom
'use strict'

// LE DUE LINGUE (REQ-FLOTTA-002, DESIGN.md §6): la lingua dall'indirizzo,
// la preferenza ricordata nel browser (anche quando il browser non la
// lascia ricordare), la lingua del browser con ripiego sull'italiano, gli
// importi scritti come si scrivono in ogni lingua, e i due dizionari della
// prima pagina con le stesse chiavi.

import { describe, it, expect } from 'vitest'
import {
  LINGUE,
  PREDEFINITA,
  applicaLingua,
  importo,
  interpola,
  leggiPreferenza,
  linguaDaProporre,
  linguaDelBrowser,
  linguaDelPercorso,
  lingueDelBrowser,
  percorsoDellaLingua,
  plurale,
  salvaPreferenza,
} from '../src/lib/lingua.js'
import { TESTI, testi } from '../src/i18n/index.js'
import { MODULI, PIANI } from '../src/lib/piani.js'

// Un archivio come localStorage, e uno che si rifiuta (finestra privata,
// cookie bloccati).
const archivio = (iniziale = {}) => {
  const dati = { ...iniziale }
  return { getItem: (k) => (k in dati ? dati[k] : null), setItem: (k, v) => (dati[k] = String(v)), dati }
}
const rifiuta = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
}

describe('la lingua della pagina', () => {
  it('l’italiano è la predefinita, e le lingue sono due', () => {
    expect(PREDEFINITA).toBe('it')
    expect(LINGUE).toEqual(['it', 'en'])
  })

  it('viene dall’indirizzo: /en e quello che sta sotto è inglese, il resto italiano', () => {
    expect(linguaDelPercorso('/en')).toBe('en')
    expect(linguaDelPercorso('/en/')).toBe('en')
    expect(linguaDelPercorso('/')).toBe('it')
    expect(linguaDelPercorso('/entra')).toBe('it')
    // Come React Router, senza badare alle maiuscole.
    expect(linguaDelPercorso('/EN')).toBe('en')
    expect(linguaDelPercorso('/En/')).toBe('en')
    expect(linguaDelPercorso('/registrati')).toBe('it')
    expect(linguaDelPercorso()).toBe('it')
    expect(percorsoDellaLingua('en')).toBe('/en')
    expect(percorsoDellaLingua('it')).toBe('/')
  })

  it('la lingua del browser: la prima che sappiamo parlare, se no l’italiano', () => {
    expect(linguaDelBrowser(['en-GB', 'it'])).toBe('en')
    expect(linguaDelBrowser(['de-DE', 'it-IT'])).toBe('it')
    expect(linguaDelBrowser(['de-DE', 'EN-us'])).toBe('en')
    expect(linguaDelBrowser(['de-DE', 'fr'])).toBe('it')
    expect(linguaDelBrowser([])).toBe('it')
    expect(linguaDelBrowser()).toBe('it')
  })

  it('legge le lingue del browser, anche dai browser che ne hanno una sola', () => {
    expect(lingueDelBrowser({ languages: ['en-GB', 'en'] })).toEqual(['en-GB', 'en'])
    expect(lingueDelBrowser({ languages: [], language: 'fr-FR' })).toEqual(['fr-FR'])
    expect(lingueDelBrowser({})).toEqual([])
    expect(lingueDelBrowser(null)).toEqual([])
  })
})

describe('la preferenza ricordata', () => {
  it('si salva e si rilegge; una lingua che non c’è non si salva', () => {
    const a = archivio()
    expect(leggiPreferenza(a)).toBeNull()
    expect(salvaPreferenza('en', a)).toBe(true)
    expect(leggiPreferenza(a)).toBe('en')
    expect(salvaPreferenza('de', a)).toBe(false)
    expect(leggiPreferenza(a)).toBe('en')
  })

  it('un valore sporco nell’archivio non è una preferenza', () => {
    expect(leggiPreferenza(archivio({ 'regia.lingua': 'klingon' }))).toBeNull()
  })

  it('se il browser non lascia ricordare, non c’è preferenza e niente si rompe', () => {
    expect(leggiPreferenza(rifiuta)).toBeNull()
    expect(salvaPreferenza('en', rifiuta)).toBe(false)
    expect(leggiPreferenza(null)).toBeNull()
  })

  // Revisione PR #20: con l'archivio che rifiuta di scrivere restava il
  // vecchio «en», e chi sceglieva IT veniva rimandato su /en per sempre.
  it('se la scrittura fallisce, toglie la scelta vecchia e ricorda la nuova finché la pagina è aperta', () => {
    const dati = { 'regia.lingua': 'en' }
    const pieno = {
      getItem: (k) => dati[k] ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: (k) => delete dati[k],
    }
    expect(leggiPreferenza(pieno)).toBe('en')
    expect(salvaPreferenza('it', pieno)).toBe(false)
    expect(dati['regia.lingua']).toBeUndefined()
    expect(leggiPreferenza(pieno)).toBe('it')
  })

  it('se non si può nemmeno togliere, la scelta in memoria vince su quella salvata', () => {
    const bloccato = { getItem: () => 'en', setItem: rifiuta.setItem, removeItem: rifiuta.setItem }
    expect(salvaPreferenza('it', bloccato)).toBe(false)
    expect(leggiPreferenza(bloccato)).toBe('it')
  })

  it('una scrittura riuscita dopo un fallimento torna a valere', () => {
    let rotto = true
    const dati = {}
    const a = {
      getItem: (k) => dati[k] ?? null,
      setItem: (k, v) => {
        if (rotto) throw new Error('QuotaExceededError')
        dati[k] = v
      },
      removeItem: (k) => delete dati[k],
    }
    salvaPreferenza('it', a)
    rotto = false
    expect(salvaPreferenza('en', a)).toBe(true)
    expect(leggiPreferenza(a)).toBe('en')
  })

  it('di suo usa localStorage', () => {
    localStorage.clear()
    expect(salvaPreferenza('en')).toBe(true)
    expect(localStorage.getItem('regia.lingua')).toBe('en')
    expect(leggiPreferenza()).toBe('en')
    localStorage.clear()
  })
})

describe('la lingua da proporre con l’avviso', () => {
  it('quella del browser, se è diversa da quella della pagina e chi legge non ha scelto', () => {
    expect(linguaDaProporre('it', { preferenza: null, browser: ['en-US'] })).toBe('en')
    expect(linguaDaProporre('en', { preferenza: null, browser: ['it-IT'] })).toBe('it')
  })

  it('nessuna se il browser parla la lingua della pagina, o se chi legge ha già scelto', () => {
    expect(linguaDaProporre('it', { preferenza: null, browser: ['it-IT'] })).toBeNull()
    expect(linguaDaProporre('it', { preferenza: 'it', browser: ['en-US'] })).toBeNull()
    expect(linguaDaProporre('en', { preferenza: 'en', browser: ['it-IT'] })).toBeNull()
  })

  it('un browser in una terza lingua ripiega sull’italiano: a /en propone l’italiano', () => {
    expect(linguaDaProporre('en', { preferenza: null, browser: ['de-DE'] })).toBe('it')
    expect(linguaDaProporre('it', { preferenza: null, browser: ['de-DE'] })).toBeNull()
  })

  it('di suo legge la preferenza e il browser veri', () => {
    localStorage.clear()
    // happy-dom ha il browser in inglese (en-US).
    expect(linguaDaProporre('it')).toBe(navigator.languages[0].startsWith('en') ? 'en' : null)
  })
})

describe('i testi e gli importi', () => {
  it('interpola i segnaposto, e lascia visibili quelli senza valore', () => {
    expect(interpola('Da {prezzo} al mese', { prezzo: '24 €' })).toBe('Da 24 € al mese')
    expect(interpola('Ciao {nome}')).toBe('Ciao {nome}')
    expect(interpola('{n} e {n}', { n: 0 })).toBe('0 e 0')
  })

  it('il plurale', () => {
    const forme = { uno: '{n} terminale', piu: '{n} terminali' }
    expect(plurale(1, forme)).toBe('1 terminale')
    expect(plurale(2, forme)).toBe('2 terminali')
  })

  it('gli importi: «24 €» in italiano, «€24» in inglese, con le migliaia', () => {
    expect(importo(24, 'it')).toBe('24 €')
    expect(importo(24, 'en')).toBe('€24')
    expect(importo(1250, 'it')).toBe('1.250 €')
    expect(importo(1250, 'en')).toBe('€1,250')
    expect(importo(24)).toBe('24 €')
    expect(importo('x', 'en')).toBe('€0')
  })
})

describe('il documento nella lingua della pagina', () => {
  it('mette lang, titolo, descrizione e le alternative hreflang, e poi rimette com’era', () => {
    document.documentElement.setAttribute('lang', 'it')
    document.title = 'Prima'
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', 'descrizione di prima')
    document.head.appendChild(meta)

    const rimetti = applicaLingua(document, { lingua: 'en', titolo: 'Dopo', descrizione: 'after', origine: 'https://esempio.it' })
    expect(document.documentElement.getAttribute('lang')).toBe('en')
    expect(document.title).toBe('Dopo')
    expect(meta.getAttribute('content')).toBe('after')
    const alternative = Object.fromEntries(
      [...document.head.querySelectorAll('link[rel="alternate"]')].map((l) => [l.getAttribute('hreflang'), l.getAttribute('href')])
    )
    expect(alternative).toEqual({ it: 'https://esempio.it/', en: 'https://esempio.it/en', 'x-default': 'https://esempio.it/' })

    rimetti()
    expect(document.documentElement.getAttribute('lang')).toBe('it')
    expect(document.title).toBe('Prima')
    expect(meta.getAttribute('content')).toBe('descrizione di prima')
    expect(document.head.querySelector('link[rel="alternate"]')).toBeNull()
    meta.remove()
  })

  it('senza lang e senza descrizione di partenza, li crea e poi li toglie', () => {
    document.documentElement.removeAttribute('lang')
    const rimetti = applicaLingua(document, { lingua: 'it', titolo: 'T', descrizione: 'D' })
    expect(document.head.querySelector('meta[name="description"]').getAttribute('content')).toBe('D')
    expect(document.head.querySelector('link[hreflang="en"]').getAttribute('href')).toBe('/en')
    rimetti()
    expect(document.documentElement.hasAttribute('lang')).toBe(false)
    expect(document.head.querySelector('meta[name="description"]')).toBeNull()
  })
})

// La forma di un dizionario: le chiavi degli oggetti e la lunghezza delle
// liste, ricorsivamente. Le due lingue devono avere la stessa.
const forma = (v) => {
  if (Array.isArray(v)) return v.map(forma)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, forma(v[k])]))
  return typeof v
}
const frasi = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(frasi) : [])

describe('i testi della prima pagina', () => {
  it('le due lingue hanno le stesse chiavi', () => {
    expect(forma(TESTI.en)).toEqual(forma(TESTI.it))
  })

  it('l’inglese traduce ogni modulo e ogni piano del listino', () => {
    for (const m of MODULI) expect(TESTI.en.moduli[m.id]?.nome, m.id).toBeTruthy()
    for (const id of Object.keys(PIANI)) expect(TESTI.en.prezzi.piani[id]?.descrizione, id).toBeTruthy()
  })

  it('una lingua che non c’è torna all’italiano', () => {
    expect(testi('de')).toBe(TESTI.it)
    expect(testi('en')).toBe(TESTI.en)
  })

  // Il registro (DESIGN.md §2) e i prezzi solo dal listino.
  it('nessun prezzo scritto a mano, nessun punto esclamativo, niente toni da venditore', () => {
    for (const lingua of LINGUE) {
      for (const f of frasi(TESTI[lingua])) {
        expect(f, `${lingua}: ${f}`).not.toMatch(/\d\s?€|€\s?\d/)
        expect(f, `${lingua}: ${f}`).not.toContain('!')
        expect(f, `${lingua}: ${f}`).not.toMatch(
          /sblocca|acquista ora|scopri|il migliore|rivoluzionari|paghi solo quello che usi|non si ferma mai|unlock|buy now|discover|the best|revolutionary|limited time|pay only for what you use|never stops/i
        )
      }
    }
  })
})
