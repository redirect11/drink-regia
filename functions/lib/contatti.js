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
const { problemaBasi } = require('./prove.js')

const NOTA_MAX = 500
// Un telefono come lo scrive una persona: cifre, spazi, + e trattini.
const TELEFONO = /^\+?[0-9][0-9 .-]{5,19}$/

// Toglie i caratteri di controllo (tranne l'a capo) e taglia alla lunghezza.
const { CODICE } = require('./sconti.js')
const { stampantiPulite } = require('./stampanti.js')
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
  // Un modulo senza la sua base non si chiede (tana-drink REQ-LIC-015):
  // l'admin attiverebbe gli ordini senza il menù.
  const basi = problemaBasi(scelta)
  if (basi) return { ok: false, perche: basi }
  const telefono = testo(dati?.telefono, 20)
  if (telefono && !TELEFONO.test(telefono)) return { ok: false, perche: 'Il numero di telefono non sembra valido.' }
  // Le stampanti del locale (REQ-FLOTTA-081): la pagina le chiede sempre;
  // se arrivano, devono essere giuste.
  const st = dati?.stampanti ? stampantiPulite(dati.stampanti) : null
  if (st && !st.ok) return { ok: false, perche: st.perche }
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
      stampanti: st?.stampanti || null,
      // Il codice sconto scritto nella scelta del piano (REQ-FLOTTA-028):
      // coi pagamenti spenti lo applica l'admin, quando attiva il piano.
      codice: CODICE.test(testo(dati?.codice, 24).toUpperCase()) ? testo(dati?.codice, 24).toUpperCase() : null,
      stato: 'aperta',
      chiesta_il: adesso.toISOString(),
    },
  }
}

// UN TEMA SU MISURA DAL FORNITORE (REQ-FLOTTA-040; l'utente, 06/11/2026:
// «la creazione da parte nostra di temi che possiamo fare ad hoc su
// richiesta»). Il titolare racconta il tema che vuole, con la struttura
// del menù e, se ce l'ha, un riferimento (il link a Canva, un sito); la
// richiesta va fra le richieste di contatto, in contatti/<uid>_tema, e
// l'admin la lavora dalla scheda del locale («Nuovo tema su misura…»).
// Non passa dai pagamenti online: è un servizio che si concorda.
const { IMPAGINAZIONI } = require('./stili.js')
const idRichiestaTema = (uid) => `${uid}_tema`

function richiestaTemaSuMisura(cliente, dati, adesso = new Date()) {
  if (!cliente) return { ok: false, perche: 'Nessun locale registrato per questo account.' }
  const descrizione = testo(dati?.descrizione, NOTA_MAX)
  if (descrizione.length < 10) return { ok: false, perche: 'Racconta il tema che vuoi: colori, atmosfera, a cosa deve somigliare.' }
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
      scelta: null,
      telefono: telefono || null,
      nota: descrizione,
      codice: null,
      tema_su_misura: {
        struttura: IMPAGINAZIONI.includes(dati?.struttura) ? dati.struttura : IMPAGINAZIONI[0],
        riferimento: testo(dati?.riferimento, 300) || null,
      },
      stato: 'aperta',
      chiesta_il: adesso.toISOString(),
    },
  }
}

module.exports = { pagamentiOnline, richiestaContatto, NOTA_MAX, richiestaTemaSuMisura, idRichiestaTema }
