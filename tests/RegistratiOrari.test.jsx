// @vitest-environment happy-dom
'use strict'

// GLI ORARI DI SERVIZIO NELLA REGISTRAZIONE (REQ-FLOTTA-095). Daniele,
// 13/11/2026: «quando un cliente si registra deve specificare gli orari di
// servizio dell'esercizio». Un passo suo, dopo il locale: un giorno per
// riga, con apertura e chiusura (anche dopo la mezzanotte) o «chiuso».
// Non si va avanti senza, e il passo dice subito che dopo 7 giorni gli
// orari si cambiano solo con una richiesta approvata.
//
// Le caselle degli orari si riempiono con fireEvent.change: con
// <input type="time"> userEvent.type non scrive in modo affidabile.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  registra: vi.fn(),
  completaRegistrazione: vi.fn(async () => ({})),
  entraConGoogle: vi.fn(),
  esci: vi.fn(async () => {}),
  slugGiaInUso: (err) => String(err?.code || '').includes('already-exists') && err?.details?.campo === 'slug',
}))
vi.mock('../src/lib/db.js', () => db)

import Registrati from '../src/pages/Registrati.jsx'

const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']

const mostra = (pagina = <Registrati />) =>
  render(
    <MemoryRouter initialEntries={['/registrati']}>
      <Routes>
        <Route path="/registrati" element={pagina} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => vi.clearAllMocks())

const apertura = (giorno) => screen.getByLabelText(new RegExp(`^${giorno}.*apertura`, 'i'))
const chiusura = (giorno) => screen.getByLabelText(new RegExp(`^${giorno}.*chiusura`, 'i'))
const chiuso = (giorno) => screen.getByLabelText(new RegExp(`^${giorno}.*chiuso$`, 'i'))
const avanti = (user) => user.click(screen.getByRole('button', { name: 'Avanti' }))

async function passoAccount(user) {
  await user.type(screen.getByLabelText('Email'), 'mario@example.it')
  await user.type(screen.getByLabelText(/^Password/), 'bar-mario-2026')
  await user.type(screen.getByLabelText('Ripeti la password'), 'bar-mario-2026')
  await avanti(user)
}

async function passoLocale(user) {
  await user.type(screen.getByLabelText('Nome del locale'), 'Bar Mario')
  await user.selectOptions(screen.getByLabelText('Tipo di locale'), 'bar')
  await user.type(screen.getByLabelText('Indirizzo'), 'Via Roma 1')
  await user.type(screen.getByLabelText('CAP'), '80035')
  await user.type(screen.getByLabelText('Città'), 'Nola')
  await user.type(screen.getByLabelText('Provincia'), 'na')
  await user.type(screen.getByLabelText('Telefono del locale'), '081 1234567')
  await avanti(user)
}

// Lunedì chiuso, gli altri giorni dalle 18 alle 2 di notte.
async function passoOrari(user) {
  await user.click(chiuso('Lunedì'))
  for (const g of GIORNI.slice(1)) {
    fireEvent.change(apertura(g), { target: { value: '18:00' } })
    fireEvent.change(chiusura(g), { target: { value: '02:00' } })
  }
  await avanti(user)
}

async function passoFatturazione(user) {
  await user.type(screen.getByLabelText('Ragione sociale'), 'Bar Mario srl')
  await user.type(screen.getByLabelText('Partita IVA'), '01234567897')
  await user.type(screen.getByLabelText('PEC'), 'bar@pec.it')
  await avanti(user)
}

async function passoReferente(user) {
  await user.type(screen.getByLabelText('Nome'), 'Mario')
  await user.type(screen.getByLabelText('Cognome'), 'Rossi')
  await user.click(screen.getByLabelText(/accetto i/))
  await user.click(screen.getByLabelText(/informativa sulla privacy/))
}

describe('gli orari di servizio alla registrazione', () => {
  it('dopo il locale c’è il passo degli orari, un giorno per riga, e dice la regola dei 7 giorni', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    expect(screen.getByRole('group', { name: /Orari di servizio/i })).toBeInTheDocument()
    for (const g of GIORNI) {
      expect(apertura(g)).toBeInTheDocument()
      expect(chiusura(g)).toBeInTheDocument()
      expect(chiuso(g)).toBeInTheDocument()
    }
    expect(screen.getByText(/7 giorni/)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Passi della registrazione' })).toHaveTextContent(/Il locale.*Orari.*Fatturazione/)
  })

  it('senza orari non si va avanti, e l’errore sta sul giorno', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await avanti(user)
    expect(apertura('Martedì')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByLabelText('Ragione sociale')).toBeNull()
  })

  it('tutti i giorni chiusi non va: almeno un giorno aperto', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    for (const g of GIORNI) await user.click(chiuso(g))
    await avanti(user)
    expect(screen.getByText(/almeno un giorno/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Ragione sociale')).toBeNull()
  })

  it('con gli orari giusti si va avanti, e l’account nasce con gli orari, anche oltre la mezzanotte', async () => {
    const user = userEvent.setup()
    db.registra.mockResolvedValue({ slug: 'bar-mario' })
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await passoOrari(user)
    await passoFatturazione(user)
    await passoReferente(user)
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(db.registra).toHaveBeenCalledWith(
      expect.objectContaining({
        orari: expect.objectContaining({
          lun: expect.objectContaining({ chiuso: true }),
          mar: expect.objectContaining({ apre: '18:00', chiude: '02:00' }),
          dom: expect.objectContaining({ apre: '18:00', chiude: '02:00' }),
        }),
      })
    )
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it('anche chi entra con Google e completa la registrazione dà gli orari', async () => {
    const user = userEvent.setup()
    mostra(<Registrati completa={{ email: 'mario@example.it' }} />)
    await passoLocale(user)
    await passoOrari(user)
    await passoFatturazione(user)
    await passoReferente(user)
    await user.click(screen.getByRole('button', { name: /Salva i dati del locale/ }))
    expect(db.completaRegistrazione).toHaveBeenCalledWith(expect.objectContaining({ orari: expect.objectContaining({ mer: expect.objectContaining({ apre: '18:00', chiude: '02:00' }) }) }))
  })
})
