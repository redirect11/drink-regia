// @vitest-environment happy-dom
'use strict'

// LA PRIMA PAGINA (REQ-FLOTTA-002, DESIGN.md): la promessa nel titolo, il
// cinque gesti coi filmati, le funzioni coi loro moduli, i passi, i prezzi
// dal listino, le domande, l'ultima azione. Tono del mestiere, niente urla.
//
// 30/10/2026, la home nuova (l'utente: «più moderna… con slogan
// migliori»): il titolo non è più il nome del prodotto ma la promessa
// (DESIGN.md §1 e §5.1), il bottone dice «Attiva il tuo locale» invece di
// «Registra il tuo locale» e la tabella dei moduli ha la colonna del
// Completo.
// I vincoli di prima restano: prezzi solo dal listino, il Free solo se in
// vendita, la nota sullo scontrino non fiscale, chi è dentro va alla
// dashboard.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import '@testing-library/jest-dom/vitest'

// La prima pagina legge la vendita da db.js (REQ-FLOTTA-015). Qui si usa la
// vendita predefinita, come senza Firebase, e db.js non si carica: caricato
// davvero, la coverage di src/lib conta come non provate tutte le sue
// funzioni, che parlano con Firebase e si provano dai componenti.
vi.mock('../src/lib/db.js', () => ({ osservaVendita: (cb) => (cb(null), () => {}) }))

import Home from '../src/pages/Home.jsx'
import {
  PIANI,
  MODULI,
  ATTIVAZIONE,
  TERMINALE_IN_PIU,
  FONDATORI,
  ANNUALE,
  PROVA_GIORNI,
  ASSISTENZA,
  conIva,
  prezzoAnnuale,
  euro,
} from '../src/lib/piani.js'
import { NOME_PRODOTTO, URL_DEMO } from '../src/lib/prodotto.js'
import it_ from '../src/i18n/home.it.js'
import en from '../src/i18n/home.en.js'

const mostra = (utente = null) =>
  render(
    <MemoryRouter>
      <Home utente={utente} />
    </MemoryRouter>
  )

// Il browser di happy-dom parla inglese: qui parla italiano, perché l'avviso
// della lingua (provato in tests/HomeLingua.test.jsx) non entri nei conti.
beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(navigator, 'languages', { value: ['it-IT', 'it'], configurable: true })
})
afterEach(() => {
  delete navigator.languages
})

const aPagamento = Object.values(PIANI).filter((p) => !p.gratuito)

describe('la prima pagina', () => {
  it('apre con la promessa, un solo titolo di primo livello e i titoli in ordine', () => {
    mostra()
    const h1 = screen.getAllByRole('heading', { level: 1 })
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent(it_.hero.titolo)
    // Il pubblico è la ristorazione in generale, non solo i bar (l'utente, 30/10/2026).
    expect(screen.getByText(it_.hero.occhiello)).toHaveTextContent(/bar e ristoranti/)
    // Nessun salto di livello: dopo un h2 viene al più un h3.
    const livelli = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName[1]))
    livelli.reduce((prima, ora) => {
      expect(ora, `h${ora} dopo h${prima}`).toBeLessThanOrEqual(prima + 1)
      return ora
    })
  })

  it('ha le sezioni nell’ordine del percorso: funzioni, passi, prezzi, domande, chiusura', () => {
    mostra()
    const ordine = ['funzioni', 'come-funziona', 'prezzi', 'domande', 'contatti']
    const trovate = [...document.querySelectorAll('main section[id]')].map((s) => s.id)
    expect(trovate).toEqual(ordine)
    // «Quello che si vede dal banco» e i tre pilastri non ci sono più
    // (Daniele, 11/11/2026: «toglila»): né le sezioni né i testi.
    expect(document.getElementById('problema')).toBeNull()
    expect(document.getElementById('pilastri')).toBeNull()
    expect(it_.problema).toBeUndefined()
    expect(it_.pilastri).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Dalla registrazione alla prima comanda' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Domande frequenti' })).toBeInTheDocument()
    // Le domande si aprono una per una.
    expect(screen.getByText('Lo scontrino è fiscale?').closest('details')).not.toBeNull()
  })

  // Il listino del 02/11/2026 (DEC-0005): ogni prezzo è l'imponibile «+ IVA»
  // col totale IVA inclusa accanto, coi centesimi (32,70 €); i numeri sono
  // calcolati dal listino (conIva, prezzoAnnuale), mai scritti nel test.
  it('i prezzi vengono dal listino: piani, «da … al mese», attivazione, moduli, terminale in più', () => {
    mostra()
    for (const p of aPagamento) {
      const scheda = screen.getByRole('article', { name: `Piano ${p.nome}` })
      expect(scheda).toHaveTextContent(`${euro(p.prezzo)} + IVA al mese`)
      expect(scheda).toHaveTextContent(`${euro(conIva(p.prezzo))} IVA inclusa`)
      expect(within(scheda).getByRole('link', { name: `Inizia con ${p.nome}` })).toHaveAttribute('href', '/registrati')
    }
    expect(screen.getByRole('article', { name: 'Piano Completo' })).toHaveTextContent('Tutto incluso')
    // Il Free si mostra solo se l'admin lo mette in vendita (REQ-FLOTTA-015):
    // senza, la pagina non lo nomina (tests/HomeVendita.test.jsx).
    expect(screen.queryByRole('article', { name: 'Piano Free' })).toBeNull()
    const minimo = Math.min(...aPagamento.map((p) => p.prezzo))
    expect(within(screen.getByRole('list', { name: 'In breve' })).getByText(`Da ${euro(minimo)} + IVA al mese`)).toBeInTheDocument()
    expect(
      screen.getByText(`Attivazione una tantum: ${euro(ATTIVAZIONE)} + IVA (${euro(conIva(ATTIVAZIONE))} IVA inclusa)`, { exact: false })
    ).toHaveTextContent('IVA al 22%')

    const tabella = within(screen.getByRole('table'))
    for (const m of MODULI) {
      const riga = tabella.getByRole('row', { name: new RegExp(m.nome) })
      // Un modulo compreso nel Base (il menù digitale, dal 07/11/2026) non ha
      // prezzo nemmeno nella colonna del Base: è incluso in tutte e due.
      if (PIANI.base.include.includes(m.id)) {
        expect(riga).not.toHaveTextContent('+ IVA')
        expect(within(riga).getAllByText('Incluso')).toHaveLength(2)
        continue
      }
      expect(riga).toHaveTextContent(`${euro(m.prezzo)} + IVA`)
      expect(riga).toHaveTextContent(`${euro(conIva(m.prezzo))} IVA inclusa`)
      if (PIANI.completo.include.includes(m.id)) expect(riga).toHaveTextContent('Incluso')
    }
    expect(tabella.getByRole('row', { name: /Terminale in più/ })).toHaveTextContent(`${euro(TERMINALE_IN_PIU)} + IVA`)
  })

  it('il Base coi centesimi e il suo totale IVA inclusa, calcolato', () => {
    mostra()
    // 32,70 € + IVA → 39,89 € IVA inclusa: il caso che ha portato i centesimi.
    const base = screen.getByRole('article', { name: `Piano ${PIANI.base.nome}` })
    expect(base).toHaveTextContent(`${euro(PIANI.base.prezzo)} + IVA al mese`)
    expect(euro(PIANI.base.prezzo)).toMatch(/,\d\d €$/)
    expect(within(base).getByText(`${euro(conIva(PIANI.base.prezzo))} IVA inclusa`)).toHaveClass('prezzo-lordo')
  })

  it('accanto al mensile, l’annuale a 10 mensilità, + IVA e IVA inclusa', () => {
    mostra()
    for (const p of aPagamento) {
      const anno = prezzoAnnuale(p.prezzo)
      expect(screen.getByRole('article', { name: `Piano ${p.nome}` })).toHaveTextContent(
        `Pagando un anno in anticipo: ${euro(anno)} + IVA (${euro(conIva(anno))} IVA inclusa), pari a ${ANNUALE.mensilita} mensilità.`
      )
    }
  })

  it('l’offerta Fondatori: i numeri dal listino, nessun contatore dei posti', () => {
    mostra()
    const blocco = screen.getByRole('region', { name: 'Offerta Fondatori' })
    const f = FONDATORI.prezzi.base
    expect(blocco).toHaveTextContent(
      `I primi ${FONDATORI.posti} locali: ${PIANI.base.nome} a ${euro(f)} + IVA al mese (${euro(conIva(f))} IVA inclusa) per ${FONDATORI.mesi} mesi dall’attivazione, poi ${euro(PIANI.base.prezzo)} + IVA come da listino; attivazione gratuita.`
    )
    expect(blocco).toHaveTextContent('in ordine di attivazione')
    // Niente urgenza: né posti rimasti né scadenze, e nessun prezzo barrato.
    expect(blocco.textContent).not.toMatch(/rimast|ancora \d|solo \d|affrettati|scade/i)
    expect(document.querySelector('#prezzi s, #prezzi del')).toBeNull()
  })

  it('la prova, il tetto dell’assistenza e le stampanti a preventivo', () => {
    mostra()
    // La prova si dice solo se il Checkout la applica (PROVA_GIORNI > 0).
    if (PROVA_GIORNI > 0) {
      expect(within(screen.getByRole('list', { name: 'In breve' })).getByText(`${PROVA_GIORNI} giorni di prova`)).toBeInTheDocument()
      expect(screen.getByText(`I primi ${PROVA_GIORNI} giorni sono di prova: il canone parte alla fine della prova.`)).toBeInTheDocument()
    } else {
      expect(screen.queryByText(/giorni di prova/)).toBeNull()
    }
    expect(screen.getByText(`L’assistenza da remoto è inclusa fino a ${ASSISTENZA.ore_mese} ora al mese; oltre, a preventivo.`)).toBeInTheDocument()
    expect(screen.getByText(/un preventivo scritto, da accettare prima di cominciare il lavoro/)).toBeInTheDocument()
  })

  it('quanto conviene il Completo lo calcola dal listino', () => {
    mostra()
    const inclusi = MODULI.filter((m) => PIANI.completo.include.includes(m.id))
    const totale = PIANI.base.prezzo + inclusi.reduce((s, m) => s + m.prezzo, 0)
    // Col Base a 32,70 € il confronto resta vero (108,70 € contro 69 €), e
    // anche col prezzo Fondatori; i terminali non si nominano più, perché
    // dal 02/11/2026 i due piani ne hanno 3 tutti e due.
    expect(totale).toBeGreaterThan(PIANI.completo.prezzo)
    expect(totale - PIANI.base.prezzo + FONDATORI.prezzi.base).toBeGreaterThan(PIANI.completo.prezzo)
    const frase = screen.getByText(`tutti i moduli costa ${euro(totale)} + IVA al mese`, { exact: false })
    expect(frase).toHaveTextContent(`li include tutti a ${euro(PIANI.completo.prezzo)} + IVA.`)
    expect(frase).not.toHaveTextContent(/terminal/)
  })

  it('le funzioni dicono il modulo che le porta, e quella di base il piano', () => {
    mostra()
    // Dentro la sezione delle funzioni: le stesse etichette stanno anche nei
    // cinque gesti, più su (REQ-FLOTTA-060).
    const funzioni = within(document.getElementById('funzioni'))
    const magazzino = MODULI.find((m) => m.id === 'magazzino')
    expect(funzioni.getByText(`Modulo ${magazzino.nome}`)).toBeInTheDocument()
    // La cassa sta nel Base; il menù digitale pure (dal 07/11/2026), e la
    // sua funzione lo dice accanto al modulo degli ordini dal telefono.
    expect(funzioni.getAllByText(`Nel piano ${PIANI.base.nome}`)).toHaveLength(2)
    const ordini = MODULI.find((m) => m.id === 'ordini_cliente')
    expect(funzioni.getByText(`Modulo ${ordini.nome}`)).toBeInTheDocument()
    // I terminali oltre quelli del piano si pagano, e il prezzo viene dal
    // listino (revisione PR #20: «Più terminali sulla stessa cassa» sotto
    // «Nel piano Base» lasciava credere che fossero inclusi).
    expect(screen.getByText(`Altri terminali a ${euro(TERMINALE_IN_PIU)} + IVA al mese`)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: it_.funzioni.voci.magazzino.titolo })).toBeInTheDocument()
  })

  it('le azioni: attivare il locale, la demo in una scheda nuova, scriverci', () => {
    mostra()
    const attiva = screen.getAllByRole('link', { name: 'Attiva il tuo locale' })
    expect(attiva.length).toBeGreaterThanOrEqual(2) // in cima e in fondo
    for (const l of attiva) expect(l).toHaveAttribute('href', '/registrati')
    const demo = screen.getByRole('link', { name: /Prova la demo/ })
    expect(demo).toHaveAttribute('href', URL_DEMO)
    expect(demo).toHaveAttribute('target', '_blank')
    expect(demo).toHaveTextContent('si apre in una nuova scheda')
    expect(screen.getByRole('link', { name: 'Scrivici' })).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
  })

  it('dice che lo scontrino non è fiscale, e non parla da venditore', () => {
    mostra()
    expect(screen.getByText(/non uno scontrino fiscale/)).toBeInTheDocument()
    const testo = document.body.textContent
    expect(testo).not.toMatch(/sblocca|acquista ora|scopri|il migliore|rivoluzionari|il più scelto|solo per oggi/i)
    expect(testo).not.toContain('!')
  })

  // 11/11/2026 (l'utente: «nella parte sopra c'è il video in background e
  // uno slogan davanti… con i video nei box»), al posto della prima
  // schermata senza immagini del 07/11. I filmati sono decorazione: chi
  // chiede meno movimento vede il fermo immagine, e un lettore di schermo
  // non incontra né l'uno né l'altro.
  // REQ-FLOTTA-061 (11/11/2026, Daniele: «fai un carosello sopra a tutto
  // dove sta il primo video… le facciamo scorrere in automatico in
  // orizzontale»), al posto delle cinque fasce in verticale di
  // REQ-FLOTTA-060. La prima schermata ha cinque diapositive, una per
  // gesto; titolo, bottoni e scheda dei fatti restano fermi davanti.
  describe('il carosello dei cinque gesti', () => {
    const conMovimento = (ridotto) => {
      vi.stubGlobal('matchMedia', (q) => ({ matches: ridotto && /reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} }))
    }
    afterEach(() => {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    })
    const PAROLE = ['Ordina.', 'Prepara.', 'Incassa.', 'Conta.', 'Riordina.']
    const FILMATI = ['sala', 'banco', 'conto', 'numeri', 'scorta']
    const gruppo = () => screen.getByRole('group', { name: it_.gesti.titolo })
    const parola = () => gruppo().querySelector('.gesto-parola').textContent
    const visibile = () => document.querySelector('.diapositiva[data-visibile="true"]').dataset.gesto
    const fila = () => document.querySelector('.diapositive').style.transform

    it('cinque diapositive nell’ordine del servizio, una sola visibile; davanti titolo, bottoni e scheda dei fatti', () => {
      conMovimento(true)
      mostra()
      const hero = document.querySelector('.hero')
      const diapositive = [...hero.querySelectorAll('.diapositiva')]
      expect(diapositive.map((d) => d.dataset.gesto)).toEqual(FILMATI)
      expect(diapositive.filter((d) => d.dataset.visibile === 'true')).toHaveLength(1)
      expect(visibile()).toBe('sala')
      expect(parola()).toBe('Ordina.')
      expect(gruppo()).toHaveTextContent(it_.gesti.voci.sala.testo)
      // Un solo h1, sempre lo stesso: la parola del gesto non è un titolo.
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(it_.hero.titolo)
      expect(within(hero).getByRole('list', { name: 'In breve' }).closest('.hero-scheda')).not.toBeNull()
      // Le fasce in verticale non ci sono più.
      expect(document.querySelector('.gesti-fasce, li.gesto')).toBeNull()
      // I filmati sono decorazione: la fila è nascosta ai lettori di schermo.
      expect(hero.querySelector('.carosello')).toHaveAttribute('aria-hidden', 'true')
      expect(screen.getByText(/generati con l’intelligenza artificiale/)).toBeInTheDocument()
    })

    it('avanti e indietro scorrono in orizzontale, in tondo; i punti dicono quale si vede e ci portano', () => {
      conMovimento(true)
      mostra()
      expect(fila()).toBe('translateX(-0%)')
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.successiva }))
      expect(parola()).toBe('Prepara.')
      expect(visibile()).toBe('banco')
      expect(fila()).toBe('translateX(-100%)')
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.precedente }))
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.precedente }))
      expect(parola()).toBe('Riordina.')
      expect(fila()).toBe('translateX(-400%)')
      const punti = within(gruppo()).getAllByRole('button', { name: /Gesto \d di 5/ })
      expect(punti.map((p) => p.getAttribute('aria-label'))).toEqual(PAROLE.map((p, i) => `${p} Gesto ${i + 1} di 5`))
      expect(punti.filter((p) => p.getAttribute('aria-current') === 'true')).toEqual([punti[4]])
      fireEvent.click(punti[2])
      expect(parola()).toBe('Incassa.')
      expect(punti[2]).toHaveAttribute('aria-current', 'true')
    })

    it('avanza da solo ogni sei secondi; aspetta col puntatore o il fuoco sopra; «Ferma i filmati» ferma tutto', () => {
      vi.useFakeTimers()
      conMovimento(false)
      mostra()
      act(() => vi.advanceTimersByTime(0))
      expect(parola()).toBe('Ordina.')
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Prepara.')
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Incassa.')
      // Col puntatore sopra non cambia sotto le mani di chi legge.
      const hero = document.querySelector('.hero')
      fireEvent.pointerEnter(hero, { pointerType: 'mouse' })
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Incassa.')
      fireEvent.pointerLeave(hero, { pointerType: 'mouse' })
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Conta.')
      // Col fuoco su un comando, lo stesso; e riparte quando il fuoco esce.
      const avanti = screen.getByRole('button', { name: it_.gesti.successiva })
      fireEvent.focus(avanti)
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Conta.')
      fireEvent.blur(avanti)
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Riordina.')
      fireEvent.click(avanti)
      fireEvent.click(avanti)
      fireEvent.click(avanti)
      fireEvent.click(avanti)
      expect(parola()).toBe('Conta.')
      // «Ferma i filmati» ferma scorrimento e filmati; a mano si scorre ancora.
      const ferma = screen.getByRole('button', { name: it_.gesti.ferma })
      expect(ferma).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(ferma)
      expect(document.querySelector('video')).toBeNull()
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Conta.')
      fireEvent.click(avanti)
      expect(parola()).toBe('Riordina.')
      const riprendi = screen.getByRole('button', { name: it_.gesti.riprendi })
      expect(riprendi).toHaveAttribute('aria-pressed', 'true')
      fireEvent.click(riprendi)
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Ordina.')
    })

    // Rilievi del revisore (11/11/2026). Puntatore e fuoco sono due motivi
    // distinti per aspettare: uno che finisce non fa ripartire se l'altro
    // dura. Il tocco non conta come puntatore sopra. E un cambio a mano fa
    // ripartire il conto dei sei secondi da capo.
    it('puntatore e fuoco contano ognuno per sé; il tocco non ferma; un cambio a mano riparte da sei secondi', () => {
      vi.useFakeTimers()
      conMovimento(false)
      mostra()
      act(() => vi.advanceTimersByTime(0))
      const hero = document.querySelector('.hero')
      const avanti = screen.getByRole('button', { name: it_.gesti.successiva })
      // Mouse sopra e fuoco su un comando; il mouse esce, il fuoco resta.
      fireEvent.pointerEnter(hero, { pointerType: 'mouse' })
      fireEvent.focus(avanti)
      fireEvent.pointerLeave(hero, { pointerType: 'mouse' })
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Ordina.')
      // Il fuoco passa a un altro comando della stessa schermata: aspetta ancora.
      const indietro = screen.getByRole('button', { name: it_.gesti.precedente })
      fireEvent.blur(avanti, { relatedTarget: indietro })
      fireEvent.focus(indietro)
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Ordina.')
      // Il fuoco esce col mouse di nuovo sopra: aspetta ancora.
      fireEvent.pointerEnter(hero, { pointerType: 'mouse' })
      fireEvent.blur(indietro)
      act(() => vi.advanceTimersByTime(20000))
      expect(parola()).toBe('Ordina.')
      fireEvent.pointerLeave(hero, { pointerType: 'mouse' })
      // Un dito sulla schermata non è un puntatore che resta sopra.
      fireEvent.pointerEnter(hero, { pointerType: 'touch' })
      act(() => vi.advanceTimersByTime(6000))
      expect(parola()).toBe('Prepara.')
      // A metà del giro si cambia a mano: la nuova resta sei secondi interi.
      act(() => vi.advanceTimersByTime(4000))
      fireEvent.click(screen.getAllByRole('button', { name: /Gesto \d di 5/ })[3])
      expect(parola()).toBe('Conta.')
      act(() => vi.advanceTimersByTime(5000))
      expect(parola()).toBe('Conta.')
      act(() => vi.advanceTimersByTime(1000))
      expect(parola()).toBe('Riordina.')
    })

    it('scorrendo, l’h1 resta uno e lo stesso', () => {
      conMovimento(true)
      mostra()
      for (let i = 0; i < 5; i++) {
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(it_.hero.titolo)
        fireEvent.click(screen.getByRole('button', { name: it_.gesti.successiva }))
      }
    })

    it('gira solo il filmato della diapositiva che si vede: gli altri sono fermi immagine', () => {
      vi.useFakeTimers()
      conMovimento(false)
      mostra()
      act(() => vi.advanceTimersByTime(0))
      const video = () => [...document.querySelectorAll('video')]
      expect(video()).toHaveLength(1)
      const primo = video()[0]
      expect(primo.closest('.diapositiva').dataset.gesto).toBe('sala')
      expect(primo).toHaveAttribute('poster', '/video/sala.jpg')
      expect(primo.loop).toBe(true)
      expect(primo.muted).toBe(true)
      expect(primo.querySelector('source')).toHaveAttribute('src', '/video/sala.mp4')
      expect([...document.querySelectorAll('.diapositiva img')].map((i) => i.getAttribute('src'))).toEqual(
        ['banco', 'conto', 'numeri', 'scorta'].map((n) => `/video/${n}.jpg`),
      )
      for (const i of document.querySelectorAll('.diapositiva img')) expect(i).toHaveAttribute('alt', '')
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.successiva }))
      expect(video()).toHaveLength(1)
      expect(video()[0].closest('.diapositiva').dataset.gesto).toBe('banco')
    })

    it('chi chiede meno movimento vede la prima ferma, senza video e senza «Ferma»: scorre solo a mano', () => {
      vi.useFakeTimers()
      conMovimento(true)
      mostra()
      act(() => vi.advanceTimersByTime(30000))
      expect(parola()).toBe('Ordina.')
      expect(document.querySelector('video')).toBeNull()
      expect(document.querySelector('.diapositiva[data-visibile="true"] img')).toHaveAttribute('src', '/video/sala.jpg')
      expect(screen.queryByRole('button', { name: it_.gesti.ferma })).toBeNull()
      expect(screen.queryByRole('button', { name: it_.gesti.riprendi })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.successiva }))
      expect(parola()).toBe('Prepara.')
    })

    it('anche chi chiede di risparmiare dati vede i fermi immagine, e non scorre da solo', () => {
      vi.useFakeTimers()
      conMovimento(false)
      vi.stubGlobal('navigator', { userAgent: navigator.userAgent, connection: { saveData: true } })
      mostra()
      act(() => vi.advanceTimersByTime(30000))
      expect(document.querySelector('video')).toBeNull()
      expect(parola()).toBe('Ordina.')
    })

    // Il giro automatico non si annuncia: un lettore di schermo sentirebbe
    // una parola nuova ogni sei secondi. Quando si scorre a mano, sì.
    it('il cambio si annuncia ai lettori di schermo solo quando non scorre da solo', () => {
      vi.useFakeTimers()
      conMovimento(false)
      mostra()
      act(() => vi.advanceTimersByTime(0))
      const testo = gruppo().querySelector('.gesto-testo')
      expect(testo).toHaveAttribute('aria-live', 'off')
      fireEvent.click(screen.getByRole('button', { name: it_.gesti.ferma }))
      expect(testo).toHaveAttribute('aria-live', 'polite')
      expect(gruppo()).toHaveAttribute('aria-roledescription', 'carosello')
    })

    it('ogni gesto ha la sua parola, una frase sola sotto gli 80 caratteri e i suoi moduli, uguali per forma in inglese', () => {
      conMovimento(true)
      mostra()
      const avanti = screen.getByRole('button', { name: it_.gesti.successiva })
      const visti = []
      for (let i = 0; i < 5; i++) {
        visti.push({
          parola: parola(),
          riga: gruppo().querySelector('.gesto-riga').textContent,
          moduli: [...gruppo().querySelectorAll('.gesto-moduli li')].map((e) => e.textContent),
        })
        fireEvent.click(avanti)
      }
      expect(visti.map((v) => v.parola)).toEqual(PAROLE)
      expect(visti.map((v) => v.moduli)).toEqual([
        ['Nel piano Base', 'Modulo Ordini dal telefono del cliente'],
        ['Nel piano Base'],
        ['Nel piano Base', 'Modulo Pagamenti con lettore SumUp'],
        ['Modulo Statistiche e bilancio', 'Modulo Personale e ore'],
        ['Modulo Magazzino e fornitori'],
      ])
      expect(visti[3].riga).toBe(it_.gesti.voci.numeri.frasi.statistiche)
      const frasi = (t) => Object.values(t.gesti.voci).flatMap((v) => (v.frasi ? Object.values(v.frasi) : [v.testo]))
      for (const frase of [...frasi(it_), ...frasi(en)]) {
        expect(frase.length, frase).toBeLessThan(80)
        // Una frase sola: un punto, in fondo.
        expect(frase.match(/\./g), frase).toHaveLength(1)
        expect(frase.endsWith('.'), frase).toBe(true)
      }
      expect(Object.keys(en.gesti.voci)).toEqual(Object.keys(it_.gesti.voci))
    })

    // Criterio 9 di REQ-FLOTTA-060: la prima pagina è scura.
    it('la prima pagina è sul fondo scuro: i token della vetrina non hanno più i valori chiari', () => {
      const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8').replace(/\r\n/g, '\n')
      const inizio = css.indexOf('.regia.vetrina {')
      const vetrina = css.slice(inizio, css.indexOf('}', inizio))
      expect(vetrina).toContain('--bg: #0c0f0a;')
      expect(vetrina).toContain('--text: #eef2e6;')
      expect(vetrina).toContain('--lime: #b4ec2b;')
      for (const chiaro of ['#f7f9f1', '#fefffa', '#f6f2ea', '#fffdf8']) expect(css, chiaro).not.toContain(chiaro)
    })

    // Daniele, 11/11/2026: «i box cosa comprende dovrebbero essere sempre
    // aperti». Per un pomeriggio sono stati elementi che si aprivano.
    it('«Cosa comprende» nelle funzioni è sempre aperto: un riquadro, non un elemento che si apre', () => {
      conMovimento(true)
      mostra()
      expect(document.querySelector('#funzioni details')).toBeNull()
      const riquadri = [...document.querySelectorAll('#funzioni .funzione-riquadro')]
      expect(riquadri.length).toBeGreaterThan(0)
      for (const r of riquadri) {
        expect(r.tagName).toBe('DIV')
        expect(within(r).getByRole('list', { name: it_.funzioni.punti })).toBeVisible()
      }
    })

    // I filmati stanno in pagina, non in un servizio esterno, e una prima
    // pagina non può pesare come un film.
    it('ogni filmato ha il suo fermo immagine e pesa meno di 700 KB', () => {
      for (const nome of FILMATI) {
        const video = statSync(join(import.meta.dirname, '..', 'public', 'video', `${nome}.mp4`))
        expect(video.size, `${nome}.mp4`).toBeLessThan(700 * 1024)
        expect(statSync(join(import.meta.dirname, '..', 'public', 'video', `${nome}.jpg`)).size, `${nome}.jpg`).toBeLessThan(120 * 1024)
      }
    })
  })

  it('il titolo resta una frase intera, con la seconda parte nel lime', () => {
    mostra()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(it_.hero.titolo)
    expect(h1.querySelector('.titolo-accento')).toHaveTextContent('Dalla comanda alla cassa.')
  })

  it('mette lingua, titolo e alternative della pagina, e li toglie uscendo', () => {
    const { unmount } = mostra()
    expect(document.documentElement).toHaveAttribute('lang', 'it')
    expect(document.title).toBe(`${NOME_PRODOTTO} — ${it_.meta.titolo}`)
    const en = document.head.querySelector('link[rel="alternate"][hreflang="en"]')
    expect(en.getAttribute('href')).toMatch(/\/en$/)
    unmount()
    expect(document.head.querySelector('link[rel="alternate"]')).toBeNull()
  })

  it('a chi è già dentro mostra la dashboard, non la registrazione', () => {
    mostra({ uid: 'u1' })
    for (const l of screen.getAllByRole('link', { name: 'La mia dashboard' })) expect(l).toHaveAttribute('href', '/dashboard')
    expect(document.querySelector('a[href="/registrati"]')).toBeNull()
  })
})
