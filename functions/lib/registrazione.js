'use strict'

// ── LA REGISTRAZIONE DEL TITOLARE, LATO SERVER (REQ-FLOTTA-045) ─────────
//
// Audit di sicurezza del 09/11/2026, finding 4: il documento clienti/{uid}
// lo scriveva il browser, e le regole controllavano la forma dello slug ma
// non che fosse libero. Due locali con lo stesso nome avevano lo stesso
// slug, e ogni ricerca per slug (la licenza, i dati del locale copiati
// nell'app, la subscription di Stripe) poteva prendere il cliente
// sbagliato. Da qui la registrazione passa dalla callable
// `registraCliente`: il documento si costruisce qui, con gli stessi campi
// che costruiva il sito (src/lib/clienti.js, nuovoCliente: un test li
// confronta), e si scrive in una transazione che prima verifica che nessun
// cliente e nessuna istanza abbiano quello slug. Le regole non hanno più
// nessuna `create` dai client.
//
// Qui la logica pura e la transazione, con il database passato da fuori
// (così si prova con un database finto); index.js mette l'accesso, il sito
// aperto e la traduzione in HttpsError.

const { slugDaNome } = require('./esistente.js')

const SLUG_VALIDO = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
// Gli stessi del sito (src/lib/clienti.js): i nomi che il prodotto usa per sé.
const RISERVATI = ['tana', 'demo', 'regia', 'admin', 'test']
const TIPI_LOCALE = ['cocktail bar', 'bar', 'pub', 'ristorante', 'pizzeria', 'enoteca', 'altro']
const PARTITA_IVA = /^[0-9]{11}$/

// Perché uno slug non va bene, o null se va bene. Stesse parole del sito.
function problemaSlug(slug) {
  if (!slug) return 'Serve un nome per il locale.'
  if (slug.length < 6) return 'Troppo corto: almeno 6 caratteri.'
  if (slug.length > 30) return 'Troppo lungo: al massimo 30 caratteri.'
  if (!SLUG_VALIDO.test(slug)) return 'Solo lettere minuscole, cifre e trattini; comincia con una lettera.'
  if (RISERVATI.some((r) => slug === r || (slug.startsWith(`${r}-`) && slug.length <= r.length + 1))) return 'Questo nome è riservato.'
  return null
}

// La registrazione rifiutata: `codice` è quello di HttpsError che index.js
// userà ('invalid-argument', 'already-exists', 'failed-precondition'),
// `dettagli` quello che il sito legge per capire cosa correggere.
class RegistrazioneRifiutata extends Error {
  constructor(codice, messaggio, dettagli = null) {
    super(messaggio)
    this.codice = codice
    this.dettagli = dettagli
  }
}

const SLUG_IN_USO = 'Questo identificativo è già in uso: scegline un altro.'

const pulito = (v) => String(v || '').trim()
const maiuscolo = (v) => pulito(v).toUpperCase()

// IL DOCUMENTO clienti/{uid} COME NASCE ALLA REGISTRAZIONE (schema 2), lo
// stesso di src/lib/clienti.js: `nome_locale` e `slug` in cima perché
// istanze, richieste e backoffice li leggono da lì; il resto a blocchi. Lo
// slug viene dal nome, oppure è quello che il titolare ha scelto quando il
// suo era già preso (`slug`): in tutti e due i casi deve essere valido.
function nuovoCliente({ uid, email, locale, fatturazione, referente, slug = null, adesso = new Date() }) {
  const nomeLocale = pulito(locale?.nome)
  const scelto = pulito(slug)
  const slugFinale = scelto || slugDaNome(nomeLocale)
  const problema = problemaSlug(slugFinale)
  if (problema) throw new RegistrazioneRifiutata('invalid-argument', problema, { campo: scelto ? 'slug' : 'nome' })
  const ora = adesso.toISOString()
  const sedeLocale = {
    via: pulito(locale?.via),
    cap: pulito(locale?.cap),
    citta: pulito(locale?.citta),
    provincia: maiuscolo(locale?.provincia),
  }
  return {
    uid,
    versione_schema: 2,
    email: pulito(email).toLowerCase(),
    nome_locale: nomeLocale,
    slug: slugFinale,
    locale: {
      tipo: TIPI_LOCALE.includes(locale?.tipo) ? locale.tipo : 'altro',
      indirizzo: sedeLocale,
      telefono: pulito(locale?.telefono),
      sito: pulito(locale?.sito),
    },
    fatturazione: {
      ragione_sociale: pulito(fatturazione?.ragione_sociale),
      partita_iva: pulito(fatturazione?.partita_iva).replace(/^IT/i, ''),
      codice_fiscale: maiuscolo(fatturazione?.codice_fiscale),
      pec: pulito(fatturazione?.pec).toLowerCase(),
      sdi: maiuscolo(fatturazione?.sdi),
      sede_legale: fatturazione?.stessa_sede
        ? sedeLocale
        : {
            via: pulito(fatturazione?.via),
            cap: pulito(fatturazione?.cap),
            citta: pulito(fatturazione?.citta),
            provincia: maiuscolo(fatturazione?.provincia),
          },
    },
    referente: {
      nome: pulito(referente?.nome),
      cognome: pulito(referente?.cognome),
      ruolo: pulito(referente?.ruolo),
      telefono: pulito(referente?.telefono),
    },
    consensi: {
      termini_il: ora,
      privacy_il: ora,
      marketing: Boolean(referente?.marketing),
    },
    creato_il: ora,
  }
}

// Il documento controllato come lo controllavano le regole Firestore
// (firestore.rules fino al 09/11/2026: slug valido, partita IVA di 11 cifre,
// consensi datati) più quello che le regole non potevano sapere: che i
// consensi siano stati dati davvero. Il sito li chiede prima di arrivare
// qui; chi chiamasse la Function a mano non li salta.
function documentoRegistrazione({ uid, email, dati, adesso = new Date() }) {
  if (!uid) throw new RegistrazioneRifiutata('unauthenticated', 'Serve l’accesso.')
  const mail = pulito(email).toLowerCase()
  if (!mail) throw new RegistrazioneRifiutata('failed-precondition', 'L’account non ha un’email: la registrazione vuole un’email.')
  if (dati?.referente?.termini !== true || dati?.referente?.privacy !== true) {
    throw new RegistrazioneRifiutata('invalid-argument', 'Per registrare il locale vanno accettati i termini e letta l’informativa sulla privacy.', { campo: 'consensi' })
  }
  const cliente = nuovoCliente({ uid, email: mail, locale: dati?.locale, fatturazione: dati?.fatturazione, referente: dati?.referente, slug: dati?.slug, adesso })
  if (!PARTITA_IVA.test(cliente.fatturazione.partita_iva)) throw new RegistrazioneRifiutata('invalid-argument', 'Partita IVA non valida (11 cifre).', { campo: 'partita_iva' })
  return cliente
}

// UN CLIENTE PER SLUG, O NESSUNO. Prima era `where('slug', '==').limit(1)`
// e con due clienti tornava «il primo», in silenzio (audit 09/11/2026,
// finding 4). Qui si chiedono due documenti: se arrivano tutti e due lo
// slug è ambiguo e lo si dice, invece di lavorare sul cliente sbagliato.
// Torna il documento (con ref, id e data()), come la query di prima.
class SlugAmbiguo extends Error {
  constructor(slug) {
    super(`Identificativo ambiguo: più di un cliente con lo slug ${slug}.`)
    this.slug = slug
  }
}

async function clientePerSlug(db, slug, transazione = null) {
  const query = db.collection('clienti').where('slug', '==', String(slug || '')).limit(2)
  const snap = transazione ? await transazione.get(query) : await query.get()
  if (snap.size > 1) throw new SlugAmbiguo(slug)
  return snap.docs[0] || null
}

// LA REGISTRAZIONE, IN TRANSAZIONE: si legge che lo slug sia libero (fra i
// clienti e fra le istanze: un locale eliminato tiene la sua istanza) e che
// l'account non abbia già un locale, e solo allora si scrive. Due
// registrazioni insieme con lo stesso slug: una delle due transazioni
// rilegge e trova l'altra. Torna il documento scritto.
// UN ACCOUNT PER PERSONA (REQ-FLOTTA-083, Daniele, 12/11/2026): chi si
// registra non usa un'email col «+», né una variante di un'email che ha già
// un account. La forma base: minuscole, senza «+qualcosa» e, per Gmail,
// senza punti (Gmail li ignora) e con gmail.com.
const DOMINI_GMAIL = ['gmail.com', 'googlemail.com']
function emailNorma(email) {
  const m = String(email || '').trim().toLowerCase()
  const at = m.lastIndexOf('@')
  if (at < 1) return m
  let locale = m.slice(0, at).split('+')[0]
  let dominio = m.slice(at + 1)
  if (DOMINI_GMAIL.includes(dominio)) {
    locale = locale.replace(/\./g, '')
    dominio = 'gmail.com'
  }
  return `${locale}@${dominio}`
}
const conPiu = (email) => String(email || '').split('@')[0].includes('+')
const EMAIL_CON_PIU = 'Per registrarti usa il tuo indirizzo senza «+…»: un account è uno per persona.'
const EMAIL_IN_USO = 'Esiste già un account con questa email: entra con quello.'

async function registraCliente(db, { uid, email, dati, adesso = new Date() }) {
  if (conPiu(email)) throw new RegistrazioneRifiutata('invalid-argument', EMAIL_CON_PIU, { campo: 'email' })
  const cliente = { ...documentoRegistrazione({ uid, email, dati, adesso }), email_norma: emailNorma(email) }
  const ref = db.doc(`clienti/${uid}`)
  await db.runTransaction(async (t) => {
    const [stessoSlug, istanza, mio, stessaEmail] = await Promise.all([
      t.get(db.collection('clienti').where('slug', '==', cliente.slug).limit(2)),
      t.get(db.doc(`istanze/${cliente.slug}`)),
      t.get(ref),
      t.get(db.collection('clienti').where('email_norma', '==', cliente.email_norma).limit(2)),
    ])
    if (mio.exists) throw new RegistrazioneRifiutata('already-exists', 'Questo account ha già un locale registrato.', { campo: 'account' })
    if (stessaEmail.docs.some((d) => d.id !== uid)) throw new RegistrazioneRifiutata('already-exists', EMAIL_IN_USO, { campo: 'email' })
    if (!stessoSlug.empty || istanza.exists) throw new RegistrazioneRifiutata('already-exists', SLUG_IN_USO, { campo: 'slug', slug: cliente.slug })
    t.set(ref, cliente)
  })
  return cliente
}

// I clienti nati prima di REQ-FLOTTA-083 non hanno la forma base: quelli da
// allineare, mai un'email col «+» (le prove dell'admin).
const emailDaAllineare = (clienti) =>
  clienti.filter((c) => !c.email_norma && c.email && !conPiu(c.email)).map((c) => ({ id: c.id, email_norma: emailNorma(c.email) }))

module.exports = { emailNorma, emailDaAllineare, EMAIL_CON_PIU, EMAIL_IN_USO, SLUG_VALIDO, RISERVATI, problemaSlug, RegistrazioneRifiutata, SLUG_IN_USO, nuovoCliente, documentoRegistrazione, SlugAmbiguo, clientePerSlug, registraCliente }
