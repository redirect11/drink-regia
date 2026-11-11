// LA SQUADRA DI STONEBIT (REQ-DEV-012). Dal messaggio del CEO-agente
// dell'11/11/2026 (seconda versione, lo schema del progetto Planner): la
// sessione aperta su questo repository è il PM di Lime (regia) e passa il
// lavoro a un Tech Lead, a tre developer e a un revisore. Chi sono e come
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
    expect(regole).toContain('sei il **PM di Lime (regia)**')
    // Le issue nascono dal registro, mai a mano: è la regola del processo.
    expect(regole).toMatch(/Le issue nascono dal registro[^
]*\*\*mai a mano\*\*/)
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

  it.each(['pm', 'tech-lead', 'frontend-developer', 'backend-developer', 'devops-flotta', 'revisore'])('%s ha il suo file, con nome e descrizione nell’intestazione', (nome) => {
    const agente = leggi(`.claude/agents/${nome}.md`)
    const intestazione = agente.match(/^---\n([\s\S]*?)\n---\n/)
    expect(intestazione).not.toBeNull()
    expect(intestazione[1]).toContain(`name: ${nome}`)
    expect(intestazione[1]).toMatch(/^description: .{20,}$/m)
    expect(agente).toContain('Stonebit')
  })

  it('i developer e il Tech Lead non fanno merge, tag né deploy; il PM e il revisore non scrivono codice', () => {
    for (const nome of ['frontend-developer', 'backend-developer', 'devops-flotta']) {
      expect(leggi(`.claude/agents/${nome}.md`), nome).toContain('Non fai merge, tag, deploy')
    }
    expect(leggi('.claude/agents/tech-lead.md')).toContain('Mai merge, tag o deploy')
    expect(leggi('.claude/agents/pm.md')).toContain('non scrivi codice')
    expect(leggi('.claude/agents/revisore.md')).toContain('Non scrivi codice')
  })
})
