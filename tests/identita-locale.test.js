'use strict'

// L'AI DEL LOCALE SENZA CHIAVE (REQ-FLOTTA-077, Daniele, 12/11/2026:
// «niente chiave»). Il locale si fa riconoscere col gettone di Google del
// suo account ai-locale; la regia ne fa controllare firma e destinatario e
// risale al locale dal nome del progetto. I gettoni qui sono veri: firmati
// con una chiave generata nel test e controllati dalla stessa libreria
// della regia.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, sign } from 'node:crypto'

const require = createRequire(import.meta.url)
const id = require('../functions/lib/identita-locale.js')
// Dalla radice (arriva con firebase-tools): in CI le Functions non hanno i
// loro node_modules. Il controllo della firma è lo stesso della versione
// delle Functions.
const { OAuth2Client } = require('google-auth-library')

const REGIA = 'drink-regia-test'
const AUD = id.audienceAI(REGIA)
const EMAIL = 'ai-locale@drinkpos-bar-mario.iam.gserviceaccount.com'

// Una coppia di chiavi «di Google» per il test, e un firmatario di gettoni.
const chiavi = generateKeyPairSync('rsa', { modulusLength: 2048 })
const altre = generateKeyPairSync('rsa', { modulusLength: 2048 })
const pem = chiavi.publicKey.export({ type: 'spki', format: 'pem' })
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function gettone(corpo = {}, { chiave = chiavi.privateKey } = {}) {
  const adesso = Math.floor(Date.now() / 1000)
  const testa = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
  const dati = b64({ iss: 'https://accounts.google.com', aud: AUD, email: EMAIL, email_verified: true, iat: adesso, exp: adesso + 600, ...corpo })
  const firma = sign('RSA-SHA256', Buffer.from(`${testa}.${dati}`), chiave).toString('base64url')
  return `${testa}.${dati}.${firma}`
}
// Il controllo come lo fa verifyIdToken nella regia, coi certificati del test.
const client = new OAuth2Client()
const verifica = async (g, audience) => (await client.verifySignedJwtWithCertsAsync(g, { k1: pem }, audience, id.EMITTENTI)).getPayload()

const istanza = { id: 'bar-mario', data: { stato: 'attiva', progetto: 'drinkpos-bar-mario' } }
const opzioni = (trovate = [istanza]) => ({ progettoRegia: REGIA, verifica, cercaPerProgetto: async () => trovate })

describe('il gettone nell’intestazione', () => {
  it('un gettone di Google ha tre parti; la chiave vecchia no', () => {
    expect(id.tokenDaBearer('Bearer eyJhbGciOi.eyJpc3Mi.c2lnbmF0dXJl')).toBe('eyJhbGciOi.eyJpc3Mi.c2lnbmF0dXJl')
    expect(id.tokenDaBearer('Bearer bar-mario.segretolungosegretolungo')).toBeNull()
    expect(id.tokenDaBearer('')).toBeNull()
  })
  it('il destinatario è la regia, non l’indirizzo della Function', () => {
    expect(id.audienceAI('drink-regia-test')).toBe('regia-ai:drink-regia-test')
    expect(id.audienceAI(null)).toBeNull()
  })
})

describe('il locale dal gettone, con gettoni veri', () => {
  it('un gettone giusto dell’account ai-locale del locale: è quel locale', async () => {
    expect(await id.localeDalGettone(gettone(), opzioni())).toBe('bar-mario')
  })
  it('destinatario sbagliato, scaduto, firmato da altri: rifiutato', async () => {
    await expect(id.localeDalGettone(gettone({ aud: 'https://europe-west1-drink-regia-test.cloudfunctions.net/richiestaAI' }), opzioni())).rejects.toThrow()
    await expect(id.localeDalGettone(gettone({ aud: 'regia-ai:drink-regia' }), opzioni())).rejects.toThrow()
    const passato = Math.floor(Date.now() / 1000) - 7200
    await expect(id.localeDalGettone(gettone({ iat: passato, exp: passato + 600 }), opzioni())).rejects.toThrow()
    await expect(id.localeDalGettone(gettone({}, { chiave: altre.privateKey }), opzioni())).rejects.toThrow()
  })
  it('l’account predefinito del progetto, o un altro account, non valgono', async () => {
    expect(await id.localeDalGettone(gettone({ email: '600871952552-compute@developer.gserviceaccount.com' }), opzioni())).toBeNull()
    expect(await id.localeDalGettone(gettone({ email: 'altro@drinkpos-bar-mario.iam.gserviceaccount.com' }), opzioni())).toBeNull()
    expect(await id.localeDalGettone(gettone({ email_verified: false }), opzioni())).toBeNull()
  })
  it('nessun locale o due locali con quel progetto: nessuno', async () => {
    expect(await id.localeDalGettone(gettone(), opzioni([]))).toBeNull()
    expect(await id.localeDalGettone(gettone(), opzioni([istanza, { ...istanza, id: 'doppio' }]))).toBeNull()
  })
  it('un locale simulato, non attivo, chiuso o la demo: nessuno', async () => {
    for (const data of [
      { ...istanza.data, simulata: true },
      { ...istanza.data, stato: 'in corso' },
      { ...istanza.data, licenza_stato: 'chiusa' },
      { ...istanza.data, progetto: 'drinkpos-demo' },
    ]) {
      expect(await id.localeDalGettone(gettone(), opzioni([{ id: 'x', data }]))).toBeNull()
    }
  })
  it('senza il progetto della regia non si accetta niente', async () => {
    expect(await id.localeDalGettone(gettone(), { ...opzioni(), progettoRegia: null })).toBeNull()
  })
  it('nel log solo il motivo breve, mai il gettone', () => {
    const g = gettone()
    expect(id.motivoBreve(new Error(`Invalid token signature: ${g}`))).toBe('Invalid token signature')
  })
})

describe('nella regia e nel Terraform', () => {
  const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
  const porta = codice.slice(codice.indexOf('exports.richiestaAI = onRequest('), codice.indexOf('const esito = await interrogaClaude(', codice.indexOf('exports.richiestaAI = onRequest(')))
  it('la porta prova il gettone prima, e non ricade sulla chiave se il gettone non va', () => {
    expect(porta.indexOf('identita.tokenDaBearer(')).toBeGreaterThan(0)
    expect(porta.indexOf('identita.tokenDaBearer(')).toBeLessThan(porta.indexOf('ai.leggiBearer('))
    expect(porta).toContain("if (!slug) return res.status(401).json({ errore: 'Locale non riconosciuto.' })")
    expect(porta).toContain('identita.motivoBreve(e)')
  })
  it('il controllo è quello di Google, e le istanze si cercano per progetto, al più due', () => {
    expect(codice).toContain('(await oauthGoogle.verifyIdToken({ idToken: gettone, audience })).getPayload()')
    expect(codice).toContain(".where('progetto', '==', progetto).limit(2).get()")
  })
  it('il Terraform del locale crea l’account ai-locale, con Firestore e log del suo progetto', () => {
    const tf = readFileSync('infra/istanza/main.tf', 'utf8').replace(/\r\n/g, '\n')
    expect(tf).toMatch(/resource "google_service_account" "ai_locale" \{[^}]*account_id\s*=\s*"ai-locale"/)
    const ruoli = tf.slice(tf.indexOf('resource "google_project_iam_member" "ai_locale"'))
    expect(ruoli.slice(0, ruoli.indexOf('\n}\n'))).toContain('"roles/datastore.user"')
    expect(ruoli.slice(0, ruoli.indexOf('\n}\n'))).toContain('"roles/logging.logWriter"')
    expect(ruoli).toMatch(/member\s*=\s*"serviceAccount:\$\{google_service_account\.ai_locale\.email\}"/)
  })
  it('google-auth-library è una dipendenza dichiarata, e il contratto lo dice', () => {
    expect(JSON.parse(readFileSync('functions/package.json', 'utf8')).dependencies['google-auth-library']).toMatch(/^\^10\./)
    const handover = readFileSync('docs/handover.md', 'utf8')
    expect(handover).toContain('**Dal 12/11/2026 senza chiave** (REQ-FLOTTA-077')
    expect(handover).toContain('ai-locale@<progetto>.iam.gserviceaccount.com')
    expect(handover).toContain('regia-ai:<REGIA_PROGETTO>')
  })
})
