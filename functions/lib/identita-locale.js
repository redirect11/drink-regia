'use strict'

// ── L'AI DEL LOCALE SENZA CHIAVE (REQ-FLOTTA-077) ──────────────────────
//
// Daniele, 12/11/2026: «niente chiave». Ogni locale ha un account Google
// dedicato, ai-locale@<progetto>, creato dal suo Terraform: la sua Function
// AI gira con quello, chiede a Google un gettone d'identità (ID token) col
// destinatario della regia e lo manda. La regia ne fa controllare firma,
// emittente, scadenza e destinatario a Google, e dal NOME del progetto
// nell'indirizzo risale al locale. Il nome è già vincolato all'istanza
// (provisioning.js, progettoAtteso); il numero del progetto no, e per
// questo non si usa (revisore, 12/11/2026). Niente da rinnovare: lo fa
// Google.

const ACCOUNT = 'ai-locale'

// Un gettone di Google ha tre parti. La «Chiave AI» di prima
// (`<slug>.<segreto>`) non c'è più (REQ-FLOTTA-079).
const GETTONE = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/
const tokenDaBearer = (header) => {
  const m = GETTONE.exec(String(header || ''))
  return m ? m[1] : null
}

// Il destinatario: questa regia. Non l'indirizzo della Function: Cloud Run
// può togliere la firma ai gettoni destinati al servizio stesso, e la regia
// non potrebbe più controllarla.
const audienceAI = (progettoRegia) => (progettoRegia ? `regia-ai:${progettoRegia}` : null)

const EMITTENTI = ['https://accounts.google.com', 'accounts.google.com']
const PROGETTO_DEMO = 'drinkpos-demo'

// Chi ha chiesto il gettone: solo l'account dedicato di un progetto, che
// porta il nome del progetto. L'account predefinito no: porta il numero.
function chiDalGettone(payload) {
  if (!payload || !EMITTENTI.includes(payload.iss) || payload.email_verified !== true) return null
  const email = String(payload.email || '').toLowerCase()
  const m = new RegExp(`^${ACCOUNT}@([a-z][a-z0-9-]{4,28}[a-z0-9])\\.iam\\.gserviceaccount\\.com$`).exec(email)
  return m ? { progetto: m[1] } : null
}

// Chiede l'AI un locale attivo e vero: non simulato, non chiuso, non la
// demo. Il credito e il tetto li controlla poi ai.puoChiedere.
const puoChiedere = (ist) =>
  Boolean(ist) && ist.stato === 'attiva' && ist.simulata !== true && ist.licenza_stato !== 'chiusa' && ist.progetto !== PROGETTO_DEMO

// Il locale dal gettone, o null. `verifica` è il controllo di Google
// (verifyIdToken: firma, emittente, scadenza, destinatario) e lancia se il
// gettone non va; `cercaPerProgetto` dà le istanze con quel progetto. Si
// passano da fuori per provarla davvero.
async function localeDalGettone(gettone, { progettoRegia, verifica, cercaPerProgetto }) {
  const audience = audienceAI(progettoRegia)
  if (!audience) return null
  const payload = await verifica(gettone, audience)
  const chi = chiDalGettone(payload)
  if (!chi) return null
  const trovate = await cercaPerProgetto(chi.progetto)
  if (trovate.length !== 1) return null
  return puoChiedere(trovate[0].data) ? trovate[0].id : null
}

// Il motivo di un rifiuto, breve: il messaggio della libreria può contenere
// il gettone intero, e nel log non deve finire.
const motivoBreve = (e) => String(e?.message || e || 'errore').split(':')[0].slice(0, 80)

module.exports = { ACCOUNT, tokenDaBearer, audienceAI, chiDalGettone, puoChiedere, localeDalGettone, motivoBreve, EMITTENTI }
