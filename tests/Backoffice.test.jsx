// @vitest-environment happy-dom
'use strict'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato,
// progetto e versione; quello che chiede attenzione sta in cima; da qui si
// rilancia un'attivazione fallita e si segna un piano a mano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  elencoClienti: vi.fn(),
  elencoIstanze: vi.fn(),
  elencoRichieste: vi.fn(),
  segnaPiano: vi.fn(async () => {}),
  rilanciaAttivazione: vi.fn(async () => {}),
  impostaStatoIstanza: vi.fn(async () => {}),
  aggiornaIstanza: vi.fn(async () => {}),
}))
vi.mock('../src/lib/db.js', () => db)

import Backoffice from '../src/pages/Backoffice.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = () =>
  render(
    <MemoryRouter future={FUTURO}>
      <Backoffice />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  db.elencoClienti.mockResolvedValue([
    { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01' },
    { uid: 'b', slug: 'bar-rotto', nome_locale: 'Bar Rotto', email: 'b@x.it', piano: 'base', creato_il: '2026-10-02' },
    { uid: 'c', slug: 'bar-nuovo', nome_locale: 'Bar Nuovo', email: 'c@x.it', creato_il: '2026-10-03' },
  ])
  db.elencoIstanze.mockResolvedValue({
    'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0' },
    'bar-rotto': { stato: 'errore', errore: 'quota progetti' },
  })
  db.elencoRichieste.mockResolvedValue({})
})

describe('il backoffice', () => {
  it('elenca i clienti, prima chi ha un problema', async () => {
    mostra()
    const righe = await screen.findAllByRole('row')
    const nomi = righe.slice(1).map((r) => within(r).getByRole('cell', { name: /Bar/ }).textContent)
    expect(nomi[0]).toMatch(/Bar Rotto/)
    expect(nomi[2]).toMatch(/Bar Attivo/)
    const attivo = righe.find((r) => r.textContent.includes('Bar Attivo'))
    expect(attivo).toHaveTextContent('Completo · 69 €')
    expect(attivo).toHaveTextContent('drinkpos-bar-attivo')
    expect(attivo).toHaveTextContent('v1.10.0')
  })

  it('un’attivazione fallita si rilancia', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(await screen.findByRole('button', { name: 'Rilancia' }))
    expect(db.rilanciaAttivazione).toHaveBeenCalledWith('bar-rotto')
  })

  // REQ-FLOTTA-008: «serve un modo per eliminare/fermare l'app deployata».
  it('un’istanza attiva si sospende con un motivo', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('pagamento non ricevuto')
    mostra()
    const attivo = (await screen.findAllByRole('row')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.click(within(attivo).getByRole('button', { name: 'Sospendi' }))
    expect(db.impostaStatoIstanza).toHaveBeenCalledWith('bar-attivo', 'sospesa', 'pagamento non ricevuto')
  })

  it('una sospesa lo dice col motivo e si riattiva', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto' },
    })
    mostra()
    const sospeso = (await screen.findByText(/sospesa · pagamento non ricevuto/)).closest('tr')
    await user.click(within(sospeso).getByRole('button', { name: 'Riattiva' }))
    expect(db.impostaStatoIstanza).toHaveBeenLastCalledWith('bar-attivo', 'attiva', null)
  })

  // REQ-FLOTTA-009: l'app di base è tana-drink; un aggiornamento si porta
  // sui locali che si decide, o su tutti.
  it('«Aggiorna» porta l’ultima versione a un locale, «Aggiorna tutte» a tutti quelli attivi', async () => {
    const user = userEvent.setup()
    mostra()
    const attivo = (await screen.findAllByRole('row')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna' }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('bar-attivo')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /Aggiorna tutte/ }))
    // Solo le attive: Bar Rotto è in errore, Bar Nuovo non è mai partito.
    expect(db.aggiornaIstanza).toHaveBeenCalledTimes(2)
  })

  it('un piano si segna a mano, finché non c’è Stripe', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('base')
    mostra()
    const nuovo = (await screen.findAllByRole('row')).find((r) => r.textContent.includes('Bar Nuovo'))
    await user.click(within(nuovo).getByRole('button', { name: 'Piano a mano' }))
    expect(db.segnaPiano).toHaveBeenCalledWith('c', { piano: 'base', moduli: [], terminali: 1 })
  })
})
