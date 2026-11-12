'use strict'

// ── L'AI DEL LOCALE SENZA CHIAVE (REQ-FLOTTA-077) ──────────────────────
//
// Daniele, 12/11/2026: «niente chiave». Le Functions del locale chiedono a
// Google un gettone d'identità (ID token) col destinatario la richiestaAI
// della loro regia; la regia ne fa controllare firma e destinatario a
// Google (index.js, localeDalGettone) e dall'indirizzo dell'account risale
// al locale. Niente da creare, salvare o rinnovare: Google rinnova il
// gettone da sé. Qui la logica pura.

// Un gettone di Google ha tre parti; la «Chiave AI» di prima
// (`<slug>.<segreto>`) due, e resta accettata solo per il passaggio.
const GETTONE = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const tokenDaBearer = (header) => {
  const m = GETTONE.exec(String(header || ''))
  return m ? m[1] : null
}

// Il destinatario: la richiestaAI di QUESTA regia. Un gettone chiesto per
// un altro servizio non vale qui.
const audienceAI = (progettoRegia) => (progettoRegia ? `https://europe-west1-${progettoRegia}.cloudfunctions.net/richiestaAI` : null)

const EMITTENTI = ['https://accounts.google.com', 'accounts.google.com']

// Chi ha chiesto il gettone: l'account predefinito di un progetto (le
// Functions di 2ª generazione girano con quello, e porta il NUMERO del
// progetto) o un account dedicato (porta il NOME del progetto). Nient'altro.
function chiDalGettone(payload) {
  if (!payload || !EMITTENTI.includes(payload.iss) || payload.email_verified !== true) return null
  const email = String(payload.email || '').toLowerCase()
  let m = /^(\d{6,20})-compute@developer\.gserviceaccount\.com$/.exec(email)
  if (m) return { numero_progetto: m[1] }
  m = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/.exec(email)
  if (m) return { progetto: m[1] }
  return null
}

// Chiede l'AI solo un locale attivo, e vero: un simulato non ha Functions.
const puoChiedere = (ist) => Boolean(ist) && ist.stato === 'attiva' && ist.simulata !== true

module.exports = { tokenDaBearer, audienceAI, chiDalGettone, puoChiedere, EMITTENTI }
