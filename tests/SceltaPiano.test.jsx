// @vitest-environment happy-dom
'use strict'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): il prezzo del mese si aggiorna
// mentre si sceglie, e «Vai al pagamento» chiama la Function del Checkout.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ vendita: null, contatto: null }))
const db = vi.hoisted(() => ({
  avviaPagamento: vi.fn(),
  cambiaScelta: vi.fn(),
  scegliFree: vi.fn(async () => ({ ok: true })),
  chiediContatto: vi.fn(async () => ({ ok: true })),
  osservaContatto: vi.fn((uid, cb) => {
    cb(stato.contatto)
    return () => {}
  }),
  osservaVendita: vi.fn((cb) => {
    cb(stato.vendita)
    return () => {}
  }),
}))
vi.mock('../src/lib/db.js', () => db)

import SceltaPiano from '../src/pages/SceltaPiano.jsx'
import { PIANI, MODULI, TERMINALE_IN_PIU, FONDATORI, ANNUALE, PROVA_GIORNI, ATTIVAZIONE, conIva, prezzoAnnuale, euro } from '../src/lib/piani.js'
import { venditaPulita } from '../src/lib/vendita.js'

beforeEach(() => {
  vi.clearAllMocks()
  // I test di sempre: i pagamenti online accesi. Spenti, più sotto.
  stato.vendita = venditaPulita({ pagamenti_online: true })
  stato.contatto = null
})

describe('la scelta del piano', () => {
  it('parte dal base e il prezzo segue moduli e terminali', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    // DEC-0005: i centesimi e «+ IVA»; il Base include 3 terminali, quindi
    // il primo terminale che si paga è il quarto.
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.base.prezzo)} + IVA al mese`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`${euro(conIva(PIANI.base.prezzo))} IVA inclusa`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`attivazione ${euro(ATTIVAZIONE)} + IVA (${euro(conIva(ATTIVAZIONE))} IVA inclusa)`)
    const staff = MODULI.find((m) => m.id === 'staff')
    await user.click(screen.getByLabelText(new RegExp(staff.nome)))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.base.prezzo + staff.prezzo)} + IVA`)
    fireEvent.change(screen.getByLabelText(/Terminali/), { target: { value: String(PIANI.base.terminali) } })
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.base.prezzo + staff.prezzo)} + IVA`)
    fireEvent.change(screen.getByLabelText(/Terminali/), { target: { value: String(PIANI.base.terminali + 1) } })
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.base.prezzo + staff.prezzo + TERMINALE_IN_PIU)} + IVA`)
  })

  it('nel completo i moduli sono inclusi e non si pagano due volte', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.click(screen.getByLabelText(/Completo/))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.completo.prezzo)} + IVA`)
    for (const m of MODULI) expect(screen.getByLabelText(new RegExp(m.nome))).toBeDisabled()
  })

  it('«Vai al pagamento» chiede la sessione e ci va; un rifiuto si legge', async () => {
    const user = userEvent.setup()
    const assign = vi.fn()
    db.avviaPagamento.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' })
    render(<SceltaPiano cliente={{ uid: 'u1', moduli: ['staff'] }} vai={assign} />)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: ['staff'], terminali: 1, periodo: 'mese' })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/x')
  })

  it('in modifica «Aggiorna il piano» cambia la scelta senza passare dal Checkout', async () => {
    const user = userEvent.setup()
    db.cambiaScelta.mockResolvedValueOnce({ ok: true, via: 'stripe' })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: [] }} modifica vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/Completo/))
    await user.click(screen.getByRole('button', { name: 'Aggiorna il piano' }))
    expect(db.cambiaScelta).toHaveBeenCalledWith({ piano: 'completo', moduli: [], terminali: 1, periodo: 'mese' })
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Piano aggiornato/)).toBeInTheDocument()
  })

  // DEC-0005: mensile o annuale. La scelta porta `periodo`, che le
  // Functions validano; la pagina mostra l'anno a 10 mensilità.
  it('l’annuale: il prezzo dell’anno a 10 mensilità, e `periodo: anno` nella scelta', async () => {
    const user = userEvent.setup()
    db.avviaPagamento.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' })
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    expect(screen.getByLabelText('Ogni mese')).toBeChecked()
    await user.click(screen.getByLabelText(new RegExp(`Un anno in anticipo \\(${ANNUALE.mensilita} mensilità\\)`)))
    const anno = prezzoAnnuale(PIANI.base.prezzo)
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(anno)} + IVA all’anno`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`${euro(conIva(anno))} IVA inclusa`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`pari a ${ANNUALE.mensilita} mensilità da ${euro(PIANI.base.prezzo)} + IVA`)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, periodo: 'anno' })
  })

  it('chi paga già l’anno riparte dall’anno', () => {
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', periodo: 'anno' }} modifica />)
    expect(screen.getByLabelText(/Un anno in anticipo/)).toBeChecked()
  })

  // DEC-0005: l'offerta Fondatori è un'informazione, non un contatore: chi
  // rientra lo decide il server contando gli abbonamenti attivati.
  it('l’offerta Fondatori si dice sul Base, senza posti rimasti; non sul Completo né a chi cambia piano', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    const f = FONDATORI.prezzi.base
    const testo = screen.getByTestId('fondatori')
    expect(testo).toHaveTextContent(
      `i primi ${FONDATORI.posti} abbonamenti a pagamento attivati hanno il ${PIANI.base.nome} a ${euro(f)} + IVA al mese (${euro(conIva(f))} IVA inclusa) per ${FONDATORI.mesi} mesi dall’attivazione, poi ${euro(PIANI.base.prezzo)} + IVA; attivazione gratuita.`
    )
    expect(testo).toHaveTextContent('il prezzo applicato lo vedi nel riepilogo del pagamento')
    expect(testo.textContent).not.toMatch(/rimast|ancora \d|solo \d/i)
    await user.click(screen.getByLabelText(/Completo/))
    expect(screen.queryByTestId('fondatori')).toBeNull()
    unmount()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base' }} modifica />)
    expect(screen.queryByTestId('fondatori')).toBeNull()
    expect(screen.queryByTestId('prova')).toBeNull()
  })

  it('la prova di 30 giorni si dice a chi comincia un abbonamento', () => {
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.getByTestId('prova')).toHaveTextContent(`I primi ${PROVA_GIORNI} giorni sono di prova`)
  })

  it('un rifiuto della Function si legge, e si può riprovare', async () => {
    const user = userEvent.setup()
    db.avviaPagamento.mockRejectedValueOnce(new Error('Il pagamento online non è ancora attivo'))
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(await screen.findByText(/non è ancora attivo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Vai al pagamento/ })).toBeEnabled()
  })

  // REQ-FLOTTA-015: il Free c'è solo se è in vendita, non ha moduli né
  // terminali, e si attiva senza pagamento.
  it('col Free in vendita si sceglie, e «Attiva il Free» non passa dal Checkout', async () => {
    const user = userEvent.setup()
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/^Free/))
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent('0 €')
    expect(screen.getByTestId('prezzo-scelta')).not.toHaveTextContent('IVA')
    expect(screen.queryByText('Moduli in più')).toBeNull()
    expect(screen.queryByLabelText('Ogni mese')).toBeNull()
    expect(screen.queryByTestId('fondatori')).toBeNull()
    expect(screen.queryByLabelText(/Terminali/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Attiva il Free' }))
    expect(db.scegliFree).toHaveBeenCalled()
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Piano Free attivo/)).toBeInTheDocument()
  })

  it('senza vendita il Free non c’è; e non c’è nemmeno per chi cambia un abbonamento a pagamento', () => {
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
    unmount()
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base' }} modifica />)
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
  })

  it('un cliente Free che passa a pagamento parte dal Base', () => {
    stato.vendita = venditaPulita({ free: true })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'free' }} />)
    expect(screen.getByLabelText(/Base/)).toBeChecked()
    expect(screen.queryByLabelText(/^Free/)).toBeNull()
  })

  it('un modulo fuori vendita non si mostra, ma chi lo ha già lo vede', () => {
    stato.vendita = venditaPulita({ moduli: { sumup: false } })
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.queryByLabelText(/Pagamenti con lettore SumUp/)).toBeNull()
    unmount()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: ['sumup'] }} modifica />)
    expect(screen.getByLabelText(/Pagamenti con lettore SumUp/)).toBeChecked()
  })
})

// REQ-FLOTTA-017, decisione dell'utente del 30/10/2026: in produzione i
// pagamenti online si tengono spenti finché non si è pronti a riceverli.
// Allora niente Checkout: il titolare lascia un recapito e lo contattiamo.
describe('coi pagamenti online spenti', () => {
  beforeEach(() => {
    stato.vendita = venditaPulita(null)
  })

  it('sono spenti se l’admin non li accende', () => {
    expect(venditaPulita(null).pagamenti_online).toBe(false)
    expect(venditaPulita({ pagamenti_online: 'sì' }).pagamenti_online).toBe(false)
    expect(venditaPulita({ pagamenti_online: true }).pagamenti_online).toBe(true)
  })

  it('al posto del pagamento si chiede di essere contattati, col piano scelto e il recapito', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1', email: 'bar@example.com' }} />)
    expect(screen.queryByRole('button', { name: 'Vai al pagamento' })).not.toBeInTheDocument()
    expect(screen.getByTestId('contatto')).toHaveTextContent('I pagamenti online non sono ancora attivi')
    await user.type(screen.getByLabelText(/Telefono/), '+39 333 1234567')
    await user.type(screen.getByLabelText(/nota/), 'Meglio di mattina')
    await user.click(screen.getByRole('button', { name: 'Chiedi di essere contattato' }))
    expect(db.chiediContatto).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, periodo: 'mese', telefono: '+39 333 1234567', nota: 'Meglio di mattina' })
    // Senza pagamento online, l'offerta Fondatori la confermiamo noi.
    expect(screen.getByTestId('fondatori')).toHaveTextContent('te lo confermiamo quando ti contattiamo')
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Richiesta inviata: ti contattiamo a bar@example.com o al \+39 333 1234567/)).toBeInTheDocument()
  })

  it('una richiesta già aperta si vede, e una nuova la sostituisce', () => {
    stato.contatto = { stato: 'aperta', chiesta_il: '2026-10-30T10:00:00.000Z' }
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.getByTestId('contatto-aperto')).toHaveTextContent('30/10/2026')
  })

  it('il Free e il cambio di un abbonamento non passano dal contatto', () => {
    stato.vendita = venditaPulita({ free: true })
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    fireEvent.click(screen.getByLabelText(/Free/))
    expect(screen.queryByTestId('contatto')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Attiva il Free' })).toBeInTheDocument()
    unmount()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base' }} modifica />)
    expect(screen.queryByTestId('contatto')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aggiorna il piano' })).toBeInTheDocument()
  })
})
