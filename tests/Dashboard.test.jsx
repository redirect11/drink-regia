// @vitest-environment happy-dom
'use strict'

// LA DASHBOARD DEL TITOLARE (REQ-FLOTTA-004): il locale, il piano, lo
// stato dell'istanza; «Attiva» chiama la Function e, senza piano, spiega.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
  // Il rinnovo del locale sospeso (REQ-FLOTTA-090) ha i suoi test in RinnovoLocale.test.jsx.
  apriPagamentoRinnovo: vi.fn(),
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

// Montata come in App.jsx: dal 12/11/2026 la dashboard è un'area con le
// sue sezioni sotto /dashboard (REQ-FLOTTA-084). Il piano, il suo prezzo e
// la scelta stanno in «Piano e moduli» (/dashboard/piano).
const mostra = (percorso = '/dashboard', utente = { uid: 'u1', email: 'mario@example.it' }) =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard utente={utente} />} />
      </Routes>
    </MemoryRouter>
  )
const PIANO = '/dashboard/piano'

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
      <MemoryRouter>
        <Dashboard utente={{ uid: 'u1', email: 'mario@example.it' }} chiuso />
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Il sito apre a breve.')
    expect(screen.queryByRole('heading', { name: /Completa la registrazione/ })).toBeNull()
  })

  it('con un locale, col sito chiuso, la dashboard resta la sua', () => {
    render(
      <MemoryRouter>
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
    mostra(PIANO)
    await user.click(screen.getByRole('button', { name: 'Gestisci l’abbonamento' }))
    expect(db.apriPortaleAbbonamento).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('pagato-fino-al')).toBeNull()
  })

  it('a mano dice fino a quando è pagato, e niente portale', () => {
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'attivo', origine: 'manuale', pagato_fino_al: '2026-11-30' } }
    mostra(PIANO)
    expect(screen.getByTestId('pagato-fino-al')).toHaveTextContent('Pagato fino al 30 novembre 2026. Per rinnovare o disdire scrivici.')
    expect(screen.queryByRole('button', { name: 'Gestisci l’abbonamento' })).toBeNull()
  })

  // REQ-FLOTTA-039: i temi in licenza si vedono col piano, come i moduli.
  it('i temi in licenza stanno accanto al piano, col loro nome', () => {
    stato.cliente = { ...stato.cliente, temi: ['notte', 'meraviglie'] }
    mostra(PIANO)
    expect(screen.getByText(/temi: Notte, Meraviglie/)).toBeInTheDocument()
  })

  it('se il portale non si apre, lo dice', async () => {
    const user = userEvent.setup()
    db.apriPortaleAbbonamento.mockRejectedValueOnce(new Error('La gestione dell’abbonamento non è disponibile al momento: scrivici.'))
    stato.cliente = { ...stato.cliente, abbonamento: { stato: 'attivo', origine: 'stripe', stripe_customer: 'cus_1' } }
    mostra(PIANO)
    await user.click(screen.getByRole('button', { name: 'Gestisci l’abbonamento' }))
    expect(await screen.findByText(/non è disponibile al momento/)).toBeInTheDocument()
  })

  it('dice locale, piano col prezzo del mese e stato dell’istanza', () => {
    const { unmount } = mostra()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bar Mario')
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent('Non ancora attivata')
    // Nella panoramica il riepilogo dice lo stesso prezzo del riquadro del piano.
    expect(screen.getByTestId('riepilogo-piano')).toHaveTextContent('42,70 € + IVA al mese (52,09 € IVA inclusa)')
    unmount()
    mostra(PIANO)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Bar Mario')
    // 32,70 + 10 (staff); il secondo terminale è fra i 3 inclusi (DEC-0005).
    // Coi centesimi e «+ IVA», e il totale IVA inclusa accanto.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('42,70 € + IVA al mese (52,09 € IVA inclusa)')
  })

  it('chi paga l’anno vede il prezzo dell’anno', () => {
    stato.cliente = { ...stato.cliente, moduli: [], terminali: 1, abbonamento: { stato: 'attivo', intervallo: 'anno' } }
    mostra(PIANO)
    // 10 mensilità da 32,70 €: 327 € + IVA, 398,94 € IVA inclusa.
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('327 € + IVA all’anno (398,94 € IVA inclusa)')
  })

  // REQ-FLOTTA-031: un Fondatore, finché l'offerta vale, vede il suo prezzo;
  // scaduti i 12 mesi torna il listino.
  it('un Fondatore vede 25 € finché l’offerta vale, poi il listino', () => {
    const fondatore = (fino_al) => ({ stato: 'attivo', intervallo: 'mese', fondatore: { numero: 1, dal: '2026-11-01T00:00:00Z', fino_al } })
    stato.cliente = { ...stato.cliente, moduli: [], terminali: 1, abbonamento: fondatore('2999-01-01T00:00:00Z') }
    const { unmount } = mostra(PIANO)
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('25 € + IVA al mese (30,50 € IVA inclusa)')
    unmount()
    stato.cliente = { ...stato.cliente, abbonamento: fondatore('2000-01-01T00:00:00Z') }
    mostra(PIANO)
    expect(screen.getByTestId('prezzo-piano')).toHaveTextContent('32,70 € + IVA al mese (39,89 € IVA inclusa)')
  })

  // REQ-FLOTTA-024: quello che il piano nuovo toglie arriva al taglio.
  it('dice quando arriva una riduzione del piano, e niente se non ce n’è', () => {
    stato.istanza = { stato: 'attiva', riduzione_al_taglio: { dal: '2026-11-02T04:00:00.000Z', cosa: ['il modulo staff'] } }
    const { unmount } = mostra(PIANO)
    expect(screen.getByTestId('riduzione-al-taglio')).toHaveTextContent(/Dal taglio della giornata .*: il modulo staff. Fino ad allora l’app resta com’è./)
    unmount()
    stato.istanza = { stato: 'attiva', riduzione_al_taglio: null }
    mostra(PIANO)
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
    mostra(PIANO)
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

  it('senza piano il tasto è spento, dice cosa manca, e in «Piano e moduli» c’è la scelta del piano', () => {
    stato.cliente = { ...stato.cliente, piano: null, abbonamento: null }
    const { unmount } = mostra()
    expect(screen.getByRole('button', { name: /Attiva l’istanza/ })).toBeDisabled()
    expect(screen.getByText(/Serve un piano/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scegli il piano in «Piano e moduli»' })).toHaveAttribute('href', PIANO)
    unmount()
    mostra(PIANO)
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

  // Audit del 09/11/2026, finding 28 (REQ-FLOTTA-057): un url che non è
  // https non diventa un link; si mostra l'indirizzo che l'istanza avrà.
  it('attiva con un url che non è https: il link è l’indirizzo del suo slug', () => {
    stato.istanza = { stato: 'attiva', url: 'javascript:alert(1)' }
    mostra()
    const link = screen.getByRole('link', { name: /^https:\/\/bar-mario\./ })
    expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\/bar-mario\./))
    expect(screen.queryByText(/javascript:/)).toBeNull()
  })

  it('in coda: niente tasto, si aspetta', () => {
    stato.richiesta = { stato: 'in coda' }
    mostra()
    expect(screen.getByTestId('stato-istanza')).toHaveTextContent(/In coda/)
    expect(screen.queryByRole('button', { name: /Attiva l’istanza/ })).toBeNull()
  })
})

// REQ-FLOTTA-062 (Daniele, 11/11/2026: «tutti i box sono sfalsati, quello
// sotto è lontanissimo. Va rifatto meglio»). I riquadri stavano in una
// griglia a righe, alta quanto il riquadro più alto: accanto restavano
// buchi. Ora sono due pile, e in una pila ogni riquadro sta subito sotto
// il precedente.
describe('la dashboard su due colonne', () => {
  const pile = () => [...document.querySelectorAll('.dashboard-colonne > .pila')]
  const nomi = (pila) => [...pila.querySelectorAll(':scope > .card')].map((c) => c.getAttribute('aria-label'))

  // REQ-FLOTTA-084: il piano e il credito AI hanno ora la loro sezione; a
  // destra della panoramica resta il riepilogo del piano.
  it('con l’app attiva: a sinistra app, aggiornamenti e temi su misura, in quest’ordine; a destra il riepilogo del piano', async () => {
    stato.istanza = {
      stato: 'attiva',
      progetto: 'drinkpos-bar-mario',
      url: 'https://drinkpos-bar-mario.web.app',
      avviso_aggiornamenti: 'Dal 1° dicembre gli aggiornamenti cambiano.',
    }
    mostra()
    await screen.findByRole('region', { name: 'Temi su misura' })
    expect(pile().map((p) => p.className)).toEqual(['pila principale', 'pila accanto'])
    expect(nomi(pile()[0])).toEqual(['L’app', 'Aggiornamenti', 'Temi su misura'])
    expect(nomi(pile()[1])).toEqual(['Il tuo piano'])
    // Ogni riquadro sta in una pila: nessuno direttamente fra le colonne.
    expect(document.querySelectorAll('.dashboard-colonne > .card')).toHaveLength(0)
    expect(document.querySelector('main.dashboard .riquadri')).toBeNull()
  })

  // Rilievo del revisore (REQ-FLOTTA-062): una pila senza riquadri il
  // foglio di stile la toglie, perché non resti una colonna vuota. Senza app
  // attiva a sinistra c'è solo l'app.
  it('senza app attiva: a sinistra solo l’app, a destra il riepilogo; una pila vuota sparisce', async () => {
    mostra()
    await screen.findByRole('heading', { level: 2 })
    expect(nomi(pile()[0])).toEqual(['L’app'])
    expect(nomi(pile()[1])).toEqual(['Il tuo piano'])
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8').replace(/\r\n/g, '\n')
    expect(css).toContain('.pila:empty { display: none; }')
  })

  it('in «Piano e moduli» la scelta del piano sta sotto il riquadro del piano, larga quanto la pagina', async () => {
    mostra(PIANO)
    await screen.findByRole('heading', { level: 2 })
    const riquadro = screen.getByRole('region', { name: 'Piano' })
    const piano = document.querySelector('.dashboard-piano')
    expect(piano.querySelectorAll(':scope > .card')).toHaveLength(1)
    expect(piano.contains(riquadro)).toBe(false)
    expect(riquadro.compareDocumentPosition(piano) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('.dashboard-colonne')).toBeNull()
  })

  it('sotto i 900px le pile stanno una sotto l’altra; sopra, affiancate, tre parti a due', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'src', 'index.css'), 'utf8').replace(/\r\n/g, '\n')
    const regola = (selettore) => {
      const i = css.indexOf(`${selettore} {`)
      return css.slice(i, css.indexOf('}', i))
    }
    expect(regola('.dashboard-colonne')).toContain('flex-direction: column')
    const larga = css.slice(css.indexOf('@media (min-width: 900px) {\n  .dashboard-colonne'))
    expect(larga).toContain('.dashboard-colonne { flex-direction: row;')
    expect(larga).toContain('.pila.principale { flex: 3 1 0; }')
    expect(larga).toContain('.pila.accanto { flex: 2 1 0; }')
  })

  // L'unico punto dove il markup cambia: l'avviso dell'email ha il testo
  // in un paragrafo e i bottoni accanto. Dice e fa le stesse cose.
  it('l’avviso dell’email da confermare dice le stesse cose, coi suoi due bottoni', async () => {
    mostra('/dashboard', { uid: 'u1', email: 'mario@example.it', emailVerificata: false })
    const avviso = (await screen.findByText('Conferma la tua email.')).closest('section')
    expect(avviso).toHaveAttribute('role', 'status')
    expect(avviso).toHaveTextContent('Ti abbiamo scritto a mario@example.it: apri il link nel messaggio. Senza, l’app non si attiva.')
    expect(avviso.querySelector('p')).toHaveTextContent('Conferma la tua email.')
    expect([...avviso.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Invia di nuovo', 'Ho confermato'])
  })
})

// REQ-FLOTTA-015: un cliente Free vede i limiti del suo piano, e sotto la
// scelta per passare a pagamento, col Checkout e non con «modifica».
// REQ-FLOTTA-084: il suo Free sta fra le opzioni, scelto; il pagamento si
// accende scegliendo un piano a pagamento.
describe('la dashboard di un cliente Free', () => {
  it('dice i limiti del Free e propone i piani a pagamento', async () => {
    const user = userEvent.setup()
    stato.cliente = { ...stato.cliente, piano: 'free', moduli: [], terminali: 1, abbonamento: { stato: 'attivo', origine: 'gratuito' } }
    mostra(PIANO)
    expect(screen.getByTestId('limiti-piano')).toHaveTextContent('fino a 10 prodotti nel menù e 5 conti aperti insieme, solo il titolare, senza sconti')
    expect(screen.getByRole('heading', { name: 'Scegli il piano' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Cambia piano o moduli' })).toBeNull()
    expect(screen.getByRole('radio', { name: /^Free/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /^Base/ }))
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeEnabled()
  })
})

// REQ-FLOTTA-072, dalla revisione: il titolare di un locale simulato non
// legge un progetto che non esiste.
describe('un locale simulato nella dashboard', () => {
  it('dice «simulato» al posto del progetto', async () => {
    const { readFileSync } = await import('node:fs')
    const codice = readFileSync('src/pages/Dashboard.jsx', 'utf8')
    expect(codice).toContain("istanza?.simulata ? 'simulato' : istanza?.progetto || progettoDi(cliente.slug)")
  })
})
