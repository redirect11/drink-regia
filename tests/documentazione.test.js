'use strict'

// LA DOCUMENTAZIONE DI SVILUPPO RESTA VIVA (REQ-FLOTTA-129). Daniele,
// 17/11/2026, sul punto debole «il permesso dipende da uno script invece
// che dal Terraform: chi legge solo il Terraform non lo vede»: «Dovremmo
// fare una documentazione di sviluppo», e «la documentazione in inglese per
// favore». docs/development.md è il punto d'ingresso per chi sviluppa: se
// nasce uno script o un workflow e lì non c'è, chi arriva dopo non sa che
// esiste né chi lo lancia. E un collegamento che porta a un file sparito
// manda il lettore nel vuoto. Questi controlli fanno rosso in tutti e due i
// casi, a ogni push.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'

const DOC = 'docs/development.md'
const leggi = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// Gli script che si lanciano o si importano: i .mjs e i .js di scripts/.
const script = () =>
  readdirSync('scripts')
    .filter((n) => /\.(m?js)$/.test(n))
    .map((n) => `scripts/${n}`)

const workflow = () => readdirSync('.github/workflows').filter((n) => /\.ya?ml$/.test(n))

// I collegamenti Markdown relativi: [testo](percorso) o [testo](percorso#ancora).
// Fuori gli indirizzi web, la posta e le ancore nella stessa pagina: qui si
// controlla solo che il file ci sia, non il resto di Internet.
function collegamentiRelativi(testo) {
  return [...testo.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)]
    .map((m) => m[1])
    .filter((t) => !/^[a-z][a-z0-9+.-]*:/i.test(t) && !t.startsWith('#'))
    .map((t) => decodeURIComponent(t.split('#')[0]))
    .filter(Boolean)
}

describe('docs/development.md, il punto d’ingresso per chi sviluppa', () => {
  it('esiste, in inglese, e richiama il suo requisito', () => {
    expect(existsSync(DOC)).toBe(true)
    const doc = leggi(DOC)
    expect(doc).toContain('REQ-FLOTTA-129')
    // In inglese per decisione di Daniele (17/11/2026): i titoli che chi
    // arriva cerca, nella lingua in cui li cerca.
    expect(doc).toMatch(/^# .*[Dd]evelop/m)
    expect(doc).toMatch(/^## .*[Rr]elease/m)
  })

  it('cita ogni script di scripts/', () => {
    const doc = leggi(DOC)
    const tutti = script()
    expect(tutti.length).toBeGreaterThan(5)
    const mancanti = tutti.filter((p) => !doc.includes(p))
    expect(mancanti, `script non citati in ${DOC}`).toEqual([])
  })

  it('cita ogni workflow di .github/workflows/', () => {
    const doc = leggi(DOC)
    const tutti = workflow()
    expect(tutti.length).toBeGreaterThan(5)
    const mancanti = tutti.filter((n) => !doc.includes(n))
    expect(mancanti, `workflow non citati in ${DOC}`).toEqual([])
  })

  it('ogni collegamento relativo porta a un file che c’è', () => {
    const doc = leggi(DOC)
    const link = collegamentiRelativi(doc)
    expect(link.length).toBeGreaterThan(5)
    const rotti = link.filter((t) => !existsSync(normalize(join(dirname(DOC), t))))
    expect(rotti, `collegamenti di ${DOC} verso file che non esistono`).toEqual([])
  })

  it('collega i documenti che ci sono già, invece di riscriverli', () => {
    const link = collegamentiRelativi(leggi(DOC))
    for (const atteso of ['architettura.md', 'dipendenze-firebase.md', 'handover.md', 'contratto-regia-app.md', '../infra/README.md', 'flotta-nella-regia.md', '../DESIGN.md']) {
      expect(link, `manca il collegamento a ${atteso}`).toContain(atteso)
    }
  })

  it('ha la tabella della vita di un locale, con le quattro fasi e il ruolo dello Storage', () => {
    const doc = leggi(DOC)
    const inizio = doc.indexOf('## The life of a venue, step by step')
    expect(inizio).toBeGreaterThan(-1)
    const sezione = doc.slice(inizio, doc.indexOf('\n## ', inizio + 1) === -1 ? undefined : doc.indexOf('\n## ', inizio + 1))
    for (const fase of ['### Birth', '### Update', '### Suspension', '### Closure']) {
      expect(sezione, `manca la fase «${fase}»`).toContain(fase)
    }
    for (const chi of ['provisiona-istanza.yml', 'aggiorna-istanza.yml', 'elimina-istanza.yml', 'infra/istanza/main.tf', 'functions/index.js']) {
      expect(sezione).toContain(chi)
    }
    // Il caso che ha fatto nascere il documento (REQ-FLOTTA-124): il ruolo
    // lo dà uno script dopo il bucket, non il Terraform.
    expect(sezione).toContain('roles/firebaserules.firestoreServiceAgent')
    expect(sezione).toContain('scripts/storage-istanza.mjs')
    expect(sezione).toContain('REQ-FLOTTA-124')
    // Le credenziali di ogni passo: una colonna sua.
    expect(sezione).toMatch(/\|[^\n]*Credentials[^\n]*\|/)
  })
})

describe('chi arriva dagli altri documenti trova docs/development.md', () => {
  it('il README lo richiama', () => {
    expect(leggi('README.md')).toContain('docs/development.md')
  })

  it('architettura.md §4 rimanda alla tabella', () => {
    const arch = leggi('docs/architettura.md')
    const s4 = arch.slice(arch.indexOf('## 4.'), arch.indexOf('## 5.'))
    expect(s4).toContain('development.md')
  })
})

describe('il controllo dei collegamenti', () => {
  it('prende i relativi, lascia gli indirizzi web e le ancore', () => {
    const t = '[a](architettura.md) [b](../infra/README.md#prerequisiti) [c](https://example.com/x) [d](#sezione) [e](mailto:x@example.com)'
    expect(collegamentiRelativi(t)).toEqual(['architettura.md', '../infra/README.md'])
  })
})
