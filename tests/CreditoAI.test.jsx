// @vitest-environment happy-dom
'use strict'

// IL CREDITO AI DEL LOCALE (REQ-AI-003): nella dashboard il titolare vede
// quanto resta, lo speso del mese contro il tetto, gli ultimi consumi, e
// ricarica a pacchetti. Decisione dell'utente del 24/10/2026.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ cassetto: null, vendita: { pagamenti_online: true } }))
const db = vi.hoisted(() => ({
  osservaCassettoAI: vi.fn((slug, cb) => {
    cb(stato.cassetto)
    return () => {}
  }),
  ultimiConsumiAI: vi.fn(async () => []),
  avviaRicaricaAI: vi.fn(async () => ({ url: 'https://checkout.stripe.com/c/pay/x' })),
  osservaVendita: vi.fn((cb) => {
    cb(stato.vendita)
    return () => {}
  }),
}))
vi.mock('../src/lib/db.js', () => db)

import CreditoAI from '../src/pages/CreditoAI.jsx'
import { meseDi, euroCent, statoCredito, PACCHETTI_AI } from '../src/lib/ai.js'

beforeEach(() => {
  vi.clearAllMocks()
  stato.cassetto = null
  stato.vendita = { pagamenti_online: true }
})

describe('il credito AI nella dashboard', () => {
  it('senza istanza attiva e senza cassetto non si mostra', () => {
    const { container } = render(<CreditoAI slug="bar-mario" istanzaAttiva={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('con l’istanza attiva e senza cassetto invita alla prima ricarica, coi pacchetti del listino', () => {
    render(<CreditoAI slug="bar-mario" istanzaAttiva />)
    expect(screen.getByTestId('credito-ai')).toHaveTextContent(/prima ricarica/)
    for (const p of PACCHETTI_AI) expect(screen.getByRole('button', { name: `Ricarica ${euroCent(p.importo)}` })).toBeInTheDocument()
  })

  it('dice credito, speso del mese e tetto, e gli ultimi consumi', async () => {
    stato.cassetto = {
      credito_microeuro: 7_250_000,
      mese: meseDi(),
      speso_mese_microeuro: 2_000_000,
      tetto_mensile_microeuro: 20_000_000,
      chiave_creata_il: '2026-10-24',
    }
    db.ultimiConsumiAI.mockResolvedValue([
      { il: '2026-10-24T10:00:00Z', tipo: 'fattura', esito: 'ok', costo_microeuro: 48_000 },
      { il: '2026-10-24T09:00:00Z', tipo: 'descrizione', esito: 'ok', costo_microeuro: 3_100 },
    ])
    render(<CreditoAI slug="bar-mario" istanzaAttiva />)
    expect(screen.getByTestId('credito-ai')).toHaveTextContent('7,25 €')
    expect(screen.getByRole('region', { name: 'Credito AI' })).toHaveTextContent('questo mese 2,00 € su un tetto di 20,00 €')
    const tabella = await screen.findByRole('table', { name: 'Ultimi consumi AI' })
    expect(within(tabella).getByText('Lettura di una fattura')).toBeInTheDocument()
    expect(within(tabella).getByText('0,05 €')).toBeInTheDocument()
    // Una descrizione costa meno di un centesimo: lo si dice, non «0,00 €».
    expect(within(tabella).getByText('meno di 0,01 €')).toBeInTheDocument()
  })

  it('a credito finito dice che si ferma solo l’AI', () => {
    stato.cassetto = { credito_microeuro: 0, mese: meseDi(), chiave_creata_il: 'x' }
    render(<CreditoAI slug="bar-mario" istanzaAttiva />)
    expect(screen.getByText(/Credito esaurito: le funzioni AI sono ferme/)).toBeInTheDocument()
    expect(screen.getByText(/il resto dell’app lavora come sempre/)).toBeInTheDocument()
  })

  it('una ricarica apre il Checkout di Stripe', async () => {
    const user = userEvent.setup()
    const vai = vi.fn()
    stato.cassetto = { credito_microeuro: 0, mese: meseDi() }
    render(<CreditoAI slug="bar-mario" istanzaAttiva vai={vai} />)
    await user.click(screen.getByRole('button', { name: `Ricarica ${euroCent(PACCHETTI_AI[0].importo)}` }))
    expect(db.avviaRicaricaAI).toHaveBeenCalledWith(PACCHETTI_AI[0].id)
    expect(vai).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/x')
  })

  it('un’installazione interna non ha i pacchetti: il credito lo ricarica la regia', () => {
    stato.cassetto = { credito_microeuro: 5_000_000, mese: meseDi(), interna: true }
    render(<CreditoAI slug="tana-drink" istanzaAttiva />)
    expect(screen.getByText(/Installazione interna/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ricarica/ })).toBeNull()
  })
})

describe('i conti in euro', () => {
  it('centesimi con la virgola, migliaia col punto, e lo speso del mese scorso non conta', () => {
    expect(euroCent(1234.5)).toBe('1.234,50 €')
    expect(euroCent(0)).toBe('0,00 €')
    expect(statoCredito({ credito_microeuro: 1_000_000, mese: '2000-01', speso_mese_microeuro: 9_000_000 }).spesoMese).toBe(0)
    expect(statoCredito(null)).toBeNull()
  })
})

// REQ-FLOTTA-017: anche la ricarica passa da Stripe; coi pagamenti spenti
// non si mostra, e la fa l'admin.
describe('il credito AI coi pagamenti online spenti', () => {
  it('niente tasti di ricarica: si scrive, e ricarica l’admin', async () => {
    stato.vendita = {}
    stato.cassetto = { credito: 500, tetto: 2000, attivo: true, speso_mese: {} }
    render(<CreditoAI slug="bar-mario" istanzaAttiva />)
    expect(await screen.findByTestId('ricarica-a-mano')).toHaveTextContent('I pagamenti online non sono ancora attivi')
    expect(screen.queryByRole('button', { name: /Ricarica/ })).not.toBeInTheDocument()
  })
})
