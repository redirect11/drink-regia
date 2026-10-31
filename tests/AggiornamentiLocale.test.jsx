// @vitest-environment happy-dom
'use strict'

// GLI AGGIORNAMENTI NELLA DASHBOARD DEL TITOLARE (REQ-FLOTTA-020). L'utente,
// 31/10/2026: il titolare vede «prima il changelog con i cambiamenti» e
// sceglie se aggiornare, o salta la versione. Qui anche l'avviso delle
// condizioni nuove e il perché, quando il piano non comprende gli
// aggiornamenti. E le parole del sito per la regola e le note.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({ sceltaAggiornamento: vi.fn(async () => ({ ok: true })) }))
vi.mock('../src/lib/db.js', () => db)

import AggiornamentiLocale from '../src/pages/AggiornamentiLocale.jsx'
import { blocchiDelleNote, regolaDetta, propostaDetta, senzaSegni } from '../src/lib/aggiornamenti.js'

const NOTE = '## 1.11.0 — 1 novembre 2026\n### Magazzino\n- la **conta** più veloce\n- le fatture dal [telefono](https://x)\n\n## 1.10.3 — 31 ottobre 2026\n- una correzione'
const proposta = (extra = {}) => ({ tag: 'v1.11.0', note: NOTE, proposta_il: '2026-11-01T10:00:00Z', saltata_il: null, attesa: true, ...extra })
const aScelta = { modalita: 'a_scelta', inclusi: true, motivo: null }

beforeEach(() => vi.clearAllMocks())

describe('la proposta di una versione', () => {
  it('le novità prima, poi «Aggiorna» o «Salta questa versione»', async () => {
    const user = userEvent.setup()
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta() }} />)
    const riquadro = screen.getByRole('region', { name: 'Aggiornamenti' })
    expect(within(riquadro).getByRole('heading', { name: 'È disponibile la versione v1.11.0' })).toBeInTheDocument()
    const note = screen.getByTestId('note-versione')
    expect(note).toHaveTextContent('1.11.0 — 1 novembre 2026')
    expect(note).toHaveTextContent('la conta più veloce')
    expect(note).toHaveTextContent('le fatture dal telefono')
    expect(note).not.toHaveTextContent('**')
    expect(within(note).getAllByRole('listitem')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: 'Aggiorna' }))
    expect(db.sceltaAggiornamento).toHaveBeenCalledWith('v1.11.0', 'aggiorna')
    expect(await screen.findByRole('status')).toHaveTextContent('Aggiornamento chiesto')
  })

  it('«Salta» lascia il locale com’è; una versione saltata resta con il suo «Aggiorna»', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta() }} />)
    await user.click(screen.getByRole('button', { name: 'Salta questa versione' }))
    expect(db.sceltaAggiornamento).toHaveBeenCalledWith('v1.11.0', 'salta')
    expect(await screen.findByRole('status')).toHaveTextContent('Versione saltata')
    unmount()
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta({ saltata_il: '2026-11-02T10:00:00Z' }) }} />)
    expect(screen.getByText(/L’hai saltata il/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiorna' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Salta questa versione' })).toBeNull()
  })

  it('un errore della Function si vede, e i bottoni tornano usabili', async () => {
    const user = userEvent.setup()
    db.sceltaAggiornamento.mockRejectedValueOnce(new Error('Questa proposta non è più valida: ricarica la pagina.'))
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta() }} />)
    await user.click(screen.getByRole('button', { name: 'Aggiorna' }))
    expect(await screen.findByText(/non è più valida/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiorna' })).toBeEnabled()
  })

  it('senza note lo dice; una proposta non in attesa non c’è', () => {
    const { unmount } = render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta({ note: '' }) }} />)
    expect(screen.getByText('Le note di questa versione non sono disponibili.')).toBeInTheDocument()
    unmount()
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: aScelta, proposta_aggiornamento: proposta({ attesa: false }) }} />)
    expect(screen.queryByRole('button', { name: 'Aggiorna' })).toBeNull()
  })
})

describe('le condizioni e il piano', () => {
  it('senza niente da dire, niente riquadro', () => {
    const { container } = render(<AggiornamentiLocale istanza={{ stato: 'attiva' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('l’avviso delle condizioni nuove si legge così com’è', () => {
    const testo = 'Dal 1 dicembre 2026, al rinnovo, cambiano le condizioni degli aggiornamenti: …'
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: { modalita: 'obbligatori', inclusi: true }, avviso_aggiornamenti: { id: 'x', testo, dal: '2026-12-01' } }} />)
    expect(screen.getByRole('note', { name: 'Condizioni degli aggiornamenti' })).toHaveTextContent(testo)
    expect(screen.getByTestId('regola-aggiornamenti')).toHaveTextContent('Automatici')
  })

  it('il piano che non li comprende dice perché, e la proposta non esce', () => {
    render(<AggiornamentiLocale istanza={{ regola_aggiornamenti: { modalita: 'a_scelta', inclusi: false, motivo: 'free' }, proposta_aggiornamento: proposta() }} />)
    expect(screen.getByTestId('regola-aggiornamenti')).toHaveTextContent('Solo gli obbligatori (piano Free)')
    expect(screen.getByText(/Il piano Free non comprende gli aggiornamenti/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aggiorna' })).toBeNull()
  })
})

describe('le parole del sito', () => {
  it('la regola e la proposta in una riga', () => {
    expect(regolaDetta(null)).toBeNull()
    expect(regolaDetta(aScelta)).toBe('A scelta del titolare')
    expect(regolaDetta({ modalita: 'obbligatori', inclusi: false, motivo: 'non_pagato' })).toBe('Solo gli obbligatori (abbonamento non pagato)')
    expect(propostaDetta(proposta())).toBe('v1.11.0 proposta al titolare')
    expect(propostaDetta(proposta({ saltata_il: '2026-11-02T10:00:00Z' }))).toMatch(/^v1\.11\.0 saltata il /)
    expect(propostaDetta(proposta({ attesa: false }))).toBeNull()
  })

  it('le note in blocchi, senza i segni del Markdown', () => {
    expect(blocchiDelleNote('## 1.11.0\n\n---\n### Sala\n- uno\n* due\naltro')).toEqual([
      { tipo: 'titolo', testo: '1.11.0' },
      { tipo: 'sotto', testo: 'Sala' },
      { tipo: 'voce', testo: 'uno' },
      { tipo: 'voce', testo: 'due' },
      { tipo: 'testo', testo: 'altro' },
    ])
    expect(senzaSegni('**grassetto**, `codice` e [link](https://x)')).toBe('grassetto, codice e link')
  })
})
