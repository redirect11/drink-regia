// @vitest-environment happy-dom
'use strict'

// LA VENDITA NELLA PRIMA PAGINA (REQ-FLOTTA-015): il Free compare fra i
// prezzi solo se l'admin lo mette in vendita, e un modulo tolto dalla
// vendita sparisce dalla tabella.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ vendita: null }))
vi.mock('../src/lib/db.js', () => ({
  osservaVendita: (cb) => {
    cb(stato.vendita)
    return () => {}
  },
}))

import Home from '../src/pages/Home.jsx'
import { venditaPulita } from '../src/lib/vendita.js'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = () =>
  render(
    <MemoryRouter future={FUTURO}>
      <Home utente={null} />
    </MemoryRouter>
  )

describe('la vendita nella prima pagina', () => {
  it('col Free in vendita c’è la sua scheda, a 0 €', () => {
    stato.vendita = venditaPulita({ free: true })
    mostra()
    expect(screen.getByRole('article', { name: 'Piano Free' })).toHaveTextContent('0 €')
  })

  it('un modulo tolto dalla vendita non compare nella tabella dei prezzi', () => {
    stato.vendita = venditaPulita({ moduli: { sumup: false } })
    mostra()
    const tabella = within(screen.getByRole('table'))
    expect(tabella.queryByText('Pagamenti con lettore SumUp')).toBeNull()
    expect(tabella.getByText('Magazzino e fornitori')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Piano Free' })).toBeNull()
  })
})
