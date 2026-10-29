// @vitest-environment happy-dom
'use strict'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): il prezzo del mese si aggiorna
// mentre si sceglie, e «Vai al pagamento» chiama la Function del Checkout.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ vendita: null }))
const db = vi.hoisted(() => ({
  avviaPagamento: vi.fn(),
  cambiaScelta: vi.fn(),
  scegliFree: vi.fn(async () => ({ ok: true })),
  osservaVendita: vi.fn((cb) => {
    cb(stato.vendita)
    return () => {}
  }),
}))
vi.mock('../src/lib/db.js', () => db)

import SceltaPiano from '../src/pages/SceltaPiano.jsx'
import { PIANI, MODULI, TERMINALE_IN_PIU } from '../src/lib/piani.js'
import { venditaPulita } from '../src/lib/vendita.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.vendita = venditaPulita(null)
})

describe('la scelta del piano', () => {
  it('parte dal base e il prezzo segue moduli e terminali', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${PIANI.base.prezzo} €`)
    const staff = MODULI.find((m) => m.id === 'staff')
    await user.click(screen.getByLabelText(new RegExp(staff.nome)))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${PIANI.base.prezzo + staff.prezzo} €`)
    fireEvent.change(screen.getByLabelText(/Terminali/), { target: { value: '2' } })
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${PIANI.base.prezzo + staff.prezzo + TERMINALE_IN_PIU} €`)
  })

  it('nel completo i moduli sono inclusi e non si pagano due volte', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.click(screen.getByLabelText(/Completo/))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${PIANI.completo.prezzo} €`)
    for (const m of MODULI) expect(screen.getByLabelText(new RegExp(m.nome))).toBeDisabled()
  })

  it('«Vai al pagamento» chiede la sessione e ci va; un rifiuto si legge', async () => {
    const user = userEvent.setup()
    const assign = vi.fn()
    db.avviaPagamento.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' })
    render(<SceltaPiano cliente={{ uid: 'u1', moduli: ['staff'] }} vai={assign} />)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: ['staff'], terminali: 1 })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/x')
  })

  it('in modifica «Aggiorna il piano» cambia la scelta senza passare dal Checkout', async () => {
    const user = userEvent.setup()
    db.cambiaScelta.mockResolvedValueOnce({ ok: true, via: 'stripe' })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: [] }} modifica vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/Completo/))
    await user.click(screen.getByRole('button', { name: 'Aggiorna il piano' }))
    expect(db.cambiaScelta).toHaveBeenCalledWith({ piano: 'completo', moduli: [], terminali: 1 })
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Piano aggiornato/)).toBeInTheDocument()
  })

  it('un rifiuto della Function si legge, e si può riprovare', async () => {
    const user = userEvent.setup()
    db.avviaPagamento.mockRejectedValueOnce(new Error('Il pagamento online non è ancora attivo'))
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(await screen.findByText(/non è ancora attivo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vai al pagamento/ })).toBeEnabled()
  })

  // REQ-FLOTTA-015: il Free c'è solo se è in vendita, non ha moduli né
  // terminali, e si attiva senza pagamento.
  it('col Free in vendita si sceglie, e «Attiva il Free» non passa dal Checkout', async () => {
    const user = userEvent.setup()
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/^Free/))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent('0 €')
    expect(screen.queryByText('Moduli in più')).toBeNull()
    expect(screen.queryByLabelText(/Terminali/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Attiva il Free' }))
    expect(db.scegliFree).toHaveBeenCalled()
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Piano Free attivo/)).toBeInTheDocument()
  })

  it('senza vendita il Free non c’è; e non c’è nemmeno per chi cambia un abbonamento a pagamento', () => {
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
    unmount()
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base' }} modifica />)
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
  })

  it('un cliente Free che passa a pagamento parte dal Base', () => {
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'free' }} />)
    expect(screen.getByLabelText(/Base/)).toBeChecked()
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
  })

  it('un modulo fuori vendita non si mostra, ma chi lo ha già lo vede', () => {
    stato.vendita = venditaPulita({ moduli: { sumup: false } })
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.queryByLabelText(/Pagamenti con lettore SumUp/)).toBeNull()
    unmount()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: ['sumup'] }} modifica />)
    expect(screen.getByLabelText(/Pagamenti con lettore SumUp/)).toBeChecked()
  })
})
