// L'ACCOUNT CON CUI GIRANO LE FUNCTIONS DELLA REGIA (REQ-FLOTTA-058).
//
// Audit del 09/11/2026, finding 3: le Functions giravano con l'account
// predefinito di Compute Engine, Editor sulla regia e autorizzato su ogni
// locale. Qui si fissa il contratto: un account dedicato con i soli ruoli
// che il codice usa, niente Editor né Owner, acceso da una variabile
// d'ambiente per progetto; il test lo ha, la produzione lo accende una
// persona quando il test regge. Lo script si legge come testo: ha effetti
// all'avvio (crea l'account) e non si importa.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const script = readFileSync('scripts/account-runtime.mjs', 'utf8')
const indice = readFileSync('functions/index.js', 'utf8')

describe('l’account di runtime delle Functions', () => {
  it('le opzioni comuni delle Functions prendono l’account da RUNTIME_SERVICE_ACCOUNT, se c’è', () => {
    expect(indice).toMatch(/const OPTS = \{\s*region: 'europe-west1',\s*\.\.\.\(process\.env\.RUNTIME_SERVICE_ACCOUNT \? \{ serviceAccount: process\.env\.RUNTIME_SERVICE_ACCOUNT \} : \{\}\),\s*\}/)
  })

  it('ogni progetto ha la riga che accende l’account, con la sua email; la accende una persona', () => {
    // La riga è spiegata e pronta, ma commentata finché lo script non ha
    // creato l'account: con la riga attiva e l'account assente il deploy si
    // ferma. L'ordine (script, REGIA_SA_EMAIL, riga, deploy) sta nel file.
    for (const progetto of ['drink-regia-test', 'drink-regia']) {
      const env = readFileSync(`functions/.env.${progetto}`, 'utf8')
      expect(env).toMatch(new RegExp(`^#? ?RUNTIME_SERVICE_ACCOUNT=runtime-regia@${progetto}\\.iam\\.gserviceaccount\\.com$`, 'm'))
      expect(env).toContain('scripts/account-runtime.mjs')
    }
  })

  it('lo script dà solo i ruoli che il codice usa: niente Editor, niente Owner', () => {
    expect(script).not.toMatch(/roles\/(editor|owner)/)
    for (const ruolo of ['roles/datastore.user', 'roles/firebaseauth.admin', 'roles/logging.logWriter', 'roles/eventarc.eventReceiver', 'roles/run.invoker', 'roles/cloudtasks.enqueuer']) {
      expect(script).toContain(`'${ruolo}'`)
    }
    // Firma come sé stesso (token di passaggio, URL firmati) e agisce come
    // sé (i task della coda delle scadenze); il deploy agisce come lui.
    expect(script).toContain("const RUOLI_SU_SE_STESSO = ['roles/iam.serviceAccountTokenCreator', 'roles/iam.serviceAccountUser']")
    expect(script).toContain("['roles/iam.serviceAccountUser']")
  })

  it('sui locali dà gli stessi tre ruoli del Terraform, così il passaggio non lascia buchi', () => {
    const tf = readFileSync('infra/istanza/main.tf', 'utf8')
    expect(script).toContain("const RUOLI_LOCALE = ['roles/datastore.user', 'roles/firebaseauth.viewer']")
    expect(script).toContain("const RUOLO_FIRMA_LOCALE = 'roles/iam.serviceAccountTokenCreator'")
    for (const ruolo of ['roles/datastore.user', 'roles/firebaseauth.viewer', 'roles/iam.serviceAccountTokenCreator']) {
      expect(tf).toMatch(new RegExp(`role\\s*=\\s*"${ruolo}"\\s*\\n\\s*member\\s*=\\s*"serviceAccount:\\$\\{var\\.regia_sa_email\\}"`))
    }
  })

  it('lo script non toglie niente: il vecchio account lo leva una persona', () => {
    // Nessuna rimozione di membri dalle policy: conIRuoli aggiunge e basta.
    expect(script).not.toMatch(/members\.filter|splice|delete /)
    expect(script).toContain("import { conIRuoli } from './lib-iam.js'")
  })
})
