// LA SQUADRA DI STONEBIT (REQ-DEV-012). Dal messaggio del CEO-agente
// dell'11/11/2026: la sessione principale su questo repository è il Tech
// Lead di Lime SmartOrders e guida quattro sub-agenti. Chi sono e come
// lavorano sta in file che gli strumenti leggono da soli (CLAUDE.md,
// AGENTS.md, .claude/agents/): se uno sparisce o perde l'intestazione,
// l'agente non esiste più e nessuno se ne accorge. Questo test lo dice.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')

describe('la squadra di Stonebit', () => {
  it('CLAUDE.md apre con la sezione di Stonebit, e le regole del repository restano tutte sotto', () => {
    const regole = leggi('CLAUDE.md')
    const righe = regole.split('\n')
    expect(righe[0]).toMatch(/^# drink-regia/)
    expect(righe.find((r) => r.startsWith('## '))).toBe('## Stonebit — chi sei e come lavori qui')
    expect(regole).toContain('### Regola zero: decide Daniele')
    // Le regole di prima: nessuna tolta.
    for (const frase of ['docs/handover.md', '**GitFlow**', '**I test sono la specifica**', '**Non si scrive in produzione di propria iniziativa.**', 'non contiene mai i dati operativi dei locali']) {
      expect(regole, frase).toContain(frase)
    }
    expect(regole.indexOf('## Stonebit — chi sei')).toBeLessThan(regole.indexOf('**GitFlow**'))
  })

  it('AGENTS.md rimanda a CLAUDE.md e alla cartella della squadra', () => {
    const agenti = leggi('AGENTS.md')
    expect(agenti).toContain('`CLAUDE.md`')
    expect(agenti).toContain('`.claude/agents/`')
  })

  it.each(['frontend-developer', 'backend-developer', 'devops-flotta', 'revisore'])('%s ha il suo file, con nome e descrizione nell’intestazione', (nome) => {
    const agente = leggi(`.claude/agents/${nome}.md`)
    const intestazione = agente.match(/^---\n([\s\S]*?)\n---\n/)
    expect(intestazione).not.toBeNull()
    expect(intestazione[1]).toContain(`name: ${nome}`)
    expect(intestazione[1]).toMatch(/^description: .{20,}$/m)
    expect(agente).toContain('Stonebit')
  })

  it('i developer non fanno merge, tag né deploy; il revisore non scrive codice', () => {
    for (const nome of ['frontend-developer', 'backend-developer', 'devops-flotta']) {
      expect(leggi(`.claude/agents/${nome}.md`), nome).toContain('Non fai merge, tag, deploy')
    }
    expect(leggi('.claude/agents/revisore.md')).toContain('Non scrivi codice')
  })
})
