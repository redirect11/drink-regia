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
  apriPortaleAbbonamento: vi.fn(async () => ({ url: 'about:blank#portale' })),
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
  // REQ-FLOTTA-023: l'abbonamento si gestisce da soli (disdetta, carta,
  // fatture) col portale di Stripe; a mano si vede fino a quando è pagato.
  it('con Stripe c’è «Gestisci l’abbonamento», che apre il portale', async () => {
    const user = userEvent.setup()
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'attivo', origine: 'stripe', stripe_customer: 'cus_1' } }
    mostra()
    await user.click(screen.getByRole('button', { name: 'Gestisci l’abbonamento' }))
    expect(db.apriPortaleAbbonamento).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('pagato-fino-al')).toBeNull()
  })

  it('a mano dice fino a quando è pagato, e niente portale', () => {
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-30' } }
    mostra()
    expect(screen.getByTestId('pagato-fino-al')).toHaveTextContent('Pagato fino al 30 novembre 2026. Per rinnovare o disdire scrivici.')
    expect(screen.queryByRole('button', { name: 'Gestisci l’abbonamento' })).toBeNull()
  })

  it('se il portale non si apre, lo dice', async () => {
    const user = userEvent.setup()
    db.apriPortaleAbbonamento.mockRejectedValueOnce(new Error('La gestione dell’abbonamento non è disponibile al momento: scrivici.'))
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'attivo', origine: 'stripe', stripe_customer: 'cus_1' } }
    mostra()
    await user.click(screen.getByRole('button', { name: 'Gestisci l’abbonamento' }))
    expect(await screen.findByText(/non è disponibile al momento/)).toBeInTheDocument()
  })

  it('dice locale, piano col prezzo del mese e stato dell’istanza', () => {
    mostra()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bar Mario')
    expect(screen.getAllByText('Base')[0].closest('p')).toHaveTextContent('46 €') // 24 + 10 (staff) + 12 (secondo terminale)
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Non ancora attivata')
  })

  // REQ-FLOTTA-024: quello che il piano nuovo toglie arriva al taglio.
  it('dice quando arriva una riduzione del piano, e niente se non ce n’è', () => {
    stato.istanza = { stato: 'attiva', riduzione_al_taglio: { dal: '2026-11-02T04:00:00.000Z', cosa: ['il modulo staff'] } }
    const { unmount } = mostra()
    expect(screen.getByTestId('riduzione-al-taglio')).toHaveTextContent(/Dal taglio della giornata .*: il modulo staff. Fino ad allora l’app resta com’è./)
    unmount()
    stato.istanza = { stato: 'attiva', riduzione_al_taglio: null }
    mostra()
    expect(screen.queryByTestId('riduzione-al-taglio')).toBeNull()
  })

  // REQ-FLOTTA-025: i dati che stanno per essere cancellati si dicono per primi.
  it('una cancellazione programmata sta in cima, prima del nome del locale', () => {
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'non pagato' } }
    stato.istanza = {
      stato: 'attiva',
      progetto: 'drinkpos-bar-mario',
      licenza_stato: 'sospesa',
      eliminazione: { stato: 'programmata', quando: '2027-01-31T10:00:00Z', richiedente: 'conservazione' },
    }
    mostra()
    const avviso = screen.getByRole('region', { name: 'Cancellazione del locale' })
    expect(avviso).toHaveTextContent('31 gennaio 2027')
    expect(avviso.compareDocumentPosition(screen.getByRole('heading', { level: 2 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('region', { name: 'Cancellazione del locale' })).toHaveLength(1)
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
