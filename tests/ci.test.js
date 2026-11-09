'use strict'

// LE ACTIONS DELLA REGIA (REQ-DEV-002): un push non pubblica mai; un tag
// su un commit di main va in produzione con approvazione, tutto il resto
// va sul test. La regola vive nel job «Dove va» di firebase-hosting.yml e
// nella guardia di deploy.yml; un workflow non ha altri test, e un ritocco
// di buona volontà potrebbe mandare un ramo di lavoro in produzione senza
// che nessuno se ne accorga prima del deploy.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, relative, sep } from 'node:path'
import { load } from 'js-yaml'

const leggi = (nome) => readFileSync(join(process.cwd(), '.github/workflows', nome), 'utf8')
// `on` in YAML 1.1 è un booleano: js-yaml lo legge come chiave `true`.
const eventi = (w) => w.on ?? w[true]
const hosting = load(leggi('firebase-hosting.yml'))
const deploy = load(leggi('deploy.yml'))
const test = load(leggi('test.yml'))

describe('test.yml: i test a ogni push, mai un deploy', () => {
  it('gira su tutti i rami tranne release/**, e sulle PR verso develop e main', () => {
    expect(eventi(test).push.branches).toEqual(['**', '!release/**'])
    expect(eventi(test).pull_request.branches).toEqual(['develop', 'main'])
  })

  it('fa lint, test e build; la coverage solo sulle pull request', () => {
    const passi = test.jobs.test.steps.map((s) => s.run || s.name || s.uses)
    expect(passi).toEqual(expect.arrayContaining(['npm run lint', 'npm test', 'npm run build']))
    const coverage = test.jobs.test.steps.find((s) => s.run === 'npm run test:coverage')
    expect(coverage.if).toBe("github.event_name == 'pull_request'")
    expect(JSON.stringify(test.jobs)).not.toMatch(/firebase-tools deploy|deploy\.yml/)
  })

  // Le regole Firestore sull'emulatore (REQ-DEV-007): un job a parte, con
  // Java, sulle pull request e a mano; lint, test e build non lo aspettano.
  it('prova le regole Firestore sull’emulatore, in un job a parte con Java 21, sulle pull request', () => {
    const regole = test.jobs.regole
    expect(regole.if).toBe("github.event_name == 'pull_request' || github.event_name == 'workflow_dispatch'")
    const java = regole.steps.find((s) => /actions\/setup-java@/.test(s.uses || ''))
    expect(java.with).toMatchObject({ distribution: 'temurin', 'java-version': 21 })
    expect(regole.steps.map((s) => s.run)).toEqual(expect.arrayContaining(['npm ci', 'npm run test:regole']))
    // L'emulatore si tiene in cache fra una PR e l'altra.
    const cache = regole.steps.find((s) => /actions\/cache@/.test(s.uses || ''))
    expect(cache.with.path).toBe('~/.cache/firebase/emulators')
  })

  it('il vecchio ci.yml, che pubblicava da sé, non c’è più', () => {
    expect(existsSync(join(process.cwd(), '.github/workflows/ci.yml'))).toBe(false)
  })
})

// Decisione dell'utente del 30/10/2026: il test segue develop, in
// produzione va solo il tag su main.
describe('firebase-hosting.yml: develop va sul test, il tag su main in produzione', () => {
  it('parte da un push su develop, da un tag o da workflow_dispatch', () => {
    const on = eventi(hosting)
    expect(Object.keys(on).sort()).toEqual(['push', 'workflow_dispatch'])
    expect(on.push).toEqual({ branches: ['develop'], tags: ['**'] })
  })

  it('«Dove va»: solo un tag su main è produzione; un tag fuori da main si ferma; un ramo va sul test', () => {
    const scelta = hosting.jobs.destinazione.steps.find((s) => s.id === 'scelta').run
    expect(scelta).toMatch(/if \[ "\$GITHUB_REF_TYPE" = "tag" \]; then[\s\S]*is-ancestor "\$GITHUB_SHA" origin\/main[\s\S]*ambiente=production/)
    const ultimoElse = scelta.lastIndexOf('else')
    // Il tag fuori da main non pubblica da nessuna parte.
    const tagFuori = scelta.slice(scelta.indexOf('ambiente=production'), ultimoElse)
    expect(tagFuori).toMatch(/exit 1/)
    expect(tagFuori).not.toMatch(/ambiente=test/)
    // Un ramo (develop, o un lancio a mano) va sul test, mai in produzione.
    expect(scelta.slice(ultimoElse)).toMatch(/echo "ambiente=test"/)
    expect(scelta.slice(ultimoElse)).not.toMatch(/production/)
  })

  it('il test va su drink-regia-test, la produzione su drink-regia, tutti e due col deploy riusabile', () => {
    const { prova, produzione } = hosting.jobs
    expect(prova.if).toBe("needs.destinazione.outputs.ambiente == 'test'")
    expect(prova.with).toMatchObject({ ambiente: 'test', progetto: 'drink-regia-test' })
    expect(produzione.if).toBe("needs.destinazione.outputs.ambiente == 'production'")
    expect(produzione.with).toMatchObject({ ambiente: 'production', progetto: 'drink-regia' })
    for (const j of [prova, produzione]) {
      expect(j.uses).toBe('./.github/workflows/deploy.yml')
      expect(j.needs).toBe('destinazione')
    }
  })
})

describe('deploy.yml: l’environment scritto a chiare lettere e la guardia sul progetto', () => {
  it('è un workflow riusabile con ambiente e progetto obbligatori', () => {
    const inputs = eventi(deploy).workflow_call.inputs
    expect(inputs.ambiente.required).toBe(true)
    expect(inputs.progetto.required).toBe(true)
  })

  it('il job usa l’environment che gli si passa: è quello che fa scattare l’approvazione', () => {
    expect(deploy.jobs.deploy.environment).toBe('${{ inputs.ambiente }}')
    expect(deploy.jobs.deploy.env.TARGET_PROJECT).toBe('${{ inputs.progetto }}')
  })

  it('con i segreti del progetto sbagliato si ferma, e pubblica solo sul progetto di destinazione', () => {
    const passi = deploy.jobs.deploy.steps
    const guardia = passi.find((s) => s.name === 'Guardia ambiente').run
    expect(guardia).toMatch(/"\$VITE_FIREBASE_PROJECT_ID" != "\$TARGET_PROJECT"[\s\S]*exit 1/)
    const pubblica = passi.find((s) => /firebase-tools deploy/.test(s.run || '')).run
    expect(pubblica).toMatch(/--project "\$TARGET_PROJECT"/)
    expect(pubblica).not.toMatch(/drink-regia/)
    const build = passi.find((s) => s.name === 'Build')
    expect(build.env.VITE_APP_ENV).toMatch(/production.*'test'/)
  })
})

// LA CATENA (REQ-DEV-006, audit del 09/11/2026, finding 23): un'action a
// tag mobile (`@v4`) corre dietro a chi controlla quel tag; con le chiavi
// di deploy e della flotta in gioco, una compromissione a monte le porta
// via. Ogni action è ferma a un commit, con la versione nel commento per
// chi legge; Dependabot sposta lo SHA e il commento insieme.
describe('ogni action è ferma a un commit, non a un tag', () => {
  const cartella = join(process.cwd(), '.github/workflows')
  const workflow = readdirSync(cartella).filter((f) => f.endsWith('.yml'))

  it.each(workflow)('%s: ogni `uses:` ha uno SHA di 40 caratteri e la versione nel commento', (nome) => {
    const righe = leggi(nome)
      .split('\n')
      .filter((r) => /^\s*(- )?uses:/.test(r))
      // I workflow riusabili del repository stesso si chiamano per percorso.
      .filter((r) => !/uses:\s*\.\//.test(r))
    expect(righe.length).toBeGreaterThan(0)
    for (const r of righe) {
      expect(r.trim()).toMatch(/^(- )?uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+(\.\d+)*$/)
    }
  })

  it('Dependabot tiene d’occhio npm (sito e Functions) e le action, verso develop', () => {
    const dependabot = load(readFileSync(join(process.cwd(), '.github/dependabot.yml'), 'utf8'))
    const ecosistemi = dependabot.updates.map((u) => `${u['package-ecosystem']}:${u.directory}`).sort()
    expect(ecosistemi).toEqual(['github-actions:/', 'npm:/', 'npm:/functions'])
    for (const u of dependabot.updates) {
      expect(u['target-branch']).toBe('develop')
      expect(u.schedule.interval).toBe('weekly')
      expect(u['open-pull-requests-limit']).toBe(5)
      expect(u['commit-message'].prefix).toMatch(/^chore\((deps|ci)\)$/)
    }
  })

  // Le dipendenze di runtime con una falla alta o critica fermano la CI;
  // quelle di sviluppo (vite, vitest, happy-dom) non arrivano sul sito e
  // si aggiornano nel loro ramo.
  it('test.yml fa `npm audit` sulle dipendenze di produzione, in radice e nelle Functions', () => {
    const audit = test.jobs.test.steps.filter((s) => /npm audit --omit=dev --audit-level=high/.test(s.run || ''))
    expect(audit).toHaveLength(2)
    expect(audit.some((s) => s['working-directory'] === 'functions')).toBe(true)
  })
})

// Firebase carica solo la cartella functions/: un require che ne esce
// funziona nei test e sul server non trova il file, e nessuna Function si
// avvia (il primo deploy sul test, 29/10/2026, con «../../piani.json»).
describe('le Functions pubblicate hanno tutto quello che leggono', () => {
  const FUNCTIONS = resolve(process.cwd(), 'functions')
  const sorgenti = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.name === 'node_modules' ? [] : e.isDirectory() ? sorgenti(join(dir, e.name)) : e.name.endsWith('.js') ? [join(dir, e.name)] : [],
    )

  it('nessun require di functions/ esce da functions/', () => {
    const fuori = sorgenti(FUNCTIONS).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/require\('(\.[^']*)'\)/g)]
        .map((m) => m[1])
        .filter((spec) => !resolve(dirname(f), spec).startsWith(FUNCTIONS + sep))
        .map((spec) => `${relative(FUNCTIONS, f)}: ${spec}`),
    )
    expect(fuori).toEqual([])
  })

  // Una copia fatta dal predeploy non arriva nel pacchetto (provato il
  // 29/10/2026): il listino vive dentro functions/, e il sito lo legge da lì.
  it('il listino è uno solo, functions/piani.json, e il sito legge quello', () => {
    expect(existsSync(join(process.cwd(), 'functions', 'piani.json'))).toBe(true)
    expect(existsSync(join(process.cwd(), 'piani.json'))).toBe(false)
    for (const f of ['src/lib/piani.js', 'src/lib/ai.js']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).toContain("from '../../functions/piani.json'")
    }
  })
})
