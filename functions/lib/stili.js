'use strict'

// ── GLI STILI A RICETTA, LOGICA PURA (REQ-FLOTTA-034) ──────────────────
//
// L'utente, 02/11/2026: «anche gli stili, non limitarti a quelli che
// abbiamo integrato. Creane di nuovi. In qualche modo dobbiamo poter
// caricare anche gli stili», e, sulle due strade, «Stile a ricetta» e «una
// scelta ampia di caratteri dentro l'app».
//
// Uno stile del menù è la sua FORMA: caratteri, impaginazione delle voci,
// separatori, intestazioni, cornici, sfondo. Gli stili di oggi sono CSS
// scritto nell'app; uno STILE A RICETTA è una scelta fra valori fissi su
// ognuna di queste dimensioni, e l'app lo disegna con un motore unico, con
// tutto il CSS dentro di sé (in tana-drink: docs/stili-a-ricetta.md). Così
// uno stile si carica dalla regia come un tema: non è codice, non può
// rompere il menù, funziona senza rete. Una forma davvero nuova, o un
// carattere in più, arrivano con l'app.
//
//   { id, nome, descrizione, prezzo: 0,
//     ricetta: { versione: 1,
//       caratteri: { titolo, voce, testo },
//       titoli: { maiuscolo, corsivo, allineamento, dimensione, spaziatura },
//       intestazione, voce: { forma, prezzo, separatore, immagine },
//       cornice, angoli, sfondo, colori? } }

// I caratteri che l'app porta con sé (liberi, dentro la build: REQ-SIC-004
// di tana-drink). I primi sei ci sono già; gli altri li aggiunge l'app con
// gli stili a ricetta.
const CARATTERI = [
  'caveat',
  'poiret-one',
  'jost',
  'dancing-script',
  'playfair-display',
  'georgia',
  'cormorant-garamond',
  'libre-baskerville',
  'dm-serif-display',
  'abril-fatface',
  'bebas-neue',
  'oswald',
  'inter',
  'space-grotesk',
  'josefin-sans',
  'pacifico',
  'amatic-sc',
  'special-elite',
]

// Le dimensioni della ricetta e i loro valori. Il primo è quello che vale
// se la ricetta non lo dice.
const VALORI = {
  'titoli.allineamento': ['sinistra', 'centro'],
  'titoli.dimensione': ['normale', 'grande', 'enorme'],
  'titoli.spaziatura': ['normale', 'stretta', 'larga'],
  intestazione: ['nessuna', 'filetto', 'doppio-filetto', 'tratteggio', 'punti', 'fregio'],
  'voce.forma': ['card', 'riga', 'colonna'],
  'voce.prezzo': ['accanto', 'sotto', 'puntini'],
  'voce.separatore': ['nessuno', 'filetto', 'tratteggio', 'punti'],
  'voce.immagine': ['tonda', 'quadrata', 'nascosta'],
  cornice: ['nessuna', 'sottile', 'doppia', 'angoli'],
  angoli: ['morbidi', 'vivi', 'tondi'],
  sfondo: ['tinta', 'grana', 'carta', 'gesso', 'righe', 'quadretti'],
  // LA STRUTTURA DEL MENÙ (REQ-FLOTTA-040; l'utente, 06/11/2026: «si possa
  // scegliere tra varie strutture di menu, ad esempio tutto in una pagina,
  // una pagina per categoria o una per macro categoria»): com'è diviso il
  // menù dei clienti, non com'è disegnata una voce. «unica» è il menù di
  // sempre; «per-categoria» una pagina per sezione; «per-macro-categoria»
  // una pagina per gruppo di sezioni (i gruppi li scrive il locale nella
  // struttura del menù, in tana-drink). Un'app senza i gruppi disegna
  // «per-macro-categoria» come «per-categoria».
  impaginazione: ['unica', 'per-categoria', 'per-macro-categoria'],
}
const IMPAGINAZIONI = VALORI.impaginazione

// Gli stili scritti nell'app: un id di uno stile a ricetta non li copre.
// Sono quelli di STILI_DELL_APP in src/lib/stiliRicetta.js di tana-drink, e
// nello stesso ordine: mancavano «meraviglie» e «carte» (06/11/2026).
const STILI_DELL_APP = ['classico', 'notte', 'meraviglie', 'carte', 'lavagna', 'deco', 'riviera', 'giornale']
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const COLORE = /^#[0-9a-fA-F]{6}$/
const CHIAVI_COLORE = ['--bg', '--bg-2', '--card', '--accent', '--accent-2', '--text', '--muted']
const VERSIONE = 1

const testo = (v) => (typeof v === 'string' ? v.trim() : '')
const leggi = (obj, percorso) => percorso.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj)

// Uno stile scritto → { stile } da salvare, o { errore }. Severo: un valore
// fuori dal vocabolario si rifiuta, non si indovina.
function stilePulito(dati) {
  const id = testo(dati?.id).toLowerCase()
  if (!ID.test(id)) return { errore: 'Identificativo: minuscole, cifre e trattini, da 2 a 41 caratteri.' }
  if (STILI_DELL_APP.includes(id)) return { errore: `«${id}» è uno stile scritto nell’app: scegli un altro identificativo.` }
  const nome = testo(dati?.nome)
  if (!nome || nome.length > 40) return { errore: 'Il nome ci vuole, fino a 40 caratteri.' }
  const descrizione = testo(dati?.descrizione)
  if (descrizione.length > 240) return { errore: 'La descrizione arriva al massimo a 240 caratteri.' }
  if (Number(dati?.prezzo || 0) !== 0) return { errore: 'Per ora gli stili sono tutti gratis.' }
  const { ricetta, errore } = ricettaPulita(dati?.ricetta)
  if (errore) return { errore }
  return { stile: { id, nome, descrizione, prezzo: 0, ricetta } }
}

// La ricetta da sola → { ricetta } o { errore }. La usa anche un tema su
// misura (REQ-FLOTTA-040), che porta la sua ricetta dentro di sé.
function ricettaPulita(r) {
  if (!r || typeof r !== 'object') return { errore: 'Manca la ricetta.' }
  if (r.versione !== VERSIONE) return { errore: `La ricetta è della versione ${VERSIONE}.` }
  const caratteri = {}
  for (const k of ['titolo', 'voce', 'testo']) {
    if (!CARATTERI.includes(r.caratteri?.[k])) return { errore: `Il carattere ${k} è uno fra: ${CARATTERI.join(', ')}.` }
    caratteri[k] = r.caratteri[k]
  }
  const ricetta = { versione: VERSIONE, caratteri, titoli: {}, voce: {} }
  for (const k of ['maiuscolo', 'corsivo']) {
    const v = r.titoli?.[k]
    if (v !== undefined && typeof v !== 'boolean') return { errore: `titoli.${k} è vero o falso.` }
    ricetta.titoli[k] = v === true
  }
  for (const [percorso, ammessi] of Object.entries(VALORI)) {
    const v = leggi(r, percorso)
    if (v !== undefined && !ammessi.includes(v)) return { errore: `${percorso} è uno fra: ${ammessi.join(', ')}.` }
    const [primo, secondo] = percorso.split('.')
    if (secondo) ricetta[primo][secondo] = v ?? ammessi[0]
    else ricetta[primo] = v ?? ammessi[0]
  }
  // Colori propri dello stile (come la Lavagna, che senza lavagna non è
  // niente): facoltativi, sopra quelli del tema.
  if (r.colori !== undefined) {
    if (!r.colori || typeof r.colori !== 'object') return { errore: 'I colori dello stile sono un elenco di #rrggbb.' }
    const colori = {}
    for (const [k, v] of Object.entries(r.colori)) {
      if (!CHIAVI_COLORE.includes(k)) return { errore: `Il colore ${k} non è uno dei sette.` }
      if (!COLORE.test(String(v))) return { errore: `Il colore ${k} va scritto come #rrggbb.` }
      colori[k] = String(v).toLowerCase()
    }
    if (Object.keys(colori).length) ricetta.colori = colori
  }
  return { ricetta }
}

// GLI STILI DEL REPOSITORY: come i temi (REQ-FLOTTA-033), disegnati dal
// fornitore o da un agente in functions/temi/stili.json, pubblicati col
// deploy; lo stesso id nel database vince (così si ritirano).
const STILI_DEL_REPOSITORY = require('../temi/stili.json').stili.map((s) => ({ ...s, stato: s.stato || 'pubblicato', dal_repository: true }))

const perIlCatalogo = (s) => ({ id: s.id, nome: s.nome, descrizione: s.descrizione || '', prezzo: 0, ricetta: stilePulito(s).stile.ricetta })

// Gli stili pubblici: quelli del repository con sopra quelli del database,
// solo i pubblicati e validi, in ordine di nome.
function catalogoStili(docs, daRepository = STILI_DEL_REPOSITORY) {
  const perId = new Map((daRepository || []).map((s) => [s.id, s]))
  for (const d of docs || []) if (d?.id) perId.set(d.id, d)
  return [...perId.values()]
    .filter((s) => s?.stato === 'pubblicato' && !stilePulito(s).errore)
    .map(perIlCatalogo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

const stileDalRepository = (id, daRepository = STILI_DEL_REPOSITORY) => daRepository.find((s) => s.id === id) || null

module.exports = { CARATTERI, VALORI, IMPAGINAZIONI, STILI_DELL_APP, VERSIONE, STILI_DEL_REPOSITORY, stilePulito, ricettaPulita, catalogoStili, stileDalRepository }
