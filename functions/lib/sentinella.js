'use strict'

// ── LA SENTINELLA DELLA REGIA, LOGICA PURA (REQ-FLOTTA-111) ────────────
//
// Daniele, 14/11/2026: «niente allarmi google. Noi che possiamo fare
// internamente?», e sul canale degli avvisi: «Solo nel backoffice». Ogni
// 15 minuti la regia guarda i siti, gli errori dei suoi registri, le
// presentazioni dei locali e (una volta l'ora) i suoi permessi; quello che
// non va diventa un allarme in allarmi/{chiave}.
//
// PERCHÉ A TEMPO, quando le scadenze sono passate agli eventi
// (REQ-FLOTTA-023, «Non mi piace la temporizzazione di questi check»): un
// sito che cade non manda nessun evento. È l'unica Function a tempo.
//
// Qui solo i conti, senza rete: la Function (index.js, sentinella) apre i
// siti, chiede a Google e scrive; i segnali e le scritture nascono qui.
//
// UN SEGNALE: { chiave, controllo, livello, titolo, dettaglio, slug }. La
// chiave dice il controllo e il soggetto (`sito--prova-bar`): un problema
// ha sempre lo stesso documento, così non si ripete e, se torna, riapre
// quello di prima contando le volte.

const { daControllare, ruoliMancanti } = require('./salute.js')
// Le email in un messaggio d'errore si mascherano come nei registri.
const { senzaEmail } = require('./registro.js')
const { confrontaVersioni } = require('./presentazione.js')

const MINUTO = 60 * 1000
const ORA = 60 * MINUTO

// LE SOGLIE, modificabili dal backoffice (impostazioni/sentinella). Un
// valore fuori dal suo intervallo si riporta dentro: chi lo scrive è
// l'admin, ma un numero sbagliato non deve spegnere la sentinella (errori
// a zero vorrebbe dire un allarme a ogni riga) né farla aspettare oltre il
// suo tempo.
const SOGLIE_PREDEFINITE = { errori: 3, presentazione_ore: 48, sito_secondi: 10 }
const INTERVALLI = { errori: [1, 1000], presentazione_ore: [1, 720], sito_secondi: [2, 30] }

function soglie(doc) {
  const fuori = {}
  for (const [nome, [min, max]] of Object.entries(INTERVALLI)) {
    const n = Number(doc?.[nome])
    fuori[nome] = doc?.[nome] === undefined || doc?.[nome] === null || doc?.[nome] === '' || !Number.isFinite(n) ? SOGLIE_PREDEFINITE[nome] : Math.min(max, Math.max(min, Math.floor(n)))
  }
  return fuori
}

// Un nome di documento Firestore: niente «/», e lo teniamo leggibile.
const chiave = (controllo, soggetto) => `${controllo}--${String(soggetto).replace(/[^A-Za-z0-9_-]/g, '_')}`

const segnale = (controllo, soggetto, { livello, titolo, dettaglio, slug = null }) => ({
  chiave: chiave(prefisso[controllo], soggetto),
  controllo,
  livello,
  titolo,
  dettaglio,
  slug,
})
const prefisso = { siti: 'sito', errori: 'errori', presentazioni: 'presentazione', permessi: 'permessi' }

// Un locale si guarda se è attivo, ha un progetto vero (daControllare: non
// la demo, non i simulati, non la semina, non gli eliminati). Un sospeso
// mostra la sua pagina di sospensione e non serve nessuno.
// Un'istanza di prova spenta (REQ-FLOTTA-114) non è da guardare: le prove
// e2e sono finite.
const attivo = (ist) => daControllare(ist) && ist.stato === 'attiva' && ist.prova?.attiva !== false

// ── (a) I SITI ──
function sitiDaGuardare({ regia, istanze }) {
  const siti = regia ? [{ soggetto: 'regia', url: regia }] : []
  for (const ist of istanze || []) {
    if (attivo(ist) && typeof ist.url === 'string' && ist.url.startsWith('https://')) siti.push({ soggetto: ist.slug, url: ist.url })
  }
  return siti
}

// esiti: [{ soggetto, url, status, errore }]: status null se non ha
// risposto. Un rimando (3xx) va bene: il sito c'è.
function segnaliSiti(esiti, { sito_secondi }) {
  return (esiti || [])
    .filter((e) => !(e.status >= 200 && e.status < 400))
    .map((e) => {
      const regia = e.soggetto === 'regia'
      return segnale('siti', e.soggetto, {
        livello: 'problema',
        titolo: regia ? 'Il sito della regia non risponde' : `Il sito di ${e.soggetto} non risponde`,
        dettaglio: e.status ? `${e.url} risponde HTTP ${e.status}` : `${e.url}: nessuna risposta in ${sito_secondi} s`,
        slug: regia ? null : e.soggetto,
      })
    })
}

// ── (b) GLI ERRORI ──
// Le righe dei registri strutturati (REQ-FLOTTA-110): ogni chiamata ne
// scrive una col suo `tipo` ('http' | 'chiamata') e il suo `esito`; un
// errore inatteso ne scrive un'altra, senza tipo, con lo stack. Si contano
// le chiamate, e lo stack dà il dettaglio. Le Function senza registro (i
// trigger di Firestore e delle code) scrivono solo righe d'errore, e si
// contano quelle, per servizio.
const testoDi = (v) => String(v?.jsonPayload?.message ?? v?.textPayload ?? '').trim()
const primaRiga = (t) => t.split('\n')[0].slice(0, 300)

function segnaliErrori(voci, { errori: soglia }) {
  const perFunzione = new Map()
  const conta = (nome) => {
    if (!perFunzione.has(nome)) perFunzione.set(nome, { nome, errori: 0, primo: null, ultimo: null, testo: null, testo_il: null })
    return perFunzione.get(nome)
  }
  for (const v of voci || []) {
    const j = v?.jsonPayload || {}
    if (j.funzione && j.tipo) {
      if (j.esito !== 'errore') continue
      const c = conta(j.funzione)
      c.errori += 1
      if (!c.primo || v.timestamp < c.primo) c.primo = v.timestamp
      if (!c.ultimo || v.timestamp > c.ultimo) c.ultimo = v.timestamp
    } else if (j.funzione) {
      // La riga dello stack di una Function col registro: solo il dettaglio.
      const c = conta(j.funzione)
      if (!c.testo_il || v.timestamp >= c.testo_il) Object.assign(c, { testo: testoDi(v), testo_il: v.timestamp })
    } else if (v?.severity === 'ERROR' || v?.severity === 'CRITICAL' || v?.severity === 'ALERT' || v?.severity === 'EMERGENCY') {
      const c = conta(v?.resource?.labels?.service_name || '?')
      c.errori += 1
      if (!c.primo || v.timestamp < c.primo) c.primo = v.timestamp
      if (!c.ultimo || v.timestamp > c.ultimo) c.ultimo = v.timestamp
      if (!c.testo_il || v.timestamp >= c.testo_il) Object.assign(c, { testo: testoDi(v), testo_il: v.timestamp })
    }
  }
  return [...perFunzione.values()]
    .filter((c) => c.errori >= soglia)
    .sort((a, b) => b.errori - a.errori || a.nome.localeCompare(b.nome))
    .map((c) =>
      segnale('errori', c.nome, {
        livello: 'attenzione',
        titolo: `La Function ${c.nome} va in errore`,
        dettaglio: `${c.errori} errori dalle ${oraDi(c.primo)} alle ${oraDi(c.ultimo)}${c.testo ? `; l’ultimo: ${senzaEmail(primaRiga(c.testo))}` : ''}`,
      })
    )
}

const oraDi = (iso) => (iso ? new Date(iso).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }) : '?')

// Da quando leggere: dal giro prima, così fra un giro e l'altro non si
// perde niente; mai più indietro di un'ora, così una sentinella rimasta
// ferma non si risveglia con gli errori di ieri. Al primo giro, 15 minuti.
function finestraErrori(ultimoGiro, adesso = new Date()) {
  const t = adesso.getTime()
  const prima = Date.parse(ultimoGiro || '')
  if (!Number.isFinite(prima)) return new Date(t - 15 * MINUTO).toISOString()
  return new Date(Math.max(prima, t - ORA)).toISOString()
}

// ── (c) LE PRESENTAZIONI ──
// L'app si presenta alla regia al primo avvio di ogni versione
// (REQ-FLOTTA-026). Dopo un aggiornamento, se dopo tante ore il locale
// presenta ancora la versione di prima, o non si è mai presentato, qualcosa
// non è arrivato. Il conto parte dalla fine dell'ultimo aggiornamento,
// altrimenti dall'ultima scrittura dell'istanza. Un locale esistente che
// la regia non aggiorna pubblica da sé: lì «diversa» non vuol dire niente.
const senzaV = (v) => String(v || '').replace(/^v/, '')
const aggiornatoDallaRegia = (ist) => ist?.origine !== 'esistente' || ist?.aggiornamenti_dalla_regia === true

function segnaliPresentazioni(istanze, { presentazione_ore }, adesso = new Date()) {
  const segnali = []
  for (const ist of istanze || []) {
    // Un'istanza di prova si presenta solo dalle anteprime, che la regia
    // non segna (REQ-FLOTTA-114): non ha presentazioni da controllare.
    if (!attivo(ist) || ist.prova) continue
    const da = Date.parse(ist.aggiornamento?.finito_il || ist.aggiornata_il || '')
    if (!Number.isFinite(da) || adesso.getTime() - da < presentazione_ore * ORA) continue
    const presentata = ist.presentazione?.versione || null
    if (!presentata) {
      segnali.push(segnale('presentazioni', ist.slug, { livello: 'attenzione', titolo: `${ist.slug} non si è mai presentato alla regia`, dettaglio: `Nessuna presentazione da più di ${presentazione_ore} ore dopo l’ultimo aggiornamento.`, slug: ist.slug }))
    } else if (aggiornatoDallaRegia(ist) && ist.versione && senzaV(presentata) !== senzaV(ist.versione)) {
      // Più nuova di quella pubblicata vuol dire arrivata da fuori dalla
      // regia (il 15/11 le anteprime degli e2e su prova-e2e, REQ-FLOTTA-112):
      // non è «vecchia».
      const nuova = confrontaVersioni(presentata, ist.versione) > 0
      segnali.push(
        segnale('presentazioni', ist.slug, {
          livello: 'attenzione',
          titolo: nuova ? `${ist.slug} ha una versione più nuova di quella pubblicata` : `${ist.slug} è fermo a una versione vecchia`,
          dettaglio: nuova
            ? `Si presenta con la ${presentata}, la regia ha pubblicato la ${ist.versione}: è arrivata da fuori dalla regia.`
            : `Si presenta con la ${presentata}, la regia ha pubblicato la ${ist.versione} da più di ${presentazione_ore} ore.`,
          slug: ist.slug,
        })
      )
    }
  }
  return segnali
}

// ── (d) I PERMESSI ──
// Come la Salute (REQ-FLOTTA-109): `permessi` è { [slug]: { progetto,
// firma } }, null dove la domanda non ha avuto risposta.
function segnaliPermessi(istanze, permessi) {
  const segnali = []
  for (const ist of istanze || []) {
    if (!daControllare(ist)) continue
    const mancanti = ruoliMancanti(permessi?.[ist.slug] || { progetto: null, firma: null })
    if (!mancanti.length) continue
    segnali.push(
      segnale('permessi', ist.slug, {
        livello: 'problema',
        titolo: `Alla regia mancano dei permessi su ${ist.slug}`,
        dettaglio: `${mancanti.map((m) => `manca ${m.ruolo} (${m.dove})`).join('; ')}. Li dà: node scripts/account-runtime.mjs --progetto <regia> --locale ${ist.progetto}`,
        slug: ist.slug,
      })
    )
  }
  return segnali
}

// ── IL GIRO ──
// I permessi chiedono a Google una domanda per locale: una volta l'ora
// basta, un ruolo tolto non torna da solo.
function controlliDelGiro(stato, adesso = new Date()) {
  const controlli = ['siti', 'errori', 'presentazioni']
  const ultimo = Date.parse(stato?.controlli?.permessi?.il || '')
  if (!Number.isFinite(ultimo) || adesso.getTime() - ultimo >= 55 * MINUTO) controlli.push('permessi')
  return controlli
}

// Un sito giù si conferma al giro dopo: un intoppo di un momento (un
// deploy, una rete lenta) non apre un allarme. `in_osservazione` tiene i
// siti visti giù una volta, con la prima volta; un sito con l'allarme già
// aperto non aspetta.
const DA_CONFERMARE = new Set(['siti'])
function conferma(segnali, { inOsservazione = {}, aperti = [], adesso = new Date() }) {
  const giaAperti = new Set(aperti)
  const confermati = []
  const osservazione = {}
  for (const sg of segnali || []) {
    if (!DA_CONFERMARE.has(sg.controllo)) {
      confermati.push(sg)
      continue
    }
    osservazione[sg.chiave] = inOsservazione[sg.chiave] || adesso.toISOString()
    if (inOsservazione[sg.chiave] || giaAperti.has(sg.chiave)) confermati.push(sg)
  }
  return { segnali: confermati, in_osservazione: osservazione }
}

// LE SCRITTURE: [{ id, dati }], da fare con merge. `allarmi` sono i
// documenti di prima, con il loro id; `eseguiti` i controlli che in
// questo giro hanno avuto risposta: solo loro possono chiudere.
function aggiornaAllarmi({ allarmi, segnali, eseguiti, adesso = new Date() }) {
  const ora = adesso.toISOString()
  const perId = new Map((allarmi || []).map((a) => [a.id, a]))
  const visti = new Set()
  const scritture = []
  for (const sg of segnali || []) {
    visti.add(sg.chiave)
    const prima = perId.get(sg.chiave)
    if (prima?.aperto) {
      scritture.push({ id: sg.chiave, dati: { livello: sg.livello, titolo: sg.titolo, dettaglio: sg.dettaglio, visto_il: ora } })
    } else {
      scritture.push({ id: sg.chiave, dati: { ...sg, aperto: true, aperto_il: ora, visto_il: ora, chiuso_il: null, volte: (Number(prima?.volte) || 0) + 1 } })
    }
  }
  const fatti = new Set(eseguiti || [])
  for (const a of allarmi || []) {
    if (a.aperto && !visti.has(a.id) && fatti.has(a.controllo)) scritture.push({ id: a.id, dati: { aperto: false, chiuso_il: ora } })
  }
  return scritture
}

// LA PROVA DI VITA, per il guardiano esterno (.github/workflows/guardiano.yml):
// viva se ha finito un giro negli ultimi 45 minuti, cioè al più due giri
// saltati.
const VIVA_ENTRO_MINUTI = 45
function viva(stato, adesso = new Date()) {
  const il = Date.parse(stato?.ultimo_giro_il || '')
  if (!Number.isFinite(il)) return { viva: false, minuti: null }
  const minuti = Math.floor((adesso.getTime() - il) / MINUTO)
  return { viva: minuti <= VIVA_ENTRO_MINUTI, minuti }
}

module.exports = {
  SOGLIE_PREDEFINITE,
  INTERVALLI,
  VIVA_ENTRO_MINUTI,
  soglie,
  chiave,
  sitiDaGuardare,
  segnaliSiti,
  segnaliErrori,
  finestraErrori,
  segnaliPresentazioni,
  segnaliPermessi,
  controlliDelGiro,
  conferma,
  aggiornaAllarmi,
  viva,
}
