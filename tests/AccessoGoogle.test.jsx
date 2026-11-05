// @vitest-environment happy-dom
'use strict'

// L'ACCESSO CON GOOGLE (REQ-FLOTTA-038): il tasto in «Accedi» e in
// «Registrati», gli errori della finestra in italiano, e la dashboard che a
// chi non ha il locale chiede i dati (il modulo si prova in
// Registrati.test.jsx).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  entraConGoogle: vi.fn(async () => {}),
  completaRegistrazione: vi.fn(async () => ({})),
  registra: vi.fn(),
  accedi: vi.fn(),
  recuperaPassword: vi.fn(),
  esci: vi.fn(async () => {}),
  osservaCliente: vi.fn((uid, cb) => {
    cb(null)
    return () => {}
  }),
}))
vi.mock('../src/lib/db.js', () => db)

import Accedi from '../src/pages/Accedi.jsx'
import Registrati, { messaggio } from '../src/pages/Registrati.jsx'
import Dashboard from '../src/pages/Dashboard.jsx'
import { finestraChiusa } from '../src/pages/EntraConGoogle.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = (pagina, da = '/accedi') =>
  render(
    <MemoryRouter future={FUTURO} initialEntries={[da]}>
      <Routes>
        <Route path={da} element={pagina} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => vi.clearAllMocks())

describe('il tasto di Google', () => {
  it('in «Accedi» entra con Google e va alla dashboard', async () => {
    const user = userEvent.setup()
    mostra(<Accedi />)
    await user.click(screen.getByRole('button', { name: 'Entra con Google' }))
    expect(db.entraConGoogle).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
    expect(db.accedi).not.toHaveBeenCalled()
  })

  it('in «Registrati» c’è al primo passo, accanto a email e password', () => {
    mostra(<Registrati />, '/registrati')
    expect(screen.getByRole('button', { name: 'Registrati con Google' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('chiudere la finestra non è un errore; una finestra bloccata si spiega, e si resta sulla pagina', async () => {
    const user = userEvent.setup()
    db.entraConGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' })
    mostra(<Accedi />)
    await user.click(screen.getByRole('button', { name: 'Entra con Google' }))
    expect(screen.queryByText(/Google/, { selector: '.errore' })).toBeNull()
    db.entraConGoogle.mockRejectedValueOnce({ code: 'auth/popup-blocked' })
    await user.click(screen.getByRole('button', { name: 'Entra con Google' }))
    expect(await screen.findByText(/ha bloccato la finestra di Google/)).toBeInTheDocument()
    expect(screen.queryByText('DASHBOARD')).toBeNull()
  })

  it('gli errori di Google si leggono in italiano, dalla stessa mappa di email e password', () => {
    expect(finestraChiusa({ code: 'auth/cancelled-popup-request' })).toBe(true)
    expect(finestraChiusa({ code: 'auth/popup-blocked' })).toBe(false)
    expect(messaggio({ code: 'auth/account-exists-with-different-credential' })).toMatch(/entra con email e password/)
    expect(messaggio({ code: 'auth/operation-not-allowed' })).toMatch(/non è ancora attivo/)
    expect(messaggio({ code: 'auth/unauthorized-domain' })).toMatch(/non è ancora attivo/)
    expect(messaggio({ code: 'auth/network-request-failed' })).toMatch(/Connessione/)
  })
})

describe('la dashboard di chi non ha il locale', () => {
  const utente = { uid: 'g1', email: 'mario@gmail.com', emailVerificata: true }

  it('chiede i dati del locale, senza il passo dell’account', () => {
    mostra(<Dashboard utente={utente} />, '/dashboard-g')
    expect(screen.getByRole('heading', { name: 'Completa la registrazione' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome del locale')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
  })

  it('all’amministratore della regia non chiede niente', () => {
    mostra(<Dashboard utente={{ ...utente, admin: true }} />, '/dashboard-g')
    expect(screen.getByText('Nessun locale registrato per questo account.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome del locale')).toBeNull()
  })
})
