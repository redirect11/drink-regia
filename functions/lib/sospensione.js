// ── SOSPENDERE E CHIUDERE UN'ISTANZA, LOGICA PURA (REQ-FLOTTA-008) ─────
//
// «Serve un modo per eliminare/fermare l'app deployata (ad esempio se non
// arriva il pagamento mensile)». Lo stato della licenza dell'istanza
// (`licenza/attuale`, BUG-125 di tana-drink) lo scrive la regia: a mano dal
// backoffice, o quando l'abbonamento cambia stato (REQ-FLOTTA-023: Stripe
// finisce i tentativi, scade un pagamento a mano). Qui le parole dello
// stato; il cambio di stato sta in scadenze.js.

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


module.exports = { STATI, GIORNI_DI_GRAZIA, patchLicenza }
