// =====================================================================
//  I SEGRETI CHE L'APP DICHIARA, IN UN'ISTANZA: creati se mancano.
//
//    node scripts/segreti-istanza.mjs --project drinkpos-bar-mario --segreti SUMUP_API_KEY
//
//  Le Functions dell'app di tana-drink dichiarano dei segreti
//  (defineSecret), e Firebase non le pubblica se uno manca: la prima
//  attivazione di prova si è fermata su SUMUP_API_KEY (29/10/2026). Il
//  valore vero è del locale (la sua chiave SumUp, quando compra il modulo):
//  qui si crea solo il segreto, con un segnaposto, perché il deploy passi.
//  Finché resta il segnaposto i pagamenti SumUp non fanno niente
//  (tana-drink/docs/functions.md). Un segreto che c'è già NON si tocca:
//  il valore vero messo dal locale non si sovrascrive mai.
//
//  Lo lanciano provisiona-istanza.yml e aggiorna-istanza.yml prima del
//  deploy: una versione nuova dell'app con un segreto in più non blocca
//  l'aggiornamento. Credenziali: GOOGLE_APPLICATION_CREDENTIALS del service
//  account di provisioning.
// =====================================================================
import { createRequire } from 'node:module'
import { arg } from './lib-firestore.js'

const require = createRequire(import.meta.url)
const { GoogleAuth } = require('../functions/node_modules/google-auth-library')

const PROGETTO = arg('project')
const SEGRETI = (arg('segreti', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
if (!PROGETTO || SEGRETI.some((s) => !/^[A-Z][A-Z0-9_]*$/.test(s))) {
  console.error('Uso: node scripts/segreti-istanza.mjs --project <id> --segreti NOME_A,NOME_B')
  process.exit(1)
}
const SEGNAPOSTO = 'non-configurato'

const client = await new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] }).getClient()
const BASE = `https://secretmanager.googleapis.com/v1/projects/${PROGETTO}/secrets`
const headers = { 'X-Goog-User-Project': PROGETTO }
const chiama = (url, opz = {}) => client.request({ url, headers, validateStatus: () => true, ...opz })

for (const nome of SEGRETI) {
  const c = await chiama(`${BASE}/${nome}`)
  if (c.status === 200) {
    console.log(`[segreti] = ${PROGETTO}: ${nome} c'è già, non lo tocco`)
    continue
  }
  if (c.status !== 404) {
    console.error(`[segreti] ✖ ${PROGETTO}: ${nome}: ${c.status} ${JSON.stringify(c.data).slice(0, 300)}`)
    process.exit(1)
  }
  const n = await chiama(`${BASE}?secretId=${nome}`, { method: 'POST', data: { replication: { automatic: {} } } })
  const v = n.status === 200
    ? await chiama(`${BASE}/${nome}:addVersion`, { method: 'POST', data: { payload: { data: Buffer.from(SEGNAPOSTO).toString('base64') } } })
    : n
  if (v.status !== 200) {
    console.error(`[segreti] ✖ ${PROGETTO}: ${nome}: ${v.status} ${JSON.stringify(v.data).slice(0, 300)}`)
    process.exit(1)
  }
  console.log(`[segreti] ✓ ${PROGETTO}: ${nome} creato col segnaposto`)
}
