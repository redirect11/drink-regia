'use strict'

// ── IL TRAFFICO DEL SITO, LOGICA PURA (REQ-FLOTTA-042) ───────────────────
//
// L'utente, 07/11/2026, vuole nella dashboard «il traffico e altre cose
// utili». Un servizio di analytics vorrebbe il banner dei cookie e manderebbe
// i visitatori a terzi; qui si contano solo NUMERI PER GIORNO, dentro la
// regia: quante viste, su quali pagine, in quale lingua, da dove
// (il dominio di chi ci ha mandato) e quali passi del percorso di vendita
// (registrazione, scelta del piano, checkout). Niente identificativi,
// niente cookie, niente indirizzi IP: un documento `traffico/{giorno}` con
// dei contatori. Non si può dire «quanti visitatori», solo quante viste, e
// lo si dice a schermo.
//
// Il sito chiama la Function `traccia` a ogni cambio di pagina e a ogni
// passo: qui si decide cosa contare e come si chiama il contatore; la
// Function incrementa.

// Il percorso si riduce alla prima parte: /backoffice/locali?x=1 → backoffice.
// Le pagine della regia sono poche e fisse; un percorso strano (un link
// vecchio, un tentativo) finisce in «altro», per non allungare il documento.
const PAGINE = ['home', 'en', 'registrati', 'accedi', 'accesso', 'dashboard', 'backoffice', 'termini', 'privacy']
// I passi del percorso di vendita che il sito segnala da sé (src/lib/db.js).
const EVENTI = ['registrazione', 'free', 'checkout', 'contatto', 'codice', 'attivazione']
const LINGUE = ['it', 'en']

// Un nome buono per una chiave di Firestore: niente punti né caratteri
// strani, al massimo 60.
const chiaveSicura = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'altro'

// La pagina da un percorso: «/» è home, «/en» la prima pagina inglese.
function paginaDi(percorso) {
  const p = String(percorso || '').split(/[?#]/)[0]
  const prima = p.split('/').filter(Boolean)[0] || 'home'
  const nome = chiaveSicura(prima)
  return PAGINE.includes(nome) ? nome : 'altro'
}

// Da dove si arriva: il solo dominio di document.referrer, senza il nostro
// (una pagina che manda a un'altra del sito non è una provenienza).
function provenienzaDi(riferimento, nostri = []) {
  let host
  try {
    host = new URL(String(riferimento || '')).hostname.toLowerCase()
  } catch {
    return 'diretto'
  }
  if (!host || nostri.some((n) => host === n || host.endsWith(`.${n}`))) return 'diretto'
  return chiaveSicura(host.replace(/^www\./, ''))
}

// Il giorno a Roma, AAAA-MM-GG: le giornate del bar e della dashboard
// contano in ora italiana, non in UTC.
function giornoDi(adesso = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(adesso)
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day}`
}

// Cosa incrementare per una chiamata del sito: { giorno, incrementi } con
// i nomi dei campi (col punto per i sottocampi) e di quanto. Null se non
// c'è niente da contare (una chiamata vuota o sbagliata). `nostri` sono i
// domini del sito stesso.
function incrementiDi(dati, { adesso = new Date(), nostri = [] } = {}) {
  if (!dati || typeof dati !== 'object') return null
  const giorno = giornoDi(adesso)
  const incrementi = {}
  if (dati.evento != null) {
    const evento = chiaveSicura(dati.evento)
    if (!EVENTI.includes(evento)) return null
    incrementi[`eventi.${evento}`] = 1
    return { giorno, incrementi }
  }
  if (dati.pagina == null) return null
  const pagina = paginaDi(dati.pagina)
  const lingua = LINGUE.includes(dati.lingua) ? dati.lingua : 'it'
  incrementi.viste = 1
  incrementi[`pagine.${pagina}`] = 1
  incrementi[`lingue.${lingua}`] = 1
  incrementi[`provenienze.${provenienzaDi(dati.riferimento, nostri)}`] = 1
  return { giorno, incrementi }
}

// Gli incrementi coi nomi col punto diventano un oggetto annidato, per un
// set con merge: { viste: 1, 'pagine.home': 1 } → { viste: 1, pagine: { home: 1 } }.
function annidati(incrementi, valore = (v) => v) {
  const out = {}
  for (const [chiave, v] of Object.entries(incrementi || {})) {
    const parti = chiave.split('.')
    let p = out
    for (const parte of parti.slice(0, -1)) p = p[parte] = p[parte] || {}
    p[parti[parti.length - 1]] = valore(v)
  }
  return out
}

module.exports = { PAGINE, EVENTI, chiaveSicura, paginaDi, provenienzaDi, giornoDi, incrementiDi, annidati }
