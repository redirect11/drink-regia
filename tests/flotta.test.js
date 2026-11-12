'use strict'

// I WORKFLOW DELLA FLOTTA NELLA REGIA (REQ-FLOTTA-006, REQ-FLOTTA-009,
// docs/flotta-nella-regia.md). Dal 29/10/2026 l'attivazione e
// l'aggiornamento dei locali stanno qui, non in tana-drink. Un workflow non
// ha altri test: qui si controllano le cose che, rotte, si scoprirebbero
// solo con un locale vero a metà. Gli input che le Functions mandano sono
// quelli che il workflow dichiara (GitHub rifiuta un lancio con un input in
// più); ogni regia lancia sul suo environment; gli input non entrano mai
// in un comando (audit del 22/10/2026, C1); l'app arriva da tana-drink.
// Dal 09/11/2026 (REQ-FLOTTA-047, audit punto 6) attivazione e
// aggiornamento sono quattro job: controlla → prepara → compila → pubblica,
// e il codice di tana-drink gira solo in `compila`, che non ha la chiave.

import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { load } from 'js-yaml'
import { conIRuoli } from '../scripts/lib-iam.js'

const require = createRequire(import.meta.url)
const { dispatchPayload, dispatchAggiornamento } = require('../functions/lib/provisioning.js')

const leggi = (f) => readFileSync(join(process.cwd(), f), 'utf8')
// `on` in YAML 1.1 è un booleano: js-yaml lo legge come chiave `true`.
const eventi = (w) => w.on ?? w[true]
const provisiona = load(leggi('.github/workflows/provisiona-istanza.yml'))
const aggiorna = load(leggi('.github/workflows/aggiorna-istanza.yml'))
const elimina = load(leggi('.github/workflows/elimina-istanza.yml'))
const { dispatchEliminazione } = require('../functions/lib/eliminazione.js')
const { CHIAVI_BUILD } = require('../functions/lib/esistente.js')
const jobs = (w) => Object.values(w.jobs)
// I passi di tutti i job, nell'ordine in cui girano (i job sono scritti
// nell'ordine della catena `needs`): un passo che nel file viene prima
// gira prima anche nel workflow.
const passi = (w) => jobs(w).flatMap((j) => j.steps)
const passo = (w, nome) => passi(w).find((s) => s.name === nome)
const jobDelPasso = (w, nome) => jobs(w).find((j) => j.steps.some((s) => s.name === nome))
const AMBIENTE_DELLA_REGIA = "${{ inputs.ambiente == 'test' && 'flotta-test' || 'flotta' }}"

const richiesta = { slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff'], uid: 'u1' }
const WORKFLOW = [
  ['provisiona-istanza.yml', provisiona, dispatchPayload(richiesta, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })],
  ['aggiorna-istanza.yml', aggiorna, dispatchAggiornamento(richiesta, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })],
]

// NIENTE EMULATORI IN PRODUZIONE (REQ-FLOTTA-021, l'utente 31/10/2026):
// l'emulatore di Auth dà token non firmati e quello del database ha comandi
// di amministrazione senza protezione. Un locale pubblicato dalla regia non
// si collega mai agli emulatori: nessun workflow che pubblica lo chiede,
// né negli env né nel .env che scrive per la build.
describe('nessun locale pubblicato sugli emulatori', () => {
  it.each(['provisiona-istanza.yml', 'aggiorna-istanza.yml', 'elimina-istanza.yml'])('%s non nomina gli emulatori', (nome) => {
    expect(leggi(`.github/workflows/${nome}`)).not.toMatch(/EMULATOR|emulators:start|connect\w*Emulator/i)
  })
})

describe.each(WORKFLOW)('%s', (_, w, corpo) => {
  it('parte solo a comando, con esattamente gli input che le Functions mandano', () => {
    expect(Object.keys(eventi(w))).toEqual(['workflow_dispatch'])
    expect(Object.keys(eventi(w).workflow_dispatch.inputs).sort()).toEqual(Object.keys(corpo.inputs).sort())
  })

  it('ogni regia sul suo environment: test su flotta-test, il resto su flotta; i job con la chiave e solo quelli', () => {
    expect(eventi(w).workflow_dispatch.inputs.ambiente).toMatchObject({ type: 'choice', options: ['produzione', 'test'], default: 'produzione' })
    expect(w.jobs.prepara.environment).toBe(AMBIENTE_DELLA_REGIA)
    expect(w.jobs.pubblica.environment).toBe(AMBIENTE_DELLA_REGIA)
    expect(w.jobs.controlla.environment).toBeUndefined()
    expect(w.jobs.compila.environment).toBeUndefined()
  })

  it('gli input e gli output dei job non entrano mai in un comando: passano dalle variabili d’ambiente', () => {
    for (const s of passi(w)) {
      expect(s.run || '', s.name).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs|needs)\./)
    }
  })

  it('il primo passo del primo job controlla gli input, con lo stesso slug delle Functions', () => {
    expect(Object.keys(w.jobs)[0]).toBe('controlla')
    expect(passi(w)[0].name).toBe('Input validi')
    expect(passi(w)[0].run).toContain('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')
    expect(passi(w)[0].run).toContain('^[A-Za-z0-9._/-]{1,100}$')
  })

  it('l’app è tana-drink alla versione chiesta, in app/: controllata al ref, compilata allo SHA controllato', () => {
    const checkout = (j) => j.steps.find((s) => s.uses?.startsWith('actions/checkout') && s.with?.repository)
    expect(checkout(w.jobs.controlla).with).toEqual({ repository: 'redirect11/tana-drink', ref: '${{ inputs.ref }}', path: 'app', 'fetch-depth': 0 })
    expect(checkout(w.jobs.compila).with).toEqual({ repository: 'redirect11/tana-drink', ref: '${{ needs.controlla.outputs.commit }}', path: 'app', 'fetch-depth': 0 })
    // Lo SHA è quello del checkout controllato, letto da git.
    expect(w.jobs.controlla.outputs.commit).toBe('${{ steps.app.outputs.commit }}')
    expect(passo(w, "La versione dell'app va bene per questa regia?").id).toBe('app')
    expect(passo(w, "La versione dell'app va bene per questa regia?").run).toContain('echo "commit=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"')
    expect(passo(w, 'Deploy regole, indici, Functions e hosting')['working-directory']).toBe('app')
  })

  // Al primo deploy delle Functions i permessi degli agenti di Google
  // arrivano dopo qualche minuto (prova-bar): il deploy si riprova.
  it('il deploy si riprova due volte, a 90 secondi', () => {
    const deploy = passo(w, 'Deploy regole, indici, Functions e hosting').run
    expect(deploy).toContain('for tentativo in 1 2 3; do')
    expect(deploy).toContain('npx firebase-tools deploy --only "$SOLO" --project "$PROGETTO" --force')
    expect(deploy).toContain('sleep 90')
  })

  // REQ-FLOTTA-015: il profilo leggero (il Free) pubblica solo regole e
  // sito, e salta Storage e segreti: è quello che lo rende a costo zero.
  it('col profilo leggero solo regole e sito; Storage e segreti solo col completo', () => {
    expect(eventi(w).workflow_dispatch.inputs.profilo).toMatchObject({ type: 'choice', options: ['completo', 'leggero'], default: 'completo' })
    // La demo è sempre leggera (REQ-FLOTTA-019): solo nell'aggiornamento,
    // perché drinkpos-demo non si attiva dalla regia.
    expect(w.env.PROFILO).toBe(w === aggiorna ? "${{ inputs.progetto == 'drinkpos-demo' && 'leggero' || inputs.profilo }}" : '${{ inputs.profilo }}')
    expect(passi(w)[0].run).toContain('[[ "$PROFILO" =~ ^(completo|leggero)$ ]]')
    const deploy = passo(w, 'Deploy regole, indici, Functions e hosting').run
    expect(deploy).toContain('if [ "$PROFILO" = "leggero" ]; then SOLO=firestore,hosting; else SOLO=firestore,storage,functions,hosting; fi')
    for (const nome of ['Lo Storage del locale', "I segreti dell'app"]) expect(passo(w, nome).if).toBe("env.PROFILO == 'completo'")
    expect(passo(w, 'Esito alla regia').run).toContain('profilo: process.env.PROFILO || null')
  })

  // tana-drink, REQ-LIC-004 (30/10/2026): l'app sa di essere leggera già
  // dalla build, prima di leggere la licenza.
  it('la build dice il profilo all’app', () => {
    // L'aggiornamento può compilare per una cartella che non è lo slug
    // (la Tana è clienti/tana, REQ-FLOTTA-018); l'attivazione no.
    const cliente = w === aggiorna ? '${{ inputs.cliente || inputs.slug }}' : '${{ inputs.slug }}'
    expect(passo(w, 'Build').env).toMatchObject({ CLIENTE: cliente, VITE_PROFILO: '${{ env.PROFILO }}' })
  })

  // Le Functions dell'app dichiarano dei segreti, e Firebase non le
  // pubblica se ne manca uno (la prima attivazione di prova, SUMUP_API_KEY).
  it('i segreti dichiarati dall’app si creano prima del deploy', () => {
    // REQ-FLOTTA-075: la Chiave AI del locale (da tana-drink, 12/11/2026).
    expect(w.env.SEGRETI_APP).toBe('SUMUP_API_KEY,REGIA_AI_KEY')
    const nomi = passi(w).map((s) => s.name)
    expect(passo(w, "I segreti dell'app").run).toBe('node scripts/segreti-istanza.mjs --project "$PROGETTO" --segreti "$SEGRETI_APP"')
    expect(nomi.indexOf("I segreti dell'app")).toBeGreaterThan(nomi.indexOf('Dipendenze della regia'))
    expect(nomi.indexOf("I segreti dell'app")).toBeLessThan(nomi.indexOf('Deploy regole, indici, Functions e hosting'))
    expect(passo(w, 'Dipendenze della regia').run).toBe('npm ci --prefix functions')
  })

  it('attivazione e aggiornamento dello stesso locale non si sovrappongono', () => {
    expect(w.concurrency).toEqual({ group: 'istanza-${{ inputs.slug }}', 'cancel-in-progress': false })
  })

  it('l’esito torna alla regia sempre, e dice cos’era', () => {
    const esito = passo(w, 'Esito alla regia')
    expect(esito.if).toBe('always()')
    expect(esito.env.CALLBACK_URL).toBe('${{ vars.REGIA_CALLBACK_URL }}')
    expect(esito.run).toContain(w === provisiona ? 'operazione: "attivazione"' : 'operazione: "aggiornamento"')
  })

  // Audit del 09/11/2026, finding 12: la regia accetta un run una volta sola
  // e solo se è fresco; il workflow dice quale run è e quando ha mandato.
  it('l’esito porta il run e l’istante dell’invio, contro i replay', () => {
    const esito = passo(w, 'Esito alla regia')
    expect(esito.env.RUN_ID).toBe('${{ github.run_id }}')
    expect(esito.run).toContain('run_id: Number(process.env.RUN_ID)')
    expect(esito.run).toContain('inviato_il: new Date().toISOString()')
  })
})

// Portati da tana-drink (tests/unit/provisionaIstanza.test.js del ramo
// feature/flotta, chiuso il 30/10/2026): le cose che la regia e Terraform
// danno per scontate, e che rotte si vedrebbero solo su un locale vero.
describe.each(WORKFLOW)('%s: l’app di produzione di quel locale', (_, w) => {
  const nomi = () => passi(w).map((s) => s.name)
  const app = () => passi(w).findIndex((s) => s.with?.repository === 'redirect11/tana-drink')

  it('il progetto è drinkpos-<slug>, la build è di produzione e per quel cliente', () => {
    // Un progetto diverso solo per un locale esistente (REQ-FLOTTA-018),
    // e solo nell'aggiornamento: un locale nuovo nasce sempre drinkpos-<slug>.
    expect(w.env.PROGETTO).toBe(w === aggiorna ? "${{ inputs.progetto || format('drinkpos-{0}', inputs.slug) }}" : 'drinkpos-${{ inputs.slug }}')
    const build = passo(w, 'Build')
    expect(build.env).toMatchObject({ CLIENTE: w === aggiorna ? '${{ inputs.cliente || inputs.slug }}' : '${{ inputs.slug }}', VITE_APP_ENV: 'production' })
    expect(build.run).toBe('npm run build')
  })

  it('i passi vanno in ordine, fino alla pulizia delle credenziali per ultima', () => {
    const ordine = [
      // La licenza prima dell'app (tana-drink, 01/11/2026): con l'app nuova
      // un locale senza licenza/attuale si ferma. Il Terraform prima della
      // build: la build legge la configurazione web che il Terraform dà.
      ...(w === provisiona ? ['Terraform apply', 'La cartella del cliente', 'Build', "Licenza e nome del locale nell'istanza"] : ['La cartella del cliente', 'Build']),
      'Deploy regole, indici, Functions e hosting',
      'Versione pubblicata',
      'Esito alla regia',
      'Pulizia credenziali',
    ].map((n) => nomi().lastIndexOf(n))
    expect(ordine.every((i) => i >= 0)).toBe(true)
    expect([...ordine].sort((a, b) => a - b)).toEqual(ordine)
    expect(nomi().at(-1)).toBe('Pulizia credenziali')
  })

  it('l’esito dice errore se il job non è riuscito, e porta la versione', () => {
    const run = passo(w, 'Esito alla regia').run
    expect(run).toMatch(/else STATO=errore;/)
    expect(run).toContain('"${VERSIONE:-}"')
  })

  it('le credenziali si cancellano sempre, in ogni job che le scrive, anche se qualcosa è andato storto', () => {
    const conLaChiave = jobs(w).filter((j) => JSON.stringify(j).includes('secrets.PROVISIONING_SA_JSON'))
    expect(conLaChiave.map((j) => j.name)).toEqual([w.jobs.prepara.name, w.jobs.pubblica.name])
    for (const j of conLaChiave) {
      const pulizia = j.steps.at(-1)
      expect(pulizia.name).toBe('Pulizia credenziali')
      expect(pulizia.if).toBe('always()')
      expect(pulizia.run).toMatch(/^rm -f "\$RUNNER_TEMP\/sa\.json"/)
    }
  })

  // «In produzione solo il tag su main» (l'utente, 30/10/2026).
  it('sulla regia di produzione un ramo si ferma; sul test passa con un avviso', () => {
    const run = passo(w, 'È un rilascio?').run
    expect(run).toMatch(/if \[ "\$REF_APP" = "main" \] \|\| \[\[ "\$REF_APP" =~ \^v\[0-9\]\+/)
    expect(run).toMatch(/elif \[ "\$AMBIENTE" = "test" \]; then\n\s+echo "::warning::/)
    expect(run).toMatch(/else\n\s+echo "::error::[^\n]+"\n\s+exit 1\n\s*fi/)
    expect(nomi().indexOf('È un rilascio?')).toBeLessThan(app())
  })

  // Un tag vX.Y.Z nasce su develop di tana-drink e pubblica il test della
  // Tana: è di produzione solo quando il suo commit arriva su main.
  it('in produzione solo una versione che sta su main di tana-drink, controllata subito dopo averla presa', () => {
    const i = nomi().indexOf("La versione dell'app va bene per questa regia?")
    expect(i).toBe(app() + 1)
    const controllo = passi(w)[i]
    expect(controllo['working-directory']).toBe('app')
    expect(controllo.run).toMatch(/if \[ "\$AMBIENTE" = "produzione" \]; then[\s\S]*git merge-base --is-ancestor HEAD origin\/main[\s\S]*exit 1/)
    // Prima di credenziali e Terraform, in un job senza environment:
    // fermarsi qui non costa niente, e nessun progetto è ancora nato.
    expect(i).toBeLessThan(nomi().indexOf('Credenziali di provisioning'))
    expect(jobDelPasso(w, "La versione dell'app va bene per questa regia?")).toBe(w.jobs.controlla)
  })

  it('il ramo e il commit dell’app arrivano alla build, come nel deploy della Tana', () => {
    const run = passo(w, "La versione dell'app va bene per questa regia?").run
    expect(run).toMatch(/if git merge-base --is-ancestor HEAD origin\/main; then RAMO=main\n\s*elif git merge-base --is-ancestor HEAD origin\/develop; then RAMO=develop\n\s*else RAMO="\$REF_APP"; fi/)
    expect(run).toContain('echo "ramo=$RAMO" >> "$GITHUB_OUTPUT"')
    expect(w.jobs.controlla.outputs.ramo).toBe('${{ steps.app.outputs.ramo }}')
    expect(passo(w, 'Build').env).toMatchObject({ GIT_BRANCH: '${{ needs.controlla.outputs.ramo }}', GIT_COMMIT: '${{ needs.controlla.outputs.commit }}' })
  })

  it('un’app che non sa compilare per un cliente (la 1.9.x) si ferma, su tutte e due le regie', () => {
    const controllo = passo(w, "La versione dell'app va bene per questa regia?").run
    const primo = controllo.slice(0, controllo.indexOf('if [ "$AMBIENTE"'))
    expect(primo).toMatch(/if \[ ! -f scripts\/genera-cliente\.mjs \]; then[\s\S]*exit 1/)
  })
})

// UN LOCALE ESISTENTE AGGIORNATO DALLA REGIA (REQ-FLOTTA-018): la Tana
// sul suo progetto, con la sua cartella e le sue chiavi, e senza perdere
// niente di quello che il suo deploy di tana-drink le dava.
describe('aggiorna-istanza.yml: un locale esistente, come la Tana', () => {
  const validi = () => passo(aggiorna, 'Input validi').run

  it('progetto e cartella si controllano, e i progetti della regia non sono mai un locale', () => {
    expect(validi()).toMatch(/\[\[ "\$PROGETTO" =~ \^\[a-z\]\[a-z0-9-\]\{4,28\}\[a-z0-9\]\$ \]\]/)
    expect(validi()).toMatch(/"\$PROGETTO" = "drink-regia" \] \|\| \[ "\$PROGETTO" = "drink-regia-test" \];[^\n]*exit 1/)
    expect(validi()).toMatch(/\[\[ "\$CLIENTE_APP" =~ \^\[a-z\]\[a-z0-9-\]\{1,29\}\$ \]\]/)
    expect(aggiorna.env.CLIENTE_APP).toBe('${{ inputs.cliente || inputs.slug }}')
  })

  it('le chiavi della build: solo quelle pubbliche previste, con valori semplici', () => {
    expect(validi()).toContain('["VITE_FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_VAPID_KEY", "VITE_RECAPTCHA_SITE_KEY"]')
    expect(validi()).toContain('/^[A-Za-z0-9_-]{1,200}$/')
    // Le stesse della regia: una chiave in più qui o là non passerebbe.
    expect(CHIAVI_BUILD).toEqual(['VITE_FIREBASE_MEASUREMENT_ID', 'VITE_FIREBASE_VAPID_KEY', 'VITE_RECAPTCHA_SITE_KEY'])
  })

  it('nel .env della build le chiavi del locale e Analytics dal progetto', () => {
    const run = passo(aggiorna, "La configurazione web dell'istanza").run
    expect(run).toContain('["VITE_FIREBASE_MEASUREMENT_ID", c.measurementId || ""]')
    expect(run).toContain('...Object.fromEntries(righe), ...build')
  })

  it('la cartella del cliente è quella del locale; se c’è già non si rigenera', () => {
    // «tana» e «demo» sono più corte di uno slug: genera-cliente.mjs le
    // rifiutava prima di vedere che la cartella c'era (revisione di
    // sicurezza del 02/11/2026, A2).
    const run = passo(aggiorna, 'La cartella del cliente').run
    expect(run).toMatch(/^if \[ -f "clienti\/\$CLIENTE_APP\/venue\.json" \]; then[^\n]*exit 0; fi\n/)
    expect(run).toContain('node scripts/genera-cliente.mjs --slug "$CLIENTE_APP" --nome "$NOME"')
  })

  // La Tana ha in tana-drink functions/.env.tana-drink con l'app id di
  // SumUp: riscritto col solo nome, SumUp si fermerebbe.
  // REQ-FLOTTA-075: la riga REGIA_PROGETTO si aggiunge solo se manca, senza
  // riscrivere il resto.
  it('il .env delle Functions che tana-drink ha già non si riscrive: gli si aggiunge REGIA_PROGETTO se manca', () => {
    const run = passo(aggiorna, 'Functions .env del progetto').run
    // Il file che c'è già si guarda per primo, per tutti, demo compresa.
    expect(run).toMatch(/^if \[ -f "app\/functions\/\.env\.\$PROGETTO" \]; then\n/)
    expect(run).toContain(`grep -q '^REGIA_PROGETTO=' "app/functions/.env.$PROGETTO" || printf 'REGIA_PROGETTO=%s\\n' "$REGIA_PROGETTO" >> "app/functions/.env.$PROGETTO"`)
    expect(run).toContain(`printf 'VENUE_NAME=%s\\nREGIA_PROGETTO=%s\\n' "$NOME" "$REGIA_PROGETTO" > "app/functions/.env.$PROGETTO"`)
    // Dentro quel ramo solo un'aggiunta, mai una riscrittura, e poi si esce.
    const giaCe = run.slice(0, run.indexOf('\nfi\n'))
    expect(giaCe).toContain('>> "app/functions/.env.$PROGETTO"')
    expect(giaCe).not.toMatch(/[^>]> "app\/functions/)
    expect(giaCe).toMatch(/exit 0$/)
  })
})

// LA DEMO PUBBLICA (REQ-FLOTTA-019): la si apre dalla prima pagina, quindi
// chiunque. La build della demo non usa il database; qui la regia si
// assicura che il database di drinkpos-demo resti chiuso e che la build
// della demo e il suo progetto non si mescolino con quelli di un locale.
describe('aggiorna-istanza.yml: la demo', () => {
  it('la build della demo solo su drinkpos-demo, e drinkpos-demo solo con quella', () => {
    const run = passo(aggiorna, 'Input validi').run
    expect(run).toMatch(/if \[ "\$PROGETTO" = "drinkpos-demo" \] && \[ "\$CLIENTE_APP" != "demo" \]; then[^\n]*exit 1; fi/)
    expect(run).toMatch(/if \[ "\$CLIENTE_APP" = "demo" \] && \[ "\$PROGETTO" != "drinkpos-demo" \]; then[^\n]*exit 1; fi/)
  })

  it('sempre col profilo leggero: niente Functions, Storage, segreti né Terraform', () => {
    expect(aggiorna.env.PROFILO).toBe("${{ inputs.progetto == 'drinkpos-demo' && 'leggero' || inputs.profilo }}")
    // La build sa lo stesso profilo che si pubblica.
    expect(passo(aggiorna, 'Build').env.VITE_PROFILO).toBe('${{ env.PROFILO }}')
  })

  it('il database e lo Storage chiusi a tutti, pubblicati al posto delle regole dell’app, prima del deploy', () => {
    expect(aggiorna.env.DEMO).toBe("${{ inputs.progetto == 'drinkpos-demo' }}")
    const regole = passo(aggiorna, 'Le regole della demo')
    expect(regole.if).toBe("env.DEMO == 'true'")
    expect(regole.run).toContain('cp infra/demo/firestore.rules app/firestore.rules')
    expect(regole.run).toContain('cp infra/demo/storage.rules app/storage.rules')
    const nomi = passi(aggiorna).map((s) => s.name)
    const deploy = nomi.indexOf('Deploy regole, indici, Functions e hosting')
    expect(nomi.indexOf('Le regole della demo')).toBe(deploy - 2)
    // Lo Storage a parte: il profilo leggero non lo pubblica (M4).
    const storage = passo(aggiorna, 'Lo Storage della demo chiuso')
    expect(nomi.indexOf('Lo Storage della demo chiuso')).toBe(deploy - 1)
    expect(storage.if).toBe("env.DEMO == 'true'")
    expect(storage.run).toContain('npx firebase-tools deploy --only storage --project "$PROGETTO" --force')
    const testo = leggi('infra/demo/firestore.rules').replace(/\/\/.*$/gm, '')
    expect(testo).toMatch(/match \/\{documento=\*\*\} \{\s*allow read, write: if false;\s*\}/)
    expect(testo.match(/allow /g)).toHaveLength(1)
    const file = leggi('infra/demo/storage.rules').replace(/\/\/.*$/gm, '')
    expect(file).toMatch(/match \/\{tutto=\*\*\} \{\s*allow read, write: if false;\s*\}/)
    expect(file.match(/allow /g)).toHaveLength(1)
  })

  // REVISIONE DI SICUREZZA DEL 02/11/2026: la demo non porta niente di
  // vero, non chiama nessuno, e il browser lo garantisce da sé.
  it('la configurazione è finta: nessun progetto vero nella build della demo (M2)', () => {
    const finta = passo(aggiorna, 'La configurazione finta della demo')
    expect(finta.if).toBe("env.DEMO == 'true'")
    expect(finta.run).toContain('VITE_FIREBASE_PROJECT_ID=demo-drinkpos')
    expect(finta.run).not.toContain('apps:sdkconfig')
    expect(passo(aggiorna, "La configurazione web dell'istanza").if).toBe("env.DEMO != 'true'")
    const controllo = passo(aggiorna, 'Il pacchetto giusto').run
    expect(controllo).toContain(`grep -rqF 'drink:demo-sessione' dist`)
    expect(controllo).toContain(`if grep -rqF '"drinkpos-demo"' dist; then`)
    expect(controllo).toContain('node scripts/controlla-build-senza-demo.mjs dist')
  })

  it('la demo non si presenta a nessuna regia (M1)', () => {
    // «cond && '' || x» in GitHub dà sempre x: per questo è al rovescio.
    expect(passo(aggiorna, 'Build').env.VITE_REGIA_PROGETTO).toBe("${{ inputs.progetto != 'drinkpos-demo' && (inputs.ambiente == 'test' && 'drink-regia-test' || 'drink-regia') || '' }}")
  })

  it('la demo si riconosce dal segno nel venue.json, non solo dal nome (B5)', () => {
    const run = passo(aggiorna, 'La demo solo dove va').run
    expect(run).toContain('.demo === true')
    expect(run).toMatch(/if \[ "\$SEGNO" = "true" \] && \[ "\$DEMO" != "true" \]; then[^\n]*exit 1; fi/)
    expect(run).toMatch(/if \[ "\$DEMO" = "true" \] && \[ "\$SEGNO" != "true" \]; then[^\n]*exit 1; fi/)
    const nomi = passi(aggiorna).map((s) => s.name)
    expect(nomi.indexOf('La demo solo dove va')).toBe(nomi.indexOf('La cartella del cliente') + 1)
    expect(nomi.indexOf('La demo solo dove va')).toBeLessThan(nomi.indexOf('Build'))
  })

  it('le intestazioni di sicurezza: niente richieste fuori, niente cornici (B1)', () => {
    const { headers } = JSON.parse(leggi('infra/demo/intestazioni.json'))
    const v = Object.fromEntries(headers.map((h) => [h.key, h.value]))
    const csp = v['Content-Security-Policy']
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe/)
    expect(v['X-Content-Type-Options']).toBe('nosniff')
    expect(v['X-Frame-Options']).toBe('DENY')
    expect(passo(aggiorna, 'Le regole della demo').run).toContain('j.hosting.headers = [...(j.hosting.headers || []), { source: "**", headers }]')
  })
})

describe('aggiorna-istanza.yml: la configurazione web è quella del sito', () => {
  // drinkpos-prova-free, 30/10/2026: con due app web nel progetto
  // `apps:sdkconfig` senza id si fermava.
  it('prende l’app collegata al sito, e se il comando fallisce mostra perché', () => {
    const run = passo(aggiorna, 'La configurazione web dell’istanza'.replace('’', "'")).run
    expect(run).toContain('npx firebase-tools hosting:sites:get "$PROGETTO" --project "$PROGETTO" --json')
    expect(run).toContain('npx firebase-tools apps:sdkconfig web $APP_ID --project "$PROGETTO" --json')
    expect(run).toContain('|| { cat "$RUNNER_TEMP/sdk.json"; exit 1; }')
  })
})

describe('provisiona-istanza.yml: il Terraform con i valori dell’environment', () => {
  // drinkpos-prova-free, 30/10/2026: il database aperto a mano fermava
  // l'apply con «Database already exists».
  it('un progetto creato a mano entra nello stato, e il suo Firestore se c’è già', () => {
    const run = passo(provisiona, 'Importa il progetto se esiste già').run
    expect(run).toContain('terraform import -input=false google_project.istanza "$PROGETTO"')
    expect(run).toContain('if ! terraform state show google_firestore_database.db')
    expect(run).toContain('terraform import -input=false google_firestore_database.db "projects/$PROGETTO/databases/(default)"')
  })

  it('l’account della regia che scrive la licenza e l’ambiente arrivano al Terraform', () => {
    for (const nome of ['Importa il progetto se esiste già', 'Terraform apply']) {
      expect(passo(provisiona, nome).env).toMatchObject({
        TF_VAR_regia_sa_email: '${{ vars.REGIA_SA_EMAIL }}',
        TF_VAR_ambiente: '${{ inputs.ambiente }}',
        TF_VAR_billing_account: '${{ secrets.BILLING_ACCOUNT_ID }}',
      })
    }
  })

  it('senza le variabili dell’environment si ferma prima di toccare niente', () => {
    const conf = passo(provisiona, "La configurazione dell'environment")
    expect(conf.run).toContain('TFSTATE_BUCKET REGIA_SA_EMAIL REGIA_URL REGIA_CALLBACK_URL')
  })

  it('la licenza la scrive lo script della regia, con l’indirizzo della regia che ha lanciato', () => {
    const lic = passo(provisiona, "Licenza e nome del locale nell'istanza")
    expect(lic.run).toContain('node scripts/licenza-istanza.mjs')
    expect(lic.env.REGIA_URL).toBe('${{ vars.REGIA_URL }}')
  })
})

// LA BUILD DELL'APP SENZA CREDENZIALI (REQ-FLOTTA-047, audit del
// 09/11/2026, punto 6). Fino al 09/11 `npm ci` e `npm run build` di
// tana-drink giravano con la chiave del provisioning in ambiente: una
// dipendenza compromessa nel lockfile dell'app (un postinstall, un plugin
// di Vite) l'avrebbe letta. Ora il codice dell'app gira solo nel job
// `compila`, senza environment e senza secret; i job con la chiave non
// scaricano l'app e non ne installano niente. La configurazione web che la
// build chiede viaggia come output del job `prepara`: è pubblica per
// disegno, finisce nel pacchetto che il browser scarica.
describe.each(WORKFLOW)('%s: il codice di tana-drink gira solo nel job senza la chiave', (_, w) => {
  const testo = (j) => JSON.stringify(j)
  // `controlla` guarda solo se genera-cliente.mjs esiste: non lo esegue.
  const eseguonoLApp = (j) => /npm ci --prefix app|npm run build|node scripts\/genera-cliente\.mjs/.test(testo(j))
  const hannoLaChiave = (j) => testo(j).includes('secrets.')

  it('quattro job in fila: controlla → prepara → compila → pubblica', () => {
    expect(Object.keys(w.jobs)).toEqual(['controlla', 'prepara', 'compila', 'pubblica'])
    expect(w.jobs.controlla.needs).toBeUndefined()
    expect(w.jobs.prepara.needs).toBe('controlla')
    expect(w.jobs.compila.needs).toEqual(['controlla', 'prepara'])
    expect(w.jobs.pubblica.needs).toEqual(['controlla', 'prepara', 'compila'])
    // La concorrenza per slug resta del workflow intero, non di un job.
    expect(w.concurrency.group).toBe('istanza-${{ inputs.slug }}')
  })

  it('il job che installa e compila l’app non ha environment e non legge nessun secret', () => {
    const [compila] = jobs(w).filter(eseguonoLApp)
    expect(compila).toBe(w.jobs.compila)
    expect(compila.environment).toBeUndefined()
    expect(hannoLaChiave(compila)).toBe(false)
    expect(testo(compila)).not.toMatch(/GOOGLE_APPLICATION_CREDENTIALS|sa\.json/)
    expect(passo(w, "Dipendenze dell'app").run).toBe('npm ci --prefix app\nnpm ci --prefix app/functions\n')
  })

  it('i job con la chiave non scaricano l’app, non installano e non compilano niente di tana-drink', () => {
    const conLaChiave = jobs(w).filter((j) => testo(j).includes('secrets.PROVISIONING_SA_JSON'))
    expect(conLaChiave).toEqual([w.jobs.prepara, w.jobs.pubblica])
    for (const j of conLaChiave) {
      expect(eseguonoLApp(j), j.name).toBe(false)
      expect(j.steps.some((s) => s.with?.repository), j.name).toBe(false)
    }
  })

  // 09/11/2026: come output del job GitHub la scartava («Skip output since
  // it may contain secret»: la riga di JSON somiglia a un valore mascherato)
  // e compila restava senza, tre aggiornamenti falliti di fila. In un
  // artifact passa, e non è un segreto: sono le chiavi pubbliche del client.
  it('la configurazione web passa da prepara a compila in un artifact, non come output, e porta solo chiavi pubbliche', () => {
    expect(w.jobs.prepara.outputs?.config_web).toBeUndefined()
    const web = w.jobs.prepara.steps.find((s) => s.id === 'web')
    expect(web.run).toContain('config-web.json')
    expect(web.run).not.toContain('config_web=$(')
    // Nel passo che la produce non c'è nessun secret.
    expect(testo(web)).not.toContain('secrets.')
    const su = w.jobs.prepara.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'))
    expect(su.with).toMatchObject({ name: 'config-web', path: '${{ runner.temp }}/config-web.json', 'retention-days': 1, 'if-no-files-found': 'error' })
    const giu = w.jobs.compila.steps.find((s) => s.uses?.startsWith('actions/download-artifact'))
    expect(giu.with).toEqual({ name: 'config-web', path: '${{ runner.temp }}/config-web' })
    const env = w.jobs.compila.steps.find((s) => s.name?.startsWith('Il .env della build'))
    expect(env.env).toBeUndefined()
    expect(env.run).toContain('JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"))')
    expect(env.run).toContain('"$GITHUB_WORKSPACE/app/.env" "$RUNNER_TEMP/config-web/config-web.json"')
    expect(testo(w.jobs.compila)).not.toContain('needs.prepara.outputs.config_web')
  })

  it('l’app compilata viaggia in un artifact: compila la carica, pubblica la scarica e la scompatta in app/', () => {
    expect(passo(w, 'Il pacchetto per il deploy').run).toBe('tar -czf app.tgz --exclude=app/node_modules --exclude=app/.git app')
    const su = w.jobs.compila.steps.find((s) => s.uses?.startsWith('actions/upload-artifact'))
    expect(su.with).toMatchObject({ name: 'app', path: 'app.tgz', 'retention-days': 1 })
    const giu = w.jobs.pubblica.steps.find((s) => s.uses?.startsWith('actions/download-artifact'))
    expect(giu.with).toEqual({ name: 'app' })
    expect(passo(w, "L'app compilata").run).toBe('tar -xzf app.tgz && rm app.tgz')
    const nomi = w.jobs.pubblica.steps.map((s) => s.name || s.uses)
    expect(nomi.indexOf("L'app compilata")).toBeLessThan(nomi.indexOf('Credenziali di provisioning'))
  })

  // Un job saltato non manda niente: la regia resterebbe «in corso».
  it('se un job prima fallisce, pubblica parte lo stesso, fallisce subito e manda l’esito di errore', () => {
    expect(w.jobs.pubblica.if).toBe('${{ !cancelled() }}')
    const primo = w.jobs.pubblica.steps[0]
    expect(primo.name).toBe('I job precedenti sono riusciti?')
    expect(primo.if).toBe("needs.compila.result != 'success'")
    expect(primo.run).toMatch(/exit 1\s*$/)
    expect(passo(w, 'Esito alla regia').if).toBe('always()')
    expect(passo(w, 'Esito alla regia').env.ESITO_JOB).toBe('${{ job.status }}')
  })

  // REQ-FLOTTA-048, primo punto del 29 dell'audit: l'esito deve dire lo
  // SHA pubblicato, non solo «main»: dal job `controlla` al job dell'esito,
  // e da lì nel JSON del callback, che la regia salva in istanze/{slug}.
  it('lo SHA di tana-drink pubblicato arriva al job dell’esito e nel callback', () => {
    expect(w.jobs.pubblica.env.COMMIT_APP).toBe('${{ needs.controlla.outputs.commit }}')
    expect(passo(w, 'Esito alla regia').run).toContain('commit: process.env.COMMIT_APP || null')
  })
})

// IL PROGETTO È DI QUESTA REGIA (REQ-FLOTTA-048): l'input `progetto`
// dell'aggiornamento può nominare un progetto qualunque, e la chiave è la
// stessa per le due regie. L'etichetta `ambiente` del progetto decide.
describe('aggiorna-istanza.yml: il progetto deve avere l’etichetta ambiente di questa regia', () => {
  it('si controlla con le credenziali, prima del Terraform e di tutto il resto', () => {
    const controllo = passo(aggiorna, 'Il progetto è di questa regia?')
    expect(jobDelPasso(aggiorna, 'Il progetto è di questa regia?')).toBe(aggiorna.jobs.prepara)
    expect(controllo.run).toContain(`ETICHETTA=$(gcloud projects describe "$PROGETTO" --format='value(labels.ambiente)')`)
    expect(controllo.run).toMatch(/if \[ "\$ETICHETTA" != "\$AMBIENTE" \]; then\n\s*echo "::error::[^\n]*"\n\s*exit 1\n\s*fi/)
    // Il rimedio per un locale esistente sta nel messaggio.
    expect(controllo.run).toContain('gcloud projects update $PROGETTO --update-labels ambiente=$AMBIENTE')
    const nomi = passi(aggiorna).map((s) => s.name || s.uses)
    expect(nomi.indexOf('Il progetto è di questa regia?')).toBe(nomi.indexOf('Credenziali di provisioning') + 1)
    expect(nomi.indexOf('Il progetto è di questa regia?')).toBeLessThan(nomi.indexOf('Il profilo completo nel progetto'))
    expect(nomi.indexOf('Il progetto è di questa regia?')).toBeLessThan(nomi.indexOf('Deploy regole, indici, Functions e hosting'))
    // gcloud parla con la stessa chiave del provisioning.
    expect(passo(aggiorna, 'Credenziali di provisioning').run).toContain('gcloud auth activate-service-account --key-file="$RUNNER_TEMP/sa.json"')
  })
})

describe('infra/istanza/main.tf', () => {
  const tf = leggi('infra/istanza/main.tf')
  const variabile = (nome) => tf.match(new RegExp(`variable "${nome}" \\{[\\s\\S]*?\\n\\}`))[0]

  it('l’account della regia non ha un valore predefinito: ogni regia passa il suo', () => {
    expect(variabile('regia_sa_email')).not.toMatch(/default/)
    expect(tf).not.toMatch(/600871952552-compute/)
  })

  it('l’ambiente è produzione o test, ed è un’etichetta del progetto', () => {
    expect(variabile('ambiente')).toContain('contains(["produzione", "test"], var.ambiente)')
    expect(tf).toContain('ambiente = var.ambiente')
  })

  // La configurazione web attraversa i job come output (REQ-FLOTTA-047):
  // deve restare quello che è, le chiavi pubbliche del client.
  it('l’output config_web porta solo i VITE_FIREBASE_* del client, niente altro', () => {
    const output = tf.match(/output "config_web" \{[\s\S]*?\n\}/)[0]
    const chiavi = [...output.matchAll(/^\s{4}([A-Z_]+)\s+=/gm)].map((m) => m[1])
    expect(chiavi.length).toBeGreaterThan(0)
    for (const k of chiavi) expect(k).toMatch(/^VITE_FIREBASE_/)
    expect(output).not.toMatch(/private_key|secret|token/i)
  })

  it('gli agenti di Eventarc e Pub/Sub nascono col progetto completo, con i loro ruoli', () => {
    expect(tf).toContain('for_each   = local.completo ? toset(["eventarc.googleapis.com", "pubsub.googleapis.com"]) : toset([])')
    expect(tf).toContain('role     = "roles/eventarc.serviceAgent"')
    expect(tf).toContain('role     = "roles/iam.serviceAccountTokenCreator"')
    expect(tf.match(/count {4}= local\.completo \? 1 : 0/g)).toHaveLength(2)
    // prova-bar ha i due permessi nello stato senza indice: si spostano.
    expect(tf).toContain('to   = google_project_iam_member.agente_eventarc[0]')
    expect(tf).toContain('to   = google_project_iam_member.agente_pubsub[0]')
  })

  // REQ-FLOTTA-015, provato su drinkpos-prova-free il 30/10/2026: senza
  // fatturazione Google non accende l'accesso con email (BILLING_NOT_ENABLED),
  // quindi anche il leggero ha l'account di fatturazione; risparmia sulle
  // API e sugli agenti delle Functions, che sono quello che costa.
  describe('il profilo', () => {
    const lista = (nome) => tf.match(new RegExp(`${nome} = \\[([\\s\\S]*?)\\]`))[1].match(/"[a-z.]+"/g).map((s) => s.slice(1, -1))

    it('è completo o leggero, completo se non si dice, ed è un’etichetta del progetto', () => {
      expect(variabile('profilo')).toContain('default     = "completo"')
      expect(variabile('profilo')).toContain('contains(["completo", "leggero"], var.profilo)')
      expect(tf).toContain('profilo  = var.profilo')
    })

    it('il leggero ha database, regole, sito e accesso, e non le API delle Functions', () => {
      expect(lista('api_base')).toEqual(expect.arrayContaining(['firebase.googleapis.com', 'firestore.googleapis.com', 'firebaserules.googleapis.com', 'identitytoolkit.googleapis.com', 'firebasehosting.googleapis.com']))
      for (const api of ['cloudfunctions.googleapis.com', 'cloudbuild.googleapis.com', 'artifactregistry.googleapis.com', 'run.googleapis.com', 'cloudscheduler.googleapis.com', 'firebasestorage.googleapis.com']) {
        expect(lista('api_base')).not.toContain(api)
        expect(lista('api_completo')).toContain(api)
      }
      expect(tf).toContain('api = concat(local.api_base, local.completo ? local.api_completo : [])')
    })

    it('la fatturazione e l’accesso con email valgono per tutti e due', () => {
      expect(tf).toContain('billing_account = var.billing_account')
      expect(tf).toMatch(/resource "google_identity_platform_config" "auth" \{\s+provider = google-beta\s+project {2}= google_project.istanza.project_id/)
    })

    it('l’attivazione passa il profilo al Terraform', () => {
      for (const nome of ['Importa il progetto se esiste già', 'Terraform apply']) expect(passo(provisiona, nome).env.TF_VAR_profilo).toBe('${{ inputs.profilo }}')
    })

    it('l’aggiornamento completa col Terraform solo un locale della regia ancora leggero', () => {
      const p = passo(aggiorna, 'Il profilo completo nel progetto')
      // Un locale esistente non ha stato Terraform: non si tocca mai.
      expect(p.if).toBe("env.PROFILO == 'completo' && env.ESISTENTE != 'true'")
      expect(aggiorna.env.ESISTENTE).toBe("${{ inputs.progetto != '' }}")
      expect(p.env.TF_VAR_profilo).toBe('completo')
      expect(p.run).toContain('if ! terraform state show google_project.istanza')
      expect(p.run).toContain(`grep -qF 'google_project_service.api["cloudfunctions.googleapis.com"]'`)
      const nomi = passi(aggiorna).map((s) => s.name)
      expect(nomi.indexOf('Il profilo completo nel progetto')).toBeLessThan(nomi.indexOf('Lo Storage del locale'))
    })
  })

  // L'app usa firebase/storage e il deploy pubblica storage.rules: senza il
  // bucket la prima attivazione di prova si è fermata al deploy, e il
  // Terraform non lo può creare (i nomi *.firebasestorage.app sono di
  // Firebase): lo crea l'API di Firebase Storage, dal workflow.
  it('lo Storage dell’app: l’API col progetto, il bucket dallo script prima del deploy', () => {
    expect(tf).toContain('"firebasestorage.googleapis.com"')
    expect(tf).not.toMatch(/resource "google_storage_bucket"/)
    expect(tf).toContain('VITE_FIREBASE_STORAGE_BUCKET      = "${local.progetto}.firebasestorage.app"')
    const nomi = passi(provisiona).map((s) => s.name)
    expect(passo(provisiona, 'Lo Storage del locale').run).toBe('node scripts/storage-istanza.mjs --project "$PROGETTO"')
    expect(nomi.indexOf('Lo Storage del locale')).toBeGreaterThan(nomi.indexOf('Dipendenze della regia'))
    expect(nomi.indexOf('Lo Storage del locale')).toBeLessThan(nomi.indexOf('Deploy regole, indici, Functions e hosting'))
  })
})

describe('le Functions lanciano i workflow della regia', () => {
  const env = (f) => Object.fromEntries(leggi(f).split(/\r?\n/).filter((r) => r && !r.startsWith('#')).map((r) => r.split('=')))

  it('il repository è la regia, il ramo dei workflow main', () => {
    expect(env('functions/.env')).toMatchObject({ GITHUB_REPO: 'redirect11/drink-regia', FLOTTA_REF: 'main', FLOTTA_AMBIENTE: 'produzione' })
  })

  // 30/10/2026: il test segue develop, anche nei workflow della flotta.
  it('la regia di test lancia i workflow da develop, la produzione da main', () => {
    expect(env('functions/.env.drink-regia-test')).toMatchObject({ FLOTTA_REF: 'develop', APP_REF: 'develop', FLOTTA_AMBIENTE: 'test' })
    expect(env('functions/.env.drink-regia').FLOTTA_REF ?? env('functions/.env').FLOTTA_REF).toBe('main')
  })

  // La produzione compila i locali da main di tana-drink, l'ultimo uscito:
  // mai da un ramo di lavoro (feature/flotta fino al 30/10/2026).
  it('la regia di produzione compila i locali da main', () => {
    expect(env('functions/.env').APP_REF).toBe('main')
    expect(env('functions/.env.drink-regia').APP_REF).toBe('main')
  })

  it('la regia di test lancia sull’environment di test, la produzione sul suo', () => {
    expect(env('functions/.env.drink-regia-test').FLOTTA_AMBIENTE).toBe('test')
    expect(env('functions/.env.drink-regia').FLOTTA_AMBIENTE).toBe('produzione')
  })
})

// I RUOLI DEL PROVISIONING (REQ-FLOTTA-006, scripts/ruoli-provisioning.mjs):
// una policy IAM è di tutti; lo script aggiunge un membro e non toglie né
// sposta niente, e se è già tutto a posto non scrive.
describe('conIRuoli: un membro in più in una policy IAM', () => {
  const sa = 'serviceAccount:provisioning@drink-regia.iam.gserviceaccount.com'

  it('aggiunge il membro ai ruoli che mancano, lasciando gli altri come sono', () => {
    const prima = { etag: 'x', bindings: [{ role: 'roles/viewer', members: ['user:a@b.it'] }] }
    const { policy, nuovi } = conIRuoli(prima, sa, ['roles/owner'])
    expect(nuovi).toBe(1)
    expect(policy).toEqual({ etag: 'x', bindings: [{ role: 'roles/viewer', members: ['user:a@b.it'] }, { role: 'roles/owner', members: [sa] }] })
    // La policy letta non cambia: si scrive solo quella nuova.
    expect(prima.bindings).toHaveLength(1)
  })

  it('un ruolo già dato non si ridà: zero nuovi, e lo script non scrive', () => {
    const { nuovi } = conIRuoli({ bindings: [{ role: 'roles/owner', members: [sa] }] }, sa, ['roles/owner'])
    expect(nuovi).toBe(0)
  })

  it('si aggiunge accanto a chi ha già il ruolo, e un binding con condizione non si tocca', () => {
    const condizionato = { role: 'roles/billing.user', members: [], condition: { expression: 'false' } }
    const { policy, nuovi } = conIRuoli({ bindings: [condizionato, { role: 'roles/storage.objectAdmin', members: ['user:a@b.it'] }] }, sa, ['roles/billing.user', 'roles/storage.objectAdmin'])
    expect(nuovi).toBe(2)
    expect(policy.bindings[0]).toEqual(condizionato)
    expect(policy.bindings.find((b) => b.role === 'roles/storage.objectAdmin').members).toEqual(['user:a@b.it', sa])
    expect(policy.bindings.find((b) => b.role === 'roles/billing.user' && !b.condition).members).toEqual([sa])
  })

  it('una policy senza binding (un bucket nuovo) va bene', () => {
    expect(conIRuoli({}, sa, ['roles/storage.objectAdmin']).policy.bindings).toEqual([{ role: 'roles/storage.objectAdmin', members: [sa] }])
  })

  it('lo script dà solo fatturazione, bucket e proprietà dei progetti', () => {
    const ruoli = [...leggi('scripts/ruoli-provisioning.mjs').matchAll(/'(roles\/[a-zA-Z.]+)'/g)].map((m) => m[1])
    expect([...new Set(ruoli)].sort()).toEqual(['roles/billing.user', 'roles/owner', 'roles/storage.objectAdmin'])
  })
})

// L'ELIMINAZIONE (REQ-FLOTTA-014): il backup completo e verificato viene
// PRIMA di qualunque cancellazione, e senza verifica il progetto resta.
describe('elimina-istanza.yml', () => {
  const nomi = passi(elimina).map((s) => s.name || s.uses)
  const prima = (a, b) => expect(nomi.indexOf(a), `${a} prima di ${b}`).toBeLessThan(nomi.indexOf(b))

  it('parte solo a comando, con gli input che la regia manda, sull’environment della sua regia', () => {
    expect(Object.keys(eventi(elimina))).toEqual(['workflow_dispatch'])
    expect(Object.keys(eventi(elimina).workflow_dispatch.inputs).sort()).toEqual(Object.keys(dispatchEliminazione('prova-bar').inputs).sort())
    expect(jobs(elimina)).toHaveLength(1)
    expect(jobs(elimina)[0].environment).toBe(AMBIENTE_DELLA_REGIA)
    expect(elimina.concurrency.group).toBe('istanza-${{ inputs.slug }}')
  })

  // REQ-FLOTTA-048 (audit del 09/11/2026, punto 7): le due regie usano la
  // stessa chiave, e `ambiente: test` cancellava un locale di produzione.
  it('prima di tutto il progetto deve essere di questa regia: etichetta ambiente e stato Terraform, altrimenti stop', () => {
    const controllo = passo(elimina, 'Il progetto è di questa regia?').run
    expect(controllo).toContain(`ETICHETTA=$(gcloud projects describe "$PROGETTO" --format='value(labels.ambiente)')`)
    expect(controllo).toMatch(/if \[ "\$ETICHETTA" != "\$AMBIENTE" \]; then\n\s*echo "::error::[^\n]*"\n\s*exit 1\n\s*fi/)
    expect(controllo).toMatch(/if \[ -z "\$\(gcloud storage ls "gs:\/\/\$TFSTATE_BUCKET\/istanze\/\$SLUG\/" 2>\/dev\/null\)" \]; then\n\s*echo "::error::[^\n]*"\n\s*exit 1\n\s*fi/)
    expect(passo(elimina, 'Il progetto è di questa regia?').env.TFSTATE_BUCKET).toBe('${{ vars.TFSTATE_BUCKET }}')
    // Prima del backup (leggerebbe dati non nostri) e, a maggior ragione,
    // prima di eliminare il progetto e lo stato.
    prima('Il progetto è di questa regia?', 'Il backup leggibile')
    prima('Il progetto è di questa regia?', 'Elimina il progetto')
    prima('Il progetto è di questa regia?', 'Lo stato di Terraform')
    const testo = leggi('.github/workflows/elimina-istanza.yml')
    expect(testo.indexOf(`--format='value(labels.ambiente)'`)).toBeLessThan(testo.indexOf('gcloud projects delete'))
  })

  it('gli input non entrano nei comandi, e la demo non si elimina', () => {
    for (const s of passi(elimina)) expect(s.run || '', s.name).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)\./)
    expect(passi(elimina)[0].run).toContain('drinkpos-demo')
  })

  it('l’ordine: backup leggibile, export nativo, archivio, verifica, e solo dopo l’eliminazione', () => {
    prima('Il backup leggibile', "L'export nativo del database")
    prima("L'export nativo del database", "Nell'archivio")
    prima("Nell'archivio", 'Il backup è completo?')
    prima('Il backup è completo?', 'Elimina il progetto')
    prima('Elimina il progetto', 'Lo stato di Terraform')
  })

  it('senza backup verificato niente si cancella', () => {
    expect(passo(elimina, 'Il backup è completo?').run).toContain('echo "VERIFICATO=si" >> "$GITHUB_ENV"')
    expect(passo(elimina, 'Elimina il progetto').if).toBe("env.VERIFICATO == 'si'")
    expect(passo(elimina, 'Lo stato di Terraform').if).toBe("env.VERIFICATO == 'si'")
    // La verifica guarda lo zip, il manifesto e l'export nativo completo.
    const verifica = passo(elimina, 'Il backup è completo?').run
    expect(verifica).toContain('$BYTE_ZIP')
    expect(verifica).toContain('manifesto.json')
    expect(verifica).toContain('overall_export_metadata')
  })

  it('l’esito torna alla regia sempre, con l’archivio solo se è eliminata', () => {
    const esito = passo(elimina, 'Esito alla regia')
    expect(esito.if).toBe('always()')
    expect(esito.run).toContain('operazione: "eliminazione"')
    expect(esito.run).toContain('stato === "eliminata" ?')
  })

  // Audit del 09/11/2026, finding 12: il bucket è della regia e non viaggia
  // nel corpo; il run e l'istante dell'invio sì, contro i replay.
  it('l’esito non dichiara il bucket, e porta run e istante dell’invio', () => {
    const esito = passo(elimina, 'Esito alla regia')
    expect(esito.env).not.toHaveProperty('ARCHIVIO_BUCKET')
    expect(esito.run).not.toContain('bucket')
    expect(esito.run).toContain('{ percorso, zip: `${percorso}/archivio.zip`')
    expect(esito.env.RUN_ID).toBe('${{ github.run_id }}')
    expect(esito.run).toContain('run_id: Number(process.env.RUN_ID)')
    expect(esito.run).toContain('inviato_il: new Date().toISOString()')
  })
})

// IL TIPO DI LOCALE (REQ-FLOTTA-065, tana-drink REQ-VENUE-007). Prima di
// creare la cartella del cliente la regia chiede all'app se sa leggere il
// tipo di locale; se sì e se accetta `bar`, glielo passa, altrimenti la
// lancia come prima. Il passo si prova davvero: si esegue il suo script con
// un genera-cliente.mjs finto, vecchio (come quello di oggi, che a `--sa`
// risponde con l'uso e uscita 1) e nuovo.
describe.each(WORKFLOW)('%s: il tipo di locale arriva all’app solo se l’app lo sa leggere', (file, w) => {
  const run = () => passo(w, 'La cartella del cliente').run

  it('il tipo è scritto una volta sola, nel workflow, ed è «bar»', () => {
    expect(w.env.TIPO_LOCALE).toBe('bar')
  })

  it('la domanda e la chiamata stanno nel job senza chiavi', () => {
    const delCompila = w.jobs.compila.steps.find((s) => s.name === 'La cartella del cliente')
    expect(delCompila?.run).toContain('node scripts/genera-cliente.mjs --sa tipo-locale')
    for (const j of ['controlla', 'prepara', 'pubblica']) expect(JSON.stringify(w.jobs[j])).not.toContain('--sa tipo-locale')
  })

  const FINTO = {
    // Come la versione di oggi: ignora gli argomenti che non conosce, e
    // senza --slug esce con 1.
    vecchio: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (!a.includes('--slug')) { console.error('Uso: …'); process.exit(1) }`,
    // Come la versione chiesta a tana-drink.
    nuovo: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (a[0] === '--sa') { if (a[1] === 'tipo-locale') { console.log(JSON.stringify({ 'tipo-locale': ['bar'] })); process.exit(0) } process.exit(1) }`,
    // Risponde di sì, ma non accetta «bar»: la regia non deve mandarlo.
    // Risposte fuori contratto (revisore, 12/11/2026): una riga di log prima
    // del JSON, un testo invece di un elenco, un'opzione di node.
    sporco: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (a[0] === '--sa') { console.log('avviso: qualcosa'); console.log(JSON.stringify({ 'tipo-locale': ['bar'] })); process.exit(0) }`,
    testo: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (a[0] === '--sa') { console.log(JSON.stringify({ 'tipo-locale': 'barista' })); process.exit(0) }`,
    opzione: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (a[0] === '--sa') { console.log('--version'); process.exit(0) }`,
    senzaBar: `import { appendFileSync } from 'node:fs'
const a = process.argv.slice(2)
appendFileSync('chiamate.log', JSON.stringify(a) + '\\n')
if (a[0] === '--sa') { console.log(JSON.stringify({ 'tipo-locale': ['ristorante'] })); process.exit(0) }`,
  }

  // Su Windows `bash` nel PATH può essere quello di WSL, che non vede node:
  // si usa quello di Git. Sulla CI (Linux) è il bash del sistema.
  const BASH = process.platform === 'win32' ? ['C:/Program Files/Git/bin/bash.exe'].find((b) => existsSync(b)) : 'bash'

  const lancia = (versione, { curato = false } = {}) => {
    const cartella = mkdtempSync(join(tmpdir(), 'tipo-locale-'))
    try {
      mkdirSync(join(cartella, 'scripts'))
      writeFileSync(join(cartella, 'scripts', 'genera-cliente.mjs'), FINTO[versione])
      if (curato) {
        mkdirSync(join(cartella, 'clienti', 'bar-mario'), { recursive: true })
        writeFileSync(join(cartella, 'clienti', 'bar-mario', 'venue.json'), '{}')
      }
      // Le stesse opzioni con cui GitHub Actions lancia un passo `run`.
      const esito = spawnSync(BASH, ['--noprofile', '--norc', '-eo', 'pipefail', '-c', run()], {
        cwd: cartella,
        encoding: 'utf8',
        env: { ...process.env, SLUG: 'bar-mario', CLIENTE_APP: 'bar-mario', NOME: 'Bar Mario', TIPO_LOCALE: w.env.TIPO_LOCALE },
      })
      const log = existsSync(join(cartella, 'chiamate.log')) ? readFileSync(join(cartella, 'chiamate.log'), 'utf8') : ''
      return { stato: esito.status, uscita: esito.stdout, errore: esito.stderr, chiamate: log.split('\n').filter(Boolean).map((r) => JSON.parse(r)) }
    } finally {
      // Su Windows bash tiene la cartella ancora un attimo: si riprova, e
      // una pulizia mancata in una cartella temporanea non fa fallire il test.
      try {
        rmSync(cartella, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch {
        /* resta nella cartella temporanea del sistema */
      }
    }
  }

  it('con l’app nuova chiede e poi passa --tipo-locale bar', () => {
    const { stato, chiamate } = lancia('nuovo')
    expect(stato).toBe(0)
    expect(chiamate).toEqual([
      ['--sa', 'tipo-locale'],
      ['--slug', 'bar-mario', '--nome', 'Bar Mario', '--tipo-locale', 'bar'],
    ])
  })

  it('con l’app di oggi chiede, riceve un no, e la lancia come prima', () => {
    const { stato, chiamate } = lancia('vecchio')
    expect(stato).toBe(0)
    expect(chiamate).toEqual([['--sa', 'tipo-locale'], ['--slug', 'bar-mario', '--nome', 'Bar Mario']])
  })

  it.each(['sporco', 'testo', 'opzione'])('con una risposta fuori contratto («%s») la lancia come prima, e lo segnala', (versione) => {
    const { stato, uscita, chiamate } = lancia(versione)
    expect(stato).toBe(0)
    expect(chiamate.at(-1)).toEqual(['--slug', 'bar-mario', '--nome', 'Bar Mario'])
    expect(uscita).toContain("::warning::L'app risponde a --sa tipo-locale, ma non con l'elenco atteso")
  })

  it('con l’app di oggi la ricaduta non dà avvisi: è il caso normale', () => {
    expect(lancia('vecchio').uscita).not.toContain('::warning::')
  })

  // Criterio 5: in aggiorna-istanza un cliente curato a mano resta com'è.
  it.runIf(file === 'aggiorna-istanza.yml')('un cliente curato a mano resta com’è: nessuna chiamata, nemmeno la domanda', () => {
    const { stato, chiamate } = lancia('nuovo', { curato: true })
    expect(stato).toBe(0)
    expect(chiamate).toEqual([])
  })

  it('con un’app che non accetta «bar» la lancia come prima', () => {
    const { stato, chiamate } = lancia('senzaBar')
    expect(stato).toBe(0)
    expect(chiamate.at(-1)).toEqual(['--slug', 'bar-mario', '--nome', 'Bar Mario'])
  })
})

// REQ-FLOTTA-075 (da tana-drink, 12/11/2026): l'AI del locale chiama la sua
// regia. REGIA_PROGETTO viene dall'ambiente del workflow, mai da un input.
describe('il .env delle Functions del locale dice qual è la sua regia', () => {
  const regia = "${{ inputs.ambiente == 'test' && 'drink-regia-test' || 'drink-regia' }}"
  it('provisiona-istanza.yml: nome del locale e regia', () => {
    const p = passo(provisiona, 'Functions .env del progetto')
    expect(p.env.REGIA_PROGETTO).toBe(regia)
    expect(p.run).toBe(`printf 'VENUE_NAME=%s\\nREGIA_PROGETTO=%s\\n' "$NOME" "$REGIA_PROGETTO" > "app/functions/.env.$PROGETTO"`)
  })
  it('aggiorna-istanza.yml: la stessa regia, e la demo no', () => {
    const p = passo(aggiorna, 'Functions .env del progetto')
    expect(p.env.REGIA_PROGETTO).toBe(`\${{ inputs.progetto != 'drinkpos-demo' && (inputs.ambiente == 'test' && 'drink-regia-test' || 'drink-regia') || '' }}`)
    // La demo (REGIA_PROGETTO vuoto) riceve solo il nome, come prima.
    expect(p.run).toMatch(/\nif \[ -z "\$REGIA_PROGETTO" \]; then printf 'VENUE_NAME=%s\\n' "\$NOME" > "app\/functions\/\.env\.\$PROGETTO"; exit 0; fi\n/)
    // E la riga si aggiunge solo con una regia da scrivere.
    expect(p.run).toContain('if [ -n "$REGIA_PROGETTO" ]; then')
  })
})

// REQ-FLOTTA-078 (Daniele, 12/11/2026: «noi dobbiamo deployare in
// automatico tutto»). Un locale esistente non ha il Terraform della flotta:
// l'account ai-locale glielo dà l'aggiornamento.
describe('l’account dell’AI di un locale esistente', () => {
  // Anche per i locali della flotta già completi: il Terraform su un
  // progetto completo non si riapplica (visto sul test con la beta.17).
  it('c’è un passo, per ogni locale completo tranne la demo, prima del deploy, che non ferma il deploy', () => {
    const p = passo(aggiorna, "L'account dell'AI del locale")
    expect(p.if).toBe("env.PROFILO == 'completo' && env.DEMO != 'true'")
    expect(p.run).toContain('node scripts/account-ai-locale.mjs --project "$PROGETTO" ${DEPLOY:+--deploy "$DEPLOY"} || echo "::warning::')
    const nomi = passi(aggiorna).map((s) => s.name)
    expect(nomi.indexOf("L'account dell'AI del locale")).toBeGreaterThan(nomi.indexOf('Dipendenze della regia'))
    expect(nomi.indexOf("L'account dell'AI del locale")).toBeLessThan(nomi.indexOf('Deploy regole, indici, Functions e hosting'))
  })
  it('lo script crea ai-locale e dà gli stessi ruoli del Terraform, aggiungendo e mai togliendo', () => {
    const script = leggi('scripts/account-ai-locale.mjs')
    const tf = leggi('infra/istanza/main.tf')
    const blocco = tf.slice(tf.indexOf('resource "google_project_iam_member" "ai_locale"'))
    const ruoliTf = [...blocco.slice(0, blocco.indexOf('\n}\n')).matchAll(/"(roles\/[a-zA-Z.]+)"/g)].map((m) => m[1]).sort()
    const ruoliScript = [...script.slice(script.indexOf('const RUOLI'), script.indexOf(']', script.indexOf('const RUOLI'))).matchAll(/'(roles\/[a-zA-Z.]+)'/g)].map((m) => m[1]).sort()
    expect(ruoliScript).toEqual(ruoliTf)
    expect(script).toContain("accountId: 'ai-locale'")
    expect(script).toContain("import { conIRuoli } from './lib-iam.js'")
    expect(script).not.toMatch(/members\.filter|splice|delete /)
  })
})

// REQ-FLOTTA-078, la Tana (da tana-drink, 12/11/2026): le sue Functions le
// pubblica il deploy di tana-drink col suo account, che deve poter agire
// come ai-locale; e la Tana non passa da «Aggiorna» della regia.
describe('l’AI di un locale esistente: il permesso del deploy e il workflow suo', () => {
  const prepara = load(leggi('.github/workflows/prepara-ai-locale.yml'))
  it('lo script dà a --deploy il permesso sul solo account ai-locale', () => {
    const script = leggi('scripts/account-ai-locale.mjs')
    expect(script).toContain("const DEPLOY = arg('deploy')")
    expect(script).toContain('/serviceAccounts/${EMAIL}`')
    expect(script).toContain("conIRuoli(letta.data, `serviceAccount:${DEPLOY}`, ['roles/iam.serviceAccountUser'])")
  })
  it('l’aggiornamento di un esistente passa l’account di deploy del progetto', () => {
    const run = passo(aggiorna, "L'account dell'AI del locale").run
    expect(run).toContain('if [ "$ESISTENTE" = "true" ]; then DEPLOY="firebase-adminsdk-fbsvc@$PROGETTO.iam.gserviceaccount.com"; fi')
    expect(run).toContain('${DEPLOY:+--deploy "$DEPLOY"}')
  })
  it('il workflow suo: a comando, input controllati, credenziali pulite, mai su un progetto della regia', () => {
    expect(Object.keys(prepara.on)).toEqual(['workflow_dispatch'])
    expect(Object.keys(prepara.on.workflow_dispatch.inputs).sort()).toEqual(['ambiente', 'progetto'])
    expect(prepara.permissions).toEqual({ contents: 'read' })
    const job = prepara.jobs.prepara
    expect(job.environment).toBe("${{ inputs.ambiente == 'test' && 'flotta-test' || 'flotta' }}")
    const nomi = job.steps.map((p) => p.name || p.uses)
    expect(nomi[0]).toBe('Controlla il progetto')
    expect(job.steps[0].run).toContain('è un progetto della regia')
    const p = job.steps.find((x) => x.name === "L'account dell'AI e il permesso del deploy")
    expect(p.run).toBe('node scripts/account-ai-locale.mjs --project "$PROGETTO" --deploy "firebase-adminsdk-fbsvc@$PROGETTO.iam.gserviceaccount.com"')
    const pulizia = job.steps.at(-1)
    expect(pulizia.name).toBe('Pulizia credenziali')
    expect(pulizia.if).toBe('always()')
    // Nessun input dentro un comando: solo variabili d'ambiente.
    for (const x of job.steps) expect(String(x.run || '')).not.toContain('${{')
  })
})
