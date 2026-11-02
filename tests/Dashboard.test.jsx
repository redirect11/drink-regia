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
vi.mock('../src/lib/db.js', () => ({
  ...db,
  avviaPagamento: vi.fn(),
  cambiaScelta: vi.fn(async () => ({ ok: true })),
  // Il credito AI (REQ-AI-003) ha i suoi test in CreditoAI.test.jsx: qui
  // basta che la dashboard non si rompa senza cassetto.
  osservaCassettoAI: (slug, cb) => {
    cb(null)
    return () => {}
  },
  ultimiConsumiAI: vi.fn(async () => []),
  avviaRicaricaAI: vi.fn(),
  // La vendita (REQ-FLOTTA-015): qui il Free è in vendita.
  // E i pagamenti online accesi (REQ-FLOTTA-017).
  osservaVendita: (cb) => {
    cb({ free: true, pagamenti_online: true, moduli: {} })
    return () => {}
  },
  osservaContatto: (uid, cb) => {
    cb(null)
    return () => {}
  },
  chiediContatto: vi.fn(),
  scegliFree: vi.fn(async () => ({ ok: true })),
  gestisciEliminazione: vi.fn(),
  scaricaArchivio: vi.fn(),
  // Gli aggiornamenti a scelta (REQ-FLOTTA-020) hanno i loro test in
  // AggiornamentiLocale.test.jsx.
  sceltaAggiornamento: vi.fn(async () => ({ ok: true })),
}))

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
    // 32,70 + 10 (staff); il secondo terminale è fra i 3 inclusi (DEC-0005).
    // Coi centesimi e «+ IVA», e il totale IVA inclusa accanto.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('42,70 € + IVA al mese (52,09 € IVA inclusa)')
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Non ancora attivata')
  })

  it('chi paga l’anno vede il prezzo dell’anno', () => {
    stato.cliente = { ...stato.cliente, moduli: [], terminali: 1, periodo: 'anno' }
    mostra()
    // 10 mensilità da 32,70 €: 327 € + IVA, 398,94 € IVA inclusa.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('327 € + IVA all’anno (398,94 € IVA inclusa)')
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

// REQ-FLOTTA-015: un cliente Free vede i limiti del suo piano, e sotto la
// scelta per passare a pagamento, col Checkout e non con «modifica».
describe('la dashboard di un cliente Free', () => {
  it('dice i limiti del Free e propone i piani a pagamento', () => {
    stato.cliente = { ...stato.cliente, piano: 'free', moduli: [], terminali: 1, abbonamento: { stato: 'attivo', origine: 'gratuito' } }
    mostra()
    expect(screen.getByTestId('limiti-piano')).toHaveTextContent('fino a 10 prodotti nel menù e 5 conti aperti insieme, solo il titolare, senza sconti')
    expect(screen.getByRole('heading', { name: 'Scegli il piano' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cambia piano o moduli' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeInTheDocument()
  })
})
