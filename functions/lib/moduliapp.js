'use strict'

// ── I MODULI COMPRATI DALL'APP DEL LOCALE, LOGICA PURA (REQ-FLOTTA-037) ─
//
// Da tana-drink (REQ-LIC-012), 02/11/2026: il titolare prova, aggiunge e
// disdice un modulo da «Marketplace → Moduli» nel gestionale, senza passare
// dall'area clienti. Le decisioni dell'utente: al mese come nel listino
// (IVA esclusa), la prova coi giorni dell'admin (REQ-FLOTTA-016), compra
// solo il titolare (il ruolo `admin` dell'app). Il contratto per esteso,
// dal lato dell'app, è in tana-drink/docs/marketplace-moduli.md.
// L'app non scrive niente per un modulo: chiede qui, la regia cambia il
// cliente, e la licenza dell'istanza segue (licenzaSegueIlPiano).
// Qui le decisioni; index.js legge, scrive e parla con Stripe.
// I messaggi d'errore l'app li mostra al titolare così come sono: in
// italiano, impersonali, nel registro del gestionale, senza «tu».

const listino = require('../piani.json')
const { haGiaIlModulo, proveAttive, baseMancante, chiLoRichiede } = require('./prove.js')

const AZIONI = ['prova', 'aggiungi', 'disdici']

// Il listino per l'app: i moduli in vendita, col prezzo mensile IVA
// esclusa e i giorni di prova (0: non si prova). Niente nomi né
// descrizioni: li tiene l'app, sono le parole delle sue schermate.
// `vendita` è quella di free.venditaPulita.
function catalogoModuli(vendita) {
  return {
    moduli: listino.moduli
      .filter((m) => vendita?.moduli?.[m.id] !== false)
      .map((m) => ({ id: m.id, prezzo: m.prezzo, prova_giorni: vendita?.prove?.[m.id] || 0 })),
  }
}

// Il corpo della richiesta, pulito, o null.
function corpoModulo(body) {
  const modulo = typeof body?.modulo === 'string' ? body.modulo : ''
  const azione = typeof body?.azione === 'string' ? body.azione : ''
  if (!/^[a-z_]{2,40}$/.test(modulo) || !AZIONI.includes(azione)) return null
  return { modulo, azione, ritorno: typeof body?.ritorno === 'string' ? body.ritorno : '' }
}

// I domini dell'installazione: l'Hosting del progetto e l'indirizzo
// registrato del locale (anche un dominio personalizzato), più quelli in
// `domini`, se l'admin ne registra altri.
function dominiDi(istanza) {
  const host = (u) => {
    try {
      return new URL(u).hostname.toLowerCase()
    } catch {
      return null
    }
  }
  const p = istanza?.progetto
  return new Set([p && `${p}.web.app`, p && `${p}.firebaseapp.com`, host(istanza?.url), ...(istanza?.domini || []).map((d) => String(d).toLowerCase())].filter(Boolean))
}

// Il ritorno dopo un eventuale pagamento: solo https e solo su un dominio
// dell'installazione, altrimenti null. Un ritorno non controllato non
// diventa mai la pagina d'arrivo di Stripe.
function ritornoValido(ritorno, istanza) {
  let u
  try {
    u = new URL(String(ritorno || ''))
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null
  return dominiDi(istanza).has(u.hostname.toLowerCase()) ? u.toString() : null
}

const nomeDi = (id) => listino.moduli.find((m) => m.id === id)?.nome || id

// Il modulo si compra da qui? Nel listino e in vendita. Disdire no: chi lo
// ha lo toglie anche quando non è più in vendita.
function moduloInVendita(id, vendita) {
  if (!listino.moduli.some((m) => m.id === id)) return 'Modulo sconosciuto.'
  if (vendita?.moduli?.[id] === false) return `${nomeDi(id)} non è in vendita.`
  return null
}

// Il locale accetta il cambio? Attivo, con la licenza attiva.
function localeAttivo(istanza) {
  if (istanza?.stato !== 'attiva') return 'Il locale non è attivo.'
  if ((istanza.licenza_stato || 'attiva') !== 'attiva') return 'Il locale è sospeso.'
  return null
}

// Come cambia un modulo, secondo il piano: → { modo } o { errore }.
//   - 'stripe': la subscription, col conguaglio, come «Cambia piano»;
//   - 'richiesta': un piano gestito a mano (pagato fuori da Stripe, o
//     regalato): da qui si scriverebbe il modulo senza nessun pagamento,
//     quindi la regia registra una richiesta per l'assistenza e l'admin
//     accende il modulo dal backoffice a pagamento ricevuto (il contratto
//     del 02/11/2026 sera, `in_attesa`);
//   - sul Free i moduli comprati non si accendono, e un abbonamento Stripe
//     non attivo prima si sistema.
function comeCambia(cliente) {
  const ab = cliente?.abbonamento || {}
  if (ab.origine === 'gratuito' || cliente?.piano === 'free') return { errore: 'I moduli si aggiungono ai piani a pagamento: il piano si cambia dall’area clienti.' }
  if (ab.origine !== 'stripe' || !ab.stripe_subscription) return { modo: 'richiesta' }
  if (ab.stato !== 'attivo') return { errore: 'L’abbonamento non è attivo: prima va sistemato il pagamento dall’area clienti.' }
  return { modo: 'stripe' }
}

const sceltaCon = (cliente, moduli) => ({ piano: cliente.piano, moduli, terminali: cliente.terminali || 1 })

// AGGIUNGI: la scelta nuova (stesso piano, stessi terminali, moduli più
// questo) e il modo, o { errore }. Un modulo in prova diventa comprato: la
// prova la toglie poi proveDaTogliere.
// E SENZA LA SUA BASE NON SI AGGIUNGE (tana-drink REQ-LIC-015): l'app non
// mostra il tasto, ma questa è la porta vera.
function sceltaPerAggiungere(cliente, istanza, id, vendita, adesso = new Date()) {
  const base = baseMancante(cliente, id, adesso)
  const errore =
    localeAttivo(istanza) ||
    moduloInVendita(id, vendita) ||
    (haGiaIlModulo(cliente, id) ? `${nomeDi(id)} è già attivo.` : null) ||
    (base ? `${nomeDi(id)} richiede ${base}.` : null)
  if (errore) return { errore }
  const come = comeCambia(cliente)
  if (come.errore) return come
  return { scelta: sceltaCon(cliente, [...(cliente.moduli || []), id]), modo: come.modo }
}

// DISDICI: la scelta senza il modulo e il modo, o { errore }. Un modulo
// compreso nel piano non si disdice da solo; uno in prova si spegne alla
// fine della prova.
function sceltaPerDisdire(cliente, istanza, id, adesso = new Date()) {
  if (!listino.moduli.some((m) => m.id === id)) return { errore: 'Modulo sconosciuto.' }
  const errore = localeAttivo(istanza)
  if (errore) return { errore }
  if (listino.piani[cliente?.piano]?.include?.includes(id)) return { errore: 'Il modulo è compreso nel piano: si toglie cambiando piano.' }
  if (!(cliente?.moduli || []).includes(id)) {
    return { errore: proveAttive(cliente, adesso).includes(id) ? 'Il modulo è in prova: si spegne da solo alla fine della prova.' : 'Il modulo non è attivo.' }
  }
  // Una base non si disdice finché qualcuno la richiede (l'utente,
  // 07/11/2026): via il menù, gli ordini dal telefono resterebbero senza.
  const dipendenti = chiLoRichiede(cliente, id, adesso)
  if (dipendenti.length) return { errore: `Prima va tolto ${dipendenti.join(' e ')}, che richiede ${nomeDi(id)}.` }
  const come = comeCambia(cliente)
  if (come.errore) return come
  return { scelta: sceltaCon(cliente, cliente.moduli.filter((m) => m !== id)), modo: come.modo }
}

// ── LA RICHIESTA ALL'ASSISTENZA (un piano gestito a mano) ──────────────
// È una richiesta di contatto come quelle della dashboard coi pagamenti
// spenti (REQ-FLOTTA-017): stesso documento, stesso elenco nel backoffice,
// dove l'admin la evade con «Cambia piano» fuori da Stripe e la segna
// gestita. Una per modulo, `contatti/<uid>_<modulo>`, così due moduli
// chiesti di fila non si cancellano a vicenda e la richiesta della
// dashboard (`contatti/<uid>`) resta. `scelta` è il piano che l'admin deve
// scrivere: con questo modulo in più, o in meno.
const idRichiesta = (uid, modulo) => `${uid}_${modulo}`

// → { documento } o { errore }. `aperta` è la richiesta già scritta per
// questo modulo, se c'è: la stessa azione ancora in attesa non si ripete
// (e non si rinnova la data), un'azione diversa la sostituisce.
function richiestaDallApp(cliente, { azione, modulo, scelta }, da, aperta, adesso = new Date()) {
  if (aperta?.stato === 'aperta' && aperta.dall_app?.azione === azione) return { errore: 'La richiesta per questo modulo è già all’assistenza.' }
  return {
    documento: {
      uid: cliente.uid || null,
      email: cliente.email || null,
      nome_locale: cliente.nome_locale || null,
      slug: cliente.slug || null,
      scelta,
      telefono: null,
      nota: `Dall’app: ${azione === 'aggiungi' ? 'aggiungere' : 'togliere'} ${nomeDi(modulo)}.`,
      codice: null,
      dall_app: { azione, modulo, da },
      stato: 'aperta',
      chiesta_il: adesso.toISOString(),
    },
  }
}

// Da quando il modulo si spegne: la subscription si aggiorna subito col
// conguaglio dei giorni, come «Cambia piano», quindi oggi. La licenza che
// toglie aspetta il taglio della giornata del locale (REQ-FLOTTA-024): il
// titolare chiude la serata con quello che aveva.
const dalGiorno = (adesso = new Date()) => adesso.toISOString().slice(0, 10)

module.exports = { AZIONI, catalogoModuli, corpoModulo, dominiDi, ritornoValido, moduloInVendita, localeAttivo, comeCambia, sceltaPerAggiungere, sceltaPerDisdire, dalGiorno, idRichiesta, richiestaDallApp }
