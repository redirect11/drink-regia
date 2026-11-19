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
    campiVenue: ['venue_name', 'venue_short_name', 'venue_description'],
    file: Object.fromEntries([...FILE_NECESSARI.locali, 'dist/manifest.webmanifest'].map((f) => [f, H('b')])),
    ...extra,
  })

  it('il contratto ha l’interfaccia 16, con chi compila e carica, dove, cosa c’è dentro e come si personalizza', () => {
    const doc = leggi(DOC)
    const sedici = doc.slice(doc.indexOf('### 16. Il pacchetto per versione'), doc.indexOf('## La sicurezza delle interfacce'))
    expect(sedici).toContain('REQ-FLOTTA-137')
    // Daniele, 18/11/2026: compila tana-drink e pubblica nella Release del
    // tag; i workflow della regia la scaricano, e la compilazione di oggi
    // resta come ripiego (REQ-FLOTTA-140). Niente bucket, niente accessi
    // di un repository nelle cose dell'altro.
    expect(sedici).toContain('REQ-FLOTTA-140')
    expect(sedici).toMatch(/node scripts\/crea-pacchetto\.mjs --tipo\s+locali\|demo/)
    expect(sedici).toContain('Release di GitHub del tag di tana-drink')
    expect(sedici).toContain('`pacchetto-<tipo>-vX.Y.Z.tgz`')
    expect(sedici).toContain('`provisiona-istanza.yml` e `aggiorna-istanza.yml`')
    expect(sedici).toMatch(/rifiuta un archivio diverso per la\s+stessa versione/)
    expect(sedici).not.toContain('`1259880473`')
    expect(sedici).not.toContain('rilasci@')
    expect(sedici).toContain('`pacchetto.json`')
    expect(sedici).toContain('personalizza.mjs')
    expect(sedici).toMatch(/Finché il\s+pacchetto\s+non\s+c'è,\s+vale\s+l'interfaccia\s+12,\s+che\s+resta\s+anche\s+dopo\s+come\s+ripiego\./)
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
    // campiVenue fa parte del formato 1: sempre, mai vuoto, solo chiavi venue_*.
    expect(problemiDelManifesto(manifesto({ campiVenue: ['venue_name', 'venue_legal_name'] }))).toEqual([])
    expect(problemiDelManifesto(manifesto({ campiVenue: undefined }))).toContain('campiVenue deve essere un elenco di chiavi venue_*')
    expect(problemiDelManifesto(manifesto({ campiVenue: ['venue_name', 'apiKey'] }))).toContain('campiVenue deve essere un elenco di chiavi venue_*')
    expect(problemiDelManifesto(manifesto({ campiVenue: [] }))).toContain('campiVenue deve essere un elenco di chiavi venue_*')
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

  // tana-drink, 19/11/2026: «nella Release il nome è quello semplice».
  it('il nome del file nella Release è quello semplice, uno solo per chi pubblica e chi scarica', async () => {
    const { indirizzoNellaRelease } = await import('../scripts/lib-pacchetto.js')
    expect(nomeArchivio('locali', '1.11.0')).toBe('pacchetto-locali-v1.11.0.tgz')
    expect(nomeArchivio('demo', '1.11.0-beta.1')).toBe('pacchetto-demo-v1.11.0-beta.1.tgz')
    expect(nomeImpronta('locali', '1.10.56-beta')).toBe('pacchetto-locali-v1.10.56-beta.tgz.sha256')
    expect(indirizzoNellaRelease(nomeArchivio('locali', '1.10.56-beta'), '1.10.56-beta')).toBe('https://github.com/redirect11/tana-drink/releases/download/v1.10.56-beta/pacchetto-locali-v1.10.56-beta.tgz')
  })
})

// IL PACCHETTO NEI WORKFLOW (REQ-FLOTTA-140): la strada, l'archivio
// scaricato, firebase.json, e il giro intero su disco.
describe('il pacchetto nei workflow della regia (REQ-FLOTTA-140)', async () => {
  const P = await import('../scripts/lib-pacchetto.js')
  const H = (c) => c.repeat(64)

  it('la strada: il pacchetto se la Release del tag lo ha, se no la compilazione; chi lancia può sceglierla', () => {
    const tag = { versione: '1.10.56-beta', cèPacchetto: true }
    expect(P.stradaDi(tag)).toEqual({ strada: 'pacchetto', perche: 'il pacchetto della Release v1.10.56-beta' })
    expect(P.stradaDi({ ...tag, cèPacchetto: false }).strada).toBe('compilazione')
    expect(P.stradaDi({ ...tag, versione: null }).perche).toBe('il ref non è un tag di versione')
    // La demo e i locali curati a mano (la Tana) restano sulla compilazione.
    expect(P.stradaDi({ ...tag, demo: true })).toEqual({ strada: 'compilazione', perche: 'la demo si compila ancora' })
    expect(P.stradaDi({ ...tag, esistente: true }).strada).toBe('compilazione')
    // Il ripiego chiesto (Daniele, 18/11/2026: «la regia puo far partire la
    // compilazione lo stesso se serve»).
    expect(P.stradaDi({ ...tag, richiesta: 'compilazione' })).toEqual({ strada: 'compilazione', perche: 'chiesta da chi ha lanciato' })
    // Il pacchetto chiesto e che non c'è: ci si ferma, non si compila di nascosto.
    expect(P.stradaDi({ ...tag, cèPacchetto: false, richiesta: 'pacchetto' }).strada).toBeNull()
    expect(P.stradaDi({ ...tag, richiesta: 'boh' }).strada).toBeNull()
  })

  it('la versione viene solo da un tag di versione', () => {
    expect(P.versioneDelTag('v1.10.56-beta')).toBe('1.10.56-beta')
    expect(P.versioneDelTag('v1.11.0')).toBe('1.11.0')
    expect(P.versioneDelTag('main')).toBeNull()
    expect(P.versioneDelTag('v1.11')).toBeNull()
    expect(P.versioneDelTag('1.11.0')).toBeNull()
  })

  // (C): l'impronta dichiarata e quella che la regia ricorda.
  it('l’archivio deve avere l’impronta dichiarata e, se la regia ne ricorda una, quella', () => {
    expect(P.improntaDalFile(`${H('a')}  pacchetto-locali-v1.11.0.tgz\n`)).toBe(H('a'))
    expect(P.improntaDalFile(H('a'))).toBe(H('a'))
    expect(P.improntaDalFile('niente')).toBeNull()
    expect(P.problemiDellArchivio({ dichiarata: H('a'), vera: H('a') })).toEqual([])
    expect(P.problemiDellArchivio({ dichiarata: H('a'), vera: H('a'), ricordata: H('a') })).toEqual([])
    expect(P.problemiDellArchivio({ dichiarata: null, vera: H('a') })[0]).toMatch(/non contiene/)
    expect(P.problemiDellArchivio({ dichiarata: H('a'), vera: H('b') })[0]).toMatch(/non ha l'impronta dichiarata/)
    // Una Release riscritta: l'impronta nuova torna col suo archivio, ma non
    // con quella del primo pacchetto usato.
    expect(P.problemiDellArchivio({ dichiarata: H('b'), vera: H('b'), ricordata: H('a') })[0]).toMatch(/una versione corretta è una versione nuova/)
  })

  it('firebase.json non deve far girare comandi al deploy', () => {
    expect(P.comandiInFirebaseJson({ hosting: { public: 'dist' }, functions: [{ source: 'functions' }] })).toEqual([])
    expect(P.comandiInFirebaseJson({ functions: [{ source: 'functions', predeploy: ['npm run build'] }], hosting: { postdeploy: 'x' } })).toEqual(['firebase.json.functions[0].predeploy', 'firebase.json.hosting.postdeploy'])
  })

  // Revisione della PR #345, punto 3: una lista di ammessi. Il firebase.json
  // di tana-drink al tag v1.10.56-beta ha queste sezioni, e passa.
  it('firebase.json: il sito è dist, le Functions sono functions, le regole i file del pacchetto, e niente altro', () => {
    const buono = { firestore: { rules: 'firestore.rules', indexes: 'firestore.indexes.json' }, storage: { rules: 'storage.rules' }, functions: [{ source: 'functions', codebase: 'default', ignore: ['node_modules'] }], hosting: { public: 'dist', ignore: [], rewrites: [{ source: '**', destination: '/index.html' }] }, emulators: { ui: { enabled: true } } }
    expect(P.problemiDiFirebaseJson(buono)).toEqual([])
    const con = (extra) => P.problemiDiFirebaseJson({ ...buono, ...extra })
    // Il sito o le Functions fuori dal pacchetto: il deploy pubblicherebbe il runner.
    expect(con({ hosting: { public: '/home/runner/work/_temp' } })).toEqual(['firebase.json: hosting.public deve essere «dist»'])
    expect(con({ hosting: [{ public: 'dist' }, { public: '../..' }] })).toEqual(['firebase.json: hosting.public deve essere «dist»'])
    expect(con({ functions: { source: '/tmp' } })).toEqual(['firebase.json: le Functions devono stare in «functions»'])
    expect(con({ hosting: { public: 'dist', source: '.' } })).toEqual(['firebase.json: hosting.source non è ammesso (compilerebbe al deploy)'])
    expect(con({ firestore: { rules: '../x.rules', indexes: 'firestore.indexes.json' } })).toEqual(['firebase.json: firestore.rules deve essere «firestore.rules»'])
    expect(con({ storage: { rules: '/etc/x' } })).toEqual(['firebase.json: storage.rules deve essere «storage.rules»'])
    expect(con({ remoteconfig: { template: 'x.json' } })).toEqual(['firebase.json: sezione «remoteconfig» non prevista'])
    expect(con({ functions: [{ source: 'functions', predeploy: ['x'] }] })[0]).toMatch(/predeploy: un comando al deploy/)
    expect(P.problemiDiFirebaseJson([])).toEqual(['firebase.json non è un oggetto'])
  })

  // Punto 5: la versione di firebase-tools che il job con le credenziali installa.
  it('firebase-tools si installa solo per numero di versione', () => {
    expect(P.versioneStrumentoValida('15.36.0')).toBe(true)
    expect(P.versioneStrumentoValida('npm:altro@1.0.0')).toBe(false)
    expect(P.versioneStrumentoValida('latest')).toBe(false)
    expect(P.versioneStrumentoValida('15.36.0\nX=1')).toBe(false)
  })

  // Punto 10: un pacchetto più vecchio può non conoscere un dato del titolare.
  it('i dati del titolare che il pacchetto non conosce restano fuori, senza fermare il lavoro', async () => {
    const L = await import('../scripts/lib-lavoro.js')
    expect(L.datiAmmessi({ venue_legal_name: 'X', venue_email: 'a@b.it' }, ['venue_name', 'venue_legal_name'])).toEqual({ ammessi: { venue_legal_name: 'X' }, scartati: ['venue_email'] })
    expect(L.datiAmmessi({ venue_legal_name: 'X' }, undefined)).toEqual({ ammessi: { venue_legal_name: 'X' }, scartati: [] })
  })

  // Punto 2: la configurazione che arriva nel sito è quella di questo locale.
  it('la configurazione nel sito deve tornare con quella che la regia ricalcola', async () => {
    const L = await import('../scripts/lib-lavoro.js')
    const attesa = L.configurazioneLocale({ slug: 'prova-bar', nome: 'Prova Bar', profilo: 'completo', ambiente: 'test', firebase: { apiKey: 'k', authDomain: 'd', projectId: 'drinkpos-prova-bar', storageBucket: '', messagingSenderId: '', appId: 'a' } })
    expect(L.problemiDellaConfigurazione(structuredClone(attesa), attesa)).toEqual([])
    // Il resto del venue può cambiare (personalizza.mjs lo normalizza).
    expect(L.problemiDellaConfigurazione({ ...attesa, venue: { venue_name: 'Prova Bar', venue_description: 'altro' } }, attesa)).toEqual([])
    expect(L.problemiDellaConfigurazione({ ...attesa, regia: 'drink-regia' }, attesa)).toEqual(['regia'])
    expect(L.problemiDellaConfigurazione({ ...attesa, firebase: { ...attesa.firebase, projectId: 'altro' } }, attesa)).toEqual(['firebase.projectId'])
    expect(L.problemiDellaConfigurazione(null, attesa)).toContain('locale')
  })

  // Punto 8: solo un 404 vuol dire «non c'è»; un altro errore ferma il lavoro.
  it('la Release: 404 vuol dire senza pacchetto, un altro errore ferma il lavoro', async () => {
    const D = await import('../scripts/pacchetto-su-disco.mjs')
    const risponde = (status) => async () => ({ ok: status < 300, status })
    expect(await D.cèNellaRelease({ tipo: 'locali', versione: '1.10.56-beta', fetchFn: risponde(200) })).toBe(true)
    expect(await D.cèNellaRelease({ tipo: 'locali', versione: '1.10.56-beta', fetchFn: risponde(404) })).toBe(false)
    await expect(D.cèNellaRelease({ tipo: 'locali', versione: '1.10.56-beta', fetchFn: risponde(403) })).rejects.toThrow(/ha risposto 403/)
    await expect(D.cèNellaRelease({ tipo: 'locali', versione: '1.10.56-beta', fetchFn: risponde(503) })).rejects.toThrow(/non si sa se il pacchetto c'è/)
  })

  // IL GIRO INTERO, con un archivio vero e una Release finta: tar GNU
  // (quello dei runner di GitHub); su Windows il tar di sistema scrive
  // l'elenco in un'altra forma, e il giro si prova in CI.
  it.skipIf(process.platform === 'win32')('su disco: scarica, controlla, personalizza con un ambiente vuoto e ricontrolla', async () => {
    const { spawnSync } = await import('node:child_process')
    const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join, dirname } = await import('node:path')
    const { createHash } = await import('node:crypto')
    const D = await import('../scripts/pacchetto-su-disco.mjs')
    const sha = (b) => createHash('sha256').update(b).digest('hex')
    const PERSONALIZZA = [
      "import { readFileSync, writeFileSync } from 'node:fs'",
      'const a = process.argv',
      "const conf = readFileSync(a[a.indexOf('--configurazione') + 1], 'utf8')",
      "const dist = a[a.indexOf('--dist') + 1]",
      "writeFileSync(dist + '/configurazione.json', conf)",
      "writeFileSync(dist + '/index.html', '<html>' + JSON.parse(conf).venue.venue_name + (process.env.SEGRETO_DI_PROVA || '') + '</html>')",
    ].join('\n')
    const COMMIT = 'c'.repeat(40)
    function costruisci(radice, { firebaseJson = '{}', extra = {}, manifesto = {} } = {}) {
      const file = {
        'firebase.json': firebaseJson, 'firestore.rules': 'r', 'firestore.indexes.json': '{}', 'storage.rules': 's',
        'dist/index.html': '<html>%VENUE_NAME%</html>', 'dist/manifest.webmanifest': '{}',
        'functions/package.json': '{}', 'functions/package-lock.json': '{}', 'personalizza.mjs': PERSONALIZZA,
      }
      const cartella = join(radice, 'sorgente')
      for (const [f, c] of Object.entries({ ...file, ...extra })) {
        mkdirSync(dirname(join(cartella, f)), { recursive: true })
        writeFileSync(join(cartella, f), c)
      }
      const m = {
        formato: 1, tipo: 'locali', versione: '1.10.56-beta', tag: 'v1.10.56-beta', beta: true, commit: COMMIT,
        strumenti: { node: '22', 'firebase-tools': '15.36.0' }, personalizzabili: ['dist/index.html', 'dist/manifest.webmanifest'],
        creato_il: '2026-11-18T23:15:10Z', profili: ['completo', 'leggero'], campiVenue: ['venue_name', 'venue_short_name', 'venue_description', 'venue_legal_name'],
        file: Object.fromEntries(Object.entries(file).map(([f, c]) => [f, sha(c)])), ...manifesto,
      }
      writeFileSync(join(cartella, 'pacchetto.json'), JSON.stringify(m))
      const archivio = join(radice, 'pacchetto.tgz')
      const r = spawnSync('tar', ['-czf', archivio, '-C', cartella, '.'])
      expect(r.status).toBe(0)
      return readFileSync(archivio)
    }
    // La Release finta: risponde ai due indirizzi del tag, 404 al resto.
    const release = (archivio, impronta = sha(archivio)) => async (url, opz) => {
      const nome = url.split('/').pop()
      const corpo = nome === 'pacchetto-locali-v1.10.56-beta.tgz' ? archivio : nome === 'pacchetto-locali-v1.10.56-beta.tgz.sha256' ? Buffer.from(`${impronta}  ${nome}\n`) : null
      expect(url.startsWith('https://github.com/redirect11/tana-drink/releases/download/v1.10.56-beta/')).toBe(true)
      if (!corpo) return { ok: false, status: 404 }
      return { ok: true, status: 200, arrayBuffer: async () => (opz?.method === 'HEAD' ? new ArrayBuffer(0) : corpo) }
    }
    const conf = { backend: 'firebase', locale: 'prova-bar', firebase: { apiKey: 'k', authDomain: 'd', projectId: 'drinkpos-prova-bar', appId: 'a' }, venue: { venue_name: 'Prova Bar' }, profilo: 'completo', regia: 'drink-regia-test' }

    // Il giro buono.
    const t = mkdtempSync(join(tmpdir(), 'pacchetto-'))
    const archivio = costruisci(t)
    const fetchFn = release(archivio)
    expect(await D.cèNellaRelease({ tipo: 'locali', versione: '1.10.56-beta', fetchFn })).toBe(true)
    expect(await D.cèNellaRelease({ tipo: 'locali', versione: '1.10.57-beta', fetchFn: async () => ({ ok: false, status: 404 }) })).toBe(false)
    const giu = await D.scaricaDallaRelease({ tipo: 'locali', versione: '1.10.56-beta', cartella: join(t, 'scarico'), fetchFn })
    expect(giu.impronta).toBe(sha(archivio))
    const aperto = D.apriPacchetto({ archivio: giu.archivio, cartella: join(t, 'app'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test', commit: COMMIT })
    expect(aperto.manifesto.commit).toBe(COMMIT)
    process.env.SEGRETO_DI_PROVA = 'NON-DEVE-ARRIVARE'
    try {
      D.personalizzaPacchetto({ cartella: aperto.cartella, manifesto: aperto.manifesto, configurazione: conf, tmp: join(t, 'tmp') })
    } finally {
      delete process.env.SEGRETO_DI_PROVA
    }
    // Personalizzato, e senza vedere l'ambiente di chi lo lancia.
    expect(readFileSync(join(t, 'app/dist/index.html'), 'utf8')).toBe('<html>Prova Bar</html>')
    expect(JSON.parse(readFileSync(join(t, 'app/dist/configurazione.json'), 'utf8')).locale).toBe('prova-bar')

    const rifiuta = async (fn, motivo) => { await expect(fn()).rejects.toThrow(motivo) }
    // In produzione una beta no; un commit diverso da quello del tag no.
    const t2 = mkdtempSync(join(tmpdir(), 'pacchetto-'))
    writeFileSync(join(t2, 'p.tgz'), archivio)
    await rifiuta(async () => D.apriPacchetto({ archivio: join(t2, 'p.tgz'), cartella: join(t2, 'a'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'produzione' }), /non si dà a un locale di produzione/)
    await rifiuta(async () => D.apriPacchetto({ archivio: join(t2, 'p.tgz'), cartella: join(t2, 'b'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test', commit: 'd'.repeat(40) }), /il tag v1\.10\.56-beta è su d{40}/)
    // Un archivio diverso da quello ricordato, anche se la Release è coerente.
    await rifiuta(() => D.scaricaDallaRelease({ tipo: 'locali', versione: '1.10.56-beta', cartella: join(t2, 's1'), fetchFn, ricordata: H('e') }), /versione corretta è una versione nuova/)
    // L'impronta dichiarata che non torna.
    await rifiuta(() => D.scaricaDallaRelease({ tipo: 'locali', versione: '1.10.56-beta', cartella: join(t2, 's2'), fetchFn: release(archivio, H('f')) }), /non ha l'impronta dichiarata/)
    // La Release senza pacchetto.
    await rifiuta(() => D.scaricaDallaRelease({ tipo: 'locali', versione: '1.10.56-beta', cartella: join(t2, 's3'), fetchFn: async () => ({ ok: false, status: 404 }) }), /non c'è \(o non è completo\)/)
    // Un file in più non dichiarato; un firebase.json con un predeploy.
    const t3 = mkdtempSync(join(tmpdir(), 'pacchetto-'))
    writeFileSync(join(t3, 'p.tgz'), costruisci(join(t3, 'x'), { extra: { 'functions/intruso.js': 'x' } }))
    await rifiuta(async () => D.apriPacchetto({ archivio: join(t3, 'p.tgz'), cartella: join(t3, 'a'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test' }), /file non dichiarato: functions\/intruso\.js/)
    const t4 = mkdtempSync(join(tmpdir(), 'pacchetto-'))
    writeFileSync(join(t4, 'p.tgz'), costruisci(join(t4, 'x'), { firebaseJson: JSON.stringify({ functions: [{ source: 'functions', predeploy: ['npm run build'] }] }) }))
    await rifiuta(async () => D.apriPacchetto({ archivio: join(t4, 'p.tgz'), cartella: join(t4, 'a'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test' }), /un comando al deploy girerebbe dove ci sono le credenziali/)
    const t5 = mkdtempSync(join(tmpdir(), 'pacchetto-'))
    writeFileSync(join(t5, 'p.tgz'), costruisci(join(t5, 'x'), { firebaseJson: JSON.stringify({ hosting: { public: '/home/runner/work/_temp' } }) }))
    await rifiuta(async () => D.apriPacchetto({ archivio: join(t5, 'p.tgz'), cartella: join(t5, 'a'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test' }), /hosting\.public deve essere «dist»/)
    expect(existsSync(join(t, 'app/functions/.env.drinkpos-prova-bar'))).toBe(false)

    // IL RICONTROLLO NEL JOB CHE PUBBLICA (revisione della PR #345, punto 2):
    // l'app personalizzata, impacchettata come fa il job `pacchetto`.
    const { symlinkSync, rmSync: rm } = await import('node:fs')
    const riferimento = D.apriPacchetto({ archivio: giu.archivio, cartella: join(t, 'riferimento'), tipo: 'locali', versione: '1.10.56-beta', ambiente: 'test' })
    const impacchetta = (dir, nome) => {
      const r = spawnSync('tar', ['-czf', nome, '-C', dir, 'app'])
      expect(r.status).toBe(0)
      return nome
    }
    const buona = impacchetta(t, join(t, 'app-buona.tgz'))
    const ok = D.riverificaApp({ archivioApp: buona, cartella: join(t, 'ricevuta-1'), riferimento, progetto: 'drinkpos-prova-bar' })
    expect(ok.configurazione.locale).toBe('prova-bar')
    // Un .env arrivato dal job è ammesso (lo si riscrive), un altro file no.
    writeFileSync(join(t, 'app/functions/.env.drinkpos-prova-bar'), 'X=1')
    expect(() => D.riverificaApp({ archivioApp: impacchetta(t, join(t, 'app-env.tgz')), cartella: join(t, 'ricevuta-2'), riferimento, progetto: 'drinkpos-prova-bar' })).not.toThrow()
    writeFileSync(join(t, 'app/functions/altro.js'), 'x')
    expect(() => D.riverificaApp({ archivioApp: impacchetta(t, join(t, 'app-altro.tgz')), cartella: join(t, 'ricevuta-3'), riferimento, progetto: 'drinkpos-prova-bar' })).toThrow(/file non del pacchetto: functions\/altro\.js/)
    rm(join(t, 'app/functions/altro.js'))
    // firebase.json cambiato dopo il controllo (un processo rimasto acceso).
    const fj = readFileSync(join(t, 'app/firebase.json'), 'utf8')
    writeFileSync(join(t, 'app/firebase.json'), JSON.stringify({ functions: [{ source: 'functions', predeploy: ['x'] }] }))
    expect(() => D.riverificaApp({ archivioApp: impacchetta(t, join(t, 'app-fj.tgz')), cartella: join(t, 'ricevuta-4'), riferimento, progetto: 'drinkpos-prova-bar' })).toThrow(/firebase\.json non è quello del pacchetto/)
    writeFileSync(join(t, 'app/firebase.json'), fj)
    // Un collegamento al posto di configurazione.json, verso un file del runner.
    rm(join(t, 'app/dist/configurazione.json'))
    symlinkSync('/etc/hostname', join(t, 'app/dist/configurazione.json'))
    expect(() => D.riverificaApp({ archivioApp: impacchetta(t, join(t, 'app-link.tgz')), cartella: join(t, 'ricevuta-5'), riferimento, progetto: 'drinkpos-prova-bar' })).toThrow(/voce non ammessa/)
  })

  // Il primo giro su drinkpos-prova-bar (19/11/2026): nel pacchetto non c'è
  // node_modules/.bin, e firebase-tools non trovava firebase-functions.
  it.skipIf(process.platform === 'win32')('chi pubblica ricrea solo l’eseguibile di firebase-functions, dentro la sua cartella', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, readlinkSync, statSync, existsSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const D = await import('../scripts/pacchetto-su-disco.mjs')
    const app = (pj, file = 'lib/bin/firebase-functions.js') => {
      const a = mkdtempSync(join(tmpdir(), 'app-'))
      const m = join(a, 'functions/node_modules/firebase-functions')
      mkdirSync(join(m, 'lib/bin'), { recursive: true })
      writeFileSync(join(m, 'package.json'), JSON.stringify(pj))
      if (file) writeFileSync(join(m, file), '#!/usr/bin/env node')
      return a
    }
    const a = app({ name: 'firebase-functions', bin: { 'firebase-functions': 'lib/bin/firebase-functions.js' } })
    expect(D.collegaEseguibileFunctions(a)).toBe('../firebase-functions/lib/bin/firebase-functions.js')
    expect(readlinkSync(join(a, 'functions/node_modules/.bin/firebase-functions'))).toBe('../firebase-functions/lib/bin/firebase-functions.js')
    expect(statSync(join(a, 'functions/node_modules/firebase-functions/lib/bin/firebase-functions.js')).mode & 0o111).toBeTruthy()
    // Un eseguibile fuori dalla cartella del modulo, o che non c'è: no.
    expect(() => D.collegaEseguibileFunctions(app({ bin: { 'firebase-functions': '../../../../sa.json' } }))).toThrow(/dentro la sua cartella/)
    expect(() => D.collegaEseguibileFunctions(app({ bin: '/etc/passwd' }))).toThrow(/dentro la sua cartella/)
    expect(() => D.collegaEseguibileFunctions(app({ bin: { 'firebase-functions': 'lib/bin/firebase-functions.js' } }, null))).toThrow(/manca l'eseguibile/)
    // Il profilo leggero non ha firebase-functions: niente da fare.
    const vuota = mkdtempSync(join(tmpdir(), 'app-'))
    expect(D.collegaEseguibileFunctions(vuota)).toBeNull()
    expect(existsSync(join(vuota, 'functions/node_modules/.bin'))).toBe(false)
  })
})
