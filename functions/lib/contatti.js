'use strict'

// ── PAGAMENTI ONLINE SPENTI: LA RICHIESTA DI CONTATTO (REQ-FLOTTA-017) ──
//
// Decisione dell'utente del 30/10/2026: in produzione i pagamenti con
// Stripe si possono tenere spenti finché non si è pronti a riceverli.
// Allora il titolare non va al Checkout: sceglie il piano e lascia un
// recapito; l'admin lo chiama o gli scrive, concorda il pagamento con
// altri mezzi (bonifico, a mano) e attiva il piano dal backoffice con
// «Cambia piano» fuori da Stripe. Il Free non passa di qui: non si paga.

const { sceltaPulita } = require('./abbonamento.js')
const { eGratuito, moduliFuoriVendita } = require('./free.js')

const NOTA_MAX = 500
// Un telefono come lo scrive una persona: cifre, spazi, + e trattini.
const TELEFONO = /^\+?[0-9][0-9 .-]{5,19}$/

// Toglie i caratteri di controllo (tranne l'a capo) e taglia alla lunghezza.
const { CODICE } = require('./sconti.js')
const testo = (s, max) =>
  [...String(s ?? '')]
    .filter((c) => c === '\n' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127))
    .join('')
    .trim()
    .slice(0, max)

// I pagamenti online sono accesi? Spenti se l'admin non li ha accesi.
const pagamentiOnline = (vendita) => vendita?.pagamenti_online === true

// La richiesta del titolare: { ok, perche, documento }.
function richiestaContatto(cliente, dati, vendita, adesso = new Date()) {
  if (!cliente) return { ok: false, perche: 'Nessun locale registrato per questo account.' }
  if (pagamentiOnline(vendita)) return { ok: false, perche: 'I pagamenti online sono attivi: scegli il piano e vai al pagamento.' }
  const scelta = sceltaPulita(dati)
  if (eGratuito(dati?.piano)) return { ok: false, perche: 'Il piano Free non si paga: attivalo dalla scelta del piano.' }
  const fuori = moduliFuoriVendita(cliente, scelta, vendita)
  if (fuori.length) return { ok: false, perche: `Non più in vendita: ${fuori.join(', ')}.` }
  const telefono = testo(dati?.telefono, 20)
  if (telefono && !TELEFONO.test(telefono)) return { ok: false, perche: 'Il numero di telefono non sembra valido.' }
  return {
    ok: true,
    perche: null,
    documento: {
      uid: cliente.uid || null,
      email: cliente.email || null,
      nome_locale: cliente.nome_locale || null,
      slug: cliente.slug || null,
      scelta,
      telefono: telefono || null,
      nota: testo(dati?.nota, NOTA_MAX) || null,
      // Il codice sconto scritto nella scelta del piano (REQ-FLOTTA-028):
      // coi pagamenti spenti lo applica l'admin, quando attiva il piano.
      codice: CODICE.test(testo(dati?.codice, 24).toUpperCase()) ? testo(dati?.codice, 24).toUpperCase() : null,
      stato: 'aperta',
      chiesta_il: adesso.toISOString(),
    },
  }
}

module.exports = { pagamentiOnline, richiestaContatto, NOTA_MAX }
