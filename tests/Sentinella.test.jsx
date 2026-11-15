// @vitest-environment happy-dom
'use strict'

// LA SENTINELLA NEL BACKOFFICE (REQ-FLOTTA-111). Daniele, 14/11/2026, sul
// canale degli avvisi: «Solo nel backoffice». In cima alla sezione
// «Salute»: gli allarmi aperti (il più grave prima), quando la sentinella
// ha fatto l'ultimo giro e quali controlli non sono riusciti, gli allarmi
// chiusi degli ultimi 7 giorni, le soglie; e il contatore nel sotto-menù.
// I conti li fa functions/lib/sentinella.js (tests/sentinella.test.js).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  elencoAllarmi: vi.fn(),
  statoSentinella: vi.fn(),
  leggiSoglieSentinella: vi.fn(),
  salvaSoglieSentinella: vi.fn(),
  giroSentinella: vi.fn(),
}))
vi.mock('../src/lib/db.js', () => db)

import Sentinella from '../src/pages/Sentinella.jsx'
import { contiDelBackoffice } from '../src/lib/backoffice.js'

const ADESSO = new Date('2026-11-15T10:00:00.000Z')

const allarmi = [
  { id: 'errori--presentazione', chiave: 'errori--presentazione', controllo: 'errori', livello: 'attenzione', titolo: 'La Function presentazione sbaglia', dettaglio: '4 errori dalle 09:45', slug: null, aperto: true, aperto_il: '2026-11-15T09:45:00.000Z', visto_il: '2026-11-15T10:00:00.000Z', volte: 1 },
  { id: 'sito--prova-bar', chiave: 'sito--prova-bar', controllo: 'siti', livello: 'problema', titolo: 'Il sito di prova-bar non risponde', dettaglio: 'HTTP 503', slug: 'prova-bar', aperto: true, aperto_il: '2026-11-15T09:30:00.000Z', visto_il: '2026-11-15T10:00:00.000Z', volte: 3 },
  { id: 'permessi--prova-due', chiave: 'permessi--prova-due', controllo: 'permessi', livello: 'problema', titolo: 'Alla regia mancano dei permessi su prova-due', dettaglio: 'manca roles/datastore.user', slug: 'prova-due', aperto: false, aperto_il: '2026-11-13T09:00:00.000Z', chiuso_il: '2026-11-13T11:00:00.000Z', volte: 1 },
  { id: 'sito--vecchio', chiave: 'sito--vecchio', controllo: 'siti', livello: 'problema', titolo: 'Il sito di vecchio non rispondeva', dettaglio: 'HTTP 500', slug: 'vecchio', aperto: false, aperto_il: '2026-11-01T09:00:00.000Z', chiuso_il: '2026-11-01T10:00:00.000Z', volte: 1 },
]
const stato = {
  ultimo_giro_il: '2026-11-15T09:58:00.000Z',
  durata_ms: 4200,
  controlli: {
    siti: { ok: true, il: '2026-11-15T09:58:00.000Z' },
    errori: { ok: false, il: '2026-11-15T09:58:00.000Z', perche: 'manca roles/logging.viewer all’account della regia' },
    presentazioni: { ok: true, il: '2026-11-15T09:58:00.000Z' },
  },
}

beforeEach(() => {
  vi.useFakeTimers({ now: ADESSO, toFake: ['Date'] })
  Object.values(db).forEach((f) => f.mockReset())
  db.elencoAllarmi.mockResolvedValue(allarmi)
  db.statoSentinella.mockResolvedValue(stato)
  db.leggiSoglieSentinella.mockResolvedValue({ errori: 3, presentazione_ore: 48, sito_secondi: 10 })
  db.salvaSoglieSentinella.mockResolvedValue(undefined)
  db.giroSentinella.mockResolvedValue(stato)
})

describe('la sentinella nella sezione «Salute»', () => {
  it('gli allarmi aperti, il più grave prima, con da quando e quante volte è tornato', async () => {
    render(<Sentinella />)
    const aperti = await screen.findByRole('list', { name: 'Allarmi aperti' })
    const voci = within(aperti).getAllByRole('listitem')
    expect(voci).toHaveLength(2)
    expect(voci[0]).toHaveTextContent('Il sito di prova-bar non risponde')
    expect(voci[0]).toHaveTextContent('HTTP 503')
    expect(voci[0]).toHaveTextContent('Problema')
    expect(voci[0]).toHaveTextContent('3 volte')
    expect(voci[1]).toHaveTextContent('La Function presentazione sbaglia')
    expect(voci[1]).toHaveTextContent('Attenzione')
  })

  it('l’ultimo giro e i controlli che non sono riusciti, col perché', async () => {
    render(<Sentinella />)
    expect(await screen.findByText(/Ultimo giro/)).toHaveTextContent('2 min fa')
    expect(screen.getByText(/errori: manca roles\/logging\.viewer/)).toBeInTheDocument()
  })

  it('una sentinella ferma da più di 45 minuti si dice', async () => {
    db.statoSentinella.mockResolvedValue({ ...stato, ultimo_giro_il: '2026-11-15T08:00:00.000Z' })
    render(<Sentinella />)
    expect(await screen.findByText(/La sentinella è ferma/)).toBeInTheDocument()
  })

  it('nessun allarme aperto: lo dice; i chiusi degli ultimi 7 giorni restano da leggere', async () => {
    db.elencoAllarmi.mockResolvedValue(allarmi.filter((a) => !a.aperto))
    render(<Sentinella />)
    expect(await screen.findByText('Nessun allarme aperto.')).toBeInTheDocument()
    const chiusi = screen.getByRole('list', { name: 'Allarmi chiusi negli ultimi 7 giorni' })
    expect(within(chiusi).getAllByRole('listitem')).toHaveLength(1)
    expect(chiusi).toHaveTextContent('prova-due')
  })

  it('le soglie si leggono e si salvano come numeri', async () => {
    const utente = userEvent.setup({ advanceTimers: () => {} })
    render(<Sentinella />)
    const errori = await screen.findByLabelText(/Errori di una Function in un giro/)
    expect(errori).toHaveValue(3)
    await utente.clear(errori)
    await utente.type(errori, '5')
    await utente.click(screen.getByRole('button', { name: 'Salva le soglie' }))
    expect(db.salvaSoglieSentinella).toHaveBeenCalledWith({ errori: 5, presentazione_ore: 48, sito_secondi: 10 })
  })

  it('«Fai un giro adesso» chiama la sentinella e rilegge gli allarmi', async () => {
    const utente = userEvent.setup({ advanceTimers: () => {} })
    render(<Sentinella />)
    await screen.findByRole('list', { name: 'Allarmi aperti' })
    await utente.click(screen.getByRole('button', { name: 'Fai un giro adesso' }))
    expect(db.giroSentinella).toHaveBeenCalledTimes(1)
    expect(db.elencoAllarmi).toHaveBeenCalledTimes(2)
  })

  it('un errore va a chi mostra gli errori del backoffice', async () => {
    const onErrore = vi.fn()
    db.elencoAllarmi.mockRejectedValue(new Error('Missing or insufficient permissions.'))
    render(<Sentinella onErrore={onErrore} />)
    await vi.waitFor(() => expect(onErrore).toHaveBeenCalledWith('Missing or insufficient permissions.'))
  })
})

describe('il contatore di «Salute» nel sotto-menù', () => {
  it('conta gli allarmi aperti', () => {
    expect(contiDelBackoffice([], [], allarmi).salute).toBe(2)
    expect(contiDelBackoffice([], []).salute).toBe(0)
  })
})
