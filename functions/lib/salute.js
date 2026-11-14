'use strict'

// ── LA SALUTE DELLA FLOTTA, LOGICA PURA (REQ-FLOTTA-109) ───────────────
//
// Daniele, 14/11/2026, dopo la verifica a mano del 500 di
// drinkpos-prova-e2e: «dove le vedi queste cose?». Quella verifica era
// fatta con script che leggevano i registri di Google, l'IAM e Firestore:
// la sezione «Salute» del backoffice la rende un tasto. Per ogni locale:
// l'ultima presentazione, gli errori delle 24 ore, i permessi che mancano.
//
// Qui solo i conti, senza rete: la Function (index.js, saluteDellaFlotta)
// chiede a Google e passa qui le risposte.

const { eDemo } = require('./esistente.js')

// I PERMESSI CHE LA REGIA DEVE AVERE SU UN LOCALE: quelli dei tre ruoli che
// Terraform le dà (infra/istanza/main.tf, e scripts/account-runtime.mjs
// --locale). Si chiedono a Google con testIamPermissions: risponde coi
// permessi che chi chiede ha, senza leggere niente del locale e senza
// bisogno di un ruolo per chiederlo.
const PERMESSI_PROGETTO = ['datastore.entities.get', 'datastore.entities.update', 'firebaseauth.users.get']
const PERMESSI_FIRMA = ['iam.serviceAccounts.signBlob']
const RUOLO_DI = {
  'datastore.entities.get': { ruolo: 'roles/datastore.user', dove: 'progetto' },
  'datastore.entities.update': { ruolo: 'roles/datastore.user', dove: 'progetto' },
  'firebaseauth.users.get': { ruolo: 'roles/firebaseauth.viewer', dove: 'progetto' },
  'iam.serviceAccounts.signBlob': { ruolo: 'roles/iam.serviceAccountTokenCreator', dove: 'account firebase-adminsdk-fbsvc' },
}

// Si controllano i locali con un progetto, attivi o sospesi. Non la demo
// (la regia non le scrive niente, REQ-FLOTTA-019), non i simulati e non
// quelli della semina della regia di test (scripts/lib-semina.mjs): hanno
// un nome di progetto ma nessun progetto vero, e Google risponde «nessun
// permesso» anche per un progetto che non esiste (provato il 14/11/2026),
// quindi sembrerebbero tutti rotti. Non gli eliminati.
function daControllare(ist) {
  return Boolean(ist?.progetto) && !ist.simulata && !ist.semina && ist.stato !== 'eliminata' && !eDemo(ist)
}

// I ruoli che mancano, ognuno una volta. `progetto` e `firma` sono i
// permessi concessi; null vuol dire che la domanda non ha avuto risposta,
// e allora non si dice che manca qualcosa che non si sa.
function ruoliMancanti({ progetto, firma }) {
  const mancanti = []
  const aggiungi = (permesso) => {
    const r = RUOLO_DI[permesso]
    if (!mancanti.some((m) => m.ruolo === r.ruolo && m.dove === r.dove)) mancanti.push({ ...r })
  }
  if (Array.isArray(progetto)) PERMESSI_PROGETTO.filter((p) => !progetto.includes(p)).forEach(aggiungi)
  if (Array.isArray(firma)) PERMESSI_FIRMA.filter((p) => !firma.includes(p)).forEach(aggiungi)
  return mancanti
}

const senzaV = (v) => String(v || '').replace(/^v/, '')

// L'ultima presentazione (REQ-FLOTTA-026) accanto alla versione che la
// regia ha pubblicato (solo i locali della flotta ne hanno una: un locale
// esistente pubblica da sé, e lì «diversa» non vuol dire niente).
function statoPresentazione(ist, adesso = new Date()) {
  const p = ist?.presentazione || {}
  const pubblicata = ist?.versione || null
  const il = p.il || null
  return {
    versione: p.versione || null,
    il,
    prima_il: p.prima_il || null,
    ore_fa: il ? Math.floor((adesso.getTime() - Date.parse(il)) / 3600000) : null,
    pubblicata,
    diversa: Boolean(p.versione && pubblicata && senzaV(p.versione) !== senzaV(pubblicata)),
  }
}

const EMAIL = /[^\s@"'<>«»]+@[^\s@"'<>«»]+\.[A-Za-z]{2,}/g
const MAX_RIGHE = 30
const MAX_TESTO = 300
const testoDi = (v) => String(v?.textPayload ?? v?.jsonPayload?.message ?? '').trim()
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Il locale che una riga nomina, come parola intera: «prova-bar» non è
// «prova-bar-due».
function slugNominato(testo, slugs) {
  return slugs.find((s) => new RegExp(`(^|[^a-z0-9-])${escapeRe(s)}($|[^a-z0-9-])`).test(testo)) || null
}

// I registri della regia delle ultime 24 ore. Due tipi di voci: le
// richieste (httpRequest.status) e le righe scritte dalle Functions
// (severity ERROR). Per Function si contano le risposte 5xx; delle righe
// si tengono le più recenti, col locale quando lo nominano, e senza email:
// nel backoffice non serve sapere di chi era l'indirizzo.
function riassuntoRegistri(voci, slugs = []) {
  const perServizio = new Map()
  const righe = []
  for (const v of voci || []) {
    const servizio = v?.resource?.labels?.service_name || '?'
    const status = Number(v?.httpRequest?.status) || 0
    if (status >= 500) {
      const c = perServizio.get(servizio) || { servizio, errori: 0, ultimo: null }
      c.errori += 1
      if (!c.ultimo || v.timestamp > c.ultimo) c.ultimo = v.timestamp
      perServizio.set(servizio, c)
    } else if (!status && v?.severity === 'ERROR') {
      const testo = testoDi(v).replace(EMAIL, '«email»')
      if (testo) righe.push({ il: v.timestamp, servizio, slug: slugNominato(testo, slugs), testo: testo.length > MAX_TESTO ? `${testo.slice(0, MAX_TESTO)}…` : testo })
    }
  }
  return {
    per_function: [...perServizio.values()].sort((a, b) => b.errori - a.errori || a.servizio.localeCompare(b.servizio)),
    righe: righe.sort((a, b) => String(b.il).localeCompare(String(a.il))).slice(0, MAX_RIGHE),
  }
}

// Un permesso che manca rompe qualcosa (licenza, passaggio, dati del
// titolare): è un problema. Errori, un locale mai presentato o una
// versione diversa da quella pubblicata chiedono solo di guardare.
function giudizio({ mancanti, presentazione, errori }) {
  if (mancanti?.length) return 'problema'
  if (errori > 0 || !presentazione?.versione || presentazione?.diversa) return 'attenzione'
  return 'ok'
}

const ORDINE = { problema: 0, attenzione: 1, ok: 2 }

// Il rapporto che va al backoffice. `permessi`: { [slug]: { progetto,
// firma } } per i locali controllati; `registri`: { leggibili, voci } o
// { leggibili: false, perche }.
function rapporto({ istanze, permessi, registri, adesso = new Date() }) {
  const slugs = (istanze || []).map((i) => i.slug).filter(Boolean)
  const leggibili = registri?.leggibili === true
  const riassunto = leggibili ? riassuntoRegistri(registri.voci, slugs) : { per_function: [], righe: [] }
  const locali = (istanze || []).map((ist) => {
    const controllato = daControllare(ist)
    const presentazione = statoPresentazione(ist, adesso)
    const errori = riassunto.righe.filter((r) => r.slug === ist.slug).length
    const mancanti = controllato ? ruoliMancanti(permessi?.[ist.slug] || { progetto: null, firma: null }) : []
    return {
      slug: ist.slug,
      progetto: ist.progetto || null,
      stato: ist.stato || null,
      controllato,
      giudizio: controllato ? giudizio({ mancanti, presentazione, errori }) : null,
      errori,
      mancanti,
      presentazione,
    }
  })
  locali.sort((a, b) => (ORDINE[a.giudizio] ?? 3) - (ORDINE[b.giudizio] ?? 3) || String(a.slug).localeCompare(String(b.slug)))
  return {
    controllato_il: adesso.toISOString(),
    registri: { leggibili, perche: leggibili ? null : registri?.perche || 'registri non letti', ...riassunto },
    locali,
  }
}

module.exports = { PERMESSI_PROGETTO, PERMESSI_FIRMA, daControllare, ruoliMancanti, statoPresentazione, riassuntoRegistri, giudizio, rapporto }
