'use strict'

// ── IL LIBRO DEI MOVIMENTI, LOGICA PURA (REQ-FLOTTA-041) ────────────────
//
// L'utente, 07/11/2026: «una dashboard che mi mostra il guadagno, le
// attivazioni, il traffico». Fino a oggi la regia sapeva lo STATO di un
// abbonamento (attivo, non pagato, disdetto) ma non quanto fosse entrato:
// le fatture stavano solo in Stripe, i bonifici solo nella testa di chi li
// riceveva. Qui ogni incasso diventa una riga di `movimenti/{id}`, scritta
// dalle Functions e letta dall'admin:
//   { id, il, tipo, uid, slug, importo, iva, totale, origine, riferimento,
//     descrizione, periodo?, da? }
// - `tipo`: abbonamento (una fattura di Stripe, con dentro anche
//   l'attivazione una tantum della prima), ricarica_ai (un pacchetto di
//   credito), manuale (un pagamento ricevuto fuori da Stripe e registrato
//   dall'admin: bonifico, contanti).
// - `importo` è l'imponibile in euro, `iva` la tassa, `totale` quello che
//   il cliente ha pagato davvero: la dashboard ragiona sull'imponibile, il
//   listino è IVA esclusa.
// - L'id è deterministico (la fattura, la sessione): un evento di Stripe
//   ripetuto non fa due righe, e il registro eventi_stripe lo ferma comunque.
// Un omaggio di credito AI NON è un movimento: non è entrato niente.

const TIPI = ['abbonamento', 'ricarica_ai', 'manuale']
const ORIGINI = ['stripe', 'manuale']
const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/

const euro = (cent) => Math.round(Number(cent) || 0) / 100
const alCentesimo = (n) => Math.round((Number(n) || 0) * 100) / 100
const iso = (secondi) => (Number.isFinite(Number(secondi)) && Number(secondi) > 0 ? new Date(Number(secondi) * 1000).toISOString() : null)

// Una fattura di Stripe pagata → il movimento, o null se non c'è niente
// da registrare (importo zero: una fattura di prova, un coupon al 100%).
// `subtotal_excluding_tax` c'è quando la fattura ha una tax rate; senza,
// `subtotal` è già l'imponibile. `amount_paid` è quello che è entrato: con
// un coupon (Fondatori) è il totale scontato, e l'imponibile si ricava da
// lì togliendo la tassa, non dal subtotal che è prima dello sconto.
function movimentoDaFattura(fattura, { uid, slug, adesso = new Date() } = {}) {
  if (!fattura?.id || !uid) return null
  const totale = euro(fattura.amount_paid ?? fattura.total)
  if (!(totale > 0)) return null
  const iva = euro(fattura.tax)
  const importo = alCentesimo(totale - iva)
  const righe = fattura.lines?.data || []
  const periodi = righe.map((l) => l?.period).filter((p) => p?.start && p?.end)
  const periodo = periodi.length
    ? { dal: iso(Math.min(...periodi.map((p) => p.start))), al: iso(Math.max(...periodi.map((p) => p.end))) }
    : null
  const descrizione = righe.map((l) => String(l?.description || '').trim()).filter(Boolean).join('; ').slice(0, 300) || 'Abbonamento'
  return {
    id: `fattura-${fattura.id}`,
    il: iso(fattura.status_transitions?.paid_at) || iso(fattura.created) || adesso.toISOString(),
    tipo: 'abbonamento',
    uid,
    slug: slug || null,
    importo,
    iva,
    totale,
    origine: 'stripe',
    riferimento: fattura.id,
    descrizione,
    periodo,
  }
}

// Una ricarica del credito AI pagata con Stripe (ai.ricaricaDaSessione ha
// già detto di chi è e quanto credito vale) → il movimento.
function movimentoDaRicarica(sessione, ricarica, { adesso = new Date() } = {}) {
  if (!ricarica?.sessione || !ricarica.uid) return null
  const importo = alCentesimo((Number(ricarica.importo_microeuro) || 0) / 1_000_000)
  if (!(importo > 0)) return null
  const totale = sessione?.amount_total != null ? euro(sessione.amount_total) : importo
  return {
    id: `ricarica-${ricarica.sessione}`,
    il: iso(sessione?.created) || adesso.toISOString(),
    tipo: 'ricarica_ai',
    uid: ricarica.uid,
    slug: ricarica.slug || null,
    importo,
    iva: alCentesimo(totale - importo),
    totale,
    origine: 'stripe',
    riferimento: ricarica.sessione,
    descrizione: `Credito AI ${ricarica.pacchetto || ''}`.trim(),
    periodo: null,
  }
}

// Un pagamento ricevuto fuori da Stripe e registrato dall'admin (un
// bonifico per l'abbonamento, un credito AI accreditato a mano). L'importo
// lo scrive l'admin, IVA esclusa; l'IVA si calcola col listino, perché la
// fattura la fa lui con gli stessi numeri. → il movimento, o { errore }.
function movimentoManuale({ uid, slug, importo, iva = 22, tipo = 'manuale', descrizione = '', riferimento = null, da = null, adesso = new Date() } = {}) {
  const n = Number(String(importo ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return { errore: 'Importo in euro, IVA esclusa, da 0,01 a 100.000.' }
  if (!uid || !SLUG.test(slug || '')) return { errore: 'Cliente sconosciuto.' }
  const imponibile = alCentesimo(n)
  const tassa = alCentesimo((imponibile * (Number(iva) || 0)) / 100)
  const id = riferimento || `manuale-${adesso.getTime()}-${slug}`
  return {
    id,
    il: adesso.toISOString(),
    tipo: TIPI.includes(tipo) ? tipo : 'manuale',
    uid,
    slug,
    importo: imponibile,
    iva: tassa,
    totale: alCentesimo(imponibile + tassa),
    origine: 'manuale',
    riferimento: id,
    descrizione: String(descrizione || '').trim().slice(0, 300) || 'Pagamento registrato dall’amministratore',
    periodo: null,
    da,
  }
}

const movimentoValido = (m) =>
  Boolean(m?.id && m.il && TIPI.includes(m.tipo) && ORIGINI.includes(m.origine) && m.uid) && Number.isFinite(m.importo) && m.importo > 0

module.exports = { TIPI, ORIGINI, movimentoDaFattura, movimentoDaRicarica, movimentoManuale, movimentoValido }
