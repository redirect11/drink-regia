'use strict'

// ── IL RINNOVO DI UN LOCALE SOSPESO, LOGICA PURA (REQ-FLOTTA-090) ──────
//
// Daniele, 13/11/2026: «Il servizio viene sospeso subito ma dobbiamo
// portare l'utente alla schermata di pagamento per il rinnovo in qualche
// modo (se prevediamo di accettare pagamenti altrimenti sito sospeso e si
// danno le info di contatto per contattarci)». L'app del locale (tana-drink)
// mostra al titolare il tasto «Riattiva il locale», che apre `rinnovo_url`
// della licenza: la sezione del piano nell'area del titolare, dove il
// riquadro del rinnovo dice se si paga o a chi scrivere.

// La sezione «Piano e moduli» (src/lib/areaTitolare.js) col parametro che
// l'area del titolare legge (src/lib/rinnovo.js, PARAMETRO_RINNOVO).
const PERCORSO_RINNOVO = '/dashboard/piano?rinnovo=1'

// L'indirizzo del rinnovo dall'indirizzo della regia (REGIA_URL). Se ne
// tiene solo l'origine: un percorso o una barra finale in REGIA_URL non
// devono finire nell'indirizzo che l'app apre. Null se non è un http(s)
// che si legge: l'app, senza indirizzo, mostra solo i contatti.
function rinnovoUrl(regiaUrl) {
  if (typeof regiaUrl !== 'string' || !regiaUrl) return null
  try {
    const u = new URL(regiaUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.origin}${PERCORSO_RINNOVO}`
  } catch {
    return null
  }
}

// La pagina di Stripe dove si paga la fattura del rinnovo, o null.
// Si guarda l'ULTIMA fattura della subscription (`latest_invoice`,
// espansa da chi chiama): è lei che, pagata, riporta la subscription a
// «active», e il webhook (invoice.paid → abbonamento attivo) riattiva il
// locale da solo (REQ-FLOTTA-023). Una fattura già pagata, annullata, in
// bozza o a zero non ha niente da pagare: allora il portale clienti, per
// cambiare la carta. Solo un https: l'indirizzo finisce in una
// navigazione del browser.
function fatturaDelRinnovo(subscription) {
  const f = subscription?.latest_invoice
  if (!f || typeof f !== 'object') return null
  if (f.status !== 'open') return null
  if (!(Number(f.amount_remaining) > 0)) return null
  const url = typeof f.hosted_invoice_url === 'string' ? f.hosted_invoice_url : ''
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

module.exports = { PERCORSO_RINNOVO, rinnovoUrl, fatturaDelRinnovo }
