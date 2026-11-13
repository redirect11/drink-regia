'use strict'

// ── LE STAMPANTI DEL LOCALE NELLA RICHIESTA (REQ-FLOTTA-081) ───────────
//
// Daniele, 12/11/2026: nella richiesta di informazioni e in quella
// d'acquisto il titolare dice la sua stampante non fiscale e il suo
// registratore telematico (RT), da un elenco o scritti a mano: «ci serve a
// noi per implementare il supporto». L'elenco sta in functions/stampanti.json.

const elenco = require('../stampanti.json')

const NON_FISCALI = elenco.non_fiscali.flatMap((g) => g.modelli)
const FISCALI = elenco.fiscali
const NESSUNA = 'nessuna'
const NON_SO = 'non_so'
const ALTRA = 'altra'

// Il testo scritto a mano: niente caratteri di controllo, spazi in fila
// ridotti a uno, da 2 a 80 caratteri.
const pulito = (s) =>
  String(s ?? '')
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

function una(dato, ammessi, speciale) {
  const scelta = String(dato?.scelta ?? '')
  if (scelta === ALTRA) {
    const altra = pulito(dato?.altra)
    return altra.length >= 2 && altra.length <= 80 ? { scelta, altra } : null
  }
  return ammessi.includes(scelta) || scelta === speciale ? { scelta, altra: null } : null
}

// { ok, perche, stampanti }: tutte e due le scelte, o niente.
function stampantiPulite(dati) {
  const non_fiscale = una(dati?.non_fiscale, NON_FISCALI, NESSUNA)
  const fiscale = una(dati?.fiscale, FISCALI, NON_SO)
  if (!non_fiscale || !fiscale) return { ok: false, perche: 'Indica la stampante non fiscale e il registratore telematico, dall’elenco o scritti a mano.', stampanti: null }
  return { ok: true, perche: null, stampanti: { non_fiscale, fiscale } }
}

// In una riga, per il backoffice.
function stampantiDette(s) {
  if (!s?.non_fiscale || !s?.fiscale) return null
  const nf = s.non_fiscale.scelta === ALTRA ? s.non_fiscale.altra : s.non_fiscale.scelta === NESSUNA ? 'non ancora' : s.non_fiscale.scelta
  const rt = s.fiscale.scelta === ALTRA ? s.fiscale.altra : s.fiscale.scelta === NON_SO ? 'non lo sa' : s.fiscale.scelta
  return `Stampante: ${nf} · RT: ${rt}`
}

module.exports = { stampantiPulite, stampantiDette, NON_FISCALI, FISCALI, NESSUNA, NON_SO, ALTRA }
