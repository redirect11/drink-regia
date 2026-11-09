'use strict'

// L'ATTIVAZIONE DI UN'ISTANZA (REQ-FLOTTA-006): dalla richiesta al lancio
// del workflow, e dall'esito ai documenti. Logica pura delle Functions.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { preparaRichiesta, richiestaCoerente, dispatchPayload, dispatchAggiornamento, daLanciare, esitoValido, documentoIstanza, documentoAggiornamento, vincoliEsito, urlAmmesso, bearerValido, segretoUsabile, PREFISSO_PROGETTI, ESITO_VECCHIO_MS, ESITO_FUTURO_MS, SEGRETO_MIN } = require('../functions/lib/provisioning.js')

const richiesta = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff', 'magazzino'], stato: 'in coda' }
const cliente = { uid: 'u1', slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff'], terminali: 1, abbonamento: { stato: 'attivo' } }
const ADESSO = new Date('2026-10-22T10:00:00Z')

// Audit del 22/10/2026, C2: la richiesta la scrive il server, dal documento
// del cliente, e solo con l'abbonamento attivo.
describe('preparaRichiesta', () => {
  // REQ-FLOTTA-015: la pulizia dei piani è quella di Stripe, e da sola
  // farebbe del Free un Base: un locale gratis coi limiti del Base.
  it('un cliente Free chiede l’attivazione col piano Free, senza moduli', () => {
    const free = { ...cliente, piano: 'free', moduli: ['magazzino'], abbonamento: { stato: 'attivo', origine: 'gratuito' } }
    expect(preparaRichiesta(free, { emailVerificata: true, adesso: ADESSO }).richiesta).toMatchObject({ piano: 'free', moduli: [] })
  })

  // REQ-FLOTTA-014: Google non riusa l'id di un progetto cancellato.
  it('un locale eliminato non si riattiva da qui', () => {
    const esito = preparaRichiesta(cliente, { emailVerificata: true, istanza: { stato: 'eliminata' }, adesso: ADESSO })
    expect(esito).toMatchObject({ ok: false, perche: expect.stringMatching(/eliminato/) })
  })

  it('la richiesta nasce dal cliente, in coda, con piano e moduli puliti', () => {
    const esito = preparaRichiesta(cliente, { emailVerificata: true, adesso: ADESSO })
    expect(esito.ok).toBe(true)
    expect(esito.richiesta).toEqual({
      uid: 'u1',
      slug: 'bar-mario',
      nome_locale: 'Bar Mario',
      piano: 'base',
      moduli: ['staff'],
      stato: 'in coda',
      chiesta_il: '2026-10-22T10:00:00.000Z',
      chiesta_da: 'titolare',
    })
  })

  it('un modulo che non è nel listino, o già incluso nel piano, non passa', () => {
    const completo = { ...cliente, piano: 'completo', moduli: ['staff', 'inventato'] }
    expect(preparaRichiesta(completo, { emailVerificata: true }).richiesta.moduli).toEqual([])
  })

  // REQ-FLOTTA-011: col deploy automatico spento la richiesta aspetta l'admin.
  it('col deploy automatico spento la richiesta nasce «da approvare»', () => {
    expect(preparaRichiesta(cliente, { emailVerificata: true, automatico: false }).richiesta.stato).toBe('da approvare')
  })

  it('senza email verificata, senza piano o senza abbonamento attivo non si attiva', () => {
    expect(preparaRichiesta(cliente, { emailVerificata: false })).toEqual({ ok: false, perche: expect.stringMatching(/email/), richiesta: null })
    expect(preparaRichiesta({ ...cliente, piano: null }, { emailVerificata: true }).perche).toMatch(/piano/)
    expect(preparaRichiesta({ ...cliente, abbonamento: { stato: 'sospeso' } }, { emailVerificata: true }).perche).toMatch(/abbonamento/)
    expect(preparaRichiesta({ ...cliente, abbonamento: null }, { emailVerificata: true }).ok).toBe(false)
    expect(preparaRichiesta(null, { emailVerificata: true }).ok).toBe(false)
    expect(preparaRichiesta({ ...cliente, slug: 'x' }, { emailVerificata: true }).ok).toBe(false)
  })

  it('non si chiede due volte: da approvare, in coda, in corso o attiva fermano; dopo un errore si riprova', () => {
    for (const stato of ['da approvare', 'in coda', 'in corso']) {
      expect(preparaRichiesta(cliente, { emailVerificata: true, richiesta: { stato } }).ok).toBe(false)
    }
    expect(preparaRichiesta(cliente, { emailVerificata: true, istanza: { stato: 'attiva' } }).ok).toBe(false)
    expect(preparaRichiesta(cliente, { emailVerificata: true, istanza: { stato: 'errore' }, richiesta: { stato: 'errore' } }).ok).toBe(true)
  })
})

describe('richiestaCoerente', () => {
  it('parte solo la richiesta del cliente con quello slug e l’abbonamento attivo', () => {
    expect(richiestaCoerente(richiesta, cliente).ok).toBe(true)
    expect(richiestaCoerente(richiesta, { ...cliente, slug: 'bar-luigi' }).perche).toMatch(/slug/)
    expect(richiestaCoerente(richiesta, { ...cliente, uid: 'u2' }).perche).toMatch(/titolare/)
    expect(richiestaCoerente(richiesta, { ...cliente, abbonamento: { stato: 'scaduto' } }).perche).toMatch(/bbonamento/)
    expect(richiestaCoerente(richiesta, null).ok).toBe(false)
    expect(richiestaCoerente({ ...richiesta, slug: 'X' }, cliente).ok).toBe(false)
  })
})

// Dal 29/10/2026 i workflow stanno nella regia: `ref` in cima è il suo ramo
// con i workflow, `inputs.ref` la versione di tana-drink, `ambiente` quale
// regia lancia (l'environment flotta o flotta-test).
describe('dispatchPayload', () => {
  it('è il corpo del workflow_dispatch, con gli input come stringhe', () => {
    expect(dispatchPayload(richiesta, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })).toEqual({
      ref: 'main',
      inputs: { slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: 'staff,magazzino', uid: 'u1', email: '', ref: 'v1.10.0', ambiente: 'test', profilo: 'completo' },
    })
  })

  // REQ-FLOTTA-029: chi ha sottoscritto diventa l'admin del locale.
  it('porta l’email del titolare, che diventa l’admin del locale', () => {
    expect(dispatchPayload({ ...richiesta, email: 'mario@example.it' }).inputs.email).toBe('mario@example.it')
  })

  // REQ-FLOTTA-015: il Free nasce leggero, costo zero.
  it('il Free parte col profilo leggero, gli altri col completo', () => {
    expect(dispatchPayload({ ...richiesta, piano: 'free', moduli: [] }).inputs.profilo).toBe('leggero')
    expect(dispatchPayload({ ...richiesta, piano: 'completo' }).inputs.profilo).toBe('completo')
  })

  it('senza indicazioni: il main della regia, il main dell’app, la produzione', () => {
    const corpo = dispatchPayload(richiesta)
    expect(corpo.ref).toBe('main')
    expect(corpo.inputs).toMatchObject({ ref: 'main', ambiente: 'produzione' })
  })

  it('un ambiente sconosciuto vale produzione', () => {
    expect(dispatchPayload(richiesta, { ambiente: 'staging' }).inputs.ambiente).toBe('produzione')
  })

  it('senza uno slug valido non parte niente', () => {
    expect(() => dispatchPayload({ slug: 'X' })).toThrow(/slug/)
  })
})

describe('dispatchAggiornamento', () => {
  it('lancia aggiorna-istanza.yml con lo slug, la versione dell’app e l’ambiente', () => {
    expect(dispatchAggiornamento({ slug: 'bar-mario', nome_locale: 'Bar Mario' }, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })).toEqual({
      ref: 'main',
      inputs: { slug: 'bar-mario', nome_locale: 'Bar Mario', ref: 'v1.10.0', ambiente: 'test', profilo: 'completo', progetto: '', cliente: '', email: '', uid: '', build: '' },
    })
    expect(dispatchAggiornamento({ slug: 'bar-mario', email: 'mario@example.it' }).inputs.email).toBe('mario@example.it')
    // Lo stesso uid della regia nel locale (M7): anche agli aggiornamenti.
    expect(dispatchAggiornamento({ slug: 'bar-mario', uid: 'u1' }).inputs.uid).toBe('u1')
    expect(() => dispatchAggiornamento({ slug: 'x' })).toThrow(/slug/)
  })

  // REQ-FLOTTA-018: la Tana sul suo progetto, con la sua cartella e le sue
  // chiavi pubbliche, in una stringa sola (gli input di GitHub sono stringhe).
  it('per un locale esistente manda progetto, cartella e chiavi della build', () => {
    const tana = { slug: 'tana-drink', nome_locale: 'La Tana del Coniglio', progetto: 'tana-drink', cliente: 'tana', build: { VITE_RECAPTCHA_SITE_KEY: 'abc' } }
    expect(dispatchAggiornamento(tana, { app: 'v1.10.0' }).inputs).toMatchObject({ progetto: 'tana-drink', cliente: 'tana', build: '{"VITE_RECAPTCHA_SITE_KEY":"abc"}' })
    expect(dispatchAggiornamento({ ...tana, build: {} }).inputs.build).toBe('')
  })

  it('il profilo si dice: leggero per un locale Free, completo quando compra', () => {
    expect(dispatchAggiornamento({ slug: 'bar-mario' }, { profilo: 'leggero' }).inputs.profilo).toBe('leggero')
    expect(dispatchAggiornamento({ slug: 'bar-mario' }, { profilo: 'boh' }).inputs.profilo).toBe('completo')
  })
})

describe('daLanciare', () => {
  it('una richiesta nuova in coda parte; in corso o attiva no', () => {
    expect(daLanciare(null, richiesta)).toBe(true)
    expect(daLanciare(null, { ...richiesta, stato: 'in corso' })).toBe(false)
  })

  // REQ-FLOTTA-011: «da approvare» non parte; l'autorizzazione (→ in coda) sì.
  it('una richiesta da approvare non parte finché l’admin non la autorizza', () => {
    const daApprovare = { ...richiesta, stato: 'da approvare' }
    expect(daLanciare(null, daApprovare)).toBe(false)
    expect(daLanciare(daApprovare, { ...daApprovare, stato: 'in coda', autorizzata_il: 'x' })).toBe(true)
  })

  it('un rilancio dell’admin parte; un altro aggiornamento no', () => {
    const inErrore = { ...richiesta, stato: 'errore' }
    expect(daLanciare(inErrore, { ...richiesta, rilanciata_il: 'x' })).toBe(true)
    const inCoda = { ...richiesta, rilanciata_il: 'x' }
    expect(daLanciare(inCoda, { ...inCoda, nota: 'ritoccata' })).toBe(false)
    expect(daLanciare(inCoda, { ...inCoda, rilanciata_il: 'y' })).toBe(true)
  })
})

describe('esitoValido e documentoIstanza', () => {
  it('accetta solo slug e stati noti, e riempie il documento senza perdere quello che c’era', () => {
    expect(esitoValido({ slug: 'bar-mario', stato: 'boh' })).toBeNull()
    expect(esitoValido(null)).toBeNull()
    const SHA = 'a'.repeat(40)
    const esito = esitoValido({ slug: 'bar-mario', stato: 'attiva', url: 'https://bar-mario.drink.app', versione: 'v1.10.0', ambiente: 'produzione', ref: 'main', commit: SHA })
    const doc = documentoIstanza(esito, { uid: 'u1', progetto: 'drinkpos-bar-mario' }, new Date('2026-10-22T10:00:00Z'))
    expect(doc).toEqual({
      uid: 'u1',
      slug: 'bar-mario',
      stato: 'attiva',
      url: 'https://bar-mario.drink.app',
      progetto: 'drinkpos-bar-mario',
      versione: 'v1.10.0',
      ambiente: 'produzione',
      ref: 'main',
      commit: SHA,
      profilo: null,
      errore: null,
      aggiornata_il: '2026-10-22T10:00:00.000Z',
    })
    // Il profilo con cui il workflow l'ha pubblicata resta sull'istanza.
    expect(documentoIstanza(esitoValido({ slug: 'bar-mario', stato: 'attiva', profilo: 'leggero' }), null).profilo).toBe('leggero')
  })

  // REQ-FLOTTA-048: «main» è un riferimento mobile, lo SHA dice cosa gira.
  it('lo SHA pubblicato si salva solo se è uno SHA intero, e un esito senza SHA non cancella quello di prima', () => {
    const SHA = 'b'.repeat(40)
    expect(esitoValido({ slug: 'bar-mario', stato: 'attiva', commit: SHA }).commit).toBe(SHA)
    expect(esitoValido({ slug: 'bar-mario', stato: 'attiva', commit: 'main' }).commit).toBeNull()
    expect(esitoValido({ slug: 'bar-mario', stato: 'attiva', commit: 'b'.repeat(7) }).commit).toBeNull()
    expect(documentoIstanza(esitoValido({ slug: 'bar-mario', stato: 'attiva' }), { commit: SHA }).commit).toBe(SHA)
    // In un aggiornamento lo SHA nuovo entra solo se è riuscito.
    const prima = { stato: 'attiva', commit: SHA }
    expect(documentoAggiornamento(esitoValido({ slug: 'bar-mario', stato: 'attiva', commit: 'c'.repeat(40) }), prima).commit).toBe('c'.repeat(40))
    expect(documentoAggiornamento(esitoValido({ slug: 'bar-mario', stato: 'errore', commit: 'c'.repeat(40) }), prima).commit).toBe(SHA)
  })

  it('un errore porta il suo messaggio, o uno di riserva', () => {
    expect(esitoValido({ slug: 'bar-mario', stato: 'errore' }).errore).toBe('Attivazione fallita')
    expect(esitoValido({ slug: 'bar-mario', stato: 'errore', errore: 'quota' }).errore).toBe('quota')
  })
})

// ── I VINCOLI SULL'ESITO (audit del 09/11/2026, finding 12; M1 del 22/10) ──
// Il corpo del callback non è fidato: progetto e url devono essere quelli
// dell'istanza, e lo stesso run non passa due volte.
describe('vincoliEsito', () => {
  const ORA = new Date('2026-11-09T10:00:00Z')
  const fresco = { run_id: 4242, inviato_il: '2026-11-09T09:59:30Z' }
  const vincoli = (body, prima = null, operazione = 'attivazione', adesso = ORA) =>
    vincoliEsito(esitoValido({ slug: 'bar-mario', stato: 'attiva', ...fresco, ...body }), prima, { operazione, adesso })

  it('un esito regolare passa e lascia il segno del run', () => {
    const v = vincoli({ progetto: 'drinkpos-bar-mario', url: 'https://drinkpos-bar-mario.web.app' })
    expect(v).toEqual({ ok: true, perche: null, ultimo_esito: { run_id: 4242, operazione: 'attivazione', inviato_il: '2026-11-09T09:59:30.000Z' } })
    // Senza progetto né url (un errore prima del Terraform) va bene lo stesso.
    expect(vincoli({ stato: 'errore' }).ok).toBe(true)
  })

  it('il progetto è drinkpos-<slug>, o quello già scritto sull’istanza', () => {
    expect(vincoli({ progetto: 'drinkpos-altro' }).ok).toBe(false)
    expect(vincoli({ progetto: 'drinkpos-altro' }).perche).toMatch(/progetto/)
    // Un locale della flotta attivo: il progetto scritto è già drinkpos-<slug>.
    expect(vincoli({ progetto: 'drinkpos-bar-mario' }, { progetto: 'drinkpos-bar-mario', stato: 'attiva' }, 'aggiornamento').ok).toBe(true)
    // Un locale esistente (REQ-FLOTTA-018) ha un progetto suo: solo quello.
    const tana = { origine: 'esistente', progetto: 'tana-drink', url: 'https://tana.example' }
    expect(vincoli({ progetto: 'tana-drink' }, tana, 'aggiornamento').ok).toBe(true)
    expect(vincoli({ progetto: 'drinkpos-bar-mario' }, tana, 'aggiornamento').ok).toBe(false)
  })

  it('l’url è https sull’Hosting del progetto o su un dominio registrato: niente javascript: in un href', () => {
    const progetto = 'drinkpos-bar-mario'
    expect(urlAmmesso('https://drinkpos-bar-mario.web.app', progetto, null)).toBe(true)
    expect(urlAmmesso('https://drinkpos-bar-mario.firebaseapp.com/', progetto, null)).toBe(true)
    expect(urlAmmesso('https://bar-mario.it', progetto, { domini: ['bar-mario.it'] })).toBe(true)
    expect(urlAmmesso('https://app.bar-mario.it', progetto, { url: 'https://app.bar-mario.it' })).toBe(true)
    for (const url of ['http://drinkpos-bar-mario.web.app', 'javascript:alert(1)', 'https://drinkpos-altro.web.app', 'https://drinkpos-bar-mario.web.app.evil.it', 'https://x@drinkpos-bar-mario.web.app', 'https://drinkpos-bar-mario.web.app:8443', 'non un url']) {
      expect(urlAmmesso(url, progetto, null), url).toBe(false)
    }
    expect(vincoli({ url: 'javascript:alert(1)' })).toMatchObject({ ok: false, perche: expect.stringMatching(/url/) })
  })

  it('run_id e inviato_il sono obbligatori; un esito vecchio o dal futuro non passa', () => {
    expect(vincoli({ run_id: undefined }).perche).toBe('mancano run_id o inviato_il')
    expect(vincoli({ inviato_il: undefined }).perche).toBe('mancano run_id o inviato_il')
    expect(vincoli({ run_id: 'abc' }).ok).toBe(false)
    expect(vincoli({ run_id: 1.5 }).ok).toBe(false)
    expect(vincoli({ inviato_il: 'ieri' }).ok).toBe(false)
    expect(vincoli({ inviato_il: new Date(ORA.getTime() - ESITO_VECCHIO_MS - 1).toISOString() }).perche).toBe('esito troppo vecchio')
    expect(vincoli({ inviato_il: new Date(ORA.getTime() - ESITO_VECCHIO_MS + 1000).toISOString() }).ok).toBe(true)
    expect(vincoli({ inviato_il: new Date(ORA.getTime() + ESITO_FUTURO_MS + 1).toISOString() }).perche).toBe('esito dal futuro')
    expect(vincoli({ inviato_il: new Date(ORA.getTime() + 30_000).toISOString() }).ok).toBe(true)
    // Il run_id arriva anche come stringa dal JSON di un workflow vecchio: va bene se è un intero.
    expect(vincoli({ run_id: '4242' }).ultimo_esito.run_id).toBe(4242)
  })

  it('lo stesso run per la stessa operazione passa una volta sola', () => {
    const prima = { stato: 'attiva', progetto: 'drinkpos-bar-mario', ultimo_esito: { run_id: 4242, operazione: 'aggiornamento', inviato_il: '2026-11-09T09:59:30.000Z' } }
    expect(vincoli({}, prima, 'aggiornamento').perche).toBe('esito già ricevuto')
    expect(vincoli({ run_id: 4243 }, prima, 'aggiornamento').ok).toBe(true)
    // Le istanze nate prima non hanno ultimo_esito: il primo esito nuovo lo scrive.
    expect(vincoli({}, { stato: 'attiva', progetto: 'drinkpos-bar-mario' }, 'aggiornamento').ok).toBe(true)
  })

  it('un locale esistente che non manda run_id (la Tana, oggi) passa ancora, senza lasciare il segno', () => {
    const tana = { origine: 'esistente', progetto: 'tana-drink', url: 'https://tana.example', ultimo_esito: { run_id: 1, operazione: 'aggiornamento' } }
    expect(vincoli({ run_id: undefined, inviato_il: undefined, versione: 'v1.11.0' }, tana, 'aggiornamento')).toEqual({ ok: true, perche: null, ultimo_esito: null })
    // Se li manda, si controllano come per tutti.
    expect(vincoli({ run_id: 1 }, tana, 'aggiornamento').perche).toBe('esito già ricevuto')
    expect(vincoli({ inviato_il: undefined }, tana, 'aggiornamento').ok).toBe(false)
    // Per un locale della flotta no: i workflow sono nostri e li mandano sempre.
    expect(vincoli({ run_id: undefined, inviato_il: undefined }, { stato: 'attiva', progetto: 'drinkpos-bar-mario' }, 'aggiornamento').ok).toBe(false)
  })

  it('il prefisso dei progetti è lo stesso del sito e del Terraform', () => {
    expect(PREFISSO_PROGETTI).toBe('drinkpos')
    expect(readFileSync('src/lib/prodotto.js', 'utf8')).toContain(`export const PREFISSO_PROGETTI = '${PREFISSO_PROGETTI}'`)
    expect(readFileSync('infra/istanza/main.tf', 'utf8')).toContain(`progetto = "${PREFISSO_PROGETTI}-\${var.slug}"`)
  })
})

describe('bearerValido e segretoUsabile', () => {
  const segreto = 'k'.repeat(SEGRETO_MIN)

  it('vuole esattamente il segreto', () => {
    expect(bearerValido(`Bearer ${segreto}`, segreto)).toBe(true)
    expect(bearerValido(`Bearer ${segreto.slice(0, -1)}x`, segreto)).toBe(false)
    expect(bearerValido(segreto, segreto)).toBe(false)
    expect(bearerValido(`Bearer ${segreto}`, '')).toBe(false)
  })

  // Audit del 09/11/2026, finding 29: con «non-configurato» il callback
  // sarebbe indovinabile. Sotto 32 caratteri, o col segnaposto, è chiuso.
  it('un segreto corto o il segnaposto non si usano, nemmeno se il bearer combacia', () => {
    expect(segretoUsabile(segreto)).toBe(true)
    expect(segretoUsabile('k'.repeat(SEGRETO_MIN - 1))).toBe(false)
    expect(segretoUsabile('non-configurato')).toBe(false)
    expect(segretoUsabile('')).toBe(false)
    expect(segretoUsabile(undefined)).toBe(false)
    expect(bearerValido('Bearer abc', 'abc')).toBe(false)
    expect(bearerValido('Bearer non-configurato', 'non-configurato')).toBe(false)
  })
})

// Il collegamento in index.js: le regole sopra stanno davanti a ogni scrittura.
describe('esitoProvisioning nelle Functions', () => {
  const codice = readFileSync('functions/index.js', 'utf8')
  const fn = codice.slice(codice.indexOf('exports.esitoProvisioning'), codice.indexOf('\n})', codice.indexOf('exports.esitoProvisioning')))

  it('segreto non usabile: 503 prima del confronto; poi i vincoli, per ogni operazione', () => {
    const ordine = ['segretoUsabile(PROVISIONING_CALLBACK_SECRET.value())', 'res.status(503)', 'bearerValido(', "vincoliEsito(fine, prima, { operazione: 'eliminazione' })", "vincoliEsito(esito, prima, { operazione: aggiornamento ? 'aggiornamento' : 'attivazione' })"]
    const posti = ordine.map((x) => fn.indexOf(x))
    expect(posti.every((p) => p > 0)).toBe(true)
    expect([...posti].sort((a, b) => a - b)).toEqual(posti)
    // Il segno del run si scrive con il documento, in tutti e tre i rami.
    expect(fn.match(/ultimo_esito: vincoli\.ultimo_esito/g)).toHaveLength(2)
    expect(fn).toContain('...documentoAggiornamento(esito, prima), ...segno')
    expect(fn).toContain('...documentoIstanza(esito, prima), ...segno')
  })
})
