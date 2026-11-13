// @vitest-environment happy-dom
'use strict'

// LA REGISTRAZIONE A PASSI (REQ-FLOTTA-003): ogni passo si controlla
// prima di andare avanti, l'errore sta accanto alla casella, lo slug si
// vede mentre si scrive il nome, e alla fine si crea l'account con tutti i
// blocchi. Dal 13/11/2026 dopo il locale c'è il passo degli orari di
// servizio (REQ-FLOTTA-095, i suoi test in RegistratiOrari.test.jsx): qui
// passoLocale lo attraversa con orari validi.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  registra: vi.fn(),
  completaRegistrazione: vi.fn(async () => ({})),
  entraConGoogle: vi.fn(),
  esci: vi.fn(async () => {}),
  // Quella vera di db.js: riconosce il rifiuto della Function per lo slug.
  slugGiaInUso: (err) => String(err?.code || '').includes('already-exists') && err?.details?.campo === 'slug',
}))
vi.mock('../src/lib/db.js', () => db)

import Registrati from '../src/pages/Registrati.jsx'

const mostra = (pagina = <Registrati />) =>
  render(
    <MemoryRouter initialEntries={['/registrati']}>
      <Routes>
        <Route path="/registrati" element={pagina} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
      </Routes>
    </MemoryRouter>
  )

beforeEach(() => vi.clearAllMocks())

async function passoAccount(user) {
  await user.type(screen.getByLabelText('Email'), 'mario@example.it')
  await user.type(screen.getByLabelText(/^Password/), 'bar-mario-2026')
  await user.type(screen.getByLabelText('Ripeti la password'), 'bar-mario-2026')
  await user.click(screen.getByRole('button', { name: 'Avanti' }))
}

async function passoLocale(user) {
  await user.type(screen.getByLabelText('Nome del locale'), 'Bar Mario')
  await user.selectOptions(screen.getByLabelText('Tipo di locale'), 'bar')
  await user.type(screen.getByLabelText('Indirizzo'), 'Via Roma 1')
  await user.type(screen.getByLabelText('CAP'), '80035')
  await user.type(screen.getByLabelText('Città'), 'Nola')
  await user.type(screen.getByLabelText('Provincia'), 'na')
  await user.type(screen.getByLabelText('Telefono del locale'), '081 1234567')
  await user.click(screen.getByRole('button', { name: 'Avanti' }))
  await passoOrari(user)
}

// Tutti i giorni dalle 18 alle 2 di notte.
async function passoOrari(user) {
  for (const g of ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']) {
    fireEvent.change(screen.getByLabelText(`${g}, apertura`), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText(`${g}, chiusura`), { target: { value: '02:00' } })
  }
  await user.click(screen.getByRole('button', { name: 'Avanti' }))
}

async function passoFatturazione(user) {
  await user.type(screen.getByLabelText('Ragione sociale'), 'Bar Mario srl')
  await user.type(screen.getByLabelText('Partita IVA'), '01234567897')
  await user.type(screen.getByLabelText('PEC'), 'bar@pec.it')
  await user.click(screen.getByRole('button', { name: 'Avanti' }))
}

describe('registrarsi', () => {
  it('non si va avanti con un passo sbagliato, e l’errore sta accanto alla casella', async () => {
    const user = userEvent.setup()
    mostra()
    await user.type(screen.getByLabelText('Email'), 'mario@example.it')
    await user.type(screen.getByLabelText(/^Password/), 'corta1')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    expect(screen.getByText(/Almeno 10 caratteri/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByLabelText('Nome del locale')).toBeNull()
  })

  it('mostra l’indirizzo che l’app avrà mentre si scrive il nome', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await user.type(screen.getByLabelText('Nome del locale'), 'Bar Mario')
    expect(screen.getByText(/bar-mario\./)).toBeInTheDocument()
  })

  it('la fattura elettronica vuole la PEC o il codice destinatario', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await user.type(screen.getByLabelText('Ragione sociale'), 'Bar Mario srl')
    await user.type(screen.getByLabelText('Partita IVA'), '01234567897')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    expect(screen.getByText(/PEC o il codice destinatario/)).toBeInTheDocument()
  })

  it('senza i consensi non si crea l’account; con tutto, si crea e si va alla dashboard', async () => {
    const user = userEvent.setup()
    db.registra.mockResolvedValue({ slug: 'bar-mario' })
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await passoFatturazione(user)
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(screen.getByText(/vanno accettati i termini/)).toBeInTheDocument()
    expect(db.registra).not.toHaveBeenCalled()

    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(db.registra).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'mario@example.it',
        password: 'bar-mario-2026',
        locale: expect.objectContaining({ nome: 'Bar Mario', tipo: 'bar', cap: '80035', provincia: 'NA' }),
        fatturazione: expect.objectContaining({ ragione_sociale: 'Bar Mario srl', partita_iva: '01234567897', pec: 'bar@pec.it' }),
        referente: expect.objectContaining({ nome: 'Mario', cognome: 'Rossi', termini: true, privacy: true }),
      })
    )
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  // REQ-FLOTTA-045 (audit del 09/11/2026, finding 4): lo slug lo controlla
  // la Function; se è di un altro locale si torna al passo del locale con
  // la casella dell'identificativo, che prima non c'era, e si riprova con
  // quello scelto. Chi non ha il problema non vede mai la casella.
  it('se l’identificativo è già in uso si torna al locale, si sceglie un altro identificativo e si riprova con quello', async () => {
    const user = userEvent.setup()
    db.registra.mockRejectedValueOnce({ code: 'functions/already-exists', message: 'Questo identificativo è già in uso: scegline un altro.', details: { campo: 'slug', slug: 'bar-mario' } })
    db.registra.mockResolvedValueOnce({ slug: 'bar-mario-nola' })
    mostra()
    await passoAccount(user)
    expect(screen.queryByLabelText(/Identificativo dell’app/)).toBeNull()
    await passoLocale(user)
    await passoFatturazione(user)
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(db.registra).toHaveBeenCalledTimes(1)
    expect(db.registra.mock.calls[0][0]).not.toHaveProperty('slug')
    // Al passo del locale, con la casella piena dello slug rifiutato e l'errore accanto.
    expect(await screen.findByText('Questo identificativo è già in uso: scegline un altro.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Passi della registrazione' }).querySelector('[aria-current="step"]')).toHaveTextContent('Il locale')
    const casella = screen.getByLabelText(/Identificativo dell’app/)
    expect(casella).toHaveValue('bar-mario')
    expect(casella).toHaveAttribute('aria-invalid', 'true')
    await user.clear(casella)
    await user.type(casella, 'Bar-Mario-Nola')
    expect(screen.getByText(/bar-mario-nola\./)).toBeInTheDocument()
    // Locale, orari (già scritti), fatturazione: tre «Avanti».
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(db.registra).toHaveBeenCalledTimes(2)
    expect(db.registra.mock.calls[1][0]).toMatchObject({ email: 'mario@example.it', slug: 'bar-mario-nola', locale: expect.objectContaining({ nome: 'Bar Mario' }) })
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  // Trovato dal primo collaudo automatico (09/11/2026, REQ-DEV-009):
  // «Avanti» e il bottone che invia erano lo stesso <button>, a cui React
  // cambiava il type da «button» a «submit» dentro il click; il browser
  // decide cosa fa un click dopo i gestori, lo trovava «submit» e inviava
  // il modulo appena arrivati al referente. Devono essere due elementi:
  // quello di «Avanti» sparisce dal documento, e al referente si arriva
  // senza errori e senza chiamate.
  it('«Avanti» e «Crea l’account» sono due bottoni diversi: arrivare al referente non invia niente', async () => {
    const user = userEvent.setup()
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await user.type(screen.getByLabelText('Ragione sociale'), 'Bar Mario srl')
    await user.type(screen.getByLabelText('Partita IVA'), '01234567897')
    await user.type(screen.getByLabelText('PEC'), 'bar@pec.it')
    const avanti = screen.getByRole('button', { name: 'Avanti' })
    await user.click(avanti)
    const invia = screen.getByRole('button', { name: /Crea l’account/ })
    expect(invia).not.toBe(avanti)
    expect(avanti.isConnected).toBe(false)
    expect(db.registra).not.toHaveBeenCalled()
    expect(document.querySelectorAll('.errore')).toHaveLength(0)
  })

  it('un identificativo scelto male lo dice accanto alla sua casella, e non si va avanti', async () => {
    const user = userEvent.setup()
    db.registra.mockRejectedValueOnce({ code: 'functions/already-exists', details: { campo: 'slug' } })
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await passoFatturazione(user)
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    const casella = await screen.findByLabelText(/Identificativo dell’app/)
    await user.clear(casella)
    await user.type(casella, 'demo')
    await user.click(screen.getByRole('button', { name: 'Avanti' }))
    expect(screen.getByText(/Troppo corto|riservato/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Identificativo dell’app/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Nome del locale')).not.toHaveAttribute('aria-invalid', 'true')
  })

  it('un errore di Firebase si legge in italiano', async () => {
    const user = userEvent.setup()
    db.registra.mockRejectedValue({ code: 'auth/email-already-in-use' })
    mostra()
    await passoAccount(user)
    await passoLocale(user)
    await passoFatturazione(user)
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: /Crea l’account/ }))
    expect(await screen.findByText(/ha già un account/)).toBeInTheDocument()
  })
})

// REQ-FLOTTA-038: chi è entrato con Google ha l'account ma non il locale.
describe('completare la registrazione con l’account che c’è già', () => {
  const utente = { uid: 'g1', email: 'mario@gmail.com', emailVerificata: true }

  it('parte dal locale, senza il passo dell’account né «Indietro», e alla fine scrive solo il cliente', async () => {
    const user = userEvent.setup()
    mostra(<Registrati completa={utente} />)
    expect(screen.getByRole('heading', { name: 'Completa la registrazione' })).toBeInTheDocument()
    expect(screen.getByText(/Sei entrato come mario@gmail\.com/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Password/)).toBeNull()
    expect(screen.queryByRole('button', { name: /con Google/ })).toBeNull()
    expect(screen.queryByText('Account', { selector: 'li' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Indietro' })).toBeNull()
    await passoLocale(user)
    await passoFatturazione(user)
    await user.type(screen.getByLabelText('Nome'), 'Mario')
    await user.type(screen.getByLabelText('Cognome'), 'Rossi')
    await user.click(screen.getByLabelText(/accetto i/))
    await user.click(screen.getByLabelText(/informativa sulla privacy/))
    await user.click(screen.getByRole('button', { name: 'Salva i dati del locale' }))
    expect(db.completaRegistrazione).toHaveBeenCalledWith({
      locale: expect.objectContaining({ nome: 'Bar Mario', provincia: 'NA' }),
      orari: expect.objectContaining({ lun: { apre: '18:00', chiude: '02:00' } }),
      fatturazione: expect.objectContaining({ partita_iva: '01234567897' }),
      referente: expect.objectContaining({ nome: 'Mario', termini: true, privacy: true }),
    })
    expect(db.registra).not.toHaveBeenCalled()
  })

  it('con l’account sbagliato si esce', async () => {
    const user = userEvent.setup()
    mostra(<Registrati completa={utente} />)
    await user.click(screen.getByRole('button', { name: 'Esci' }))
    expect(db.esci).toHaveBeenCalledTimes(1)
  })
})

// REQ-FLOTTA-083: se la regia dice che l'email ha già un account, lo si
// legge accanto alla casella dell'email.
describe('l’email che ha già un account', () => {
  it('il messaggio della regia arriva come tale', async () => {
    const { messaggio } = await import('../src/pages/Registrati.jsx')
    expect(messaggio({ code: 'functions/already-exists', message: 'Esiste già un account con questa email: entra con quello.', details: { campo: 'email' } })).toBe('Esiste già un account con questa email: entra con quello.')
  })
})
