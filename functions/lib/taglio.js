'use strict'

// ── LE RIDUZIONI DELLA LICENZA AL TAGLIO DELLA GIORNATA, LOGICA PURA ────
// (REQ-FLOTTA-024)
//
// tana-drink, 01/11/2026: «I passaggi a un piano più piccolo vanno fatti
// fuori dall'orario di servizio (per esempio al taglio della giornata,
// alle 5). Tra poco le regole leggeranno la licenza a ogni scrittura. Se
// un modulo si spegne mentre un tablet ha scritture in coda senza rete,
// quelle scritture vengono rifiutate quando arrivano.»
//
// Quindi una licenza che TOGLIE qualcosa (un modulo, un terminale, limiti
// più stretti, il passaggio al Free) non si scrive subito: fino al taglio
// della giornata del locale resta quella di prima, con in più quello che
// la nuova aggiunge; al taglio un compito scrive la nuova. Quello che
// AGGIUNGE arriva subito: non fa rifiutare niente.
//
// Uno stato che ferma il locale (sospesa, chiusa) voluto dal pagamento NON
// aspetta più il taglio: dal 13/11/2026 (REQ-FLOTTA-095) arriva fuori
// dall'orario di servizio del locale, al momento che calcola
// orari-servizio.js, con un compito suo («sospensione»). Fino ad allora la
// licenza tiene lo stato di prima (`statoDal`). Una sospensione dell'admin
// o una chiusura del titolare è una scelta di adesso, e vale subito.

const TZ = 'Europe/Rome'
// L'ora del taglio se il locale non ne ha una sua: la stessa di tana-drink
// (DEFAULT_CUTOFF_HOUR in src/lib/businessDay.js).
const ORA_DEL_TAGLIO = 5

// L'ora del taglio del locale, da settings/bar.business_day_cutoff_hour.
function oraDelTaglio(bar) {
  const ora = Number(bar?.business_day_cutoff_hour)
  return Number.isInteger(ora) && ora >= 0 && ora <= 23 ? ora : ORA_DEL_TAGLIO
}

// Di quanti minuti Roma è avanti su UTC in quell'istante (60 o 120).
function scartoDiRoma(istante) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(istante))
      .map((x) => [x.type, Number(x.value)])
  )
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(istante / 60000) * 60000) / 60000
}

// Il prossimo taglio dopo `adesso`: l'ora `ora` di Roma, oggi o domani.
function prossimoTaglio(adesso = new Date(), ora = ORA_DEL_TAGLIO) {
  const t0 = adesso.getTime()
  const oggi = new Date(t0 + scartoDiRoma(t0) * 60000)
  for (let giorno = 0; giorno < 3; giorno += 1) {
    const ingenuo = Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate() + giorno, ora)
    // Lo scarto si ricalcola sull'istante vero: il cambio d'ora sta in mezzo.
    const vero = ingenuo - scartoDiRoma(ingenuo - scartoDiRoma(ingenuo) * 60000) * 60000
    if (vero > t0) return new Date(vero)
  }
  return new Date(t0 + 86400000)
}

const accesi = (lic) => Object.entries(lic?.moduli || {}).filter(([, v]) => v === true).map(([m]) => m)
const terminaliDi = (lic) => Math.max(1, Number(lic?.terminali) || 1)
const stessiLimiti = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
const ferma = (stato) => stato === 'sospesa' || stato === 'chiusa'

// Cosa toglie la licenza nuova rispetto a quella scritta, a parole: vuoto
// se non toglie niente. I limiti che cambiano contano sempre come una
// riduzione: cambiano solo entrando o uscendo dal Free, e nel dubbio si
// aspetta il taglio.
function cosaRiduce(attuale, nuova) {
  if (!attuale) return []
  const via = []
  for (const m of accesi(attuale)) if (nuova?.moduli?.[m] !== true) via.push(`il modulo ${m}`)
  if (terminaliDi(nuova) < terminaliDi(attuale)) via.push(`i terminali da ${terminaliDi(attuale)} a ${terminaliDi(nuova)}`)
  if (nuova?.limiti != null && !stessiLimiti(attuale.limiti, nuova.limiti)) via.push(`i limiti del piano ${nuova.piano}`)
  return via
}

// Il compito arriva puntuale, ma un minuto di tolleranza evita che uno
// arrivato pochi secondi prima trovi lo stato ancora da trattenere (la
// stessa tolleranza di scadenze.daRiprogrammare).
const TOLLERANZA = 60_000

// Lo stato che ferma il locale, voluto dal pagamento, si trattiene finché
// non arriva il suo momento (`statoDal`, REQ-FLOTTA-095)?
function statoTrattenuto(attuale, nuova, statoDal, adesso) {
  const quando = Date.parse(statoDal || '')
  return Boolean(attuale) && !ferma(attuale.stato) && ferma(nuova?.stato) && Number.isFinite(quando) && quando > adesso.getTime() + TOLLERANZA
}

// La licenza da scrivere adesso. Senza riduzioni, o col taglio arrivato
// (`subito`), la nuova. Con una riduzione, fino al taglio: il piano, i
// moduli, i terminali e i limiti di prima, più i moduli e i terminali che
// la nuova aggiunge; tutto il resto (aggiornamenti, scadenza, stato
// voluto dall'admin) è già quello nuovo.
// `statoDal`: il momento della sospensione per pagamento (null per gli
// stati dell'admin e del titolare). Fino ad allora lo stato resta quello
// di prima, anche col taglio arrivato; `sospensione` dice quando arriva.
function licenzaDaScrivere(attuale, nuova, { subito = false, statoDal = null, adesso = new Date() } = {}) {
  const riduzioni = subito ? [] : cosaRiduce(attuale, nuova)
  let licenza = nuova
  if (riduzioni.length) {
    const moduli = Object.fromEntries([...new Set([...Object.keys(nuova.moduli || {}), ...Object.keys(attuale.moduli || {})])].map((m) => [m, attuale.moduli?.[m] === true || nuova.moduli?.[m] === true]))
    licenza = {
      ...nuova,
      piano: attuale.piano ?? nuova.piano,
      moduli,
      terminali: Math.max(terminaliDi(attuale), terminaliDi(nuova)),
      limiti: nuova.limiti == null ? null : (attuale.limiti ?? null),
      prove: { ...(attuale.prove || {}), ...(nuova.prove || {}) },
    }
  }
  const trattenuto = statoTrattenuto(attuale, nuova, statoDal, adesso)
  if (trattenuto) licenza = { ...licenza, stato: attuale.stato || 'attiva', motivo: attuale.motivo ?? null, dal: attuale.dal ?? null }
  return { licenza, riduzioni, sospensione: trattenuto ? new Date(statoDal).toISOString() : null }
}

module.exports = { ORA_DEL_TAGLIO, oraDelTaglio, prossimoTaglio, cosaRiduce, licenzaDaScrivere }
