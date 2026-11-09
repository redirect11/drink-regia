// @vitest-environment happy-dom
'use strict'

// LA PAGINA «COMMERCIALE» (REQ-FLOTTA-041, REQ-FLOTTA-042): le tessere coi
// numeri di testa, il periodo nell'indirizzo, i grafici con la loro tabella,
// le tabelle degli abbonamenti e dei movimenti, l'esportazione. I numeri
// sono provati in commerciale.test.js; qui che la pagina li mostri.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  elencoMovimenti: vi.fn(async () => []),
  elencoTraffico: vi.fn(async () => []),
  statoFondatori: vi.fn(async () => null),
}))
vi.mock('../src/lib/db.js', () => db)

import Commerciale, { Colonne, numero, scaricaFile } from '../src/pages/Commerciale.jsx'
import { PIANI, euro } from '../src/lib/piani.js'

const ADESSO = new Date('2026-11-07T12:00:00.000Z')
const giorniFa = (n) => new Date(ADESSO.getTime() - n * 86400000).toISOString()
const giorno = (n) => giorniFa(n).slice(0, 10)
const FUTURO = { v7_startTransition: true, v7_relativeSplatPath: true }

function Dove() {
  const { pathname, search } = useLocation()
  return <output data-testid="dove">{pathname + search}</output>
}
const righe = [
  {
    cliente: { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'base', moduli: ['magazzino'], terminali: 1, creato_il: giorniFa(2), abbonamento: { stato: 'attivo', origine: 'stripe', dal: giorniFa(2), rinnovo_il: giorniFa(-10) } },
    istanza: { stato: 'attiva' },
    richiesta: null,
    stato: 'attiva',
    cassetto: null,
  },
  { cliente: { uid: 'f', slug: 'bar-free', nome_locale: 'Bar Free', email: 'f@x.it', piano: 'free', creato_il: giorniFa(40), abbonamento: { stato: 'attivo', origine: 'gratuito' } }, istanza: { stato: 'attiva' }, richiesta: null, stato: 'attiva', cassetto: null },
  { cliente: { uid: 'n', slug: 'bar-nuovo', nome_locale: 'Bar Nuovo', email: 'n@x.it', creato_il: giorniFa(1) }, istanza: null, richiesta: null, stato: 'da attivare', cassetto: null },
]
const mostra = (percorso = '/backoffice/commerciale', props = {}) =>
  render(
    <MemoryRouter initialEntries={[percorso]} future={FUTURO}>
      <Routes>
        <Route path="/backoffice/commerciale" element={<Commerciale righe={righe} contatti={[{ stato: 'aperta' }]} adesso={ADESSO} {...props} />} />
      </Routes>
      <Dove />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  db.elencoMovimenti.mockResolvedValue([
    { id: 'm1', il: giorniFa(1), tipo: 'abbonamento', uid: 'a', slug: 'bar-attivo', importo: 129.7, iva: 28.53, totale: 158.23, origine: 'stripe', descrizione: 'Attivazione; Piano Base' },
    { id: 'm2', il: giorniFa(50), tipo: 'manuale', uid: 'a', slug: 'bar-attivo', importo: 40, iva: 8.8, totale: 48.8, origine: 'manuale' },
  ])
  db.elencoTraffico.mockResolvedValue([
    { giorno: giorno(1), viste: 120, pagine: { home: 100, registrati: 20 }, provenienze: { diretto: 80, google: 40 }, lingue: { it: 110, en: 10 }, eventi: { registrazione: 3, checkout: 1, attivazione: 1 } },
    { giorno: giorno(45), viste: 60, pagine: { home: 60 }, provenienze: { diretto: 60 }, lingue: { it: 60 }, eventi: {} },
  ])
  db.statoFondatori.mockResolvedValue({ assegnati: { a: { numero: 1 } } })
})

describe('le tessere e il periodo', () => {
  it('mostra incasso, canone mensile, paganti e viste del periodo, col confronto', async () => {
    mostra()
    expect(await screen.findByTestId('kpi-incasso')).toHaveTextContent('129,70 €')
    // Il movimento di 50 giorni fa sta nei 30 giorni prima: il confronto lo dice.
    expect(screen.getByTestId('kpi-incasso')).toHaveTextContent('+224% sul periodo prima')
    expect(screen.getByTestId('kpi-incasso')).toHaveTextContent('1 movimento · prima 40 €')
    expect(screen.getByTestId('kpi-mrr')).toHaveTextContent(euro(PIANI.base.prezzo + 15))
    expect(screen.getByTestId('kpi-mrr')).toHaveTextContent(`${euro((PIANI.base.prezzo + 15) * 12)} all’anno`)
    expect(screen.getByTestId('kpi-paganti')).toHaveTextContent('1')
    expect(screen.getByTestId('kpi-paganti')).toHaveTextContent('2 registrati nel periodo · 2 app attive')
    expect(screen.getByTestId('kpi-viste')).toHaveTextContent('120')
    expect(screen.getByTestId('kpi-viste')).toHaveTextContent('+100% sul periodo prima')
    expect(screen.getByTestId('kpi-viste')).toHaveTextContent('3 registrazioni dal sito')
    expect(db.elencoMovimenti).toHaveBeenCalledTimes(1)
  })

  it('il periodo sta nell’indirizzo: 90 giorni prende anche il movimento vecchio; 30 è il predefinito e non si scrive', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/commerciale?periodo=90')
    expect(await screen.findByTestId('kpi-incasso')).toHaveTextContent('169,70 €')
    const periodo = () => screen.getByRole('combobox', { name: 'Periodo' })
    expect(periodo()).toHaveValue('90')
    await user.selectOptions(periodo(), '7')
    expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/commerciale?periodo=7')
    expect(screen.getByTestId('kpi-incasso')).toHaveTextContent('129,70 €')
    expect(screen.getByTestId('kpi-incasso')).toHaveTextContent('prima era zero')
    await user.selectOptions(periodo(), '30')
    expect(screen.getByTestId('dove')).toHaveTextContent(/^\/backoffice\/commerciale$/)
  })

  it('i clienti per classe, cosa si vende, l’imbuto, le provenienze, le scadenze', async () => {
    mostra()
    await screen.findByTestId('kpi-incasso')
    expect(screen.getByTestId('clienti-pagante')).toHaveTextContent('1')
    expect(screen.getByTestId('clienti-free')).toHaveTextContent('1')
    expect(screen.getByTestId('clienti-in_attesa')).toHaveTextContent('1')
    expect(screen.getByText(/Conversione dall’inizio: 1 paganti su 3 registrati \(33\.3%\)/)).toBeInTheDocument()
    const piani = screen.getByRole('table', { name: 'Per piano' })
    expect(within(piani).getByRole('row', { name: /Base/ })).toHaveTextContent('1')
    const moduli = screen.getByRole('table', { name: 'Per modulo' })
    expect(within(moduli).getByRole('row', { name: /Magazzino e fornitori/ })).toHaveTextContent(/Magazzino e fornitori100/)
    expect(screen.getByText(/Fondatori: 1 su 20, 19 liberi/)).toBeInTheDocument()
    const imbuto = screen.getByRole('region', { name: 'Dal visitatore al cliente' })
    expect(within(imbuto).getByText('Registrazioni').parentElement).toHaveTextContent('3 · 3%')
    expect(within(imbuto).getByText('Attivazioni chieste').parentElement).toHaveTextContent('1 · 100%')
    const provenienze = screen.getByRole('region', { name: 'Da dove arrivano' })
    expect(provenienze).toHaveTextContent('Diretto (nessun sito di provenienza)80')
    expect(provenienze).toHaveTextContent('Google40')
    expect(provenienze).toHaveTextContent('Lingua: 110 in italiano, 10 in inglese.')
    const attenzione = screen.getByRole('region', { name: 'Scadenze e attenzione' })
    expect(attenzione).toHaveTextContent('1 richiesta di contatto aperta')
    expect(attenzione).toHaveTextContent(/Rinnovo Stripe di Bar Attivo: 17 nov 2026/)
  })

  it('senza niente da gestire lo dice; senza movimenti dice dove compaiono', async () => {
    db.elencoMovimenti.mockResolvedValue([])
    db.elencoTraffico.mockResolvedValue([])
    db.statoFondatori.mockResolvedValue(null)
    render(
      <MemoryRouter initialEntries={['/backoffice/commerciale']} future={FUTURO}>
        <Routes>
          <Route path="/backoffice/commerciale" element={<Commerciale righe={[]} contatti={[]} adesso={ADESSO} />} />
        </Routes>
      </MemoryRouter>
    )
    expect(await screen.findByText('Niente in scadenza nei prossimi 14 giorni, niente da gestire.')).toBeInTheDocument()
    expect(screen.getByText(/Nessun incasso registrato ancora/)).toBeInTheDocument()
    expect(screen.getByTestId('kpi-viste')).toHaveTextContent('nessun dato ancora')
  })

  it('se i movimenti non si leggono lo dice a chi la ospita e mostra lo stesso i clienti', async () => {
    db.elencoMovimenti.mockRejectedValue(new Error('permesso negato'))
    const onErrore = vi.fn()
    mostra('/backoffice/commerciale', { onErrore })
    expect(await screen.findByTestId('kpi-paganti')).toHaveTextContent('1')
    expect(onErrore).toHaveBeenCalledWith('permesso negato')
  })
})

describe('le tabelle e l’esportazione', () => {
  it('gli abbonamenti e gli ultimi movimenti, in tabella', async () => {
    mostra()
    await screen.findByTestId('kpi-incasso')
    const abbonamenti = screen.getByRole('table', { name: 'Elenco degli abbonamenti' })
    const righeTab = within(abbonamenti).getAllByRole('row').slice(1)
    expect(righeTab[0]).toHaveTextContent(/Bar Attivobar-attivoPagantiBaseMagazzino e fornitori/)
    expect(righeTab[0]).toHaveTextContent('169,70 €')
    expect(righeTab.map((r) => r.textContent)).toEqual([expect.stringContaining('Bar Attivo'), expect.stringContaining('Bar Free'), expect.stringContaining('Bar Nuovo')])
    const movimenti = screen.getByRole('table', { name: 'Elenco dei movimenti' })
    expect(within(movimenti).getAllByRole('row')).toHaveLength(3)
    expect(within(movimenti).getAllByRole('row')[1]).toHaveTextContent(/bar-attivoAbbonamentoAttivazione; Piano Base129,70 €158,23 €stripe/)
  })

  it('«Esporta CSV» scarica un file con le righe della tabella', async () => {
    const user = userEvent.setup()
    const scaricati = []
    const creaUrl = vi.fn(() => 'blob:x')
    vi.stubGlobal('URL', { ...URL, createObjectURL: creaUrl, revokeObjectURL: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      scaricati.push(this.download)
    })
    mostra()
    await screen.findByTestId('kpi-incasso')
    const tasti = screen.getAllByRole('button', { name: 'Esporta CSV' })
    expect(tasti).toHaveLength(2)
    await user.click(tasti[0])
    await user.click(tasti[1])
    expect(scaricati).toEqual(['abbonamenti-2026-11-07.csv', 'movimenti-2026-11-07.csv'])
    const blob = creaUrl.mock.calls[0][0]
    expect(blob.type).toBe('text/csv;charset=utf-8')
    // Il file comincia col BOM, così Excel legge gli accenti.
    const testo = await blob.text()
    expect(testo.charCodeAt(0)).toBe(0xfeff)
    expect(testo.slice(1)).toMatch(/^Locale;Identificativo;Email;[\s\S]*Bar Attivo;bar-attivo/)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('scaricaFile libera l’indirizzo del file dopo averlo aperto', async () => {
    vi.useFakeTimers()
    const revoca = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:y', revokeObjectURL: revoca })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    scaricaFile('x.csv', 'a;b')
    expect(click).toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoca).toHaveBeenCalledWith('blob:y')
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})

// Il grafico a colonne: una serie sola, barre sottili con la punta tonda,
// un'etichetta sul giorno più alto, le date agli estremi e in mezzo, il
// titolo di ogni barra al passaggio, e i numeri in tabella sotto.
describe('il grafico a colonne', () => {
  const giorni = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']
  it('disegna una barra per giorno con valore, etichetta il massimo, e ha la tabella', () => {
    render(<Colonne titolo="Incasso per giorno" giorni={giorni} valori={[0, 10, 0, 0, 250, 0, 0, 0, 0, 5]} formato={(v) => `${v} €`} />)
    const svg = screen.getByRole('img', { name: 'Incasso per giorno: 10 giorni, massimo 250 €' })
    expect(svg.querySelectorAll('path.barra')).toHaveLength(3)
    expect(svg.querySelectorAll('text.etichetta-valore')).toHaveLength(1)
    expect(svg.querySelector('text.etichetta-valore')).toHaveTextContent('250 €')
    expect([...svg.querySelectorAll('text.etichetta-asse')].map((t) => t.textContent)).toEqual(['1/11', '5/11', '10/11'])
    expect([...svg.querySelectorAll('title')].map((t) => t.textContent)).toContain('5/11: 250 €')
    expect(screen.getByRole('heading', { name: /Incasso per giorno · totale 265 €/ })).toBeInTheDocument()
    const tabella = screen.getByRole('table')
    expect(within(tabella).getAllByRole('row')).toHaveLength(11)
    // Le barre non superano i 24px e lasciano aria nello slot.
    const d = svg.querySelector('path.barra').getAttribute('d')
    const larghezza = Number(/h([\d.]+)/.exec(d)[1]) + 8
    expect(larghezza).toBeLessThanOrEqual(24)
  })

  it('con una settimana scrive tutte le date; senza valori nessuna barra né etichetta', () => {
    render(<Colonne titolo="Viste per giorno" giorni={giorni.slice(0, 7)} valori={[0, 0, 0, 0, 0, 0, 0]} />)
    const svg = screen.getByRole('img', { name: /Viste per giorno/ })
    expect(svg.querySelectorAll('path.barra')).toHaveLength(0)
    expect(svg.querySelectorAll('text.etichetta-valore')).toHaveLength(0)
    expect(svg.querySelectorAll('text.etichetta-asse')).toHaveLength(7)
  })

  it('numero() mette il punto delle migliaia a mano', () => {
    expect(numero(1234567)).toBe('1.234.567')
    expect(numero(12.6)).toBe('13')
    expect(numero(null)).toBe('0')
  })
})
