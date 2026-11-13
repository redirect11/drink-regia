// ── IL CREDITO AI COME LO VEDE IL SITO (REQ-AI-003) ──────────────────
//
// Il cassetto lo scrivono solo le Functions (functions/lib/ai.js); qui lo
// si racconta. Gli importi nel documento sono micro-euro interi (un
// milionesimo di euro), e il tetto del mese riparte il primo del mese a
// mezzanotte italiana, come sul server: se il documento è fermo al mese
// scorso, lo speso di questo mese è zero.

import listino from '../../functions/piani.json'

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
    // Lo sforamento che il credito non copriva (REQ-FLOTTA-093): il credito
    // si è fermato a zero, e questo lo paga Stonebit (Daniele, 13/11/2026:
    // «In realtà è un costo che ci accolliamo»).
    sforato: Math.max(0, daMicro(cassetto.sforato_microeuro)),
  }
}

// ── IL MODELLO PER TIPO DI RICHIESTA (REQ-FLOTTA-092) ──
// Come lo sceglie l'admin nel backoffice: i modelli sono quelli che hanno
// un prezzo nel listino; senza scelta, o con un valore fuori listino, vale
// il predefinito, come sul server (functions/lib/ai.js, modelloPer).
export const MODELLI_AI = Object.keys(listino.ai.prezzi_usd_per_milione)
export const MODELLO_PREDEFINITO = listino.ai.modello
export const TIPI_MODELLO_DETTI = [
  ['descrizione', 'Descrizione'],
  ['fattura', 'Fattura'],
  ['tema', 'Tema'],
  ['chat', 'Chat'],
]
export function modelloScelto(tipo, impostazioni) {
  const scelto = impostazioni?.ai_modelli?.[tipo]
  return MODELLI_AI.includes(scelto) ? scelto : MODELLO_PREDEFINITO
}

// ── I LIMITI DELLA CHAT (REQ-FLOTTA-094) ──
// Gli stessi numeri di functions/lib/ai-chat.js (LIMITI_CHAT_PREDEFINITI e
// TETTI_LIMITI_CHAT): tests/ai-chat.test.js li confronta. Qui servono al
// backoffice per mostrare il valore in uso e fermare un numero fuori dal
// tetto prima di mandarlo; il server li ricontrolla comunque.
export const LIMITI_CHAT = Object.freeze({
  predefiniti: { max_token_risposta: 4000, max_token_conversazione: 50000, max_strumenti_per_messaggio: 5, righe: { giacenza: 5, vendite: 20, cerca_prodotti: 15 } },
  tetti: { max_token_risposta: 16000, max_token_conversazione: 200000, max_strumenti_per_messaggio: 20, righe: { giacenza: 100, vendite: 100, cerca_prodotti: 100 } },
})
// Le voci come le vede l'admin: [chiave, etichetta, strumento delle righe].
export const VOCI_LIMITI_CHAT = [
  ['max_token_risposta', 'Token della risposta'],
  ['max_token_conversazione', 'Token della conversazione'],
  ['max_strumenti_per_messaggio', 'Strumenti per messaggio'],
  ['giacenza', 'Righe di Giacenza', true],
  ['vendite', 'Righe di Vendite', true],
  ['cerca_prodotti', 'Righe di Cerca prodotti', true],
]
const limiteValido = (v, tetto) => Number.isSafeInteger(v) && v > 0 && v <= tetto
// Il valore in uso di una voce: quello salvato se sta nel suo intervallo,
// se no il predefinito, come sul server (limitiChat).
export function limiteChatScelto(voce, impostazioni, { riga = false } = {}) {
  const l = impostazioni?.limiti_chat || {}
  const salvato = riga ? l.righe?.[voce] : l[voce]
  const tetto = riga ? LIMITI_CHAT.tetti.righe[voce] : LIMITI_CHAT.tetti[voce]
  const predefinito = riga ? LIMITI_CHAT.predefiniti.righe[voce] : LIMITI_CHAT.predefiniti[voce]
  return limiteValido(salvato, tetto) ? salvato : predefinito
}
export const tettoLimiteChat = (voce, { riga = false } = {}) => (riga ? LIMITI_CHAT.tetti.righe[voce] : LIMITI_CHAT.tetti[voce])
export const limiteChatValido = limiteValido

const TIPI = { descrizione: 'Descrizione di un prodotto', fattura: 'Lettura di una fattura', tema: 'Tema dal mockup', chat: 'Chat del gestionale' }
const ESITI = {
  ok: 'riuscita',
  rifiuto: 'il modello non ha risposto',
  troncata: 'risposta interrotta',
  vuota: 'risposta vuota',
  illeggibile: 'risposta illeggibile',
  // REQ-FLOTTA-088: la Function si è fermata a metà; si paga la stima.
  interrotta: 'interrotta, addebitata la stima',
}
export const tipoDetto = (t) => TIPI[t] || t
export const esitoDetto = (e) => ESITI[e] || e
// Da dove arriva una ricarica: un pagamento dal sito, uno ricevuto fuori
// da Stripe e accreditato da noi, o un regalo (l'utente, 06/11/2026).
const ORIGINI = { stripe: 'pagamento', manuale: 'accreditata da noi', omaggio: 'in omaggio' }
export const origineDetta = (o) => ORIGINI[o] || o

// IL FREE NON HA L'AI (REQ-FLOTTA-087; Daniele, 13/11/2026: «I free non
// hanno l'ai»). La stessa regola delle Functions (functions/lib/ai.js,
// aiConcessa), che è quella che conta: qui serve solo a non mostrare il
// credito e i tasti dell'AI a chi non potrebbe usarli. Il piano tornato al
// Free per un pagamento mancato e il piano del cliente: se uno dei due è
// un piano senza AI, niente AI. La copia `licenza_piano` dell'istanza non
// conta (revisione del 13/11/2026): può restare 'free' a un locale che è
// tornato a pagare.
const pianoSenzaAI = (id) => Boolean(id) && listino.piani[id]?.limiti?.ai === false
export function aiNelPiano(cliente, istanza) {
  if (!cliente) return false
  return ![istanza?.ripiego_free ? 'free' : null, cliente.piano].some(pianoSenzaAI)
}
