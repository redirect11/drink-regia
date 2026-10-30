'use strict'

// I WORKFLOW DELLA FLOTTA NELLA REGIA (REQ-FLOTTA-006, REQ-FLOTTA-009,
// docs/flotta-nella-regia.md). Dal 29/10/2026 l'attivazione e
// l'aggiornamento dei locali stanno qui, non in tana-drink. Un workflow non
// ha altri test: qui si controllano le cose che, rotte, si scoprirebbero
// solo con un locale vero a metà. Gli input che le Functions mandano sono
// quelli che il workflow dichiara (GitHub rifiuta un lancio con un input in
// più); ogni regia lancia sul suo environment; gli input non entrano mai
// in un comando (audit del 22/10/2026, C1); l'app arriva da tana-drink.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const job = (w) => Object.values(w.jobs)[0]
const passi = (w) => job(w).steps
const passo = (w, nome) => passi(w).find((s) => s.name === nome)

const richiesta = { slug: 'bar-mario', nome_locale: 'Bar Mario', piano: 'base', moduli: ['staff'], uid: 'u1' }
const WORKFLOW = [
  ['provisiona-istanza.yml', provisiona, dispatchPayload(richiesta, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })],
  ['aggiorna-istanza.yml', aggiorna, dispatchAggiornamento(richiesta, { ref: 'main', app: 'v1.10.0', ambiente: 'test' })],
]

describe.each(WORKFLOW)('%s', (_, w, corpo) => {
  it('parte solo a comando, con esattamente gli input che le Functions mandano', () => {
    expect(Object.keys(eventi(w))).toEqual(['workflow_dispatch'])
    expect(Object.keys(eventi(w).workflow_dispatch.inputs).sort()).toEqual(Object.keys(corpo.inputs).sort())
  })

  it('ogni regia sul suo environment: test su flotta-test, il resto su flotta', () => {
    expect(eventi(w).workflow_dispatch.inputs.ambiente).toMatchObject({ type: 'choice', options: ['produzione', 'test'], default: 'produzione' })
    expect(job(w).environment).toBe("${{ inputs.ambiente == 'test' && 'flotta-test' || 'flotta' }}")
  })

  it('gli input non entrano mai in un comando: passano dalle variabili d’ambiente', () => {
    for (const s of passi(w)) {
      expect(s.run || '', s.name).not.toMatch(/\$\{\{\s*(inputs|github\.event\.inputs)\./)
    }
  })

  it('il primo passo controlla gli input, con lo stesso slug delle Functions', () => {
    expect(passi(w)[0].name).toBe('Input validi')
    expect(passi(w)[0].run).toContain('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')
    expect(passi(w)[0].run).toContain('^[A-Za-z0-9._/-]{1,100}$')
  })

  it('l’app è tana-drink alla versione chiesta, in app/', () => {
    const app = passi(w).find((s) => s.uses?.startsWith('actions/checkout') && s.with?.repository)
    expect(app.with).toEqual({ repository: 'redirect11/tana-drink', ref: '${{ inputs.ref }}', path: 'app', 'fetch-depth': 0 })
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
    expect(w.env.PROFILO).toBe('${{ inputs.profilo }}')
    expect(passi(w)[0].run).toContain('[[ "$PROFILO" =~ ^(completo|leggero)$ ]]')
    const deploy = passo(w, 'Deploy regole, indici, Functions e hosting').run
    expect(deploy).toContain('if [ "$PROFILO" = "leggero" ]; then SOLO=firestore,hosting; else SOLO=firestore,storage,functions,hosting; fi')
    for (const nome of ['Lo Storage del locale', "I segreti dell'app"]) expect(passo(w, nome).if).toBe("env.PROFILO == 'completo'")
    expect(passo(w, 'Esito alla regia').run).toContain('profilo: process.env.PROFILO || null')
  })

  // tana-drink, REQ-LIC-004 (30/10/2026): l'app sa di essere leggera già
  // dalla build, prima di leggere la licenza.
  it('la build dice il profilo all’app', () => {
    expect(passo(w, 'Build').env).toMatchObject({ CLIENTE: '${{ inputs.slug }}', VITE_PROFILO: '${{ inputs.profilo }}' })
  })

  // Le Functions dell'app dichiarano dei segreti, e Firebase non le
  // pubblica se ne manca uno (la prima attivazione di prova, SUMUP_API_KEY).
  it('i segreti dichiarati dall’app si creano prima del deploy', () => {
    expect(w.env.SEGRETI_APP).toBe('SUMUP_API_KEY')
    const nomi = passi(w).map((s) => s.name)
    expect(passo(w, "I segreti dell'app").run).toBe('node scripts/segreti-istanza.mjs --project "$PROGETTO" --segreti "$SEGRETI_APP"')
    expect(nomi.indexOf("I segreti dell'app")).toBeGreaterThan(nomi.indexOf('Dipendenze'))
    expect(nomi.indexOf("I segreti dell'app")).toBeLessThan(nomi.indexOf('Deploy regole, indici, Functions e hosting'))
    expect(passo(w, 'Dipendenze').run).toContain('npm ci --prefix functions')
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
})

// Portati da tana-drink (tests/unit/provisionaIstanza.test.js del ramo
// feature/flotta, chiuso il 30/10/2026): le cose che la regia e Terraform
// danno per scontate, e che rotte si vedrebbero solo su un locale vero.
describe.each(WORKFLOW)('%s: l’app di produzione di quel locale', (_, w) => {
  const nomi = () => passi(w).map((s) => s.name)
  const app = () => passi(w).findIndex((s) => s.with?.repository === 'redirect11/tana-drink')

  it('il progetto è drinkpos-<slug>, la build è di produzione e per quel cliente', () => {
    expect(w.env.PROGETTO).toBe('drinkpos-${{ inputs.slug }}')
    const build = passo(w, 'Build')
    expect(build.env).toMatchObject({ CLIENTE: '${{ inputs.slug }}', VITE_APP_ENV: 'production' })
    expect(build.run).toBe('npm run build')
  })

  it('i passi vanno in ordine, fino alla pulizia delle credenziali per ultima', () => {
    const ordine = [
      ...(w === provisiona ? ['Terraform apply'] : []),
      'La cartella del cliente',
      'Build',
      'Deploy regole, indici, Functions e hosting',
      ...(w === provisiona ? ["Licenza e nome del locale nell'istanza"] : []),
      'Versione pubblicata',
      'Esito alla regia',
      'Pulizia credenziali',
    ].map((n) => nomi().indexOf(n))
    expect(ordine.every((i) => i >= 0)).toBe(true)
    expect([...ordine].sort((a, b) => a - b)).toEqual(ordine)
    expect(nomi().at(-1)).toBe('Pulizia credenziali')
  })

  it('l’esito dice errore se il job non è riuscito, e porta la versione', () => {
    const run = passo(w, 'Esito alla regia').run
    expect(run).toMatch(/else STATO=errore;/)
    expect(run).toContain('"${VERSIONE:-}"')
  })

  it('le credenziali si cancellano sempre, anche se qualcosa è andato storto', () => {
    const pulizia = passo(w, 'Pulizia credenziali')
    expect(pulizia.if).toBe('always()')
    expect(pulizia.run).toMatch(/^rm -f "\$RUNNER_TEMP\/sa\.json"/)
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
    // Prima di credenziali e Terraform: fermarsi qui non costa niente.
    expect(i).toBeLessThan(nomi().indexOf('Credenziali di provisioning'))
  })

  it('un’app che non sa compilare per un cliente (la 1.9.x) si ferma, su tutte e due le regie', () => {
    const controllo = passo(w, "La versione dell'app va bene per questa regia?").run
    const primo = controllo.slice(0, controllo.indexOf('if [ "$AMBIENTE"'))
    expect(primo).toMatch(/if \[ ! -f scripts\/genera-cliente\.mjs \]; then[\s\S]*exit 1/)
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
      expect(p.if).toBe("env.PROFILO == 'completo'")
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
    expect(nomi.indexOf('Lo Storage del locale')).toBeGreaterThan(nomi.indexOf('Dipendenze'))
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
    expect(job(elimina).environment).toBe("${{ inputs.ambiente == 'test' && 'flotta-test' || 'flotta' }}")
    expect(elimina.concurrency.group).toBe('istanza-${{ inputs.slug }}')
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
})
