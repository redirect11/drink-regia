// @vitest-environment happy-dom
'use strict'

// GLI ORARI DI SERVIZIO NELL'AREA DEL TITOLARE E NEL BACKOFFICE
// (REQ-FLOTTA-095). Daniele, 13/11/2026: «Orario di servizio che non può
// cambiare se non previa approvazione nostra [...]. Se invece è
// semplicemente sbagliato, possiamo dare una settimana di tempo per
// cambiarlo se necessario dopo di che rimane quello e si può cambiare solo
// se approvato da me admin». Nei 7 giorni il titolare li corregge; dopo li
// legge e chiede il cambio col motivo; l'admin approva o rifiuta dalla
// scheda del locale. I locali senza orari li scrivono la prima volta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const db = vi.hoisted(() => ({
  correggiOrari: vi.fn(async () => ({})),
  chiediCambioOrari: vi.fn(async () => ({})),
  decidiCambioOrari: vi.fn(async () => ({})),
  scriviOrariAdmin: vi.fn(async () => ({})),
}))
vi.mock('../src/lib/db.js', () => db)

import OrariServizio, { AvvisoOrari, OrariNelBackoffice } from '../src/pages/OrariServizio.jsx'

const aperto = (apre, chiude) => ({ apre, chiude })
const SERA = { lun: { chiuso: true }, mar: aperto('18:00', '02:00'), mer: aperto('18:00', '02:00'), gio: aperto('18:00', '02:00'), ven: aperto('18:00', '02:00'), sab: aperto('18:00', '02:00'), dom: aperto('18:00', '02:00') }
const IMPOSTATI = '2026-11-13T10:00:00.000Z'
const NEI_7_GIORNI = new Date('2026-11-15T10:00:00Z')
const DOPO = new Date('2026-12-01T10:00:00Z')
const cliente = (os = {}) => ({ uid: 'u1', slug: 'bar-mario', orari_servizio: { giorni: SERA, impostati_il: IMPOSTATI, richiesta: null, storia: [], ...os } })
const mostra = (el) => render(<MemoryRouter>{el}</MemoryRouter>)

beforeEach(() => vi.clearAllMocks())

describe('nell’area del titolare', () => {
  it('nei 7 giorni li corregge da sé: si dice fino a quando, e «Salva» manda gli orari puliti', async () => {
    const user = userEvent.setup()
    mostra(<OrariServizio cliente={cliente()} adesso={NEI_7_GIORNI} />)
    expect(screen.getByText(/Li puoi correggere fino al 20 novembre 2026/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Martedì, apertura'), { target: { value: '19:00' } })
    await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
    expect(db.correggiOrari).toHaveBeenCalledWith({ ...SERA, mar: aperto('19:00', '02:00') })
    expect(await screen.findByText('Orari salvati.')).toBeInTheDocument()
    expect(db.chiediCambioOrari).not.toHaveBeenCalled()
  })

  it('con orari sbagliati non manda niente e l’errore sta sul giorno', async () => {
    const user = userEvent.setup()
    mostra(<OrariServizio cliente={cliente()} adesso={NEI_7_GIORNI} />)
    fireEvent.change(screen.getByLabelText('Mercoledì, chiusura'), { target: { value: '' } })
    await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
    expect(screen.getByLabelText('Mercoledì, apertura')).toHaveAttribute('aria-invalid', 'true')
    expect(db.correggiOrari).not.toHaveBeenCalled()
  })

  it('dopo i 7 giorni li legge soltanto, e il cambio è una richiesta col motivo', async () => {
    const user = userEvent.setup()
    mostra(<OrariServizio cliente={cliente()} adesso={DOPO} />)
    expect(screen.queryByRole('button', { name: 'Salva gli orari' })).toBeNull()
    expect(screen.queryByLabelText('Martedì, apertura')).toBeNull()
    expect(screen.getAllByText('18:00–02:00 (fino al giorno dopo)', { selector: 'dd' })).toHaveLength(6)
    await user.click(screen.getByRole('button', { name: 'Chiedi un cambio degli orari' }))
    await user.click(screen.getByLabelText('Lunedì chiuso'))
    fireEvent.change(screen.getByLabelText('Lunedì, apertura'), { target: { value: '12:00' } })
    fireEvent.change(screen.getByLabelText('Lunedì, chiusura'), { target: { value: '15:00' } })
    // Senza un motivo vero non parte.
    await user.type(screen.getByLabelText('Motivo del cambio'), 'boh')
    await user.click(screen.getByRole('button', { name: 'Manda la richiesta' }))
    expect(screen.getByText(/almeno 10 caratteri/)).toBeInTheDocument()
    expect(db.chiediCambioOrari).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText('Motivo del cambio'), ', da dicembre apriamo a pranzo')
    await user.click(screen.getByRole('button', { name: 'Manda la richiesta' }))
    expect(db.chiediCambioOrari).toHaveBeenCalledWith({ ...SERA, lun: aperto('12:00', '15:00') }, 'boh, da dicembre apriamo a pranzo')
    expect(await screen.findByText(/Richiesta mandata/)).toBeInTheDocument()
    expect(db.correggiOrari).not.toHaveBeenCalled()
  })

  it('una richiesta in attesa si legge, e non se ne manda un’altra', () => {
    const richiesta = { stato: 'in attesa', giorni: { ...SERA, lun: aperto('12:00', '15:00') }, prima: SERA, motivo: 'Da dicembre apriamo a pranzo.', chiesta_il: '2026-11-30T10:00:00.000Z', chiesta_da: 'u1' }
    mostra(<OrariServizio cliente={cliente({ richiesta })} adesso={DOPO} />)
    expect(screen.getByText(/Richiesta di cambio in attesa/)).toHaveTextContent('Da dicembre apriamo a pranzo.')
    expect(screen.queryByRole('button', { name: 'Chiedi un cambio degli orari' })).toBeNull()
  })

  it('l’ultima decisione dell’admin si legge, con la nota', () => {
    const storia = [{ tipo: 'rifiutata', chi: 'u1', quando: '2026-11-30T12:00:00.000Z', prima: SERA, dopo: SERA, motivo: 'x', deciso_da: 'admin', nota: 'Manca il cartello.' }]
    mostra(<OrariServizio cliente={cliente({ storia })} adesso={DOPO} />)
    expect(screen.getByText(/L’ultima richiesta è stata rifiutata/)).toHaveTextContent('Manca il cartello.')
  })

  // Punto 9 di Daniele: il titolare lo legge chiaramente.
  it('con orari senza pausa, l’avviso che la sospensione può arrivare durante il servizio', () => {
    const h24 = Object.fromEntries(Object.keys(SERA).map((g) => [g, aperto('00:00', '24:00')]))
    mostra(<OrariServizio cliente={cliente({ giorni: h24 })} adesso={DOPO} />)
    expect(screen.getByText(/sospensione per mancato pagamento può arrivare durante il servizio/)).toBeInTheDocument()
    expect(screen.getAllByText('aperto 24 ore (00:00–24:00)')).toHaveLength(7)
  })

  // Punto 10: i locali di prima e quelli creati dall'admin, senza orari.
  it('senza orari: si dice cosa succede finché mancano, e si scrivono la prima volta', async () => {
    const user = userEvent.setup()
    mostra(<OrariServizio cliente={{ uid: 'u2', slug: 'pub-vecchio' }} adesso={DOPO} />)
    expect(screen.getByText(/finché mancano, se un pagamento non arriva il locale si ferma al taglio della giornata/)).toBeInTheDocument()
    for (const g of ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']) {
      fireEvent.change(screen.getByLabelText(`${g}, apertura`), { target: { value: '07:00' } })
      fireEvent.change(screen.getByLabelText(`${g}, chiusura`), { target: { value: '15:00' } })
    }
    await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
    expect(db.correggiOrari).toHaveBeenCalledWith(expect.objectContaining({ dom: aperto('07:00', '15:00') }))
  })

  it('l’errore della regia si legge', async () => {
    const user = userEvent.setup()
    db.correggiOrari.mockRejectedValueOnce(new Error('Sono passati 7 giorni: per cambiare gli orari manda una richiesta con il motivo.'))
    mostra(<OrariServizio cliente={cliente()} adesso={NEI_7_GIORNI} />)
    await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
    expect(await screen.findByText(/Sono passati 7 giorni/)).toBeInTheDocument()
  })

  // Revisione del 13/11/2026, D8: con gli orari ma senza una data valida
  // il sito fa come la regia: si correggono, e il primo salvataggio fa
  // partire i 7 giorni.
  it('D8: con gli orari ma senza data, si correggono da sé', async () => {
    const user = userEvent.setup()
    mostra(<OrariServizio cliente={cliente({ impostati_il: undefined })} adesso={DOPO} />)
    expect(screen.getByText(/dal primo salvataggio hai 7 giorni/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
    expect(db.correggiOrari).toHaveBeenCalledWith(SERA)
    expect(screen.queryByRole('button', { name: 'Chiedi un cambio degli orari' })).toBeNull()
  })

  // Gli orari scritti dall'admin a un locale che non li aveva: i 7 giorni
  // del titolare non partono (correggibili_fino), si chiede il cambio.
  it('scritti dall’admin a un locale che non li aveva: si leggono e si chiede il cambio', () => {
    mostra(<OrariServizio cliente={cliente({ impostati_il: '2026-11-30T10:00:00.000Z', correggibili_fino: '2026-11-30T10:00:00.000Z' })} adesso={DOPO} />)
    expect(screen.queryByRole('button', { name: 'Salva gli orari' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Chiedi un cambio degli orari' })).toBeInTheDocument()
  })

  it('nella panoramica, un avviso finché gli orari mancano', () => {
    const { unmount } = mostra(<AvvisoOrari cliente={{ uid: 'u2' }} />)
    expect(screen.getByRole('link', { name: 'Indica gli orari' })).toHaveAttribute('href', '/dashboard/locale#orari')
    unmount()
    mostra(<AvvisoOrari cliente={cliente()} />)
    expect(screen.queryByRole('link', { name: 'Indica gli orari' })).toBeNull()
  })
})

describe('nel backoffice', () => {
  const richiesta = { stato: 'in attesa', giorni: { ...SERA, lun: aperto('12:00', '15:00') }, prima: SERA, motivo: 'Da dicembre apriamo a pranzo.', chiesta_il: '2026-11-30T10:00:00.000Z', chiesta_da: 'u1' }

  it('gli orari del locale, e niente da decidere senza richiesta', () => {
    mostra(<OrariNelBackoffice cliente={cliente()} />)
    expect(screen.getByText('Martedì: 18:00–02:00 (fino al giorno dopo)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approva' })).toBeNull()
  })

  it('la richiesta col prima, il dopo e il motivo; «Approva» decide con la nota', async () => {
    const user = userEvent.setup()
    const onFatto = vi.fn()
    mostra(<OrariNelBackoffice cliente={cliente({ richiesta })} onFatto={onFatto} />)
    const riquadro = screen.getByLabelText('Richiesta di cambio degli orari')
    expect(riquadro).toHaveTextContent('Da dicembre apriamo a pranzo.')
    expect(within(riquadro).getByText('Lunedì: chiuso → 12:00–15:00')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Nota per il titolare/), 'Visto il cartello.')
    await user.click(screen.getByRole('button', { name: 'Approva' }))
    expect(db.decidiCambioOrari).toHaveBeenCalledWith('u1', 'approvata', 'Visto il cartello.')
    expect(onFatto).toHaveBeenCalled()
  })

  it('«Rifiuta» decide senza nota, e un errore va a chi lo mostra', async () => {
    const user = userEvent.setup()
    const onErrore = vi.fn()
    db.decidiCambioOrari.mockRejectedValueOnce(new Error('Nessuna richiesta in attesa.'))
    mostra(<OrariNelBackoffice cliente={cliente({ richiesta })} onErrore={onErrore} />)
    await user.click(screen.getByRole('button', { name: 'Rifiuta' }))
    expect(db.decidiCambioOrari).toHaveBeenCalledWith('u1', 'rifiutata', null)
    expect(onErrore).toHaveBeenCalledWith('Nessuna richiesta in attesa.')
  })

  it('senza orari, il backoffice dice che vale il taglio della giornata', () => {
    mostra(<OrariNelBackoffice cliente={{ uid: 'u2', slug: 'pub-vecchio' }} />)
    expect(screen.getByText(/Non indicati: la sospensione per pagamento arriva al taglio della giornata/)).toBeInTheDocument()
  })

  it('D8: con gli orari ma senza data, il backoffice dice che i 7 giorni non sono partiti', () => {
    mostra(<OrariNelBackoffice cliente={cliente({ impostati_il: undefined })} />)
    expect(screen.getByText(/i 7 giorni partono dal suo primo salvataggio/)).toBeInTheDocument()
  })

  // Daniele, 13/11/2026, sugli orari scritti dall'admin: «si». Per
  // qualunque locale, in qualunque momento, anche uno senza orari.
  describe('l’admin scrive gli orari', () => {
    it('a un locale senza orari: «Scrivi gli orari», il modulo, la nota, e la callable con l’uid del cliente', async () => {
      const user = userEvent.setup()
      const onFatto = vi.fn()
      mostra(<OrariNelBackoffice cliente={{ uid: 'u2', slug: 'pub-vecchio' }} onFatto={onFatto} />)
      await user.click(screen.getByRole('button', { name: 'Scrivi gli orari' }))
      for (const g of ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']) {
        fireEvent.change(screen.getByLabelText(`${g}, apertura`), { target: { value: '07:00' } })
        fireEvent.change(screen.getByLabelText(`${g}, chiusura`), { target: { value: '15:00' } })
      }
      await user.click(screen.getByLabelText('Domenica aperto 24 ore'))
      await user.type(screen.getByLabelText(/Nota per la traccia/), 'Dal sito del locale.')
      await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
      expect(db.scriviOrariAdmin).toHaveBeenCalledWith('u2', expect.objectContaining({ lun: aperto('07:00', '15:00'), dom: aperto('00:00', '24:00') }), 'Dal sito del locale.')
      expect(onFatto).toHaveBeenCalled()
      expect(screen.queryByRole('button', { name: 'Salva gli orari' })).toBeNull()
    })

    it('a un locale con gli orari, anche con una richiesta in attesa: «Correggi gli orari» parte da quelli di adesso, e la richiesta resta da decidere', async () => {
      const user = userEvent.setup()
      mostra(<OrariNelBackoffice cliente={cliente({ richiesta })} />)
      await user.click(screen.getByRole('button', { name: 'Correggi gli orari' }))
      expect(screen.getByLabelText('Martedì, apertura')).toHaveValue('18:00')
      expect(screen.getByRole('button', { name: 'Approva' })).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Martedì, chiusura'), { target: { value: '01:00' } })
      await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
      expect(db.scriviOrariAdmin).toHaveBeenCalledWith('u1', { ...SERA, mar: aperto('18:00', '01:00') }, null)
    })

    it('orari sbagliati: l’errore sta sul giorno e non si manda niente; «Annulla» chiude', async () => {
      const user = userEvent.setup()
      mostra(<OrariNelBackoffice cliente={cliente()} />)
      await user.click(screen.getByRole('button', { name: 'Correggi gli orari' }))
      fireEvent.change(screen.getByLabelText('Mercoledì, chiusura'), { target: { value: '18:00' } })
      await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
      expect(screen.getByText(/per un giorno aperto 24 ore scrivi 00:00–24:00/)).toBeInTheDocument()
      expect(db.scriviOrariAdmin).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Annulla' }))
      expect(screen.queryByRole('button', { name: 'Salva gli orari' })).toBeNull()
    })

    it('un errore della regia va a chi lo mostra, e il modulo resta aperto', async () => {
      const user = userEvent.setup()
      const onErrore = vi.fn()
      db.scriviOrariAdmin.mockRejectedValueOnce(new Error('Solo l’amministratore.'))
      mostra(<OrariNelBackoffice cliente={cliente()} onErrore={onErrore} />)
      await user.click(screen.getByRole('button', { name: 'Correggi gli orari' }))
      await user.click(screen.getByRole('button', { name: 'Salva gli orari' }))
      expect(onErrore).toHaveBeenCalledWith('Solo l’amministratore.')
      expect(screen.getByRole('button', { name: 'Salva gli orari' })).toBeInTheDocument()
    })
  })
})
