'use strict'

// LA MAPPA DELLE DIPENDENZE DA FIREBASE (REQ-FLOTTA-116). Daniele,
// 15/11/2026: «Un agente dovrebbe segnarsi da qualche parte tutte le
// integrazioni forti che abbiamo con firebase così che un giorno se
// cambiamo (ad esempio andiamo diretti su aws, o google cloude docker o
// simili) dobbiamo solo reimplementare delle interfacce». Questi controlli
// tengono la mappa onesta: un file nuovo che usa Firebase o Google Cloud
// senza essere citato fa rosso, a ogni push.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MAPPA = 'docs/dipendenze-firebase.md'
const leggi = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// I file di una cartella, senza node_modules né i file generati.
function file(cartella) {
  if (!existsSync(cartella)) return []
  return readdirSync(cartella).flatMap((nome) => {
    const p = join(cartella, nome).replace(/\\/g, '/')
    if (nome === 'node_modules' || nome === 'lib-cjs') return []
    return statSync(p).isDirectory() ? file(p) : [p]
  })
}

// Chi usa Firebase o Google Cloud dal codice: gli SDK, la libreria
// d'identità di Google, le API di Google.
const SDK = /google-auth-library|googleapis|@google-cloud\/|firebase-admin|firebase-functions|from ['"]firebase(\/[a-z-]+)?['"]/
const CODICE = /\.(m?js|jsx|cjs)$/
// I workflow che parlano con Google: firebase-tools, l'accesso a Google, gcloud.
const WORKFLOW = /firebase-tools|firebase deploy|google-github-actions\/|gcloud /

describe('la mappa delle dipendenze da Firebase', () => {
  it('esiste e dice la regola: chi aggiunge una dipendenza aggiorna la mappa nella stessa PR', () => {
    expect(existsSync(MAPPA)).toBe(true)
    const doc = leggi(MAPPA)
    expect(doc).toContain('REQ-FLOTTA-116')
    expect(doc).toContain('nella stessa PR')
    expect(doc).toMatch(/porta/i)
    expect(doc).toMatch(/adattatore/i)
  })

  it('cita ogni file del codice che usa Firebase o Google Cloud', () => {
    const doc = leggi(MAPPA)
    const usano = ['src', 'functions', 'scripts']
      .flatMap(file)
      .filter((p) => CODICE.test(p) && SDK.test(leggi(p)))
    expect(usano.length).toBeGreaterThan(5)
    const mancanti = usano.filter((p) => !doc.includes(p))
    expect(mancanti, `file che usano Firebase o Google Cloud e non sono in ${MAPPA}`).toEqual([])
  })

  it('cita ogni workflow che parla con Google, e il Terraform della flotta', () => {
    const doc = leggi(MAPPA)
    const workflow = file('.github/workflows').filter((p) => /\.ya?ml$/.test(p) && WORKFLOW.test(leggi(p)))
    expect(workflow.length).toBeGreaterThan(2)
    const mancanti = workflow.filter((p) => !doc.includes(p.replace('.github/workflows/', '')))
    expect(mancanti, `workflow che parlano con Google e non sono in ${MAPPA}`).toEqual([])
    expect(doc).toContain('infra/')
  })

  it('separa quello che lega anche il contratto con l’app', () => {
    const doc = leggi(MAPPA)
    expect(doc).toMatch(/^## Legate al contratto con l['’]app/m)
    expect(doc).toContain('docs/contratto-regia-app.md')
  })
})
