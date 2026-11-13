'use strict'

// ── GLI ORARI DI SERVIZIO DEL LOCALE, LOGICA PURA (REQ-FLOTTA-095) ─────
//
// Daniele, 13/11/2026: «quando un cliente si registra deve specificare gli
// orari di servizio dell'esercizio. Decidiamo la sospensione per Stripe
// fuori dall'orario di servizio quindi di sicuro non subito. In base
// all'orario in cui gli viene attivato l'abbonamento fa fede quell'orario
// [...]. Orario di servizio che non può cambiare se non previa approvazione
// nostra [...]. Se invece è semplicemente sbagliato, possiamo dare una
// settimana di tempo per cambiarlo». E sui dubbi: «per tutti i 10 i punti
// facciamo come dici».
//
// Qui: gli orari (uno per giorno, anche oltre la mezzanotte, o «chiuso»),
// i 7 giorni in cui il titolare li corregge da solo, la richiesta di cambio
// col motivo che l'admin approva o rifiuta, e il momento in cui una
// sospensione per pagamento arriva al locale. Le stesse regole degli orari
// stanno nel sito (src/lib/orari.js): un test le confronta.
//
// Gli orari stanno in clienti/{uid}.orari_servizio, IN CIMA al documento:
// dentro `locale` il titolare potrebbe riscriverli da sé (firestore.rules
// gli lascia locale, fatturazione, referente e consensi).

const { prossimoTaglio, ORA_DEL_TAGLIO } = require('./taglio.js')
const { scadenzaPagamento, GIORNI_DI_GRAZIA } = require('./scadenze.js')

const TZ = 'Europe/Rome'
const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
const NOMI_GIORNI = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const ORA = 3600000
const GIORNO = 24 * ORA
const GIORNI_DI_CORREZIONE = 7
// Un motivo di poche lettere non dice niente all'admin che deve decidere.
const MOTIVO_MINIMO = 10
// Tetti al documento del cliente (un documento Firestore sta sotto 1 MiB):
// un titolare che corregge a ripetizione nei 7 giorni, o un motivo
// lunghissimo, non devono farlo crescere senza fine. La traccia tiene gli
// ultimi cambi.
const STORIA_MASSIMA = 50
const TESTO_MASSIMO = 1000
const conTraccia = (storia, traccia) => [...(storia || []), traccia].slice(-STORIA_MASSIMA)

// Un rifiuto con il codice di HttpsError che index.js userà.
class OrariRifiutati extends Error {
  constructor(codice, messaggio, dettagli = null) {
    super(messaggio)
    this.codice = codice
    this.dettagli = dettagli
  }
}

const minuti = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const chiuso = (g) => g?.chiuso === true
// APERTO 24 ORE (Daniele, 13/11/2026: «se è h24 fai 0 - 24»): apertura
// 00:00 e chiusura 24:00. «24:00» vale solo come chiusura di un giorno che
// apre alle 00:00; apertura e chiusura alla stessa ora non sono più 24 ore.
const H24 = { apre: '00:00', chiude: '24:00' }
const h24 = (g) => g?.apre === H24.apre && g?.chiude === H24.chiude
// Quanti minuti dura il servizio di un giorno: la chiusura prima
// dell'apertura è il giorno dopo; 00:00–24:00 sono 24 ore.
const durata = (g) => {
  const d = minuti(g.chiude) - minuti(g.apre)
  return d > 0 ? d : d + 1440
}

// Un giorno a parole, come nel sito: «18:00–02:00 (fino al giorno dopo)»,
// «aperto 24 ore (00:00–24:00)», «chiuso». Serve all'email all'admin.
function giornoDetto(g) {
  if (!g || chiuso(g)) return 'chiuso'
  if (h24(g)) return 'aperto 24 ore (00:00–24:00)'
  return minuti(g.chiude) < minuti(g.apre) ? `${g.apre}–${g.chiude} (fino al giorno dopo)` : `${g.apre}–${g.chiude}`
}

// Perché gli orari non vanno, giorno per giorno ({ lun: '…', orari: '…' });
// vuoto se vanno. Stessi controlli e stesse parole del sito.
function problemiOrari(giorni) {
  const problemi = {}
  for (const id of GIORNI) {
    const g = giorni?.[id]
    if (chiuso(g)) continue
    if (!g || g.apre == null || g.chiude == null || g.apre === '' || g.chiude === '') problemi[id] = 'Scrivi apertura e chiusura, o segna il giorno come chiuso.'
    else if (h24(g)) continue
    else if (g.chiude === '24:00') problemi[id] = 'La chiusura 24:00 vale solo con l’apertura 00:00 (aperto 24 ore).'
    else if (!HHMM.test(String(g.apre)) || !HHMM.test(String(g.chiude)) || typeof g.apre !== 'string' || typeof g.chiude !== 'string') problemi[id] = 'Orario non valido: scrivi HH:MM, per esempio 18:30.'
    else if (g.apre === g.chiude) problemi[id] = 'Apertura e chiusura coincidono: per un giorno aperto 24 ore scrivi 00:00–24:00.'
  }
  if (!Object.keys(problemi).length && GIORNI.every((id) => chiuso(giorni[id]))) problemi.orari = 'Almeno un giorno deve essere aperto.'
  return problemi
}

const validi = (giorni) => Object.keys(problemiOrari(giorni)).length === 0

// La forma che si salva: { chiuso: true } senza ore, o { apre, chiude }.
// Il modulo manda anche `chiuso: false` e le ore di un giorno chiuso.
function orariPuliti(giorni) {
  return Object.fromEntries(GIORNI.map((id) => [id, chiuso(giorni[id]) ? { chiuso: true } : { apre: giorni[id].apre, chiude: giorni[id].chiude }]))
}

// I GIORNI SENZA PAUSA (Daniele, 13/11/2026, punto 9): quelli dopo la cui
// chiusura non c'è un'ora prima dell'apertura dopo, o aperti 24 ore
// col giorno dopo aperto. Lì la sospensione per mancato pagamento può
// arrivare durante il servizio, e il titolare lo deve leggere.
function giorniSenzaPausa(giorni) {
  if (!giorni || !validi(giorni)) return []
  return GIORNI.filter((id, i) => {
    const oggi = giorni[id]
    const domani = giorni[GIORNI[(i + 1) % 7]]
    if (chiuso(oggi) || chiuso(domani)) return false
    const fine = minuti(oggi.apre) + durata(oggi)
    return 1440 + minuti(domani.apre) - fine < 60
  })
}

// ── I 7 GIORNI E LE RICHIESTE ─────────────────────────────────────────

// Fino a quando il titolare li corregge da solo: 7 giorni da quando sono
// stati scritti la prima volta. Null se non ci sono ancora, o se la data
// non è valida: allora gli orari sono correggibili, e il primo salvataggio
// fa partire i 7 giorni (revisione del 13/11/2026, D8: il sito e la regia
// la pensano uguale).
// `correggibili_fino`, se c'è, vale da sé: la mette l'admin quando scrive
// gli orari di un locale che non li aveva (Daniele, 13/11/2026), così i 7
// giorni del titolare non partono.
const istante = (iso) => Date.parse(typeof iso === 'string' ? iso : '')
function correggibiliFino(cliente) {
  const os = cliente?.orari_servizio
  const fissata = istante(os?.correggibili_fino)
  if (Number.isFinite(fissata)) return new Date(fissata).toISOString()
  const dal = istante(os?.impostati_il)
  return Number.isFinite(dal) ? new Date(dal + GIORNI_DI_CORREZIONE * GIORNO).toISOString() : null
}

const correggibili = (cliente, adesso) => {
  const fino = correggibiliFino(cliente)
  return !fino || adesso.getTime() < Date.parse(fino)
}

function controllati(giorni) {
  const problemi = problemiOrari(giorni)
  if (Object.keys(problemi).length) throw new OrariRifiutati('invalid-argument', Object.values(problemi)[0], { campo: 'orari', problemi })
  return orariPuliti(giorni)
}

const stessi = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Gli orari della registrazione: il blocco con cui nasce il cliente.
function orariIniziali(giorni, adesso = new Date()) {
  return { giorni: controllati(giorni), impostati_il: adesso.toISOString(), richiesta: null, storia: [] }
}

// LA CORREZIONE DEL TITOLARE, nei 7 giorni. Un locale di prima (senza
// orari) li scrive la prima volta da qui, e da lì partono i suoi 7 giorni.
// La correzione non li fa ripartire: altrimenti non finirebbero mai.
function correzioneDelTitolare(cliente, giorni, { uid, adesso = new Date() }) {
  const os = cliente?.orari_servizio
  if (os?.giorni && !correggibili(cliente, adesso)) {
    throw new OrariRifiutati('failed-precondition', 'Sono passati 7 giorni: per cambiare gli orari manda una richiesta con il motivo.')
  }
  const nuovi = controllati(giorni)
  const quando = adesso.toISOString()
  const traccia = { tipo: 'correzione', chi: uid, quando, prima: os?.giorni || null, dopo: nuovi, motivo: null }
  return {
    orari_servizio: {
      richiesta: null,
      ...(os || {}),
      giorni: nuovi,
      // Una data non valida non conta (D8): i 7 giorni partono adesso.
      impostati_il: os?.giorni && Number.isFinite(istante(os.impostati_il)) ? os.impostati_il : quando,
      storia: conTraccia(os?.storia, traccia),
    },
  }
}

// LA RICHIESTA DI CAMBIO, dopo i 7 giorni: orari validi e diversi, un
// motivo scritto, una alla volta. Gli orari non cambiano finché l'admin
// non decide.
function richiestaDiCambio(cliente, giorni, motivo, { uid, adesso = new Date() }) {
  const os = cliente?.orari_servizio
  if (!os?.giorni || correggibili(cliente, adesso)) {
    throw new OrariRifiutati('failed-precondition', 'Gli orari si correggono ancora da qui, senza richiesta.')
  }
  if (os.richiesta) throw new OrariRifiutati('already-exists', 'C’è già una richiesta in attesa: aspetta la risposta.')
  const scritto = String(motivo ?? '').trim().slice(0, TESTO_MASSIMO)
  if (scritto.length < MOTIVO_MINIMO) throw new OrariRifiutati('invalid-argument', 'Scrivi il motivo del cambio (almeno 10 caratteri).', { campo: 'motivo' })
  const nuovi = controllati(giorni)
  if (stessi(nuovi, os.giorni)) throw new OrariRifiutati('invalid-argument', 'Gli orari sono uguali a quelli di adesso.', { campo: 'orari' })
  return { orari_servizio: { ...os, richiesta: { stato: 'in attesa', giorni: nuovi, prima: os.giorni, motivo: scritto, chiesta_il: adesso.toISOString(), chiesta_da: uid } } }
}

// LA DECISIONE DELL'ADMIN dal backoffice: approvata, valgono gli orari
// nuovi; rifiutata, restano quelli di prima. In tutti e due i casi la
// richiesta si chiude e resta la traccia.
// GLI ORARI SCRITTI DALL'ADMIN (Daniele, 13/11/2026: «si»): in qualunque
// momento, per qualunque locale, anche uno creato da lui che non ne ha. La
// stessa validazione, e la traccia (chi è l'admin, prima, dopo, la nota).
// Una richiesta in attesa resta: l'admin la decide a parte.
// Se gli orari non avevano una data valida, la scrittura dell'admin NON
// apre i 7 giorni del titolare: impostati_il è adesso (sono stati scritti
// adesso) e correggibili_fino è adesso, quindi da sé il titolare non li
// corregge, e per cambiarli chiede. Scelto un campo a parte invece di
// spostare indietro impostati_il: la data resta vera, e la traccia pure.
// Con una data, i 7 giorni restano quelli che erano.
function scritturaDellAdmin(cliente, giorni, { admin, nota = null, adesso = new Date() }) {
  const os = cliente?.orari_servizio
  const nuovi = controllati(giorni)
  const quando = adesso.toISOString()
  const conData = Number.isFinite(istante(os?.impostati_il))
  const traccia = { tipo: 'admin', chi: admin, quando, prima: os?.giorni || null, dopo: nuovi, motivo: null, nota: String(nota ?? '').trim().slice(0, TESTO_MASSIMO) || null }
  return {
    orari_servizio: {
      richiesta: null,
      ...(os || {}),
      giorni: nuovi,
      impostati_il: conData ? os.impostati_il : quando,
      ...(conData ? {} : { correggibili_fino: quando }),
      storia: conTraccia(os?.storia, traccia),
    },
  }
}

function decisioneSullaRichiesta(cliente, { esito, admin, adesso = new Date(), nota = null }) {
  const os = cliente?.orari_servizio
  const r = os?.richiesta
  if (!r) throw new OrariRifiutati('failed-precondition', 'Nessuna richiesta in attesa.')
  if (!['approvata', 'rifiutata'].includes(esito)) throw new OrariRifiutati('invalid-argument', 'Esito non valido: approvata o rifiutata.')
  const traccia = {
    tipo: esito,
    chi: r.chiesta_da,
    quando: adesso.toISOString(),
    prima: r.prima,
    dopo: r.giorni,
    motivo: r.motivo,
    chiesta_il: r.chiesta_il,
    deciso_da: admin,
    nota: String(nota ?? '').trim().slice(0, TESTO_MASSIMO) || null,
  }
  return { orari_servizio: { ...os, giorni: esito === 'approvata' ? r.giorni : os.giorni, richiesta: null, storia: conTraccia(os.storia, traccia) } }
}

// ── IL MOMENTO DELLA SOSPENSIONE PER PAGAMENTO ────────────────────────

// Le parti dell'orologio di Roma in un istante.
function orologio(istante) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(istante))
      .map((x) => [x.type, x.value])
  )
  return { anno: +p.year, mese: +p.month, giorno: +p.day, ore: +p.hour, minuti: +p.minute, settimana: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) }
}

const scarto = (t) => {
  const o = orologio(t)
  return (Date.UTC(o.anno, o.mese - 1, o.giorno, o.ore, o.minuti) - Math.floor(t / 60000) * 60000) / 60000
}

// L'istante in cui l'orologio di Roma segna quel giorno a quei minuti.
// Col cambio dell'ora (lo stesso conto di taglio.js): un'ora che non c'è
// (marzo) vale un'ora dopo; un'ora che c'è due volte (ottobre) vale la
// seconda. Tutte e due le scelte vanno nel verso di «dopo», cioè mai prima
// della fine del servizio.
function istanteDiRoma(anno, mese, giorno, min) {
  const ingenuo = Date.UTC(anno, mese - 1, giorno, 0, min)
  return ingenuo - scarto(ingenuo - scarto(ingenuo) * 60000) * 60000
}

// L'ora dell'attivazione (criterio 4): abbonamento.dal, che scrivono il
// checkout di Stripe, la creazione a mano e gli sconti.
function oraDiAttivazione(cliente) {
  const dal = cliente?.abbonamento?.dal
  return typeof dal === 'string' && Number.isFinite(Date.parse(dal)) ? dal : null
}

// I servizi (e l'ora prima di ognuno) che toccano il giorno di Roma di
// `riferimento`: quelli che cominciano il giorno prima, lo stesso giorno e
// il giorno dopo.
function serviziAttorno(giorni, riferimento) {
  const o = orologio(riferimento)
  const servizi = []
  for (const k of [-1, 0, 1]) {
    const id = GIORNI[(o.settimana + k + 7) % 7]
    const g = giorni[id]
    if (chiuso(g)) continue
    const data = new Date(Date.UTC(o.anno, o.mese - 1, o.giorno + k))
    const [a, m, d] = [data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate()]
    const inizio = istanteDiRoma(a, m, d, minuti(g.apre))
    const fine = istanteDiRoma(a, m, d, minuti(g.apre) + durata(g))
    servizi.push({ inizio, fine, prima: inizio - ORA })
  }
  return servizi
}

// Un momento ADATTO (punto 9): fuori servizio e non dentro l'ora prima di
// un'apertura (l'inizio di quell'ora va bene: è proprio «un'ora prima»).
function adatto(giorni, t) {
  return serviziAttorno(giorni, t).every((s) => !(t >= s.inizio && t < s.fine) && !(t > s.prima && t < s.inizio))
}

// IL MOMENTO DELLA SOSPENSIONE PER PAGAMENTO (criterio 3). `adesso`: da
// quando la regia ha deciso di sospendere. L'ora del giorno
// dell'attivazione, la prima da `adesso`:
// - in servizio → SEMPRE alla chiusura (punto 7: il servizio non si
//   interrompe a metà);
// - nell'ora prima dell'apertura → un'ora prima dell'apertura, o alla
//   chiusura se quel momento è già passato;
// - se il momento d'arrivo non è adatto (aperto 24 ore, meno di un'ora fra
//   chiusura e apertura: punto 9) → l'ora dell'attivazione, anche in
//   servizio.
// Senza orari validi resta il taglio della giornata (punto 10); con gli
// orari ma senza l'ora dell'attivazione, l'ora del taglio.
function momentoSospensione({ giorni, attivazione = null, adesso = new Date(), oraTaglio = ORA_DEL_TAGLIO }) {
  if (!giorni || !validi(giorni)) return prossimoTaglio(adesso, oraTaglio)
  const puliti = orariPuliti(giorni)
  const att = Date.parse(attivazione || '')
  const ora = Number.isFinite(att) ? orologio(att) : { ore: oraTaglio, minuti: 0 }
  const t0 = adesso.getTime()
  const oggi = orologio(t0)
  let t = null
  for (let k = 0; k < 3 && t === null; k += 1) {
    const c = istanteDiRoma(oggi.anno, oggi.mese, oggi.giorno + k, ora.ore * 60 + ora.minuti)
    if (c >= t0) t = c
  }
  const servizi = serviziAttorno(puliti, t)
  const dentro = servizi.find((s) => t >= s.inizio && t < s.fine)
  const primaDi = servizi.find((s) => t >= s.prima && t < s.inizio)
  let arrivo = t
  if (dentro) arrivo = dentro.fine
  else if (primaDi) arrivo = primaDi.prima >= t0 && adatto(puliti, primaDi.prima) ? primaDi.prima : primaDi.fine
  return new Date(arrivo === t || adatto(puliti, arrivo) ? arrivo : t)
}

// Il momento per un cliente: i suoi orari e la sua ora dell'attivazione.
function quandoSospendere(cliente, { adesso = new Date(), oraTaglio = ORA_DEL_TAGLIO } = {}) {
  return momentoSospensione({ giorni: cliente?.orari_servizio?.giorni, attivazione: oraDiAttivazione(cliente), adesso, oraTaglio })
}

// ── IN TRANSAZIONE, COL DATABASE DA FUORI ─────────────────────────────
// Le callable (index.js: correggiOrari, chiediCambioOrari,
// decidiCambioOrari) rileggono il cliente dentro una transazione e ci
// scrivono il blocco intero: due richieste insieme non si sovrascrivono a
// metà, e una decisione dell'admin vede la richiesta com'è adesso.
// L'uid arriva dal browser solo per l'admin (decidiCambioOrari): si
// controlla prima di farne un percorso (revisione del 13/11/2026).
const UID_VALIDO = /^[A-Za-z0-9_-]{1,128}$/

// LA CALLABLE DEGLI ORARI SCRITTI DALL'ADMIN (scriviOrariAdmin in
// index.js): solo col claim admin; l'uid del cliente arriva dal browser e
// cambiaOrari lo controlla. Qui e non in index.js perché si prova da sola.
async function orariDellAdmin(db, auth, dati, { adesso = new Date() } = {}) {
  if (auth?.token?.admin !== true) throw new OrariRifiutati('permission-denied', 'Solo l’amministratore.')
  const admin = auth.token.email || auth.uid
  return cambiaOrari(db, String(dati?.uid || ''), (c) => scritturaDellAdmin(c, dati?.giorni, { admin, nota: dati?.nota, adesso }))
}

async function cambiaOrari(db, uid, cambio) {
  if (!uid) throw new OrariRifiutati('invalid-argument', 'Manca il cliente.')
  if (!UID_VALIDO.test(uid)) throw new OrariRifiutati('invalid-argument', 'Cliente non valido.')
  const ref = db.doc(`clienti/${uid}`)
  return db.runTransaction(async (t) => {
    const snap = await t.get(ref)
    if (!snap.exists) throw new OrariRifiutati('not-found', 'Nessun locale registrato per questo account.')
    const patch = cambio(snap.data())
    t.update(ref, patch)
    return patch.orari_servizio
  })
}

// ── LA SOSPENSIONE PER PAGAMENTO, DALLA PARTE DELL'ISTANZA ────────────
// (revisione del 13/11/2026, D1 e D3: logica pura, provata da sola)

const ferma = (stato) => stato === 'sospesa' || stato === 'chiusa'
// Entro quanto dalla scadenza una decisione si conta «presa alla scadenza».
// Il compito del pagamento arriva alla scadenza e la regia decide qualche
// secondo dopo (o dopo aver chiesto a Stripe): partire dalla decisione
// spostava il momento al giorno dopo rispetto a valida_fino, che parte
// dalla scadenza. Oltre l'ora (un compito fallito, rilanciato giorni dopo)
// si parte dalla decisione: altrimenti il momento sarebbe già passato da
// un pezzo e la sospensione arriverebbe subito, magari in servizio.
const FINESTRA_SCADENZA = 60 * 60 * 1000

// IL MOMENTO DELLO STATO PER IL PAGAMENTO: null se lo stato non è una
// sospensione o una chiusura voluta dal pagamento (quelle dell'admin e del
// titolare valgono subito, REQ-FLOTTA-090). Si parte da quando la regia
// l'ha decisa (licenza_dal), così riscrivere la licenza più tardi non lo
// sposta; o dalla scadenza del pagamento, se la decisione è arrivata entro
// un'ora da quella: così coincide con valida_fino.
function momentoDelloStato(ist, cliente, { oraTaglio = ORA_DEL_TAGLIO, giorniGrazia = GIORNI_DI_GRAZIA } = {}) {
  if (ist?.licenza_per !== 'pagamento' || !ferma(ist.licenza_stato)) return null
  const deciso = Date.parse(ist.licenza_dal || '')
  if (!Number.isFinite(deciso)) return null
  const scadenza = Date.parse(scadenzaPagamento(cliente, giorniGrazia) || '')
  const da = Number.isFinite(scadenza) && scadenza <= deciso && deciso - scadenza <= FINESTRA_SCADENZA ? scadenza : deciso
  return quandoSospendere(cliente, { adesso: new Date(da), oraTaglio }).toISOString()
}

// È arrivato il compito «sospensione»: vale ancora? Solo se l'istanza
// aspetta proprio quel momento e lo stato è ancora fermo per il pagamento.
// Chi ha pagato nel frattempo («riattiva») ha sospensione_al vuoto; un
// compito vecchio, di un momento diverso, non fa niente; uno ripetuto dopo
// la scrittura trova sospensione_al vuoto.
function compitoSospensioneValido(ist, quando) {
  const atteso = ist?.sospensione_al?.dal
  if (!atteso || !Number.isFinite(Date.parse(quando || ''))) return false
  return atteso === new Date(quando).toISOString() && ist.licenza_per === 'pagamento' && ferma(ist.licenza_stato)
}

// Lo stato dell'istanza è cambiato fra la lettura e la scrittura della
// licenza (D7: il compito e «riattiva» insieme)? Allora la licenza si
// ricalcola, invece di scrivere quella letta prima. Conta anche il momento
// atteso (sospensione_al.dal): un'altra scrittura della licenza l'ha
// spostato o vuotato nel frattempo.
function statoCambiato(prima, dopo) {
  const cambiato = ['licenza_stato', 'licenza_per', 'licenza_dal'].some((k) => (prima?.[k] ?? null) !== (dopo?.[k] ?? null))
  return cambiato || (prima?.sospensione_al?.dal ?? null) !== (dopo?.sospensione_al?.dal ?? null)
}

// Il locale si è fermato davvero? No se la sospensione per pagamento
// aspettava ancora il suo momento: il locale non ha mai smesso di lavorare,
// e l'email «è di nuovo attivo» non deve partire.
const fermoDavvero = (ist) => ferma(ist?.licenza_stato) && !ist?.sospensione_al?.dal

module.exports = {
  cambiaOrari,
  orariDellAdmin,
  scritturaDellAdmin,
  momentoDelloStato,
  H24,
  compitoSospensioneValido,
  statoCambiato,
  fermoDavvero,
  FINESTRA_SCADENZA,
  GIORNI,
  NOMI_GIORNI,
  giornoDetto,
  GIORNI_DI_CORREZIONE,
  MOTIVO_MINIMO,
  STORIA_MASSIMA,
  TESTO_MASSIMO,
  OrariRifiutati,
  problemiOrari,
  orariPuliti,
  giorniSenzaPausa,
  correggibiliFino,
  orariIniziali,
  correzioneDelTitolare,
  richiestaDiCambio,
  decisioneSullaRichiesta,
  oraDiAttivazione,
  momentoSospensione,
  quandoSospendere,
}
