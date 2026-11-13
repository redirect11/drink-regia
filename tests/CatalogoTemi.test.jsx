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
  elencoStili: vi.fn(async () => []),
  gestisciStili: vi.fn(async () => ({ ok: true })),
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

  // Si scrivono tre campi lettera per lettera: sotto carico ci vuole più dei
  // 5 secondi di partenza (successo il 02/11/2026 con tutta la suite).
  it('un tema nuovo: base, stile, un colore ritoccato, anteprima; si salva e si pubblica', { timeout: 20000 }, async () => {
    const user = userEvent.setup()
    db.elencoTemi.mockResolvedValue([])
    render(<CatalogoTemi onErrore={onErrore} />)
    // I temi del repository ci sono sempre (REQ-FLOTTA-033): si cambiano nel file, non qui.
    const delRepository = await screen.findByTestId('tema-smeraldo')
    expect(delRepository).toHaveTextContent('dal repository')
    expect(within(delRepository).queryByRole('button', { name: 'Modifica' })).toBeNull()
    expect(within(delRepository).getByRole('button', { name: 'Ritira' })).toBeInTheDocument()
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

  // REQ-FLOTTA-066 (Daniele, 11/11/2026: «perché se nuovo tema sta sotto ai
  // temi poi apre il nuovo tema sotto a stili e ricetta?»).
  it('il modulo si apre sotto i temi, prima degli stili a ricetta; chiuso, il bottone torna lì', async () => {
    const user = userEvent.setup()
    render(<CatalogoTemi onErrore={onErrore} />)
    const prima = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    // Si aspetta che i temi del database siano arrivati: la bozza ha «Modifica».
    await screen.findByTestId('tema-aurora')
    const stili = screen.getByRole('heading', { name: 'Stili a ricetta' })
    const tabellaTemi = screen.getByRole('table', { name: 'I temi' })
    await user.click(screen.getByRole('button', { name: 'Nuovo tema' }))
    const modulo = screen.getByRole('form', { name: 'Nuovo tema' })
    expect(prima(tabellaTemi, modulo)).toBe(true)
    expect(prima(modulo, stili)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Nuovo tema' })).toBeNull()
    // Anche «Modifica» apre il modulo lì.
    await user.click(within(modulo).getByRole('button', { name: 'Chiudi' }))
    const nuovo = screen.getByRole('button', { name: 'Nuovo tema' })
    expect(prima(tabellaTemi, nuovo) && prima(nuovo, stili)).toBe(true)
    await user.click(within(tabellaTemi).getAllByRole('button', { name: 'Modifica' })[0])
    const modifica = screen.getByRole('form', { name: /^Tema / })
    expect(prima(tabellaTemi, modifica) && prima(modifica, stili)).toBe(true)
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

  // REQ-FLOTTA-034: gli stili a ricetta del repository si vedono, si scelgono
  // per un tema, e si ritirano (o si ripubblicano) da qui.
  it('gli stili a ricetta: nella scelta dello stile, nell’elenco, e si ritirano', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    db.elencoStili.mockResolvedValue([{ id: 'dattilo', nome: 'Dattilo', stato: 'ritirato', ricetta: { caratteri: {}, voce: {} } }])
    render(<CatalogoTemi onErrore={onErrore} />)
    const osteria = await screen.findByTestId('stile-osteria')
    expect(osteria).toHaveTextContent('libre-baskerville')
    expect(osteria).toHaveTextContent('riga, prezzo puntini, sfondo carta')
    await user.click(within(osteria).getByRole('button', { name: 'Ritira' }))
    expect(db.gestisciStili).toHaveBeenCalledWith('ritira', 'osteria')
    // La copia ritirata nel database vince su quella del repository.
    const dattilo = screen.getByTestId('stile-dattilo')
    expect(dattilo).toHaveTextContent('Ritirato')
    await user.click(within(dattilo).getByRole('button', { name: 'Pubblica' }))
    expect(db.gestisciStili).toHaveBeenCalledWith('pubblica', 'dattilo')
    // Un tema del repository che usa uno stile a ricetta dice il suo nome.
    expect(screen.getByTestId('tema-trattoria')).toHaveTextContent('Osteria')
    await user.click(screen.getByRole('button', { name: 'Nuovo tema' }))
    const scelta = within(screen.getByRole('form', { name: 'Nuovo tema' })).getByLabelText('Stile del menù')
    expect(within(scelta).getByRole('option', { name: 'Tiki' })).toBeInTheDocument()
    expect(within(scelta).getByRole('option', { name: 'Riviera' })).toBeInTheDocument()
  })
})
