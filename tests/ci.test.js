'use strict'

// LE ACTIONS DELLA REGIA (REQ-DEV-002, REQ-DEV-009): un push non pubblica
// mai; a pubblicare è il tag. Un tag fuori da main va sul test e poi passa
// il collaudo (le prove che scrivono: registrazione, licenza, aggiornamento
// di un locale di prova); un tag su main va in produzione solo se un
// collaudo è riuscito sul test per un commit che main contiene. La regola
// vive nei job «Dove va» e «Collaudo riuscito sul test» di
// firebase-hosting.yml e nella guardia di deploy.yml; un workflow non ha
// altri test, e un ritocco di buona volontà potrebbe mandare un ramo di
// lavoro in produzione senza che nessuno se ne accorga prima del deploy.

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
const e2e = load(leggi('e2e.yml'))

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

// Decisione dell'utente del 09/11/2026: «i rilasci solo su tag». Un push non
// pubblica più nemmeno sul test (dal 30/10 lo faceva develop).
describe('firebase-hosting.yml: a pubblicare è il tag; il test poi passa il collaudo, la produzione lo pretende', () => {
  it('parte solo da un tag o da workflow_dispatch: nessun push di ramo pubblica', () => {
    const on = eventi(hosting)
    expect(Object.keys(on).sort()).toEqual(['push', 'workflow_dispatch'])
    expect(on.push).toEqual({ tags: ['**'] })
  })

  it('«Dove va»: un tag su main è produzione; un tag fuori da main è test con collaudo; un lancio a mano è test senza collaudo', () => {
    const scelta = hosting.jobs.destinazione.steps.find((s) => s.id === 'scelta').run
    expect(hosting.jobs.destinazione.outputs).toMatchObject({ ambiente: expect.stringContaining('scelta.outputs.ambiente'), collaudo: expect.stringContaining('scelta.outputs.collaudo') })
    expect(scelta).toMatch(/if \[ "\$GITHUB_REF_TYPE" = "tag" \]; then[\s\S]*is-ancestor "\$GITHUB_SHA" origin\/main[\s\S]*ambiente=production/)
    const ultimoElse = scelta.lastIndexOf('else')
    // Il tag fuori da main: test, e il collaudo acceso.
    const tagFuori = scelta.slice(scelta.indexOf('ambiente=production'), ultimoElse)
    expect(tagFuori).toMatch(/ambiente=test[\s\S]*collaudo=true/)
    expect(tagFuori).not.toMatch(/exit 1/)
    // Un ramo lanciato a mano: test, senza collaudo, mai produzione.
    expect(scelta.slice(ultimoElse)).toMatch(/ambiente=test[\s\S]*collaudo=false/)
    expect(scelta.slice(ultimoElse)).not.toMatch(/production/)
  })

  it('il test va su drink-regia-test, la produzione su drink-regia, tutti e due col deploy riusabile', () => {
    const { prova, produzione } = hosting.jobs
    expect(prova.if).toBe("needs.destinazione.outputs.ambiente == 'test'")
    expect(prova.with).toMatchObject({ ambiente: 'test', progetto: 'drink-regia-test' })
    expect(prova.needs).toBe('destinazione')
    expect(produzione.if).toBe("needs.destinazione.outputs.ambiente == 'production'")
    expect(produzione.with).toMatchObject({ ambiente: 'production', progetto: 'drink-regia' })
    for (const j of [prova, produzione]) expect(j.uses).toBe('./.github/workflows/deploy.yml')
  })

  // REQ-DEV-009: dopo il deploy sul test le prove Playwright, col collaudo
  // acceso quando ha pubblicato un tag.
  it('dopo il deploy sul test chiama e2e.yml, col collaudo acceso solo per un tag', () => {
    const { collaudo } = hosting.jobs
    expect(collaudo.needs).toEqual(['destinazione', 'prova'])
    expect(collaudo.if).toBe("needs.destinazione.outputs.ambiente == 'test'")
    expect(collaudo.uses).toBe('./.github/workflows/e2e.yml')
    expect(collaudo.with.collaudo).toBe("${{ needs.destinazione.outputs.collaudo == 'true' }}")
  })

  // La produzione non rifà il collaudo: pretende che sia riuscito sul test,
  // per un commit che il tag di produzione contiene.
  it('la produzione aspetta la garanzia: un run riuscito con «Collaudo sul test» verde su un commit antenato', () => {
    const { garanzia, produzione } = hosting.jobs
    expect(garanzia.if).toBe("needs.destinazione.outputs.ambiente == 'production'")
    expect(garanzia.env.GH_TOKEN).toBe('${{ github.token }}')
    expect(eventi(hosting) && hosting.permissions.actions).toBe('read')
    const cerca = garanzia.steps.find((s) => s.name === 'Cerca il collaudo').run
    expect(cerca).toMatch(/actions\/workflows\/firebase-hosting\.yml\/runs\?event=push&status=success/)
    expect(cerca).toMatch(/merge-base --is-ancestor "\$sha" "\$GITHUB_SHA"/)
    // Il collaudo è un passo del job di e2e.yml, non un job: il nome di un
    // job non può dipendere da `inputs`.
    expect(cerca).toMatch(/\.jobs\[\]\.steps\[\]\? \| select\(\.name == "Collaudo sul test"\)/)
    expect(cerca).toMatch(/\[ -z "\$trovato" \][\s\S]*::error::[\s\S]*exit 1/)
    expect(produzione.needs).toEqual(['destinazione', 'garanzia'])
  })
})

describe('e2e.yml: le prove Playwright, riusabili, col collaudo a richiesta', () => {
  it('si chiama da un workflow o a mano, con l’interruttore del collaudo spento di default', () => {
    const on = eventi(e2e)
    expect(Object.keys(on).sort()).toEqual(['workflow_call', 'workflow_dispatch'])
    for (const evento of ['workflow_call', 'workflow_dispatch']) {
      expect(on[evento].inputs.collaudo).toMatchObject({ type: 'boolean', default: false })
    }
  })

  // Il nome del job è fisso (un'espressione con `inputs` nel nome fa
  // abortire il job senza messaggio: primo tag, 09/11/2026); il collaudo è
  // un passo a parte, acceso dall'input, ed è quel passo che la garanzia
  // della produzione cerca per nome.
  it('gira nell’environment test contro il sito di test: le prove in sola lettura sempre, il passo «Collaudo sul test» solo con l’input', () => {
    const job = e2e.jobs.e2e
    expect(job.environment).toBe('test')
    expect(job.name).toBe('Playwright sul sito di test')
    expect(job.env).toEqual({ E2E_URL: 'https://drink-regia-test.web.app', E2E_PASSWORD: '${{ secrets.E2E_PASSWORD }}' })
    const prove = job.steps.find((s) => s.name === 'Prove in sola lettura')
    expect(prove.run).toBe('npx playwright test --grep-invert collaudo')
    expect(prove.if).toBeUndefined()
    const collaudo = job.steps.find((s) => s.name === 'Collaudo sul test')
    expect(collaudo.if).toBe('inputs.collaudo')
    expect(collaudo.env).toEqual({ E2E_COLLAUDO: 'true' })
    expect(collaudo.run).toBe('npx playwright test e2e/collaudo-registrazione.spec.js e2e/collaudo-licenza.spec.js')
  })

  // I test che scrivono stanno in file a parte e si accendono solo col collaudo.
  it('i test del collaudo (registrazione, licenza) esistono e si saltano senza E2E_COLLAUDO', () => {
    for (const f of ['collaudo-registrazione.spec.js', 'collaudo-licenza.spec.js']) {
      const testo = readFileSync(join(process.cwd(), 'e2e', f), 'utf8')
      expect(testo).toMatch(/test\.skip\(!COLLAUDO/)
    }
    expect(readFileSync(join(process.cwd(), 'e2e/aiuto.js'), 'utf8')).toMatch(/export const COLLAUDO = process\.env\.E2E_COLLAUDO === 'true'/)
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

// REQ-DEV-014: il rapporto di coverage è un allegato. L'11/11/2026 un guasto
// di GitHub ha fatto fallire il suo caricamento, e con lui il controllo
// della PR, a test e build passati.
describe('test.yml: il rapporto di coverage non decide se una PR è buona', () => {
  const passi = test.jobs[Object.keys(test.jobs)[0]].steps
  it('il caricamento del rapporto può fallire senza far fallire il job', () => {
    const rapporto = passi.find((p) => p.name === 'Rapporto di coverage')
    expect(rapporto['continue-on-error']).toBe(true)
  })
  // L'audit del sito ha già `continue-on-error`, per una ragione sua scritta
  // nel workflow (REQ-DEV-006): resta fuori da questo elenco.
  it('lint, test, build, audit delle Functions e coverage no: un loro fallimento fa ancora fallire il job', () => {
    const vincolanti = passi.filter((p) => ['npm run lint', 'npm test', 'npm run build'].includes(p.run) || ['Audit delle dipendenze delle Functions', 'Test con coverage'].includes(p.name))
    expect(vincolanti).toHaveLength(5)
    for (const p of vincolanti) expect(p['continue-on-error'], p.name || p.run).toBeUndefined()
  })
})

// REQ-FLOTTA-101 (collaudo di v0.4.0-beta.1, 14/11/2026): la scheda del
// locale di prova si apre anche quando mostra un aggiornamento fallito. Il
// suo «Riprova» e quello della lettura fallita hanno lo stesso nome: si
// aspetta il primo dei due, e si preme il secondo solo senza la scheda.
describe('il collaudo apre la scheda anche con un aggiornamento fallito', () => {
  const spec = readFileSync(join(process.cwd(), 'e2e/collaudo-licenza.spec.js'), 'utf8')
  const scheda = spec.slice(spec.indexOf('async function scheda(page)'), spec.indexOf('const stato = '))
  it('aspetta la scheda o il Riprova senza pretendere che sia uno solo', () => {
    expect(scheda).toContain('await expect(articolo.or(riprova).first()).toBeVisible()')
    expect(scheda).not.toMatch(/expect\(articolo\.or\(riprova\)\)\.toBeVisible/)
  })
  it('preme Riprova solo se la scheda non c’è', () => {
    // \r?: su Windows il file estratto ha gli a capo \r\n.
    expect(scheda).toMatch(/if \(await articolo\.isVisible\(\)\) break\r?\n\s*await riprova\.first\(\)\.click\(\)/)
  })
})

// REQ-FLOTTA-102 (collaudo del rilascio 0.4.0, 14/11/2026): da REQ-LIC-018
// di tana-drink il pubblico, a locale sospeso, legge solo «Menù non
// disponibile», mai il motivo. Il collaudo guarda l'app da pubblico.
describe('il collaudo di «Sospendi» guarda l’app da pubblico', () => {
  const spec = readFileSync(join(process.cwd(), 'e2e/collaudo-licenza.spec.js'), 'utf8').replace(/\r\n/g, '\n')
  const prova = spec.slice(spec.indexOf('«Sospendi» scrive la licenza'), spec.indexOf('«Aggiorna subito» porta il locale'))
  it('aspetta «Menù non disponibile» (o la schermata di prima) e controlla che il motivo non si veda', () => {
    expect(prova).toContain("await expect(avviso).toContainText(/Menù non disponibile|Installazione sospesa/, { timeout: 60_000 })")
    expect(prova).toContain('await expect(avviso).not.toContainText(MOTIVO)')
    expect(prova).not.toContain('await expect(avviso).toContainText(`Motivo: ${MOTIVO}`)')
  })
  it('riattivato, nessuno dei due avvisi resta', () => {
    expect(prova).toContain("await expect(app.getByText(/Menù non disponibile|Installazione sospesa/)).toHaveCount(0, { timeout: 60_000 })")
  })
})
