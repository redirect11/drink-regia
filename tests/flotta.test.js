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

  // L'app usa firebase/storage e il deploy pubblica storage.rules: senza il
  // bucket la prima attivazione di prova si è fermata al deploy.
  it('lo Storage dell’app nasce col progetto, e la build ne riceve il nome', () => {
    expect(tf).toContain('"firebasestorage.googleapis.com"')
    expect(tf).toContain('name                        = "${local.progetto}.firebasestorage.app"')
    expect(tf).toContain('resource "google_firebase_storage_bucket" "storage"')
    expect(tf).toContain('VITE_FIREBASE_STORAGE_BUCKET      = google_firebase_storage_bucket.storage.bucket_id')
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
