// LE CREDENZIALI DELLA FLOTTA (REQ-FLOTTA-136, fase 0). I workflow della
// flotta entrano su Google in uno di due modi, scelto dall'environment:
//
// - SENZA CHIAVE (Workload Identity Federation): l'environment ha la
//   variabile FLOTTA_WIF_PROVIDER (il fornitore del pool «github» nel
//   progetto della regia) e FLOTTA_SA (l'account della flotta di quella
//   regia). GitHub dà al job un gettone firmato che dice repository ed
//   environment; Google lo scambia con un accesso di un'ora all'account,
//   solo se il fornitore riconosce questo repository e l'environment della
//   sua regia. Non c'è niente da rubare che valga fuori dal job.
// - CON LA CHIAVE di prima (PROVISIONING_SA_JSON), finché l'environment
//   non ha le due variabili: il passaggio si accende e si spegne da lì,
//   un environment alla volta, senza toccare i workflow.
//
// Scrive il file delle credenziali nel percorso dato (lo leggono Terraform,
// gcloud, firebase-tools e gli script, da GOOGLE_APPLICATION_CREDENTIALS) e
// stampa l'email dell'account. Il file del modo senza chiave contiene solo
// dove chiedere il gettone e come scambiarlo: lo stesso che scrive
// google-github-actions/auth. Il passo «Pulizia credenziali» lo cancella
// comunque.

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FORNITORE = /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/
const ACCOUNT = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@[a-z][a-z0-9-]{4,28}[a-z0-9]\.iam\.gserviceaccount\.com$/

// Il file per l'ingresso senza chiave, nel formato «external_account» delle
// librerie di Google. Il pubblico del gettone è il nome intero del
// fornitore: è quello che il fornitore accetta se non se ne dichiarano altri.
export function configurazioneSenzaChiave({ fornitore, account, urlGettone, tokenGettone }) {
  if (!FORNITORE.test(fornitore || '')) throw new Error(`FLOTTA_WIF_PROVIDER non valido: «${fornitore}» (projects/<numero>/locations/global/workloadIdentityPools/<pool>/providers/<fornitore>)`)
  if (!ACCOUNT.test(account || '')) throw new Error(`FLOTTA_SA non valido: «${account}» (un account di servizio <nome>@<progetto>.iam.gserviceaccount.com)`)
  if (!urlGettone || !tokenGettone) throw new Error('GitHub non dà il gettone a questo job: serve «permissions: id-token: write» sul job.')
  const pubblico = `//iam.googleapis.com/${fornitore}`
  const url = new URL(urlGettone)
  url.searchParams.set('audience', `https:${pubblico}`)
  return {
    type: 'external_account',
    audience: pubblico,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${account}:generateAccessToken`,
    credential_source: {
      url: url.toString(),
      headers: { Authorization: `Bearer ${tokenGettone}` },
      format: { type: 'json', subject_token_field_name: 'value' },
    },
  }
}

// Sceglie il modo dalle variabili dell'environment e restituisce il file da
// scrivere e l'email dell'account.
export function credenziali(env) {
  if (env.FLOTTA_WIF_PROVIDER) {
    const file = configurazioneSenzaChiave({
      fornitore: env.FLOTTA_WIF_PROVIDER,
      account: env.FLOTTA_SA,
      urlGettone: env.ACTIONS_ID_TOKEN_REQUEST_URL,
      tokenGettone: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
    })
    return { modo: 'senza chiave', email: env.FLOTTA_SA, file }
  }
  if (!env.SA_JSON) throw new Error("Manca il segreto PROVISIONING_SA_JSON, e l'environment non ha FLOTTA_WIF_PROVIDER (infra/README.md).")
  let chiave
  try { chiave = JSON.parse(env.SA_JSON) } catch { throw new Error('PROVISIONING_SA_JSON non è un JSON valido.') }
  if (chiave.type !== 'service_account' || !ACCOUNT.test(chiave.client_email || '')) throw new Error('PROVISIONING_SA_JSON non è la chiave di un account di servizio.')
  return { modo: 'con la chiave', email: chiave.client_email, file: chiave }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const percorso = process.argv[2]
  if (!percorso) { console.error('uso: node scripts/credenziali-flotta.mjs <file delle credenziali>'); process.exit(2) }
  try {
    const { modo, email, file } = credenziali(process.env)
    writeFileSync(percorso, JSON.stringify(file), { mode: 0o600 })
    console.error(`Credenziali della flotta: ${modo}, account ${email}.`)
    console.log(email)
  } catch (e) {
    console.error(`::error::${e.message}`)
    process.exit(1)
  }
}
