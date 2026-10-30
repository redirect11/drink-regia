// @vitest-environment happy-dom
'use strict'

// LA PRIMA PAGINA (REQ-FLOTTA-002, DESIGN.md): la promessa nel titolo, il
// problema, i tre pilastri, le funzioni coi loro moduli, i passi, i prezzi
// dal listino, le domande, l'ultima azione. Tono del mestiere, niente urla.
//
// 30/10/2026, la home nuova (l'utente: «più moderna… con slogan
// migliori»): il titolo non è più il nome del prodotto ma la promessa
// (DESIGN.md §1 e §5.1), il bottone dice «Attiva il tuo locale» invece di
// «Registra il tuo locale», la foto del banco è uno sfondo (testo
// alternativo vuoto) e la tabella dei moduli ha la colonna del Completo.
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
import { PIANI, MODULI, ATTIVAZIONE, TERMINALE_IN_PIU } from '../src/lib/piani.js'
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

  it('i prezzi vengono dal listino: piani, «da … al mese», attivazione, moduli, terminale in più', () => {
    mostra()
    for (const p of aPagamento) {
      const scheda = screen.getByRole('article', { name: `Piano ${p.nome}` })
      expect(scheda).toHaveTextContent(`${p.prezzo} €`)
      expect(within(scheda).getByRole('link', { name: `Inizia con ${p.nome}` })).toHaveAttribute('href', '/registrati')
    }
    expect(screen.getByRole('article', { name: 'Piano Completo' })).toHaveTextContent('Tutto incluso')
    // Il Free si mostra solo se l'admin lo mette in vendita (REQ-FLOTTA-015):
    // senza, la pagina non lo nomina (tests/HomeVendita.test.jsx).
    expect(screen.queryByRole('article', { name: 'Piano Free' })).toBeNull()
    const minimo = Math.min(...aPagamento.map((p) => p.prezzo))
    expect(within(screen.getByRole('list', { name: 'In breve' })).getByText(`Da ${minimo} € al mese`)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Attivazione una tantum: ${ATTIVAZIONE} €`))).toBeInTheDocument()

    const tabella = within(screen.getByRole('table'))
    for (const m of MODULI) {
      const riga = tabella.getByRole('row', { name: new RegExp(m.nome) })
      expect(riga).toHaveTextContent(`${m.prezzo} €`)
      if (PIANI.completo.include.includes(m.id)) expect(riga).toHaveTextContent('Incluso')
    }
    expect(tabella.getByRole('row', { name: /Terminale in più/ })).toHaveTextContent(`${TERMINALE_IN_PIU} €`)
  })

  it('quanto conviene il Completo lo calcola dal listino', () => {
    mostra()
    const inclusi = MODULI.filter((m) => PIANI.completo.include.includes(m.id))
    const totale = PIANI.base.prezzo + inclusi.reduce((s, m) => s + m.prezzo, 0)
    expect(screen.getByText(new RegExp(`tutti i moduli costa ${totale} € al mese`))).toHaveTextContent(`${PIANI.completo.prezzo} €`)
  })

  it('le funzioni dicono il modulo che le porta, e quella di base il piano', () => {
    mostra()
    const magazzino = MODULI.find((m) => m.id === 'magazzino')
    expect(screen.getByText(`Modulo ${magazzino.nome}`)).toBeInTheDocument()
    expect(screen.getByText(`Nel piano ${PIANI.base.nome}`)).toBeInTheDocument()
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

  it('la foto del banco è uno sfondo: alt vuoto e dimensioni scritte', () => {
    mostra()
    const foto = document.querySelector('img.hero-fondo')
    expect(foto).toHaveAttribute('alt', '')
    expect(foto).toHaveAttribute('width', '1600')
    expect(foto).toHaveAttribute('height', '600')
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
