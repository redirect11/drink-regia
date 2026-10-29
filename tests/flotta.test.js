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
    expect(app.with).toEqual({ repository: 'redirect11/tana-drink', ref: '${{ inputs.ref }}', path: 'app' })
    expect(passo(w, 'Deploy regole, indici, Functions e hosting')['working-directory']).toBe('app')
  })

  // Al primo deploy delle Functions i permessi degli agenti di Google
  // arrivano dopo qualche minuto (prova-bar): il deploy si riprova.
  it('il deploy si riprova due volte, a 90 secondi', () => {
    const deploy = passo(w, 'Deploy regole, indici, Functions e hosting').run
    expect(deploy).toContain('for tentativo in 1 2 3; do')
    expect(deploy).toContain('npx firebase-tools deploy --only firestore,storage,functions,hosting --project "$PROGETTO" --force')
    expect(deploy).toContain('sleep 90')
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

describe('provisiona-istanza.yml: il Terraform con i valori dell’environment', () => {
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

  it('gli agenti di Eventarc e Pub/Sub nascono col progetto, con i loro ruoli', () => {
    expect(tf).toContain('for_each   = toset(["eventarc.googleapis.com", "pubsub.googleapis.com"])')
    expect(tf).toContain('role     = "roles/eventarc.serviceAgent"')
    expect(tf).toContain('role     = "roles/iam.serviceAccountTokenCreator"')
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

  it('la regia di test lancia sull’environment di test, la produzione sul suo', () => {
    expect(env('functions/.env.drink-regia-test').FLOTTA_AMBIENTE).toBe('test')
    expect(env('functions/.env.drink-regia').FLOTTA_AMBIENTE).toBe('produzione')
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
