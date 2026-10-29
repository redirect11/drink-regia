// @vitest-environment happy-dom
'use strict'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato,
// progetto e versione; quello che chiede attenzione sta in cima; da qui si
// rilancia un'attivazione fallita e si segna un piano a mano.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  elencoClienti: vi.fn(),
  elencoIstanze: vi.fn(),
  elencoRichieste: vi.fn(),
  segnaPiano: vi.fn(async () => {}),
  rilanciaAttivazione: vi.fn(async () => {}),
  impostaStatoIstanza: vi.fn(async () => {}),
  aggiornaIstanza: vi.fn(async () => {}),
  osservaImpostazioniRegia: vi.fn((cb) => {
    cb(regia.impostazioni)
    return () => {}
  }),
  impostaDeployAutomatico: vi.fn(async () => {}),
  autorizzaRichiesta: vi.fn(async () => {}),
  rifiutaRichiesta: vi.fn(async () => {}),
  creaClienteDaAdmin: vi.fn(async () => ({ uid: 'n', slug: 'bar-creato' })),
  elencoCassettiAI: vi.fn(async () => ({})),
  gestisciCassettoAI: vi.fn(async () => ({ ok: true })),
  registraLocaleEsistente: vi.fn(async () => ({ uid: 't', slug: 'tana-drink' })),
  elencoRilasci: vi.fn(async () => []),
  gestisciRilascio: vi.fn(async () => ({ ok: true })),
}))
const regia = vi.hoisted(() => ({ impostazioni: {} }))
vi.mock('../src/lib/db.js', () => db)

import Backoffice from '../src/pages/Backoffice.jsx'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = () =>
  render(
    <MemoryRouter future={FUTURO}>
      <Backoffice />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  regia.impostazioni = {}
  db.elencoClienti.mockResolvedValue([
    { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01' },
    { uid: 'b', slug: 'bar-rotto', nome_locale: 'Bar Rotto', email: 'b@x.it', piano: 'base', creato_il: '2026-10-02' },
    { uid: 'c', slug: 'bar-nuovo', nome_locale: 'Bar Nuovo', email: 'c@x.it', creato_il: '2026-10-03' },
  ])
  db.elencoIstanze.mockResolvedValue({
    'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0' },
    'bar-rotto': { stato: 'errore', errore: 'quota progetti' },
  })
  db.elencoRichieste.mockResolvedValue({})
  db.elencoCassettiAI.mockResolvedValue({})
})

describe('il backoffice', () => {
  it('elenca i clienti, prima chi ha un problema', async () => {
    mostra()
    const righe = await screen.findAllByRole('article')
    const nomi = righe.map((r) => within(r).getByRole('heading').textContent)
    expect(nomi[0]).toMatch(/Bar Rotto/)
    expect(nomi[2]).toMatch(/Bar Attivo/)
    const attivo = righe.find((r) => r.textContent.includes('Bar Attivo'))
    expect(attivo).toHaveTextContent('Completo · 69 €')
    expect(attivo).toHaveTextContent('drinkpos-bar-attivo')
    expect(attivo).toHaveTextContent('v1.10.0')
  })

  it('un’attivazione fallita si rilancia', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(await screen.findByRole('button', { name: 'Rilancia' }))
    expect(db.rilanciaAttivazione).toHaveBeenCalledWith('bar-rotto')
  })

  // REQ-FLOTTA-008: «serve un modo per eliminare/fermare l'app deployata».
  it('un’istanza attiva si sospende con un motivo', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('pagamento non ricevuto')
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.click(within(attivo).getByRole('button', { name: 'Sospendi' }))
    expect(db.impostaStatoIstanza).toHaveBeenCalledWith('bar-attivo', 'sospesa', 'pagamento non ricevuto')
  })

  // Un locale per scheda (29/10/2026): lo stato in due parole e colorato,
  // l'app del locale a un clic, Sospendi e Chiudi in un gruppo a parte.
  it('ogni locale è una scheda: stato breve, link all’app, azioni a gruppi', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', url: 'https://drinkpos-bar-attivo.web.app' },
    })
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    expect(within(attivo).getByText('Attiva')).toHaveClass('stato-ok')
    expect(within(attivo).getByRole('link', { name: /Apri l’app/ })).toHaveAttribute('href', 'https://drinkpos-bar-attivo.web.app')
    const licenza = within(attivo).getByLabelText('Licenza')
    expect(within(licenza).getByRole('button', { name: 'Sospendi' })).toBeInTheDocument()
    expect(within(licenza).queryByRole('button', { name: 'Aggiorna' })).toBeNull()
  })

  it('una sospesa lo dice col motivo e si riattiva', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto' },
    })
    mostra()
    const sospeso = (await screen.findByText(/sospesa · pagamento non ricevuto/)).closest('article')
    await user.click(within(sospeso).getByRole('button', { name: 'Riattiva' }))
    expect(db.impostaStatoIstanza).toHaveBeenLastCalledWith('bar-attivo', 'attiva', null)
  })

  // REQ-FLOTTA-009: l'app di base è tana-drink; un aggiornamento si porta
  // a un locale solo con «Aggiorna». A tutti ci arriva a ondate
  // (REQ-FLOTTA-012): «Aggiorna tutte» non c'è più.
  it('«Aggiorna» porta l’ultima versione a un locale; a tutti si arriva solo con un rilascio', async () => {
    const user = userEvent.setup()
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna' }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('bar-attivo')
    expect(screen.queryByRole('button', { name: /Aggiorna tutte/ })).toBeNull()
  })

  it('un piano si segna a mano, finché non c’è Stripe', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('base')
    mostra()
    const nuovo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Nuovo'))
    await user.click(within(nuovo).getByRole('button', { name: 'Piano a mano' }))
    expect(db.segnaPiano).toHaveBeenCalledWith('c', { piano: 'base', moduli: [], terminali: 1 })
  })
})

// REQ-FLOTTA-011: l'admin governa i deploy e crea locali da sé.
describe('il backoffice governa i deploy', () => {
  it('l’interruttore del deploy automatico è acceso di partenza e si spegne', async () => {
    const user = userEvent.setup()
    mostra()
    const interruttore = await screen.findByLabelText('Deploy automatico')
    expect(interruttore).toBeChecked()
    await user.click(interruttore)
    expect(db.impostaDeployAutomatico).toHaveBeenCalledWith(false)
  })

  it('spento, le richieste da approvare stanno in cima: Autorizza le mette in coda, Rifiuta chiede il motivo', async () => {
    const user = userEvent.setup()
    regia.impostazioni = { deploy_automatico: false }
    db.elencoRichieste.mockResolvedValue({ 'bar-nuovo': { stato: 'da approvare', piano: 'base', chiesta_il: '2026-10-22T10:00:00Z' } })
    mostra()
    const sezione = await screen.findByRole('region', { name: 'Richieste da autorizzare' })
    expect(sezione).toHaveTextContent(/Bar Nuovo/)
    expect(screen.getByText(/aspettano la tua autorizzazione/)).toBeInTheDocument()
    await user.click(within(sezione).getByRole('button', { name: 'Autorizza' }))
    expect(db.autorizzaRichiesta).toHaveBeenCalledWith('bar-nuovo')
    vi.spyOn(window, 'prompt').mockReturnValue('dati incompleti')
    await user.click(within(sezione).getByRole('button', { name: 'Rifiuta' }))
    expect(db.rifiutaRichiesta).toHaveBeenCalledWith('bar-nuovo', 'dati incompleti')
  })

  it('«Nuovo locale» crea il cliente con piano, moduli e attivazione subito', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(await screen.findByRole('button', { name: 'Nuovo locale' }))
    const modulo = screen.getByRole('form', { name: 'Nuovo locale' })
    await user.type(within(modulo).getByLabelText('Nome del locale'), 'Bar Creato')
    await user.type(within(modulo).getByLabelText('Email del titolare'), 'creato@example.it')
    await user.click(within(modulo).getByLabelText(/Personale e ore/))
    await user.click(within(modulo).getByRole('button', { name: 'Crea il locale' }))
    expect(db.creaClienteDaAdmin).toHaveBeenCalledWith({
      nome_locale: 'Bar Creato',
      email: 'creato@example.it',
      piano: 'base',
      moduli: ['staff'],
      terminali: 1,
      attiva_subito: true,
    })
  })
})

// REQ-AI-003 (decisione dell'utente del 24/10/2026): il cassetto AI di ogni
// locale si governa da qui, e la Tana entra come locale esistente.
describe('il backoffice e il credito AI', () => {
  const MESE = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
    .reduce((m, p) => ({ ...m, [p.type]: p.value }), {})
  const meseOra = `${MESE.year}-${MESE.month}`

  it('mostra credito e speso del mese, e ricarica a mano con una nota', async () => {
    const user = userEvent.setup()
    db.elencoCassettiAI.mockResolvedValue({
      'bar-attivo': { credito_microeuro: 12_500_000, mese: meseOra, speso_mese_microeuro: 3_000_000, tetto_mensile_microeuro: 20_000_000, chiave_creata_il: 'x' },
    })
    vi.spyOn(window, 'prompt').mockReturnValueOnce('15,5').mockReturnValueOnce('prima ricarica')
    mostra()
    expect(await screen.findByTestId('credito-bar-attivo')).toHaveTextContent('12,50 €')
    const attivo = screen.getAllByRole('article').find((r) => r.textContent.includes('Bar Attivo'))
    expect(attivo).toHaveTextContent('mese 3,00 € / 20,00 €')
    await user.click(within(attivo).getByRole('button', { name: 'Ricarica AI' }))
    expect(db.gestisciCassettoAI).toHaveBeenCalledWith('bar-attivo', 'ricarica', { importo: 15.5, nota: 'prima ricarica' })
  })

  it('la chiave nuova si vede una volta sola, e prima di sostituirne una si chiede', async () => {
    const user = userEvent.setup()
    db.elencoCassettiAI.mockResolvedValue({ 'bar-attivo': { credito_microeuro: 0, chiave_creata_il: '2026-10-20' } })
    db.gestisciCassettoAI.mockResolvedValueOnce({ ok: true, chiave: 'bar-attivo.segretolungo' })
    const conferma = vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.click(within(attivo).getByRole('button', { name: 'Chiave AI' }))
    expect(conferma).toHaveBeenCalled()
    expect(db.gestisciCassettoAI).toHaveBeenCalledWith('bar-attivo', 'chiave', {})
    expect(await screen.findByTestId('chiave-ai')).toHaveTextContent('bar-attivo.segretolungo')
    await user.click(screen.getByRole('button', { name: 'L’ho copiata' }))
    expect(screen.queryByTestId('chiave-ai')).toBeNull()
  })

  it('«Locale esistente» registra la Tana senza provisioning', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(await screen.findByRole('button', { name: 'Locale esistente' }))
    const modulo = screen.getByRole('form', { name: 'Locale esistente' })
    await user.type(within(modulo).getByLabelText('Nome del locale'), 'La Tana del Coniglio')
    await user.type(within(modulo).getByLabelText('Identificativo'), 'tana-drink')
    await user.type(within(modulo).getByLabelText('Email del titolare'), 'tana@example.it')
    await user.type(within(modulo).getByLabelText('Progetto Firebase'), 'tana-drink')
    await user.type(within(modulo).getByLabelText('Indirizzo dell’app'), 'https://tana-drink.web.app')
    expect(within(modulo).getByLabelText(/Installazione interna/)).toBeChecked()
    await user.click(within(modulo).getByRole('button', { name: 'Registra il locale' }))
    expect(db.registraLocaleEsistente).toHaveBeenCalledWith({
      nome_locale: 'La Tana del Coniglio',
      slug: 'tana-drink',
      email: 'tana@example.it',
      progetto: 'tana-drink',
      url: 'https://tana-drink.web.app',
      interna: true,
    })
  })

  it('un locale esistente non si aggiorna, sospende o chiude dalla flotta', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([
      { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01' },
      { uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24' },
    ])
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo' },
      'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true },
    })
    mostra()
    const tana = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('La Tana'))
    expect(tana).toHaveTextContent('interna · esistente')
    expect(within(tana).queryByRole('button', { name: 'Aggiorna' })).toBeNull()
    expect(within(tana).queryByRole('button', { name: 'Sospendi' })).toBeNull()
    expect(within(tana).getByRole('button', { name: 'Ricarica AI' })).toBeInTheDocument()
    // Né un gruppo di rilascio: la Tana è sempre nell'ondata delle interne.
    expect(within(tana).queryByRole('combobox')).toBeNull()
    await user.click(within(tana).getByRole('button', { name: 'Piano a mano' }))
    expect(db.aggiornaIstanza).not.toHaveBeenCalled()
  })
})

// I RILASCI A ONDATE (REQ-FLOTTA-012): un tag arriva ai locali un'ondata
// alla volta; un aggiornamento fallito si riprova o si torna indietro.
describe('i rilasci a ondate nel backoffice', () => {
  const rilascio = (extra = {}) => ({
    ref: 'v1.11.0',
    stato: 'in corso',
    ondata: 0,
    ondate: [
      { nome: 'prova', slugs: ['bar-prova'], avviata_il: '2026-10-27T09:00:00Z' },
      { nome: 'generale', slugs: ['bar-attivo'], avviata_il: null },
    ],
    riepilogo: [
      { nome: 'prova', riuscito: 1, 'in corso': 0, fallito: 0, 'in attesa': 0, escluso: 0 },
      { nome: 'generale', riuscito: 0, 'in corso': 0, fallito: 0, 'in attesa': 1, escluso: 0 },
    ],
    puo_avanzare: true,
    prossima: 'generale',
    perche_fermo: null,
    creato_il: '2026-10-27T08:00:00Z',
    ...extra,
  })

  it('senza rilasci aperti si crea un rilascio, solo da un tag', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValueOnce('main').mockReturnValueOnce('v1.11.0')
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    mostra()
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    await user.click(within(riquadro).getByRole('button', { name: 'Nuovo rilascio' }))
    // «main» cambia fra un'ondata e l'altra: non è un rilascio.
    expect(window.alert).toHaveBeenCalled()
    expect(db.gestisciRilascio).not.toHaveBeenCalled()
    await user.click(within(riquadro).getByRole('button', { name: 'Nuovo rilascio' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('crea', { ref: 'v1.11.0' })
  })

  it('un rilascio aperto dice le ondate e avvia la successiva', async () => {
    const user = userEvent.setup()
    db.elencoRilasci.mockResolvedValue([rilascio()])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra()
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    expect(await within(riquadro).findByText('v1.11.0')).toBeInTheDocument()
    expect(riquadro).toHaveTextContent('Istanze di prova')
    expect(riquadro).toHaveTextContent('1 aggiornati')
    expect(within(riquadro).queryByRole('button', { name: 'Nuovo rilascio' })).toBeNull()
    await user.click(within(riquadro).getByRole('button', { name: 'Avvia l’ondata «Tutti gli altri»' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('avanza', { ref: 'v1.11.0' })
  })

  it('un rilascio fermo dice perché e non avanza', async () => {
    db.elencoRilasci.mockResolvedValue([
      rilascio({
        stato: 'fermo',
        fermato_perche: 'Aggiornamento fallito: bar-prova',
        puo_avanzare: false,
        prossima: null,
        perche_fermo: 'Nell’ondata «prova» ci sono aggiornamenti falliti: riprova o torna alla versione di prima.',
      }),
    ])
    mostra()
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    expect(await within(riquadro).findByText(/Aggiornamento fallito: bar-prova/)).toBeInTheDocument()
    expect(riquadro).toHaveTextContent('riprova o torna alla versione di prima')
    expect(within(riquadro).queryByRole('button', { name: /Avvia l’ondata/ })).toBeNull()
    expect(within(riquadro).getByRole('button', { name: 'Annulla rilascio' })).toBeInTheDocument()
  })

  it('un aggiornamento fallito lascia il locale attivo, e si riprova o si torna indietro', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        versione: 'v1.10.0',
        aggiornamento: { ref: 'v1.11.0', rilascio: 'v1.11.0', stato: 'fallito', errore: 'deploy interrotto', versione_precedente: 'v1.10.0' },
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    expect(attivo).toHaveTextContent('Attiva')
    expect(attivo).toHaveTextContent('aggiornamento a v1.11.0 fallito: deploy interrotto')
    await user.click(within(attivo).getByRole('button', { name: 'Riprova' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('riprova', { ref: 'v1.11.0', slug: 'bar-attivo' })
    await user.click(within(attivo).getByRole('button', { name: 'Torna a v1.10.0' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('indietro', { slug: 'bar-attivo' })
  })

  it('un locale della flotta si mette nel gruppo pilota', async () => {
    const user = userEvent.setup()
    mostra()
    const attivo = (await screen.findAllByRole('article')).find((r) => r.textContent.includes('Bar Attivo'))
    await user.selectOptions(within(attivo).getByRole('combobox', { name: 'Gruppo di rilascio di Bar Attivo' }), 'pilota')
    expect(db.gestisciRilascio).toHaveBeenCalledWith('gruppo', { slug: 'bar-attivo', gruppo: 'pilota' })
  })
})
