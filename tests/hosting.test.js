'use strict'

// LE INTESTAZIONI DI SICUREZZA DEL SITO (REQ-DEV-005, audit del
// 09/11/2026, finding 14). firebase.json le manda con ogni pagina e ogni
// file: senza, il backoffice si incornicia in una pagina altrui
// (clickjacking) e un XSS futuro ha mano libera. La Content-Security-Policy
// parte in Report-Only: il browser segnala in console quello che
// bloccherebbe e non blocca niente, così si osserva sul test (popup di
// Google, ritorno da Stripe) prima di renderla vincolante. Le direttive
// nascono da quello che il sito carica davvero: script e stili propri
// (Vite li scrive in /assets), il font ospitato in /fonts, Firestore,
// Auth e le Functions sui domini di Google, la finestra di Google per
// l'accesso. firebase.json non ammette commenti: il perché sta qui.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const RADICE = process.cwd()
const config = JSON.parse(readFileSync(join(RADICE, 'firebase.json'), 'utf8'))
const regole = config.hosting.headers.find((r) => r.source === '**')
const intestazione = (nome) => regole.headers.find((h) => h.key === nome)?.value
const csp = Object.fromEntries(
  intestazione('Content-Security-Policy-Report-Only')
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .map(([nome, ...valori]) => [nome, valori]),
)

describe('firebase.json: le intestazioni di sicurezza su ogni pagina', () => {
  it('una sola regola, per tutto il sito', () => {
    expect(config.hosting.headers).toHaveLength(1)
    expect(regole.source).toBe('**')
  })

  it('nessuno incornicia il sito, nessuno indovina il tipo dei file', () => {
    expect(intestazione('X-Frame-Options')).toBe('DENY')
    expect(intestazione('X-Content-Type-Options')).toBe('nosniff')
  })

  it('il referrer esce solo come origine, e solo verso https', () => {
    expect(intestazione('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('niente fotocamera, microfono e posizione: il sito non li usa', () => {
    expect(intestazione('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('HSTS per un anno, anche sui sottodomini: conta sul dominio proprio, dove Firebase non lo mette da sé', () => {
    expect(intestazione('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains')
  })
})

describe('la Content-Security-Policy, in osservazione', () => {
  it('è Report-Only: prima si guarda la console sul test, poi si rende vincolante', () => {
    expect(intestazione('Content-Security-Policy-Report-Only')).toBeDefined()
    expect(intestazione('Content-Security-Policy')).toBeUndefined()
  })

  it('tutto dal sito stesso, salvo quello che segue', () => {
    expect(csp['default-src']).toEqual(["'self'"])
    expect(csp['object-src']).toEqual(["'none'"])
    expect(csp['base-uri']).toEqual(["'self'"])
    expect(csp['form-action']).toEqual(["'self'"])
    expect(csp['frame-ancestors']).toEqual(["'none'"])
  })

  // Vite scrive gli script in file propri; in index.html resta solo il
  // preload del font della prima pagina, che la CSP ammette per impronta.
  // Se quello script cambia anche di uno spazio, l'impronta cambia e il
  // preload (solo lui) verrebbe segnalato: il test lo dice prima.
  it('script solo dal sito e l’impronta dell’unico script in pagina', () => {
    const html = readFileSync(join(RADICE, 'index.html'), 'utf8').replace(/\r\n/g, '\n')
    const inPagina = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(inPagina).toHaveLength(1)
    const impronta = `'sha256-${createHash('sha256').update(inPagina[0]).digest('base64')}'`
    expect(csp['script-src']).toEqual(["'self'", impronta])
    expect(csp['script-src']).not.toContain("'unsafe-inline'")
    expect(csp['script-src']).not.toContain("'unsafe-eval'")
  })

  it('stili propri e inline (React li scrive negli attributi), font e immagini proprie', () => {
    expect(csp['style-src']).toEqual(["'self'", "'unsafe-inline'"])
    expect(csp['font-src']).toEqual(["'self'"])
    expect(csp['img-src']).toEqual(["'self'", 'data:'])
  })

  // Firestore, Auth (identitytoolkit, securetoken) e il resto di Google
  // stanno sotto googleapis.com; le Functions rispondono su
  // cloudfunctions.net (db.js, anche le due chiamate con fetch); il
  // dominio di Auth (<progetto>.firebaseapp.com) per la finestra di
  // Google. Niente Realtime Database, quindi niente firebaseio.com; Stripe
  // è un reindirizzamento, non un caricamento.
  it('le connessioni: Google, le Functions e il dominio di Auth', () => {
    expect(csp['connect-src']).toEqual(["'self'", 'https://*.googleapis.com', 'https://*.cloudfunctions.net', 'https://*.firebaseapp.com'])
    expect(csp['frame-src']).toEqual(['https://*.firebaseapp.com', 'https://accounts.google.com'])
  })

  it('il sito non chiama nessuno in chiaro', () => {
    expect(intestazione('Content-Security-Policy-Report-Only')).not.toMatch(/http:\/\//)
  })
})
