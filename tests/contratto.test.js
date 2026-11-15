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

  // REQ-FLOTTA-112: la versione per dispositivo e le anteprime, concordate
  // con tana-drink il 15/11/2026.
  it('la presentazione dice il codice del dispositivo, la minima e le anteprime', () => {
    const doc = leggi(DOC)
    const quattro = doc.slice(doc.indexOf('### 4. La presentazione'), doc.indexOf('### 5.'))
    expect(quattro).toContain('{ versione, dispositivo? }')
    expect(quattro).toContain('`^[A-Za-z0-9_-]{22}$`')
    expect(quattro).toContain('presentazione.minima')
    expect(quattro).toContain('senza_codice')
    expect(quattro).toContain('`<sito>--<canale>.web.app`')
    expect(quattro).toContain('REQ-FLOTTA-112')
    // Un'interfaccia deprecata si toglie guardando la minima, non l'ultima.
    expect(doc).toContain('(`istanze/{slug}.presentazione.minima`)')
  })

  // REQ-FLOTTA-115: la sicurezza delle interfacce. Daniele, 15/11/2026: «il
  // gestore e nessun altro su altre istanze puo cambiare qualcosa che
  // interagisca con il backend di regia direttamente. Dobbiamo mettere tutta
  // la comunicazione tra regia e drink in sicurezza», e sul contratto
  // scritto sullo standard, con Google oggi e la chiave del locale per l'on
  // premise: «Ok procediamo così».
  describe('la sicurezza delle interfacce (REQ-FLOTTA-115)', () => {
    const sezione = () => {
      const doc = leggi(DOC)
      const da = doc.indexOf('## La sicurezza delle interfacce')
      expect(da, 'manca la sezione «La sicurezza delle interfacce»').toBeGreaterThan(-1)
      const a = doc.indexOf('\n## ', da + 1)
      return a === -1 ? doc.slice(da) : doc.slice(da, a)
    }

    it('dice le regole: nessuna persona di un locale cambia qualcosa nella regia, il server con un gettone firmato da un emittente registrato, la versione letta dal sito', () => {
      const s = sezione()
      expect(s).toContain('REQ-FLOTTA-115')
      expect(s).toContain('Nessuna persona di un locale')
      expect(s).toContain('emittente registrato per quel locale')
      expect(s).toContain('vale solo per il suo locale')
      expect(s).toContain('`versione.json`')
      // Lo standard, non il fornitore: Google oggi, la chiave del locale dopo.
      expect(s).toContain('JWT')
      expect(s).toContain('on premise')
    })

    it('l’inventario ha una riga per ogni interfaccia, con chi chiama, l’identità e cosa cambia', () => {
      const s = sezione()
      const doc = leggi(DOC)
      const numeri = [...doc.matchAll(/^### (\d+)\. /gm)].map((m) => m[1])
      expect(numeri.length).toBeGreaterThanOrEqual(14)
      const righe = s.split('\n').filter((l) => /^\| \d+[a-z]? \|/.test(l))
      const nell = new Set(righe.map((l) => l.split('|')[1].trim().replace(/[a-z]$/, '')))
      const mancanti = numeri.filter((n) => !nell.has(n))
      expect(mancanti, 'interfacce senza riga nell’inventario').toEqual([])
      for (const r of righe) expect(r.split('|').length, r).toBeGreaterThanOrEqual(7)
      expect(s).toContain('`passaggioVersoRegia`')
    })

    it('segna le interfacce legate a Firestore del locale', () => {
      const s = sezione()
      for (const n of ['1', '2', '3']) {
        const riga = s.split('\n').find((l) => l.startsWith(`| ${n} |`))
        expect(riga, `riga ${n}`).toMatch(/legata a Firestore/)
      }
    })
  })

  it('le regole del repository e il revisore rimandano al documento', () => {
    expect(leggi('CLAUDE.md')).toContain(DOC)
    expect(leggi('.claude/agents/revisore.md')).toContain(DOC)
  })
})
