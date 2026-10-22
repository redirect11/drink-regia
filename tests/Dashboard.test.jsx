// @vitest-environment happy-dom
'use strict'

// LA DASHBOARD DEL TITOLARE (REQ-FLOTTA-004): il locale, il piano, lo
// stato dell'istanza; «Attiva» chiama la Function e, senza piano, spiega.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ cliente: null, istanza: null, richiesta: null }))
const db = vi.hoisted(() => ({
  osservaCliente: vi.fn((uid, cb) => {
    cb(stato.cliente)
    return () => {}
  }),
  osservaIstanza: vi.fn((slug, cb) => {
    cb(stato.istanza)
    return () => {}
  }),
  osservaRichiesta: vi.fn((slug, cb) => {
    cb(stato.richiesta)
    return () => {}
  }),
  chiediAttivazione: vi.fn(async () => {}),
}))
vi.mock('../src/lib/db.js', () => ({ ...db, avviaPagamento: vi.fn(), cambiaScelta: vi.fn(async () => ({ ok: true })) }))

import Dashboard from '../src/pages/Dashboard.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = () =>
  render(
    <MemoryRouter future={FUTURO}>
      <Dashboard utente={{ uid: 'u1', email: 'mario@example.it' }} />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  stato.cliente = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff'], terminali: 2, abbonamento: { stato: 'attivo' } }
  stato.istanza = null
  stato.richiesta = null
})

describe('la dashboard', () => {
  it('dice locale, piano col prezzo del mese e stato dell’istanza', () => {
    mostra()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bar Mario')
    expect(screen.getAllByText('Base')[0].closest('p')).toHaveTextContent('46 €') // 24 + 10 (staff) + 12 (secondo terminale)
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Non ancora attivata')
  })

  // REQ-FLOTTA-010: con l'abbonamento attivo si cambia piano o moduli.
  it('con l’abbonamento attivo c’è «Cambia piano o moduli», non la scelta iniziale', () => {
    mostra()
    expect(screen.getByRole('heading', { name: 'Cambia piano o moduli' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiorna il piano' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Vai al pagamento/ })).toBeNull()
  })

  // Audit del 22/10/2026, C2: il browser non manda niente, il server
  // rilegge il cliente da sé. Prima qui si controllava che partisse il
  // documento del cliente: era proprio quello il problema.
  it('«Attiva» chiede l’attivazione al server, senza passare dati', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Attiva l’istanza/ }))
    expect(db.chiediAttivazione).toHaveBeenCalledTimes(1)
    expect(db.chiediAttivazione).toHaveBeenCalledWith()
  })

  it('se il server rifiuta, la dashboard dice perché', async () => {
    db.chiediAttivazione.mockRejectedValueOnce(new Error('L’abbonamento non risulta attivo.'))
    const user = userEvent.setup()
    mostra()
    await user.click(screen.getByRole('button', { name: /Attiva l’istanza/ }))
    expect(await screen.findByText('L’abbonamento non risulta attivo.')).toBeInTheDocument()
  })

  it('senza piano il tasto è spento, dice cosa manca, e sotto c’è la scelta del piano', () => {
    stato.cliente = { ...stato.cliente, piano: null, abbonamento: null }
    mostra()
    expect(screen.getByRole('button', { name: /Attiva l’istanza/ })).toBeDisabled()
    expect(screen.getByText(/Serve un piano/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scelta del piano' })).toBeInTheDocument()
  })

  it('attiva: l’indirizzo dell’app e la versione', () => {
    stato.istanza = { stato: 'attiva', url: 'https://bar-mario.drink.app', versione: 'v1.10.0', aggiornata_il: '2026-10-22T10:00:00Z' }
    mostra()
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Attiva')
    expect(screen.getByRole('link', { name: 'https://bar-mario.drink.app' })).toBeInTheDocument()
    expect(screen.getByText(/Versione v1.10.0/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Attiva l’istanza/ })).toBeNull()
  })

  it('in coda: niente tasto, si aspetta', () => {
    stato.richiesta = { stato: 'in coda' }
    mostra()
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent(/In coda/)
    expect(screen.queryByRole('button', { name: /Attiva l’istanza/ })).toBeNull()
  })
})
