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
} from 'firebase/auth'
import { doc, setDoc, getDoc, onSnapshot, collection, getDocs, orderBy, query, updateDoc, limit, addDoc } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { auth, db, configurata, app } from './firebase.js'
import { nuovoCliente } from './clienti.js'
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
  // Col token si legge il claim admin (REQ-FLOTTA-005).
  return onIdTokenChanged(auth, async (u) => {
    if (!u) return cb(null)
    const t = await u.getIdTokenResult()
    cb({ uid: u.uid, email: u.email, emailVerificata: u.emailVerified === true, admin: t.claims.admin === true })
  })
}

export const osservaAccesso = (cb) => (configurata ? onAuthStateChanged(auth, cb) : (cb(null), () => {}))

// La registrazione (REQ-FLOTTA-003): l'account, il documento del cliente
// con tutti i blocchi, e l'email di verifica. Se l'email non parte la
// registrazione resta valida: si rimanda dalla dashboard.
export async function registra({ email, password, locale, fatturazione, referente }) {
  serve()
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  const cliente = nuovoCliente({ uid: cred.user.uid, email, locale, fatturazione, referente })
  await setDoc(doc(db, 'clienti', cred.user.uid), cliente)
  await sendEmailVerification(cred.user).catch(() => {})
  return cliente
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

export function osservaIstanza(slug, cb) {
  serve()
  return onSnapshot(doc(db, 'istanze', slug), (s) => cb(s.exists() ? s.data() : null))
}

export function osservaRichiesta(slug, cb) {
  serve()
  return onSnapshot(doc(db, 'richieste', slug), (s) => cb(s.exists() ? s.data() : null))
}

// L'attivazione si chiede alla Function `chiediAttivazione` (audit del
// 22/10/2026, C2): è lei che rilegge cliente, abbonamento e impostazioni
// e scrive richieste/{slug}. Il browser non manda niente, e le regole non
// gli lascerebbero comunque scrivere la richiesta.
export async function chiediAttivazione() {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'chiediAttivazione')
  const { data } = await fn({})
  return data
}

// ── le impostazioni della regia (REQ-FLOTTA-011) ──
// Un documento solo, impostazioni/regia: `deploy_automatico` (true di
// partenza). Lo legge il backoffice, lo scrive l'admin; la Function
// `chiediAttivazione` lo rilegge da sé per decidere lo stato iniziale.
export function osservaImpostazioniRegia(cb) {
  serve()
  return onSnapshot(doc(db, 'impostazioni', 'regia'), (s) => cb(s.exists() ? s.data() : {}))
}

export async function impostaDeployAutomatico(acceso) {
  serve()
  await setDoc(doc(db, 'impostazioni', 'regia'), { deploy_automatico: Boolean(acceso), aggiornate_il: new Date().toISOString() }, { merge: true })
}

// L'admin autorizza (→ in coda, la Function la lancia) o rifiuta una richiesta.
export async function autorizzaRichiesta(slug) {
  serve()
  await updateDoc(doc(db, 'richieste', slug), { stato: STATI.IN_CODA, autorizzata_il: new Date().toISOString() })
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
  return data
}

// ── lo stato di un'istanza (REQ-FLOTTA-008) ──
export async function impostaStatoIstanza(slug, stato, motivo = null) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'impostaStatoIstanza')
  await fn({ slug, stato, motivo })
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
  const snap = await getDocs(collection(db, 'rilasci'))
  return snap.docs.map((d) => d.data()).sort((a, b) => String(b.creato_il).localeCompare(String(a.creato_il)))
}

// crea, avanza, riprova, indietro, ferma, annulla, gruppo: le decide la
// Function, che rilegge tutto.
export async function gestisciRilascio(azione, dati = {}) {
  serve()
  const fn = httpsCallable(getFunctions(app, 'europe-west1'), 'gestisciRilascio', { timeout: 540_000 })
  const { data } = await fn({ azione, ...dati })
  return data
}

// ── backoffice ──
export async function elencoClienti() {
  serve()
  const snap = await getDocs(query(collection(db, 'clienti'), orderBy('creato_il', 'desc')))
  return snap.docs.map((d) => d.data())
}

export async function elencoIstanze() {
  serve()
  const snap = await getDocs(collection(db, 'istanze'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

export async function elencoRichieste() {
  serve()
  const snap = await getDocs(collection(db, 'richieste'))
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
  const snap = await getDocs(collection(db, 'ai'))
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
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

// L'admin: le richieste di contatto, le più recenti prima.
export async function elencoContatti() {
  serve()
  const snap = await getDocs(query(collection(db, 'contatti'), orderBy('chiesta_il', 'desc')))
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
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
