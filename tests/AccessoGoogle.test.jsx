// @vitest-environment happy-dom
'use strict'

// L'ACCESSO CON GOOGLE (REQ-FLOTTA-038): il tasto in «Accedi» e in
// «Registrati», gli errori della finestra in italiano, e chi entra con
// Google per la prima volta completa i dati del locale dalla dashboard,
// senza il passo dell'account.

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
import Registrati from '../src/pages/Registrati.jsx'
import Dashboard from '../src/pages/Dashboard.jsx'
import { messaggioGoogle } from '../src/pages/EntraConGoogle.jsx'

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

  it('gli errori di Google si leggono in italiano', () => {
    expect(messaggioGoogle({ code: 'auth/cancelled-popup-request' })).toBeNull()
    expect(messaggioGoogle({ code: 'auth/account-exists-with-different-credential' })).toMatch(/entra con email e password/)
    expect(messaggioGoogle({ code: 'auth/operation-not-allowed' })).toMatch(/non è ancora attivo/)
    expect(messaggioGoogle({ code: 'auth/unauthorized-domain' })).toMatch(/non è ancora attivo/)
    expect(messaggioGoogle({ code: 'auth/network-request-failed' })).toMatch(/Connessione/)
    expect(messaggioGoogle(new Error('x'))).toMatch(/non è riuscito/)
  })
})

describe('chi entra con Google la prima volta', () => {
  const utente = { uid: 'g1', email: 'mario@gmail.com', emailVerificata: true }

  it('la dashboard senza locale chiede i dati del locale, senza il passo dell’account', () => {
    mostra(<Dashboard utente={utente} />, '/dashboard-g')
    expect(screen.getByRole('heading', { name: 'Completa la registrazione' })).toBeInTheDocument()
    expect(screen.getByText(/Sei entrato come mario@gmail\.com/)).toBeInTheDocument()
    expect(screen.getByLabelText('Nome del locale')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
    expect(screen.queryByRole('button', { name: /con Google/ })).toBeNull()
    expect(screen.queryByText('Account', { selector: 'li' })).toBeNull()
  })

  it('l’amministratore della regia senza locale non deve registrarne uno', () => {
    mostra(<Dashboard utente={{ ...utente, admin: true }} />, '/dashboard-g')
    expect(screen.getByText('Nessun locale registrato per questo account.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nome del locale')).toBeNull()
  })

  it('completa con locale, fatturazione e consensi, senza creare un altro account', async () => {
    const user = userEvent.setup()
    mostra(<Registrati completa={utente} />, '/dashboard-g')
    expect(screen.queryByRole('button', { name: 'Indietro' })).toBeNull()
    await user.type(screen.getByLabelText('Nome del locale'), 'Bar Mario')
    await user.selectOptions(screen.getByLabelText('Tipo di locale'), 'bar')
    await user.type(screen.getByLabelText('Indirizzo'), 'Via Roma 1')
    await user.type(screen.getByLabelText('CAP'), '80035')
    await user.type(screen.getByLabelText('Città'), 'Nola')
    await user.type(screen.getByLabelText('Provincia'), 'na')
    await user.type(screen.getByLabelText('Telefono del locale'), '081 1234567')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.type(screen.getByLabelText('Ragione sociale'), 'Bar Mario srl')
    await user.type(screen.getByLabelText('Partita IVA'), '01234567897')
    await user.type(screen.getByLabelText('PEC'), 'bar@pec.it')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: 'Salva i dati del locale' }))
    expect(db.completaRegistrazione).toHaveBeenCalledWith({
      locale: expect.objectContaining({ nome: 'Bar Mario', provincia: 'NA' }),
      fatturazione: expect.objectContaining({ partita_iva: '01234567897' }),
      referente: expect.objectContaining({ nome: 'Mario', termini: true, privacy: true }),
    })
    expect(db.registra).not.toHaveBeenCalled()
  })

  it('con l’account Google sbagliato si esce', async () => {
    const user = userEvent.setup()
    mostra(<Registrati completa={utente} />, '/dashboard-g')
    await user.click(screen.getByRole('button', { name: 'Esci' }))
    expect(db.esci).toHaveBeenCalledTimes(1)
  })
})
