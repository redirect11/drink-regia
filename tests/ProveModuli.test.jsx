// @vitest-environment happy-dom
'use strict'

// LE PROVE DEI MODULI NELLA DASHBOARD (REQ-FLOTTA-016): si vedono solo i
// moduli che l'admin ha reso provabili e che il titolare non ha né ha già
// provato; una prova in corso dice fino a quando dura.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ vendita: null }))
const db = vi.hoisted(() => ({
  provaModulo: vi.fn(async () => ({ ok: true })),
  osservaVendita: vi.fn((cb) => {
    cb(stato.vendita)
    return () => {}
  }),
}))
vi.mock('../src/lib/db.js', () => db)

import ProveModuli from '../src/pages/ProveModuli.jsx'

const attiva = { stato: 'attiva', licenza_stato: 'attiva' }
const cliente = { uid: 'u1', slug: 'bar-mario', piano: 'base', moduli: ['staff'] }

beforeEach(() => {
  vi.clearAllMocks()
  stato.vendita = { prove: { magazzino: 14, staff: 7, statistiche: 7 } }
})

describe('le prove nella dashboard', () => {
  it('propone i moduli provabili che non ha, e la prova parte con un clic', async () => {
    const user = userEvent.setup()
    render(<ProveModuli cliente={cliente} istanza={attiva} />)
    // Staff ce l'ha già: non si propone.
    expect(screen.queryByText('Personale e ore')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Prova gratis per 14 giorni' }))
    expect(db.provaModulo).toHaveBeenCalledWith('magazzino')
  })

  it('un modulo già provato non torna; una prova in corso dice la scadenza', () => {
    render(
      <ProveModuli
        cliente={{ ...cliente, prove_fatte: ['magazzino', 'statistiche'], prove: { magazzino: { scade_il: '2099-01-05T00:00:00Z' } } }}
        istanza={attiva}
      />
    )
    expect(screen.queryByRole('button', { name: /Prova gratis/ })).toBeNull()
    expect(screen.getByText(/è in prova fino al 5 gennaio/)).toBeInTheDocument()
  })

  // tana-drink REQ-LIC-015 (07/11/2026): gli ordini dal telefono si
  // propongono solo con il menù digitale nel piano, comprato o in prova.
  // La base manca solo nel Free: dal 07/11/2026 il menù digitale è
  // compreso nel Base e nel Completo.
  it('un modulo senza la sua base non si propone; con la base in prova sì', () => {
    stato.vendita = { prove: { ordini_cliente: 7, menu_tavoli: 7 } }
    const free = { ...cliente, piano: 'free', moduli: [] }
    const { rerender } = render(<ProveModuli cliente={free} istanza={attiva} />)
    expect(screen.queryByText('Ordini dal telefono del cliente')).toBeNull()
    expect(screen.getByText('Menù digitale e tavoli')).toBeInTheDocument()
    rerender(<ProveModuli cliente={{ ...free, prove: { menu_tavoli: { scade_il: '2099-01-05T00:00:00Z' } } }} istanza={attiva} />)
    expect(screen.getByText('Ordini dal telefono del cliente')).toBeInTheDocument()
    // Nel Base il menù c'è già: gli ordini si propongono, il menù no.
    rerender(<ProveModuli cliente={cliente} istanza={attiva} />)
    expect(screen.getByText('Ordini dal telefono del cliente')).toBeInTheDocument()
    expect(screen.queryByText('Menù digitale e tavoli')).toBeNull()
  })

  it('senza prove decise dall’admin, o col locale non attivo, niente sezione', () => {
    stato.vendita = null
    const { container, rerender } = render(<ProveModuli cliente={cliente} istanza={attiva} />)
    expect(container).toBeEmptyDOMElement()
    stato.vendita = { prove: { magazzino: 14 } }
    rerender(<ProveModuli cliente={cliente} istanza={{ ...attiva, licenza_stato: 'sospesa' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un rifiuto del server si legge', async () => {
    const user = userEvent.setup()
    db.provaModulo.mockRejectedValueOnce(new Error('Magazzino e fornitori l’hai già provato'))
    render(<ProveModuli cliente={cliente} istanza={attiva} />)
    await user.click(screen.getByRole('button', { name: 'Prova gratis per 14 giorni' }))
    expect(await screen.findByText(/già provato/)).toBeInTheDocument()
  })
})
