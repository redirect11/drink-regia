'use strict'

// LE ISSUE NASCONO DAL REGISTRO (REQ-DEV-003): scripts/generate-issues.mjs
// legge requirements.yaml e bugs.yaml e apre, riallinea o chiude le issue
// su GitHub; la bacheca (il project «drink-regia», n. 5) segue. La
// libreria è quella di tana-drink; qui si prova che legga il registro
// della regia e che le regole del giro siano quelle.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseRequirementsYaml,
  STATI_CHIUSI,
  STATI_FATTI,
  STATI_SCARTATI,
  deveNascere,
  prossimoStato,
  indicizzaPerId,
  riconciliaEtichette,
  COLONNE,
} from '../scripts/lib-requisiti.mjs'

const registro = parseRequirementsYaml(readFileSync(join(process.cwd(), 'requirements/requirements.yaml'), 'utf8'))

describe('il registro della regia si legge', () => {
  it('ogni voce ha id, titolo, area, descrizione, stato e test', () => {
    expect(registro.length).toBeGreaterThan(5)
    for (const r of registro) {
      expect(r.id).toMatch(/^REQ-[A-Z0-9-]+$/)
      expect(r.title.length, r.id).toBeGreaterThan(5)
      expect(r.area.length, r.id).toBeGreaterThan(3)
      expect(r.description.length, r.id).toBeGreaterThan(40)
      expect(['implemented', 'partial', 'todo', 'deprecated'], r.id).toContain(r.status)
      expect(r.test_cases.length, r.id).toBeGreaterThan(0)
    }
  })

  it('gli identificativi non si ripetono', () => {
    const visti = new Set()
    expect(registro.map((r) => r.id).filter((id) => visti.size === visti.add(id).size)).toEqual([])
  })
})

describe('il giro delle issue', () => {
  it('una voce scartata chiude l’issue come una fatta, ma resta una famiglia a parte', () => {
    for (const stato of ['deprecated', 'wontfix']) {
      expect(STATI_SCARTATI.has(stato)).toBe(true)
      expect(STATI_CHIUSI.has(stato)).toBe(true)
      expect(STATI_FATTI.has(stato)).toBe(false)
    }
    for (const stato of ['fixed', 'implemented', 'done']) expect(STATI_FATTI.has(stato)).toBe(true)
  })

  it('un’issue nuova nasce solo per quello che c’è ancora da fare', () => {
    expect(deveNascere({ status: 'todo', generate_issue: true }, false)).toBe(true)
    expect(deveNascere({ status: 'todo', generate_issue: true }, true)).toBe(false)
    expect(deveNascere({ status: 'implemented', generate_issue: true }, false)).toBe(false)
    expect(deveNascere({ status: 'wontfix', generate_issue: true }, false)).toBe(false)
  })

  it('sulla bacheca si va avanti, mai indietro', () => {
    expect(COLONNE).toEqual(expect.arrayContaining(['Implemented', 'In test', 'Done']))
    expect(prossimoStato('Backlog', 'Implemented')).toBe('Implemented')
    expect(prossimoStato('In test', 'Implemented')).toBeNull()
    expect(prossimoStato('Done', 'In test')).toBeNull()
    expect(prossimoStato(null, 'Done')).toBe('Done')
  })

  it('fra due issue con lo stesso id vince quella aperta, poi la più vecchia', () => {
    const avvisi = []
    const per = indicizzaPerId(
      [
        { number: 5, title: '[REQ-X-001] a', state: 'closed' },
        { number: 9, title: '[REQ-X-001] a', state: 'open' },
        { number: 2, title: 'senza id', state: 'open' },
      ],
      (m) => avvisi.push(m)
    )
    expect(per.get('REQ-X-001').number).toBe(9)
    expect(avvisi).toHaveLength(1)
  })

  it('le etichette della classificazione si riallineano, quelle messe a mano restano', () => {
    const { daAggiungere, daTogliere, finali } = riconciliaEtichette(['regia', 'P2'], {
      labels: ['regia'],
      priority: 'P1',
      source_file: 'requirements/requirements.yaml',
    })
    expect(daAggiungere).toEqual(['requirements', 'P1'])
    expect(daTogliere).toEqual(['P2'])
    expect(finali).toEqual(['regia', 'requirements', 'P1'])
  })
})

// I RAMI CHE FANNO NASCERE LE ISSUE (REQ-DEV-003). Dal 12/11/2026 ogni
// lavoro ha il suo ramo, staccato da develop: feature/, fix/, hotfix/
// (docs/handover.md, «I rami»). Su ognuno la voce «da fare» deve avere la
// sua issue prima del codice: il 12/11 su un ramo fix/ non nasceva.
describe('generate-issues.yml: parte su tutti i rami di lavoro', () => {
  it('feature/, fix/, hotfix/, release/, più develop e main, quando cambia il registro', async () => {
    const { load } = await import('js-yaml')
    const { readFileSync } = await import('node:fs')
    const w = load(readFileSync('.github/workflows/generate-issues.yml', 'utf8'))
    const push = w.on.push
    for (const ramo of ['main', 'develop', 'feature/**', 'fix/**', 'hotfix/**', 'release/**']) expect(push.branches).toContain(ramo)
    expect(push.paths).toEqual(['requirements/requirements.yaml', 'requirements/bugs.yaml'])
  })
})

// LE ISSUE A POSTERIORI (REQ-DEV-015). Dal 07/11 all'11/11/2026 ventisei
// voci sono nate già fatte, e la loro issue non è mai nata. Daniele,
// 12/11/2026: «si», farle nascere. Il registro lo chiede voce per voce.
describe('le issue a posteriori', () => {
  const fatta = { status: 'implemented', generate_issue: true, issue_a_posteriori: true }
  it('una voce fatta col segno, senza issue, ne fa nascere una', () => {
    expect(deveNascere(fatta, false)).toBe(true)
    expect(deveNascere({ ...fatta, status: 'fixed' }, false)).toBe(true)
  })
  it('se l’issue c’è già, o la voce è scartata, o manca il segno o generate_issue, no', () => {
    expect(deveNascere(fatta, true)).toBe(false)
    expect(deveNascere({ ...fatta, status: 'wontfix' }, false)).toBe(false)
    expect(deveNascere({ ...fatta, status: 'deprecated' }, false)).toBe(false)
    expect(deveNascere({ ...fatta, issue_a_posteriori: false }, false)).toBe(false)
    expect(deveNascere({ ...fatta, generate_issue: false }, false)).toBe(false)
  })
  it('il registro legge il segno, e lo porta su voci fatte soltanto', () => {
    const segnate = registro.filter((r) => r.issue_a_posteriori)
    expect(segnate.length).toBeGreaterThan(0)
    for (const r of segnate) {
      expect(STATI_FATTI.has(r.status), r.id).toBe(true)
      expect(r.generate_issue, r.id).toBe(true)
    }
  })
  it('l’issue nata a posteriori ha l’etichetta e lo dice nel testo', async () => {
    const { etichetteAPosteriori, rigaAPosteriori } = await import('../scripts/lib-requisiti.mjs')
    expect(etichetteAPosteriori(fatta)).toEqual(['a-posteriori'])
    expect(etichetteAPosteriori({ ...fatta, issue_a_posteriori: false })).toEqual([])
    expect(rigaAPosteriori(fatta)).toMatch(/a posteriori/)
    expect(rigaAPosteriori({ status: 'todo' })).toBe('')
  })
})
