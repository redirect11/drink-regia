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
// I fine riga cambiano col sistema (git su Windows li riscrive): si leggono
// sempre come \n, così i controlli valgono uguali qui e sulla CI.
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8').replace(/\r\n/g, '\n')

describe('la squadra di Stonebit', () => {
  // Terza versione del messaggio (12/11/2026): la sezione viene dopo il
  // titolo e la presentazione del repository, prima delle sue regole; e
  // dove contraddice le regole del repository, valgono quelle (Daniele,
  // 11/11/2026: «continua come hai sempre fatto»).
  it('CLAUDE.md: titolo, presentazione del repository, la sezione di Stonebit, poi le regole del repository', () => {
    const regole = leggi('CLAUDE.md')
    const righe = regole.split('\n')
    expect(righe[0]).toMatch(/^# drink-regia/)
    // La presentazione sta prima di ogni sezione.
    const primaSezione = regole.indexOf('\n## ')
    expect(regole.slice(0, primaSezione)).toContain('Il sito del prodotto:')
    expect(righe.filter((r) => r.startsWith('## '))).toEqual(['## Stonebit — chi sei e come lavori qui', '## Le regole di questo repository'])
    expect(regole).toContain('### Regola zero: decide Daniele')
    expect(regole).toContain('sei il **PM di Lime (regia)**')
    // Le issue nascono dal registro, mai a mano: è la regola del processo.
    expect(regole).toContain('Le issue nascono dal registro')
    expect(regole).toContain('**mai a mano**')
    // Le regole di prima: nessuna tolta.
    for (const frase of ['docs/handover.md', '**GitFlow**', '**I test sono la specifica**', '**Non si scrive in produzione di propria iniziativa.**', 'non contiene mai i dati operativi dei locali']) {
      expect(regole, frase).toContain(frase)
    }
    expect(regole.indexOf('## Stonebit — chi sei')).toBeLessThan(regole.indexOf('**GitFlow**'))
  })

  it('la sezione dice che sulle regole di lavoro vince il repository, e le ripete come sono', () => {
    const regole = leggi('CLAUDE.md')
    expect(regole).toContain('### Precedenza')
    expect(regole).toMatch(/se\s+qualcosa qui le contraddice, vincono loro/)
    // I rami come li vuole docs/handover.md: release/x.y.z, feature solo
    // per una funzione grossa, hotfix da main, un worktree per ramo.
    expect(regole).toContain('il lavoro normale va su `release/x.y.z`, staccato da `develop`')
    expect(regole).toContain('`hotfix/<nome>` nasce da `main`')
    expect(regole).toContain('Un worktree per ramo')
    const manuale = leggi('docs/handover.md')
    expect(manuale).toContain('`release/x.y.z`: il ramo di lavoro, staccato da `develop`')
    expect(manuale).toContain('`hotfix/<nome>`: nasce da `main`')
    expect(manuale).toContain('**Un worktree per ramo**')
    // I tag sul test li mette l'agente quando Daniele lo chiede; la produzione no.
    expect(regole).toContain("pubblicano sul test li mette l'agente quando Daniele lo chiede in chat")
    // Una sola sezione di Stonebit: quella «regole comuni» in fondo non c'è più.
    expect(regole).not.toContain('## Stonebit — regole comuni')
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
    expect(leggi('.claude/agents/tech-lead.md')).toContain('Mai merge;')
    expect(leggi('.claude/agents/pm.md')).toContain('non scrivi codice')
    expect(leggi('.claude/agents/revisore.md')).toContain('Non scrivi codice')
  })
})
