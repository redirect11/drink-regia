// @vitest-environment happy-dom
'use strict'

// LA BARRA E IL PIÈ DI PAGINA (REQ-FLOTTA-002): il menù con le sezioni
// della prima pagina, accesso e registrazione per chi non è dentro,
// dashboard ed esci per chi lo è, e sul telefono un tasto che apre il
// menù. L'utente, 22/10/2026: «una landing page con menu e tutto il resto».

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import it_ from '../src/i18n/home.it.js'

let utenteOsservato = null
// La vendita (REQ-FLOTTA-015, REQ-FLOTTA-043): null è quella di partenza,
// senza decisioni; undefined è «non ancora arrivata».
let venditaOsservata = null
// La registrazione in corso (REQ-FLOTTA-045): fra l'account e il cliente.
let registrazioneInCorso = false
vi.mock('../src/lib/db.js', () => ({
  registrazioneInCorso: () => registrazioneInCorso,
  // undefined: Firebase non ha ancora detto chi è (l'accesso in corso).
  osservaUtente: (cb) => {
    if (utenteOsservato !== undefined) cb(utenteOsservato)
    return () => {}
  },
  esci: vi.fn(),
  // Il traffico (REQ-FLOTTA-042): ogni pagina si conta; qui non si conta niente.
  tracciaPagina: vi.fn(),
  elencoMovimenti: async () => [],
  elencoTraffico: async () => [],
  statoFondatori: async () => null,
  // I codici sconto (REQ-FLOTTA-028) hanno i loro test in Backoffice.test.jsx.
  // Il catalogo dei temi (REQ-FLOTTA-032) ha i suoi test in CatalogoTemi.test.jsx.
  elencoTemi: vi.fn(async () => []),
  gestisciTemi: vi.fn(async () => ({ ok: true })),
  elencoSconti: vi.fn(async () => []),
  gestisciSconti: vi.fn(async () => ({ ok: true })),
  applicaSconto: vi.fn(async () => ({ ok: true })),
  // La prima pagina legge la vendita (REQ-FLOTTA-015): qui quella di partenza.
  osservaVendita: (cb) => {
    if (venditaOsservata !== undefined) cb(venditaOsservata)
    return () => {}
  },
  // Quello che il backoffice legge, per le prove delle sue sotto-rotte
  // (REQ-FLOTTA-005): un backoffice vuoto basta.
  elencoClienti: async () => [],
  elencoIstanze: async () => ({}),
  elencoRichieste: async () => ({}),
  elencoCassettiAI: async () => ({}),
  elencoRilasci: async () => [],
  elencoContatti: async () => [],
  osservaImpostazioniRegia: (cb) => {
    cb({})
    return () => {}
  },
  // Le regole degli aggiornamenti (REQ-FLOTTA-020), in «Rilasci».
  osservaRegoleAggiornamenti: (cb) => {
    cb({})
    return () => {}
  },
  // Le licenze protette (BUG-125 di tana-drink), in «Rilasci».
  osservaControlloLicenze: (cb) => {
    cb(null)
    return () => {}
  },
}))

import App from '../src/App.jsx'

const mostra = (percorso = '/') =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <App />
    </MemoryRouter>
  )

describe('la barra', () => {
  it('ha il menù delle sezioni e, per chi non è dentro, accesso e registrazione', () => {
    utenteOsservato = null
    mostra()
    const menu = screen.getByRole('navigation', { name: 'Principale' })
    // La home nuova (DESIGN.md §5.0, 30/10/2026): il menù ha tre voci —
    // Funzioni, Prezzi, Domande — e il bottone dice l'azione, «Attiva il tuo
    // locale», al posto di «Registra il locale». «Come funziona» resta una
    // sezione della pagina, non una voce del menù.
    for (const [testo, ancora] of [
      ['Funzioni', '/#funzioni'],
      ['Prezzi', '/#prezzi'],
      ['Domande', '/#domande'],
    ]) {
      expect(within(menu).getByRole('link', { name: testo })).toHaveAttribute('href', ancora)
    }
    expect(within(menu).getByRole('link', { name: 'Accedi' })).toHaveAttribute('href', '/accedi')
    expect(within(menu).getByRole('link', { name: 'Attiva il tuo locale' })).toHaveAttribute('href', '/registrati')
    // Il marchio (09/11/2026): «Lime SmartOrders» col logo decorativo, verso la prima pagina.
    const marchio = screen.getByRole('link', { name: 'Lime SmartOrders' })
    expect(marchio).toHaveAttribute('href', '/')
    expect(marchio.querySelector('svg.marchio-logo')).toHaveAttribute('aria-hidden', 'true')
    expect(within(menu).queryByRole('link', { name: 'Dashboard' })).toBeNull()
  })

  it('a chi è dentro mostra la dashboard ed esci; il backoffice solo all’admin', () => {
    utenteOsservato = { uid: 'u1', admin: true }
    mostra()
    const menu = screen.getByRole('navigation', { name: 'Principale' })
    expect(within(menu).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(menu).getByRole('link', { name: 'Backoffice' })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: 'Esci' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Accedi' })).toBeNull()
  })

  it('il tasto Menu apre e chiude il menù sul telefono', async () => {
    utenteOsservato = null
    const user = userEvent.setup()
    mostra()
    const tasto = screen.getByRole('button', { name: 'Menu' })
    expect(tasto).toHaveAttribute('aria-expanded', 'false')
    await user.click(tasto)
    expect(tasto).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Principale' })).toHaveClass('aperto')
    await user.click(tasto)
    expect(tasto).toHaveAttribute('aria-expanded', 'false')
  })
})

// REQ-DEV-002: il sito di test si dice tale. Nei test VITE_APP_ENV manca,
// come in locale: non è produzione, e il nastro c'è.
describe('il nastro TEST e la versione', () => {
  it('fuori dalla produzione c’è il nastro, e nel piè di pagina la versione di package.json', () => {
    utenteOsservato = null
    mostra()
    expect(screen.getByRole('note')).toHaveTextContent(/^TEST · v\d+\.\d+\.\d+/)
    expect(screen.getByTestId('versione')).toHaveTextContent(/^Versione v\d+\.\d+\.\d+/)
  })
})

describe('il piè di pagina', () => {
  it('porta a termini, privacy, prezzi e contatto', () => {
    utenteOsservato = null
    mostra()
    const piede = screen.getByRole('contentinfo')
    // Il marchio (09/11/2026): il logo decorativo, «Lime» e la qualifica
    // «SmartOrders»; sotto, il sottotitolo nella lingua della pagina.
    expect(within(piede).getByText('SmartOrders')).toBeInTheDocument()
    expect(piede.querySelector('.piede-marchio svg.marchio-logo')).toHaveAttribute('aria-hidden', 'true')
    expect(within(piede).getByText(it_.piede.sottotitolo)).toBeInTheDocument()
    expect(within(piede).getByRole('link', { name: 'Termini di servizio' })).toHaveAttribute('href', '/termini')
    expect(within(piede).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(within(piede).getByRole('link', { name: 'Prezzi' })).toHaveAttribute('href', '/#prezzi')
    expect(within(piede).getByRole('link', { name: /@/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
    expect(within(piede).getByText(/non è uno scontrino fiscale/)).toBeInTheDocument()
  })
})

// IL BACKOFFICE È SOLO DELL'ADMIN, IN OGNI SEZIONE (REQ-FLOTTA-005). Dal
// 30/10/2026 il backoffice ha sotto-rotte (/backoffice/locali, …/rilasci,
// …): il controllo del claim admin in App.jsx deve valere per tutte, non
// solo per /backoffice.
describe('le sotto-rotte del backoffice', () => {
  const SOTTO = ['/backoffice', '/backoffice/locali', '/backoffice/richieste', '/backoffice/rilasci', '/backoffice/vendita', '/backoffice/nuovo']

  it.each(SOTTO)('%s: chi non è dentro, o non è admin, torna alla prima pagina', async (percorso) => {
    for (const utente of [null, { uid: 'u1', admin: false }]) {
      utenteOsservato = utente
      const { unmount } = mostra(percorso)
      expect(screen.queryByRole('navigation', { name: 'Sezioni del backoffice' })).toBeNull()
      expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
      unmount()
    }
  })

  it.each(SOTTO.slice(1))('%s: l’admin ci entra, con la voce giusta attiva', async (percorso) => {
    utenteOsservato = { uid: 'u1', admin: true }
    mostra(percorso)
    const nav = await screen.findByRole('navigation', { name: 'Sezioni del backoffice' })
    expect(within(nav).getByRole('link', { current: 'page' })).toHaveAttribute('href', percorso)
  })

  it('/backoffice porta l’admin a «Locali»', async () => {
    utenteOsservato = { uid: 'u1', admin: true }
    mostra('/backoffice')
    const nav = await screen.findByRole('navigation', { name: 'Sezioni del backoffice' })
    expect(await within(nav).findByRole('link', { current: 'page' })).toHaveAttribute('href', '/backoffice/locali')
  })
})

// IL SITO CHIUSO (REQ-FLOTTA-043, l'utente, 07/11/2026: «una cosa per la
// produzione che rende il sito indisponibile finché non decido di renderlo
// disponibile […] una pagina semplice […] stile coming soon»). Nei test
// VITE_APP_ENV manca, come sul test: il sito è chiuso solo se l'admin lo
// spegne apposta (sito_aperto: false); non deciso vale aperto.
describe('il sito chiuso', () => {
  afterEach(() => {
    venditaOsservata = null
  })

  it('spento dall’admin: al posto della prima pagina c’è l’anteprima, in tutte e due le lingue, senza prezzi', () => {
    venditaOsservata = { sito_aperto: false }
    utenteOsservato = null
    const { unmount } = mostra('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Il sito apre a breve.')
    expect(screen.queryByText(/€/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Area riservata' })).toHaveAttribute('href', '/accedi')
    // L'email c'è nella pagina e nel piè di pagina.
    for (const l of screen.getAllByRole('link', { name: /info@/ })) expect(l).toHaveAttribute('href', expect.stringMatching(/^mailto:/))
    // Il menù ha solo «Accedi»: niente sezioni, niente «Attiva il tuo locale».
    const menu = screen.getByRole('navigation', { name: 'Principale' })
    expect(within(menu).getByRole('link', { name: 'Accedi' })).toBeInTheDocument()
    expect(within(menu).queryByRole('link', { name: 'Attiva il tuo locale' })).toBeNull()
    expect(within(menu).queryByRole('link', { name: 'Prezzi' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Registra il locale/ })).toBeNull()
    unmount()
    mostra('/en')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The site opens soon.')
  })

  it('spento, anche la registrazione è l’anteprima; l’accesso e il backoffice dell’admin restano', async () => {
    venditaOsservata = { sito_aperto: false }
    utenteOsservato = null
    const { unmount } = mostra('/registrati')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Il sito apre a breve.')
    unmount()
    const { unmount: u2 } = mostra('/accedi')
    expect(screen.getByRole('heading', { name: 'Accedi' })).toBeInTheDocument()
    u2()
    utenteOsservato = { uid: 'u1', admin: true }
    mostra('/backoffice/vendita')
    expect(await screen.findByRole('navigation', { name: 'Sezioni del backoffice' })).toBeInTheDocument()
  })

  // Trovato dal primo collaudo automatico (09/11/2026): Firebase fa entrare
  // l'utente appena creato l'account, prima che la Function scriva il
  // cliente; se App lo mandava alla dashboard, il rifiuto dello slug
  // spariva con la pagina.
  it('chi è entrato mentre la registrazione è ancora in corso resta sulla pagina di registrazione', () => {
    venditaOsservata = null
    utenteOsservato = { uid: 'nuovo', email: 'nuovo@example.it' }
    registrazioneInCorso = true
    try {
      mostra('/registrati')
      expect(screen.getByRole('heading', { name: 'Registra il tuo locale' })).toBeInTheDocument()
    } finally {
      registrazioneInCorso = false
    }
  })

  it('acceso, o non deciso fuori dalla produzione: la prima pagina di sempre', () => {
    utenteOsservato = null
    for (const v of [{ sito_aperto: true }, null]) {
      venditaOsservata = v
      const { unmount } = mostra('/')
      expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Il sito apre a breve.')
      expect(screen.getAllByRole('link', { name: 'Attiva il tuo locale' }).length).toBeGreaterThan(0)
      unmount()
    }
  })

  it('la regola della produzione: non deciso vale chiuso solo lì (src/lib/vendita.js)', async () => {
    const { sitoChiuso, venditaPulita } = await import('../src/lib/vendita.js')
    expect(sitoChiuso(venditaPulita(null), true)).toBe(true)
    expect(sitoChiuso(venditaPulita(null), false)).toBe(false)
    expect(sitoChiuso(venditaPulita({ sito_aperto: true }), true)).toBe(false)
    expect(sitoChiuso(venditaPulita({ sito_aperto: false }), false)).toBe(true)
    expect(sitoChiuso(undefined, true)).toBe(true)
    expect(venditaPulita({ sito_aperto: 'sì' }).sito_aperto).toBeNull()
    // In produzione, finché la vendita non è arrivata, la pagina non mostra niente (App.jsx).
    const { readFileSync } = await import('node:fs')
    const app = readFileSync('src/App.jsx', 'utf8')
    expect(app).toMatch(/if \(PRODUZIONE && vendita === undefined\) return null/)
    // La dashboard sa del sito chiuso: senza locale mostra l'anteprima, non
    // la registrazione (audit del 09/11/2026, finding 26, REQ-FLOTTA-055).
    expect(app).toContain('<Dashboard utente={utente} chiuso={chiuso} />')
  })
})

// La prima pagina non aspetta l'accesso (03/11/2026): è la vetrina, e la
// prima schermata compare subito, coi bottoni di chi non è entrato. Le
// pagine che dipendono dall'utente aspettano di sapere chi è.
describe('mentre l’accesso è in corso', () => {
  it('la prima pagina c’è già, in tutte e due le lingue', () => {
    utenteOsservato = undefined
    mostra('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Attiva il tuo locale' }).length).toBeGreaterThan(0)
  })

  it('su /en anche', () => {
    utenteOsservato = undefined
    mostra('/en')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('le pagine dell’account aspettano: nessun rinvio all’accesso prima del tempo', () => {
    utenteOsservato = undefined
    mostra('/dashboard')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Accedi' })).toBeNull()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })
})
