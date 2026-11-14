'use strict'

// ── I COLLABORATORI DI UN LOCALE, LOGICA PURA (REQ-FLOTTA-098, 099) ────
//
// Daniele, 14/11/2026: «se invece volessi fare in modo che anche altri
// admin possano fare il claim e vedere la dashboard. Ad esempio un
// collaboratore di flavio», e alla proposta: «implementa 1 e 2» (li
// aggiunge il titolare; li aggiunge l'admin dal backoffice).
//
// IL TITOLARE RESTA UNO: è chi paga, e solo lui tocca abbonamento, piano,
// moduli, chiusura (REQ-FLOTTA-050). Un collaboratore vede il locale e apre
// l'app col suo account. Non si diventa collaboratori da soli: in
// tana-drink ogni admin crea altri admin, quindi «admin del locale» non è
// una prova (audit del 09/11/2026, finding 17).
//
// DOVE STA: membri/{uid}, un documento per account (un account, un locale),
// scritto e letto solo dalle Functions; e il segno `collabora: <slug>` nei
// claim dell'account, che serve alla dashboard per sapere subito quale
// vista mostrare. Il segno non apre niente: ogni Function rilegge
// membri/{uid}.

const { emailNorma } = require('./registrazione.js')

const MASSIMO = 5
const RUOLO = 'collaboratore'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DA = ['titolare', 'admin']

class CollaboratoreRifiutato extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

// L'email scritta dal titolare, pulita; un'email col «+» no, come alla
// registrazione (REQ-FLOTTA-083: un account è uno per persona).
function emailCollaboratore(v) {
  const email = String(v ?? '').trim().toLowerCase()
  if (!EMAIL.test(email)) throw new CollaboratoreRifiutato('invalid-argument', 'Email del collaboratore non valida.')
  if (email.split('@')[0].includes('+')) throw new CollaboratoreRifiutato('invalid-argument', 'Usa l’indirizzo senza «+…»: un account è uno per persona.')
  return email
}

// Perché non si può aggiungere, o null. `clienteDellAccount` e
// `membroDellAccount`: quello che l'account con quell'email ha già, se
// l'account c'è.
function problemaAggiunta({ email, titolare, membri = [], clienteDellAccount = null, membroDellAccount = null }) {
  if (emailNorma(email) === emailNorma(titolare?.email)) return 'È l’email del titolare: ha già accesso al locale.'
  if (clienteDellAccount) return 'Questo account è già titolare di un locale: un account ha un locale solo.'
  if (membroDellAccount?.slug === titolare?.slug) return 'È già un collaboratore di questo locale.'
  if (membroDellAccount) return 'Questo account collabora già con un altro locale: un account ha un locale solo.'
  if (membri.length >= MASSIMO) return `Al massimo ${MASSIMO} collaboratori per locale.`
  return null
}

// Il documento membri/{uid}.
function nuovoMembro({ uid, email, slug, da, adesso = new Date() }) {
  return {
    uid,
    email,
    email_norma: emailNorma(email),
    slug,
    ruolo: RUOLO,
    aggiunto_da: DA.includes(da) ? da : 'titolare',
    aggiunto_il: adesso.toISOString(),
  }
}

// L'elenco che vedono titolare e admin: chi, da quando, aggiunto da chi.
const elencoCollaboratori = (membri) =>
  [...membri]
    .sort((a, b) => String(a.aggiunto_il).localeCompare(String(b.aggiunto_il)))
    .map((m) => ({ uid: m.uid, email: m.email, aggiunto_il: m.aggiunto_il, aggiunto_da: m.aggiunto_da ?? null }))

// I claim con e senza il segno: gli altri (admin della regia) restano.
const claimConLocale = (claim, slug) => ({ ...(claim || {}), collabora: slug })
function claimSenzaLocale(claim) {
  const { collabora: _TOLTO, ...resto } = claim || {}
  return resto
}

// I collaboratori di un locale, letti da membri/: qui e non in index.js,
// dove le ricerche per slug sono quelle dei clienti e passano tutte da
// docClientePerSlug (tests/registrazione.test.js). Un collaboratore ha un
// documento solo, quindi lo slug qui non è mai ambiguo.
const membriDelLocale = async (db, slug) => (await db.collection('membri').where('slug', '==', String(slug || '')).get()).docs.map((d) => d.data())

// Quello che il collaboratore vede: il locale, il piano, l'app. Niente
// email o uid del titolare, fatturazione, abbonamento, chiavi della build.
// Null se il documento non c'è, se il locale non è più quello o è
// eliminato.
function vistaCollaboratore({ membro, cliente, istanza }) {
  if (!membro || !cliente || cliente.slug !== membro.slug) return null
  if (istanza?.stato === 'eliminata') return null
  const attiva = istanza?.stato === 'attiva'
  return {
    slug: cliente.slug,
    nome_locale: cliente.nome_locale,
    piano: cliente.piano ?? null,
    moduli: cliente.moduli || [],
    terminali: cliente.terminali ?? null,
    app: {
      stato: istanza?.stato ?? null,
      url: attiva ? istanza.url || null : null,
      versione: istanza?.versione ?? istanza?.presentazione?.versione ?? null,
    },
  }
}

module.exports = {
  MASSIMO,
  RUOLO,
  CollaboratoreRifiutato,
  emailCollaboratore,
  problemaAggiunta,
  nuovoMembro,
  elencoCollaboratori,
  claimConLocale,
  claimSenzaLocale,
  membriDelLocale,
  vistaCollaboratore,
}
