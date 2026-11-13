// @vitest-environment happy-dom
'use strict'

// L'AREA DEL TITOLARE IN SEZIONI (REQ-FLOTTA-084). Daniele, 12/11/2026:
// «quel box non dovrebbe essere messo nella dashboard, o meglio da qualche
// altra parte nel backoffice del titolare di un locale. Non basta solo la
// dashboard.» E sul difetto del Free: «nella sua dashboard ha come piano
// selezionato il base ma invece è il free che non c'è nelle opzioni».
// Struttura approvata lo stesso giorno: «ti do l'ok per la struttura
// dell'area del titolare e procedi».

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ cliente: null, istanza: null, richiesta: null, vendita: null }))
const db = vi.hoisted(() => ({
  osservaCliente: vi.fn((uid, cb) => {
    cb(stato.cliente)
    return () => {}
  }),
  // Dalla query sul suo uid (REQ-FLOTTA-086), coi test in Dashboard.test.jsx.
  osservaMiaIstanza: vi.fn((uid, slug, cb) => {
    cb(stato.istanza)
    return () => {}
  }),
  osservaMiaRichiesta: vi.fn((uid, slug, cb) => {
    cb(stato.richiesta)
    return () => {}
  }),
  statoMiaApp: vi.fn(async () => ({ app: 'nessuna' })),
  osservaVendita: vi.fn((cb) => {
    cb(stato.vendita)
    return () => {}
  }),
  osservaContatto: (uid, cb) => {
    cb(null)
    return () => {}
  },
  osservaCassettoAI: (slug, cb) => {
    cb(null)
    return () => {}
  },
  osservaTemiSuMisura: (uid, cb) => {
    cb([])
    return () => {}
  },
  ultimiConsumiAI: vi.fn(async () => []),
  ultimeRicaricheAI: vi.fn(async () => []),
  avviaRicaricaAI: vi.fn(),
  chiediAttivazione: vi.fn(async () => {}),
  apriPortaleAbbonamento: vi.fn(),
  apriLaTuaApp: vi.fn(async () => ({ url: 'about:blank#app' })),
  inviaVerificaEmail: vi.fn(),
  rileggiUtente: vi.fn(),
  avviaPagamento: vi.fn(),
  cambiaScelta: vi.fn(),
  chiediContatto: vi.fn(),
  scegliFree: vi.fn(),
  verificaCodiceSconto: vi.fn(),
  attivaConCodice: vi.fn(),
  gestisciEliminazione: vi.fn(),
  scaricaArchivio: vi.fn(),
  sceltaAggiornamento: vi.fn(),
  provaModulo: vi.fn(),
  esci: vi.fn(),
  completaRegistrazione: vi.fn(),
}))
vi.mock('../src/lib/db.js', () => db)

import Dashboard from '../src/pages/Dashboard.jsx'
import { EMAIL_CONTATTI } from '../src/lib/prodotto.js'

// La pagina montata come in App.jsx: le sezioni sono sotto-rotte di /dashboard.
const mostra = (percorso = '/dashboard', utente = { uid: 'u1', email: 'titolare@example.it' }) =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard utente={utente} />} />
      </Routes>
    </MemoryRouter>
  )

const menu = () => screen.getByRole('navigation', { name: 'Sezioni dell’area del titolare' })

const SEZIONI = [
  ['Panoramica', '/dashboard'],
  ['Piano e moduli', '/dashboard/piano'],
  ['Credito AI', '/dashboard/credito-ai'],
  ['Il locale', '/dashboard/locale'],
  ['Chiudi il locale', '/dashboard/chiudi'],
]

// Dati inventati: nessuna persona reale.
const CLIENTE = {
  uid: 'u1',
  email: 'titolare@example.it',
  slug: 'bar-prova',
  nome_locale: 'Bar Prova',
  piano: 'base',
  moduli: [],
  terminali: 1,
  abbonamento: { stato: 'attivo', origine: 'stripe', stripe_customer: 'cus_1' },
  locale: { tipo: 'cocktail bar', indirizzo: { via: 'Via Esempio 1', cap: '00100', citta: 'Roma', provincia: 'RM' }, telefono: '+39 000 0000000', sito: 'https://bar-prova.example' },
  fatturazione: {
    ragione_sociale: 'Bar Prova srl',
    partita_iva: '12345678901',
    codice_fiscale: '12345678901',
    pec: 'barprova@pec.example',
    sdi: 'ABC1234',
    sede_legale: { via: 'Via Legale 2', cap: '00100', citta: 'Roma', provincia: 'RM' },
  },
  referente: { nome: 'Anna', cognome: 'Esempio', ruolo: 'titolare', telefono: '+39 111 1111111' },
}

beforeEach(() => {
  vi.clearAllMocks()
  stato.cliente = structuredClone(CLIENTE)
  stato.istanza = null
  stato.richiesta = null
  stato.vendita = { free: false, pagamenti_online: true, moduli: {} }
})

describe('l’area del titolare: il sotto-menù', () => {
  it('ha cinque voci, ognuna col suo indirizzo; la panoramica è quella attiva su /dashboard', () => {
    mostra()
    const voci = within(menu()).getAllByRole('link')
    expect(voci.map((a) => [a.textContent, a.getAttribute('href')])).toEqual(SEZIONI)
    expect(within(menu()).getByRole('link', { name: 'Panoramica' })).toHaveAttribute('aria-current', 'page')
    expect(within(menu()).getByRole('link', { name: 'Piano e moduli' })).not.toHaveAttribute('aria-current')
  })

  it('ogni voce porta alla sua sezione', async () => {
    const user = userEvent.setup()
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova', url: 'https://drinkpos-bar-prova.web.app' }
    mostra()
    await user.click(within(menu()).getByRole('link', { name: 'Piano e moduli' }))
    expect(within(menu()).getByRole('link', { name: 'Piano e moduli' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'Piano' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scelta del piano' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'L’app' })).toBeNull()

    await user.click(within(menu()).getByRole('link', { name: 'Credito AI' }))
    expect(await screen.findByRole('region', { name: 'Credito AI' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Piano' })).toBeNull()

    await user.click(within(menu()).getByRole('link', { name: 'Il locale' }))
    expect(screen.getByRole('region', { name: 'Dati del locale' })).toBeInTheDocument()

    await user.click(within(menu()).getByRole('link', { name: 'Chiudi il locale' }))
    expect(screen.getByRole('region', { name: 'Chiudi il locale' })).toBeInTheDocument()

    await user.click(within(menu()).getByRole('link', { name: 'Panoramica' }))
    expect(screen.getByRole('region', { name: 'L’app' })).toBeInTheDocument()
  })

  it('/dashboard/ con la barra finale è la panoramica, con la sua voce accesa', () => {
    mostra('/dashboard/')
    expect(within(menu()).getByRole('link', { name: 'Panoramica' })).toHaveAttribute('aria-current', 'page')
  })

  it('un indirizzo che non c’è torna alla panoramica', () => {
    mostra('/dashboard/non-esiste')
    expect(within(menu()).getByRole('link', { name: 'Panoramica' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'L’app' })).toBeInTheDocument()
  })

  it('il nome del locale resta in testa in ogni sezione', () => {
    for (const [, percorso] of SEZIONI) {
      const { unmount } = mostra(percorso)
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bar Prova')
      unmount()
    }
  })

  it('App.jsx porta a Dashboard tutte le sotto-rotte di /dashboard, con lo stesso controllo d’accesso', () => {
    const app = readFileSync('src/App.jsx', 'utf8')
    expect(app).toMatch(/<Route path="\/dashboard\/\*" element=\{dopoLAccesso\(utente \? <Dashboard utente=\{utente\} chiuso=\{chiuso\} \/> : <Navigate to="\/accedi" replace \/>\)\} \/>/)
    expect(app).toContain('<Link to="/dashboard">')
  })
})

describe('la panoramica', () => {
  it('ha l’app con «Apri la tua app» e un riepilogo del piano che porta a «Piano e moduli»; il piano e la scelta non stanno qui', () => {
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova', url: 'https://drinkpos-bar-prova.web.app' }
    mostra()
    expect(screen.getByRole('button', { name: 'Apri la tua app' })).toBeInTheDocument()
    const riepilogo = screen.getByRole('region', { name: 'Il tuo piano' })
    expect(riepilogo).toHaveTextContent('Base')
    expect(within(riepilogo).getByRole('link', { name: /Piano e moduli/ })).toHaveAttribute('href', '/dashboard/piano')
    expect(screen.queryByRole('region', { name: 'Piano' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Scelta del piano' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Credito AI' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Chiudi il locale' })).toBeNull()
  })

  it('l’email da confermare e la cancellazione programmata stanno in cima alla panoramica', () => {
    stato.istanza = {
      stato: 'attiva',
      progetto: 'drinkpos-bar-prova',
      licenza_stato: 'sospesa',
      eliminazione: { stato: 'programmata', quando: '2027-01-31T10:00:00Z', richiedente: 'conservazione' },
    }
    mostra('/dashboard', { uid: 'u1', email: 'titolare@example.it', emailVerificata: false })
    const avviso = screen.getByRole('region', { name: 'Cancellazione del locale' })
    expect(avviso.compareDocumentPosition(screen.getByRole('heading', { level: 2 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Conferma la tua email.')).toBeInTheDocument()
  })

  it('il ritorno da Stripe porta alla sezione dove se ne parla', () => {
    const { unmount } = mostra('/dashboard?pagamento=ok')
    expect(within(menu()).getByRole('link', { name: 'Piano e moduli' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText(/Pagamento ricevuto: l’abbonamento compare/)).toBeInTheDocument()
    unmount()
    mostra('/dashboard?ricarica=ok')
    expect(within(menu()).getByRole('link', { name: 'Credito AI' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('«Piano e moduli» di un cliente Free', () => {
  beforeEach(() => {
    stato.cliente = { ...stato.cliente, piano: 'free', moduli: [], terminali: 1, abbonamento: { stato: 'attivo', origine: 'gratuito' } }
  })

  it('col Free fuori vendita: il Free c’è come «Il tuo piano», scelto, e il tasto è spento finché non si sceglie un piano a pagamento', async () => {
    const user = userEvent.setup()
    mostra('/dashboard/piano')
    const scelta = screen.getByRole('region', { name: 'Scelta del piano' })
    const free = within(scelta).getByRole('radio', { name: /^Free/ })
    expect(free).toBeChecked()
    expect(free.closest('label')).toHaveTextContent('Il tuo piano')
    expect(within(scelta).getByRole('radio', { name: /^Base/ })).not.toBeChecked()
    const tasto = within(scelta).getAllByRole('button').at(-1)
    expect(tasto).toBeDisabled()
    await user.click(within(scelta).getByRole('radio', { name: /^Base/ }))
    expect(within(scelta).getByRole('button', { name: 'Vai al pagamento' })).toBeEnabled()
  })

  it('il riepilogo della panoramica dice Free, non Base', () => {
    mostra()
    const riepilogo = screen.getByRole('region', { name: 'Il tuo piano' })
    expect(riepilogo).toHaveTextContent('Free')
    expect(riepilogo).not.toHaveTextContent('Base')
  })
})

describe('«Il locale»', () => {
  it('mostra i dati del locale, la fatturazione, il referente e le stampanti, in sola lettura, e come chiederne la modifica', () => {
    stato.cliente = {
      ...stato.cliente,
      stampanti: { non_fiscale: { scelta: 'Epson TM-m30III', altra: null }, fiscale: { scelta: 'altra', altra: 'Marca Esempio RT1' } },
    }
    mostra('/dashboard/locale')
    const dati = screen.getByRole('region', { name: 'Dati del locale' })
    for (const testo of [
      'Bar Prova',
      'cocktail bar',
      'Via Esempio 1',
      '00100 Roma (RM)',
      '+39 000 0000000',
      'https://bar-prova.example',
      'Bar Prova srl',
      '12345678901',
      'barprova@pec.example',
      'ABC1234',
      'Via Legale 2',
      'Anna Esempio',
      '+39 111 1111111',
      'titolare@example.it',
      'Stampante: Epson TM-m30III · Registratore telematico: Marca Esempio RT1',
    ])
      expect(dati).toHaveTextContent(testo)
    expect(within(dati).queryByRole('textbox')).toBeNull()
    expect(within(dati).queryByRole('button')).toBeNull()
    expect(within(dati).getByRole('link', { name: EMAIL_CONTATTI })).toHaveAttribute('href', `mailto:${EMAIL_CONTATTI}`)
  })

  it('senza stampanti dette non mostra la riga delle stampanti', () => {
    mostra('/dashboard/locale')
    expect(screen.getByRole('region', { name: 'Dati del locale' })).not.toHaveTextContent('Stampante:')
  })
})

describe('«Chiudi il locale»', () => {
  it('mostra la chiusura e cancellazione del locale (REQ-FLOTTA-014)', () => {
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova', licenza_stato: 'attiva' }
    mostra('/dashboard/chiudi')
    const chiudi = screen.getByRole('region', { name: 'Chiudi il locale' })
    expect(within(chiudi).getByRole('button', { name: /Chiudi e cancella il locale/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'L’app' })).toBeNull()
  })
})
