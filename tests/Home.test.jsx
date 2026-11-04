// @vitest-environment happy-dom
'use strict'

// LA PRIMA PAGINA (REQ-FLOTTA-002, DESIGN.md): la promessa nel titolo, il
// problema, i tre pilastri, le funzioni coi loro moduli, i passi, i prezzi
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
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = (utente = null) =>
  render(
    <MemoryRouter future={FUTURO}>
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

  it('ha le sezioni nell’ordine del percorso: problema, pilastri, funzioni, passi, prezzi, domande, chiusura', () => {
    mostra()
    const ordine = ['problema', 'pilastri', 'funzioni', 'come-funziona', 'prezzi', 'domande', 'contatti']
    const trovate = [...document.querySelectorAll('main section[id]')].map((s) => s.id)
    expect(trovate).toEqual(ordine)
    expect(screen.getByRole('heading', { name: it_.problema.titolo })).toBeInTheDocument()
    for (const p of it_.pilastri.voci) expect(screen.getByRole('heading', { name: p.titolo })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Come si comincia' })).toBeInTheDocument()
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
    const magazzino = MODULI.find((m) => m.id === 'magazzino')
    expect(screen.getByText(`Modulo ${magazzino.nome}`)).toBeInTheDocument()
    expect(screen.getByText(`Nel piano ${PIANI.base.nome}`)).toBeInTheDocument()
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

  // 03/11/2026 (l'utente: «più moderna, elegante e accattivante»): le luci
  // del bar al posto del segnaposto hero.jpg, disegnate dal CSS, e il
  // titolo in due tempi con la svolta in oro.
  it('la prima schermata non scarica immagini: le luci sono decorative, fuori dai lettori di schermo', () => {
    mostra()
    const hero = document.querySelector('.hero')
    expect(hero.querySelector('img')).toBeNull()
    expect(hero.querySelector('.hero-luci')).toHaveAttribute('aria-hidden', 'true')
  })

  it('il titolo resta una frase intera, con la seconda parte in oro', () => {
    mostra()
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent(it_.hero.titolo)
    expect(h1.querySelector('.titolo-oro')).toHaveTextContent('Nemmeno quando cade il Wi-Fi.')
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
