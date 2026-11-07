// =====================================================================
//  LA SESSIONE DEL FIREBASE CLI, PER GLI SCRIPT DI MANUTENZIONE.
//
//  Copiato da scripts/lib-firestore.js di tana-drink, solo la parte che
//  serve qui: il token di accesso preso dal login del Firebase CLI
//  (`npx firebase-tools login`) e la lettura degli argomenti. Su questa
//  macchina non c'è gcloud (docs/actions-come-tana-drink.md): le API di
//  Google si chiamano con questo token, niente chiavi di service account
//  nel repository.
// =====================================================================
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

// L'OAuth client pubblico del Firebase CLI: sta dentro firebase-tools, non
// è un segreto. Il refresh token sta nel configstore dell'utente.
const CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

export async function accessToken() {
  const percorso = `${homedir()}/.config/configstore/firebase-tools.json`
  let cfg
  try {
    cfg = JSON.parse(readFileSync(percorso, 'utf8'))
  } catch {
    throw new Error('Sessione Firebase assente: esegui "npx firebase-tools login".')
  }
  const res = await (
    await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLI_CLIENT_ID,
        client_secret: CLI_CLIENT_SECRET,
        refresh_token: cfg.tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    })
  ).json()
  if (!res.access_token) throw new Error('Autenticazione fallita: rifai "npx firebase-tools login".')
  return res.access_token
}

// La stessa sessione del Firebase CLI, per l'Admin SDK (scripts/semina-test.mjs):
// l'oggetto che `refreshToken()` di firebase-admin accetta al posto di una
// chiave di service account. Chi ha fatto il login è Owner del progetto, e
// l'Admin SDK lavora con i suoi permessi: niente chiavi da custodire.
export function credenzialiCli() {
  const percorso = `${homedir()}/.config/configstore/firebase-tools.json`
  let cfg
  try {
    cfg = JSON.parse(readFileSync(percorso, 'utf8'))
  } catch {
    throw new Error('Sessione Firebase assente: esegui "npx firebase-tools login".')
  }
  if (!cfg?.tokens?.refresh_token) throw new Error('Sessione Firebase senza refresh token: rifai "npx firebase-tools login".')
  return { type: 'authorized_user', client_id: CLI_CLIENT_ID, client_secret: CLI_CLIENT_SECRET, refresh_token: cfg.tokens.refresh_token }
}

// Legge un argomento da riga di comando: --nome valore
export function arg(nome, fallback = null) {
  const i = process.argv.indexOf(`--${nome}`)
  return i >= 0 ? process.argv[i + 1] : fallback
}
export const flag = (nome) => process.argv.includes(`--${nome}`)
