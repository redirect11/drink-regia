// @vitest-environment happy-dom
'use strict'

// IL CATALOGO DEI TEMI NEL BACKOFFICE (REQ-FLOTTA-032): si sceglie la base
// e lo stile, si ritoccano i sette colori, si scrivono nome e descrizione;
// l'anteprima mostra la tavolozza e un assaggio; poi si pubblica o si ritira.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  elencoTemi: vi.fn(async () => []),
  gestisciTemi: vi.fn(async () => ({ ok: true })),
}))
vi.mock('../src/lib/db.js', () => db)

import CatalogoTemi from '../src/pages/CatalogoTemi.jsx'

const pubblicato = { id: 'grand-hotel-oro', nome: 'Grand Hotel oro', descrizione: 'Blu e oro.', stato: 'pubblicato', tavolozza: { base: 'notte-blu', colori: { '--accent': '#d4af37' } }, stile: 'deco' }
const bozza = { id: 'aurora', nome: 'Aurora', descrizione: '', stato: 'bozza', tavolozza: { base: 'crema', colori: {} }, stile: 'riviera' }
const onErrore = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  db.elencoTemi.mockResolvedValue([pubblicato, bozza])
})

describe('il catalogo dei temi', () => {
  it('elenca i temi con stile, base e stato; si pubblica una bozza e si ritira un pubblicato', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CatalogoTemi onErrore={onErrore} />)
    const oro = await screen.findByTestId('tema-grand-hotel-oro')
    expect(oro).toHaveTextContent('Grand Hotel oro')
    expect(oro).toHaveTextContent('Deco')
    expect(oro).toHaveTextContent('Notte blu')
    expect(oro).toHaveTextContent('Pubblicato')
    expect(within(oro).queryByRole('button', { name: 'Pubblica' })).toBeNull()
    await user.click(within(oro).getByRole('button', { name: 'Ritira' }))
    expect(db.gestisciTemi).toHaveBeenCalledWith('ritira', { id: 'grand-hotel-oro' })
    await user.click(within(screen.getByTestId('tema-aurora')).getByRole('button', { name: 'Pubblica' }))
    expect(db.gestisciTemi).toHaveBeenCalledWith('pubblica', { id: 'aurora' })
  })

  it('un tema nuovo: base, stile, un colore ritoccato, anteprima; si salva e si pubblica', async () => {
    const user = userEvent.setup()
    db.elencoTemi.mockResolvedValue([])
    render(<CatalogoTemi onErrore={onErrore} />)
    expect(await screen.findByText('Nessun tema ancora.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Nuovo tema' }))
    const modulo = screen.getByRole('form', { name: 'Nuovo tema' })
    await user.type(within(modulo).getByLabelText('Identificativo'), 'riviera-notte')
    await user.type(within(modulo).getByLabelText('Nome'), 'Riviera di notte')
    await user.type(within(modulo).getByLabelText('Descrizione'), 'La Riviera sul blu.')
    await user.selectOptions(within(modulo).getByLabelText('Base della tavolozza'), 'notte-blu')
    await user.selectOptions(within(modulo).getByLabelText('Stile del menù'), 'riviera')
    // L'esclusivo della Tana non c'è fra gli stili.
    expect(within(within(modulo).getByLabelText('Stile del menù')).queryByRole('option', { name: /Notte/ })).toBeNull()
    const accento = within(modulo).getByLabelText('Colore accento')
    expect(accento).toHaveValue('#3b82f6')
    // Un input color si cambia con un evento: si scrive il valore.
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(accento, { target: { value: '#d4af37' } })
    expect(within(modulo).getByRole('button', { name: 'Come la base' })).toBeInTheDocument()
    const assaggio = within(modulo).getByTestId('assaggio')
    expect(assaggio).toHaveTextContent('Negroni · 9,00 €')
    expect(assaggio).toHaveTextContent('Riviera di notte · stile Riviera')
    await user.click(within(modulo).getByRole('button', { name: 'Salva e pubblica' }))
    expect(db.gestisciTemi).toHaveBeenNthCalledWith(1, 'salva', {
      tema: { id: 'riviera-notte', nome: 'Riviera di notte', descrizione: 'La Riviera sul blu.', tavolozza: { base: 'notte-blu', colori: { '--accent': '#d4af37' } }, stile: 'riviera' },
      nuovo: true,
    })
    expect(db.gestisciTemi).toHaveBeenNthCalledWith(2, 'pubblica', { id: 'riviera-notte' })
    expect(screen.queryByRole('form', { name: 'Nuovo tema' })).toBeNull()
  })

  it('«Come la base» toglie il ritocco; un pubblicato si modifica senza cambiare id, e lo dice', async () => {
    const user = userEvent.setup()
    render(<CatalogoTemi onErrore={onErrore} />)
    await user.click(within(await screen.findByTestId('tema-grand-hotel-oro')).getByRole('button', { name: 'Modifica' }))
    const modulo = screen.getByRole('form', { name: 'Tema Grand Hotel oro' })
    expect(within(modulo).getByLabelText('Identificativo')).toBeDisabled()
    expect(within(modulo).getByText(/il ritocco arriva subito nel catalogo/)).toBeInTheDocument()
    expect(within(modulo).queryByRole('button', { name: 'Salva e pubblica' })).toBeNull()
    await user.click(within(modulo).getByRole('button', { name: 'Come la base' }))
    expect(within(modulo).getByLabelText('Colore accento')).toHaveValue('#3b82f6')
    await user.click(within(modulo).getByRole('button', { name: 'Salva' }))
    expect(db.gestisciTemi).toHaveBeenCalledWith('salva', expect.objectContaining({ nuovo: false, tema: expect.objectContaining({ tavolozza: { base: 'notte-blu', colori: {} } }) }))
  })

  it('se la regia rifiuta, il modulo resta aperto e l’errore si dice', async () => {
    const user = userEvent.setup()
    db.gestisciTemi.mockRejectedValueOnce(new Error('Il nome ci vuole, fino a 40 caratteri.'))
    render(<CatalogoTemi onErrore={onErrore} />)
    await user.click(within(await screen.findByTestId('tema-aurora')).getByRole('button', { name: 'Modifica' }))
    await user.click(screen.getByRole('button', { name: 'Salva' }))
    expect(onErrore).toHaveBeenCalledWith('Il nome ci vuole, fino a 40 caratteri.')
    expect(screen.getByRole('form', { name: 'Tema Aurora' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Chiudi' }))
    expect(screen.queryByRole('form', { name: 'Tema Aurora' })).toBeNull()
  })

  it('un elenco che non si legge si dice', async () => {
    db.elencoTemi.mockRejectedValueOnce(new Error('permesso negato'))
    render(<CatalogoTemi onErrore={onErrore} />)
    await vi.waitFor(() => expect(onErrore).toHaveBeenCalledWith('permesso negato'))
  })
})
