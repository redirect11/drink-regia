// @vitest-environment happy-dom
'use strict'

// IL BACKOFFICE (REQ-FLOTTA-005): tutti i clienti con piano, stato,
// progetto e versione; quello che chiede attenzione sta in cima; da qui si
// rilancia un'attivazione fallita e si segna un piano a mano.
//
// Dal 30/10/2026 il backoffice è diviso in sezioni con un sotto-menù
// (l'utente: «puoi separare le varie sezioni del backoffice magari in sotto
// menu? Così è tutto troppo caotico»). I test di prima restano gli stessi
// nella sostanza; cambia solo l'indirizzo da cui partono: ognuno apre la
// sezione dove la cosa ora sta (mostra('/backoffice/…')), e «Nuovo locale» e
// «Locale esistente» non si aprono più con un bottone, sono la sezione
// «Nuovo locale».

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'

const db = vi.hoisted(() => ({
  elencoClienti: vi.fn(),
  elencoIstanze: vi.fn(),
  elencoRichieste: vi.fn(),
  cambiaPianoAdmin: vi.fn(async () => ({ ok: true })),
  rilanciaAttivazione: vi.fn(async () => {}),
  impostaStatoIstanza: vi.fn(async () => {}),
  eliminaCliente: vi.fn(async () => {}),
  aggiornaIstanza: vi.fn(async () => {}),
  osservaImpostazioniRegia: vi.fn((cb) => {
    cb(regia.impostazioni)
    return () => {}
  }),
  impostaDeployAutomatico: vi.fn(async () => {}),
  impostaAttivazioneSimulata: vi.fn(async () => {}),
  autorizzaRichiesta: vi.fn(async () => {}),
  autorizzaProfiloCompleto: vi.fn(async () => ({ ok: true })),
  rifiutaRichiesta: vi.fn(async () => {}),
  creaClienteDaAdmin: vi.fn(async () => ({ uid: 'n', slug: 'bar-creato' })),
  elencoCassettiAI: vi.fn(async () => ({})),
  gestisciCassettoAI: vi.fn(async () => ({ ok: true })),
  registraLocaleEsistente: vi.fn(async () => ({ uid: 't', slug: 'tana-drink' })),
  impostaAggiornamentiEsistente: vi.fn(async () => ({ ok: true })),
  elencoRilasci: vi.fn(async () => []),
  gestisciRilascio: vi.fn(async () => ({ ok: true })),
  gestisciEliminazione: vi.fn(async () => ({ ok: true })),
  osservaVendita: vi.fn((cb) => {
    cb(regia.vendita)
    return () => {}
  }),
  impostaVendita: vi.fn(async () => {}),
  elencoContatti: vi.fn(async () => regia.contatti),
  segnaContatto: vi.fn(async () => {}),
  osservaRegoleAggiornamenti: vi.fn((cb) => {
    cb(regia.aggiornamenti)
    return () => {}
  }),
  impostaRegoleAggiornamenti: vi.fn(async () => ({ ok: true, avvisati: 2, nonScritti: [] })),
  osservaControlloLicenze: vi.fn((cb) => {
    cb(regia.licenze)
    return () => {}
  }),
  gestisciLicenze: vi.fn(async () => ({ ok: true })),
  registraPagamento: vi.fn(async () => ({ ok: true })),
  // I codici sconto (REQ-FLOTTA-028) hanno i loro test in Backoffice.test.jsx.
  // Il catalogo dei temi (REQ-FLOTTA-032) ha i suoi test in CatalogoTemi.test.jsx.
  elencoTemi: vi.fn(async () => []),
  gestisciTemi: vi.fn(async () => ({ ok: true })),
  elencoSconti: vi.fn(async () => []),
  gestisciSconti: vi.fn(async () => ({ ok: true })),
  applicaSconto: vi.fn(async () => ({ ok: true })),
  programmaScadenze: vi.fn(async () => ({ ok: true, programmati: 3, errori: [] })),
  // I temi dei locali (REQ-FLOTTA-039).
  impostaTemi: vi.fn(async () => ({ ok: true })),
  temiDelLocale: vi.fn(async () => ({ stili_installati: [], temi_installati: [], stile_menu: null })),
  elencoTemiSuMisura: vi.fn(async () => []),
  gestisciTemiSuMisura: vi.fn(async () => ({ ok: true })),
  // Il commerciale (REQ-FLOTTA-041) ha i suoi test in Commerciale.test.jsx.
  elencoMovimenti: vi.fn(async () => []),
  elencoTraffico: vi.fn(async () => []),
  statoFondatori: vi.fn(async () => null),
}))
const regia = vi.hoisted(() => ({ impostazioni: {}, vendita: { free: false, moduli: {} }, contatti: [], aggiornamenti: {}, licenze: null }))
vi.mock('../src/lib/db.js', () => db)

import Backoffice from '../src/pages/Backoffice.jsx'

// Dove si è arrivati, per i test delle rotte.
function Dove() {
  const { pathname, search } = useLocation()
  return <output data-testid="dove">{pathname + search}</output>
}
// Come in App.jsx: il backoffice risponde a /backoffice e alle sue sotto-rotte.
// LA TABELLA DEI LOCALI (02/11/2026): la scheda di un locale si apre
// cliccando il suo nome nella tabella; qui la si apre e la si restituisce.
const apri = async (nome) => {
  await userEvent.setup().click(await screen.findByRole('button', { name: nome }))
  return screen.findByRole('article', { name: nome })
}
// Le righe della tabella, una per locale (non quelle di dettaglio aperte).
const righeLocali = async () => {
  await screen.findByRole('table', { name: 'Locali' })
  return [...document.querySelectorAll('tr.riga-locale')]
}
const nomiLocali = async () => (await righeLocali()).map((r) => r.querySelector('.nome-locale').textContent)

const mostra = (percorso = '/backoffice/locali') =>
  render(
    <MemoryRouter initialEntries={[percorso]}>
      <Routes>
        <Route path="/backoffice/*" element={<Backoffice />} />
      </Routes>
      <Dove />
    </MemoryRouter>
  )

beforeEach(() => {
  vi.clearAllMocks()
  regia.impostazioni = {}
  db.elencoClienti.mockResolvedValue([
    { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01' },
    { uid: 'b', slug: 'bar-rotto', nome_locale: 'Bar Rotto', email: 'b@x.it', piano: 'base', creato_il: '2026-10-02' },
    { uid: 'c', slug: 'bar-nuovo', nome_locale: 'Bar Nuovo', email: 'c@x.it', creato_il: '2026-10-03' },
  ])
  db.elencoIstanze.mockResolvedValue({
    'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0' },
    'bar-rotto': { stato: 'errore', errore: 'quota progetti' },
  })
  db.elencoRichieste.mockResolvedValue({})
  db.elencoCassettiAI.mockResolvedValue({})
})

describe('il backoffice', () => {
  it('elenca i clienti, prima chi ha un problema', async () => {
    mostra()
    const nomi = await nomiLocali()
    expect(nomi[0]).toMatch(/Bar Rotto/)
    expect(nomi[2]).toMatch(/Bar Attivo/)
    // La riga dice piano, prezzo e versione; la scheda, aperta, il resto.
    const riga = (await righeLocali())[2]
    expect(riga).toHaveTextContent('Completo · 69 €')
    expect(riga).toHaveTextContent('v1.10.0')
    expect(riga).not.toHaveTextContent('drinkpos-bar-attivo')
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent('drinkpos-bar-attivo')
    expect(within(riga.closest('tbody')).getByRole('button', { name: 'Bar Attivo' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('un’attivazione fallita si rilancia', async () => {
    const user = userEvent.setup()
    mostra()
    await user.click(within(await apri('Bar Rotto')).getByRole('button', { name: 'Rilancia' }))
    expect(db.rilanciaAttivazione).toHaveBeenCalledWith('bar-rotto')
  })

  // REQ-FLOTTA-008: «serve un modo per eliminare/fermare l'app deployata».
  it('un’istanza attiva si sospende con un motivo', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValue('pagamento non ricevuto')
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Sospendi' }))
    expect(db.impostaStatoIstanza).toHaveBeenCalledWith('bar-attivo', 'sospesa', 'pagamento non ricevuto')
  })

  // L'utente, 09/11/2026: «quando si preme aggiorna istanza sembra che non
  // parta … vorrei almeno un loading … con un minimo di gestione degli errori».
  it('un aggiornamento in corso si vede: segno che gira, da quanto, bottone spento; uno fallito porta al run di GitHub', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', aggiornamento: { stato: 'in corso', ref: 'develop', chiesto_il: new Date(Date.now() - 3 * 60000).toISOString() } },
      'bar-rotto': { stato: 'attiva', progetto: 'drinkpos-bar-rotto', versione: 'v1.10.0', aggiornamento: { stato: 'fallito', ref: 'develop', errore: 'Aggiornamento failure: GitHub Actions run 42666395985' } },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    const avanzamento = within(attivo).getByRole('status')
    expect(avanzamento).toHaveTextContent('aggiornamento a develop in corso da 3 min')
    expect(avanzamento.querySelector('.spinner')).not.toBeNull()
    expect(within(avanzamento).getByRole('link', { name: /segui su GitHub/ })).toHaveAttribute('href', expect.stringContaining('/actions/workflows/aggiorna-istanza.yml'))
    expect(within(attivo).getByRole('button', { name: 'Aggiornamento in corso…' })).toBeDisabled()
    const rotto = await apri('Bar Rotto')
    expect(rotto).toHaveTextContent('aggiornamento a develop fallito: Aggiornamento failure')
    expect(within(rotto).getByRole('link', { name: /vedi il run/ })).toHaveAttribute('href', 'https://github.com/redirect11/drink-regia/actions/runs/42666395985')
    expect(within(rotto).getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  it('finché un aggiornamento è in corso la pagina si ricarica da sola ogni venti secondi', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', aggiornamento: { stato: 'in corso', ref: 'develop' } },
    })
    // I timer finti vanno accesi prima che la pagina crei il suo intervallo;
    // shouldAdvanceTime lascia scorrere il tempo vero che Testing Library
    // aspetta.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      mostra()
      await apri('Bar Attivo')
      const prima = db.elencoIstanze.mock.calls.length
      await vi.advanceTimersByTimeAsync(20000)
      expect(db.elencoIstanze.mock.calls.length).toBe(prima + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  // REQ-FLOTTA-059: un cliente senza istanza si elimina con l'account, dopo
  // conferma; chi ha un'istanza viva no (prima si chiude e si elimina quella).
  it('un cliente senza istanza si elimina con «Elimina cliente…», confermando; chi ha un’istanza no', async () => {
    const user = userEvent.setup()
    const conferma = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    mostra()
    const nuovo = await apri('Bar Nuovo')
    const bottone = within(within(nuovo).getByLabelText('Cliente')).getByRole('button', { name: 'Elimina cliente…' })
    await user.click(bottone)
    expect(db.eliminaCliente).not.toHaveBeenCalled()
    await user.click(bottone)
    expect(conferma).toHaveBeenLastCalledWith(expect.stringMatching(/Eliminare il cliente Bar Nuovo \(c@x\.it\)/))
    expect(db.eliminaCliente).toHaveBeenCalledWith('bar-nuovo')
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).queryByLabelText('Cliente')).toBeNull()
  })

  // Un locale per scheda (29/10/2026): lo stato in due parole e colorato,
  // l'app del locale a un clic, Sospendi e Chiudi in un gruppo a parte.
  it('ogni locale è una scheda: stato breve, link all’app, azioni a gruppi', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', url: 'https://drinkpos-bar-attivo.web.app' },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).getByText('Attiva')).toHaveClass('stato-ok')
    expect(within(attivo).getByRole('link', { name: /Apri l’app/ })).toHaveAttribute('href', 'https://drinkpos-bar-attivo.web.app')
    const licenza = within(attivo).getByLabelText('Licenza')
    expect(within(licenza).getByRole('button', { name: 'Sospendi' })).toBeInTheDocument()
    expect(within(licenza).queryByRole('button', { name: /Aggiorna/ })).toBeNull()
  })

  // Audit del 09/11/2026, finding 28 (REQ-FLOTTA-057): «Apri l'app» solo
  // se l'indirizzo dell'istanza è un https.
  it('un url dell’istanza che non è https non diventa «Apri l’app»', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', url: 'javascript:alert(1)' },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).getByText('Attiva')).toHaveClass('stato-ok')
    expect(within(attivo).queryByRole('link', { name: /Apri l’app/ })).toBeNull()
  })

  it('una sospesa lo dice col motivo e si riattiva', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto' },
    })
    mostra()
    // La riga lo dice già; la scheda ha il tasto.
    expect((await righeLocali()).find((r) => r.textContent.includes('Bar Attivo'))).toHaveTextContent(/sospesa · pagamento non ricevuto/)
    const sospeso = await apri('Bar Attivo')
    expect(sospeso).toHaveTextContent(/sospesa · pagamento non ricevuto/)
    await user.click(within(sospeso).getByRole('button', { name: 'Riattiva' }))
    expect(db.impostaStatoIstanza).toHaveBeenLastCalledWith('bar-attivo', 'attiva', null)
  })

  // REQ-FLOTTA-009: l'app di base è tana-drink; un aggiornamento si porta
  // a un locale solo con «Aggiorna». A tutti ci arriva a ondate
  // (REQ-FLOTTA-012): «Aggiorna tutte» non c'è più. Dal 30/10/2026 il
  // bottone si chiama «Aggiorna subito» e dice accanto cosa fa (sotto,
  // «il bottone Aggiorna dice cosa fa»).
  it('«Aggiorna» porta l’ultima versione a un locale; a tutti si arriva solo con un rilascio', async () => {
    const user = userEvent.setup()
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna subito' }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('bar-attivo')
    expect(screen.queryByRole('button', { name: /Aggiorna tutte/ })).toBeNull()
  })

  // REQ-FLOTTA-016: «Cambia piano» al posto di «Piano a mano».
  it('«Cambia piano»: senza Stripe si cambia fuori da Stripe, con piano, moduli e terminali', async () => {
    const user = userEvent.setup()
    mostra()
    const nuovo = await apri('Bar Nuovo')
    await user.click(within(nuovo).getByRole('button', { name: 'Cambia piano…' }))
    const modulo = within(nuovo).getByRole('form', { name: 'Cambia piano di Bar Nuovo' })
    expect(within(modulo).getByLabelText(/Con Stripe/)).toBeDisabled()
    expect(within(modulo).getByLabelText(/Fuori da Stripe/)).toBeChecked()
    await user.click(within(modulo).getByLabelText('Magazzino e fornitori'))
    await user.click(within(modulo).getByRole('button', { name: 'Cambia piano' }))
    expect(db.cambiaPianoAdmin).toHaveBeenCalledWith({ slug: 'bar-nuovo', piano: 'base', moduli: ['magazzino'], terminali: 1, modo: 'fuori', pagato_fino_al: '' })
  })

  it('«Cambia piano» con un abbonamento Stripe propone Stripe; verso il Free spariscono moduli e terminali', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([
      { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01', abbonamento: { stato: 'attivo', stripe_subscription: 'sub_1' } },
    ])
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Cambia piano…' }))
    const modulo = within(attivo).getByRole('form', { name: 'Cambia piano di Bar Attivo' })
    expect(within(modulo).getByLabelText(/Con Stripe/)).toBeChecked()
    await user.selectOptions(within(modulo).getByLabelText('Piano'), 'free')
    expect(within(modulo).queryByLabelText('Terminali')).toBeNull()
    expect(within(modulo).queryByLabelText('Magazzino e fornitori')).toBeNull()
  })
})

// REQ-FLOTTA-011: l'admin governa i deploy e crea locali da sé.
describe('il backoffice governa i deploy', () => {
  // Interruttore e richieste da autorizzare stanno in «Richieste» (30/10/2026).
  // L'utente, 02/11/2026: «per ora la vendita è attiva ma non il deploy
  // automatico, che passa per me. Poi con un setting che abilito io posso
  // attivare il deploy automatico dopo acquisto».
  it('l’interruttore del deploy automatico è spento di partenza e si accende', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/richieste')
    const interruttore = await screen.findByLabelText('Deploy automatico')
    expect(interruttore).not.toBeChecked()
    expect(screen.getByText(/aspettano la tua autorizzazione/)).toBeInTheDocument()
    await user.click(interruttore)
    expect(db.impostaDeployAutomatico).toHaveBeenCalledWith(true)
  })

  // REQ-FLOTTA-072 (Daniele, 12/11/2026: «facciamo l'attivazione finta»).
  // Nei test VITE_APP_ENV manca, come sul sito di test: l'interruttore c'è.
  it('sul test l’attivazione simulata ha il suo interruttore, spento, sotto il deploy automatico', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/richieste')
    const simulata = await screen.findByLabelText('Attivazione simulata')
    expect(simulata).not.toBeChecked()
    expect(screen.getByText(/nessun progetto Google/)).toBeInTheDocument()
    await user.click(simulata)
    expect(db.impostaAttivazioneSimulata).toHaveBeenCalledWith(true)
  })

  it('un locale Free che ha comprato aspetta l’admin: «Pubblica il piano» lancia il profilo completo', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-nuovo': { slug: 'bar-nuovo', stato: 'attiva', profilo: 'leggero', profilo_completo_da_autorizzare: { chiesto_il: '2026-11-02T10:00:00Z', piano: 'base' } },
    })
    mostra('/backoffice/richieste')
    const sezione = await screen.findByRole('region', { name: 'Free che hanno comprato' })
    expect(sezione).toHaveTextContent(/Bar Nuovo/)
    expect(sezione).toHaveTextContent(/piano Base/)
    await user.click(within(sezione).getByRole('button', { name: 'Pubblica il piano' }))
    expect(db.autorizzaProfiloCompleto).toHaveBeenCalledWith('bar-nuovo')
  })

  it('spento, le richieste da approvare stanno in cima: Autorizza le mette in coda, Rifiuta chiede il motivo', async () => {
    const user = userEvent.setup()
    regia.impostazioni = { deploy_automatico: false }
    db.elencoRichieste.mockResolvedValue({ 'bar-nuovo': { stato: 'da approvare', piano: 'base', chiesta_il: '2026-10-22T10:00:00Z' } })
    mostra('/backoffice/richieste')
    const sezione = await screen.findByRole('region', { name: 'Richieste da autorizzare' })
    expect(sezione).toHaveTextContent(/Bar Nuovo/)
    expect(screen.getByText(/aspettano la tua autorizzazione/)).toBeInTheDocument()
    await user.click(within(sezione).getByRole('button', { name: 'Autorizza' }))
    expect(db.autorizzaRichiesta).toHaveBeenCalledWith('bar-nuovo')
    vi.spyOn(window, 'prompt').mockReturnValue('dati incompleti')
    await user.click(within(sezione).getByRole('button', { name: 'Rifiuta' }))
    expect(db.rifiutaRichiesta).toHaveBeenCalledWith('bar-nuovo', 'dati incompleti')
  })

  // Il modulo è la sezione «Nuovo locale»: niente bottone per aprirlo; fatto,
  // si torna all'elenco dei locali (30/10/2026).
  it('«Nuovo locale» crea il cliente con piano, moduli e attivazione subito', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/nuovo')
    const modulo = await screen.findByRole('form', { name: 'Nuovo locale' })
    await user.type(within(modulo).getByLabelText('Nome del locale'), 'Bar Creato')
    await user.type(within(modulo).getByLabelText('Email del titolare'), 'creato@example.it')
    await user.click(within(modulo).getByLabelText(/Personale e ore/))
    await user.click(within(modulo).getByRole('button', { name: 'Crea il locale' }))
    expect(db.creaClienteDaAdmin).toHaveBeenCalledWith({
      nome_locale: 'Bar Creato',
      email: 'creato@example.it',
      piano: 'base',
      moduli: ['staff'],
      terminali: 1,
      attiva_subito: true,
    })
    await waitFor(() => expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/locali'))
  })
})

// REQ-AI-003 (decisione dell'utente del 24/10/2026): il cassetto AI di ogni
// locale si governa da qui, e la Tana entra come locale esistente.
describe('il backoffice e il credito AI', () => {
  const MESE = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date())
    .reduce((m, p) => ({ ...m, [p.type]: p.value }), {})
  const meseOra = `${MESE.year}-${MESE.month}`

  it('mostra credito e speso del mese, e ricarica a mano con una nota', async () => {
    const user = userEvent.setup()
    db.elencoCassettiAI.mockResolvedValue({
      'bar-attivo': { credito_microeuro: 12_500_000, mese: meseOra, speso_mese_microeuro: 3_000_000, tetto_mensile_microeuro: 20_000_000, chiave_creata_il: 'x' },
    })
    vi.spyOn(window, 'prompt').mockReturnValueOnce('15,5').mockReturnValueOnce('prima ricarica')
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).getByTestId('credito-bar-attivo')).toHaveTextContent('12,50 €')
    expect(attivo).toHaveTextContent('mese 3,00 € / 20,00 €')
    await user.click(within(attivo).getByRole('button', { name: 'Ricarica AI' }))
    expect(db.gestisciCassettoAI).toHaveBeenCalledWith('bar-attivo', 'ricarica', { importo: 15.5, nota: 'prima ricarica' })
    // Un omaggio (06/11/2026): credito regalato, segnato come tale.
    window.prompt.mockReturnValueOnce('5').mockReturnValueOnce('benvenuto')
    await user.click(within(attivo).getByRole('button', { name: 'Regala AI' }))
    expect(db.gestisciCassettoAI).toHaveBeenCalledWith('bar-attivo', 'omaggio', { importo: 5, nota: 'benvenuto' })
  })

  // REQ-FLOTTA-079: niente più «Chiave AI»: l'AI del locale si fa
  // riconoscere col gettone di Google.
  it('fra le azioni dell’AI non c’è più «Chiave AI»', async () => {
    db.elencoCassettiAI.mockResolvedValue({ 'bar-attivo': { credito_microeuro: 0 } })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).getByRole('button', { name: 'Regala AI' })).toBeInTheDocument()
    expect(within(attivo).queryByRole('button', { name: 'Chiave AI' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Chiave AI nuova' })).toBeNull()
  })

  it('«Locale esistente» registra la Tana senza provisioning', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/nuovo')
    const modulo = await screen.findByRole('form', { name: 'Locale esistente' })
    await user.type(within(modulo).getByLabelText('Nome del locale'), 'La Tana del Coniglio')
    await user.type(within(modulo).getByLabelText('Identificativo'), 'tana-drink')
    await user.type(within(modulo).getByLabelText('Email del titolare'), 'tana@example.it')
    await user.type(within(modulo).getByLabelText('Progetto Firebase'), 'tana-drink')
    await user.type(within(modulo).getByLabelText('Indirizzo dell’app'), 'https://tana-drink.web.app')
    expect(within(modulo).getByLabelText(/Installazione interna/)).toBeChecked()
    // REQ-FLOTTA-039: la Tana entra coi suoi esclusivi già scritti.
    await user.click(within(modulo).getByLabelText('Tema in licenza: Notte'))
    await user.click(within(modulo).getByLabelText('Tema in licenza: Meraviglie'))
    await user.click(within(modulo).getByRole('button', { name: 'Registra il locale' }))
    expect(db.registraLocaleEsistente).toHaveBeenCalledWith({
      nome_locale: 'La Tana del Coniglio',
      slug: 'tana-drink',
      email: 'tana@example.it',
      progetto: 'tana-drink',
      url: 'https://tana-drink.web.app',
      interna: true,
      temi: ['notte', 'meraviglie'],
    })
  })

  // REQ-FLOTTA-039 (richiesta da tana-drink): «la regia deve sempre
  // elencare moduli e temi acquistati in app». Gli installati si leggono
  // dal locale all'apertura della scheda; i temi in licenza li scrive l'admin.
  it('la scheda elenca moduli, temi in licenza e installati nell’app; l’admin assegna gli esclusivi', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'base', moduli: ['magazzino'], temi: ['notte'], creato_il: '2026-10-01' }])
    db.temiDelLocale.mockResolvedValueOnce({ stili_installati: ['lavagna'], temi_installati: [{ id: 'grand-hotel', nome: 'Grand Hotel', stile: 'deco' }], stile_menu: 'notte' })
    mostra()
    const scheda = await apri('Bar Attivo')
    expect(within(scheda).getByTestId('moduli-bar-attivo')).toHaveTextContent('Magazzino e fornitori')
    expect(within(scheda).getByTestId('temi-bar-attivo')).toHaveTextContent('Notte')
    expect(db.temiDelLocale).toHaveBeenCalledWith('bar-attivo')
    expect(await within(scheda).findByTestId('installati-bar-attivo')).toHaveTextContent('stili: Lavagna · temi: Grand Hotel (Deco) · in uso: Notte')
    await user.click(within(scheda).getByRole('button', { name: 'Temi…' }))
    const modulo = within(scheda).getByRole('form', { name: 'Temi in licenza di Bar Attivo' })
    expect(within(modulo).getByLabelText('Notte')).toBeChecked()
    await user.click(within(modulo).getByLabelText('Meraviglie'))
    await user.type(within(modulo).getByLabelText('Altri id, separati da virgola'), 'Aurora, ')
    await user.click(within(modulo).getByRole('button', { name: 'Salva i temi' }))
    expect(db.impostaTemi).toHaveBeenCalledWith('bar-attivo', ['notte', 'meraviglie', 'aurora'])
  })

  // REQ-FLOTTA-040 (06/11/2026): i temi su misura del locale nella scheda;
  // l'admin ne scrive uno con la struttura del menù e la ricetta, lo
  // pubblica e lo ritira.
  it('la scheda elenca i temi su misura; l’admin ne scrive uno con struttura e ricetta, lo ritira e lo pubblica', { timeout: 20000 }, async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'base', creato_il: '2026-10-01' }])
    db.elencoTemiSuMisura.mockResolvedValue([
      { id: 'su-misura-1', nome: 'Bosco', descrizione: '', stato: 'pubblicato', origine: 'mockup', tavolozza: { base: 'tana-scuro', colori: {} }, stile: 'deco', ricetta: { versione: 1, impaginazione: 'per-categoria' } },
      { id: 'aurora', nome: 'Aurora', descrizione: '', stato: 'bozza', origine: 'fornitore', tavolozza: { base: 'crema', colori: {} }, stile: 'riviera' },
    ])
    mostra()
    const scheda = await apri('Bar Attivo')
    expect(db.elencoTemiSuMisura).toHaveBeenCalledWith('a')
    expect(await within(scheda).findByTestId('su-misura-bar-attivo')).toHaveTextContent('Bosco (dal tuo mockup, Una pagina per categoria, pubblicato) · Aurora (dal fornitore, stile Riviera, bozza)')
    await user.click(within(scheda).getByRole('button', { name: 'Ritira «Bosco»' }))
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('ritira', { slug: 'bar-attivo', id: 'su-misura-1' })
    await user.click(within(scheda).getByRole('button', { name: 'Pubblica «Aurora»' }))
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('pubblica', { slug: 'bar-attivo', id: 'aurora' })
    await user.click(within(scheda).getByRole('button', { name: 'Nuovo tema su misura…' }))
    const modulo = within(scheda).getByRole('form', { name: 'Nuovo tema su misura' })
    await user.type(within(modulo).getByLabelText('Identificativo'), 'verde-oro')
    await user.type(within(modulo).getByLabelText('Nome'), 'Verde e oro')
    await user.selectOptions(within(modulo).getByLabelText('Struttura del menù'), 'per-macro-categoria')
    await user.click(within(modulo).getByLabelText('Ricetta (JSON, facoltativa)'))
    await user.paste('{"caratteri":{"titolo":"playfair-display","voce":"inter","testo":"inter"}}')
    await user.click(within(modulo).getByRole('button', { name: 'Salva e pubblica' }))
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('salva', {
      slug: 'bar-attivo',
      nuovo: true,
      tema: {
        id: 'verde-oro',
        nome: 'Verde e oro',
        descrizione: '',
        tavolozza: { base: 'tana-scuro', colori: {} },
        stile: 'classico',
        ricetta: { versione: 1, caratteri: { titolo: 'playfair-display', voce: 'inter', testo: 'inter' }, impaginazione: 'per-macro-categoria' },
      },
    })
    expect(db.gestisciTemiSuMisura).toHaveBeenCalledWith('pubblica', { slug: 'bar-attivo', id: 'verde-oro' })
  })

  it('una ricetta che non è JSON ferma il salvataggio e lo dice', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'base', creato_il: '2026-10-01' }])
    mostra()
    const scheda = await apri('Bar Attivo')
    await user.click(await within(scheda).findByRole('button', { name: 'Nuovo tema su misura…' }))
    const modulo = within(scheda).getByRole('form', { name: 'Nuovo tema su misura' })
    await user.type(within(modulo).getByLabelText('Identificativo'), 'x1')
    await user.type(within(modulo).getByLabelText('Nome'), 'X')
    await user.type(within(modulo).getByLabelText('Ricetta (JSON, facoltativa)'), '{{non json')
    await user.click(within(modulo).getByRole('button', { name: 'Salva in bozza' }))
    expect(within(modulo).getByText('La ricetta non è un JSON leggibile.')).toBeInTheDocument()
    expect(db.gestisciTemiSuMisura).not.toHaveBeenCalled()
  })

  it('se il progetto del locale non risponde, la scheda lo dice e il resto resta', async () => {
    db.temiDelLocale.mockRejectedValueOnce(new Error('Il progetto del locale non risponde: riprova fra poco.'))
    mostra()
    const scheda = await apri('Bar Attivo')
    expect(await within(scheda).findByText('Il progetto del locale non risponde: riprova fra poco.')).toBeInTheDocument()
    expect(within(scheda).getByTestId('temi-bar-attivo')).toHaveTextContent('nessuno')
  })

  it('un locale esistente non si aggiorna, sospende o chiude dalla flotta', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([
      { uid: 'a', slug: 'bar-attivo', nome_locale: 'Bar Attivo', email: 'a@x.it', piano: 'completo', creato_il: '2026-10-01' },
      { uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24' },
    ])
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo' },
      'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true },
    })
    mostra()
    const tana = await apri('La Tana')
    expect(tana).toHaveTextContent('interna · esistente')
    expect(within(tana).queryByRole('button', { name: /^Aggiorna subito/ })).toBeNull()
    expect(within(tana).queryByRole('button', { name: 'Sospendi' })).toBeNull()
    expect(within(tana).getByRole('button', { name: 'Ricarica AI' })).toBeInTheDocument()
    // Né un gruppo di rilascio: la Tana è sempre nell'ondata delle interne.
    expect(within(tana).queryByRole('combobox')).toBeNull()
    await user.click(within(tana).getByRole('button', { name: 'Cambia piano…' }))
    expect(db.aggiornaIstanza).not.toHaveBeenCalled()
  })

  // REQ-FLOTTA-018: «io farei la A» (l'utente, 30/10/2026).
  it('affidata alla regia, la Tana si aggiorna da qui; Sospendi e Chiudi restano fuori', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24' }])
    db.elencoIstanze.mockResolvedValue({
      'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true, aggiornamenti_dalla_regia: true, cliente: 'tana' },
    })
    mostra()
    const tana = await apri('La Tana')
    await user.click(within(tana).getByRole('button', { name: /^Aggiorna subito/ }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('tana-drink')
    expect(within(tana).queryByRole('button', { name: 'Sospendi' })).toBeNull()
    expect(within(tana).queryByRole('button', { name: 'Chiudi' })).toBeNull()
  })

  it('«Pubblicazione e licenza…» affida la Tana alla regia con la sua cartella e le chiavi della build', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24' }])
    db.elencoIstanze.mockResolvedValue({
      'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true, build: { VITE_FIREBASE_VAPID_KEY: 'vapid-1' } },
    })
    mostra()
    const tana = await apri('La Tana')
    await user.click(within(tana).getByRole('button', { name: 'Pubblicazione e licenza…' }))
    const modulo = within(tana).getByRole('form', { name: 'Pubblicazione e licenza di La Tana' })
    expect(within(modulo).getByLabelText('Cartella in clienti/ dell’app')).toHaveValue('tana-drink')
    expect(within(modulo).getByLabelText('Chiave VAPID delle notifiche')).toHaveValue('vapid-1')
    await user.click(within(modulo).getByRole('checkbox', { name: /La aggiorna la regia/ }))
    // REQ-FLOTTA-028: la licenza dalla regia, coi moduli del suo piano.
    await user.click(within(modulo).getByRole('checkbox', { name: /La licenza la scrive la regia/ }))
    expect(within(modulo).getByText(/serve che la regia ci possa scrivere/)).toBeInTheDocument()
    await user.clear(within(modulo).getByLabelText('Cartella in clienti/ dell’app'))
    await user.type(within(modulo).getByLabelText('Cartella in clienti/ dell’app'), 'tana')
    await user.type(within(modulo).getByLabelText('Chiave reCAPTCHA di App Check'), '6Lc-abc')
    await user.click(within(modulo).getByRole('button', { name: 'Salva' }))
    expect(db.impostaAggiornamentiEsistente).toHaveBeenCalledWith({
      slug: 'tana-drink',
      aggiornamenti_dalla_regia: true,
      licenza_dalla_regia: true,
      cliente: 'tana',
      build: { VITE_FIREBASE_VAPID_KEY: 'vapid-1', VITE_RECAPTCHA_SITE_KEY: '6Lc-abc', VITE_FIREBASE_MEASUREMENT_ID: '' },
    })
    // Finito, il modulo si chiude e i dati si rileggono.
    expect(within(tana).queryByRole('form', { name: 'Pubblicazione e licenza di La Tana' })).toBeNull()
  })

  it('un errore nel salvare si vede, e il modulo resta aperto', async () => {
    const user = userEvent.setup()
    db.impostaAggiornamentiEsistente.mockRejectedValueOnce(new Error('Cartella del cliente «X» non valida'))
    db.elencoClienti.mockResolvedValue([{ uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24' }])
    db.elencoIstanze.mockResolvedValue({ 'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true } })
    mostra()
    const tana = await apri('La Tana')
    await user.click(within(tana).getByRole('button', { name: 'Pubblicazione e licenza…' }))
    await user.click(within(tana).getByRole('button', { name: 'Salva' }))
    expect(await screen.findByText(/Cartella del cliente «X» non valida/)).toBeInTheDocument()
    expect(within(tana).getByRole('form', { name: 'Pubblicazione e licenza di La Tana' })).toBeInTheDocument()
  })
})

// I RILASCI A ONDATE (REQ-FLOTTA-012): un tag arriva ai locali un'ondata
// alla volta; un aggiornamento fallito si riprova o si torna indietro.
describe('i rilasci a ondate nel backoffice', () => {
  const rilascio = (extra = {}) => ({
    ref: 'v1.11.0',
    stato: 'in corso',
    ondata: 0,
    ondate: [
      { nome: 'prova', slugs: ['bar-prova'], avviata_il: '2026-10-27T09:00:00Z' },
      { nome: 'generale', slugs: ['bar-attivo'], avviata_il: null },
    ],
    riepilogo: [
      { nome: 'prova', riuscito: 1, 'in corso': 0, fallito: 0, 'in attesa': 0, escluso: 0 },
      { nome: 'generale', riuscito: 0, 'in corso': 0, fallito: 0, 'in attesa': 1, escluso: 0 },
    ],
    puo_avanzare: true,
    prossima: 'generale',
    perche_fermo: null,
    creato_il: '2026-10-27T08:00:00Z',
    ...extra,
  })

  it('senza rilasci aperti si crea un rilascio, solo da un tag', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValueOnce('main').mockReturnValueOnce('v1.11.0')
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    await user.click(within(riquadro).getByRole('button', { name: 'Nuovo rilascio' }))
    // «main» cambia fra un'ondata e l'altra: non è un rilascio.
    expect(window.alert).toHaveBeenCalled()
    expect(db.gestisciRilascio).not.toHaveBeenCalled()
    await user.click(within(riquadro).getByRole('button', { name: 'Nuovo rilascio' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('crea', { ref: 'v1.11.0', obbligatorio: false })
  })

  it('un rilascio aperto dice le ondate e avvia la successiva', async () => {
    const user = userEvent.setup()
    db.elencoRilasci.mockResolvedValue([rilascio()])
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    expect(await within(riquadro).findByText('v1.11.0')).toBeInTheDocument()
    expect(riquadro).toHaveTextContent('Istanze di prova')
    expect(riquadro).toHaveTextContent('1 aggiornati')
    expect(within(riquadro).queryByRole('button', { name: 'Nuovo rilascio' })).toBeNull()
    await user.click(within(riquadro).getByRole('button', { name: 'Avvia l’ondata «Tutti gli altri»' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('avanza', { ref: 'v1.11.0' })
  })

  it('un rilascio fermo dice perché e non avanza', async () => {
    db.elencoRilasci.mockResolvedValue([
      rilascio({
        stato: 'fermo',
        fermato_perche: 'Aggiornamento fallito: bar-prova',
        puo_avanzare: false,
        prossima: null,
        perche_fermo: 'Nell’ondata «prova» ci sono aggiornamenti falliti: riprova o torna alla versione di prima.',
      }),
    ])
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    expect(await within(riquadro).findByText(/Aggiornamento fallito: bar-prova/)).toBeInTheDocument()
    expect(riquadro).toHaveTextContent('riprova o torna alla versione di prima')
    expect(within(riquadro).queryByRole('button', { name: /Avvia l’ondata/ })).toBeNull()
    expect(within(riquadro).getByRole('button', { name: 'Annulla rilascio' })).toBeInTheDocument()
  })

  it('un aggiornamento fallito lascia il locale attivo, e si riprova o si torna indietro', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        versione: 'v1.10.0',
        aggiornamento: { ref: 'v1.11.0', rilascio: 'v1.11.0', stato: 'fallito', errore: 'deploy interrotto', versione_precedente: 'v1.10.0' },
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent('Attiva')
    expect(attivo).toHaveTextContent('aggiornamento a v1.11.0 fallito: deploy interrotto')
    await user.click(within(attivo).getByRole('button', { name: 'Riprova' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('riprova', { ref: 'v1.11.0', slug: 'bar-attivo' })
    await user.click(within(attivo).getByRole('button', { name: 'Torna a v1.10.0' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('indietro', { slug: 'bar-attivo' })
  })

  it('un locale della flotta si mette nel gruppo pilota', async () => {
    const user = userEvent.setup()
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.selectOptions(within(attivo).getByRole('combobox', { name: 'Gruppo di rilascio di Bar Attivo' }), 'pilota')
    expect(db.gestisciRilascio).toHaveBeenCalledWith('gruppo', { slug: 'bar-attivo', gruppo: 'pilota' })
  })
})

// L'ELIMINAZIONE (REQ-FLOTTA-014): solo un locale chiuso, solo l'admin può
// scegliere «subito», sempre scrivendo il nome dell'app.
describe('eliminare un locale dal backoffice', () => {
  it('un locale chiuso si elimina subito, confermando col nome dell’app', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', versione: 'v1.10.0', licenza_stato: 'chiusa', licenza_motivo: 'chiusura' },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Elimina…' }))
    const modulo = within(attivo).getByRole('form', { name: 'Elimina Bar Attivo' })
    await user.click(within(modulo).getByLabelText(/Subito/))
    const tasto = within(modulo).getByRole('button', { name: 'Backup ed elimina subito' })
    expect(tasto).toBeDisabled()
    await user.type(within(modulo).getByLabelText(/Per confermare scrivi/), 'drinkpos-bar-attivo')
    await user.click(tasto)
    expect(db.gestisciEliminazione).toHaveBeenCalledWith('chiedi', { slug: 'bar-attivo', conferma: 'drinkpos-bar-attivo', subito: true })
  })

  it('un locale aperto non ha «Elimina»; una programmata si vede e si annulla', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', licenza_stato: 'chiusa', eliminazione: { stato: 'programmata', quando: '2026-11-28T10:00:00Z', richiedente: 'titolare' } },
      'bar-rotto': { stato: 'attiva', progetto: 'drinkpos-bar-rotto' },
    })
    mostra()
    const rotto = await apri('Bar Rotto')
    expect(within(rotto).queryByRole('button', { name: 'Elimina…' })).toBeNull()
    // Se ne apre una alla volta: aprire l'altra chiude questa.
    const attivo = await apri('Bar Attivo')
    expect(screen.queryByRole('article', { name: 'Bar Rotto' })).toBeNull()
    expect(attivo).toHaveTextContent(/Programmata per il .* \(chiesta dal titolare\)/)
    expect(within(attivo).queryByRole('button', { name: 'Elimina…' })).toBeNull()
    await user.click(within(attivo).getByRole('button', { name: 'Annulla eliminazione' }))
    expect(db.gestisciEliminazione).toHaveBeenCalledWith('annulla', { slug: 'bar-attivo' })
  })
})

// LA VENDITA (REQ-FLOTTA-015): l'admin mette in vendita il Free e i moduli,
// con un clic.
describe('la vendita nel backoffice', () => {
  it('il Free parte spento; accenderlo e togliere un modulo scrivono la vendita', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: { menu_tavoli: true, ordini_cliente: true, clienti: true, magazzino: true, statistiche: true, staff: true, sumup: true } }
    mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    // «Disponibile», non «in vendita»: il Free non si vende (REQ-FLOTTA-073).
    const free = within(vendita).getByLabelText('Piano Free disponibile')
    expect(free).not.toBeChecked()
    expect(vendita).toHaveTextContent(/Tienilo spento finché l’app non fa rispettare i suoi limiti/)
    await user.click(free)
    expect(db.impostaVendita).toHaveBeenCalledWith({ free: true })
    await user.click(within(vendita).getByLabelText('Pagamenti con lettore SumUp'))
    expect(db.impostaVendita).toHaveBeenCalledWith({ moduli: { sumup: false } })
  })

  // REQ-FLOTTA-071 (Daniele, 12/11/2026: «mettimelo che posso mostrarlo
  // oppure no… no proprio nascondere il free»).
  // REQ-FLOTTA-073: la frase sull'attivazione in prima pagina la decide l'admin.
  it('mostrare l’attivazione automatica ha il suo interruttore, spento, e un clic scrive la vendita', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: {} }
    mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    const mostraAutomatica = within(vendita).getByLabelText('Mostra «Attivazione automatica» nella prima pagina')
    expect(mostraAutomatica).not.toBeChecked()
    expect(vendita).toHaveTextContent(/dice «Attivazione concordata con noi»/)
    await user.click(mostraAutomatica)
    expect(db.impostaVendita).toHaveBeenCalledWith({ mostra_attivazione_automatica: true })
  })

  it('nascondere il Free ha il suo interruttore, spento, e un clic scrive la vendita', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: {} }
    mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    const nascondi = within(vendita).getByLabelText('Nascondi il Free dal sito')
    expect(nascondi).not.toBeChecked()
    expect(vendita).toHaveTextContent(/il Free compare con le sue differenze da Base e Completo/)
    await user.click(nascondi)
    expect(db.impostaVendita).toHaveBeenCalledWith({ nascondi_free: true })
  })
})

// LE PROVE DEI MODULI (REQ-FLOTTA-016): nel riquadro «Vendita» l'admin dice
// per quanti giorni si prova ogni modulo; 0 vuol dire niente prova.
describe('le prove nel backoffice', () => {
  it('i giorni di prova si scrivono uscendo dal campo, e si puliscono', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: {}, prove: { magazzino: 0 } }
    mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    const giorni = within(vendita).getByLabelText('Giorni di prova di Magazzino e fornitori')
    await user.clear(giorni)
    await user.type(giorni, '14')
    expect(db.impostaVendita).not.toHaveBeenCalled()
    await user.tab()
    expect(db.impostaVendita).toHaveBeenCalledWith({ prove: { magazzino: 14 } })
  })
})

// REQ-FLOTTA-017: i pagamenti online si accendono dal backoffice; spenti,
// le richieste di contatto dei titolari stanno qui, con piano e recapito.
describe('i pagamenti online e le richieste di contatto', () => {
  // REQ-FLOTTA-043: il sito aperto al pubblico, tre stati detti a parole.
  it('l’interruttore «Sito aperto al pubblico» scrive la vendita e dice cosa vale ogni stato', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: {} }
    const { unmount } = mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    const sito = within(vendita).getByLabelText('Sito aperto al pubblico')
    expect(sito).not.toBeChecked()
    expect(within(vendita).getByTestId('sito-aperto')).toHaveTextContent(/Non ancora deciso: in produzione il sito mostra solo l’anteprima/)
    await user.click(sito)
    expect(db.impostaVendita).toHaveBeenCalledWith({ sito_aperto: true })
    unmount()
    regia.vendita = { free: false, moduli: {}, sito_aperto: false }
    mostra('/backoffice/vendita')
    // Si aspetta il testo, non l'elemento: la riga c'è dal primo render
    // (dice «Non ancora deciso» finché la vendita non arriva) e sul runner
    // findByTestId la trovava prima che l'effetto la aggiornasse.
    await waitFor(() => expect(screen.getByTestId('sito-aperto')).toHaveTextContent(/Chiuso dappertutto/))
    expect(screen.getByLabelText('Sito aperto al pubblico')).not.toBeChecked()
  })

  it('l’interruttore dei pagamenti online scrive la vendita e dice cosa succede', async () => {
    const user = userEvent.setup()
    regia.vendita = { free: false, moduli: {} }
    mostra('/backoffice/vendita')
    const vendita = await screen.findByRole('region', { name: 'Vendita' })
    const pagamenti = within(vendita).getByLabelText('Pagamenti online con Stripe')
    expect(pagamenti).not.toBeChecked()
    expect(vendita).toHaveTextContent(/Niente Checkout/)
    await user.click(pagamenti)
    expect(db.impostaVendita).toHaveBeenCalledWith({ pagamenti_online: true })
  })

  it('le richieste aperte si contano, dicono piano e recapito, e si segnano gestite', async () => {
    const user = userEvent.setup()
    regia.contatti = [
      { uid: 'u9', email: 'bar@example.com', nome_locale: 'Bar Nove', telefono: '+39 333 1234567', nota: 'Di mattina', scelta: { piano: 'base', moduli: ['staff'], terminali: 2 }, stato: 'aperta', chiesta_il: '2026-10-30T10:00:00.000Z' },
      { uid: 'u8', email: 'otto@example.com', scelta: { piano: 'completo', moduli: [], terminali: 1 }, stato: 'gestita', chiesta_il: '2026-10-29T10:00:00.000Z', gestita_il: '2026-10-29T12:00:00.000Z' },
      // Un modulo chiesto dall'app su un piano a mano (REQ-FLOTTA-037): la
      // stessa riga, con la nota che dice cosa, e si segna col suo id.
      { uid: 'u7_magazzino', email: 'sette@example.com', nome_locale: 'Bar Sette', nota: 'Dall’app: aggiungere Magazzino e fornitori.', scelta: { piano: 'base', moduli: ['magazzino'], terminali: 1 }, dall_app: { azione: 'aggiungi', modulo: 'magazzino', da: 'sette@example.com' }, stato: 'aperta', chiesta_il: '2026-11-04T10:00:00.000Z' },
      // Un tema su misura chiesto al fornitore (REQ-FLOTTA-040): niente
      // piano, la struttura del menù e il riferimento.
      { uid: 'u6_tema', email: 'sei@example.com', nome_locale: 'Bar Sei', nota: 'Verde bosco e oro.', scelta: null, tema_su_misura: { struttura: 'per-categoria', riferimento: 'https://canva.com/x' }, stato: 'gestita', chiesta_il: '2026-11-06T10:00:00.000Z' },
    ]
    mostra('/backoffice/richieste')
    const sezione = await screen.findByRole('region', { name: 'Richieste di contatto' })
    expect(sezione).toHaveTextContent('2 da gestire')
    expect(sezione).toHaveTextContent('Bar Sei · tema su misura · Una pagina per categoria · riferimento: https://canva.com/x')
    expect(sezione).toHaveTextContent('«Verde bosco e oro.»')
    expect(sezione).not.toHaveTextContent('Bar Sei · undefined')
    expect(sezione).toHaveTextContent('Bar Nove')
    expect(sezione).toHaveTextContent('+39 333 1234567')
    expect(sezione).toHaveTextContent('«Di mattina»')
    expect(within(sezione).getByRole('link', { name: '+39 333 1234567' })).toHaveAttribute('href', 'tel:+393331234567')
    expect(sezione).toHaveTextContent('Bar Sette · Base + Magazzino e fornitori')
    expect(sezione).toHaveTextContent('«Dall’app: aggiungere Magazzino e fornitori.»')
    const [nove, sette] = within(sezione).getAllByRole('button', { name: 'Segna gestita' })
    await user.click(nove)
    expect(db.segnaContatto).toHaveBeenCalledWith('u9', 'gestita')
    await user.click(sette)
    expect(db.segnaContatto).toHaveBeenCalledWith('u7_magazzino', 'gestita')
    await user.click(within(sezione).getAllByRole('button', { name: 'Riapri' })[0])
    expect(db.segnaContatto).toHaveBeenCalledWith('u8', 'aperta')
    regia.contatti = []
  })
})

// LE SEZIONI (REQ-FLOTTA-005, l'utente, 30/10/2026: «puoi separare le varie
// sezioni del backoffice magari in sotto menu? Così è tutto troppo
// caotico»). Un sotto-menù con cinque voci, ognuna col suo indirizzo; i dati
// si leggono una volta; un contatore sulle voci dove c'è da fare.
describe('le sezioni del backoffice', () => {
  const menu = async () => screen.findByRole('navigation', { name: 'Sezioni del backoffice' })

  it('il sotto-menù ha sette voci, ognuna col suo indirizzo, e /backoffice porta a «Locali»', async () => {
    mostra('/backoffice')
    const nav = await menu()
    const voci = within(nav).getAllByRole('link')
    // Il primo nodo è il nome della voce; dopo, se c'è, il contatore.
    // «Commerciale» (REQ-FLOTTA-041) sta subito dopo i locali.
    expect(voci.map((v) => [v.firstChild.textContent, v.getAttribute('href')])).toEqual([
      ['Locali', '/backoffice/locali'],
      ['Commerciale', '/backoffice/commerciale'],
      ['Richieste', '/backoffice/richieste'],
      ['Rilasci', '/backoffice/rilasci'],
      ['Vendita', '/backoffice/vendita'],
      ['Temi', '/backoffice/temi'],
      ['Nuovo locale', '/backoffice/nuovo'],
    ])
    await waitFor(() => expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/locali'))
    expect(within(nav).getByRole('link', { name: /^Locali/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Rilasci' })).not.toHaveAttribute('aria-current')
    expect(await righeLocali()).toHaveLength(3)
  })

  it('ogni voce apre la sua sezione e solo quella; i dati non si rileggono', async () => {
    const user = userEvent.setup()
    mostra()
    const nav = await menu()
    await righeLocali()
    // In «Locali» non ci sono vendita, rilasci, moduli di creazione.
    expect(screen.queryByRole('region', { name: 'Vendita' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Rilasci' })).toBeNull()
    expect(screen.queryByRole('form', { name: 'Nuovo locale' })).toBeNull()

    await user.click(within(nav).getByRole('link', { name: 'Rilasci' }))
    expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/rilasci')
    expect(within(nav).getByRole('link', { name: 'Rilasci' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('region', { name: 'Rilasci' })).toBeInTheDocument()
    expect(document.querySelectorAll('tr.riga-locale')).toHaveLength(0)

    await user.click(within(nav).getByRole('link', { name: 'Vendita' }))
    expect(screen.getByRole('region', { name: 'Vendita' })).toBeInTheDocument()
    await user.click(within(nav).getByRole('link', { name: 'Richieste' }))
    expect(screen.getByLabelText('Deploy automatico')).toBeInTheDocument()
    expect(screen.getByText('Nessuna attivazione da autorizzare.')).toBeInTheDocument()
    expect(screen.getByText('Nessuna richiesta di contatto.')).toBeInTheDocument()
    await user.click(within(nav).getByRole('link', { name: 'Nuovo locale' }))
    expect(screen.getByRole('form', { name: 'Nuovo locale' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'Locale esistente' })).toBeInTheDocument()

    expect(db.elencoClienti).toHaveBeenCalledTimes(1)
    expect(db.elencoContatti).toHaveBeenCalledTimes(1)
  })

  it('un indirizzo che non c’è porta a «Locali»', async () => {
    mostra('/backoffice/boh')
    await righeLocali()
    expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/locali')
  })

  it('un errore resta nella sezione in cui è nato', async () => {
    const user = userEvent.setup()
    db.aggiornaIstanza.mockRejectedValueOnce(new Error('GitHub 500'))
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna subito' }))
    expect(await screen.findByText('GitHub 500')).toBeInTheDocument()
    await user.click(within(await menu()).getByRole('link', { name: 'Vendita' }))
    expect(screen.queryByText('GitHub 500')).toBeNull()
  })

  it('senza niente da fare le voci non hanno contatori', async () => {
    db.elencoIstanze.mockResolvedValue({ 'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo' } })
    mostra()
    const nav = await menu()
    await righeLocali()
    expect(nav.querySelectorAll('.conta')).toHaveLength(0)
  })

  it('i contatori: attivazioni fallite in «Locali», da autorizzare e contatti aperti in «Richieste», aggiornamenti falliti in «Rilasci»', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', aggiornamento: { ref: 'v1.11.0', stato: 'fallito', versione_precedente: 'v1.10.0' } },
      'bar-rotto': { stato: 'errore', errore: 'quota progetti' },
    })
    db.elencoRichieste.mockResolvedValue({ 'bar-nuovo': { stato: 'da approvare', piano: 'base' } })
    regia.contatti = [
      { uid: 'u9', email: 'nove@example.com', scelta: { piano: 'base' }, stato: 'aperta', chiesta_il: '2026-10-30T10:00:00.000Z' },
      { uid: 'u8', email: 'otto@example.com', scelta: { piano: 'base' }, stato: 'gestita', chiesta_il: '2026-10-29T10:00:00.000Z' },
    ]
    mostra()
    const nav = await menu()
    expect(await within(nav).findByRole('link', { name: /^Richieste\s*, 2 da gestire$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Locali\s*, 1 da gestire$/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Rilasci\s*, 1 da gestire$/ })).toBeInTheDocument()
    // Il numero si vede; la frase intera è per chi usa un lettore di schermo.
    expect(within(within(nav).getByRole('link', { name: /^Richieste/ })).getByText('2')).toHaveAttribute('aria-hidden', 'true')
    expect(within(nav).getByRole('link', { name: 'Vendita' })).toBeInTheDocument()
    regia.contatti = []
  })

  it('in «Rilasci» gli aggiornamenti falliti stanno tutti insieme, e si riprovano da lì', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        aggiornamento: { ref: 'v1.11.0', stato: 'fallito', errore: 'deploy interrotto', versione_precedente: 'v1.10.0' },
      },
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mostra('/backoffice/rilasci')
    const falliti = await screen.findByRole('region', { name: 'Aggiornamenti falliti' })
    expect(falliti).toHaveTextContent('Bar Attivo')
    expect(falliti).toHaveTextContent('aggiornamento a v1.11.0 fallito: deploy interrotto')
    // Fuori da un rilascio, «Riprova» rilancia lo stesso ref su quel locale.
    await user.click(within(falliti).getByRole('button', { name: 'Riprova' }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('bar-attivo', 'v1.11.0')
    await user.click(within(falliti).getByRole('button', { name: 'Torna a v1.10.0' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('indietro', { slug: 'bar-attivo' })
  })

  it('senza aggiornamenti falliti «Rilasci» non ne mostra l’elenco', async () => {
    mostra('/backoffice/rilasci')
    await screen.findByRole('region', { name: 'Rilasci' })
    expect(screen.queryByRole('region', { name: 'Aggiornamenti falliti' })).toBeNull()
  })
})

// L'ELENCO DEI LOCALI si cerca e si filtra per stato; i filtri stanno
// nell'indirizzo, così un elenco filtrato si condivide.
describe('cercare e filtrare i locali', () => {
  const nomi = () => [...document.querySelectorAll('tr.riga-locale .nome-locale')].map((b) => b.textContent)

  it('la ricerca trova per nome, identificativo o email, e finisce nell’indirizzo', async () => {
    const user = userEvent.setup()
    mostra()
    await righeLocali()
    expect(screen.getByTestId('quanti-locali')).toHaveTextContent('3 locali')
    await user.type(screen.getByRole('searchbox', { name: 'Cerca' }), 'rotto')
    expect(nomi()).toEqual(['Bar Rotto'])
    expect(screen.getByTestId('quanti-locali')).toHaveTextContent('1 di 3 locali')
    expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/locali?cerca=rotto')
    await user.clear(screen.getByRole('searchbox', { name: 'Cerca' }))
    await user.type(screen.getByRole('searchbox', { name: 'Cerca' }), 'c@x.it')
    expect(nomi()).toEqual(['Bar Nuovo'])
    await user.clear(screen.getByRole('searchbox', { name: 'Cerca' }))
    expect(nomi()).toHaveLength(3)
    expect(screen.getByTestId('dove').textContent).toBe('/backoffice/locali')
  })

  it('la vista per stato conta i locali e li filtra', async () => {
    const user = userEvent.setup()
    mostra()
    await righeLocali()
    const vista = screen.getByRole('combobox', { name: 'Stato' })
    expect(within(vista).getByRole('option', { name: 'Da seguire (1)' })).toBeInTheDocument()
    expect(within(vista).getByRole('option', { name: 'In attivazione (1)' })).toBeInTheDocument()
    await user.selectOptions(vista, 'attivi')
    expect(nomi()).toEqual(['Bar Attivo'])
    expect(screen.getByTestId('dove')).toHaveTextContent('/backoffice/locali?vista=attivi')
    await user.selectOptions(vista, 'eliminati')
    expect(screen.getByText('Nessun locale con questi filtri.')).toBeInTheDocument()
    await user.selectOptions(vista, 'tutti')
    expect(nomi()).toHaveLength(3)
  })

  it('un link con la vista apre l’elenco già filtrato; una vista sconosciuta mostra tutti', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', licenza_stato: 'sospesa' },
      'bar-rotto': { stato: 'errore' },
    })
    const { unmount } = mostra('/backoffice/locali?vista=fermi')
    await screen.findByRole('combobox', { name: 'Stato' })
    expect(nomi()).toEqual(['Bar Attivo'])
    unmount()
    mostra('/backoffice/locali?vista=boh')
    await righeLocali()
    expect(nomi()).toHaveLength(3)
    expect(screen.getByRole('combobox', { name: 'Stato' })).toHaveValue('tutti')
  })

  it('senza clienti lo dice', async () => {
    db.elencoClienti.mockResolvedValue([])
    mostra()
    expect(await screen.findByText('Nessun cliente.')).toBeInTheDocument()
  })

  // REQ-FLOTTA-064: una lettura fallita non è un elenco vuoto. Prima il
  // backoffice, se non riusciva a leggere, diceva «Nessun cliente.».
  it('se non riesce a leggere lo dice e fa riprovare: «Nessun cliente.» è solo per quando non ce ne sono', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockRejectedValueOnce(new Error('Non riesco a leggere dal server: controlla la connessione e riprova.'))
    mostra()
    const avviso = await screen.findByRole('alert')
    expect(avviso).toHaveTextContent('Non riesco a leggere dal server: controlla la connessione e riprova.')
    expect(screen.queryByText('Nessun cliente.')).toBeNull()
    expect(screen.queryByRole('table', { name: 'Locali' })).toBeNull()
    // «Riprova» rilegge: stavolta il server risponde.
    await user.click(screen.getByRole('button', { name: 'Riprova' }))
    await righeLocali()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // «Rilancia» rilegge l'elenco dopo l'azione: se quella rilettura fallisce,
  // l'elenco che c'era resta a schermo.
  it('se la lettura fallisce a pagina già caricata, l’elenco di prima resta e compare il messaggio', async () => {
    const user = userEvent.setup()
    mostra()
    const prima = (await nomiLocali()).length
    const scheda = await apri('Bar Rotto')
    db.elencoClienti.mockRejectedValueOnce(new Error('Non riesco a leggere dal server: controlla la connessione e riprova.'))
    await user.click(within(scheda).getByRole('button', { name: 'Rilancia' }))
    expect(await screen.findByText('Non riesco a leggere dal server: controlla la connessione e riprova.')).toBeInTheDocument()
    expect(await nomiLocali()).toHaveLength(prima)
    expect(screen.queryByText('Nessun cliente.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull()
  })
})

// «AGGIORNA» DICE COSA FA (l'utente, 30/10/2026: oggi non dice cosa fa).
// Lancia aggiornaIstanza, che porta a quel locale solo la versione
// dell'app scelta dalla regia (APP_REF): una correzione urgente; a tutti un
// rilascio arriva a ondate da «Rilasci». Il testo sta accanto al bottone,
// sempre visibile, e l'esito dice il ref che la Function restituisce.
describe('il bottone Aggiorna dice cosa fa', () => {
  it('accanto al bottone c’è cosa fa, ed è la sua descrizione per chi usa un lettore di schermo', async () => {
    mostra()
    const attivo = await apri('Bar Attivo')
    const tasto = within(attivo).getByRole('button', { name: 'Aggiorna subito' })
    expect(tasto).toHaveAccessibleDescription(/solo questo locale, all’ultima versione dell’app, per una correzione urgente/)
    expect(tasto).toHaveAccessibleDescription(/A tutti i locali la porta un rilascio, a ondate/)
    expect(within(attivo).getByRole('link', { name: 'Rilasci' })).toHaveAttribute('href', '/backoffice/rilasci')
    // Il nome del ramo non è scritto nella pagina: lo decide la Function.
    expect(attivo).not.toHaveTextContent(/\bdevelop\b/)
  })

  it('l’esito dice il ref che la Function ha lanciato', async () => {
    const user = userEvent.setup()
    db.aggiornaIstanza.mockResolvedValueOnce({ ok: true, ref: 'develop' })
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna subito' }))
    expect(db.aggiornaIstanza).toHaveBeenCalledWith('bar-attivo')
    expect(await within(attivo).findByRole('status')).toHaveTextContent('Aggiornamento a develop partito: la scheda si aggiorna da sola quando il workflow finisce.')
  })

  it('senza ref nella risposta l’esito lo tace', async () => {
    const user = userEvent.setup()
    db.aggiornaIstanza.mockResolvedValueOnce({ ok: true })
    mostra()
    const attivo = await apri('Bar Attivo')
    await user.click(within(attivo).getByRole('button', { name: 'Aggiorna subito' }))
    expect(await within(attivo).findByRole('status')).toHaveTextContent(/^Aggiornamento partito:/)
  })
})

// GLI AGGIORNAMENTI OBBLIGATORI O A SCELTA (REQ-FLOTTA-020): le due regole
// le accende l'admin in «Rilasci», con un avviso ai locali attivi; un
// locale si può fissare a una modalità; un rilascio si crea obbligatorio.
describe('le regole degli aggiornamenti nel backoffice', () => {
  it('si cambiano solo confermando, e dicono quanti locali sono stati avvisati', async () => {
    const user = userEvent.setup()
    const conferma = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Regole degli aggiornamenti' })
    const salva = within(riquadro).getByRole('button', { name: 'Salva le regole' })
    // Niente di cambiato, niente da salvare.
    expect(salva).toBeDisabled()
    expect(riquadro).toHaveTextContent('I termini del servizio (punti 3 e 5) descrivono già tutte e due le regole.')
    await user.click(within(riquadro).getByRole('checkbox', { name: /A scelta del titolare/ }))
    await user.click(within(riquadro).getByRole('checkbox', { name: /Solo finché si paga/ }))
    await user.click(salva)
    expect(conferma).toHaveBeenCalledWith(expect.stringMatching(/al loro rinnovo/))
    expect(db.impostaRegoleAggiornamenti).not.toHaveBeenCalled()
    await user.click(salva)
    expect(db.impostaRegoleAggiornamenti).toHaveBeenCalledWith({ a_scelta: true, solo_finche_paga: true })
    expect(await within(riquadro).findByRole('status')).toHaveTextContent('Regole salvate: avvisati 2 locali.')
  })

  it('partono dalle regole salvate', async () => {
    regia.aggiornamenti = { a_scelta: true }
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Regole degli aggiornamenti' })
    expect(within(riquadro).getByRole('checkbox', { name: /A scelta del titolare/ })).toBeChecked()
    expect(within(riquadro).getByRole('checkbox', { name: /Solo finché si paga/ })).not.toBeChecked()
    regia.aggiornamenti = {}
  })

  it('un locale segue le regole, o l’admin lo fissa; la scheda dice la regola e la proposta', async () => {
    const user = userEvent.setup()
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        versione: 'v1.10.0',
        regola_aggiornamenti: { modalita: 'a_scelta', inclusi: true, motivo: null },
        proposta_aggiornamento: { tag: 'v1.11.0', attesa: true, saltata_il: null },
      },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent('ora: A scelta del titolare')
    expect(attivo).toHaveTextContent('v1.11.0 proposta al titolare')
    const scelta = within(attivo).getByRole('combobox', { name: 'Aggiornamenti di Bar Attivo' })
    expect(scelta).toHaveValue('')
    await user.selectOptions(scelta, 'obbligatori')
    expect(db.gestisciRilascio).toHaveBeenCalledWith('modalita', { slug: 'bar-attivo', modalita: 'obbligatori' })
    await user.selectOptions(scelta, '')
    expect(db.gestisciRilascio).toHaveBeenCalledWith('modalita', { slug: 'bar-attivo', modalita: null })
  })

  it('un rilascio si crea obbligatorio, e lo dice', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'prompt').mockReturnValueOnce('v1.11.1')
    // Nessun rilascio aperto: la casella c'è solo prima di crearne uno.
    db.elencoRilasci.mockResolvedValue([])
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    await user.click(within(riquadro).getByRole('checkbox', { name: /obbligatorio/ }))
    await user.click(within(riquadro).getByRole('button', { name: 'Nuovo rilascio' }))
    expect(db.gestisciRilascio).toHaveBeenCalledWith('crea', { ref: 'v1.11.1', obbligatorio: true })
  })

  it('un rilascio obbligatorio aperto lo dice, e conta proposti, saltati e senza aggiornamenti', async () => {
    db.elencoRilasci.mockResolvedValue([
      {
        ref: 'v1.11.0',
        stato: 'in corso',
        obbligatorio: true,
        ondata: 0,
        ondate: [{ nome: 'generale', slugs: ['bar-a', 'bar-b', 'bar-c'], avviata_il: '2026-11-01T09:00:00Z' }],
        riepilogo: [{ nome: 'generale', riuscito: 0, 'in corso': 0, fallito: 0, 'in attesa': 0, escluso: 0, proposto: 1, saltato: 1, 'non incluso': 1 }],
        puo_avanzare: false,
        perche_fermo: 'Tutte le ondate sono partite.',
        creato_il: '2026-11-01T08:00:00Z',
      },
    ])
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Rilasci' })
    expect(await within(riquadro).findByText(/obbligatorio/)).toBeInTheDocument()
    expect(riquadro).toHaveTextContent('1 proposti al titolare · 1 saltati dal titolare · 1 senza aggiornamenti nel piano')
  })
})

// LE LICENZE PROTETTE (BUG-125 di tana-drink): la licenza in licenza/attuale,
// che dall'app non si scrive. Prima del rilascio dell'app nuova, tutti i
// locali pronti; un locale senza si ferma, e la sua scheda lo dice.
describe('le licenze protette nel backoffice', () => {
  it('senza controlli lo dice; «Allinea tutte» chiede conferma, «Verifica» no', async () => {
    const user = userEvent.setup()
    regia.licenze = null
    const conferma = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Licenze protette' })
    expect(riquadro).toHaveTextContent('Nessun controllo ancora.')
    await user.click(within(riquadro).getByRole('button', { name: 'Allinea tutte' }))
    expect(db.gestisciLicenze).not.toHaveBeenCalled()
    await user.click(within(riquadro).getByRole('button', { name: 'Allinea tutte' }))
    expect(conferma).toHaveBeenCalledTimes(2)
    expect(db.gestisciLicenze).toHaveBeenCalledWith('allinea')
    await user.click(within(riquadro).getByRole('button', { name: 'Verifica' }))
    expect(db.gestisciLicenze).toHaveBeenCalledWith('verifica')
  })

  it('dice chi non è pronto e perché; tutti pronti si legge in chiaro', async () => {
    regia.licenze = { controllata_il: '2026-11-01T06:00:00Z', allineata: true, totale: 3, pronte: 2, problemi: [{ slug: 'bar-mario', perche: 'Manca licenza/attuale: con l’app nuova il locale si ferma.' }] }
    const { unmount } = mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Licenze protette' })
    expect(within(riquadro).getByTestId('esito-licenze')).toHaveTextContent('Pronti 2 su 3.')
    expect(riquadro).toHaveTextContent('bar-mario: Manca licenza/attuale')
    unmount()
    regia.licenze = { controllata_il: '2026-11-01T06:00:00Z', allineata: false, totale: 3, pronte: 3, problemi: [] }
    mostra('/backoffice/rilasci')
    expect(await screen.findByTestId('esito-licenze')).toHaveTextContent('Tutti pronti: 3 su 3. Verificate il')
    regia.licenze = null
  })

  it('la scheda di un locale con la licenza che non va lo dice', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', licenza_protetta: { ok: false, perche: 'licenza/attuale è diversa da settings/bar.licenza.' } },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent('licenza/attuale è diversa da settings/bar.licenza.')
  })

  // REQ-FLOTTA-024: quello che la licenza toglie arriva al taglio.
  it('la scheda di un locale con una riduzione in attesa dice quando arriva e cosa toglie', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': { stato: 'attiva', progetto: 'drinkpos-bar-attivo', riduzione_al_taglio: { dal: '2026-11-02T04:00:00.000Z', cosa: ['il modulo magazzino'] } },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent(/Dal taglio della giornata .*: il modulo magazzino\./)
  })

  // REQ-FLOTTA-025: la fine della conservazione dei dati di un locale fermo.
  it('la scheda di un locale fermo dice quando finisce la conservazione dei dati, e gli avvisi mandati', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        licenza_stato: 'sospesa',
        eliminazione: { stato: 'programmata', quando: '2027-01-31T10:00:00Z', richiedente: 'conservazione', avvisi: [{ chiave: 'x' }] },
      },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(attivo).toHaveTextContent(/Programmata per il .*\(fine della conservazione dei dati: il locale è fermo\) · avvisi mandati: 1/)
  })

  // REQ-FLOTTA-026: la versione che l'app stessa ha detto alla regia.
  it('la scheda dice la versione che l’app ha presentato, e da quando', async () => {
    db.elencoIstanze.mockResolvedValue({
      'bar-attivo': {
        stato: 'attiva',
        progetto: 'drinkpos-bar-attivo',
        presentazione: { versione: 'v1.10.4', prima_il: '2026-11-02T10:00:00Z', il: '2026-11-03T10:00:00Z', da: 'u1' },
      },
    })
    mostra()
    const attivo = await apri('Bar Attivo')
    expect(within(attivo).getByTestId('presentazione')).toHaveTextContent(/^v1\.10\.4 · dal 0?2\/11\/2026 · ultima volta il 0?3\/11\/2026$/)
    // Senza l'esito di un deploy della regia (la Tana da GitHub), anche la
    // colonna Versione dice quella dell'app, e lo dice.
    expect(attivo).toHaveTextContent(/Versionev1\.10\.4detta dall’app/)
  })
})

// LE SCADENZE A EVENTI (REQ-FLOTTA-023): un piano pagato fuori da Stripe ha
// la sua data, si registra un pagamento, e le scadenze di prima si
// programmano una volta.
describe('le scadenze nel backoffice', () => {
  const manuale = (extra = {}) => ({ uid: 'm', slug: 'bar-bonifico', nome_locale: 'Bar Bonifico', email: 'm@x.it', piano: 'base', creato_il: '2026-10-05', abbonamento: { stato: 'attivo', origine: 'manuale', ...extra } })

  it('un piano fuori da Stripe dice fino a quando è pagato, e si registra un pagamento', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([manuale({ pagato_fino_al: '2026-11-30' })])
    db.elencoIstanze.mockResolvedValue({ 'bar-bonifico': { stato: 'attiva', progetto: 'drinkpos-bar-bonifico' } })
    // Due domande: la data, poi l'importo incassato (REQ-FLOTTA-041), che
    // parte dal canone del cliente (Base: 32,70) e si scrive con la virgola.
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce(' 2026-12-31 ').mockReturnValueOnce(' 65,40 ').mockReturnValueOnce('2027-01-31').mockReturnValueOnce('')
    mostra()
    const scheda = await apri('Bar Bonifico')
    expect(within(scheda).getByTestId('pagato-bar-bonifico')).toHaveTextContent('pagato fino al 30/11/2026')
    await user.click(within(scheda).getByRole('button', { name: 'Registra pagamento…' }))
    expect(db.registraPagamento).not.toHaveBeenCalled()
    await user.click(within(scheda).getByRole('button', { name: 'Registra pagamento…' }))
    expect(db.registraPagamento).toHaveBeenCalledWith('bar-bonifico', '2026-12-31', '65.40')
    expect(window.prompt).toHaveBeenLastCalledWith(expect.stringMatching(/importo incassato, IVA esclusa/), '32,7')
    // Importo vuoto: solo la data.
    await user.click(within(scheda).getByRole('button', { name: 'Registra pagamento…' }))
    expect(db.registraPagamento).toHaveBeenLastCalledWith('bar-bonifico', '2027-01-31', null)
  })

  it('non pagato si vede; senza data «senza scadenza»; con Stripe niente «Registra pagamento»', async () => {
    db.elencoClienti.mockResolvedValue([
      manuale({ pagato_fino_al: '2026-10-31', stato: 'non pagato' }),
      { ...manuale(), uid: 'o', slug: 'bar-omaggio', nome_locale: 'Bar Omaggio' },
      { uid: 's', slug: 'bar-stripe', nome_locale: 'Bar Stripe', email: 's@x.it', piano: 'base', creato_il: '2026-10-06', abbonamento: { stato: 'attivo', origine: 'stripe' } },
    ])
    db.elencoIstanze.mockResolvedValue({})
    mostra()
    expect(within(await apri('Bar Bonifico')).getByTestId('pagato-bar-bonifico')).toHaveTextContent('pagato fino al 31/10/2026 · non pagato')
    expect(within(await apri('Bar Omaggio')).getByTestId('pagato-bar-omaggio')).toHaveTextContent('fuori da Stripe, senza scadenza')
    const stripe = await apri('Bar Stripe')
    expect(within(stripe).queryByRole('button', { name: 'Registra pagamento…' })).toBeNull()
  })

  it('«Cambia piano» fuori da Stripe porta «pagato fino al»', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([manuale({ pagato_fino_al: '2026-11-30' })])
    db.elencoIstanze.mockResolvedValue({})
    mostra()
    const scheda = await apri('Bar Bonifico')
    await user.click(within(scheda).getByRole('button', { name: 'Cambia piano…' }))
    const modulo = within(scheda).getByRole('form', { name: 'Cambia piano di Bar Bonifico' })
    const data = within(modulo).getByLabelText(/Pagato fino al/)
    expect(data).toHaveValue('2026-11-30')
    await user.clear(data)
    await user.type(data, '2027-01-31')
    await user.click(within(modulo).getByRole('button', { name: 'Cambia piano' }))
    expect(db.cambiaPianoAdmin).toHaveBeenCalledWith(expect.objectContaining({ slug: 'bar-bonifico', modo: 'fuori', pagato_fino_al: '2027-01-31' }))
  })

  it('le scadenze di prima si programmano una volta, e si dice quante', async () => {
    const user = userEvent.setup()
    mostra('/backoffice/rilasci')
    const riquadro = await screen.findByRole('region', { name: 'Scadenze' })
    await user.click(within(riquadro).getByRole('button', { name: 'Programma le scadenze' }))
    expect(db.programmaScadenze).toHaveBeenCalled()
    expect(await within(riquadro).findByRole('status')).toHaveTextContent('Programmate 3 scadenze.')
  })
})

// I CODICI SCONTO (REQ-FLOTTA-028): si creano e si disattivano in
// «Vendita», si applicano dalla scheda del locale.
describe('i codici sconto nel backoffice', () => {
  it('l’elenco, un codice nuovo, e disattivarne uno', async () => {
    const user = userEvent.setup()
    db.elencoSconti.mockResolvedValue([
      { codice: 'TANA-100', percentuale: 100, durata_mesi: null, descrizione: 'La Tana', attivo: true, usi: 1 },
      { codice: 'VECCHIO', percentuale: 10, durata_mesi: 3, attivo: false },
    ])
    mostra('/backoffice/vendita')
    const riquadro = await screen.findByRole('region', { name: 'Codici sconto' })
    expect(await within(riquadro).findByTestId('codice-TANA-100')).toHaveTextContent('TANA-100 · 100% · illimitato · 1 uso · La Tana')
    expect(within(riquadro).getByTestId('codice-VECCHIO')).toHaveTextContent('3 mesi · 0 usi · disattivato')
    const modulo = within(riquadro).getByRole('form', { name: 'Nuovo codice sconto' })
    // Il codice proposto si può cambiare (audit del 09/11/2026, finding 15).
    await user.clear(within(modulo).getByLabelText('Codice'))
    await user.type(within(modulo).getByLabelText('Codice'), 'prova-20')
    await user.type(within(modulo).getByLabelText('Percentuale'), '20')
    await user.type(within(modulo).getByLabelText(/Durata in mesi/), '3')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('crea', { codice: 'PROVA-20', percentuale: 20, durata_mesi: 3, usi_massimi: null, descrizione: '' })
    await user.click(within(within(riquadro).getByTestId('codice-TANA-100')).getByRole('button', { name: 'Disattiva' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('disattiva', { codice: 'TANA-100' })
    // Un disattivato non ha il tasto.
    expect(within(within(riquadro).getByTestId('codice-VECCHIO')).queryByRole('button')).toBeNull()
  })

  it('senza durata il codice è illimitato', async () => {
    const user = userEvent.setup()
    db.elencoSconti.mockResolvedValue([])
    mostra('/backoffice/vendita')
    const modulo = await screen.findByRole('form', { name: 'Nuovo codice sconto' })
    await user.clear(within(modulo).getByLabelText('Codice'))
    await user.type(within(modulo).getByLabelText('Codice'), 'TANA-100')
    await user.type(within(modulo).getByLabelText('Percentuale'), '100')
    await user.type(within(modulo).getByLabelText(/Usi massimi/), '1')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('crea', { codice: 'TANA-100', percentuale: 100, durata_mesi: null, usi_massimi: 1, descrizione: '' })
  })

  // Audit del 09/11/2026, finding 15: un codice corto si indovinava, e un
  // 100% senza limite attivava piani gratis a non finire.
  it('il modulo propone un codice di cinque lettere e quattro cifre, «Proponi un altro» lo cambia, e si crea così com’è', async () => {
    const user = userEvent.setup()
    db.elencoSconti.mockResolvedValue([])
    mostra('/backoffice/vendita')
    const modulo = await screen.findByRole('form', { name: 'Nuovo codice sconto' })
    const campo = within(modulo).getByLabelText('Codice')
    const proposto = campo.value
    expect(proposto).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[0-9]{4}$/)
    await user.click(within(modulo).getByRole('button', { name: 'Proponi un altro' }))
    expect(campo.value).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[0-9]{4}$/)
    const scelto = campo.value
    await user.type(within(modulo).getByLabelText('Percentuale'), '20')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('crea', { codice: scelto, percentuale: 20, durata_mesi: null, usi_massimi: null, descrizione: '' })
    // Dopo la creazione un codice nuovo, diverso.
    expect(campo.value).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[0-9]{4}$/)
  })

  it('un codice corto o senza due cifre, e un 100% senza limite, si fermano prima di chiamare', async () => {
    const user = userEvent.setup()
    db.elencoSconti.mockResolvedValue([])
    mostra('/backoffice/vendita')
    const modulo = await screen.findByRole('form', { name: 'Nuovo codice sconto' })
    const campo = within(modulo).getByLabelText('Codice')
    await user.clear(campo)
    await user.type(campo, 'NATALE-X')
    await user.type(within(modulo).getByLabelText('Percentuale'), '20')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(await screen.findByText(/Codice non valido: almeno 8 caratteri/)).toBeInTheDocument()
    expect(db.gestisciSconti).not.toHaveBeenCalled()
    await user.clear(campo)
    await user.type(campo, 'NATALE-2026')
    await user.clear(within(modulo).getByLabelText('Percentuale'))
    await user.type(within(modulo).getByLabelText('Percentuale'), '100')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(await screen.findByText('Un codice al 100% ha sempre un limite di usi.')).toBeInTheDocument()
    expect(db.gestisciSconti).not.toHaveBeenCalled()
    await user.type(within(modulo).getByLabelText(/Usi massimi/), '5')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('crea', { codice: 'NATALE-2026', percentuale: 100, durata_mesi: null, usi_massimi: 5, descrizione: '' })
  })

  // L'utente, 02/11/2026: «Aggiungiamo limite di utilizzo del codice».
  it('il limite di usi: si scrive alla creazione, l’elenco dice gli usi, «Limite…» lo cambia', async () => {
    const user = userEvent.setup()
    db.elencoSconti.mockResolvedValue([{ codice: 'DIECI', percentuale: 20, durata_mesi: 3, attivo: true, usi: 10, usi_massimi: 10 }])
    mostra('/backoffice/vendita')
    const riquadro = await screen.findByRole('region', { name: 'Codici sconto' })
    const riga = await within(riquadro).findByTestId('codice-DIECI')
    expect(riga).toHaveTextContent('10 usi su 10, esaurito')
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('25')
    await user.click(within(riga).getByRole('button', { name: 'Limite…' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('limite', { codice: 'DIECI', usi_massimi: 25 })
    // Vuoto: nessun limite.
    prompt.mockReturnValue('')
    await user.click(within(riga).getByRole('button', { name: 'Limite…' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('limite', { codice: 'DIECI', usi_massimi: null })
    prompt.mockRestore()
    const modulo = within(riquadro).getByRole('form', { name: 'Nuovo codice sconto' })
    await user.clear(within(modulo).getByLabelText('Codice'))
    await user.type(within(modulo).getByLabelText('Codice'), 'CENTO-100')
    await user.type(within(modulo).getByLabelText('Percentuale'), '100')
    await user.type(within(modulo).getByLabelText(/Usi massimi/), '5')
    await user.click(within(modulo).getByRole('button', { name: 'Crea il codice' }))
    expect(db.gestisciSconti).toHaveBeenCalledWith('crea', { codice: 'CENTO-100', percentuale: 100, durata_mesi: null, usi_massimi: 5, descrizione: '' })
  })


  it('la scheda dice lo sconto e il prezzo dopo, e «Sconto…» lo applica', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([
      { uid: 't', slug: 'tana-drink', nome_locale: 'La Tana', email: 't@x.it', piano: 'completo', creato_il: '2026-10-24', sconto: { codice: 'TANA-100', percentuale: 100, fino: null } },
    ])
    db.elencoIstanze.mockResolvedValue({ 'tana-drink': { stato: 'attiva', progetto: 'tana-drink', origine: 'esistente', interna: true } })
    vi.spyOn(window, 'prompt').mockReturnValueOnce(null).mockReturnValueOnce(' TANA-100 ')
    mostra()
    const tana = await apri('La Tana')
    expect(within(tana).getByTestId('sconto-tana-drink')).toHaveTextContent('sconto TANA-100, 100%, illimitato')
    expect(tana).toHaveTextContent(/Completo · 0\s?€/)
    // Annullato: niente.
    await user.click(within(tana).getByRole('button', { name: 'Sconto…' }))
    expect(db.applicaSconto).not.toHaveBeenCalled()
    await user.click(within(tana).getByRole('button', { name: 'Sconto…' }))
    expect(db.applicaSconto).toHaveBeenCalledWith('tana-drink', 'TANA-100')
  })

  it('se lo sconto non si applica, lo dice', async () => {
    const user = userEvent.setup()
    db.elencoClienti.mockResolvedValue([{ uid: 'm', slug: 'bar-mario', nome_locale: 'Bar Mario', email: 'm@x.it', piano: 'base', creato_il: '2026-10-05' }])
    db.elencoIstanze.mockResolvedValue({})
    db.applicaSconto.mockRejectedValueOnce(new Error('Codice sconosciuto o disattivato.'))
    vi.spyOn(window, 'prompt').mockReturnValueOnce('NIENTE')
    mostra()
    const scheda = await apri('Bar Mario')
    await user.click(within(scheda).getByRole('button', { name: 'Sconto…' }))
    expect(await screen.findByText('Codice sconosciuto o disattivato.')).toBeInTheDocument()
  })
})

// REQ-FLOTTA-072, dalla revisione: un locale simulato non ha un progetto, e
// la conferma dell'eliminazione è il suo slug.
describe('un locale simulato nel backoffice', () => {
  it('il codice dice «simulato» al posto del progetto e conferma con lo slug', () => {
    const codice = readFileSync('src/pages/Backoffice.jsx', 'utf8')
    expect(codice).toContain("istanza?.simulata ? 'simulato' : istanza?.progetto || progettoDi(c.slug)")
    expect(codice).toContain('const progetto = istanza?.simulata ? cliente.slug : istanza?.progetto || progettoDi(cliente.slug)')
    // Il nome della costante del sito di produzione dopo gli import.
    const ultimoImport = codice.lastIndexOf('\nimport ')
    expect(codice.indexOf('const PRODUZIONE')).toBeGreaterThan(ultimoImport)
  })
})

// REQ-FLOTTA-081: le stampanti del locale si vedono nel backoffice.
describe('le stampanti del locale nel backoffice', () => {
  it('nella richiesta di contatto e nella scheda del cliente', async () => {
    const stampanti = { non_fiscale: { scelta: 'Epson TM-m30III', altra: null }, fiscale: { scelta: 'altra', altra: 'Olivetti X' } }
    regia.contatti = [{ uid: 'c1', email: 'nuovo@example.com', nome_locale: 'Bar Nuovo', slug: 'bar-nuovo', scelta: { piano: 'base', moduli: [], terminali: 1 }, stato: 'aperta', chiesta_il: '2026-11-12T10:00:00Z', stampanti }]
    mostra('/backoffice/richieste')
    expect(await screen.findByText('Stampante: Epson TM-m30III · RT: Olivetti X')).toBeInTheDocument()
    const codice = (await import('node:fs')).readFileSync('src/pages/Backoffice.jsx', 'utf8')
    expect(codice).toContain('stampantiDette(c.stampanti)')
    expect((codice.match(/stampantiDette\(c\.stampanti\)/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

// REQ-FLOTTA-082 (Daniele, 12/11/2026: «l'icona di loading
// dell'aggiornamento dell'istanza è ovale»). happy-dom non disegna: la
// regola si tiene nel foglio di stile.
describe('il segno che gira dell’aggiornamento', () => {
  it('non si restringe accanto a un testo lungo: resta tondo', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync('src/index.css', 'utf8').replace(/
/g, '
')
    expect(css).toMatch(/\.spinner \{[^}]*flex: none;[^}]*width: 12px; height: 12px;[^}]*border-radius: 50%;/)
  })
})
