// ── SOSPENDERE E CHIUDERE UN'ISTANZA, LOGICA PURA (REQ-FLOTTA-008) ─────
//
// «Serve un modo per eliminare/fermare l'app deployata (ad esempio se non
// arriva il pagamento mensile)». Lo stato della licenza dell'istanza
// (`settings/bar.licenza.stato`) lo scrive la regia: a mano dal backoffice,
// o da sola quando l'abbonamento resta «in sospeso» oltre i giorni di
// grazia. Qui le regole; index.js le applica cross-progetto.

const STATI = ['attiva', 'sospesa', 'chiusa']
const GIORNI_DI_GRAZIA = 7
const GIORNO = 86400000

// La patch per settings/bar.licenza di un'istanza.
function patchLicenza(stato, { motivo = null, adesso = new Date() } = {}) {
  if (!STATI.includes(stato)) throw new Error(`Stato «${stato}» non valido`)
  return {
    'licenza.stato': stato,
    'licenza.motivo': stato === 'attiva' ? null : motivo || (stato === 'sospesa' ? 'pagamento non ricevuto' : 'chiusura'),
    'licenza.dal': adesso.toISOString(),
  }
}

// Chi va sospeso oggi: abbonamento «in sospeso» da più di GIORNI_DI_GRAZIA
// giorni, con un'istanza attiva e non già sospesa. Chi è «disdetto» va
// chiuso. Torna [{ cliente, stato, motivo }].
// `ripiega(ist)` vero: con «aggiornamenti solo finché si paga»
// (REQ-FLOTTA-020) chi non paga torna al Free invece di fermarsi, e qui
// non si sospende (lo fa aggiornamenti.daRipiegare).
function daSospendere(clienti, istanze, { adesso = new Date(), giorniDiGrazia = GIORNI_DI_GRAZIA, ripiega = () => false } = {}) {
  const out = []
  for (const c of clienti || []) {
    const ist = istanze?.[c.slug]
    if (!ist || ist.stato !== 'attiva') continue
    // Un'installazione interna (la Tana, REQ-AI-003, decisione dell'utente
    // del 24/10/2026) non si sospende né si chiude da sola: «senza
    // rompere niente». Il segno sta sull'istanza, che scrive solo l'admin,
    // e non sul cliente, che il titolare può modificare.
    if (ist.interna === true) continue
    const lic = ist.licenza_stato || 'attiva'
    const ab = c.abbonamento || {}
    if (ab.stato === 'in sospeso' && lic === 'attiva') {
      if (ripiega(ist)) continue
      const da = Date.parse(ab.aggiornato_il || ab.dal || 0)
      if (Number.isFinite(da) && adesso.getTime() - da >= giorniDiGrazia * GIORNO) {
        out.push({ cliente: c, stato: 'sospesa', motivo: `pagamento non ricevuto da ${giorniDiGrazia} giorni` })
      }
    } else if (ab.stato === 'disdetto' && lic !== 'chiusa') {
      out.push({ cliente: c, stato: 'chiusa', motivo: 'abbonamento disdetto' })
    } else if (ab.stato === 'attivo' && lic === 'sospesa') {
      // Ha pagato: si riattiva da sola.
      out.push({ cliente: c, stato: 'attiva', motivo: null })
    }
  }
  return out
}

module.exports = { STATI, GIORNI_DI_GRAZIA, patchLicenza, daSospendere }
