// ── IL RINNOVO DI UN LOCALE SOSPESO, PER L'AREA DEL TITOLARE ──────────
// (REQ-FLOTTA-090)
//
// Daniele, 13/11/2026: «Al cliente dobbiamo mostrare una cosa diversa. Il
// servizio viene sospeso subito ma dobbiamo portare l'utente alla
// schermata di pagamento per il rinnovo in qualche modo (se prevediamo di
// accettare pagamenti altrimenti sito sospeso e si danno le info di
// contatto per contattarci)». E le sospensioni dell'admin come quelle per il
// pagamento: al titolare solo i contatti («Si»).
//
// Qui solo la decisione di cosa dire, da quello che la dashboard legge già
// (cliente, istanza, vendita). Il tasto per pagare decide solo se mostrarsi:
// la regola che conta la rifà il server (pagamentoRinnovo), perché il
// browser non è di fiducia.

import { EMAIL_CONTATTI } from './prodotto.js'

// Il parametro di rinnovo_url (functions/lib/rinnovo.js, PERCORSO_RINNOVO):
// con ?rinnovo=1 il riquadro c'è anche col locale in regola, e lo dice.
export const PARAMETRO_RINNOVO = 'rinnovo'

// Gli stati dell'abbonamento a parole. Sul cliente la regia scrive i suoi
// (attivo, in sospeso, non pagato, disdetto: functions/lib/abbonamento.js,
// STATI_STRIPE); quelli grezzi di Stripe si traducono lo stesso, così un
// valore scritto a mano o da una versione vecchia non arriva al titolare
// come «past_due». «In sospeso» si dice «in ritardo col pagamento»: col
// locale «sospeso» si confonderebbe.
const ABBONAMENTO_DETTO = {
  attivo: 'attivo',
  active: 'attivo',
  trialing: 'attivo',
  'in sospeso': 'in ritardo col pagamento',
  past_due: 'in ritardo col pagamento',
  'non pagato': 'non pagato',
  unpaid: 'non pagato',
  disdetto: 'disdetto',
  canceled: 'disdetto',
  incomplete_expired: 'disdetto',
}
export const abbonamentoDetto = (stato) => ABBONAMENTO_DETTO[stato] || 'da verificare'

// Fermo per il pagamento: lo dice `licenza_per` (functions/index.js,
// scriviStatoIstanza). I locali sospesi prima del campo hanno solo il
// motivo «pagamento non ricevuto»: la regia li riconosce così anche nel
// compito programmaScadenze.
const perIlPagamento = (istanza) => istanza?.licenza_per === 'pagamento' || (!istanza?.licenza_per && /pagamento non ricevuto/.test(istanza?.licenza_motivo || ''))

// Dal 13/11/2026 (REQ-FLOTTA-095) la sospensione per il pagamento arriva
// all'app al suo momento, fuori dall'orario di servizio: finché non è
// arrivata, istanze/{slug}.sospensione_al dice quando.
function sospensioneAlMomento(istanza) {
  const dal = istanza?.sospensione_al?.dal
  return dal && Number.isFinite(Date.parse(dal)) ? dal : null
}

// Prima arrivava al taglio della giornata (REQ-FLOTTA-024), nominata dalla
// riduzione in attesa: resta per le sospensioni decise prima del cambio.
function sospensioneAlTaglio(istanza) {
  const r = istanza?.riduzione_al_taglio
  if (!r?.dal || !Array.isArray(r.cosa)) return null
  return r.cosa.some((c) => /^lo stato (sospesa|chiusa)$/.test(c)) ? r.dal : null
}

// Cosa dire al titolare: null se non c'è niente da dire, altrimenti
// { tipo, perPagamento, paga, dal, siFerma, alTaglio, cancellazione, email }.
// `siFerma`: quando la sospensione per pagamento arriva all'app.
// `tipo`: 'sospeso', 'chiuso', 'in ritardo', 'non pagato' (il locale lavora
// ancora). `paga`: si mostra il tasto per pagare con Stripe, cioè pagamenti
// online accesi e un abbonamento Stripe; per un sospeso, solo se fermo per
// il pagamento. Un abbonamento a mano si rinnova scrivendoci, come dice già
// «Piano e moduli» («Per rinnovare o disdire scrivici»).
export function situazioneRinnovo({ cliente, istanza, vendita }) {
  const ab = cliente?.abbonamento || {}
  const conStripe = ab.origine === 'stripe' && Boolean(ab.stripe_customer)
  const online = vendita?.pagamenti_online === true
  const base = { dal: istanza?.licenza_dal || null, siFerma: null, alTaglio: null, cancellazione: null, email: EMAIL_CONTATTI }
  const licenza = istanza?.stato === 'attiva' ? istanza.licenza_stato || 'attiva' : null
  if (licenza === 'chiusa') {
    const e = istanza.eliminazione
    const cancellazione = ['programmata', 'in coda', 'in corso'].includes(e?.stato) ? e.quando || null : null
    return { ...base, tipo: 'chiuso', perPagamento: perIlPagamento(istanza), paga: false, cancellazione }
  }
  if (licenza === 'sospesa') {
    const perPagamento = perIlPagamento(istanza)
    return {
      ...base,
      tipo: 'sospeso',
      perPagamento,
      paga: perPagamento && online && conStripe,
      siFerma: perPagamento ? sospensioneAlMomento(istanza) : null,
      alTaglio: perPagamento ? sospensioneAlTaglio(istanza) : null,
    }
  }
  // Il locale lavora, ma il pagamento non va: si avvisa prima che si fermi.
  const detto = abbonamentoDetto(ab.stato)
  if (detto === 'in ritardo col pagamento' || detto === 'non pagato') {
    return { ...base, dal: null, tipo: detto === 'non pagato' ? 'non pagato' : 'in ritardo', perPagamento: true, paga: online && conStripe }
  }
  return null
}
