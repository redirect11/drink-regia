'use strict'

// ── IL TRAFFICO DEL SITO, LOGICA PURA (REQ-FLOTTA-042) ───────────────────
//
// L'utente, 07/11/2026, vuole nella dashboard «il traffico e altre cose
// utili». Un servizio di analytics vorrebbe il banner dei cookie e manderebbe
// i visitatori a terzi; qui si contano solo NUMERI PER GIORNO, dentro la
// regia: quante viste, su quali pagine, in quale lingua, da dove
// (la famiglia del sito che ci ha mandato) e quali passi del percorso di
// vendita (registrazione, scelta del piano, checkout). Niente identificativi,
// niente cookie, niente indirizzi IP: un documento `traffico/{giorno}` con
// dei contatori. Non si può dire «quanti visitatori», solo quante viste, e
// lo si dice a schermo.
//
// Il sito chiama la Function `traccia` a ogni cambio di pagina e a ogni
// passo: qui si decide cosa contare e come si chiama il contatore; la
// Function incrementa.
//
// OGNI CHIAVE DEL DOCUMENTO VIENE DA UN ELENCO CHIUSO (audit del
// 09/11/2026, finding 13). Prima la provenienza era il dominio di chi ci
// aveva mandato, ridotto a [a-z0-9_]: un ciclo di POST con un dominio
// diverso a ogni chiamata creava una chiave nuova a ogni chiamata, il
// documento del giorno arrivava a 1 MiB e da lì ogni scrittura del giorno
// falliva. Ora pagine, lingue, eventi e provenienze sono elenchi fissi, e
// il resto finisce in «altro»: il documento non cresce oltre la somma
// degli elenchi, qualunque cosa arrivi.

// Il percorso si riduce alla prima parte: /backoffice/locali?x=1 → backoffice.
// Le pagine della regia sono poche e fisse; un percorso strano (un link
// vecchio, un tentativo) finisce in «altro», per non allungare il documento.
const PAGINE = ['home', 'en', 'registrati', 'accedi', 'accesso', 'dashboard', 'backoffice', 'termini', 'privacy']
// I passi del percorso di vendita che il sito segnala da sé (src/lib/db.js).
const EVENTI = ['registrazione', 'free', 'checkout', 'contatto', 'codice', 'attivazione']
const LINGUE = ['it', 'en']

// LE FAMIGLIE DI PROVENIENZA: il nome che va nel documento e i domini che
// vi appartengono (un dominio vale col suo nome esatto o come sottodominio:
// `l.facebook.com`, `www.google.it`, `lm.instagram.com`). «google.» copre
// tutti i Google nazionali (google.it, google.com, google.fr…). Chi non è
// qui è «altro»; chi non ha un sito di provenienza, o viene da una pagina
// nostra, è «diretto».
const FAMIGLIE = {
  google: ['google.'],
  bing: ['bing.com'],
  duckduckgo: ['duckduckgo.com'],
  yahoo: ['yahoo.com', 'yahoo.it'],
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com'],
  tiktok: ['tiktok.com'],
  linkedin: ['linkedin.com', 'lnkd.in'],
  x: ['x.com', 'twitter.com', 't.co'],
  youtube: ['youtube.com', 'youtu.be'],
  whatsapp: ['whatsapp.com', 'wa.me'],
  telegram: ['telegram.org', 'telegram.me', 't.me'],
  chatgpt: ['chatgpt.com', 'openai.com'],
  reddit: ['reddit.com'],
  github: ['github.com'],
}
const PROVENIENZE = ['diretto', ...Object.keys(FAMIGLIE), 'altro']

// Un nome buono per una chiave di Firestore: niente punti né caratteri
// strani, al massimo 60. Serve a confrontare quello che arriva con gli
// elenchi: nel documento vanno solo nomi degli elenchi.
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

// Il dominio `host` è `dominio` o un suo sottodominio. Un dominio che
// finisce col punto («google.») vale per ogni suffisso nazionale.
const appartiene = (host, dominio) =>
  dominio.endsWith('.') ? host === dominio.slice(0, -1) || host.startsWith(dominio) || host.includes(`.${dominio}`) : host === dominio || host.endsWith(`.${dominio}`)

// Da dove si arriva: la famiglia del dominio di document.referrer, fra
// quelle note; «diretto» senza un sito di provenienza o da una pagina
// nostra (una pagina che manda a un'altra del sito non è una provenienza);
// «altro» per un sito che non è negli elenchi. Mai il dominio com'è.
function provenienzaDi(riferimento, nostri = []) {
  let host
  try {
    host = new URL(String(riferimento || '')).hostname.toLowerCase()
  } catch {
    return 'diretto'
  }
  if (!host || nostri.some((n) => appartiene(host, n))) return 'diretto'
  const famiglia = Object.keys(FAMIGLIE).find((f) => FAMIGLIE[f].some((d) => appartiene(host, d)))
  return famiglia || 'altro'
}

// L'ORIGINE DELLA CHIAMATA (finding 13): la Function è aperta perché la
// chiama anche chi non è entrato, ma una pagina di un altro sito non deve
// poterla chiamare dal browser dei suoi visitatori per gonfiare i
// contatori. Il browser mette l'header `Origin` a ogni chiamata fra siti
// diversi e il sito chiamante non lo può cambiare: se c'è e non è nostro,
// non si conta. Senza l'header (una chiamata da un programma) non si sa, e
// si conta: la regola che conta contro i programmi è l'elenco chiuso delle
// chiavi, che tiene piccolo il documento qualunque cosa mandino.
function origineAmmessa(origine, nostri = []) {
  if (!origine) return true
  let host
  try {
    host = new URL(String(origine)).hostname.toLowerCase()
  } catch {
    return false
  }
  return nostri.some((n) => appartiene(host, n))
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
// domini del sito stesso. Il riferimento (document.referrer) arriva nel
// corpo perché solo il browser lo conosce: l'header Referer di questa
// chiamata è la pagina nostra che la fa, non il sito da cui si è arrivati.
// Del corpo si tiene solo la famiglia: nel documento non entra mai un
// valore scritto dal chiamante.
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

module.exports = { PAGINE, EVENTI, LINGUE, FAMIGLIE, PROVENIENZE, chiaveSicura, paginaDi, provenienzaDi, origineAmmessa, giornoDi, incrementiDi, annidati }
