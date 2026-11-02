// ── LE PROVE DEI MODULI, LOGICA PURA (REQ-FLOTTA-016) ──────────────────
//
// Decisione dell'utente del 30/10/2026: «le prove dei moduli, ma posso
// decidere io quali mettere in attivazione trial». L'admin sceglie dal
// backoffice quali moduli si possono provare e per quanti giorni
// (vendita/listino → prove: { modulo: giorni }); il titolare accende la
// prova dalla dashboard, una volta sola per modulo; la licenza accende il
// modulo fino alla scadenza, e ogni mattina le prove scadute si spengono,
// salvo che il titolare non abbia comprato il modulo.

const listino = require('../piani.json')

const GIORNO = 24 * 60 * 60 * 1000
const GIORNI_MAX = 90

// Le prove decise dall'admin, pulite: solo moduli noti, giorni interi fra
// 1 e GIORNI_MAX; tutto il resto vuol dire «niente prova».
function provePulite(doc) {
  return Object.fromEntries(
    listino.moduli
      .map((m) => [m.id, Math.floor(Number(doc?.prove?.[m.id]) || 0)])
      .map(([id, g]) => [id, g >= 1 ? Math.min(g, GIORNI_MAX) : 0])
  )
}

// Il cliente ha già il modulo, nel piano o fra quelli comprati?
function haGiaIlModulo(cliente, id) {
  const p = listino.piani[cliente?.piano]
  return p?.include?.includes(id) || (cliente?.moduli || []).includes(id)
}

// Si può accendere la prova di questo modulo? { ok, perche, giorni, scade_il }
// `vendita` è quella di free.venditaPulita, con le prove già pulite.
function puoProvare(cliente, istanza, id, vendita, adesso = new Date()) {
  const m = listino.moduli.find((x) => x.id === id)
  if (!m) return { ok: false, perche: 'Modulo sconosciuto.' }
  const giorni = vendita?.prove?.[id] || 0
  // I motivi in forma impersonale (REQ-FLOTTA-037): li mostrano così come
  // sono sia la dashboard sia l'app del locale, nel registro del gestionale.
  if (!giorni) return { ok: false, perche: `${m.nome} non si può provare.` }
  if (vendita?.moduli?.[id] === false) return { ok: false, perche: `${m.nome} non è in vendita.` }
  if (istanza?.stato !== 'attiva') return { ok: false, perche: 'Il locale non è attivo.' }
  if ((istanza.licenza_stato || 'attiva') !== 'attiva') return { ok: false, perche: 'Il locale è sospeso o chiuso.' }
  if (haGiaIlModulo(cliente, id)) return { ok: false, perche: `${m.nome} è già attivo nel piano.` }
  if ((cliente?.prove_fatte || []).includes(id)) return { ok: false, perche: `La prova di ${m.nome} è già stata usata: si prova una volta sola.` }

  return { ok: true, perche: null, giorni, scade_il: new Date(adesso.getTime() + giorni * GIORNO).toISOString() }
}

// Le prove ancora in corso: [id, …].
function proveAttive(cliente, adesso = new Date()) {
  return Object.entries(cliente?.prove || {})
    .filter(([, p]) => Date.parse(p?.scade_il) > adesso.getTime())
    .map(([id]) => id)
}

// Le prove da togliere oggi: scadute, o del modulo ormai comprato.
function proveDaTogliere(cliente, adesso = new Date()) {
  return Object.entries(cliente?.prove || {})
    .filter(([id, p]) => !(Date.parse(p?.scade_il) > adesso.getTime()) || haGiaIlModulo(cliente, id))
    .map(([id]) => id)
}

module.exports = { provePulite, haGiaIlModulo, puoProvare, proveAttive, proveDaTogliere, GIORNI_MAX }
