// @vitest-environment happy-dom
'use strict'

// CHIUDERE E CANCELLARE IL PROPRIO LOCALE (REQ-FLOTTA-014), dalla dashboard
// del titolare: sempre a 30 giorni, confermata col nome dell'app, da
// annullare finché non parte; dopo, il titolare scarica il suo archivio.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  gestisciEliminazione: vi.fn(async () => ({ ok: true })),
  scaricaArchivio: vi.fn(async () => ({ url: 'https://storage.example/archivio.zip' })),
}))
vi.mock('../src/lib/db.js', () => db)

import ChiudiLocale from '../src/pages/ChiudiLocale.jsx'

const attiva = { stato: 'attiva', progetto: 'drinkpos-prova-bar', licenza_stato: 'attiva' }

beforeEach(() => vi.clearAllMocks())

describe('chiudere il locale dalla dashboard', () => {
  it('si conferma solo scrivendo il nome dell’app, e la cancellazione è a 30 giorni', async () => {
    const user = userEvent.setup()
    render(<ChiudiLocale istanza={attiva} />)
    await user.click(screen.getByRole('button', { name: /Chiudi e cancella il locale/ }))
    const tasto = screen.getByRole('button', { name: 'Chiudi e cancella fra 30 giorni' })
    expect(tasto).toBeDisabled()
    await user.type(screen.getByLabelText(/Per confermare scrivi/), 'prova-bar')
    expect(tasto).toBeDisabled()
    await user.clear(screen.getByLabelText(/Per confermare scrivi/))
    await user.type(screen.getByLabelText(/Per confermare scrivi/), 'drinkpos-prova-bar')
    await user.click(tasto)
    expect(db.gestisciEliminazione).toHaveBeenCalledWith('chiedi', { conferma: 'drinkpos-prova-bar' })
    // Niente «subito» per il titolare: non esiste nemmeno la scelta.
    expect(screen.queryByText(/Subito/)).toBeNull()
  })

  it('programmata dal titolare: dice quando, e si annulla', async () => {
    const user = userEvent.setup()
    render(<ChiudiLocale istanza={{ ...attiva, licenza_stato: 'chiusa', eliminazione: { stato: 'programmata', quando: '2026-11-28T10:00:00Z', richiedente: 'titolare' } }} />)
    expect(screen.getByText(/28 novembre 2026/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Annulla la cancellazione' }))
    expect(db.gestisciEliminazione).toHaveBeenCalledWith('annulla')
  })

  it('programmata dall’admin: il titolare la vede ma non la annulla', () => {
    render(<ChiudiLocale istanza={{ ...attiva, licenza_stato: 'chiusa', eliminazione: { stato: 'programmata', quando: '2026-11-28T10:00:00Z', richiedente: 'admin' } }} />)
    expect(screen.getByText(/verrà cancellato definitivamente/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Annulla la cancellazione' })).toBeNull()
  })

  it('un locale chiuso da noi, interno o esistente: niente sezione', () => {
    const { container, rerender } = render(<ChiudiLocale istanza={{ ...attiva, licenza_stato: 'chiusa' }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ChiudiLocale istanza={{ ...attiva, interna: true }} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<ChiudiLocale istanza={{ ...attiva, origine: 'esistente' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('eliminato: il titolare scarica il suo archivio finché non scade', async () => {
    const user = userEvent.setup()
    const eliminata = { stato: 'eliminata', eliminata_il: '2026-10-29T10:00:00Z', eliminazione: { stato: 'eliminata', archivio: { zip: 'a.zip' }, scade_il: '2099-01-01T00:00:00Z' } }
    render(<ChiudiLocale istanza={eliminata} />)
    await user.click(screen.getByRole('button', { name: 'Scarica i dati del locale' }))
    expect(db.scaricaArchivio).toHaveBeenCalled()
  })

  it('archivio scaduto: lo dice, senza tasto', () => {
    render(<ChiudiLocale istanza={{ stato: 'eliminata', eliminata_il: '2026-01-01T00:00:00Z', eliminazione: { stato: 'eliminata', archivio: { zip: 'a.zip' }, scade_il: '2026-02-01T00:00:00Z' } }} />)
    expect(screen.getByText(/non è più disponibile/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
