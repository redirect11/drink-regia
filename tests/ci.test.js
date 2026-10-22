'use strict'

// LE ACTIONS DELLA REGIA (REQ-DEV-002): un push non pubblica mai; un tag
// su un commit di main va in produzione con approvazione, tutto il resto
// va sul test. La regola vive nel job «Dove va» di firebase-hosting.yml e
// nella guardia di deploy.yml; un workflow non ha altri test, e un ritocco
// di buona volontà potrebbe mandare un ramo di lavoro in produzione senza
// che nessuno se ne accorga prima del deploy.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
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

  it('il vecchio ci.yml, che pubblicava da sé, non c’è più', () => {
    expect(existsSync(join(process.cwd(), '.github/workflows/ci.yml'))).toBe(false)
  })
})

describe('firebase-hosting.yml: pubblicano il tag e il lancio a mano', () => {
  it('parte solo da un tag o da workflow_dispatch', () => {
    const on = eventi(hosting)
    expect(Object.keys(on).sort()).toEqual(['push', 'workflow_dispatch'])
    expect(on.push).toEqual({ tags: ['**'] })
  })

  it('«Dove va»: su main è produzione, tutto il resto è test', () => {
    const scelta = hosting.jobs.destinazione.steps.find((s) => s.id === 'scelta').run
    expect(scelta).toMatch(/is-ancestor "\$GITHUB_SHA" origin\/main[\s\S]*ambiente=production/)
    expect(scelta).toMatch(/else\s+echo "ambiente=test"/)
    expect(scelta).not.toMatch(/develop|release|hotfix/)
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
