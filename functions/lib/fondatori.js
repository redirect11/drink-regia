// ── L'OFFERTA FONDATORI, LOGICA PURA (REQ-FLOTTA-031) ──────────────────
//
// Decisione dell'utente del 02/11/2026 (DEC-0005): i primi 20 locali che
// attivano un piano a pagamento coperto dall'offerta (piani.json →
// fondatori.prezzi: oggi solo il Base) pagano il prezzo Fondatori per 12
// mesi dall'attivazione, poi il listino; l'attivazione è gratuita.
//
// IL POSTO SI PRENOTA ALLA SESSIONE E SI ASSEGNA AL PAGAMENTO. Il prezzo
// Fondatori deve stare già nella sessione di Checkout (il titolare vede
// quello che paga), quindi il posto va tenuto da lì: se si contasse solo
// al pagamento, venticinque sessioni aperte insieme porterebbero tutte lo
// sconto e il ventunesimo pagherebbe da Fondatore senza posto. La
// prenotazione dura quanto la sessione (Stripe la fa scadere) più un
// margine per il webhook in ritardo; si libera prima con l'evento
// checkout.session.expired. Il numero del posto si assegna solo col
// pagamento confermato dal webhook, che è verificabile (firma di Stripe).
// Il contatore sta in un documento solo (fondatori/posti), cambiato in
// transazione: due titolari che pagano insieme non prendono lo stesso
// numero, e oltre i posti non si va.
//
// IL PASSAGGIO AL LISTINO NON SI FA A MANO: lo sconto è un coupon di
// Stripe sull'abbonamento, con importo fisso uguale alla differenza col
// listino. Mensile: durata «repeating» di 12 mesi, cioè le prime 12
// fatture; annuale: durata «once», cioè la prima fattura annuale, che
// copre proprio i 12 mesi. Finito il coupon Stripe fattura il listino da
// sé. Più semplice di uno schedule (che andrebbe creato dopo il Checkout,
// dal webhook, con le fasi da tenere allineate ai cambi di piano) e
// provabile qui: il coupon è un oggetto di parametri.

const listino = require('../piani.json')

const F = listino.fondatori || { posti: 0, mesi: 0, prezzi: {}, attivazione: 0 }
// Il margine oltre la scadenza della sessione: un webhook di Stripe può
// arrivare in ritardo, e il posto di chi ha pagato non va dato ad altri.
const MARGINE_MS = 60 * 60 * 1000

const cent = (euro) => Math.round((Number(euro) || 0) * 100)

// Il piano è coperto dall'offerta?
const coperto = (piano) => F.prezzi?.[piano] != null && listino.piani[piano] != null

// Il documento fondatori/posti, letto con tolleranza: un documento che non
// c'è ancora vale «nessun posto dato».
function statoPulito(doc) {
  return {
    assegnati: { ...(doc?.assegnati || {}) },
    prenotazioni: { ...(doc?.prenotazioni || {}) },
  }
}

const numeroAssegnati = (s) => Object.keys(s.assegnati).length
const prenotazioniValide = (s, adesso, tranne = null) =>
  Object.entries(s.prenotazioni).filter(([uid, p]) => uid !== tranne && Date.parse(p?.scade_il) > adesso.getTime()).length

// I posti ancora liberi, contate le prenotazioni in corso.
function postiLiberi(doc, adesso = new Date()) {
  const s = statoPulito(doc)
  return Math.max(0, F.posti - numeroAssegnati(s) - prenotazioniValide(s, adesso))
}

// Prenota un posto per la sessione che sta per nascere.
// → { esito: 'prenotato' | 'gia_fondatore' | 'esauriti', doc }
// `scadenzaSessione` è l'expires_at della sessione (Date). Una seconda
// sessione dello stesso titolare rinnova la sua prenotazione, non ne
// prende un'altra.
function prenota(doc, uid, scadenzaSessione, adesso = new Date()) {
  const s = statoPulito(doc)
  if (s.assegnati[uid]) return { esito: 'gia_fondatore', doc: s }
  if (numeroAssegnati(s) + prenotazioniValide(s, adesso, uid) >= F.posti) return { esito: 'esauriti', doc: s }
  // Le prenotazioni scadute si tolgono qui: il documento resta piccolo.
  for (const [u, p] of Object.entries(s.prenotazioni)) if (!(Date.parse(p?.scade_il) > adesso.getTime())) delete s.prenotazioni[u]
  s.prenotazioni[uid] = { scade_il: new Date(scadenzaSessione.getTime() + MARGINE_MS).toISOString(), il: adesso.toISOString() }
  return { esito: 'prenotato', doc: s }
}

// Libera la prenotazione (sessione scaduta o non creata). Un posto già
// assegnato non si tocca. Con `scadenzaSessione` (l'expires_at della
// sessione scaduta) si libera solo la prenotazione di quella sessione: se
// il titolare ne ha aperta un'altra dopo, la prenotazione è stata
// rinnovata e scade più tardi, e la sessione nuova la tiene.
function rilascia(doc, uid, scadenzaSessione = null) {
  const s = statoPulito(doc)
  const p = s.prenotazioni[uid]
  if (p && scadenzaSessione && Date.parse(p.scade_il) > scadenzaSessione.getTime() + MARGINE_MS + 5000) return s
  delete s.prenotazioni[uid]
  return s
}

// Il giorno di calendario n mesi dopo, senza sconfinare nel mese dopo
// (il 29 febbraio più 12 mesi è il 28 febbraio).
function piuMesi(data, n) {
  const d = new Date(data)
  const giorno = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + n)
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(giorno, ultimo))
  return d
}

// Il segno sul cliente: { numero, dal, fino_al }.
function fondatoreDi(numero, dal) {
  return { numero, dal, fino_al: piuMesi(dal, F.mesi).toISOString() }
}

// Il pagamento è confermato: il posto prenotato diventa un numero.
// → { esito: 'assegnato' | 'gia_assegnato' | 'esauriti', fondatore, doc }
// Idempotente: il webhook ripetuto ritrova lo stesso numero. 'esauriti'
// solo se la prenotazione era già scaduta e i posti sono stati presi da
// altri nel frattempo: il titolare ha pagato col coupon, e la regia lo
// segnala all'admin invece di decidere da sé.
function conferma(doc, uid, adesso = new Date()) {
  const s = statoPulito(doc)
  const gia = s.assegnati[uid]
  if (gia) return { esito: 'gia_assegnato', fondatore: fondatoreDi(gia.numero, gia.dal), doc: s }
  delete s.prenotazioni[uid]
  if (numeroAssegnati(s) + prenotazioniValide(s, adesso) >= F.posti) return { esito: 'esauriti', fondatore: null, doc: s }
  const numero = Math.max(0, ...Object.values(s.assegnati).map((a) => Number(a?.numero) || 0)) + 1
  const dal = adesso.toISOString()
  s.assegnati[uid] = { numero, dal }
  return { esito: 'assegnato', fondatore: fondatoreDi(numero, dal), doc: s }
}

// Il coupon di Stripe per un piano e un intervallo ('mese' | 'anno'), o
// null se l'offerta non copre il piano. L'id dipende da piano, intervallo
// e importo: si crea una volta e si riusa, e se il listino cambia nasce un
// coupon nuovo invece di cambiare in silenzio quello vecchio. Il nome è
// quello che il titolare legge nel Checkout e in fattura: dice la regola,
// non un prezzo barrato.
function couponFondatori(piano, intervallo = 'mese') {
  if (!coperto(piano)) return null
  const annuale = intervallo === 'anno'
  const mensilita = annuale ? listino.annuale?.mensilita || 12 : 1
  const differenza = (cent(listino.piani[piano].prezzo) - cent(F.prezzi[piano])) * mensilita
  if (differenza <= 0) return null
  const prezzo = String(F.prezzi[piano]).replace('.', ',')
  return {
    id: `fondatori-${piano}-${intervallo}-${differenza}`,
    amount_off: differenza,
    currency: 'eur',
    ...(annuale ? { duration: 'once' } : { duration: 'repeating', duration_in_months: F.mesi }),
    // Stripe tiene i nomi entro 40 caratteri.
    name: `Fondatori: ${prezzo} € per ${F.mesi} mesi`.slice(0, 40),
    metadata: { fondatori: '1', piano, intervallo },
  }
}

// Cambiando piano, lo sconto Fondatori resta solo se il piano nuovo è
// coperto: un Fondatore che passa al Completo paga il Completo di listino.
// `metadata` è quello della subscription di Stripe, che il Checkout ha
// segnato con fondatore '1'.
const scontoDaTogliere = (metadata, piano) => metadata?.fondatore === '1' && !coperto(piano)

module.exports = { coperto, statoPulito, postiLiberi, prenota, rilascia, conferma, fondatoreDi, piuMesi, couponFondatori, scontoDaTogliere, MARGINE_MS, POSTI: F.posti, MESI: F.mesi }
