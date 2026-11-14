'use strict'

// IL DOCUMENTO DELLE INTERFACCE FRA LA REGIA E L'APP (REQ-FLOTTA-107).
// Daniele, 14/11/2026: «l'unico modo per essere incompatibili è che tana
// drink o regia usino api vecchie quindi io direi di iniziare a documentare
// le api e un modo per fare questo cambio quando cambiano le api», e «ogni
// modifica che va fatta bisogna sempre verificare se rischiamo di cambiare
// una interfaccia ed aggiornare il documento». Questi controlli tengono il
// documento onesto: una Function HTTP o un input dei workflow nuovi senza
// la loro voce fanno rosso qui, a ogni push.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { load } from 'js-yaml'

const DOC = 'docs/contratto-regia-app.md'
const leggi = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

describe('il documento delle interfacce fra la regia e l’app', () => {
  it('esiste', () => {
    expect(existsSync(DOC)).toBe(true)
  })

  it('ogni Function HTTP della regia ha la sua voce (anche quelle che non parlano con l’app, nel loro elenco)', () => {
    const doc = leggi(DOC)
    const http = [...leggi('functions/index.js').matchAll(/exports\.([A-Za-z]+) = onRequest\(/g)].map((m) => m[1])
    expect(http.length).toBeGreaterThan(5)
    const mancanti = http.filter((nome) => !doc.includes('`' + nome + '`'))
    expect(mancanti, `Function HTTP senza voce in ${DOC}`).toEqual([])
  })

  it('ogni input dei workflow che pubblicano l’app ha la sua voce', () => {
    const doc = leggi(DOC)
    for (const file of ['aggiorna-istanza.yml', 'provisiona-istanza.yml']) {
      const w = load(leggi(`.github/workflows/${file}`))
      const input = Object.keys(w.on.workflow_dispatch.inputs)
      const mancanti = input.filter((nome) => !doc.includes('`' + nome + '`'))
      expect(mancanti, `input di ${file} senza voce in ${DOC}`).toEqual([])
    }
  })

  it('dice come si cambia un’interfaccia: mai sul posto, la nuova accanto alla vecchia', () => {
    const doc = leggi(DOC)
    expect(doc).toMatch(/^## Come si cambia un['’]interfaccia$/m)
    expect(doc).toContain('mai sul posto')
    expect(doc).toMatch(/^## Le interfacce deprecate$/m)
    expect(doc).toContain('`passaggioVersoRegia`')
  })

  it('le regole del repository e il revisore rimandano al documento', () => {
    expect(leggi('CLAUDE.md')).toContain(DOC)
    expect(leggi('.claude/agents/revisore.md')).toContain(DOC)
  })
})
