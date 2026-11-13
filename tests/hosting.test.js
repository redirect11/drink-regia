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
  it('la regola di sicurezza vale per tutto il sito, ed è la prima', () => {
    expect(config.hosting.headers[0]).toBe(regole)
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

// LA MEMORIA DEL BROWSER (REQ-DEV-013). Il 11/11/2026, dopo il tag
// v0.3.0-beta.9, Daniele ha aperto il sito di test e l'ha visto senza
// grafica. Firebase serviva tutto con «max-age=3600»: il suo browser aveva
// ancora la pagina della beta.8, che chiede il foglio di stile della beta.8;
// il deploy nuovo quel file l'aveva tolto, e al suo posto la riscrittura
// verso index.html rispondeva con una pagina HTML, che il browser rifiuta
// come stile (X-Content-Type-Options: nosniff). A ogni rilascio, chi era
// passato dal sito nell'ora prima l'avrebbe visto rotto. Tre regole:
// la pagina si ricontrolla sempre; i file di /assets, che hanno l'impronta
// nel nome e non cambiano mai, si tengono un anno; un file che manca è un
// 404, non la prima pagina travestita.
describe('firebase.json: cosa il browser può tenere in memoria', () => {
  const regola = (source) => config.hosting.headers.find((r) => r.source === source)
  const memoria = (source) => regola(source)?.headers.find((h) => h.key === 'Cache-Control')?.value

  it('la pagina si ricontrolla a ogni visita: dopo un rilascio nessuno resta con quella vecchia', () => {
    expect(memoria('**')).toBe('no-cache')
  })

  it('i file con l’impronta nel nome si tengono un anno, e non si richiedono più', () => {
    expect(memoria('/assets/**')).toBe('public, max-age=31536000, immutable')
  })

  it('caratteri e filmati hanno un nome fisso: un mese i primi, un’ora i secondi, che cambiano', () => {
    expect(memoria('/fonts/**')).toBe('public, max-age=2592000')
    expect(memoria('/video/**')).toBe('public, max-age=3600')
  })

  // Firebase applica tutte le regole che combaciano, e per la stessa
  // intestazione vince l'ultima: le regole particolari stanno dopo «**».
  it('le regole particolari vengono dopo quella generale, sennò «no-cache» le coprirebbe', () => {
    const ordine = config.hosting.headers.map((r) => r.source)
    for (const s of ['/assets/**', '/fonts/**', '/video/**']) expect(ordine.indexOf(s)).toBeGreaterThan(ordine.indexOf('**'))
  })

  it('un file che manca in /assets, /fonts o /video è un 404: la riscrittura verso index.html non li tocca', () => {
    expect(config.hosting.rewrites).toEqual([{ source: '!/@(assets|fonts|video)/**', destination: '/index.html' }])
  })
})
