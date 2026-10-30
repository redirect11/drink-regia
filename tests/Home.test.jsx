// @vitest-environment happy-dom
'use strict'

// LA PRIMA PAGINA (REQ-FLOTTA-002): cosa fa il prodotto, i piani coi
// prezzi, il tasto per registrarsi. Tono del mestiere, niente urla.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

// La prima pagina legge la vendita da db.js (REQ-FLOTTA-015). Qui si usa la
// vendita predefinita, come senza Firebase, e db.js non si carica: caricato
// davvero, la coverage di src/lib conta come non provate tutte le sue
// funzioni, che parlano con Firebase e si provano dai componenti.
vi.mock('../src/lib/db.js', () => ({ osservaVendita: (cb) => (cb(null), () => {}) }))

import Home from '../src/pages/Home.jsx'
import { PIANI, MODULI } from '../src/lib/piani.js'
import { NOME_PRODOTTO } from '../src/lib/prodotto.js'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }

describe('la prima pagina', () => {
  it('dice il prodotto, i piani coi prezzi e i moduli', () => {
    render(
      <MemoryRouter future={FUTURO}>
        <Home utente={null} />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(NOME_PRODOTTO)
    for (const p of Object.values(PIANI).filter((x) => !x.gratuito)) {
      const scheda = screen.getByRole('article', { name: `Piano ${p.nome}` })
      expect(scheda).toHaveTextContent(`${p.prezzo} €`)
    }
    // Il Free si mostra solo se l'admin lo mette in vendita (REQ-FLOTTA-015):
    // senza, la pagina non lo nomina (tests/HomeVendita.test.jsx).
    expect(screen.queryByRole('article', { name: 'Piano Free' })).toBeNull()
    // I moduli stanno nella tabella dei prezzi (lo stesso nome può comparire
    // anche tra le funzioni raccontate sopra).
    const tabella = within(screen.getByRole('table'))
    for (const m of MODULI) expect(tabella.getByText(m.nome)).toBeInTheDocument()
    // Il tasto per registrarsi c'è in cima e in fondo, e porta sempre lì.
    for (const l of screen.getAllByRole('link', { name: /Registra il tuo locale/ })) expect(l).toHaveAttribute('href', '/registrati')
    // Lo scontrino non è fiscale: si dice subito, non nel contratto.
    expect(screen.getByText(/non è uno scontrino fiscale/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/sblocca|acquista ora|scopri/i)
  })

  // Una landing page intera (l'utente, 22/10/2026): le sezioni che il menù
  // della barra raggiunge, con le funzioni, i tre passi e le domande.
  it('ha le sezioni del menù: funzioni, come funziona, prezzi, domande, contatti', () => {
    render(
      <MemoryRouter future={FUTURO}>
        <Home utente={null} />
      </MemoryRouter>
    )
    for (const id of ['funzioni', 'come-funziona', 'prezzi', 'domande', 'contatti']) {
      expect(document.getElementById(id), id).not.toBeNull()
    }
    expect(screen.getByRole('heading', { name: 'Funzioni' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Funziona senza rete' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Come funziona' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Domande frequenti' })).toBeInTheDocument()
    // Le domande si aprono una per una.
    expect(screen.getByText('Lo scontrino è fiscale?').closest('details')).not.toBeNull()
    // L'immagine ha un testo alternativo e il link alla dimostrazione apre fuori.
    expect(screen.getByRole('img', { name: /cocktail bar/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /dimostrativa/ })).toHaveAttribute('target', '_blank')
  })

  it('a chi è già dentro mostra la dashboard, non la registrazione', () => {
    render(
      <MemoryRouter future={FUTURO}>
        <Home utente={{ uid: 'u1' }} />
      </MemoryRouter>
    )
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard')
    expect(screen.queryByRole('link', { name: /Registra/ })).toBeNull()
  })
})
