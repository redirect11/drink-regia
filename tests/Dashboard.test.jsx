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
  apriLaTuaApp: vi.fn(async () => ({ url: 'about:blank#app' })),
}))
vi.mock('../src/lib/db.js', () => ({
  ...db,
  // Senza locale la dashboard mostra Registrati (REQ-FLOTTA-038), che ha i
  // suoi test in AccessoGoogle.test.jsx: qui basta che si monti.
  esci: vi.fn(),
  completaRegistrazione: vi.fn(),
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
  // I temi su misura (REQ-FLOTTA-040) hanno i loro test in TemiSuMisura.test.jsx.
  osservaTemiSuMisura: (uid, cb) => {
    cb([])
    return () => {}
  },
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
  // Audit del 09/11/2026, finding 26 (REQ-FLOTTA-055): col sito chiuso un
  // account senza locale (entrato con Google) non completa la registrazione
  // dalla dashboard: vede l'anteprima, come da /registrati.
  it('senza locale: completa la registrazione; col sito chiuso, l’anteprima', () => {
    stato.cliente = null
    const { unmount } = mostra()
    expect(screen.getByRole('heading', { name: 'Completa la registrazione' })).toBeInTheDocument()
    expect(screen.queryByText('Il sito apre a breve.')).toBeNull()
    unmount()
    render(
      <MemoryRouter future={FUTURO}>
        <Dashboard utente={{ uid: 'u1', email: 'mario@example.it' }} chiuso />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Il sito apre a breve.')
    expect(screen.queryByRole('heading', { name: /Completa la registrazione/ })).toBeNull()
  })

  it('con un locale, col sito chiuso, la dashboard resta la sua', () => {
    render(
      <MemoryRouter future={FUTURO}>
        <Dashboard utente={{ uid: 'u1', email: 'mario@example.it' }} chiuso />
      </MemoryRouter>
    )
    expect(screen.getByText('Bar Mario')).toBeInTheDocument()
    expect(screen.queryByText('Il sito apre a breve.')).toBeNull()
  })

  // REQ-FLOTTA-030: dalla regia alla propria app senza password.
  it('con l’app attiva c’è «Apri la tua app»; se non si apre lo dice', async () => {
    const user = userEvent.setup()
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-mario', url: 'https://drinkpos-bar-mario.web.app' }
    mostra()
    await user.click(screen.getByRole('button', { name: 'Apri la tua app' }))
    expect(db.apriLaTuaApp).toHaveBeenCalledTimes(1)
    db.apriLaTuaApp.mockRejectedValueOnce(new Error('Nel locale il tuo account non è admin.'))
    await user.click(screen.getByRole('button', { name: 'Apri la tua app' }))
    expect(await screen.findByText('Nel locale il tuo account non è admin.')).toBeInTheDocument()
  })

  it('senza app attiva niente «Apri la tua app»', () => {
    mostra()
    expect(screen.queryByRole('button', { name: 'Apri la tua app' })).toBeNull()
  })

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

  // REQ-FLOTTA-039: i temi in licenza si vedono col piano, come i moduli.
  it('i temi in licenza stanno accanto al piano, col loro nome', () => {
    stato.cliente = { ...stato.cliente, temi: ['notte', 'meraviglie'] }
    mostra()
    expect(screen.getByText(/temi: Notte, Meraviglie/)).toBeInTheDocument()
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
    // 32,70 + 10 (staff); il secondo terminale è fra i 3 inclusi (DEC-0005).
    // Coi centesimi e «+ IVA», e il totale IVA inclusa accanto.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('42,70 € + IVA al mese (52,09 € IVA inclusa)')
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Non ancora attivata')
  })

  it('chi paga l’anno vede il prezzo dell’anno', () => {
    stato.cliente = { ...stato.cliente, moduli: [], terminali: 1, abbonamento: { stato: 'attivo', intervallo: 'anno' } }
    mostra()
    // 10 mensilità da 32,70 €: 327 € + IVA, 398,94 € IVA inclusa.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('327 € + IVA all’anno (398,94 € IVA inclusa)')
  })

  // REQ-FLOTTA-031: un Fondatore, finché l'offerta vale, vede il suo prezzo;
  // scaduti i 12 mesi torna il listino.
  it('un Fondatore vede 25 € finché l’offerta vale, poi il listino', () => {
    const fondatore = (fino_al) => ({ stato: 'attivo', intervallo: 'mese', fondatore: { numero: 1, dal: '2026-11-01T00:00:00Z', fino_al } })
    stato.cliente = { ...stato.cliente, moduli: [], terminali: 1, abbonamento: fondatore('2999-01-01T00:00:00Z') }
    const { unmount } = mostra()
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('25 € + IVA al mese (30,50 € IVA inclusa)')
    unmount()
    stato.cliente = { ...stato.cliente, abbonamento: fondatore('2000-01-01T00:00:00Z') }
    mostra()
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('32,70 € + IVA al mese (39,89 € IVA inclusa)')
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
