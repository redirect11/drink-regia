// ── GLI ORARI DI SERVIZIO NEL SITO (REQ-FLOTTA-095): logica pura ──────
//
// Le stesse regole di functions/lib/orari-servizio.js, che le ricontrolla
// sul server: qui servono al modulo per dire l'errore accanto al giorno
// prima di mandare. Un test (tests/orari-servizio.test.js) confronta le
// due copie: il sito non può importare il modulo CommonJS delle Functions.

export const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom']
export const NOMI_GIORNI = { lun: 'Lunedì', mar: 'Martedì', mer: 'Mercoledì', gio: 'Giovedì', ven: 'Venerdì', sab: 'Sabato', dom: 'Domenica' }
export const GIORNI_DI_CORREZIONE = 7
export const MOTIVO_MINIMO = 10
export const AVVISO_SENZA_PAUSA = 'Con questi orari la sospensione per mancato pagamento può arrivare durante il servizio'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const minuti = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const chiuso = (g) => g?.chiuso === true
const durata = (g) => {
  const d = minuti(g.chiude) - minuti(g.apre)
  return d > 0 ? d : d + 1440
}

// Il modulo parte vuoto: ogni giorno da scrivere, o da segnare chiuso.
export const orariVuoti = () => Object.fromEntries(GIORNI.map((id) => [id, { chiuso: false, apre: '', chiude: '' }]))

// Dagli orari salvati ({ chiuso: true } o { apre, chiude }) al modulo.
export const orariNelModulo = (giorni) =>
  Object.fromEntries(GIORNI.map((id) => [id, chiuso(giorni?.[id]) ? { chiuso: true, apre: '', chiude: '' } : { chiuso: false, apre: giorni?.[id]?.apre || '', chiude: giorni?.[id]?.chiude || '' }]))

export function problemiOrari(giorni) {
  const problemi = {}
  for (const id of GIORNI) {
    const g = giorni?.[id]
    if (chiuso(g)) continue
    if (!g || g.apre == null || g.chiude == null || g.apre === '' || g.chiude === '') problemi[id] = 'Scrivi apertura e chiusura, o segna il giorno come chiuso.'
    else if (typeof g.apre !== 'string' || typeof g.chiude !== 'string' || !HHMM.test(g.apre) || !HHMM.test(g.chiude)) problemi[id] = 'Orario non valido: scrivi HH:MM, per esempio 18:30.'
  }
  if (!Object.keys(problemi).length && GIORNI.every((id) => chiuso(giorni[id]))) problemi.orari = 'Almeno un giorno deve essere aperto.'
  return problemi
}

export function orariPuliti(giorni) {
  return Object.fromEntries(GIORNI.map((id) => [id, chiuso(giorni[id]) ? { chiuso: true } : { apre: giorni[id].apre, chiude: giorni[id].chiude }]))
}

// I giorni dopo la cui chiusura non c'è un'ora prima dell'apertura dopo:
// lì la sospensione per mancato pagamento può arrivare in servizio.
export function giorniSenzaPausa(giorni) {
  if (!giorni || Object.keys(problemiOrari(giorni)).length) return []
  return GIORNI.filter((id, i) => {
    const oggi = giorni[id]
    const domani = giorni[GIORNI[(i + 1) % 7]]
    if (chiuso(oggi) || chiuso(domani)) return false
    return 1440 + minuti(domani.apre) - (minuti(oggi.apre) + durata(oggi)) < 60
  })
}

export function correggibiliFino(cliente) {
  const dal = Date.parse(cliente?.orari_servizio?.impostati_il || '')
  return Number.isFinite(dal) ? new Date(dal + GIORNI_DI_CORREZIONE * 86400000).toISOString() : null
}

// Un giorno a parole: «18:00–02:00 (fino al giorno dopo)», «24 ore», «chiuso».
export function giornoDetto(g) {
  if (!g || chiuso(g)) return 'chiuso'
  if (g.apre === g.chiude) return `aperto 24 ore dalle ${g.apre}`
  return minuti(g.chiude) < minuti(g.apre) ? `${g.apre}–${g.chiude} (fino al giorno dopo)` : `${g.apre}–${g.chiude}`
}

// Una data della regia a parole, ora di Roma.
export const quandoDetto = (iso) =>
  new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
