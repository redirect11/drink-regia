// @vitest-environment happy-dom
'use strict'

// LA PRIMA PAGINA IN DUE LINGUE (REQ-FLOTTA-002, DESIGN.md §6). L'utente,
// 29/10/2026: «vorrei che fosse sia in inglese che in italiano».
// L'italiano su `/`, l'inglese su `/en`; il selettore IT / EN nella barra e
// nel piè di pagina ricorda la scelta; la lingua del browser propone
// l'altra pagina con un avviso, senza spostare nessuno; un browser in una
// terza lingua resta sull'italiano. Il resto del sito è in italiano, e la
// pagina inglese lo dice.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

// db.js finto, come negli altri test della pagina: nessun Firebase, e la
// coverage di src/lib non conta le sue funzioni come non provate.
vi.mock('../src/lib/db.js', () => ({
  osservaUtente: (cb) => (cb(null), () => {}),
  esci: vi.fn(),
  osservaVendita: (cb) => (cb(null), () => {}),
  tracciaPagina: vi.fn(),
}))

import App from '../src/App.jsx'
import en from '../src/i18n/home.en.js'
import it_ from '../src/i18n/home.it.js'
import { PIANI, MODULI, FONDATORI, ATTIVAZIONE, conIva } from '../src/lib/piani.js'
import { importo } from '../src/lib/lingua.js'
import { salvaPreferenza } from '../src/lib/lingua.js'

const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }
const mostra = (percorso = '/') =>
  render(
    <MemoryRouter initialEntries={[percorso]} future={FUTURO}>
      <App />
    </MemoryRouter>
  )
const browser = (lingue) => Object.defineProperty(navigator, 'languages', { value: lingue, configurable: true })
const titolo = () => screen.getByRole('heading', { level: 1 })

beforeEach(() => {
  // Una scrittura riuscita cancella la scelta tenuta in memoria da un test
  // in cui il browser non lasciava salvare (src/lib/lingua.js).
  salvaPreferenza('it')
  localStorage.clear()
  browser(['it-IT', 'it'])
})
afterEach(() => {
  delete navigator.languages
  vi.restoreAllMocks()
})

describe('la pagina inglese', () => {
  it('su /en è tutta in inglese: titolo, lang, menù, prezzi, piani e moduli', () => {
    mostra('/en')
    expect(titolo()).toHaveTextContent(en.hero.titolo)
    expect(document.documentElement).toHaveAttribute('lang', 'en')
    const menu = screen.getByRole('navigation', { name: 'Main' })
    expect(within(menu).getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/en#funzioni')
    expect(within(menu).getByRole('link', { name: 'Pricing' })).toHaveAttribute('href', '/en#prezzi')
    expect(within(menu).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/registrati')
    // Gli importi all'inglese, dal listino; i nomi dei piani anche, come in italiano.
    // DEC-0005: «€32.70 + VAT a month» e «€39.89 incl. VAT», all'inglese
    // anche i decimali (punto, non virgola), come le migliaia.
    for (const p of [PIANI.base, PIANI.completo]) {
      const scheda = screen.getByRole('article', { name: `${p.nome} plan` })
      expect(scheda).toHaveTextContent(`${importo(p.prezzo, 'en')} + VAT a month`)
      expect(scheda).toHaveTextContent(`${importo(conIva(p.prezzo), 'en')} incl. VAT`)
    }
    expect(importo(PIANI.base.prezzo, 'en')).toMatch(/^€\d+\.\d\d$/)
    const tabella = within(screen.getByRole('table'))
    for (const m of MODULI) expect(tabella.getByText(en.moduli[m.id].nome)).toBeInTheDocument()
    expect(screen.getByText(en.prezzi.notaScontrino)).toBeInTheDocument()
  })

  it('le condizioni nuove del listino anche in inglese, senza formati italiani', () => {
    mostra('/en')
    const prezzi = document.getElementById('prezzi')
    expect(within(prezzi).getByRole('region', { name: en.prezzi.fondatori.titolo })).toHaveTextContent(
      `The first ${FONDATORI.posti} venues: ${PIANI.base.nome} at ${importo(FONDATORI.prezzi.base, 'en')} + VAT a month`
    )
    expect(prezzi).toHaveTextContent(`One-off activation: ${importo(ATTIVAZIONE, 'en')} + VAT (${importo(conIva(ATTIVAZIONE), 'en')} incl. VAT)`)
    expect(prezzi).toHaveTextContent('Remote support is included up to 1 hour a month')
    // Nessun importo all'italiana («32,70 €», «IVA») sulla pagina inglese.
    expect(prezzi.textContent).not.toMatch(/\d,\d\d(?!\d)|\d €|IVA/)
  })

  it('dice che registrazione, account e termini sono in italiano', () => {
    mostra('/en')
    expect(screen.getAllByText(en.soloItaliano).length).toBeGreaterThan(0)
    const piede = screen.getByRole('contentinfo')
    expect(within(piede).getByRole('link', { name: /Terms of service \(in Italian\)/ })).toHaveAttribute('href', '/termini')
    // I bottoni verso la registrazione lo dicono anche al browser.
    for (const l of screen.getAllByRole('link', { name: 'Get started' })) expect(l).toHaveAttribute('hreflang', 'it')
  })

  it('la pagina italiana non ha note sull’italiano', () => {
    mostra('/')
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    expect(screen.queryByText(/in Italian/)).toBeNull()
  })
})

describe('l’indirizzo con le maiuscole', () => {
  // Revisione PR #20: React Router apre /EN come /en, e la barra deve
  // parlare la stessa lingua della pagina.
  it('/EN è la pagina inglese, barra compresa', () => {
    mostra('/EN')
    expect(titolo()).toHaveTextContent(en.hero.titolo)
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })
})

describe('il selettore IT / EN', () => {
  it('sta nella barra e nel piè di pagina, e segna la lingua della pagina', () => {
    mostra('/')
    const gruppi = screen.getAllByRole('group', { name: 'Lingua' })
    expect(gruppi).toHaveLength(2)
    expect(within(gruppi[0]).getByRole('link', { name: /IT/ })).toHaveAttribute('aria-current', 'true')
    expect(within(gruppi[0]).getByRole('link', { name: /EN – English/ })).toHaveAttribute('href', '/en')
    expect(within(gruppi[0]).getByRole('link', { name: /EN/ })).not.toHaveAttribute('aria-current')
  })

  it('scegliere EN porta alla pagina inglese e ricorda la scelta', async () => {
    const user = userEvent.setup()
    mostra('/')
    const [barra] = screen.getAllByRole('group', { name: 'Lingua' })
    await user.click(within(barra).getByRole('link', { name: /EN/ }))
    expect(titolo()).toHaveTextContent(en.hero.titolo)
    expect(localStorage.getItem('regia.lingua')).toBe('en')
  })

  it('scegliere IT dalla pagina inglese torna all’italiano e lo ricorda', async () => {
    const user = userEvent.setup()
    localStorage.setItem('regia.lingua', 'en')
    mostra('/en')
    const [barra] = screen.getAllByRole('group', { name: 'Language' })
    await user.click(within(barra).getByRole('link', { name: /IT/ }))
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    expect(localStorage.getItem('regia.lingua')).toBe('it')
  })

  it('fuori dalla prima pagina non c’è: il resto del sito è in italiano', () => {
    mostra('/termini')
    expect(screen.queryByRole('group', { name: 'Lingua' })).toBeNull()
  })
})

describe('la preferenza ricordata', () => {
  it('chi ha scelto l’inglese, tornando su /, trova la pagina inglese', () => {
    localStorage.setItem('regia.lingua', 'en')
    mostra('/')
    expect(titolo()).toHaveTextContent(en.hero.titolo)
  })

  it('chi ha scelto l’italiano resta sull’italiano anche col browser in inglese, e senza avviso', () => {
    localStorage.setItem('regia.lingua', 'it')
    browser(['en-US'])
    mostra('/')
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    expect(screen.queryByRole('complementary', { name: en.avvisoLingua.etichetta })).toBeNull()
  })

  it('se il browser non lascia ricordare, la pagina si apre lo stesso in italiano', () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    mostra('/')
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
  })
})

describe('il browser che non lascia salvare la scelta', () => {
  // Revisione PR #20: col vecchio «en» salvato e la scrittura che fallisce,
  // chi sceglieva IT tornava su /en. Ora il vecchio si toglie e la scelta
  // nuova vale finché la pagina è aperta.
  it('scegliere IT resta su IT anche se la scrittura fallisce', async () => {
    const user = userEvent.setup()
    localStorage.setItem('regia.lingua', 'en')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    mostra('/')
    expect(titolo()).toHaveTextContent(en.hero.titolo)
    const [barra] = screen.getAllByRole('group', { name: 'Language' })
    await user.click(within(barra).getByRole('link', { name: /IT/ }))
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    expect(localStorage.getItem('regia.lingua')).toBeNull()
  })
})

describe('l’avviso della lingua del browser', () => {
  it('col browser in inglese, la pagina italiana propone l’inglese senza spostare nessuno', async () => {
    const user = userEvent.setup()
    browser(['en-GB', 'en'])
    mostra('/')
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    const avviso = screen.getByRole('complementary', { name: en.avvisoLingua.etichetta })
    expect(avviso).toHaveAttribute('lang', 'en')
    expect(avviso).toHaveTextContent(en.avvisoLingua.testo)
    expect(within(avviso).getByRole('link', { name: en.avvisoLingua.vai })).toHaveAttribute('href', '/en')
    // «Resta in italiano»: l'avviso sparisce e la scelta si ricorda.
    await user.click(within(avviso).getByRole('button', { name: en.avvisoLingua.resta }))
    expect(screen.queryByRole('complementary', { name: en.avvisoLingua.etichetta })).toBeNull()
    expect(localStorage.getItem('regia.lingua')).toBe('it')
  })

  it('seguire l’avviso porta all’inglese e lo ricorda', async () => {
    const user = userEvent.setup()
    browser(['en-US'])
    mostra('/')
    await user.click(screen.getByRole('link', { name: en.avvisoLingua.vai }))
    expect(titolo()).toHaveTextContent(en.hero.titolo)
    expect(localStorage.getItem('regia.lingua')).toBe('en')
    expect(screen.queryByRole('complementary', { name: it_.avvisoLingua.etichetta })).toBeNull()
  })

  it('un browser in tedesco ripiega sull’italiano: su / nessun avviso', () => {
    browser(['de-DE', 'de'])
    mostra('/')
    expect(titolo()).toHaveTextContent(it_.hero.titolo)
    expect(screen.queryByRole('complementary', { name: en.avvisoLingua.etichetta })).toBeNull()
  })

  it('col browser in italiano, la pagina inglese propone l’italiano', () => {
    mostra('/en')
    const avviso = screen.getByRole('complementary', { name: it_.avvisoLingua.etichetta })
    expect(avviso).toHaveAttribute('lang', 'it')
    expect(within(avviso).getByRole('link', { name: it_.avvisoLingua.vai })).toHaveAttribute('href', '/')
  })
})
