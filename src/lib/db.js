// ── TUTTO QUELLO CHE TOCCA FIREBASE NELLA REGIA ───────────────────────
// Un file solo, come api.js nell'app: le pagine non importano firebase.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCustomToken,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth'
import { doc, setDoc, getDoc, onSnapshot, collection, getDocs, getDocsFromServer, orderBy, query, updateDoc, limit, addDoc, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth, db, configurata, app } from './firebase.js'
import { STATI } from './istanze.js'
import { venditaPulita } from './vendita.js'

const serve = () => {
  if (!configurata) throw new Error('La regia non è collegata a Firebase: mancano le variabili VITE_FIREBASE_*.')
}

// ── accesso ──
export function osservaUtente(cb) {
  if (!configurata) {
    cb(null)
    return () => {}
  }
  // Col token si leggono il claim admin (REQ-FLOTTA-005) e il segno del
  // collaboratore (REQ-FLOTTA-098), che sceglie la vista della dashboard.
  return onIdTokenChanged(auth, async (u) => {
    if (!u) return cb(null)
    const t = await u.getIdTokenResult()
    cb({ uid: u.uid, email: u.email, emailVerificata: u.emailVerified === true, admin: t.claims.admin === true, collabora: t.claims.collabora || null })
  })
}

export const osservaAccesso = (cb) => (configurata ? onAuthStateChanged(auth, cb) : (cb(null), () => {}))

// Il documento del cliente per un account di Firebase lo scrive la Function
// `registraCliente` (audit del 09/11/2026, finding 4): è lei che controlla
// che lo slug non sia di nessun altro, in transazione, e il browser non
// può più creare clienti/{uid}. Si mandano i dati come li raccoglie il
// modulo, e lo `slug` solo se il titolare ne ha scelto uno perché il suo
// era preso; uid ed email li prende dall'account. Poi l'email di verifica
// se l'email non lo è ancora (Google la dà verificata). Se l'email non
// parte la registrazione resta valida: si rimanda dalla dashboard.
// Gli orari di servizio (REQ-FLOTTA-095) vanno con gli altri dati: la
// Function li ricontrolla e senza rifiuta.
async function creaCliente(u, { locale, orari, fatturazione, referente, slug = null }) {
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'registraCliente')
  const { data } = await fn({ locale, ...(orari ? { orari } : {}), fatturazione, referente, ...(slug ? { slug } : {}) })
  if (!u.emailVerified) await sendEmailVerification(u).catch(() => {})
  return data.cliente
}

// Lo slug che la Function ha rifiutato perché già in uso: il modulo chiede
// di sceglierne un altro. Gli altri errori restano come sono.
export const slugGiaInUso = (err) => String(err?.code || '').includes('already-exists') && err?.details?.campo === 'slug'

// IL TRAFFICO (REQ-FLOTTA-042): una vista di pagina o un passo della vendita
// alla Function `traccia`, che tiene solo contatori per giorno (niente
// cookie, niente identificativi: functions/lib/traffico.js). Non si aspetta
// e non può fallire: un contatore in meno non ferma niente. `keepalive`
// perché il checkout porta subito via dalla pagina. Il riferimento
// (document.referrer) va nel corpo perché lo conosce solo il browser:
// l'header Referer della chiamata sarebbe la pagina nostra che la fa. La
// Function non lo scrive mai com'è: lo riduce a una famiglia di un elenco
// chiuso (audit del 09/11/2026, finding 13).
function traccia(dati) {
  if (!configurata || typeof fetch !== 'function') return
  try {
    const url = `https://europe-west1-${app?.options?.projectId}.cloudfunctions.net/traccia`
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati), keepalive: true }).catch(() => {})
  } catch {
    /* mai un errore per il traffico */
  }
}
export const tracciaPagina = (pagina, lingua) => traccia({ pagina, lingua, riferimento: typeof document !== 'undefined' ? document.referrer : '' })
export const tracciaEvento = (evento) => traccia({ evento })

// La registrazione (REQ-FLOTTA-003): l'account, poi il documento del cliente.
// Se la Function rifiuta (lo slug è preso) l'account c'è già: al secondo
// tentativo, con lo stesso account entrato, non si ricrea (darebbe
// «email già in uso») e si scrive solo il cliente, come per chi entra con
// Google e completa dopo.
// FRA L'ACCOUNT E IL CLIENTE la registrazione non è finita, ma Firebase ha
// già fatto entrare l'utente: App.jsx, vedendolo, mandava alla dashboard e
// smontava la pagina, e se la Function rifiutava lo slug il messaggio e i
// dati inseriti sparivano (trovato dal primo collaudo automatico,
// 09/11/2026, REQ-DEV-009). Finché è in corso, App lascia la pagina dov'è.
// E RESTA IN CORSO ANCHE DOPO UN RIFIUTO (11/11/2026, tag v0.3.0-beta.6):
// con l'account creato e il cliente rifiutato l'utente è entrato ma la
// registrazione non è finita. Prima il segnale tornava falso, e al primo
// ridisegno di App la pagina rimbalzava alla dashboard mentre il titolare
// stava correggendo l'identificativo: a volte prima, a volte dopo il
// secondo «Avanti», secondo i tempi. Torna falso solo quando il cliente è
// scritto. Se la pagina si ricarica il segnale si perde, e va bene: la
// dashboard, a chi ha l'account senza il locale, fa completare i dati.
// `sospesa` è l'uid dell'account rimasto senza cliente: il segnale vale
// solo per lui. Se esce ed entra un altro, quello va alla dashboard.
let inCorso = false
let sospesa = null
export const registrazioneInCorso = () => inCorso || Boolean(sospesa && auth?.currentUser?.uid === sospesa)
export async function registra({ email, password, ...dati }) {
  serve()
  inCorso = true
  try {
    const stessa = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
    const utente = auth.currentUser && stessa(auth.currentUser.email, email) ? auth.currentUser : (await createUserWithEmailAndPassword(auth, email, password)).user
    // Da qui l'account c'è: se il cliente viene rifiutato, resta in sospeso.
    sospesa = utente.uid
    const cliente = await creaCliente(utente, dati)
    sospesa = null
    tracciaEvento('registrazione')
    return cliente
  } finally {
    inCorso = false
  }
}

// L'ACCESSO CON GOOGLE (REQ-FLOTTA-038). Firebase tiene un account per
// email: chi si è registrato con email e password e ha l'email verificata
// ritrova lo stesso account, con lo stesso uid, e quindi il suo locale e il
// ruolo admin. Chi entra con Google per la prima volta ha l'account ma non
// ancora il locale: la dashboard gli chiede i dati (completaRegistrazione).
// La finestra di Google e non il reindirizzamento: il sito e il dominio di
// Firebase Auth (authDomain) sono diversi, e col reindirizzamento i browser
// che bloccano i cookie di terze parti perdono l'accesso al ritorno.
export async function entraConGoogle() {
  serve()
  const google = new GoogleAuthProvider()
  // Chi ha più account Google sceglie ogni volta: entrare col locale
  // sbagliato è più facile che sembri.
  google.setCustomParameters({ prompt: 'select_account' })
  await signInWithPopup(auth, google)
}

// Il documento del cliente per chi ha già l'account (entrato con Google):
// l'email è quella dell'account.
export async function completaRegistrazione(dati) {
  serve()
  const u = auth.currentUser
  if (!u?.email) throw new Error('Serve l’accesso.')
  return creaCliente(u, dati)
}

export async function inviaVerificaEmail() {
  serve()
  if (auth.currentUser) await sendEmailVerification(auth.currentUser)
}

// Dopo il clic sul link di verifica il token in mano è vecchio: si rilegge.
export async function rileggiUtente() {
  serve()
  if (!auth.currentUser) return false
  await auth.currentUser.reload()
  await auth.currentUser.getIdToken(true)
  return auth.currentUser.emailVerified === true
}

export async function recuperaPassword(email) {
  serve()
  await sendPasswordResetEmail(auth, String(email || '').trim())
}

export async function accedi({ email, password }) {
  serve()
  await signInWithEmailAndPassword(auth, email, password)
}

export const esci = () => (configurata ? signOut(auth) : Promise.resolve())

// ── il cliente e la sua istanza ──
export function osservaCliente(uid, cb) {
  serve()
  return onSnapshot(doc(db, 'clienti', uid), (s) => cb(s.exists() ? s.data() : null))
}

// ISTANZA E RICHIESTA DEL TITOLARE, DALLA QUERY SUL SUO UID (REQ-FLOTTA-086).
// Lette per slug, un documento che non c'è ancora era negato dalle regole
// come uno di un altro (provato sull'emulatore il 13/11/2026): la dashboard
// non distingueva un cliente nuovo da uno scollegato, e l'ascolto aperto
// prima di «Attiva» si fermava al primo rifiuto. La query vincolata al suo
// uid è quella che le regole permettono: vuota torna vuota, senza errore, e
// resta viva, così il documento che la Function scrive dopo arriva da solo.
// Vale il documento del suo slug (null se non c'è); l'errore, se c'è, va a
// `errore`.
function osservaDelTitolare(collezione, uid, slug, cb, errore) {
  serve()
  return onSnapshot(
    query(collection(db, collezione), where('uid', '==', uid), limit(2)),
    (s) => cb(s.docs.find((d) => d.id === slug)?.data() ?? null),
    (e) => errore?.(e)
  )
}
export const osservaMiaIstanza = (uid, slug, cb, errore) => osservaDelTitolare('istanze', uid, slug, cb, errore)
export const osservaMiaRichiesta = (uid, slug, cb, errore) => osservaDelTitolare('richieste', uid, slug, cb, errore)

// ── GLI ORARI DI SERVIZIO (REQ-FLOTTA-095) ──
// Il browser non scrive mai orari_servizio (firestore.rules): li cambiano
// le Functions, che sanno dei 7 giorni e delle richieste. Il titolare li
// corregge nei 7 giorni o chiede il cambio col motivo; l'admin decide.
async function chiama(nome, dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), nome)
  const { data } = await fn(dati)
  return data
}
export const correggiOrari = (giorni) => chiama('correggiOrari', { giorni })
// I collaboratori di un locale (REQ-FLOTTA-098, REQ-FLOTTA-099): `azione`
// elenco, aggiungi ({ email }) o togli ({ uid }); lo `slug` lo manda solo
// l'admin. La vista di chi collabora la dà la regia.
export const gestisciCollaboratori = (azione, dati = {}) => chiama('gestisciCollaboratori', { azione, ...dati })
export const vistaCollaboratore = () => chiama('vistaCollaboratore', {})
export const chiediCambioOrari = (giorni, motivo) => chiama('chiediCambioOrari', { giorni, motivo })
export const decidiCambioOrari = (uid, esito, nota = null) => chiama('decidiCambioOrari', { uid, esito, nota })
// L'admin scrive o corregge gli orari di un locale (Daniele, 13/11/2026: «si»).
export const scriviOrariAdmin = (uid, giorni, nota = null) => chiama('scriviOrariAdmin', { uid, giorni, nota })

// Quando la query dell'istanza è vuota: la regia dice se un'app c'è ed è
// legata a un altro account ('scollegata'), se non c'è ('nessuna') o se è
// sua ('collegata'). Solo per il locale di chi chiama: non si passa niente.
export async function statoMiaApp() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'statoMiaApp')
  const { data } = await fn({})
  return data
}

// Dal backoffice: l'istanza scollegata passa al titolare del suo slug
// (REQ-FLOTTA-086). Torna l'uid vecchio e il nuovo.
export async function collegaIstanza(slug) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'collegaIstanza')
  const { data } = await fn({ slug })
  return data
}

// L'attivazione si chiede alla Function `chiediAttivazione` (audit del
// 22/10/2026, C2): è lei che rilegge cliente, abbonamento e impostazioni
// e scrive richieste/{slug}. Il browser non manda niente, e le regole non
// gli lascerebbero comunque scrivere la richiesta.
export async function chiediAttivazione() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'chiediAttivazione')
  const { data } = await fn({})
  tracciaEvento('attivazione')
  return data
}

// ── le impostazioni della regia (REQ-FLOTTA-011) ──
// Un documento solo, impostazioni/regia: `deploy_automatico` (spento di
// partenza dal 02/11/2026: l'utente vuole autorizzare lui ogni deploy dopo
// un acquisto, finché non lo accende). Lo legge il backoffice, lo scrive l'admin; la Function
// `chiediAttivazione` lo rilegge da sé per decidere lo stato iniziale.
export function osservaImpostazioniRegia(cb) {
  serve()
  return onSnapshot(doc(db, 'impostazioni', 'regia'), (s) => cb(s.exists() ? s.data() : {}))
}

export async function impostaDeployAutomatico(acceso) {
  serve()
  await setDoc(doc(db, 'impostazioni', 'regia'), { deploy_automatico: Boolean(acceso), aggiornate_il: new Date().toISOString() }, { merge: true })
}

// L'attivazione simulata (REQ-FLOTTA-072): solo sul test. Il server la
// rifiuta da sé sulla regia di produzione, qualunque cosa ci sia scritto.
export async function impostaAttivazioneSimulata(acceso) {
  serve()
  await setDoc(doc(db, 'impostazioni', 'regia'), { attivazione_simulata: Boolean(acceso), aggiornate_il: new Date().toISOString() }, { merge: true })
}

// L'admin autorizza (→ in coda, la Function la lancia) o rifiuta una richiesta.
export async function autorizzaRichiesta(slug) {
  serve()
  await updateDoc(doc(db, 'richieste', slug), { stato: STATI.IN_CODA, autorizzata_il: new Date().toISOString() })
}

// Il profilo completo di un Free che ha comprato (REQ-FLOTTA-011): la
// Function lancia l'aggiornamento e toglie la richiesta.
export async function autorizzaProfiloCompleto(slug) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'autorizzaProfiloCompleto')
  const { data } = await fn({ slug })
  return data
}

export async function rifiutaRichiesta(slug, motivo) {
  serve()
  await updateDoc(doc(db, 'richieste', slug), { stato: STATI.ERRORE, errore: motivo || 'Richiesta rifiutata', rifiutata_il: new Date().toISOString() })
}

// L'admin crea un locale da sé: account del titolare, documento del
// cliente, e se vuole l'attivazione subito (Function creaCliente).
export async function creaClienteDaAdmin(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'creaCliente')
  const { data } = await fn(dati)
  return data
}

// ── abbonamento (REQ-FLOTTA-007) ──
// La Function crea la sessione di Checkout di Stripe e risponde con l'url:
// il browser ci va, e al ritorno il webhook ha già aggiornato il cliente.
export async function avviaPagamento(scelta) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'creaCheckout')
  const { data } = await fn({ ...scelta, ritorno: window.location.origin })
  if (!data?.url) throw new Error('Il pagamento non è disponibile al momento: scrivici all’email del prodotto.')
  tracciaEvento('checkout')
  return data
}

// Il codice sconto all'acquisto (REQ-FLOTTA-028): la Function dice se c'è,
// quanto vale e se vince sul prezzo Fondatori; non scrive niente.
export async function verificaCodiceSconto(scelta, codice) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'verificaCodiceSconto')
  const { data } = await fn({ ...scelta, codice })
  return data
}

// Un codice al 100%: il piano si attiva senza pagamento.
export async function attivaConCodice(scelta, codice) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'attivaConCodice')
  const { data } = await fn({ ...scelta, codice })
  tracciaEvento('codice')
  return data
}

// Il portale clienti di Stripe: disdetta, carta, fatture (REQ-FLOTTA-023).
export async function apriPortaleAbbonamento() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'portaleAbbonamento')
  const { data } = await fn({})
  if (!data?.url) throw new Error('La gestione dell’abbonamento non è disponibile al momento: scrivici.')
  return data
}

// Il pagamento del rinnovo di un locale sospeso (REQ-FLOTTA-090): la
// fattura aperta di Stripe, o il portale se non ce n'è. Non si manda
// niente: il server cerca la fattura del cliente che chiama.
export async function apriPagamentoRinnovo() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'pagamentoRinnovo')
  const { data } = await fn({})
  if (!data?.url) throw new Error('Il pagamento non è disponibile al momento: scrivici.')
  return data
}

// IL PASSAGGIO FRA LA REGIA E L'APP (REQ-FLOTTA-030). «Apri la tua app»:
// la regia dà l'indirizzo dell'app con un codice monouso.
export async function apriLaTuaApp() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'passaggioVersoApp')
  const { data } = await fn({})
  if (!data?.url) throw new Error('L’app non si apre: riprova fra poco.')
  return data
}

// Dall'app alla regia: il codice si scambia con un accesso, e si entra.
export async function entraColPassaggio(codice) {
  serve()
  const indirizzo = `https://europe-west1-${app?.options?.projectId}.cloudfunctions.net/scambiaPassaggio`
  const res = await fetch(indirizzo, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codice }) })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok || !corpo.token) throw new Error(corpo.errore || 'Il codice non vale più: rientra dall’app.')
  await signInWithCustomToken(auth, corpo.token)
}

// ── lo stato di un'istanza (REQ-FLOTTA-008) ──
export async function impostaStatoIstanza(slug, stato, motivo = null) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'impostaStatoIstanza')
  await fn({ slug, stato, motivo })
}

// L'admin elimina un cliente registrato che non ha un'istanza, o la cui
// istanza è già stata eliminata (REQ-FLOTTA-059): via account e documenti.
export async function eliminaCliente(slug) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'eliminaCliente')
  await fn({ slug })
}

// Il titolare cambia piano, moduli o terminali (REQ-FLOTTA-010).
export async function cambiaScelta(scelta) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'cambiaScelta')
  const { data } = await fn(scelta)
  return data
}

// L'admin porta l'ultima versione dell'app a un locale (REQ-FLOTTA-009).
export async function aggiornaIstanza(slug, ref = null) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'aggiornaIstanza')
  const { data } = await fn(ref ? { slug, ref } : { slug })
  return data
}

// I rilasci a ondate (REQ-FLOTTA-012): il più recente per primo.
export async function elencoRilasci() {
  serve()
  const snap = await dalServer(collection(db, 'rilasci'))
  return snap.docs.map((d) => d.data()).sort((a, b) => String(b.creato_il).localeCompare(String(a.creato_il)))
}

// crea, avanza, riprova, indietro, ferma, annulla, gruppo, modalita: le
// decide la Function, che rilegge tutto.
export async function gestisciRilascio(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciRilascio', { timeout: 540_000 })
  const { data } = await fn({ azione, ...dati })
  return data
}

// ── gli aggiornamenti obbligatori o a scelta (REQ-FLOTTA-020) ──
// Le regole stanno in impostazioni/aggiornamenti; le cambia la Function,
// perché a ogni locale attivo va l'avviso con la sua data.
export function osservaRegoleAggiornamenti(cb) {
  serve()
  return onSnapshot(doc(db, 'impostazioni', 'aggiornamenti'), (s) => cb(s.exists() ? s.data() : {}))
}

export async function impostaRegoleAggiornamenti(regole) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'impostaRegoleAggiornamenti', { timeout: 540_000 })
  const { data } = await fn({ a_scelta: regole.a_scelta === true, solo_finche_paga: regole.solo_finche_paga === true })
  return data
}

// ── le licenze protette (BUG-125 di tana-drink) ──
// L'ultimo controllo di tutti i locali, e le due azioni: «allinea» riscrive
// ogni licenza dai dati della regia e verifica, «verifica» guarda soltanto.
export function osservaControlloLicenze(cb) {
  serve()
  return onSnapshot(doc(db, 'controlli', 'licenze'), (s) => cb(s.exists() ? s.data() : null))
}

export async function gestisciLicenze(azione) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciLicenze', { timeout: 540_000 })
  const { data } = await fn({ azione })
  return data
}

// ── le scadenze a eventi (REQ-FLOTTA-023) ──
// Un pagamento fuori da Stripe: fino a quando è pagato. La sua scadenza ha
// un compito alla data, che il server programma da sé. L'importo incassato
// (facoltativo, IVA esclusa) va nel libro dei movimenti (REQ-FLOTTA-041).
export async function registraPagamento(slug, pagato_fino_al, importo = null) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'registraPagamento')
  const { data } = await fn(importo != null && importo !== '' ? { slug, pagato_fino_al, importo } : { slug, pagato_fino_al })
  return data
}

// ── il commerciale (REQ-FLOTTA-041, REQ-FLOTTA-042) ──
// Il libro dei movimenti, i più recenti prima: lo scrivono le Functions.
export async function elencoMovimenti(quanti = 1000) {
  serve()
  const snap = await dalServer(query(collection(db, 'movimenti'), orderBy('il', 'desc'), limit(quanti)))
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
}

// Il traffico per giorno, gli ultimi `giorni` documenti (uno per giorno con
// almeno una vista): la dashboard riempie i giorni vuoti da sé.
export async function elencoTraffico(giorni = 90) {
  serve()
  const snap = await dalServer(query(collection(db, 'traffico'), orderBy('giorno', 'desc'), limit(giorni)))
  return snap.docs.map((d) => d.data())
}

// I posti Fondatori assegnati e prenotati (REQ-FLOTTA-031), per la dashboard.
export async function statoFondatori() {
  serve()
  const s = await getDoc(doc(db, 'fondatori', 'posti'))
  return s.exists() ? s.data() : null
}

// Una volta, dopo il deploy: la forma base dell'email dei clienti di prima
// (REQ-FLOTTA-083).
export async function allineaEmail() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'allineaEmail')
  const { data } = await fn({})
  return data
}

// Una volta, dopo il deploy: i compiti per le scadenze che c'erano già.
export async function programmaScadenze() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'programmaScadenze', { timeout: 540_000 })
  const { data } = await fn({})
  return data
}

// Il titolare: «aggiorna» o «salta» la versione proposta.
export async function sceltaAggiornamento(tag, scelta) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'sceltaAggiornamento')
  const { data } = await fn({ tag, scelta })
  return data
}

// ── backoffice ──
// I TRE ELENCHI SI CHIEDONO AL SERVER (REQ-FLOTTA-064). `getDocs`, quando
// la rete manca, non fallisce: risponde con quello che il browser ha in
// memoria, che per questi elenchi è niente. Il backoffice mostrava allora
// «Nessun cliente.», e per un admin i clienti sembravano spariti (trovato
// dal collaudo del tag v0.3.0-beta.10, 11/11/2026). `getDocsFromServer`
// fallisce se il server non risponde, e l'errore si dice in italiano.
// Dal 12/11/2026 (REQ-FLOTTA-067) leggono così anche rilasci, movimenti,
// traffico, temi, stili e cassetti AI: tutti gli elenchi del backoffice.
export const LETTURA_FALLITA = 'Non riesco a leggere dal server: controlla la connessione e riprova.'
async function dalServer(q) {
  try {
    return await getDocsFromServer(q)
  } catch (e) {
    // Un permesso negato resta com'è: è un altro problema, e va visto.
    if (e?.code === 'permission-denied') throw e
    throw new Error(LETTURA_FALLITA, { cause: e })
  }
}

export async function elencoClienti() {
  serve()
  const snap = await dalServer(query(collection(db, 'clienti'), orderBy('creato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

export async function elencoIstanze() {
  serve()
  const snap = await dalServer(collection(db, 'istanze'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

export async function elencoRichieste() {
  serve()
  const snap = await dalServer(collection(db, 'richieste'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

// L'admin rilancia un'attivazione fallita: la richiesta torna in coda.
export async function rilanciaAttivazione(slug) {
  serve()
  const r = await getDoc(doc(db, 'richieste', slug))
  if (!r.exists()) throw new Error('Richiesta non trovata')
  await updateDoc(doc(db, 'richieste', slug), { stato: STATI.IN_CODA, rilanciata_il: new Date().toISOString() })
}

// ── il cassetto AI (REQ-AI-003) ──
// Lo scrivono solo le Functions; il titolare lo legge. Un cassetto che non
// esiste ancora le regole lo negano (leggono il proprietario dal
// documento): per il sito è «nessun cassetto», non un errore.
export function osservaCassettoAI(slug, cb) {
  serve()
  return onSnapshot(
    doc(db, 'ai', slug),
    (s) => cb(s.exists() ? s.data() : null),
    () => cb(null)
  )
}

export async function ultimiConsumiAI(slug, quanti = 10) {
  serve()
  const snap = await getDocs(query(collection(db, 'ai', slug, 'consumi'), orderBy('il', 'desc'), limit(quanti)))
  return snap.docs.map((d) => d.data())
}

// Le ultime ricariche, con l'origine (pagamento, a mano, omaggio): il
// titolare vede anche un credito regalato.
export async function ultimeRicaricheAI(slug, quanti = 5) {
  serve()
  const snap = await getDocs(query(collection(db, 'ai', slug, 'ricariche'), orderBy('il', 'desc'), limit(quanti)))
  return snap.docs.map((d) => d.data())
}

// Il titolare compra un pacchetto: la Function apre il Checkout di Stripe,
// e il credito arriva col webhook a pagamento confermato.
export async function avviaRicaricaAI(pacchetto) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'creaRicaricaAI')
  const { data } = await fn({ pacchetto, ritorno: window.location.origin })
  if (!data?.url) throw new Error('La ricarica non è disponibile al momento: scrivici all’email del prodotto.')
  return data
}

// L'admin: tutti i cassetti, e le azioni su uno (ricarica a mano, tetto,
// acceso o spento, chiave dell'installazione).
export async function elencoCassettiAI() {
  serve()
  const snap = await dalServer(collection(db, 'ai'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

// Il modello AI di un tipo di richiesta (REQ-FLOTTA-092): passa dalla
// Function, che accetta solo l'admin e solo i modelli del listino. Il
// documento impostazioni/regia l'admin lo potrebbe scrivere da qui, ma la
// scelta va controllata dal server.
export async function impostaModelliAI(scelta) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciModelliAI')
  const { data } = await fn({ ai_modelli: scelta })
  return data
}

// I limiti della chat AI (REQ-FLOTTA-094): come i modelli, passano dalla
// Function gestisciLimitiChat, che accetta solo l'admin e solo valori
// dentro i loro tetti. Si manda solo la voce cambiata.
export async function impostaLimitiChat(cambio) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciLimitiChat')
  const { data } = await fn({ limiti_chat: cambio })
  return data
}

export async function gestisciCassettoAI(slug, azione, extra = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciCassettoAI')
  const { data } = await fn({ slug, azione, ...extra })
  return data
}

// L'admin registra un locale che esiste già (la Tana): niente provisioning.
export async function registraLocaleEsistente(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'registraLocaleEsistente')
  const { data } = await fn(dati)
  return data
}

// Un locale esistente affidato alla regia per gli aggiornamenti, o
// restituito al suo repository (REQ-FLOTTA-018).
// Il catalogo dei temi (REQ-FLOTTA-032): l'elenco lo legge l'admin;
// salvare, pubblicare e ritirare passa dalle Functions, che controllano.
export async function elencoTemi() {
  serve()
  const snap = await dalServer(query(collection(db, 'temi'), orderBy('aggiornato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

// Gli stili a ricetta (REQ-FLOTTA-034): le copie nel database (quelle che
// ritirano uno stile del repository), e pubblica o ritira.
export async function elencoStili() {
  serve()
  const snap = await dalServer(query(collection(db, 'stili'), orderBy('aggiornato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

export async function gestisciStili(azione, id) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciStili')
  const { data } = await fn({ azione, id })
  return data
}

export async function gestisciTemi(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciTemi')
  const { data } = await fn({ ...dati, azione })
  return data
}

// I temi in licenza di un locale, dall'admin (REQ-FLOTTA-039): gli id degli
// stili esclusivi o comprati; la licenza li segue.
export async function impostaTemi(slug, temi) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'impostaTemi')
  const { data } = await fn({ slug, temi })
  return data
}

// Quello che il locale ha installato dall'app (stili, temi, lo stile in
// uso), letto adesso dal suo progetto: { stili_installati, temi_installati, stile_menu }.
export async function temiDelLocale(slug) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'temiDelLocale')
  const { data } = await fn({ slug })
  return data
}

// ── i temi su misura (REQ-FLOTTA-040) ──
// Stanno in clienti/{uid}/temi_su_misura: il titolare li osserva nella
// dashboard, l'admin li legge nella scheda del locale; li scrivono solo le
// Functions.
export function osservaTemiSuMisura(uid, cb) {
  if (!configurata || !uid) {
    cb([])
    return () => {}
  }
  return onSnapshot(
    query(collection(db, 'clienti', uid, 'temi_su_misura'), orderBy('creato_il', 'desc')),
    (s) => cb(s.docs.map((d) => d.data())),
    () => cb([])
  )
}

export async function elencoTemiSuMisura(uid) {
  serve()
  const snap = await getDocs(query(collection(db, 'clienti', uid, 'temi_su_misura'), orderBy('creato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

// Il tema dal mockup: il file in base64 col suo tipo, la struttura del menù
// e una nota. Il modello ci mette un po': il tempo è quello della Function.
export async function creaTemaDaMockup(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'temaDaMockup', { timeout: 300_000 })
  const { data } = await fn(dati)
  return data
}

// L'admin scrive, pubblica e ritira (con `slug`); il titolare toglie e
// rimette i suoi.
export async function gestisciTemiSuMisura(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciTemiSuMisura')
  const { data } = await fn({ ...dati, azione })
  return data
}

// Il titolare chiede un tema al fornitore: { descrizione, struttura, riferimento, telefono }.
export async function chiediTemaSuMisura(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'chiediTemaSuMisura')
  const { data } = await fn(dati)
  return data
}

// I codici sconto (REQ-FLOTTA-028): l'elenco lo legge l'admin; crearli,
// disattivarli e applicarli passa dalle Functions.
export async function elencoSconti() {
  serve()
  const snap = await getDocs(query(collection(db, 'sconti'), orderBy('creato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

export async function gestisciSconti(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciSconti')
  const { data } = await fn({ ...dati, azione })
  return data
}

// Codice vuoto: lo sconto si toglie.
export async function applicaSconto(slug, codice) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'applicaSconto')
  const { data } = await fn({ slug, codice: codice || null })
  return data
}

export async function impostaAggiornamentiEsistente(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'impostaAggiornamentiEsistente')
  const { data } = await fn(dati)
  return data
}

// L'eliminazione di un locale (REQ-FLOTTA-014). Il titolare: «chiedi»
// (chiude e programma a 30 giorni) e «annulla». L'admin: «chiedi» con
// slug e subito, e «annulla». Si conferma col nome dell'app.
export async function gestisciEliminazione(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciEliminazione')
  const { data } = await fn({ azione, ...dati })
  return data
}

// Il link, valido 15 minuti, per scaricare l'archivio del proprio locale.
export async function scaricaArchivio() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'scaricaArchivio')
  const { data } = await fn({})
  return data
}

// La vendita (REQ-FLOTTA-015): la legge anche chi non ha fatto l'accesso,
// perché la prima pagina mostra il Free solo se è in vendita. Senza Firebase
// (i test, una build senza variabili) vale la vendita predefinita.
export function osservaVendita(cb) {
  if (!configurata) {
    cb(venditaPulita(null))
    return () => {}
  }
  return onSnapshot(doc(db, 'vendita', 'listino'), (s) => cb(venditaPulita(s.exists() ? s.data() : null)), () => cb(venditaPulita(null)))
}

// L'admin cambia cosa è in vendita: { free: true } o { moduli: { sumup: false } }.
// Ogni cambio resta nello storico, con chi l'ha fatto e quando.
export async function impostaVendita(cambio, chi = auth?.currentUser?.email || null) {
  serve()
  const il = new Date().toISOString()
  await setDoc(doc(db, 'vendita', 'listino'), { ...cambio, aggiornata_il: il, aggiornata_da: chi }, { merge: true })
  await addDoc(collection(db, 'vendita', 'listino', 'storico'), { cambio, il, da: chi })
}

// Coi pagamenti online spenti (REQ-FLOTTA-017) il titolare chiede di
// essere contattato: { piano, moduli, terminali, telefono, nota }.
export async function chiediContatto(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'chiediContatto')
  const { data } = await fn(dati)
  tracciaEvento('contatto')
  return data
}

// La richiesta di contatto del titolare, se c'è.
export function osservaContatto(uid, cb) {
  if (!configurata || !uid) {
    cb(null)
    return () => {}
  }
  return onSnapshot(doc(db, 'contatti', uid), (s) => cb(s.exists() ? s.data() : null), () => cb(null))
}

// L'admin: le richieste di contatto, le più recenti prima. `uid` è l'id del
// documento, quello che segnaContatto riceve: per la richiesta della
// dashboard è l'account, per una dall'app (REQ-FLOTTA-037) è
// `<account>_<modulo>`.
export async function elencoContatti() {
  serve()
  const snap = await getDocs(query(collection(db, 'contatti'), orderBy('chiesta_il', 'desc')))
  return snap.docs.map((d) => ({ ...d.data(), uid: d.id }))
}

// L'admin segna una richiesta come gestita (o la riapre).
export async function segnaContatto(uid, stato, chi = auth?.currentUser?.email || null) {
  serve()
  await updateDoc(doc(db, 'contatti', uid), { stato, gestita_il: stato === 'gestita' ? new Date().toISOString() : null, gestita_da: stato === 'gestita' ? chi : null })
}

// Il titolare sceglie il Free: il server controlla che sia in vendita.
export async function scegliFree() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'scegliFree')
  const { data } = await fn({})
  tracciaEvento('free')
  return data
}

// Le prove dei moduli (REQ-FLOTTA-016): il titolare accende una prova.
export async function provaModulo(modulo) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'provaModulo')
  const { data } = await fn({ modulo })
  return data
}

// «Cambia piano» dell'admin: { slug, piano, moduli, terminali, modo: 'stripe' | 'fuori' }.
export async function cambiaPianoAdmin(dati) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'cambiaPianoAdmin')
  const { data } = await fn(dati)
  return data
}
