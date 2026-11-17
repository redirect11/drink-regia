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

  // REQ-FLOTTA-114: le anteprime non si segnano, e l'istanza di prova si
  // accende e si spegne dalle prove e2e di tana-drink, col gettone di deploy.
  it('le anteprime non contano e l’istanza di prova ha la sua interfaccia, col gettone di deploy', () => {
    const doc = leggi(DOC)
    const quattro = doc.slice(doc.indexOf('### 4. La presentazione'), doc.indexOf('### 5.'))
    expect(quattro).toContain('la regia non la segna')
    expect(quattro).not.toContain('anteprima { versione, il }')
    const prova = doc.slice(doc.indexOf('### 15. L’istanza di prova'), doc.indexOf('## La sicurezza delle interfacce'))
    expect(prova).toContain('`istanzaDiProva`')
    expect(prova).toContain('{ attiva }')
    expect(prova).toContain('REQ-FLOTTA-114')
    expect(prova).toContain('`deploy@<progetto>.iam.gserviceaccount.com`')
    expect(prova).toContain('`regia-prova:<drink-regia|drink-regia-test>`')
    expect(prova).not.toContain('utente qualunque del progetto, anche')
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

// IL PACCHETTO PER VERSIONE (REQ-FLOTTA-137, interfaccia 16). La regia
// controlla un pacchetto prima di toccare un locale: un formato che non
// conosce, un file che manca o un'impronta che non torna fermano tutto.
describe('il pacchetto per versione (REQ-FLOTTA-137)', async () => {
  const { problemiDelManifesto, problemiDeiFile, versioneAmmessa, nomeArchivio, nomeImpronta, FILE_NECESSARI } = await import('../scripts/lib-pacchetto.js')
  const H = (c) => c.repeat(64)
  const manifesto = (extra = {}) => ({
    formato: 1,
    tipo: 'locali',
    versione: '1.11.0',
    tag: 'v1.11.0',
    beta: false,
    commit: 'a'.repeat(40),
    strumenti: { node: '22', 'firebase-tools': '15.36.0' },
    personalizzabili: ['dist/index.html', 'dist/manifest.webmanifest'],
    creato_il: '2026-11-17T22:00:00Z',
    profili: ['completo', 'leggero'],
    file: Object.fromEntries([...FILE_NECESSARI.locali, 'dist/manifest.webmanifest'].map((f) => [f, H('b')])),
    ...extra,
  })

  it('il contratto ha l’interfaccia 16, con chi carica, dove, cosa c’è dentro e come si personalizza', () => {
    const doc = leggi(DOC)
    const sedici = doc.slice(doc.indexOf('### 16. Il pacchetto per versione'), doc.indexOf('## La sicurezza delle interfacce'))
    expect(sedici).toContain('REQ-FLOTTA-137')
    expect(sedici).toContain('`drink-regia-test-rilasci`')
    expect(sedici).toContain('`drink-regia-rilasci`')
    expect(sedici).toContain('`1259880473`')
    expect(sedici).toContain('**solo creare**')
    expect(sedici).toContain('`pacchetto.json`')
    expect(sedici).toContain('personalizza.mjs')
    expect(sedici).toContain('Finché il\npacchetto non c\'è, vale l\'interfaccia 12.')
  })

  it('un manifesto completo passa', () => {
    expect(problemiDelManifesto(manifesto(), { versioneAttesa: '1.11.0', tipoAtteso: 'locali' })).toEqual([])
    expect(problemiDelManifesto(manifesto({ versione: '1.11.0-beta.3', tag: 'v1.11.0-beta.3', beta: true }))).toEqual([])
    // I tag di prova di tana-drink sono -beta senza numero.
    expect(problemiDelManifesto(manifesto({ versione: '1.10.56-beta', tag: 'v1.10.56-beta', beta: true }))).toEqual([])
  })

  it('formato sconosciuto, tipo, versione, commit, data e profili sbagliati si dicono tutti', () => {
    const p = problemiDelManifesto(manifesto({ formato: 2, tipo: 'altro', versione: 'v1.11', commit: 'abc', creato_il: 'ieri', profili: ['grande'] }))
    expect(p.join('\n')).toMatch(/formato 2 non conosciuto/)
    expect(p.join('\n')).toMatch(/tipo "altro" non valido/)
    expect(p.join('\n')).toMatch(/versione "v1.11" non valida/)
    expect(p.join('\n')).toMatch(/commit mancante/)
    expect(p.join('\n')).toMatch(/creato_il non è una data/)
    expect(p.join('\n')).toMatch(/profili non validi/)
    expect(problemiDelManifesto(null)).toEqual(['pacchetto.json non è un oggetto'])
  })

  it('tag, beta, strumenti e personalizzabili devono tornare col resto', () => {
    expect(problemiDelManifesto(manifesto({ tag: 'v1.11.1' }))).toEqual(['tag "v1.11.1" diverso da v1.11.0'])
    expect(problemiDelManifesto(manifesto({ beta: true }))).toEqual(['beta: true, ma la versione è 1.11.0'])
    expect(problemiDelManifesto(manifesto({ versione: '1.11.0-beta', tag: 'v1.11.0-beta', beta: false }))).toEqual(['beta: false, ma la versione è 1.11.0-beta'])
    expect(problemiDelManifesto(manifesto({ beta: 'no' }))).toEqual(['beta deve essere true o false'])
    expect(problemiDelManifesto(manifesto({ strumenti: { node: '22', 'firebase-tools': 'latest' } }))).toEqual(['strumenti: servono node e la versione fissata di firebase-tools'])
    expect(problemiDelManifesto(manifesto({ personalizzabili: ['../x'] }))).toContain('personalizzabili deve essere un elenco di percorsi del pacchetto')
    expect(problemiDelManifesto(manifesto({ personalizzabili: ['dist/logo.png'] }))).toEqual(['personalizzabile non nel pacchetto: dist/logo.png'])
  })

  it('una versione o un tipo diversi da quelli chiesti si rifiutano', () => {
    expect(problemiDelManifesto(manifesto(), { versioneAttesa: '1.12.0' })).toEqual(['versione 1.11.0, attesa 1.12.0'])
    expect(problemiDelManifesto(manifesto(), { tipoAtteso: 'demo' })).toEqual(['tipo «locali», atteso «demo»'])
  })

  it('mancano i file che il deploy usa: il pacchetto dei locali senza personalizza.mjs si rifiuta, la demo no', () => {
    const senza = manifesto()
    delete senza.file['personalizza.mjs']
    expect(problemiDelManifesto(senza)).toEqual(['manca personalizza.mjs'])
    const demo = manifesto({ tipo: 'demo', personalizzabili: [], file: Object.fromEntries(FILE_NECESSARI.demo.map((f) => [f, H('c')])) })
    expect(problemiDelManifesto(demo)).toEqual([])
    expect(problemiDelManifesto(manifesto({ file: undefined }))).toContain('manca l’elenco dei file con le impronte')
  })

  it('un percorso che esce dal pacchetto o un’impronta malformata si rifiutano', () => {
    const m = manifesto()
    m.file['../fuori'] = H('d')
    m.file['/assoluto'] = H('d')
    m.file['C:/windows'] = H('d')
    m.file['dist/a.js'] = 'xyz'
    const p = problemiDelManifesto(m)
    expect(p).toContain('percorso non ammesso: ../fuori')
    expect(p).toContain('percorso non ammesso: /assoluto')
    expect(p).toContain('percorso non ammesso: C:/windows')
    expect(p).toContain('impronta non valida per dist/a.js')
  })

  it('i file su disco: impronta diversa, file mancante o file non dichiarato fermano tutto', () => {
    const m = manifesto({ file: { 'dist/index.html': H('1'), 'firebase.json': H('2') } })
    const ok = { 'dist/index.html': H('1'), 'firebase.json': H('2') }
    expect(problemiDeiFile(m, (f) => ok[f] ?? null, ['dist/index.html', 'firebase.json', 'pacchetto.json'])).toEqual([])
    expect(problemiDeiFile(m, (f) => ({ ...ok, 'firebase.json': H('9') })[f] ?? null, [])).toEqual(['impronta diversa per firebase.json'])
    expect(problemiDeiFile(m, (f) => ({ 'dist/index.html': H('1') })[f] ?? null, [])).toEqual(['manca firebase.json'])
    expect(problemiDeiFile(m, (f) => ok[f] ?? null, ['dist/index.html', 'firebase.json', 'dist/intruso.js'])).toEqual(['file non dichiarato: dist/intruso.js'])
  })

  it('dopo la personalizzazione si saltano solo i personalizzabili e configurazione.json; prima, mai', () => {
    const m = manifesto({ personalizzabili: ['dist/index.html'], file: { 'dist/index.html': H('1'), 'firebase.json': H('2') } })
    const dopo = { 'dist/index.html': H('7'), 'firebase.json': H('2'), 'dist/configurazione.json': H('8') }
    const suDisco = ['dist/index.html', 'firebase.json', 'dist/configurazione.json']
    expect(problemiDeiFile(m, (f) => dopo[f] ?? null, suDisco, { dopo: true })).toEqual([])
    expect(problemiDeiFile(m, (f) => dopo[f] ?? null, suDisco)).toEqual(['impronta diversa per dist/index.html', 'file non dichiarato: dist/configurazione.json'])
    expect(problemiDeiFile(m, (f) => ({ ...dopo, 'firebase.json': H('3') })[f] ?? null, suDisco, { dopo: true })).toEqual(['impronta diversa per firebase.json'])
  })

  it('la produzione riceve solo rilasci; il test anche le beta', () => {
    expect(versioneAmmessa('1.10.56-beta', 'produzione')).toBe(false)
    expect(versioneAmmessa('1.10.56-beta', 'test')).toBe(true)
    // Quando c'è il manifesto decide lui.
    expect(versioneAmmessa('1.11.0', 'produzione', { beta: true })).toBe(false)
    expect(versioneAmmessa('1.11.0', 'produzione')).toBe(true)
    expect(versioneAmmessa('1.11.0-beta.2', 'produzione')).toBe(false)
    expect(versioneAmmessa('1.11.0-beta.2', 'test')).toBe(true)
    expect(versioneAmmessa('main', 'test')).toBe(false)
  })

  it('il nome dell’archivio nel bucket è uno solo, per chi carica e per chi legge', () => {
    expect(nomeArchivio('locali', '1.11.0')).toBe('pacchetti/v1.11.0/pacchetto-locali-v1.11.0.tgz')
    expect(nomeArchivio('demo', '1.11.0-beta.1')).toBe('pacchetti/v1.11.0-beta.1/pacchetto-demo-v1.11.0-beta.1.tgz')
    expect(nomeImpronta('locali', '1.10.56-beta')).toBe('pacchetti/v1.10.56-beta/pacchetto-locali-v1.10.56-beta.tgz.sha256')
  })
})
