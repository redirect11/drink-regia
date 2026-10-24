// ── IL CREDITO AI COME LO VEDE IL SITO (REQ-AI-003) ──────────────────
//
// Il cassetto lo scrivono solo le Functions (functions/lib/ai.js); qui lo
// si racconta. Gli importi nel documento sono micro-euro interi (un
// milionesimo di euro), e il tetto del mese riparte il primo del mese a
// mezzanotte italiana, come sul server: se il documento è fermo al mese
// scorso, lo speso di questo mese è zero.

import listino from '../../piani.json'

export const PACCHETTI_AI = listino.ai.pacchetti
const TETTO_PREDEFINITO = listino.ai.tetto_mensile_predefinito

const MICRO = 1_000_000
export const daMicro = (micro) => (Number(micro) || 0) / MICRO

// Gli euro coi centesimi. Una descrizione costa meno di un centesimo:
// sotto il centesimo si dice «meno di 0,01 €», non «0,00 €».
export function euroCent(n) {
  const v = Number(n) || 0
  if (v > 0 && v < 0.005) return 'meno di 0,01 €'
  const [intera, decimali] = Math.abs(v).toFixed(2).split('.')
  return `${v < 0 ? '−' : ''}${intera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimali} €`
}

export function meseDi(adesso = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
      .formatToParts(adesso)
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}`
}

// Il cassetto in euro, pronto da mostrare.
export function statoCredito(cassetto, adesso = new Date()) {
  if (!cassetto) return null
  const tetto = cassetto.tetto_mensile_microeuro != null ? daMicro(cassetto.tetto_mensile_microeuro) : TETTO_PREDEFINITO
  const spesoMese = cassetto.mese === meseDi(adesso) ? daMicro(cassetto.speso_mese_microeuro) : 0
  return {
    attivo: cassetto.attivo !== false,
    interna: cassetto.interna === true,
    credito: daMicro(cassetto.credito_microeuro),
    tetto,
    spesoMese,
    collegata: Boolean(cassetto.chiave_creata_il),
  }
}

const TIPI = { descrizione: 'Descrizione di un prodotto', fattura: 'Lettura di una fattura' }
const ESITI = {
  ok: 'riuscita',
  rifiuto: 'il modello non ha risposto',
  troncata: 'risposta interrotta',
  vuota: 'risposta vuota',
  illeggibile: 'risposta illeggibile',
}
export const tipoDetto = (t) => TIPI[t] || t
export const esitoDetto = (e) => ESITI[e] || e
