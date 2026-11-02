'use strict'

// ── IL SITO SI PRESENTA ALLA REGIA, LOGICA PURA (REQ-FLOTTA-026) ───────
//
// L'utente, 02/11/2026: «non deve essere il deploy ad avvisare la regia ma
// l'istanza del sito stesso in qualche modo. Cioè regia e il sito custom
// del bar si devono parlare dopo il deploy e si scambiano dati tra loro
// rispetto alle licenze attivazione e etc.»
//
// Al primo avvio di ogni versione l'app chiama la regia (la Function
// `presentazione`) col token di chi ha fatto l'accesso: «sono il progetto
// X, versione Y». Da qualunque deploy arrivi, della regia o di GitHub. La
// regia riconosce il progetto fra le sue istanze, verifica il token con
// quel progetto e si segna la versione. Dopo, la regia parla al sito
// scrivendo la licenza, come sempre. Nessun giro periodico: si chiama una
// volta per versione.
//
// tana-drink, 02/11/2026: «l'app non fa accessi anonimi, quindi la
// presentazione parte solo con qualcuno collegato. Su un'installazione
// nuova senza licenza e senza sessione, la schermata «non attivata» copre
// anche la pagina di accesso [...]. La licenza va scritta all'attivazione,
// prima dell'app». Quindi la presentazione NON è l'attivazione: la licenza
// c'è già prima dell'app (scripts/licenza-istanza.mjs nell'attivazione
// della regia; il deploy di tana-drink per la Tana). Se manca lo stesso,
// e un dispositivo ha ancora una sessione aperta, la regia la riscrive.
//
// Non passa nessun dato operativo del locale: identità, versione, licenza.

// Una versione dell'app: v1.10.4, o 1.10.4-beta.2.
const VERSIONE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/

// Il corpo della chiamata: { versione }. Null se non va.
function corpoPresentazione(body) {
  const v = String(body?.versione ?? '').trim()
  if (!VERSIONE.test(v)) return null
  return { versione: v.startsWith('v') ? v : `v${v}` }
}

// La stessa versione già vista da poco non si riscrive: dieci tablet che
// si aprono insieme dopo un deploy fanno una scrittura, non dieci.
const RISCRIVI_DOPO = 10 * 60 * 1000
function daRegistrare(prima, versione, adesso = new Date()) {
  const p = prima?.presentazione
  if (!p || p.versione !== versione) return true
  return !(adesso.getTime() - Date.parse(p.il || '') < RISCRIVI_DOPO)
}

// Quello che si segna sull'istanza. `prima_il`: la prima volta che questa
// versione si è presentata, cioè quando è arrivata davvero al locale.
function registroPresentazione(prima, { versione, uid = null, adesso = new Date() } = {}) {
  const p = prima?.presentazione
  const stessa = p?.versione === versione
  return {
    presentazione: {
      versione,
      il: adesso.toISOString(),
      prima_il: stessa ? p.prima_il || p.il || adesso.toISOString() : adesso.toISOString(),
      da: uid,
    },
  }
}

// Cosa fare della licenza del sito che si presenta.
// - 'non_dalla_regia': un locale esistente che la licenza la ha per conto
//   suo (la Tana, finché non la si collega);
// - 'non_attiva': un'istanza non ancora attiva, chiusa o eliminata nella
//   regia: non le si scrive niente;
// - 'scrivi': manca, e chi si presenta ha una sessione aperta: la regia la
//   riscrive (l'attivazione l'avrebbe dovuta scrivere prima dell'app);
// - 'presente': c'è già, e la regia la tiene aggiornata da sé.
function cosaFareConLaLicenza(ist, { esiste = false, riceve = true } = {}) {
  if (ist?.licenza_dalla_regia === false) return 'non_dalla_regia'
  if (!riceve) return 'non_attiva'
  return esiste ? 'presente' : 'scrivi'
}

module.exports = { VERSIONE, RISCRIVI_DOPO, corpoPresentazione, daRegistrare, registroPresentazione, cosaFareConLaLicenza }
