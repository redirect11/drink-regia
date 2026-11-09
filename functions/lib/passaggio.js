'use strict'

// ── IL PASSAGGIO FRA LA REGIA E L'APP DEL LOCALE, LOGICA PURA ──────────
// (REQ-FLOTTA-030)
//
// L'utente, 02/11/2026: «Dobbiamo prevedere un single sign-on che se siamo
// loggati su backoffice o siamo loggati sulla nostra istanza, risulta
// loggato sia backoffice sia istanza per quell'utente», «mi serve qualcosa
// che sia sicuro e robusto», «in generale però questo deve valere per tutte
// le istanze». Ogni locale è un progetto Firebase con i suoi account, e due
// siti su domini diversi non condividono la sessione: il titolare passa
// dall'uno all'altro con un clic, con un codice che vale una volta sola.
//
// - DALLA REGIA ALL'APP: «Apri la tua app». La regia controlla che chi è
//   entrato sia il titolare di quel locale e che nel progetto del locale
//   il suo account (stessa email, verificata) sia admin; crea un codice e
//   rimanda all'app con il codice dopo il `#`.
// - DALL'APP ALLA REGIA: «Area clienti». L'app manda alla regia il suo ID
//   token, appena rinnovato; la regia lo verifica col progetto del locale,
//   vuole il titolare (stessa email, admin) e rimanda alla regia col codice.
// - LO SCAMBIO: la pagina che riceve il codice lo manda alla regia
//   (scambiaPassaggio) e riceve un accesso firmato per il suo progetto.
//
// LE PRECAUZIONI: il codice è casuale (32 byte), vale 60 secondi e una
// volta sola (si cancella mentre lo si usa, in una transazione); la regia
// ne conserva solo l'impronta (SHA-256); viaggia dopo il `#`, che il
// browser non manda a nessun server, né nei log né nel Referer; lo scambio
// lo accetta solo dal sito per cui è nato (l'Origin della richiesta).

const crypto = require('node:crypto')

const DURATA_MS = 60 * 1000
// Il ritorno alla regia vuole un token rinnovato da poco: un ID token
// rubato e vecchio non basta.
const TOKEN_FRESCO_S = 5 * 60
const CODICE = /^[A-Za-z0-9_-]{43}$/
const VERSI = ['app', 'regia']

const nuovoCodice = () => crypto.randomBytes(32).toString('base64url')
const impronta = (codice) => crypto.createHash('sha256').update(String(codice)).digest('hex')

// L'origine di un indirizzo (https://host), o null.
function origineDi(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

// Il documento del passaggio: dove porta, chi entra, da quale sito si
// può scambiare.
function nuovoPassaggio({ verso, progetto = null, uid, url, adesso = new Date() }) {
  if (!VERSI.includes(verso)) throw new Error('Verso del passaggio non valido')
  const origine = origineDi(url)
  if (!uid || !origine) throw new Error('Passaggio senza utente o senza un indirizzo https')
  return { verso, progetto, uid, origine, creato_il: adesso.toISOString(), scade_il: new Date(adesso.getTime() + DURATA_MS).toISOString() }
}

// Il corpo dello scambio: { codice }. Null se non è un codice.
function codiceDelCorpo(body) {
  const c = String(body?.codice ?? '').trim()
  return CODICE.test(c) ? c : null
}

// Si può scambiare? Il passaggio c'è, non è scaduto, e la richiesta viene
// dal sito per cui è nato.
function passaggioValido(doc, { origin, adesso = new Date() } = {}) {
  if (!doc) return { ok: false, perche: 'Codice non valido o già usato.' }
  if (Date.parse(doc.scade_il) <= adesso.getTime()) return { ok: false, perche: 'Codice scaduto: riprova dal tasto.' }
  if (!origin || origin !== doc.origine) return { ok: false, perche: 'Codice nato per un altro sito.' }
  return { ok: true, perche: null }
}

const emailUguali = (a, b) => Boolean(a) && String(a).trim().toLowerCase() === String(b || '').trim().toLowerCase()

// L'account nel progetto del locale è del titolare, e ci può entrare da
// admin? (dalla regia all'app)
function titolareNelLocale(utente, cliente) {
  if (!utente) return { ok: false, perche: 'Nel locale non c’è ancora il tuo account: lo crea il prossimo aggiornamento.' }
  if (utente.disabled) return { ok: false, perche: 'Il tuo account nel locale è disattivato.' }
  if (!utente.emailVerified || !emailUguali(utente.email, cliente?.email)) return { ok: false, perche: 'L’account del locale non è quello del titolare.' }
  if (utente.customClaims?.role !== 'admin') return { ok: false, perche: 'Nel locale il tuo account non è admin.' }
  return { ok: true, perche: null }
}

// Chi chiede di passare alla regia dall'app è il titolare, con un token
// appena rinnovato? (dall'app alla regia; `token` è il token decodificato)
function titolareDallApp(token, cliente, adesso = new Date()) {
  if (!token) return { ok: false, perche: 'Serve l’accesso.' }
  if (adesso.getTime() / 1000 - Number(token.iat) > TOKEN_FRESCO_S) return { ok: false, perche: 'Accesso troppo vecchio: rientra e riprova.' }
  if (token.email_verified !== true || !emailUguali(token.email, cliente?.email)) return { ok: false, perche: 'Solo il titolare passa all’area clienti.' }
  if (token.role !== 'admin') return { ok: false, perche: 'Solo il titolare passa all’area clienti.' }
  return { ok: true, perche: null }
}

// ── IL TITOLARE PER LA REGIA (audit del 09/11/2026, finding 17) ────────
// (REQ-FLOTTA-050) In tana-drink un admin crea altri admin: il ruolo da
// solo dice «amministra il locale», non «è il cliente della regia». Un
// dipendente admin poteva aggiungere o disdire moduli sulla subscription
// del titolare, con conguaglio immediato, o scegliere la versione dell'app.
// Per quello che tocca l'abbonamento o la versione serve anche che
// l'account sia quello del cliente: lo stesso uid della regia (M7:
// l'account nel locale nasce con l'uid di clienti/{uid}) oppure, per un
// locale esistente dove l'uid è un altro, l'email verificata uguale a
// quella del cliente. Niente vincolo sull'età del token, qui: non è un
// passaggio di sessione.
function stessoTitolare(token, cliente) {
  if (!token || !cliente || token.role !== 'admin') return false
  if (token.uid && cliente.uid && token.uid === cliente.uid) return true
  return token.email_verified === true && emailUguali(token.email, cliente.email)
}

// ── I DATI DEL TITOLARE NELL'APP (stesso requisito) ──────────────────
// L'utente: «Quando deployiamo poi passiamo tali info all'istanza», e quali:
// nome, indirizzo, telefono e intestazione fiscale. Nei campi di
// settings/bar che l'app già ha (src/lib/venue.js di tana-drink) e in
// quattro nuovi (telefono, partita IVA, codice fiscale, sede legale),
// scritti solo se nell'app sono vuoti: il titolare li può cambiare lì, e
// un deploy non deve riscriverli.
const riga = (...pezzi) => pezzi.filter(Boolean).join(' ').trim()
const capCitta = (ind) => riga(ind?.cap, ind?.citta, ind?.provincia ? `(${ind.provincia})` : '')

function datiDelLocale(cliente) {
  const sede = cliente?.locale?.indirizzo || {}
  const f = cliente?.fatturazione || {}
  const legale = f.sede_legale || {}
  return {
    venue_name: cliente?.nome_locale || '',
    venue_legal_name: f.ragione_sociale || '',
    venue_address: sede.via || '',
    venue_postal_city: capCitta(sede),
    venue_city: sede.citta || '',
    venue_phone: cliente?.locale?.telefono || '',
    venue_vat_number: f.partita_iva || '',
    venue_tax_code: f.codice_fiscale || '',
    venue_legal_address: riga(legale.via, legale.via ? '-' : '', capCitta(legale)).replace(/^- /, ''),
  }
}

const vuoto = (v) => v == null || (typeof v === 'string' && v.trim() === '')

// Solo quello che nell'app è vuoto, e che la regia sa.
function soloIVuoti(attuali, dati) {
  return Object.fromEntries(Object.entries(dati).filter(([k, v]) => !vuoto(v) && vuoto(attuali?.[k])))
}

module.exports = {
  DURATA_MS,
  TOKEN_FRESCO_S,
  nuovoCodice,
  impronta,
  origineDi,
  nuovoPassaggio,
  codiceDelCorpo,
  passaggioValido,
  titolareNelLocale,
  titolareDallApp,
  stessoTitolare,
  datiDelLocale,
  soloIVuoti,
}
