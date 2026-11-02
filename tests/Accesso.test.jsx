// @vitest-environment happy-dom
'use strict'

// IL PASSAGGIO DALL'APP DEL LOCALE (REQ-FLOTTA-030): «Area clienti»
// nell'app porta a /accesso col codice dopo il `#`; la pagina lo toglie
// dall'indirizzo, lo scambia ed entra.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({ entraColPassaggio: vi.fn(async () => {}) }))
vi.mock('../src/lib/db.js', () => db)

import Accesso, { leggiCodice } from '../src/pages/Accesso.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = () =>
  render(
    <MemoryRouter initialEntries={['/accesso']} future={FUTURO}>
      <Routes>
        <Route path="/accesso" element={<Accesso />} />
        <Route path="/dashboard" element={<p>la dashboard</p>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/accesso')
})

describe('la pagina del passaggio', () => {
  it('legge il codice dopo il #', () => {
    expect(leggiCodice('#accesso-regia=abc')).toBe('abc')
    expect(leggiCodice('#altro=1&accesso-regia=xyz')).toBe('xyz')
    expect(leggiCodice('')).toBe('')
    expect(leggiCodice(undefined)).toBe('')
  })

  it('toglie il codice dall’indirizzo, lo scambia ed entra nella dashboard', async () => {
    window.history.replaceState(null, '', '/accesso#accesso-regia=c0d1c3')
    mostra()
    expect(await screen.findByText('la dashboard')).toBeInTheDocument()
    expect(db.entraColPassaggio).toHaveBeenCalledWith('c0d1c3')
    expect(window.location.hash).toBe('')
  })

  it('un codice che non vale lo dice, con la strada normale per entrare', async () => {
    db.entraColPassaggio.mockRejectedValueOnce(new Error('Codice scaduto: riprova dal tasto.'))
    window.history.replaceState(null, '', '/accesso#accesso-regia=vecchio')
    mostra()
    expect(await screen.findByText('Codice scaduto: riprova dal tasto.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entra con email e password' })).toHaveAttribute('href', '/accedi')
  })

  it('senza codice non chiama niente', async () => {
    mostra()
    await waitFor(() => expect(screen.getByText(/Nessun codice di accesso/)).toBeInTheDocument())
    expect(db.entraColPassaggio).not.toHaveBeenCalled()
  })
})
