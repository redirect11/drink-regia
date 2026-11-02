// @vitest-environment happy-dom
'use strict'

// LE CHIAMATE DELLA REGIA A FIREBASE (src/lib/db.js), con Firebase finto.
// Le pagine si provano con un db.js finto; qui si prova che ogni chiamata
// arrivi alla Function giusta, con i dati giusti, e al documento giusto, e
// che senza Firebase dica cosa manca invece di rompersi. Nato coi pagamenti
// online spenti (REQ-FLOTTA-017), quando le chiamate nuove di db.js
// sarebbero rimaste senza un test.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const fb = vi.hoisted(() => ({
  configurata: true,
  chiamate: [],
  risposte: {},
  documenti: {},
  scritti: [],
  auth: {},
}))

vi.mock('../src/lib/firebase.js', () => ({
  get configurata() {
    return fb.configurata
  },
  app: { options: { projectId: 'drink-regia-test' } },
  db: {},
  get auth() {
    return fb.auth
  },
}))
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: (_f, nome) => async (dati) => {
    fb.chiamate.push({ nome, dati })
    return { data: fb.risposte[nome] ?? { ok: true } }
  },
}))
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...percorso) => percorso.join('/'),
  collection: (_db, ...percorso) => percorso.join('/'),
  query: (c) => c,
  orderBy: () => null,
  limit: () => null,
  getDocs: async (c) => ({ docs: (fb.documenti[c] || []).map(([id, d]) => ({ id, data: () => d })) }),
  getDoc: async (p) => ({ exists: () => fb.documenti[p] !== undefined, data: () => fb.documenti[p] }),
  onSnapshot: (percorso, cb, errore) => {
    if (fb.documenti[percorso] === 'errore') {
      errore?.(new Error('permesso negato'))
      return () => {}
    }
    const d = fb.documenti[percorso]
    cb({ exists: () => d !== undefined, data: () => d })
    return () => {}
  },
  updateDoc: async (percorso, dati) => fb.scritti.push({ come: 'update', percorso, dati }),
  setDoc: async (percorso, dati, opz) => fb.scritti.push({ come: 'set', percorso, dati, opz }),
  addDoc: async (percorso, dati) => fb.scritti.push({ come: 'add', percorso, dati }),
}))
vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: async (_a, email) => ({ user: { uid: 'nuovo', email } }),
  signInWithEmailAndPassword: async (_a, email) => fb.chiamate.push({ nome: 'accesso', dati: email }),
  signOut: async () => fb.chiamate.push({ nome: 'esci' }),
  onAuthStateChanged: (_a, cb) => (cb('utente'), () => {}),
  onIdTokenChanged: (_a, cb) => {
    cb(null)
    cb({ uid: 'u1', email: 'a@b.it', emailVerified: true, getIdTokenResult: async () => ({ claims: { admin: true } }) })
    return () => {}
  },
  sendEmailVerification: async (u) => fb.chiamate.push({ nome: 'verifica', dati: u.uid }),
  sendPasswordResetEmail: async (_a, email) => fb.chiamate.push({ nome: 'recupero', dati: email }),
  signInWithCustomToken: async (_a, token) => fb.chiamate.push({ nome: 'accessoCustom', dati: token }),
}))

const db = await import('../src/lib/db.js')

beforeEach(() => {
  fb.configurata = true
  fb.chiamate = []
  fb.risposte = {}
  fb.documenti = {}
  fb.scritti = []
  fb.auth = { currentUser: { uid: 'u1', email: 'admin@example.com', emailVerified: true, reload: async () => {}, getIdToken: async () => 't' } }
})

// Le chiamate alle Functions: [funzione di db.js, argomenti, Function, dati attesi].
const FUNCTIONS = [
  ['chiediAttivazione', [], 'chiediAttivazione', {}],
  ['creaClienteDaAdmin', [{ email: 'x@y.it' }], 'creaCliente', { email: 'x@y.it' }],
  ['impostaStatoIstanza', ['bar', 'sospesa', 'motivo'], 'impostaStatoIstanza', { slug: 'bar', stato: 'sospesa', motivo: 'motivo' }],
  ['cambiaScelta', [{ piano: 'base' }], 'cambiaScelta', { piano: 'base' }],
  ['aggiornaIstanza', ['bar'], 'aggiornaIstanza', { slug: 'bar' }],
  ['aggiornaIstanza', ['bar', 'v1.2.3'], 'aggiornaIstanza', { slug: 'bar', ref: 'v1.2.3' }],
  ['gestisciRilascio', ['avanza', { id: 'r1' }], 'gestisciRilascio', { azione: 'avanza', id: 'r1' }],
  ['gestisciCassettoAI', ['bar', 'ricarica', { importo: 5 }], 'gestisciCassettoAI', { slug: 'bar', azione: 'ricarica', importo: 5 }],
  ['registraLocaleEsistente', [{ slug: 'tana' }], 'registraLocaleEsistente', { slug: 'tana' }],
  ['impostaAggiornamentiEsistente', [{ slug: 'tana-drink', aggiornamenti_dalla_regia: true }], 'impostaAggiornamentiEsistente', { slug: 'tana-drink', aggiornamenti_dalla_regia: true }],
  ['gestisciEliminazione', ['chiedi', { slug: 'bar' }], 'gestisciEliminazione', { azione: 'chiedi', slug: 'bar' }],
  ['scaricaArchivio', [], 'scaricaArchivio', {}],
  ['scegliFree', [], 'scegliFree', {}],
  ['provaModulo', ['magazzino'], 'provaModulo', { modulo: 'magazzino' }],
  ['cambiaPianoAdmin', [{ slug: 'bar', modo: 'fuori' }], 'cambiaPianoAdmin', { slug: 'bar', modo: 'fuori' }],
  ['chiediContatto', [{ piano: 'base', telefono: '333' }], 'chiediContatto', { piano: 'base', telefono: '333' }],
  // Gli aggiornamenti a scelta (REQ-FLOTTA-020): le regole partono solo
  // coi due interruttori, e un valore che non è vero vale spento.
  ['impostaRegoleAggiornamenti', [{ a_scelta: true, solo_finche_paga: 'sì', altro: 1 }], 'impostaRegoleAggiornamenti', { a_scelta: true, solo_finche_paga: false }],
  ['sceltaAggiornamento', ['v1.11.0', 'salta'], 'sceltaAggiornamento', { tag: 'v1.11.0', scelta: 'salta' }],
  // Le licenze protette (BUG-125 di tana-drink).
  ['gestisciLicenze', ['allinea'], 'gestisciLicenze', { azione: 'allinea' }],
  // Le scadenze a eventi (REQ-FLOTTA-023).
  ['registraPagamento', ['bar', '2026-11-30'], 'registraPagamento', { slug: 'bar', pagato_fino_al: '2026-11-30' }],
  ['programmaScadenze', [], 'programmaScadenze', {}],
  // I codici sconto (REQ-FLOTTA-028); un codice vuoto toglie lo sconto.
  ['gestisciSconti', ['crea', { codice: 'X1Y' }], 'gestisciSconti', { codice: 'X1Y', azione: 'crea' }],
  ['applicaSconto', ['bar', 'TANA-100'], 'applicaSconto', { slug: 'bar', codice: 'TANA-100' }],
  ['applicaSconto', ['bar', ''], 'applicaSconto', { slug: 'bar', codice: null }],
]

describe('le chiamate alle Functions', () => {
  it.each(FUNCTIONS)('%s chiama %s coi dati giusti', async (nome, argomenti, fn, dati) => {
    await db[nome](...argomenti)
    expect(fb.chiamate).toEqual([{ nome: fn, dati }])
  })

  it.each(FUNCTIONS)('%s senza Firebase dice cosa manca', async (nome, argomenti) => {
    fb.configurata = false
    await expect(db[nome](...argomenti)).rejects.toThrow(/VITE_FIREBASE/)
  })

  it('Checkout e ricarica AI tornano col loro url, e senza url dicono di scriverci', async () => {
    fb.risposte.creaCheckout = { url: 'https://checkout.stripe.com/x' }
    expect(await db.avviaPagamento({ piano: 'base' })).toEqual({ url: 'https://checkout.stripe.com/x' })
    expect(fb.chiamate[0]).toEqual({ nome: 'creaCheckout', dati: { piano: 'base', ritorno: window.location.origin } })
    fb.risposte.creaRicaricaAI = { url: 'https://checkout.stripe.com/y' }
    expect(await db.avviaRicaricaAI('ai-10')).toEqual({ url: 'https://checkout.stripe.com/y' })
    fb.risposte.creaCheckout = {}
    fb.risposte.creaRicaricaAI = {}
    await expect(db.avviaPagamento({})).rejects.toThrow(/scrivici/)
    await expect(db.avviaRicaricaAI('ai-10')).rejects.toThrow(/scrivici/)
  })

  // REQ-FLOTTA-023: gestire l'abbonamento da soli, col portale di Stripe.
  it('il portale dell’abbonamento torna col suo url, e senza url dice di scriverci', async () => {
    fb.risposte.portaleAbbonamento = { url: 'https://billing.stripe.com/p/x' }
    expect(await db.apriPortaleAbbonamento()).toEqual({ url: 'https://billing.stripe.com/p/x' })
    expect(fb.chiamate[0]).toEqual({ nome: 'portaleAbbonamento', dati: {} })
    fb.risposte.portaleAbbonamento = {}
    await expect(db.apriPortaleAbbonamento()).rejects.toThrow(/scrivici/)
  })
})

describe('l’accesso', () => {
  it('osservaUtente dà null senza utente, e uid, email e admin col token', async () => {
    const visti = []
    db.osservaUtente((u) => visti.push(u))
    await vi.waitFor(() => expect(visti).toHaveLength(2))
    expect(visti).toEqual([null, { uid: 'u1', email: 'a@b.it', emailVerificata: true, admin: true }])
  })

  it('senza Firebase nessun utente, e si esce senza errori', async () => {
    fb.configurata = false
    const visti = []
    db.osservaUtente((u) => visti.push(u))
    db.osservaAccesso((u) => visti.push(u))
    await db.esci()
    expect(visti).toEqual([null, null])
  })

  it('registrazione: account, documento del cliente, email di verifica', async () => {
    const cliente = await db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: {} })
    expect(cliente.uid).toBe('nuovo')
    expect(fb.scritti[0]).toMatchObject({ come: 'set', percorso: 'clienti/nuovo' })
    expect(fb.chiamate).toContainEqual({ nome: 'verifica', dati: 'nuovo' })
  })

  it('accesso, uscita, recupero della password, verifica e rilettura', async () => {
    db.osservaAccesso((u) => fb.chiamate.push({ nome: 'stato', dati: u }))
    await db.accedi({ email: 'a@b.it', password: 'x' })
    await db.recuperaPassword('  a@b.it ')
    await db.inviaVerificaEmail()
    expect(await db.rileggiUtente()).toBe(true)
    await db.esci()
    expect(fb.chiamate.map((c) => c.nome)).toEqual(['stato', 'accesso', 'recupero', 'verifica', 'esci'])
    expect(fb.chiamate[2].dati).toBe('a@b.it')
    fb.auth = { currentUser: null }
    expect(await db.rileggiUtente()).toBe(false)
  })
})

describe('i documenti della regia', () => {
  it('cliente, istanza, richiesta e impostazioni si osservano dal loro documento', () => {
    fb.documenti['clienti/u1'] = { slug: 'bar' }
    fb.documenti['istanze/bar'] = { stato: 'attiva' }
    const visti = []
    db.osservaCliente('u1', (d) => visti.push(d))
    db.osservaIstanza('bar', (d) => visti.push(d))
    db.osservaRichiesta('bar', (d) => visti.push(d))
    db.osservaImpostazioniRegia((d) => visti.push(d))
    expect(visti).toEqual([{ slug: 'bar' }, { stato: 'attiva' }, null, {}])
  })

  it('le regole degli aggiornamenti si osservano da impostazioni/aggiornamenti; senza documento, spente', () => {
    const visti = []
    db.osservaRegoleAggiornamenti((d) => visti.push(d))
    fb.documenti['impostazioni/aggiornamenti'] = { a_scelta: true }
    db.osservaRegoleAggiornamenti((d) => visti.push(d))
    expect(visti).toEqual([{}, { a_scelta: true }])
  })

  it('il controllo delle licenze si osserva da controlli/licenze; senza documento, null', () => {
    const visti = []
    db.osservaControlloLicenze((d) => visti.push(d))
    fb.documenti['controlli/licenze'] = { totale: 2, pronte: 2, problemi: [] }
    db.osservaControlloLicenze((d) => visti.push(d))
    expect(visti).toEqual([null, { totale: 2, pronte: 2, problemi: [] }])
  })

  it('il cassetto AI: assente o negato è «nessun cassetto»; i consumi in ordine', async () => {
    fb.documenti['ai/bar'] = 'errore'
    const visti = []
    db.osservaCassettoAI('bar', (d) => visti.push(d))
    db.osservaCassettoAI('altro', (d) => visti.push(d))
    expect(visti).toEqual([null, null])
    fb.documenti['ai/bar/consumi'] = [['c1', { il: 'x' }]]
    expect(await db.ultimiConsumiAI('bar')).toEqual([{ il: 'x' }])
    fb.documenti.ai = [['bar', { credito: 1 }]]
    expect(await db.elencoCassettiAI()).toEqual({ bar: { credito: 1 } })
  })

  it('gli elenchi del backoffice: clienti, istanze, richieste, rilasci dal più recente', async () => {
    fb.documenti.clienti = [['u1', { uid: 'u1' }]]
    fb.documenti.istanze = [['bar', { stato: 'attiva' }]]
    fb.documenti.richieste = [['bar', { stato: 'in coda' }]]
    fb.documenti.rilasci = [['a', { creato_il: '2026-10-01' }], ['b', { creato_il: '2026-10-20' }]]
    expect(await db.elencoClienti()).toEqual([{ uid: 'u1' }])
    expect(await db.elencoIstanze()).toEqual({ bar: { stato: 'attiva' } })
    expect(await db.elencoRichieste()).toEqual({ bar: { stato: 'in coda' } })
    expect((await db.elencoRilasci()).map((r) => r.creato_il)).toEqual(['2026-10-20', '2026-10-01'])
  })

  it('l’admin: deploy automatico, autorizza, rifiuta, rilancia', async () => {
    await db.impostaDeployAutomatico(1)
    await db.autorizzaRichiesta('bar')
    await db.rifiutaRichiesta('bar')
    fb.documenti['richieste/bar'] = { stato: 'errore' }
    await db.rilanciaAttivazione('bar')
    expect(fb.scritti.map((s) => [s.come, s.percorso, s.dati.stato ?? s.dati.deploy_automatico])).toEqual([
      ['set', 'impostazioni/regia', true],
      ['update', 'richieste/bar', 'in coda'],
      ['update', 'richieste/bar', 'errore'],
      ['update', 'richieste/bar', 'in coda'],
    ])
    expect(fb.scritti[2].dati.errore).toBe('Richiesta rifiutata')
    await expect(db.rilanciaAttivazione('altro')).rejects.toThrow(/non trovata/)
  })
})

describe('la vendita', () => {
  it('osservaVendita dà la vendita pulita: col documento, senza, con un errore e senza Firebase', () => {
    const viste = []
    fb.documenti['vendita/listino'] = { pagamenti_online: true, free: true }
    db.osservaVendita((v) => viste.push(v))
    delete fb.documenti['vendita/listino']
    db.osservaVendita((v) => viste.push(v))
    fb.documenti['vendita/listino'] = 'errore'
    db.osservaVendita((v) => viste.push(v))
    fb.configurata = false
    db.osservaVendita((v) => viste.push(v))
    expect(viste.map((v) => [v.pagamenti_online, v.free])).toEqual([
      [true, true],
      [false, false],
      [false, false],
      [false, false],
    ])
  })

  it('impostaVendita scrive il cambio e lo mette nello storico, con chi l’ha fatto', async () => {
    await db.impostaVendita({ pagamenti_online: true })
    expect(fb.scritti[0]).toMatchObject({ come: 'set', percorso: 'vendita/listino', dati: { pagamenti_online: true, aggiornata_da: 'admin@example.com' } })
    expect(fb.scritti[1]).toMatchObject({ come: 'add', percorso: 'vendita/listino/storico', dati: { cambio: { pagamenti_online: true }, da: 'admin@example.com' } })
  })
})

describe('la richiesta di contatto (REQ-FLOTTA-017)', () => {
  it('osservaContatto legge contatti/{uid}; senza documento, uid, permesso o Firebase dice null', () => {
    fb.documenti['contatti/u1'] = { stato: 'aperta' }
    fb.documenti['contatti/u3'] = 'errore'
    const visti = []
    db.osservaContatto('u1', (c) => visti.push(c))
    db.osservaContatto('u2', (c) => visti.push(c))
    db.osservaContatto('u3', (c) => visti.push(c))
    db.osservaContatto(null, (c) => visti.push(c))
    fb.configurata = false
    db.osservaContatto('u1', (c) => visti.push(c))
    expect(visti).toEqual([{ stato: 'aperta' }, null, null, null, null])
  })

  it('l’admin elenca le richieste e le segna gestite, con chi e quando, o le riapre', async () => {
    fb.documenti.contatti = [['u1', { stato: 'aperta' }]]
    expect(await db.elencoContatti()).toEqual([{ uid: 'u1', stato: 'aperta' }])
    await db.segnaContatto('u1', 'gestita')
    await db.segnaContatto('u1', 'aperta')
    expect(fb.scritti[0]).toMatchObject({ percorso: 'contatti/u1', dati: { stato: 'gestita', gestita_da: 'admin@example.com' } })
    expect(fb.scritti[0].dati.gestita_il).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(fb.scritti[1]).toMatchObject({ percorso: 'contatti/u1', dati: { stato: 'aperta', gestita_il: null, gestita_da: null } })
  })
})

// IL PASSAGGIO FRA LA REGIA E L'APP (REQ-FLOTTA-030).
describe('il passaggio', () => {
  it('«Apri la tua app» chiede l’indirizzo con il codice, e senza indirizzo lo dice', async () => {
    fb.risposte.passaggioVersoApp = { url: 'https://drinkpos-bar.web.app/#accesso-regia=x' }
    expect(await db.apriLaTuaApp()).toEqual({ url: 'https://drinkpos-bar.web.app/#accesso-regia=x' })
    expect(fb.chiamate[0]).toEqual({ nome: 'passaggioVersoApp', dati: {} })
    fb.risposte.passaggioVersoApp = {}
    await expect(db.apriLaTuaApp()).rejects.toThrow(/non si apre/)
  })

  it('il codice dall’app si scambia con un accesso, e si entra', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ token: 'tok-1' }) }))
    vi.stubGlobal('fetch', fetch)
    await db.entraColPassaggio('c0d1c3')
    expect(fetch).toHaveBeenCalledWith('https://europe-west1-drink-regia-test.cloudfunctions.net/scambiaPassaggio', expect.objectContaining({ method: 'POST', body: JSON.stringify({ codice: 'c0d1c3' }) }))
    expect(fb.chiamate).toContainEqual({ nome: 'accessoCustom', dati: 'tok-1' })
    vi.unstubAllGlobals()
  })

  it('un codice scaduto o già usato dice perché, e non entra', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ errore: 'Codice scaduto: riprova dal tasto.' }) })))
    await expect(db.entraColPassaggio('x')).rejects.toThrow('Codice scaduto: riprova dal tasto.')
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => { throw new Error('non json') } })))
    await expect(db.entraColPassaggio('x')).rejects.toThrow(/rientra dall’app/)
    expect(fb.chiamate.some((c) => c.nome === 'accessoCustom')).toBe(false)
    vi.unstubAllGlobals()
  })
})
