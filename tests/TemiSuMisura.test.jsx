// @vitest-environment happy-dom
'use strict'

// I TEMI SU MISURA NELLA DASHBOARD (REQ-FLOTTA-040). L'utente, 06/11/2026:
// un servizio premium col mockup di un tema fatto con Canva e il credito
// AI, e i temi fatti da noi su richiesta; e la scelta della struttura del
// menù. Qui il titolare vede i suoi temi, carica il mockup, chiede un tema.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ temi: [], cassetto: null }))
const db = vi.hoisted(() => ({
  osservaTemiSuMisura: vi.fn((uid, cb) => {
    cb(stato.temi)
    return () => {}
  }),
  osservaCassettoAI: vi.fn((slug, cb) => {
    cb(stato.cassetto)
    return () => {}
  }),
  creaTemaDaMockup: vi.fn(async () => ({ ok: true, tema: { id: 'su-misura-9', nome: 'Bosco' }, costo_eur: 0.0312, credito_eur: 9.9688 })),
  gestisciTemiSuMisura: vi.fn(async () => ({ ok: true })),
  chiediTemaSuMisura: vi.fn(async () => ({ ok: true })),
  // L'anteprima viene dal catalogo dei temi, che importa anche queste.
  elencoTemi: vi.fn(),
  gestisciTemi: vi.fn(),
  elencoStili: vi.fn(),
  gestisciStili: vi.fn(),
}))
vi.mock('../src/lib/db.js', () => db)

import TemiSuMisura from '../src/pages/TemiSuMisura.jsx'

const bosco = { id: 'su-misura-1', nome: 'Bosco', descrizione: 'Verde e oro.', stato: 'pubblicato', origine: 'mockup', tavolozza: { base: 'tana-scuro', colori: { '--accent': '#d4af37' } }, stile: 'deco', ricetta: { versione: 1, impaginazione: 'per-categoria' }, da_verificare: ['Il carattere del mockup non c’è.'] }
const aurora = { id: 'aurora', nome: 'Aurora', descrizione: '', stato: 'ritirato', origine: 'fornitore', tavolozza: { base: 'crema', colori: {} }, stile: 'riviera' }

beforeEach(() => {
  vi.clearAllMocks()
  stato.temi = []
  stato.cassetto = { attivo: true, credito_microeuro: 10_000_000, mese: '2026-11', speso_mese_microeuro: 0 }
})

describe('i temi su misura nella dashboard', () => {
  it('elenca i temi del locale con l’anteprima, l’origine, la struttura e le note; si toglie e si rimette', async () => {
    const user = userEvent.setup()
    stato.temi = [bosco, aurora]
    render(<TemiSuMisura uid="u1" slug="bar-mario" />)
    expect(db.osservaTemiSuMisura).toHaveBeenCalledWith('u1', expect.any(Function))
    const b = screen.getByTestId('su-misura-su-misura-1')
    expect(b).toHaveTextContent('dal tuo mockup · Una pagina per categoria')
    expect(b).toHaveTextContent('Il carattere del mockup non c’è.')
    expect(within(b).getByTestId('assaggio')).toHaveTextContent('Bosco · stile Deco')
    const a = screen.getByTestId('su-misura-aurora')
    expect(a).toHaveTextContent('dal fornitore · stile Riviera · tolto dalla licenza')
    await user.click(within(b).getByRole('button', { name: 'Rimuovi' }))
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('ritira', { id: 'su-misura-1' })
    await user.click(within(a).getByRole('button', { name: 'Rimetti' }))
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('pubblica', { id: 'aurora' })
  })

  it('dal mockup: il file in base64 col suo tipo, la struttura e le note; poi dice costo e credito', async () => {
    const user = userEvent.setup()
    render(<TemiSuMisura uid="u1" slug="bar-mario" />)
    const modulo = screen.getByRole('form', { name: 'Un tema dal tuo mockup' })
    const tasto = within(modulo).getByRole('button', { name: 'Crea il tema col credito AI' })
    expect(tasto).toBeDisabled()
    await user.upload(within(modulo).getByLabelText('Il mockup'), new File(['ciao'], 'menu.png', { type: 'image/png' }))
    await user.selectOptions(within(modulo).getByLabelText('Struttura del menù'), 'per-macro-categoria')
    await user.type(within(modulo).getByLabelText('Note (facoltative)'), 'prezzi coi puntini')
    expect(tasto).toBeEnabled()
    await user.click(tasto)
    await waitFor(() => expect(db.creaTemaDaMockup).toHaveBeenCalledWith({ file: btoa('ciao'), media_type: 'image/png', struttura: 'per-macro-categoria', note: 'prezzi coi puntini' }))
    expect(await screen.findByText(/Tema «Bosco» pronto/)).toHaveTextContent('Costo 0,03 €, credito rimasto 9,97 €')
  })

  it('senza credito lo dice; un file troppo grande ferma il tasto; se la regia rifiuta, l’errore si legge', async () => {
    const user = userEvent.setup()
    stato.cassetto = null
    render(<TemiSuMisura uid="u1" slug="bar-mario" />)
    const modulo = screen.getByRole('form', { name: 'Un tema dal tuo mockup' })
    expect(modulo).toHaveTextContent('Serve il credito AI')
    const grande = new File(['x'], 'grande.png', { type: 'image/png' })
    Object.defineProperty(grande, 'size', { value: 6 * 1024 * 1024 })
    await user.upload(within(modulo).getByLabelText('Il mockup'), grande)
    expect(modulo).toHaveTextContent('Il file è troppo grande')
    expect(within(modulo).getByRole('button', { name: 'Crea il tema col credito AI' })).toBeDisabled()
    db.creaTemaDaMockup.mockRejectedValueOnce(new Error('Credito AI esaurito: si ricarica dal sito.'))
    await user.upload(within(modulo).getByLabelText('Il mockup'), new File(['ok'], 'menu.png', { type: 'image/png' }))
    await user.click(within(modulo).getByRole('button', { name: 'Crea il tema col credito AI' }))
    expect(await screen.findByText('Credito AI esaurito: si ricarica dal sito.')).toBeInTheDocument()
  })

  it('dal fornitore: il racconto, la struttura e un riferimento; poi dice che scriviamo noi', async () => {
    const user = userEvent.setup()
    render(<TemiSuMisura uid="u1" slug="bar-mario" />)
    const modulo = screen.getByRole('form', { name: 'Un tema dal fornitore' })
    await user.type(within(modulo).getByLabelText('Com’è il tema'), 'Verde bosco, caratteri serif')
    await user.selectOptions(within(modulo).getByLabelText('Struttura del menù'), 'per-categoria')
    await user.type(within(modulo).getByLabelText('Un riferimento (facoltativo)'), 'https://canva.com/x')
    await user.click(within(modulo).getByRole('button', { name: 'Chiedi il tema' }))
    expect(db.chiediTemaSuMisura).toHaveBeenCalledWith({ descrizione: 'Verde bosco, caratteri serif', struttura: 'per-categoria', riferimento: 'https://canva.com/x' })
    expect(await screen.findByText(/Richiesta inviata/)).toBeInTheDocument()
  })
})
