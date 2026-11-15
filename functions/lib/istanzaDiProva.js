'use strict'

// ── L'ISTANZA DI PROVA, LOGICA PURA (REQ-FLOTTA-114) ───────────────────
//
// Daniele, 15/11/2026, su prova-e2e (l'istanza su cui tana-drink fa girare
// gli e2e): «teniamola ma deve rispondere sempre con la versione realmente
// installata. Regia non si caga le anteprime. Quello che possiamo fare è
// disattivare l'istanza e2e alla fine delle prove e nel backoffice la si
// vede come disattivata».
//
// L'admin segna di prova un'istanza senza cliente; le prove e2e la
// accendono all'inizio e la spengono alla fine (Function `istanzaDiProva`).
// È uno stato della regia, per il backoffice e la sentinella: spenta non
// cambia la licenza né la presentazione, che durante le prove servono.
//
// CHI LA CHIAMA (riscritta con le regole di REQ-FLOTTA-115). La prima
// versione accettava l'ID token di un utente qualunque del progetto di
// prova, e in un progetto dei locali chiunque si può registrare. Daniele,
// 15/11/2026: «il gestore e nessun altro su altre istanze puo cambiare
// qualcosa che interagisca con il backend di regia direttamente», niente
// ruoli degli utenti e niente GitHub. Le prove si presentano col gettone di
// Google dell'account di deploy del progetto di prova
// (`deploy@<progetto>.iam.gserviceaccount.com`, creato dal nostro
// Terraform), che le e2e hanno già per il deploy: la stessa verifica
// dell'AI (identita-locale.js), con un altro account e un altro
// destinatario, così un gettone dell'AI non vale qui e viceversa.

const identita = require('./identita-locale.js')

const ACCOUNT_PROVA = 'deploy'
const audienceProva = (progettoRegia) => (progettoRegia ? `regia-prova:${progettoRegia}` : null)

// L'istanza dal gettone, o null. `verifica` è il controllo di Google
// (firma, emittente, scadenza, destinatario) e lancia se il gettone non va;
// `cercaPerProgetto` dà le istanze con quel progetto: deve essercene una.
async function istanzaDalGettone(gettone, { progettoRegia, verifica, cercaPerProgetto }) {
  const audience = audienceProva(progettoRegia)
  if (!gettone || !audience) return null
  const chi = identita.chiDalGettone(await verifica(gettone, audience), ACCOUNT_PROVA)
  if (!chi) return null
  const trovate = await cercaPerProgetto(chi.progetto)
  return trovate.length === 1 ? trovate[0] : null
}

// Il corpo: { attiva } con un vero sì o no.
function corpoProva(body) {
  return typeof body?.attiva === 'boolean' ? { attiva: body.attiva } : null
}

function registroProva(attiva, adesso = new Date()) {
  return { prova: { attiva, il: adesso.toISOString() } }
}

// Solo un'istanza che l'admin ha segnato di prova, senza cliente: un locale
// vero non si spegne da qui, nemmeno col gettone di deploy del suo progetto.
const SCONOSCIUTA = { ok: false, status: 404, perche: 'Installazione non registrata nella regia.' }
function puoCambiare(ist, cliente) {
  if (!ist || ist.stato === 'eliminata') return SCONOSCIUTA
  if (cliente) return { ok: false, status: 403, perche: 'Ha un cliente: non è un’istanza di prova.' }
  if (!ist.prova) return { ok: false, status: 403, perche: 'Non è un’istanza di prova.' }
  return { ok: true }
}

module.exports = { ACCOUNT_PROVA, audienceProva, istanzaDalGettone, corpoProva, registroProva, puoCambiare }
