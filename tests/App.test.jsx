// @vitest-environment happy-dom
'use strict'

// LA BARRA E IL PIÈ DI PAGINA (REQ-FLOTTA-002): il menù con le sezioni
// della prima pagina, accesso e registrazione per chi non è dentro,
// dashboard ed esci per chi lo è, e sul telefono un tasto che apre il
// menù. L'utente, 22/10/2026: «una landing page con menu e tutto il resto».

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

let utenteOsservato = null
vi.mock('../src/lib/db.js', () => ({
  osservaUtente: (cb) => {
    cb(utenteOsservato)
    return () => {}
  },
  esci: vi.fn(),
  // La prima pagina legge la vendita (REQ-FLOTTA-015): qui quella di partenza.
  osservaVendita: (cb) => {
    cb(null)
    return () => {}
  },
}))

import App from '../src/App.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = (percorso = '/') =>
  render(
    <MemoryRouter initialEntries={[percorso]} future={FUTURO}>
      <App />
    </MemoryRouter>
  )

describe('la barra', () => {
  it('ha il menù delle sezioni e, per chi non è dentro, accesso e registrazione', () => {
    utenteOsservato = null
    mostra()
    const menu = screen.getByRole('navigation', { name: 'Principale' })
    for (const [testo, ancora] of [
      ['Funzioni', '/#funzioni'],
      ['Come funziona', '/#come-funziona'],
      ['Prezzi', '/#prezzi'],
      ['Domande', '/#domande'],
    ]) {
      expect(within(menu).getByRole('link', { name: testo })).toHaveAttribute('href', ancora)
    }
    expect(within(menu).getByRole('link', { name: 'Accedi' })).toHaveAttribute('href', '/accedi')
    expect(within(menu).getByRole('link', { name: 'Registra il locale' })).toHaveAttribute('href', '/registrati')
    expect(within(menu).queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })

  it('a chi è dentro mostra la dashboard ed esci; il backoffice solo all’admin', () => {
    utenteOsservato = { uid: 'u1', admin: true }
    mostra()
    const menu = screen.getByRole('navigation', { name: 'Principale' })
    expect(within(menu).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Backoffice' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Esci' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Accedi' })).toBeNull()
  })

  it('il tasto Menu apre e chiude il menù sul telefono', async () => {
    utenteOsservato = null
    const user = userEvent.setup()
    mostra()
    const tasto = screen.getByRole('button', { name: 'Menu' })
    expect(tasto).toHaveAttribute('aria-expanded', 'false')
    await user.click(tasto)
    expect(tasto).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Principale' })).toHaveClass('aperto')
    await user.click(tasto)
    expect(tasto).toHaveAttribute('aria-expanded', 'false')
  })
})

// REQ-DEV-002: il sito di test si dice tale. Nei test VITE_APP_ENV manca,
// come in locale: non è produzione, e il nastro c'è.
describe('il nastro TEST e la versione', () => {
  it('fuori dalla produzione c’è il nastro, e nel piè di pagina la versione di package.json', () => {
    utenteOsservato = null
    mostra()
    expect(screen.getByRole('note')).toHaveTextContent(/^TEST · v\d+\.\d+\.\d+/)
    expect(screen.getByTestId('versione')).toHaveTextContent(/^Versione v\d+\.\d+\.\d+/)
  })
})

describe('il piè di pagina', () => {
  it('porta a termini, privacy, prezzi e contatto', () => {
    utenteOsservato = null
    mostra()
    const piede = screen.getByRole('contentinfo')
    expect(within(piede).getByRole('link', { name: 'Termini di servizio' })).toHaveAttribute('href', '/termini')
    expect(within(piede).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(within(piede).getByRole('link', { name: 'Prezzi' })).toHaveAttribute('href', '/#prezzi')
    expect(within(piede).getByRole('link', { name: /@/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
    expect(within(piede).getByText(/non è uno scontrino fiscale/)).toBeInTheDocument()
  })
})
