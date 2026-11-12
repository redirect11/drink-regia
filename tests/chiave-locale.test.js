'use strict'

// LA CHIAVE AI NEL LOCALE (REQ-FLOTTA-076, Daniele, 12/11/2026: «si
// procedi»). La regia scrive la «Chiave AI» appena creata nel segreto
// REGIA_AI_KEY del progetto del locale, col permesso minimo.

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const c = require('../functions/lib/chiave-locale.js')

const vero = { slug: 'bar-mario', progetto: 'drinkpos-bar-mario', stato: 'attiva', profilo: 'completo' }

describe('dove si scrive la chiave', () => {
  it('in un locale attivo col profilo completo, nel suo progetto', () => {
    expect(c.doveScrivere(vero)).toEqual({ ok: true, progetto: 'drinkpos-bar-mario', perche: null })
  })
  it('non in un locale senza installazione, simulato, esistente, senza progetto o col profilo leggero', () => {
    for (const ist of [null, { ...vero, simulata: true, progetto: null }, { ...vero, origine: 'esistente' }, { ...vero, progetto: null }, { ...vero, profilo: 'leggero' }]) {
      const d = c.doveScrivere(ist)
      expect(d.ok).toBe(false)
      expect(d.perche.length).toBeGreaterThan(10)
    }
  })
})

describe('la scrittura nel segreto del locale', () => {
  const fintoFetch = (status) => {
    const chiamate = []
    const fn = async (url, opz) => {
      chiamate.push({ url, opz })
      return { ok: status >= 200 && status < 300, status }
    }
    fn.chiamate = chiamate
    return fn
  }

  it('aggiunge una versione a REGIA_AI_KEY, con la chiave in base64 e il token dell’account', async () => {
    const fetch = fintoFetch(200)
    const esito = await c.scriviChiave({ progetto: 'drinkpos-bar-mario', chiave: 'bar-mario.segreto', token: 'tok', fetch })
    expect(esito).toEqual({ scritta: true, perche: null })
    const [{ url, opz }] = fetch.chiamate
    expect(url).toBe('https://secretmanager.googleapis.com/v1/projects/drinkpos-bar-mario/secrets/REGIA_AI_KEY:addVersion')
    expect(opz.method).toBe('POST')
    expect(opz.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(opz.body)).toEqual({ payload: { data: Buffer.from('bar-mario.segreto').toString('base64') } })
  })

  it('se Google rifiuta dice perché: permesso, segreto che non c’è, altro', async () => {
    const senzaPermesso = await c.scriviChiave({ progetto: 'p-x', chiave: 'k', token: 't', fetch: fintoFetch(403) })
    expect(senzaPermesso.scritta).toBe(false)
    expect(senzaPermesso.perche).toMatch(/permesso.*«Aggiorna»/)
    const senzaSegreto = await c.scriviChiave({ progetto: 'p-x', chiave: 'k', token: 't', fetch: fintoFetch(404) })
    expect(senzaSegreto.perche).toMatch(/REGIA_AI_KEY non c’è ancora/)
    const altro = await c.scriviChiave({ progetto: 'p-x', chiave: 'k', token: 't', fetch: fintoFetch(500) })
    expect(altro.perche).toMatch(/500/)
  })

  it('il comando per scriverla a mano', () => {
    expect(c.comandoAMano('drinkpos-bar-mario')).toBe('firebase functions:secrets:set REGIA_AI_KEY --project drinkpos-bar-mario')
  })
})

describe('nelle Functions e nel Terraform', () => {
  it('«chiave» scrive l’impronta, poi prova a scrivere nel locale, e la chiave nasce comunque', () => {
    const codice = readFileSync('functions/index.js', 'utf8').replace(/\r\n/g, '\n')
    const azione = codice.slice(codice.indexOf("if (azione === 'chiave') {"), codice.indexOf("throw new HttpsError('invalid-argument', 'Azione sconosciuta.')", codice.indexOf("if (azione === 'chiave') {")))
    expect(azione.indexOf('riservato/chiave')).toBeLessThan(azione.indexOf('chiaveLocale.doveScrivere('))
    expect(azione.indexOf('chiaveLocale.doveScrivere(')).toBeLessThan(azione.indexOf('chiaveLocale.scriviChiave('))
    expect(azione).toMatch(/\.catch\(/)
    expect(azione).toContain('return { ok: true, chiave: bearer, nel_locale: nelLocale, progetto: dove.progetto }')
  })

  it('il permesso è solo per aggiungere versioni a REGIA_AI_KEY, all’account della regia', () => {
    const tf = readFileSync('infra/istanza/main.tf', 'utf8').replace(/\r\n/g, '\n')
    const blocco = tf.slice(tf.indexOf('resource "google_project_iam_member" "regia_chiave_ai"'))
    expect(blocco).toMatch(/role\s*=\s*"roles\/secretmanager\.secretVersionAdder"/)
    expect(blocco).toMatch(/member\s*=\s*"serviceAccount:\$\{var\.regia_sa_email\}"/)
    expect(blocco.slice(0, blocco.indexOf('\n}\n'))).toContain('expression  = "resource.name.startsWith(\\"projects/${google_project.istanza.number}/secrets/REGIA_AI_KEY\\")"')
  })
})
