// @vitest-environment happy-dom
'use strict'

// IL LOCALE SOSPESO O CHIUSO NELL'AREA DEL TITOLARE (REQ-FLOTTA-090).
// Daniele, 13/11/2026: «Il servizio viene sospeso subito ma dobbiamo
// portare l'utente alla schermata di pagamento per il rinnovo in qualche
// modo (se prevediamo di accettare pagamenti altrimenti sito sospeso e si
// danno le info di contatto per contattarci)»; le sospensioni dell'admin
// come quelle per il pagamento, al titolare solo i contatti («Si»).
// L'app del locale porta qui con rinnovo_url: /dashboard/piano?rinnovo=1.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'

const stato = vi.hoisted(() => ({ cliente: null, istanza: null, vendita: null }))
const db = vi.hoisted(() => ({
  osservaCliente: vi.fn((uid, cb) => {
    cb(stato.cliente)
    return () => {}
  }),
  // Dalla query sul suo uid (REQ-FLOTTA-086), come in AreaTitolare.test.jsx.
  osservaMiaIstanza: vi.fn((uid, slug, cb) => {
    cb(stato.istanza)
    return () => {}
  }),
  osservaMiaRichiesta: vi.fn((uid, slug, cb) => {
    cb(null)
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
  apriPagamentoRinnovo: vi.fn(async () => ({ url: 'about:blank#rinnovo', via: 'fattura' })),
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

const mostra = (percorso = '/dashboard/piano?rinnovo=1') =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/dashboard/*" element={<Dashboard utente={{ uid: 'u1', email: 'titolare@example.it' }} />} />
      </Routes>
    </MemoryRouter>
  )

// Dati inventati: nessuna persona reale.
const CLIENTE = {
  uid: 'u1',
  email: 'titolare@example.it',
  slug: 'bar-prova',
  nome_locale: 'Bar Prova',
  piano: 'base',
  moduli: [],
  terminali: 1,
  abbonamento: { stato: 'non pagato', origine: 'stripe', stripe_customer: 'cus_1', stripe_subscription: 'sub_1' },
}
const ISTANZA = { stato: 'attiva', progetto: 'drinkpos-bar-prova', licenza_stato: 'sospesa', licenza_per: 'pagamento', licenza_motivo: 'pagamento non ricevuto', licenza_dal: '2026-11-10T09:00:00.000Z' }

const riquadro = () => screen.getByRole('region', { name: 'Rinnovo del locale' })

beforeEach(() => {
  vi.clearAllMocks()
  stato.cliente = structuredClone(CLIENTE)
  stato.istanza = structuredClone(ISTANZA)
  stato.vendita = { free: false, pagamenti_online: true, moduli: {} }
})

describe('sospeso per il pagamento, coi pagamenti online', () => {
  it('in cima a «Piano e moduli»: sospeso dal giorno, e il tasto per pagare', () => {
    mostra()
    const r = riquadro()
    expect(r).toHaveTextContent('Il tuo locale è sospeso dal 10 novembre 2026')
    expect(within(r).getByRole('button', { name: 'Paga e riattiva il locale' })).toBeInTheDocument()
    // Prima del riquadro del piano.
    const piano = screen.getByRole('region', { name: 'Piano' })
    expect(r.compareDocumentPosition(piano) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Il locale si riattiva da solo (REQ-FLOTTA-023): si dice.
    expect(r).toHaveTextContent(/si riattiva da solo/)
  })

  it('il tasto chiede al server la pagina del pagamento e ci va; un errore si legge', async () => {
    const vai = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
    mostra()
    await userEvent.click(within(riquadro()).getByRole('button', { name: 'Paga e riattiva il locale' }))
    expect(db.apriPagamentoRinnovo).toHaveBeenCalledWith()
    expect(vai).toHaveBeenCalledWith('about:blank#rinnovo')
    db.apriPagamentoRinnovo.mockRejectedValueOnce(new Error('La gestione dell’abbonamento non è disponibile al momento: scrivici.'))
    await userEvent.click(within(riquadro()).getByRole('button', { name: 'Paga e riattiva il locale' }))
    expect(await within(riquadro()).findByText(/non è disponibile al momento/)).toBeInTheDocument()
    vai.mockRestore()
  })

  it('se la sospensione aspetta il taglio della giornata, dice quando l’app si ferma', () => {
    stato.istanza.riduzione_al_taglio = { dal: '2026-11-11T04:00:00.000Z', cosa: ['lo stato sospesa'] }
    mostra()
    expect(riquadro()).toHaveTextContent(/si ferma al taglio della giornata/)
  })

  // REQ-FLOTTA-095: al suo momento, fuori dall'orario di servizio.
  it('se la sospensione aspetta il suo momento fuori servizio, dice quando l’app si ferma', () => {
    stato.istanza.sospensione_al = { dal: '2026-11-11T01:00:00.000Z', stato: 'sospesa' }
    mostra()
    expect(riquadro()).toHaveTextContent(/l’app del tuo locale si ferma mercoledì 11 novembre/)
    expect(riquadro()).not.toHaveTextContent(/taglio della giornata/)
    // Revisione del 13/11/2026 (D2): l'app lavora ancora, il titolo lo dice.
    expect(within(riquadro()).getByRole('heading', { level: 3 })).toHaveTextContent('Il locale sta per essere sospeso')
    expect(riquadro()).not.toHaveTextContent('Il locale è sospeso')
  })

  it('coi pagamenti spenti, la sospensione che aspetta il suo momento dice quando, non «è sospeso»', () => {
    stato.vendita = { pagamenti_online: false, moduli: {} }
    stato.istanza.sospensione_al = { dal: '2026-11-11T01:00:00.000Z', stato: 'sospesa' }
    mostra()
    expect(within(riquadro()).getByRole('heading', { level: 3 })).toHaveTextContent('Il locale sta per essere sospeso')
    expect(riquadro()).toHaveTextContent(/si ferma mercoledì 11 novembre/)
    expect(riquadro()).not.toHaveTextContent('Il tuo locale è sospeso')
  })

  // D2: la chiusura per pagamento (la disdetta) che aspetta il suo momento.
  it('la chiusura per pagamento che aspetta il suo momento: «sta per essere chiuso» e quando, non «è chiuso»', () => {
    stato.cliente.abbonamento.stato = 'disdetto'
    stato.istanza = { ...stato.istanza, licenza_stato: 'chiusa', licenza_motivo: 'abbonamento disdetto', sospensione_al: { dal: '2026-11-11T01:00:00.000Z', stato: 'chiusa' } }
    mostra()
    expect(within(riquadro()).getByRole('heading', { level: 3 })).toHaveTextContent('Il locale sta per essere chiuso')
    expect(riquadro()).toHaveTextContent(/l’app del tuo locale si ferma mercoledì 11 novembre/)
    expect(riquadro()).not.toHaveTextContent('Il tuo locale è chiuso')
  })

  it('nella panoramica, in cima, un avviso che porta al riquadro', async () => {
    mostra('/dashboard')
    const avviso = screen.getByRole('region', { name: 'Avviso sul locale' })
    expect(avviso).toHaveTextContent('Il tuo locale è sospeso')
    expect(avviso.compareDocumentPosition(screen.getByRole('heading', { level: 2 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const link = within(avviso).getByRole('link', { name: 'Paga e riattiva il locale' })
    expect(link).toHaveAttribute('href', '/dashboard/piano?rinnovo=1')
    await userEvent.click(link)
    expect(riquadro()).toBeInTheDocument()
  })
})

describe('solo i contatti', () => {
  it('coi pagamenti online spenti: «per riattivarlo scrivici», niente tasto per pagare', () => {
    stato.vendita = { pagamenti_online: false, moduli: {} }
    mostra()
    const r = riquadro()
    expect(r).toHaveTextContent(`Il tuo locale è sospeso: per riattivarlo scrivici a ${EMAIL_CONTATTI}`)
    expect(within(r).getByRole('link', { name: EMAIL_CONTATTI })).toHaveAttribute('href', `mailto:${EMAIL_CONTATTI}`)
    expect(within(r).queryByRole('button')).toBeNull()
  })

  it('sospeso dall’admin: i contatti, anche coi pagamenti accesi e l’abbonamento attivo', () => {
    stato.cliente.abbonamento.stato = 'attivo'
    stato.istanza = { ...stato.istanza, licenza_per: 'admin', licenza_motivo: 'verifica in corso' }
    mostra()
    const r = riquadro()
    expect(r).toHaveTextContent(`Il tuo locale è sospeso: per riattivarlo scrivici a ${EMAIL_CONTATTI}`)
    expect(within(r).queryByRole('button')).toBeNull()
  })

  it('chiuso: niente «riattiva», i contatti e quando si cancellano i dati', () => {
    stato.cliente.abbonamento.stato = 'disdetto'
    stato.istanza = { ...stato.istanza, licenza_stato: 'chiusa', eliminazione: { stato: 'programmata', quando: '2027-02-08T09:00:00.000Z', richiedente: 'conservazione' } }
    mostra()
    const r = riquadro()
    expect(r).toHaveTextContent('Il tuo locale è chiuso')
    expect(r).toHaveTextContent(EMAIL_CONTATTI)
    expect(r).toHaveTextContent('8 febbraio 2027')
    expect(within(r).queryByRole('button')).toBeNull()
    expect(r).not.toHaveTextContent(/riattiv/i)
  })

  it('chiuso senza cancellazione programmata: lo dice', () => {
    stato.istanza = { ...stato.istanza, licenza_stato: 'chiusa', licenza_per: 'admin' }
    mostra()
    expect(riquadro()).toHaveTextContent('Nessuna cancellazione dei dati è programmata')
  })
})

describe('il locale lavora', () => {
  it('pagamento in ritardo: avviso e tasto per pagare, prima che il locale si fermi', () => {
    stato.cliente.abbonamento.stato = 'in sospeso'
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova' }
    mostra('/dashboard/piano')
    const r = riquadro()
    expect(r).toHaveTextContent(/pagamento dell’abbonamento è in ritardo/)
    expect(within(r).getByRole('button', { name: 'Paga ora' })).toBeInTheDocument()
  })

  it('con ?rinnovo=1 e tutto in regola, lo dice; senza parametro, niente riquadro', () => {
    stato.cliente.abbonamento.stato = 'attivo'
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova' }
    const { unmount } = mostra()
    expect(riquadro()).toHaveTextContent('Il tuo locale è attivo e l’abbonamento è in regola')
    unmount()
    mostra('/dashboard/piano')
    expect(screen.queryByRole('region', { name: 'Rinnovo del locale' })).toBeNull()
    mostra('/dashboard')
    expect(screen.queryByRole('region', { name: 'Avviso sul locale' })).toBeNull()
  })
})

describe('lo stato dell’abbonamento in italiano', () => {
  it('mai il valore grezzo di Stripe, né nella panoramica né in «Piano e moduli»', () => {
    stato.cliente.abbonamento.stato = 'past_due'
    stato.istanza = { stato: 'attiva', progetto: 'drinkpos-bar-prova' }
    const { unmount } = mostra('/dashboard')
    expect(document.body).not.toHaveTextContent('past_due')
    expect(screen.getByRole('region', { name: 'Il tuo piano' })).toHaveTextContent('Abbonamento in ritardo col pagamento')
    unmount()
    mostra('/dashboard/piano')
    expect(document.body).not.toHaveTextContent('past_due')
    expect(screen.getByRole('region', { name: 'Piano' })).toHaveTextContent('Abbonamento in ritardo col pagamento')
  })
})
