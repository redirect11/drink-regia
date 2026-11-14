// @vitest-environment happy-dom
// I COLLABORATORI DI UN LOCALE (REQ-FLOTTA-098, REQ-FLOTTA-099): il riquadro
// che il titolare ha nella sua area (/dashboard/collaboratori) e l'admin
// nella scheda del locale, e quello che vede il collaboratore quando entra.
// Daniele, 14/11/2026: «implementa 1 e 2» (l'invito del titolare e il
// collegamento dal backoffice). Dati inventati: nessuna persona reale.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ elenco: [], vista: null }))
const db = vi.hoisted(() => ({
  gestisciCollaboratori: vi.fn(async (azione) => (azione === 'elenco' ? { collaboratori: stato.elenco, massimo: 5 } : { ok: true })),
  vistaCollaboratore: vi.fn(async () => stato.vista),
  apriLaTuaApp: vi.fn(async () => ({ url: 'about:blank#app' })),
  osservaCliente: vi.fn((uid, cb) => {
    cb(null)
    return () => {}
  }),
  osservaMiaIstanza: vi.fn(() => () => {}),
  osservaMiaRichiesta: vi.fn(() => () => {}),
  statoMiaApp: vi.fn(async () => ({ app: 'nessuna' })),
}))
vi.mock('../src/lib/db.js', () => db)

import Collaboratori from '../src/pages/Collaboratori.jsx'
import DashboardCollaboratore from '../src/pages/DashboardCollaboratore.jsx'
import Dashboard from '../src/pages/Dashboard.jsx'

const LUCA = { uid: 'col-1', email: 'luca@example.it', aggiunto_il: '2026-11-14T09:00:00.000Z', aggiunto_da: 'titolare' }

beforeEach(() => {
  vi.clearAllMocks()
  // Un test che cambia la risposta (il rifiuto) non la lascia ai successivi.
  db.gestisciCollaboratori.mockImplementation(async (azione) => (azione === 'elenco' ? { collaboratori: stato.elenco, massimo: 5 } : { ok: true }))
  stato.elenco = []
  stato.vista = null
})

describe('«Collaboratori», per il titolare (REQ-FLOTTA-098)', () => {
  it('dice cosa può fare un collaboratore e cosa resta del titolare', async () => {
    render(<Collaboratori />)
    const r = screen.getByRole('region', { name: 'Collaboratori' })
    expect(await within(r).findByText('Nessun collaboratore.')).toBeInTheDocument()
    expect(r).toHaveTextContent(/apre l’app/)
    expect(r).toHaveTextContent(/abbonamento/i)
    // Per aprire l'app serve il suo account admin nel gestionale, con la stessa email.
    expect(r).toHaveTextContent(/stessa email/)
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('elenco', {})
  })

  it('aggiunge per email e spiega come si entra', async () => {
    const user = userEvent.setup()
    render(<Collaboratori />)
    const modulo = await screen.findByRole('form', { name: 'Aggiungi un collaboratore' })
    await user.type(within(modulo).getByLabelText('Email del collaboratore'), 'luca@example.it')
    stato.elenco = [LUCA]
    await user.click(within(modulo).getByRole('button', { name: 'Aggiungi' }))
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('aggiungi', { email: 'luca@example.it' })
    expect(await screen.findByRole('status')).toHaveTextContent(/Password dimenticata/)
    expect(await screen.findByText('luca@example.it')).toBeInTheDocument()
    expect(within(modulo).getByLabelText('Email del collaboratore')).toHaveValue('')
  })

  it('un rifiuto della regia si legge così com’è', async () => {
    const user = userEvent.setup()
    db.gestisciCollaboratori.mockImplementation(async (azione) => {
      if (azione === 'aggiungi') throw new Error('Questo account è già titolare di un locale.')
      return { collaboratori: [], massimo: 5 }
    })
    render(<Collaboratori />)
    const modulo = await screen.findByRole('form', { name: 'Aggiungi un collaboratore' })
    await user.type(within(modulo).getByLabelText('Email del collaboratore'), 'altro@example.it')
    await user.click(within(modulo).getByRole('button', { name: 'Aggiungi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Questo account è già titolare di un locale.')
  })

  it('toglie un collaboratore dopo la conferma', async () => {
    const user = userEvent.setup()
    stato.elenco = [LUCA]
    const conferma = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<Collaboratori />)
    const togli = await screen.findByRole('button', { name: 'Togli luca@example.it' })
    await user.click(togli)
    expect(db.gestisciCollaboratori).not.toHaveBeenCalledWith('togli', expect.anything())
    stato.elenco = []
    await user.click(togli)
    expect(conferma).toHaveBeenCalledTimes(2)
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('togli', { uid: 'col-1' })
    expect(await screen.findByText('Nessun collaboratore.')).toBeInTheDocument()
  })

  it('arrivato al massimo, il modulo lo dice e non aggiunge', async () => {
    stato.elenco = Array.from({ length: 5 }, (_, i) => ({ ...LUCA, uid: `c${i}`, email: `c${i}@example.it` }))
    render(<Collaboratori />)
    const modulo = await screen.findByRole('form', { name: 'Aggiungi un collaboratore' })
    expect(within(modulo).getByRole('button', { name: 'Aggiungi' })).toBeDisabled()
    expect(modulo).toHaveTextContent(/al massimo 5/i)
  })
})

describe('«Collaboratori», per l’admin (REQ-FLOTTA-099)', () => {
  it('lavora sul locale della scheda: lo slug va in ogni chiamata', async () => {
    const user = userEvent.setup()
    stato.elenco = [LUCA]
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Collaboratori slug="bar-mario" />)
    expect(await screen.findByText('luca@example.it')).toBeInTheDocument()
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('elenco', { slug: 'bar-mario' })
    await user.type(screen.getByLabelText('Email del collaboratore'), 'anna@example.it')
    await user.click(screen.getByRole('button', { name: 'Aggiungi' }))
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('aggiungi', { slug: 'bar-mario', email: 'anna@example.it' })
    await user.click(await screen.findByRole('button', { name: 'Togli luca@example.it' }))
    expect(db.gestisciCollaboratori).toHaveBeenCalledWith('togli', { slug: 'bar-mario', uid: 'col-1' })
    // Chi l'ha aggiunto si vede.
    expect(screen.getByText(/dal titolare/)).toBeInTheDocument()
  })

  it('un elenco che non si legge lo dice', async () => {
    db.gestisciCollaboratori.mockRejectedValueOnce(new Error('Errore di rete.'))
    render(<Collaboratori slug="bar-mario" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore di rete.')
  })
})

describe('il collaboratore, quando entra (REQ-FLOTTA-098)', () => {
  const VISTA = { membro: true, slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'completo', moduli: [], terminali: 2, app: { stato: 'attiva', url: 'https://bar-mario.example.it', versione: 'v1.10.43' } }

  it('vede il locale, il piano e l’app, e che il resto lo gestisce il titolare', async () => {
    stato.vista = VISTA
    render(<DashboardCollaboratore />)
    expect(await screen.findByRole('heading', { name: 'Bar Mario' })).toBeInTheDocument()
    expect(screen.getByText(/Collabori con questo locale/)).toBeInTheDocument()
    expect(screen.getByText(/titolare/)).toBeInTheDocument()
    expect(screen.getByText(/Completo/)).toBeInTheDocument()
    expect(screen.getByText(/v1\.10\.43/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://bar-mario.example.it' })).toHaveAttribute('href', 'https://bar-mario.example.it')
    // Niente di quello che tocca l'abbonamento.
    expect(screen.queryByText(/Gestisci l’abbonamento|Chiudi il locale|Cambia piano/)).toBeNull()
  })

  it('«Apri l’app» passa all’app col suo account; un rifiuto si legge', async () => {
    const user = userEvent.setup()
    stato.vista = VISTA
    db.apriLaTuaApp.mockRejectedValueOnce(new Error('Nel locale il tuo account non è admin.'))
    render(<DashboardCollaboratore />)
    await user.click(await screen.findByRole('button', { name: 'Apri l’app' }))
    expect(db.apriLaTuaApp).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('Nel locale il tuo account non è admin.')
  })

  it('senza app attiva niente tasto e niente indirizzo', async () => {
    stato.vista = { ...VISTA, app: { stato: 'sospesa', url: null, versione: null } }
    render(<DashboardCollaboratore />)
    expect(await screen.findByRole('heading', { name: 'Bar Mario' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apri l’app' })).toBeNull()
    expect(screen.getByText(/non è attiva/)).toBeInTheDocument()
  })

  it('tolto dal titolare, lo dice', async () => {
    stato.vista = { membro: false }
    render(<DashboardCollaboratore />)
    expect(await screen.findByText(/Non collabori più con nessun locale/)).toBeInTheDocument()
  })

  it('la regia che non risponde lo dice', async () => {
    db.vistaCollaboratore.mockRejectedValueOnce(new Error('Errore di rete.'))
    render(<DashboardCollaboratore />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Errore di rete.')
  })

  it('la dashboard di un account col segno di collaboratore è la sua vista, anche col sito chiuso', async () => {
    stato.vista = VISTA
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard/*" element={<Dashboard utente={{ uid: 'col-1', email: 'luca@example.it', collabora: 'bar-mario' }} chiuso />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByRole('heading', { name: 'Bar Mario' })).toBeInTheDocument()
    expect(screen.queryByText('Il sito apre a breve.')).toBeNull()
    await waitFor(() => expect(db.vistaCollaboratore).toHaveBeenCalled())
  })
})
