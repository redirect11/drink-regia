// @vitest-environment happy-dom
'use strict'

// LA SCELTA DEL PIANO (REQ-FLOTTA-007): il prezzo del mese si aggiorna
// mentre si sceglie, e «Vai al pagamento» chiama la Function del Checkout.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ vendita: null, contatto: null }))
const db = vi.hoisted(() => ({
  avviaPagamento: vi.fn(),
  cambiaScelta: vi.fn(),
  scegliFree: vi.fn(async () => ({ ok: true })),
  chiediContatto: vi.fn(async () => ({ ok: true })),
  verificaCodiceSconto: vi.fn(),
  attivaConCodice: vi.fn(async () => ({ ok: true })),
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

// Le stampanti del locale (REQ-FLOTTA-081): obbligatorie nella richiesta di
// informazioni e in quella d'acquisto.
const STAMPANTI = { non_fiscale: { scelta: 'Epson TM-m30III', altra: null }, fiscale: { scelta: 'Epson', altra: null } }
const conStampanti = async (user) => {
  await user.selectOptions(screen.getByLabelText(/Stampante non fiscale/), 'Epson TM-m30III')
  await user.selectOptions(screen.getByLabelText(/Registratore telematico/), 'Epson')
}

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

  // tana-drink REQ-LIC-015 (07/11/2026): la casella degli ordini aspetta il
  // menù, e togliendo il menù se ne vanno anche gli ordini.
  // Dal 07/11/2026 il menù digitale è compreso nel Base: la sua casella è
  // spuntata e ferma («incluso»), e gli ordini dal telefono si scelgono
  // subito, al loro prezzo.
  it('nel Base il menù digitale è incluso, e gli ordini dal telefono si scelgono subito', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    const menu = MODULI.find((m) => m.id === 'menu_tavoli')
    const ordini = MODULI.find((m) => m.id === 'ordini_cliente')
    const casellaMenu = screen.getByLabelText(new RegExp(`^${menu.nome}`))
    expect(casellaMenu).toBeChecked()
    expect(casellaMenu).toBeDisabled()
    const casellaOrdini = screen.getByLabelText(new RegExp(`^${ordini.nome}`))
    expect(casellaOrdini).toBeEnabled()
    expect(screen.queryByText(`· richiede ${menu.nome}`)).toBeNull()
    await user.click(casellaOrdini)
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(PIANI.base.prezzo + ordini.prezzo)} + IVA`)
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
    await conStampanti(user)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: ['staff'], terminali: 1, intervallo: 'mese', stampanti: STAMPANTI })
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/x')
  })

  it('in modifica «Aggiorna il piano» cambia la scelta senza passare dal Checkout', async () => {
    const user = userEvent.setup()
    db.cambiaScelta.mockResolvedValueOnce({ ok: true, via: 'stripe' })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: [] }} modifica vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/Completo/))
    await user.click(screen.getByRole('button', { name: 'Aggiorna il piano' }))
    expect(db.cambiaScelta).toHaveBeenCalledWith({ piano: 'completo', moduli: [], terminali: 1, intervallo: 'mese' })
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/Piano aggiornato/)).toBeInTheDocument()
    // Dopo l'aggiornamento riuscito non si invita più a cambiare (revisione del 13/11/2026).
    expect(screen.queryByTestId('scelta-invariata')).toBeNull()
  })

  // REQ-FLOTTA-046 (audit del 09/11/2026, finding 5): su un abbonamento a
  // mano un aumento non si accende da solo; la Function risponde
  // `via: 'richiesta'` e la pagina non dice «aggiornato».
  it('in modifica, se la Function registra una richiesta, la pagina dice che si viene ricontattati', async () => {
    const user = userEvent.setup()
    db.cambiaScelta.mockResolvedValueOnce({ ok: true, via: 'richiesta' })
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: [], abbonamento: { origine: 'manuale' } }} modifica vai={vi.fn()} />)
    await user.click(screen.getByLabelText(/Completo/))
    await user.click(screen.getByRole('button', { name: 'Aggiorna il piano' }))
    expect(await screen.findByText('Richiesta inviata: ti ricontattiamo per attivarla.')).toBeInTheDocument()
    expect(screen.queryByText(/Piano aggiornato/)).toBeNull()
  })

  // DEC-0005: mensile o annuale. La scelta porta `intervallo`, che le
  // Functions validano; la pagina mostra l'anno a 10 mensilità.
  it('l’annuale: il prezzo dell’anno a 10 mensilità, e `intervallo: anno` nella scelta', async () => {
    const user = userEvent.setup()
    db.avviaPagamento.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' })
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    expect(screen.getByLabelText('Ogni mese')).toBeChecked()
    await user.click(screen.getByLabelText(new RegExp(`Un anno in anticipo \\(${ANNUALE.mensilita} mensilità\\)`)))
    const anno = prezzoAnnuale(PIANI.base.prezzo)
    expect(screen.getByTestId('prezzo-scelta')).toHaveTextContent(`${euro(anno)} + IVA all’anno`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`${euro(conIva(anno))} IVA inclusa`)
    expect(screen.getByTestId('prezzo-dettaglio')).toHaveTextContent(`pari a ${ANNUALE.mensilita} mensilità da ${euro(PIANI.base.prezzo)} + IVA`)
    await conStampanti(user)
    await user.click(screen.getByRole('button', { name: /Vai al pagamento/ }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, intervallo: 'anno', stampanti: STAMPANTI })
  })

  it('chi paga già l’anno riparte dall’anno', () => {
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', abbonamento: { intervallo: 'anno' } }} modifica />)
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
    // Solo se il Checkout la applica (piani.json → prova_nel_checkout).
    if (PROVA_GIORNI > 0) expect(screen.getByTestId('prova')).toHaveTextContent(`I primi ${PROVA_GIORNI} giorni sono di prova`)
    else expect(screen.queryByTestId('prova')).toBeNull()
  })

  it('un rifiuto della Function si legge, e si può riprovare', async () => {
    const user = userEvent.setup()
    db.avviaPagamento.mockRejectedValueOnce(new Error('Il pagamento online non è ancora attivo'))
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={vi.fn()} />)
    await conStampanti(user)
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

  // REQ-FLOTTA-084 (Daniele, 12/11/2026: «nella sua dashboard ha come
  // piano selezionato il base ma invece è il free che non c'è nelle
  // opzioni»). Fino ad allora qui si controllava il contrario: il Free del
  // cliente tolto dalle opzioni e la scelta che partiva dal Base. Ora il
  // piano attuale c'è, come «Il tuo piano», ed è quello scelto.
  const FREE_ATTIVO = { uid: 'u1', piano: 'free', abbonamento: { stato: 'attivo', origine: 'gratuito' } }
  const tasto = () => screen.getAllByRole('button').at(-1)

  it('un cliente Free vede il suo Free come «Il tuo piano», scelto; il tasto si accende scegliendo un piano a pagamento', async () => {
    const user = userEvent.setup()
    // Il Free fuori vendita: c'è lo stesso, perché è il suo.
    stato.vendita = venditaPulita({ pagamenti_online: true, free: false })
    render(<SceltaPiano cliente={FREE_ATTIVO} vai={vi.fn()} />)
    const free = screen.getByRole('radio', { name: /^Free/ })
    expect(free).toBeChecked()
    expect(free.closest('label')).toHaveTextContent('Il tuo piano')
    expect(screen.getByRole('radio', { name: /^Base/ }).closest('label')).not.toHaveTextContent('Il tuo piano')
    expect(tasto()).toBeDisabled()
    expect(db.scegliFree).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: /^Base/ }))
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeEnabled()
    // Tornando al Free il tasto si spegne di nuovo.
    await user.click(free)
    expect(tasto()).toBeDisabled()
  })

  it('col Free in vendita il cliente Free lo vede una volta sola, come «Il tuo piano»', () => {
    stato.vendita = venditaPulita({ pagamenti_online: true, free: true })
    render(<SceltaPiano cliente={FREE_ATTIVO} />)
    expect(screen.getAllByRole('radio', { name: /^Free/ })).toHaveLength(1)
    expect(screen.getByRole('radio', { name: /^Free/ })).toBeChecked()
    expect(screen.getAllByText('Il tuo piano')).toHaveLength(1)
  })

  it('chi non ha un piano non ha «Il tuo piano», parte dal Base e il tasto è acceso', () => {
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    expect(screen.queryByText('Il tuo piano')).toBeNull()
    expect(screen.getByRole('radio', { name: /^Base/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeEnabled()
  })

  it('un piano non più attivo non è «Il tuo piano»: chi rinnova riparte da quello e il tasto è acceso', () => {
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'completo', abbonamento: { stato: 'non pagato', origine: 'stripe' } }} />)
    expect(screen.queryByText('Il tuo piano')).toBeNull()
    expect(screen.getByRole('radio', { name: /^Completo/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeEnabled()
  })

  it('in modifica il piano a pagamento attuale è «Il tuo piano»; il tasto si accende con piano, moduli, terminali o pagamento diversi', async () => {
    const user = userEvent.setup()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base', moduli: ['staff'], terminali: 1, abbonamento: { stato: 'attivo', origine: 'stripe' } }} modifica />)
    const base = screen.getByRole('radio', { name: /^Base/ })
    expect(base).toBeChecked()
    expect(base.closest('label')).toHaveTextContent('Il tuo piano')
    const aggiorna = screen.getByRole('button', { name: 'Aggiorna il piano' })
    expect(aggiorna).toBeDisabled()
    // Un modulo in più, poi tolto: si riaccende e si rispegne.
    const sumup = screen.getByLabelText(/Pagamenti con lettore SumUp/)
    await user.click(sumup)
    expect(aggiorna).toBeEnabled()
    await user.click(sumup)
    expect(aggiorna).toBeDisabled()
    // Un modulo che aveva, tolto e rimesso.
    await user.click(screen.getByLabelText(/Personale e ore/))
    expect(aggiorna).toBeEnabled()
    await user.click(screen.getByLabelText(/Personale e ore/))
    expect(aggiorna).toBeDisabled()
    // I terminali.
    fireEvent.change(screen.getByLabelText(/Terminali/), { target: { value: '5' } })
    expect(aggiorna).toBeEnabled()
    fireEvent.change(screen.getByLabelText(/Terminali/), { target: { value: '1' } })
    expect(aggiorna).toBeDisabled()
    // Il pagamento.
    await user.click(screen.getByLabelText(/Un anno in anticipo/))
    expect(aggiorna).toBeEnabled()
    await user.click(screen.getByLabelText('Ogni mese'))
    expect(aggiorna).toBeDisabled()
    // Il piano.
    await user.click(screen.getByRole('radio', { name: /^Completo/ }))
    expect(aggiorna).toBeEnabled()
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
    await conStampanti(user)
    await user.click(screen.getByRole('button', { name: 'Chiedi di essere contattato' }))
    expect(db.chiediContatto).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, intervallo: 'mese', telefono: '+39 333 1234567', nota: 'Meglio di mattina', stampanti: STAMPANTI })
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

// IL CODICE SCONTO ALL'ACQUISTO (REQ-FLOTTA-028). L'utente, 02/11/2026:
// «gli acquisti possono avere anche i codici sconto mi raccomando».
describe('il codice sconto', () => {
  it('«Applica» chiede alla regia quanto vale, e al pagamento il codice va col resto', async () => {
    const user = userEvent.setup()
    db.verificaCodiceSconto.mockResolvedValueOnce({ codice: 'PROVA20', percentuale: 20, durata_mesi: 3, gratis: false, vale: 'codice' })
    db.avviaPagamento.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' })
    render(<SceltaPiano cliente={{ uid: 'u1' }} vai={() => {}} />)
    await user.type(screen.getByLabelText(/Codice sconto/), 'prova20')
    await user.click(screen.getByRole('button', { name: 'Applica' }))
    expect(db.verificaCodiceSconto).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, intervallo: 'mese' }, 'PROVA20')
    expect(await screen.findByTestId('esito-codice')).toHaveTextContent('Codice PROVA20: 20% di sconto, per 3 mesi, applicato nel pagamento.')
    await conStampanti(user)
    await user.click(screen.getByRole('button', { name: 'Vai al pagamento' }))
    expect(db.avviaPagamento).toHaveBeenCalledWith({ piano: 'base', moduli: [], terminali: 1, intervallo: 'mese', codice: 'PROVA20', stampanti: STAMPANTI })
  })

  it('se l’offerta Fondatori conviene di più lo dice prima del pagamento', async () => {
    const user = userEvent.setup()
    db.verificaCodiceSconto.mockResolvedValueOnce({ codice: 'PROVA5', percentuale: 5, durata_mesi: null, gratis: false, vale: 'fondatori' })
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.type(screen.getByLabelText(/Codice sconto/), 'PROVA5')
    await user.click(screen.getByRole('button', { name: 'Applica' }))
    expect(await screen.findByTestId('esito-codice')).toHaveTextContent(/con l’offerta Fondatori risparmi di più/)
  })

  it('un codice al 100% attiva il piano senza pagamento', async () => {
    const user = userEvent.setup()
    db.verificaCodiceSconto.mockResolvedValueOnce({ codice: 'TANA-100', percentuale: 100, durata_mesi: null, gratis: true, vale: 'codice' })
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.click(screen.getByLabelText(new RegExp(`^${PIANI.completo.nome}`)))
    await user.type(screen.getByLabelText(/Codice sconto/), 'tana-100')
    await user.click(screen.getByRole('button', { name: 'Applica' }))
    expect(await screen.findByTestId('esito-codice')).toHaveTextContent(/il piano non si paga, senza scadenza/)
    await user.click(screen.getByRole('button', { name: 'Attiva con il codice' }))
    expect(db.attivaConCodice).toHaveBeenCalledWith({ piano: 'completo', moduli: [], terminali: 1, intervallo: 'mese' }, 'TANA-100')
    expect(db.avviaPagamento).not.toHaveBeenCalled()
    expect(await screen.findByText(/attivo col codice TANA-100/)).toBeInTheDocument()
  })

  it('un codice sbagliato lo dice, e cambiandolo il tasto torna quello del pagamento', async () => {
    const user = userEvent.setup()
    db.verificaCodiceSconto.mockRejectedValueOnce(new Error('Codice sconosciuto o disattivato.'))
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.type(screen.getByLabelText(/Codice sconto/), 'NIENTE')
    await user.click(screen.getByRole('button', { name: 'Applica' }))
    expect(await screen.findByText('Codice sconosciuto o disattivato.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Vai al pagamento' })).toBeInTheDocument()
  })

  it('coi pagamenti spenti il codice va con la richiesta di contatto; per il Free e nei cambi di piano non c’è', async () => {
    const user = userEvent.setup()
    stato.vendita = venditaPulita({ pagamenti_online: false, free: true })
    db.verificaCodiceSconto.mockResolvedValueOnce({ codice: 'PROVA20', percentuale: 20, durata_mesi: null, gratis: false, vale: 'codice' })
    const { unmount } = render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    await user.type(screen.getByLabelText(/Codice sconto/), 'PROVA20')
    await user.click(screen.getByRole('button', { name: 'Applica' }))
    expect(await screen.findByTestId('esito-codice')).toHaveTextContent(/Lo applichiamo noi/)
    await conStampanti(user)
    await user.click(screen.getByRole('button', { name: 'Chiedi di essere contattato' }))
    expect(db.chiediContatto).toHaveBeenCalledWith(expect.objectContaining({ piano: 'base', codice: 'PROVA20' }))
    await user.click(screen.getByLabelText(new RegExp(`^${PIANI.free.nome}`)))
    expect(screen.queryByTestId('codice-sconto')).not.toBeInTheDocument()
    unmount()
    render(<SceltaPiano cliente={{ uid: 'u1', piano: 'base' }} modifica />)
    expect(screen.queryByTestId('codice-sconto')).not.toBeInTheDocument()
  })
})

// REQ-FLOTTA-081 (Daniele, 12/11/2026).
describe('le stampanti del locale nella richiesta', () => {
  it('nella richiesta d’acquisto: i tre gruppi, «Altra» e «Non ho ancora una stampante», l’RT, e i testi', () => {
    stato.vendita = venditaPulita({ pagamenti_online: true })
    render(<SceltaPiano cliente={{ uid: 'u1' }} />)
    const nonFiscale = screen.getByLabelText(/Stampante non fiscale/)
    const gruppi = [...nonFiscale.querySelectorAll('optgroup')].map((g) => g.label)
    expect(gruppi).toEqual(['Supportata', 'Compatibile, da provare sul posto (Epson con ePOS)', 'Non ancora supportata (la scelta ci serve per decidere)'])
    expect(within(nonFiscale).getByRole('option', { name: 'Altra (scrivi marca e modello)' })).toBeInTheDocument()
    expect(within(nonFiscale).getByRole('option', { name: 'Non ho ancora una stampante' })).toBeInTheDocument()
    expect(screen.getByText(/La stampa di comande e scontrini non fiscali oggi funziona con le stampanti Epson che hanno ePOS/)).toBeInTheDocument()
    const rt = screen.getByLabelText(/Registratore telematico/)
    expect(within(rt).getByRole('option', { name: 'Non lo so' })).toBeInTheDocument()
    expect(screen.getByText(/oggi l’app non lo comanda/)).toBeInTheDocument()
  })
  it('senza le due scelte la richiesta non parte; con «Altra» si scrive marca e modello', async () => {
    const user = userEvent.setup()
    stato.vendita = venditaPulita({ pagamenti_online: false })
    render(<SceltaPiano cliente={{ uid: 'u1', email: 'bar@example.com' }} />)
    await user.click(screen.getByRole('button', { name: 'Chiedi di essere contattato' }))
    expect(db.chiediContatto).not.toHaveBeenCalled()
    expect(screen.getByText('Indica la stampante non fiscale e il registratore telematico (anche «non ancora» o «non lo so»).')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(/Stampante non fiscale/), 'altra')
    await user.type(screen.getByLabelText('Marca e modello della stampante'), 'Epson TM-T70II')
    await user.selectOptions(screen.getByLabelText(/Registratore telematico/), 'non_so')
    await user.click(screen.getByRole('button', { name: 'Chiedi di essere contattato' }))
    expect(db.chiediContatto).toHaveBeenCalledWith(expect.objectContaining({ stampanti: { non_fiscale: { scelta: 'altra', altra: 'Epson TM-T70II' }, fiscale: { scelta: 'non_so', altra: null } } }))
  })
})
