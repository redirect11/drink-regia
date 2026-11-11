// @vitest-environment happy-dom
'use strict'

// LA VENDITA NELLA PRIMA PAGINA (REQ-FLOTTA-015): il Free compare fra i
// prezzi solo se l'admin lo mette in vendita, e un modulo tolto dalla
// vendita sparisce dalla tabella. E l'attivazione si dice automatica solo
// quando lo è: pagamenti online accesi, o il Free in vendita.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

// `richiama` è l'ascolto della vendita: un test lo usa per cambiare la
// vendita a pagina aperta, come fa Firestore quando l'admin la tocca.
const stato = vi.hoisted(() => ({ vendita: null, richiama: null }))
vi.mock('../src/lib/db.js', () => ({
  osservaVendita: (cb) => {
    stato.richiama = cb
    cb(stato.vendita)
    return () => {}
  },
}))

import Home from '../src/pages/Home.jsx'
import { venditaPulita } from '../src/lib/vendita.js'
import it_ from '../src/i18n/home.it.js'
import { PIANI } from '../src/lib/piani.js'

const mostra = () =>
  render(
    <MemoryRouter>
      <Home utente={null} />
    </MemoryRouter>
  )

describe('la vendita nella prima pagina', () => {
  it('col Free in vendita c’è la sua scheda, a 0 €', () => {
    stato.vendita = venditaPulita({ free: true })
    mostra()
    const free = screen.getByRole('article', { name: 'Piano Free' })
    expect(free).toHaveTextContent('0 €')
    // Il Free non ha IVA né annuale da mostrare.
    expect(free).not.toHaveTextContent('IVA')
  })

  // REQ-FLOTTA-061 (e prima REQ-FLOTTA-060): i gesti del carosello seguono
  // la vendita come le funzioni. Un gesto che vive solo di moduli sparisce
  // coi suoi; uno del piano Base resta.
  const parole = () => [...document.querySelectorAll('.gesto-punto')].map((p) => p.getAttribute('aria-label').split(' ')[0])
  const vaiAlGesto = (parola) => fireEvent.click([...document.querySelectorAll('.gesto-punto')].find((p) => p.getAttribute('aria-label').startsWith(parola)))

  it('i gesti seguono la vendita: senza magazzino non c’è «Riordina.», senza SumUp «Incassa.» resta nel piano Base', () => {
    stato.vendita = venditaPulita({ moduli: { magazzino: false, sumup: false } })
    mostra()
    expect(parole()).toEqual(['Ordina.', 'Prepara.', 'Incassa.', 'Conta.'])
    expect(document.querySelectorAll('.diapositiva')).toHaveLength(4)
    // «Incassa.» resta: il conto si chiude anche senza il lettore di carte.
    vaiAlGesto('Incassa.')
    expect(document.querySelector('.gesto-riga')).toHaveTextContent(it_.gesti.voci.conto.testo)
  })

  // Rilievo del revisore (11/11/2026): «Conta» ha due moduli e una frase
  // per modulo. Si legge quella del primo in vendita, mai l'altra.
  it('«Conta.» dice solo quello che si può comprare: senza le statistiche, la frase è quella delle ore', () => {
    stato.vendita = venditaPulita({ moduli: { statistiche: false } })
    mostra()
    vaiAlGesto('Conta.')
    const riga = document.querySelector('.gesto-riga').textContent
    expect(riga).toBe(it_.gesti.voci.numeri.frasi.staff)
  })

  it('senza statistiche né personale non c’è «Conta.»', () => {
    stato.vendita = venditaPulita({ moduli: { statistiche: false, staff: false } })
    mostra()
    expect(parole()).toEqual(['Ordina.', 'Prepara.', 'Incassa.', 'Riordina.'])
  })

  // Se la vendita cambia a pagina aperta mentre si guarda l'ultimo gesto,
  // il carosello non resta su una diapositiva che non c'è più.
  it('un gesto che sparisce a pagina aperta non lascia il carosello nel vuoto', () => {
    mostra()
    vaiAlGesto('Riordina.')
    expect(document.querySelector('.gesto-parola')).toHaveTextContent('Riordina.')
    act(() => stato.richiama(venditaPulita({ moduli: { magazzino: false } })))
    expect(document.querySelector('.gesto-parola')).toHaveTextContent('Conta.')
    expect(document.querySelector('.diapositiva[data-visibile="true"]').dataset.gesto).toBe('numeri')
  })

  // REQ-FLOTTA-063: col Free in vendita il confronto ha tre colonne, e
  // dice cosa manca al Free coi numeri del listino.
  it('col Free in vendita il confronto ha tre colonne: i limiti del Free vengono dal listino, e i moduli lì non sono disponibili', () => {
    stato.vendita = venditaPulita({ free: true })
    mostra()
    fireEvent.click(screen.getByRole('button', { name: it_.prezzi.confronto.apri }))
    const tabella = within(screen.getByRole('table'))
    expect(tabella.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Free', 'Base', 'Completo'])
    const c = it_.prezzi.confronto
    const riga = (id) => [...tabella.getByRole('row', { name: new RegExp(`^${c.righe[id]}`) }).querySelectorAll('td')].map((td) => td.textContent)
    const limiti = PIANI.free.limiti
    expect(riga('comande')).toEqual(['No', 'Sì', 'Sì'])
    expect(riga('prodotti')).toEqual([`Fino a ${limiti.prodotti_max}`, 'Senza limite', 'Senza limite'])
    expect(riga('conti')).toEqual([`Fino a ${limiti.conti_aperti_max}`, 'Senza limite', 'Senza limite'])
    expect(riga('utenti')).toEqual(['Solo il titolare', 'Senza limite', 'Senza limite'])
    expect(riga('sconti')).toEqual(['No', 'Sì', 'Sì'])
    expect(riga('storico')).toEqual([`Ultimi ${limiti.storico_giorni} giorni`, 'Tutto', 'Tutto'])
    expect(riga('terminali')).toEqual([String(PIANI.free.terminali), String(PIANI.base.terminali), String(PIANI.completo.terminali)])
    // Un modulo a pagamento: non disponibile nel Free, a prezzo nel Base, compreso nel Completo.
    const magazzino = [...tabella.getByRole('row', { name: /^Magazzino e fornitori/ }).querySelectorAll('td')].map((td) => td.textContent)
    expect(magazzino[0]).toBe('Non disponibile')
    expect(magazzino[1]).toMatch(/^15 € \+ IVA/)
    expect(magazzino[2]).toBe('Incluso')
    // Il terminale in più: nel Free non c'è (il Free ha un terminale e
    // non passa dal pagamento); negli altri ha il suo prezzo.
    const terminale = [...tabella.getByRole('row', { name: /^Terminale in più/ }).querySelectorAll('td')].map((td) => td.textContent)
    expect(terminale[0]).toBe('Non disponibile')
    expect(terminale[1]).toMatch(/^12 € \+ IVA/)
    expect(terminale[2]).toMatch(/^12 € \+ IVA/)
  })

  it('un modulo tolto dalla vendita non compare né nel confronto né nell’elenco dei moduli', () => {
    stato.vendita = venditaPulita({ moduli: { sumup: false } })
    mostra()
    fireEvent.click(screen.getByRole('button', { name: it_.prezzi.confronto.apri }))
    const tabella = within(screen.getByRole('table'))
    expect(tabella.queryByText('Pagamenti con lettore SumUp')).toBeNull()
    expect(tabella.getByText('Magazzino e fornitori')).toBeInTheDocument()
    const elenco = within(document.querySelector('.moduli-elenco'))
    expect(elenco.queryByRole('button', { name: /^Pagamenti con lettore SumUp/ })).toBeNull()
    expect(elenco.getByRole('button', { name: /^Magazzino e fornitori/ })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Piano Free' })).toBeNull()
    // Sparisce anche fra le funzioni raccontate: la riga del lettore di
    // carte non c'è, quella del magazzino sì.
    const funzioni = document.getElementById('funzioni')
    expect(funzioni).not.toHaveTextContent(it_.funzioni.minori.sumup)
    expect(within(funzioni).getByRole('heading', { name: it_.funzioni.voci.magazzino.titolo })).toBeInTheDocument()
  })

  it('col Free in vendita la prima schermata lo dice', () => {
    stato.vendita = venditaPulita({ free: true })
    mostra()
    expect(within(screen.getByRole('list', { name: 'In breve' })).getByText('Piano Free per provare')).toBeInTheDocument()
  })

  it('una funzione i cui moduli sono tutti fuori vendita non si racconta', () => {
    stato.vendita = venditaPulita({ moduli: { magazzino: false, staff: false, sumup: false } })
    mostra()
    expect(screen.queryByRole('heading', { name: 'Il magazzino si aggiorna a ogni vendita.' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Quanto hai incassato, a che ora, con cosa.' })).toBeInTheDocument()
    // Senza personale e SumUp, la riga delle funzioni minori non c'è.
    expect(document.querySelector('.funzioni-minori')).toBeNull()
  })

  // Revisione PR #20: in produzione pagamenti online e Free partono spenti,
  // e la richiesta passa dall'admin. «Automatica» lì non è vera.
  it('con pagamenti online e Free spenti l’attivazione si concorda, non è automatica', () => {
    stato.vendita = venditaPulita(null)
    mostra()
    const fatti = within(screen.getByRole('list', { name: 'In breve' }))
    expect(fatti.getByText(it_.hero.concordata)).toBeInTheDocument()
    expect(fatti.queryByText(it_.hero.automatica)).toBeNull()
    expect(screen.getByText(it_.passi.voci[2].concordata)).toBeInTheDocument()
    expect(screen.queryByText(it_.passi.voci[2].testo)).toBeNull()
  })

  it('con i pagamenti online accesi l’attivazione è automatica', () => {
    stato.vendita = venditaPulita({ pagamenti_online: true })
    mostra()
    expect(within(screen.getByRole('list', { name: 'In breve' })).getByText(it_.hero.automatica)).toBeInTheDocument()
    expect(screen.getByText(it_.passi.voci[2].testo)).toBeInTheDocument()
  })

  it('col Free in vendita l’attivazione è automatica', () => {
    stato.vendita = venditaPulita({ free: true })
    mostra()
    expect(within(screen.getByRole('list', { name: 'In breve' })).getByText(it_.hero.automatica)).toBeInTheDocument()
    expect(screen.getByText(it_.passi.voci[2].testo)).toBeInTheDocument()
  })

  // Revisione PR #20: un elemento montato dopo il primo giro restava a
  // opacità zero (src/lib/comparsa.js). Il magazzino rimesso in vendita a
  // pagina aperta deve vedersi subito.
  it('una funzione che torna in vendita a pagina aperta si vede subito', () => {
    stato.vendita = venditaPulita({ moduli: { magazzino: false } })
    mostra()
    const titolo = it_.funzioni.voci.magazzino.titolo
    expect(screen.queryByRole('heading', { name: titolo })).toBeNull()
    // Le sezioni del primo giro sono osservate (e aspettano di comparire).
    expect(document.getElementById('come-funziona')).toHaveClass('in-attesa')
    act(() => stato.richiama(venditaPulita(null)))
    const nuova = screen.getByRole('heading', { name: titolo }).closest('article')
    expect(nuova).not.toHaveClass('in-attesa')
  })
})
