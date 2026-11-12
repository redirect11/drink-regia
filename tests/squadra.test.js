// LA SQUADRA DI STONEBIT (REQ-DEV-012). Dal messaggio del CEO-agente
// dell'11/11/2026 (seconda versione, lo schema del progetto Planner): la
// sessione aperta su questo repository lavora come ha sempre fatto, ed è
// lei il Tech Lead (quarta versione, 12/11/2026); ha a disposizione tre
// developer, un revisore e un PM di solo controllo. Chi sono e come
// lavorano sta in file che gli strumenti leggono da soli (CLAUDE.md,
// AGENTS.md, .claude/agents/): se uno sparisce o perde l'intestazione,
// l'agente non esiste più e nessuno se ne accorge. Questo test lo dice.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
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
    // Quarta versione: la sessione non è il PM. Lavora come ha sempre
    // fatto, ed è lei il Tech Lead (Daniele, 12/11/2026: «il tech lead sei
    // tu»); il PM è un ruolo di controllo, non di comando.
    expect(regole).toContain('lavora come ha sempre fatto')
    expect(regole).toContain('È lei il **Tech Lead**')
    expect(regole).toContain('Non è il PM e non è\nobbligata a delegare'.replace('\n', ' '))
    expect(regole).toContain('un ruolo di **controllo**, non di comando')
    expect(regole).toContain('non c\'è una catena obbligata fra i ruoli')
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
    // I rami (Daniele, 12/11/2026: «usa questa: una ventina di rami
    // feature/, fix/ e hotfix/, tutti staccati da develop, ognuno con la
    // sua PR»). Li dicono uguali la sezione, la regola del repository e il
    // manuale: tre testi che non devono dividersi.
    expect(regole).toContain('un ramo per ogni lavoro, staccato da `develop`: `feature/<nome>` per una cosa nuova')
    expect(regole).toContain('- **GitFlow**: un ramo per ogni lavoro, staccato da `develop` (`feature/`,')
    expect(regole).toContain('Un worktree per ramo')
    expect(regole).not.toContain('il lavoro normale va su `release/x.y.z`')
    expect(regole).not.toContain('`hotfix/<nome>` nasce da `main`')
    const manuale = leggi('docs/handover.md')
    expect(manuale).toContain('**Un ramo per ogni lavoro, staccato da `develop`**')
    expect(manuale).toContain('**Un worktree per ramo**')
    expect(manuale).not.toContain('`release/x.y.z`: il ramo di lavoro, staccato da `develop`')
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

  it.each(['pm', 'frontend-developer', 'backend-developer', 'devops-flotta', 'revisore'])('%s ha il suo file, con nome e descrizione nell’intestazione', (nome) => {
    const agente = leggi(`.claude/agents/${nome}.md`)
    const intestazione = agente.match(/^---\n([\s\S]*?)\n---\n/)
    expect(intestazione).not.toBeNull()
    expect(intestazione[1]).toContain(`name: ${nome}`)
    expect(intestazione[1]).toMatch(/^description: .{20,}$/m)
    expect(agente).toContain('Stonebit')
  })

  it('i developer non fanno merge, tag né deploy; il PM e il revisore non scrivono codice; il Tech Lead non è un agente', () => {
    for (const nome of ['frontend-developer', 'backend-developer', 'devops-flotta']) {
      expect(leggi(`.claude/agents/${nome}.md`), nome).toContain('Non fai merge, tag, deploy')
      // Rispondono alla sessione, non a un Tech Lead che non c'è.
      expect(leggi(`.claude/agents/${nome}.md`), nome).toContain('Ricevi il lavoro dalla sessione principale')
    }
    expect(leggi('.claude/agents/pm.md')).toContain('non scrivi codice')
    expect(leggi('.claude/agents/pm.md')).toContain('non dirigi il lavoro, non assegni compiti')
    expect(leggi('.claude/agents/revisore.md')).toContain('Non scrivi codice')
    // Il Tech Lead è la sessione: per quel ruolo non c'è un file.
    expect(existsSync(join(RADICE, '.claude/agents/tech-lead.md'))).toBe(false)
  })
})
