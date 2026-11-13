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
    // Una risposta che è un Error è un rifiuto della Function.
    if (fb.risposte[nome] instanceof Error) throw fb.risposte[nome]
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
  // La lettura dal solo server (REQ-FLOTTA-064): fallisce se non risponde.
  getDocsFromServer: async (c) => {
    fb.dalServer.push(c)
    if (fb.serverGiu) throw Object.assign(new Error('Failed to get documents from server.'), { code: 'unavailable' })
    return { docs: (fb.documenti[c] || []).map(([id, d]) => ({ id, data: () => d })) }
  },
  getDoc: async (p) => ({ exists: () => fb.documenti[p] !== undefined, data: () => fb.documenti[p] }),
  onSnapshot: (percorso, cb, errore) => {
    if (fb.documenti[percorso] === 'errore') {
      errore?.(new Error('permesso negato'))
      return () => {}
    }
    const d = fb.documenti[percorso]
    // Un elenco [[id, dati]...] è una collezione osservata (snapshot con
    // docs); un oggetto è un documento.
    if (Array.isArray(d)) cb({ docs: d.map(([id, dd]) => ({ id, data: () => dd })) })
    else cb({ exists: () => d !== undefined, data: () => d })
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
  signInWithPopup: async (_a, fornitore) => fb.chiamate.push({ nome: 'google', dati: fornitore.parametri }),
  GoogleAuthProvider: class {
    setCustomParameters(p) {
      this.parametri = p
    }
  },
}))

const db = await import('../src/lib/db.js')

// Il traffico (REQ-FLOTTA-042) va alla Function `traccia` con fetch: qui si
// registra, e non parte mai verso la rete.
const tracciati = []
vi.stubGlobal(
  'fetch',
  vi.fn(async (url, opzioni) => {
    tracciati.push({ url, corpo: JSON.parse(opzioni.body), keepalive: opzioni.keepalive })
    return { ok: true }
  })
)

beforeEach(() => {
  fb.configurata = true
  fb.chiamate = []
  fb.risposte = {}
  fb.documenti = {}
  fb.dalServer = []
  fb.serverGiu = false
  fb.scritti = []
  tracciati.length = 0
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
  ['autorizzaProfiloCompleto', ['bar'], 'autorizzaProfiloCompleto', { slug: 'bar' }],
  ['verificaCodiceSconto', [{ piano: 'base' }, 'PROVA20'], 'verificaCodiceSconto', { piano: 'base', codice: 'PROVA20' }],
  ['attivaConCodice', [{ piano: 'completo' }, 'TANA-100'], 'attivaConCodice', { piano: 'completo', codice: 'TANA-100' }],
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
  // Con l'importo incassato (REQ-FLOTTA-041); vuoto, come senza.
  ['registraPagamento', ['bar', '2026-11-30', '32.7'], 'registraPagamento', { slug: 'bar', pagato_fino_al: '2026-11-30', importo: '32.7' }],
  ['registraPagamento', ['bar', '2026-11-30', ''], 'registraPagamento', { slug: 'bar', pagato_fino_al: '2026-11-30' }],
  ['programmaScadenze', [], 'programmaScadenze', {}],
  // L'admin elimina un cliente senza istanza (REQ-FLOTTA-059).
  ['eliminaCliente', ['collaudo-x'], 'eliminaCliente', { slug: 'collaudo-x' }],
  // I codici sconto (REQ-FLOTTA-028); un codice vuoto toglie lo sconto.
  ['gestisciSconti', ['crea', { codice: 'X1Y' }], 'gestisciSconti', { codice: 'X1Y', azione: 'crea' }],
  ['applicaSconto', ['bar', 'TANA-100'], 'applicaSconto', { slug: 'bar', codice: 'TANA-100' }],
  ['applicaSconto', ['bar', ''], 'applicaSconto', { slug: 'bar', codice: null }],
  // Il catalogo dei temi (REQ-FLOTTA-032).
  ['gestisciTemi', ['pubblica', { id: 'aurora' }], 'gestisciTemi', { id: 'aurora', azione: 'pubblica' }],
  ['gestisciStili', ['ritira', 'osteria'], 'gestisciStili', { azione: 'ritira', id: 'osteria' }],
  // I temi dei locali (REQ-FLOTTA-039).
  ['impostaTemi', ['tana-drink', ['notte']], 'impostaTemi', { slug: 'tana-drink', temi: ['notte'] }],
  ['temiDelLocale', ['tana-drink'], 'temiDelLocale', { slug: 'tana-drink' }],
  // I temi su misura (REQ-FLOTTA-040).
  ['creaTemaDaMockup', [{ file: 'AAAA', media_type: 'image/png', struttura: 'unica', note: '' }], 'temaDaMockup', { file: 'AAAA', media_type: 'image/png', struttura: 'unica', note: '' }],
  ['gestisciTemiSuMisura', ['ritira', { id: 'su-misura-1' }], 'gestisciTemiSuMisura', { id: 'su-misura-1', azione: 'ritira' }],
  ['chiediTemaSuMisura', [{ descrizione: 'Verde bosco', struttura: 'per-categoria' }], 'chiediTemaSuMisura', { descrizione: 'Verde bosco', struttura: 'per-categoria' }],
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

  // REQ-FLOTTA-042: i passi della vendita si contano, senza aspettare.
  it('registrazione, Free, checkout, contatto, codice e attivazione si segnalano alla Function traccia', async () => {
    fb.risposte.creaCheckout = { url: 'https://checkout.stripe.com/x' }
    fb.risposte.registraCliente = { ok: true, cliente: { uid: 'nuovo' } }
    await db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: {} })
    await db.scegliFree()
    await db.avviaPagamento({ piano: 'base' })
    await db.chiediContatto({ piano: 'base' })
    await db.attivaConCodice({ piano: 'base' }, 'X-100')
    await db.chiediAttivazione()
    expect(tracciati.map((t) => t.corpo)).toEqual([{ evento: 'registrazione' }, { evento: 'free' }, { evento: 'checkout' }, { evento: 'contatto' }, { evento: 'codice' }, { evento: 'attivazione' }])
    expect(tracciati[0]).toMatchObject({ url: 'https://europe-west1-drink-regia-test.cloudfunctions.net/traccia', keepalive: true })
    // Un checkout senza url non è un checkout.
    fb.risposte.creaCheckout = {}
    await expect(db.avviaPagamento({})).rejects.toThrow()
    expect(tracciati).toHaveLength(6)
  })

  it('una pagina si conta con la lingua e la provenienza; senza Firebase non si conta niente, e un errore di rete non ferma nessuno', async () => {
    db.tracciaPagina('/en', 'en')
    expect(tracciati).toEqual([{ url: expect.stringContaining('/traccia'), corpo: { pagina: '/en', lingua: 'en', riferimento: '' }, keepalive: true }])
    fb.configurata = false
    db.tracciaPagina('/', 'it')
    db.tracciaEvento('registrazione')
    expect(tracciati).toHaveLength(1)
    fb.configurata = true
    fetch.mockRejectedValueOnce(new Error('rete'))
    expect(() => db.tracciaEvento('free')).not.toThrow()
    fetch.mockImplementationOnce(() => {
      throw new Error('subito')
    })
    expect(() => db.tracciaEvento('free')).not.toThrow()
  })

  // REQ-FLOTTA-041: il libro dei movimenti, il traffico e i Fondatori, per la dashboard.
  it('movimenti, traffico e Fondatori si leggono dalle loro collezioni', async () => {
    fb.documenti['movimenti'] = [['m1', { il: '2026-11-01', importo: 10 }]]
    fb.documenti['traffico'] = [['2026-11-01', { giorno: '2026-11-01', viste: 3 }]]
    fb.documenti['fondatori/posti'] = { assegnati: { a: {} } }
    expect(await db.elencoMovimenti()).toEqual([{ id: 'm1', il: '2026-11-01', importo: 10 }])
    expect(await db.elencoTraffico()).toEqual([{ giorno: '2026-11-01', viste: 3 }])
    expect(await db.statoFondatori()).toEqual({ assegnati: { a: {} } })
    delete fb.documenti['fondatori/posti']
    expect(await db.statoFondatori()).toBeNull()
    fb.configurata = false
    for (const f of ['elencoMovimenti', 'elencoTraffico', 'statoFondatori']) await expect(db[f]()).rejects.toThrow(/VITE_FIREBASE/)
  })

  // REQ-FLOTTA-023: gestire l'abbonamento da soli, col portale di Stripe.
  it('il portale dell’abbonamento torna col suo url, e senza url dice di scriverci', async () => {
    fb.risposte.portaleAbbonamento = { url: 'https://billing.stripe.com/p/x' }
    expect(await db.apriPortaleAbbonamento()).toEqual({ url: 'https://billing.stripe.com/p/x' })
    expect(fb.chiamate[0]).toEqual({ nome: 'portaleAbbonamento', dati: {} })
    fb.risposte.portaleAbbonamento = {}
    await expect(db.apriPortaleAbbonamento()).rejects.toThrow(/scrivici/)
  })

  // REQ-FLOTTA-090: il pagamento del rinnovo di un locale sospeso. Il
  // browser non manda niente: la fattura la cerca il server per il cliente
  // che chiama.
  it('il pagamento del rinnovo chiama pagamentoRinnovo senza dati e torna col suo url; senza url dice di scriverci', async () => {
    fb.risposte.pagamentoRinnovo = { url: 'https://invoice.stripe.com/i/x', via: 'fattura' }
    expect(await db.apriPagamentoRinnovo()).toEqual({ url: 'https://invoice.stripe.com/i/x', via: 'fattura' })
    expect(fb.chiamate[0]).toEqual({ nome: 'pagamentoRinnovo', dati: {} })
    fb.risposte.pagamentoRinnovo = {}
    await expect(db.apriPagamentoRinnovo()).rejects.toThrow(/scrivici/)
    fb.configurata = false
    await expect(db.apriPagamentoRinnovo()).rejects.toThrow(/VITE_FIREBASE/)
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

  // REQ-FLOTTA-045 (audit del 09/11/2026, finding 4): il documento del
  // cliente lo scrive la Function registraCliente, mai il browser.
  it('registrazione: account, la Function registraCliente coi dati del modulo, email di verifica; niente scritture dirette', async () => {
    fb.risposte.registraCliente = { ok: true, slug: 'bar-mario', cliente: { uid: 'nuovo', slug: 'bar-mario' } }
    const dati = { locale: { nome: 'Bar Mario' }, fatturazione: { partita_iva: '01234567897' }, referente: { termini: true, privacy: true } }
    const cliente = await db.registra({ email: 'bar@example.com', password: 'x', ...dati })
    expect(cliente).toEqual({ uid: 'nuovo', slug: 'bar-mario' })
    expect(fb.chiamate).toEqual([
      { nome: 'registraCliente', dati },
      { nome: 'verifica', dati: 'nuovo' },
    ])
    expect(fb.scritti).toEqual([])
  })

  // Trovato dal primo collaudo automatico (09/11/2026, REQ-DEV-009): fra
  // l'account creato e il cliente scritto App.jsx mandava alla dashboard,
  // e il rifiuto dello slug spariva con la pagina. Finché registra lavora,
  // la registrazione «è in corso»; finita bene, non lo è più.
  // 11/11/2026 (tag v0.3.0-beta.6): se la Function rifiuta lo slug
  // l'account c'è e la registrazione resta in corso, finché il secondo
  // tentativo non scrive il cliente. Prima tornava falso al rifiuto, e la
  // pagina rimbalzava alla dashboard mentre si correggeva l'identificativo.
  it('registrazioneInCorso è vero mentre registra lavora e dopo un rifiuto dello slug; torna falso quando il cliente è scritto', async () => {
    expect(db.registrazioneInCorso()).toBe(false)
    const p = db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' } })
    expect(db.registrazioneInCorso()).toBe(true)
    await p
    expect(db.registrazioneInCorso()).toBe(false)
    const risposta = fb.risposte.registraCliente
    fb.risposte.registraCliente = Object.assign(new Error('in uso'), { code: 'functions/already-exists', details: { campo: 'slug' } })
    // L'account creato è entrato (come fa Firebase), e il cliente è rifiutato.
    const admin = fb.auth
    fb.auth = { currentUser: { uid: 'c1', email: 'bar@example.com', emailVerified: false } }
    await expect(db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' } })).rejects.toThrow()
    expect(db.registrazioneInCorso()).toBe(true)
    // Il segnale è di quell'account: un altro che entra va alla dashboard.
    fb.auth = admin
    expect(db.registrazioneInCorso()).toBe(false)
    fb.auth = { currentUser: { uid: 'c1', email: 'bar@example.com', emailVerified: false } }
    fb.risposte.registraCliente = risposta
    await db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' }, slug: 'bar-mario-2' })
    expect(db.registrazioneInCorso()).toBe(false)
    fb.auth = admin
  })

  it('lo slug scelto a mano arriva alla Function solo se c’è, e un rifiuto per slug in uso si riconosce', async () => {
    fb.risposte.registraCliente = { ok: true, cliente: { uid: 'nuovo' } }
    await db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: {}, slug: 'bar-mario-nola' })
    expect(fb.chiamate[0].dati).toMatchObject({ slug: 'bar-mario-nola' })
    expect(db.slugGiaInUso({ code: 'functions/already-exists', details: { campo: 'slug', slug: 'bar-mario' } })).toBe(true)
    expect(db.slugGiaInUso({ code: 'functions/already-exists', details: { campo: 'account' } })).toBe(false)
    expect(db.slugGiaInUso({ code: 'functions/invalid-argument', details: { campo: 'slug' } })).toBe(false)
    expect(db.slugGiaInUso(new Error('rete'))).toBe(false)
  })

  // Dopo un rifiuto l'account c'è: al secondo tentativo non si ricrea.
  it('con l’account già entrato con la stessa email si scrive solo il cliente, senza ricreare l’account', async () => {
    fb.auth = { currentUser: { uid: 'c1', email: 'Bar@Example.com', emailVerified: false } }
    fb.risposte.registraCliente = { ok: true, cliente: { uid: 'c1' } }
    const cliente = await db.registra({ email: 'bar@example.com', password: 'x', locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: {} })
    expect(cliente).toEqual({ uid: 'c1' })
    expect(fb.chiamate.map((c) => c.nome)).toEqual(['registraCliente', 'verifica'])
    expect(fb.chiamate[1].dati).toBe('c1')
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

  // REQ-FLOTTA-038
  it('con Google si apre la finestra, e si sceglie ogni volta l’account', async () => {
    await db.entraConGoogle()
    expect(fb.chiamate).toEqual([{ nome: 'google', dati: { prompt: 'select_account' } }])
  })

  it('chi è entrato con Google completa il cliente dalla Function, con l’email del suo account, senza verifica se è già verificata', async () => {
    fb.auth = { currentUser: { uid: 'g1', email: 'Mario@Gmail.com', emailVerified: true } }
    fb.risposte.registraCliente = { ok: true, cliente: { uid: 'g1', email: 'mario@gmail.com', slug: 'bar-mario' } }
    const dati = { locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: { termini: true, privacy: true } }
    const cliente = await db.completaRegistrazione(dati)
    expect(cliente).toMatchObject({ uid: 'g1', email: 'mario@gmail.com', slug: 'bar-mario' })
    expect(fb.scritti).toEqual([])
    expect(fb.chiamate).toEqual([{ nome: 'registraCliente', dati }])
    fb.auth.currentUser.emailVerified = false
    await db.completaRegistrazione({ locale: { nome: 'Bar Mario' }, fatturazione: {}, referente: {} })
    expect(fb.chiamate.at(-1)).toEqual({ nome: 'verifica', dati: 'g1' })
  })

  it('senza accesso non si completa niente, e senza Firebase dice cosa manca', async () => {
    fb.auth = { currentUser: null }
    await expect(db.completaRegistrazione({ locale: { nome: 'Bar Mario' } })).rejects.toThrow(/Serve l’accesso/)
    expect(fb.scritti).toEqual([])
    expect(fb.chiamate).toEqual([])
    fb.configurata = false
    await expect(db.entraConGoogle()).rejects.toThrow(/VITE_FIREBASE/)
    await expect(db.registra({ email: 'a@b.it', password: 'x' })).rejects.toThrow(/VITE_FIREBASE/)
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
    fb.documenti['ai/bar/ricariche'] = [['r1', { il: 'y', origine: 'omaggio' }]]
    expect(await db.ultimeRicaricheAI('bar')).toEqual([{ il: 'y', origine: 'omaggio' }])
    fb.documenti.ai = [['bar', { credito: 1 }]]
    expect(await db.elencoCassettiAI()).toEqual({ bar: { credito: 1 } })
  })

  // I temi su misura del titolare (REQ-FLOTTA-035): la sottocollezione del
  // suo cliente, osservata e letta; senza uid o senza Firebase, un elenco
  // vuoto; un permesso negato non rompe la pagina.
  it('i temi su misura si osservano e si leggono da clienti/{uid}/temi_su_misura', async () => {
    fb.documenti['clienti/u1/temi_su_misura'] = [['t1', { id: 't1', stato: 'bozza' }]]
    const visti = []
    db.osservaTemiSuMisura('u1', (t) => visti.push(t))
    db.osservaTemiSuMisura('', (t) => visti.push(t))
    expect(visti).toEqual([[{ id: 't1', stato: 'bozza' }], []])
    fb.documenti['clienti/u2/temi_su_misura'] = 'errore'
    db.osservaTemiSuMisura('u2', (t) => visti.push(t))
    expect(visti[2]).toEqual([])
    expect(await db.elencoTemiSuMisura('u1')).toEqual([{ id: 't1', stato: 'bozza' }])
    fb.configurata = false
    db.osservaTemiSuMisura('u1', (t) => visti.push(t))
    expect(visti[3]).toEqual([])
    await expect(db.elencoTemiSuMisura('u1')).rejects.toThrow()
  })

  // REQ-FLOTTA-064: il collaudo del 11/11/2026 ha trovato il backoffice
  // con «Nessun cliente.» durante un inciampo di rete. `getDocs`, senza
  // rete, risponde con la memoria del browser, cioè niente: per un admin
  // i clienti sembrano spariti. I tre elenchi si chiedono al server.
  it('clienti, istanze e richieste si leggono dal server, mai dalla memoria del browser', async () => {
    fb.documenti.clienti = [['u1', { uid: 'u1' }]]
    fb.documenti.istanze = [['bar', { stato: 'attiva' }]]
    fb.documenti.richieste = [['bar', { stato: 'in coda' }]]
    expect(await db.elencoClienti()).toEqual([{ uid: 'u1' }])
    expect(await db.elencoIstanze()).toEqual({ bar: { stato: 'attiva' } })
    expect(await db.elencoRichieste()).toEqual({ bar: { stato: 'in coda' } })
    expect(fb.dalServer).toEqual(['clienti', 'istanze', 'richieste'])
  })

  // REQ-FLOTTA-067: gli altri elenchi del backoffice, stesso difetto.
  it('rilasci, movimenti, traffico, temi, stili e cassetti AI si leggono dal server', async () => {
    await db.elencoRilasci()
    await db.elencoMovimenti()
    await db.elencoTraffico()
    await db.elencoTemi()
    await db.elencoStili()
    await db.elencoCassettiAI()
    expect(fb.dalServer).toEqual(['rilasci', 'movimenti', 'traffico', 'temi', 'stili', 'ai'])
    fb.serverGiu = true
    for (const elenco of [db.elencoRilasci, db.elencoMovimenti, db.elencoTraffico, db.elencoTemi, db.elencoStili, db.elencoCassettiAI]) {
      await expect(elenco()).rejects.toThrow('Non riesco a leggere dal server: controlla la connessione e riprova.')
    }
  })

  it('se il server non risponde la lettura fallisce, e lo dice in italiano', async () => {
    fb.serverGiu = true
    for (const elenco of [db.elencoClienti, db.elencoIstanze, db.elencoRichieste]) {
      await expect(elenco()).rejects.toThrow('Non riesco a leggere dal server: controlla la connessione e riprova.')
    }
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

  it('il catalogo dei temi e i codici sconto per il backoffice', async () => {
    fb.documenti.temi = [['aurora', { id: 'aurora', stato: 'bozza' }]]
    fb.documenti.sconti = [['TANA-100', { codice: 'TANA-100' }]]
    expect(await db.elencoTemi()).toEqual([{ id: 'aurora', stato: 'bozza' }])
    fb.documenti.stili = [['osteria', { id: 'osteria', stato: 'ritirato' }]]
    expect(await db.elencoStili()).toEqual([{ id: 'osteria', stato: 'ritirato' }])
    expect(await db.elencoSconti()).toEqual([{ codice: 'TANA-100' }])
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
    // Una richiesta dall'app (REQ-FLOTTA-037) sta in `<uid>_<modulo>`: per
    // il backoffice `uid` è l'id del documento, quello da segnare.
    fb.documenti.contatti = [
      ['u1', { stato: 'aperta' }],
      ['u1_magazzino', { uid: 'u1', stato: 'aperta' }],
    ]
    expect(await db.elencoContatti()).toEqual([
      { uid: 'u1', stato: 'aperta' },
      { uid: 'u1_magazzino', stato: 'aperta' },
    ])
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
