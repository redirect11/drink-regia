// ── IL CASSETTO AI, LOGICA PURA (REQ-AI-003) ─────────────────────────
//
// Decisione dell'utente del 24/10/2026: «un cassetto AI unico nella
// regia, per tutti i locali compresa la Tana». Le installazioni non
// chiamano mai il modello da sé e non hanno una chiave: chiedono alla
// Function `richiestaAI` della regia, che controlla il credito
// dell'installazione, chiama Claude con la nostra chiave e scala il costo.
// Qui le regole, senza Firebase né rete: index.js collega, questo decide.
//
// I SOLDI SONO INTERI. Credito, tetto e consumi si tengono in micro-euro
// (un milionesimo di euro): una descrizione costa qualche millesimo, e
// sommare decimali a ogni chiamata con FieldValue.increment lascerebbe
// resti che a fine anno non tornano col conto di Anthropic.

const crypto = require('node:crypto')
const listino = require('../piani.json')

const AI = listino.ai
const MICRO = 1_000_000
const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/

const daEuro = (euro) => Math.round(Number(euro) * MICRO)
const inEuro = (micro) => Math.round(Number(micro) || 0) / MICRO

// Il mese del consumo, nel fuso del locale: il tetto mensile riparte il
// primo del mese a mezzanotte italiana, non a quella di Greenwich.
function meseDi(adesso = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit' })
      .formatToParts(adesso)
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}`
}

// Il cassetto com'è adesso: se il mese è cambiato, lo speso del mese
// riparte da zero (lo si azzera alla prima chiamata del mese, non con un
// lavoro programmato: un cassetto fermo non ha bisogno di niente).
function statoCassetto(cassetto, adesso = new Date()) {
  const mese = meseDi(adesso)
  const c = cassetto || {}
  const spesoMese = c.mese === mese ? Math.max(0, Number(c.speso_mese_microeuro) || 0) : 0
  const tetto = Number.isFinite(Number(c.tetto_mensile_microeuro)) && c.tetto_mensile_microeuro != null
    ? Number(c.tetto_mensile_microeuro)
    : daEuro(AI.tetto_mensile_predefinito)
  return {
    mese,
    attivo: c.attivo !== false,
    credito: Number(c.credito_microeuro) || 0,
    tetto,
    spesoMese,
    meseCambiato: c.mese !== mese,
  }
}

// I prezzi di un modello. Uno che il listino non conosce (un fallback
// nuovo scelto da Anthropic) si paga al prezzo più alto del listino:
// meglio un millesimo in più al locale che un buco nei nostri conti.
function prezziDi(modello) {
  const tab = AI.prezzi_usd_per_milione
  if (tab[modello]) return tab[modello]
  return Object.values(tab).reduce((max, p) => (p.output > max.output ? p : max))
}

// Il costo in micro-euro di una risposta del modello. Con i fallback la
// verità sta in `usage.iterations`, un tentativo per riga, ciascuno al
// prezzo del modello che l'ha eseguito; senza, basta la usage in cima.
// Si contano tutti i tentativi riportati, anche quelli rifiutati prima di
// scrivere: se Anthropic non li fattura il locale paga qualche token in
// più, mai in meno di quello che paghiamo noi.
function costoMicroeuro(risposta, { modelloChiesto = AI.modello } = {}) {
  const usage = risposta?.usage || {}
  const tentativi = Array.isArray(usage.iterations) && usage.iterations.length
    ? usage.iterations.map((t) => ({
        ...t,
        model: t.model || (t.type === 'fallback_message' ? risposta.model : modelloChiesto),
      }))
    : [{ ...usage, model: risposta?.model || modelloChiesto }]
  let usd = 0
  for (const t of tentativi) {
    const p = prezziDi(t.model)
    const lettura = p.cache_lettura ?? p.input * 0.1
    usd +=
      ((Number(t.input_tokens) || 0) * p.input +
        (Number(t.cache_creation_input_tokens) || 0) * p.input * 1.25 +
        (Number(t.cache_read_input_tokens) || 0) * lettura +
        (Number(t.output_tokens) || 0) * p.output) /
      1_000_000
  }
  // Per eccesso: un micro-euro arrotondato in giù a ogni chiamata, su
  // migliaia di chiamate, è un ammanco vero.
  return Math.ceil(usd * AI.cambio_eur_per_usd * AI.ricarico * MICRO)
}

// ── le richieste che le installazioni possono fare ──
// Due sole, quelle dei requisiti dell'app (tana-drink): la descrizione di
// un prodotto per il menù (REQ-AI-002) e la lettura di una fattura
// d'acquisto (REQ-AI-001). Niente testo libero: una chiave rubata a
// un'installazione non diventa un accesso generico al modello.

const MEDIA_IMMAGINE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MEDIA_PDF = 'application/pdf'
// In byte del file vero (il base64 è un terzo più grande): stanno sotto i
// limiti dell'API e dei 32 MB di una richiesta HTTP a una Function.
const MAX_IMMAGINE = 5 * 1024 * 1024
const MAX_PDF = 20 * 1024 * 1024

class RichiestaNonValida extends Error {}

const testo = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

const nullabile = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] })

const SCHEMA_DESCRIZIONE = {
  type: 'object',
  properties: {
    descrizione: { type: 'string' },
    da_verificare: { type: 'array', items: { type: 'string' } },
  },
  required: ['descrizione', 'da_verificare'],
  additionalProperties: false,
}

const SCHEMA_FATTURA = {
  type: 'object',
  properties: {
    fornitore: {
      type: 'object',
      properties: { ragione_sociale: nullabile('string'), partita_iva: nullabile('string') },
      required: ['ragione_sociale', 'partita_iva'],
      additionalProperties: false,
    },
    numero: nullabile('string'),
    data: nullabile('string'),
    righe: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descrizione: { type: 'string' },
          codice: nullabile('string'),
          quantita: nullabile('number'),
          unita: nullabile('string'),
          prezzo_unitario: nullabile('number'),
          sconto_percentuale: nullabile('number'),
          aliquota_iva: nullabile('number'),
          importo: nullabile('number'),
        },
        required: ['descrizione', 'codice', 'quantita', 'unita', 'prezzo_unitario', 'sconto_percentuale', 'aliquota_iva', 'importo'],
        additionalProperties: false,
      },
    },
    imponibile: nullabile('number'),
    iva: nullabile('number'),
    totale: nullabile('number'),
    da_verificare: { type: 'array', items: { type: 'string' } },
  },
  required: ['fornitore', 'numero', 'data', 'righe', 'imponibile', 'iva', 'totale', 'da_verificare'],
  additionalProperties: false,
}

// Le istruzioni sono fisse e stanno nel sistema: i dati dell'installazione
// arrivano solo come contenuto dell'utente, così il nome di un prodotto
// non può riscrivere le regole.
const SISTEMA_DESCRIZIONE =
  'Scrivi la descrizione di un prodotto per il menù di un bar italiano, in italiano, ' +
  'in una o due frasi (al massimo 300 caratteri), con un tono sobrio e senza superlativi. ' +
  'Usa solo quello che sai con sicurezza del prodotto indicato: provenienza, stile, note di degustazione. ' +
  'Se un dettaglio è incerto non scriverlo nella descrizione e mettilo in da_verificare. ' +
  'Se non riconosci il prodotto, scrivi una descrizione generica della sua categoria e dillo in da_verificare. ' +
  'La descrizione è una proposta che il locale rilegge prima di pubblicarla.'

const SISTEMA_FATTURA =
  "Leggi la fattura d'acquisto di un bar italiano e riportane i dati così come sono scritti nel documento. " +
  'Numeri con il punto decimale, importi in euro senza simbolo, date nel formato AAAA-MM-GG, ' +
  'aliquota IVA come percentuale (22, 10, 4). Un dato assente o illeggibile è null, mai inventato. ' +
  'Ogni riga di merce o servizio è una voce di righe; le righe di soli totali no. ' +
  'In da_verificare elenca i punti dubbi: cifre poco leggibili, totali che non tornano con le righe. ' +
  'I dati verranno rivisti da una persona prima di essere registrati.'

// Il messaggio per il modello, dal corpo che manda l'installazione.
// { tipo: 'descrizione', nome, produttore?, categoria?, note? }
// { tipo: 'fattura', file: <base64>, media_type }
function preparaMessaggio(corpo) {
  const tipo = corpo?.tipo
  if (tipo === 'descrizione') {
    const nome = testo(corpo.nome, 120)
    if (nome.length < 2) throw new RichiestaNonValida('Manca il nome del prodotto.')
    const righe = [
      `Prodotto: ${nome}`,
      corpo.produttore && `Produttore: ${testo(corpo.produttore, 120)}`,
      corpo.categoria && `Categoria: ${testo(corpo.categoria, 60)}`,
      corpo.note && `Note del locale: ${testo(corpo.note, 300)}`,
    ].filter(Boolean)
    return {
      tipo,
      // Una descrizione è un compito breve: lo sforzo basso basta e costa
      // meno. Il tetto dei token tiene in conto il ragionamento, che su
      // questo modello non si spegne.
      max_tokens: 4000,
      effort: 'low',
      system: SISTEMA_DESCRIZIONE,
      content: [{ type: 'text', text: righe.join('\n') }],
      schema: SCHEMA_DESCRIZIONE,
      stimaInputToken: 1500,
    }
  }
  if (tipo === 'fattura') {
    const media = String(corpo.media_type || '')
    const dati = String(corpo.file || '').replace(/\s/g, '')
    if (!dati || !/^[A-Za-z0-9+/]+=*$/.test(dati)) throw new RichiestaNonValida('Il file della fattura manca o non è in base64.')
    const byte = Math.floor((dati.length * 3) / 4)
    let blocco
    if (media === MEDIA_PDF) {
      if (byte > MAX_PDF) throw new RichiestaNonValida('Il PDF supera i 20 MB.')
      blocco = { type: 'document', source: { type: 'base64', media_type: MEDIA_PDF, data: dati } }
    } else if (MEDIA_IMMAGINE.includes(media)) {
      if (byte > MAX_IMMAGINE) throw new RichiestaNonValida('La foto supera i 5 MB: riducila prima di mandarla.')
      blocco = { type: 'image', source: { type: 'base64', media_type: media, data: dati } }
    } else {
      throw new RichiestaNonValida('Formato non accettato: serve una foto (JPEG, PNG, WebP, GIF) o un PDF.')
    }
    return {
      tipo,
      max_tokens: 16000,
      effort: 'medium',
      system: SISTEMA_FATTURA,
      // Il documento prima del testo, come chiede l'API.
      content: [blocco, { type: 'text', text: 'Riporta i dati di questa fattura.' }],
      schema: SCHEMA_FATTURA,
      // Stima per eccesso: un PDF di qualche pagina pesa poche migliaia di
      // token, una foto meno di duemila. Serve solo a non partire con un
      // credito che non basterebbe.
      stimaInputToken: 3000 + Math.ceil(byte / 200),
    }
  }
  throw new RichiestaNonValida('Richiesta AI sconosciuta: si accettano «descrizione» e «fattura».')
}

// I parametri della chiamata a Claude. Il fallback «default» rifà sul
// server, con un altro modello scelto da Anthropic, una richiesta che i
// filtri di sicurezza rifiutassero per errore (il nome di un amaro o un
// PDF possono incappare in un falso positivo); il costo segue il modello
// che ha risposto (costoMicroeuro).
function parametriClaude(m, { modello = AI.modello } = {}) {
  return {
    model: modello,
    max_tokens: m.max_tokens,
    system: m.system,
    messages: [{ role: 'user', content: m.content }],
    output_config: { effort: m.effort, format: { type: 'json_schema', schema: m.schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }
}

// Quanto può costare al massimo: i token d'ingresso stimati più tutti
// quelli d'uscita che il tetto permette, al prezzo del modello chiesto.
function stimaMassimaMicroeuro(m, { modello = AI.modello } = {}) {
  return costoMicroeuro(
    { model: modello, usage: { input_tokens: m.stimaInputToken, output_tokens: m.max_tokens } },
    { modelloChiesto: modello }
  )
}

// Si può partire? Il cassetto deve essere acceso, il credito deve bastare
// per il caso peggiore e il mese non deve sforare il tetto. Le chiamate
// contemporanee della stessa installazione possono sforare di poco
// (ciascuna ha visto lo stesso credito): con un bar, sono una o due.
function puoChiedere(cassetto, stima, adesso = new Date()) {
  const s = statoCassetto(cassetto, adesso)
  if (!cassetto) return { ok: false, codice: 'senza-cassetto', perche: 'Il credito AI di questa installazione non è attivo.' }
  if (!s.attivo) return { ok: false, codice: 'spento', perche: 'Le funzioni AI di questa installazione sono spente.' }
  if (s.credito < stima) return { ok: false, codice: 'credito', perche: 'Credito AI esaurito: si ricarica dal sito.' }
  if (s.spesoMese + stima > s.tetto) return { ok: false, codice: 'tetto', perche: 'Raggiunto il tetto mensile del credito AI.' }
  return { ok: true, codice: null, perche: null }
}

// La patch del cassetto dopo una chiamata: credito giù, speso del mese su
// (da zero se il mese è cambiato). Gli incrementi li fa index.js in una
// transazione, qui si decide cosa scrivere.
function addebito(cassetto, costo, adesso = new Date()) {
  const s = statoCassetto(cassetto, adesso)
  return {
    credito_microeuro: s.credito - costo,
    speso_mese_microeuro: s.spesoMese + costo,
    mese: s.mese,
    ultimo_uso_il: adesso.toISOString(),
  }
}

// Cosa torna all'installazione. Un rifiuto o una risposta troncata non è
// un risultato da mostrare: si dice cosa è successo, e il costo di quello
// che il modello ha comunque consumato resta addebitato.
function leggiRisposta(risposta) {
  if (risposta?.stop_reason === 'refusal') {
    return { ok: false, codice: 'rifiuto', perche: 'Il modello non ha risposto a questa richiesta. Riprova con dati diversi.' }
  }
  if (risposta?.stop_reason === 'max_tokens') {
    return { ok: false, codice: 'troncata', perche: 'La risposta era troppo lunga e si è interrotta. Prova con un documento più corto.' }
  }
  const blocco = (risposta?.content || []).find((b) => b.type === 'text')
  if (!blocco) return { ok: false, codice: 'vuota', perche: 'Il modello non ha restituito niente.' }
  try {
    return { ok: true, risultato: JSON.parse(blocco.text) }
  } catch {
    return { ok: false, codice: 'illeggibile', perche: 'La risposta del modello non era leggibile.' }
  }
}

// La riga dello storico dei consumi: solo numeri e il tipo, mai il
// contenuto (la regia non tiene i dati dei locali, nemmeno una fattura).
function rigaConsumo({ tipo, risposta, costo, esito, adesso = new Date() }) {
  const u = risposta?.usage || {}
  return {
    il: adesso.toISOString(),
    mese: meseDi(adesso),
    tipo,
    modello: risposta?.model || null,
    token_input: (Number(u.input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0),
    token_output: Number(u.output_tokens) || 0,
    fallback: (u.iterations || []).some((t) => t.type === 'fallback_message'),
    costo_microeuro: costo,
    esito,
  }
}

// ── la chiave di un'installazione ──
// Il segreto lo genera la regia e lo vede una volta sola l'admin, che lo
// mette tra i segreti dell'installazione; qui resta solo l'impronta. Il
// bearer è «<slug>.<segreto>», così la Function sa quale cassetto aprire
// senza cercare.
function nuovaChiave(slug) {
  if (!SLUG.test(slug || '')) throw new Error('Slug non valido')
  const segreto = crypto.randomBytes(32).toString('base64url')
  return { bearer: `${slug}.${segreto}`, impronta: impronta(segreto) }
}

const impronta = (segreto) => crypto.createHash('sha256').update(String(segreto)).digest('hex')

function leggiBearer(header) {
  const m = /^Bearer ([a-z][a-z0-9-]{4,28}[a-z0-9])\.([A-Za-z0-9_-]{20,})$/.exec(String(header || ''))
  return m ? { slug: m[1], segreto: m[2] } : null
}

function chiaveGiusta(segreto, improntaSalvata) {
  if (!segreto || !improntaSalvata) return false
  const a = Buffer.from(impronta(segreto), 'hex')
  const b = Buffer.from(String(improntaSalvata), 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ── la ricarica con Stripe ──
// A PACCHETTI, per ora: un pagamento singolo di un importo fisso, che il
// webhook trasforma in credito. È l'ipotesi presa il 24/10/2026 in attesa
// della decisione dell'utente («pacchetti o consumo: da decidere»): il
// credito prepagato è quello che la voce REQ-AI-003 chiama «cassetto», e
// un addebito a consumo si aggiunge dopo senza toccare il resto.
function pacchetto(id) {
  return AI.pacchetti.find((p) => p.id === id) || null
}

// L'importo del pacchetto è IVA esclusa, come il resto del listino, e
// l'IVA la aggiunge Stripe con la stessa aliquota dell'abbonamento
// (REQ-FLOTTA-035). Il credito resta l'imponibile: ricaricaDaSessione
// legge `amount_subtotal`, che è prima delle tasse, quindi chi paga 12,20 €
// per un pacchetto da 10 € ha 10 € di credito.
function rigaRicarica(p, { aliquotaIva = null } = {}) {
  return {
    quantity: 1,
    price_data: { currency: 'eur', unit_amount: Math.round(p.importo * 100), product_data: { name: `Credito AI ${p.importo} €` }, tax_behavior: 'exclusive' },
    ...(aliquotaIva ? { tax_rates: [aliquotaIva] } : {}),
  }
}

const metadatiRicarica = ({ uid, slug, p }) => ({ tipo: 'ricarica_ai', uid, slug, pacchetto: p.id, importo_cent: String(Math.round(p.importo * 100)) })

// Dalla sessione di Checkout pagata al credito: null se non è una
// ricarica, o se non è pagata. L'importo è quello incassato da Stripe,
// non quello dei metadati: i metadati dicono di chi è, Stripe quanto.
function ricaricaDaSessione(sessione) {
  const md = sessione?.metadata || {}
  if (md.tipo !== 'ricarica_ai') return null
  if (sessione.payment_status !== 'paid') return null
  if (!SLUG.test(md.slug || '') || !md.uid || !sessione.id) return null
  const cent = Number(sessione.amount_subtotal ?? sessione.amount_total)
  if (!Number.isFinite(cent) || cent <= 0) return null
  return { slug: md.slug, uid: md.uid, sessione: sessione.id, pacchetto: md.pacchetto || null, importo_microeuro: cent * 10_000 }
}

// Il cassetto di un'installazione appena nata, o della Tana.
function nuovoCassetto({ slug, uid, interna = false, adesso = new Date() }) {
  return {
    slug,
    uid: uid || null,
    attivo: true,
    interna: Boolean(interna),
    credito_microeuro: 0,
    tetto_mensile_microeuro: daEuro(AI.tetto_mensile_predefinito),
    mese: meseDi(adesso),
    speso_mese_microeuro: 0,
    creato_il: adesso.toISOString(),
  }
}

module.exports = {
  MICRO,
  daEuro,
  inEuro,
  meseDi,
  statoCassetto,
  prezziDi,
  costoMicroeuro,
  RichiestaNonValida,
  preparaMessaggio,
  parametriClaude,
  stimaMassimaMicroeuro,
  puoChiedere,
  addebito,
  leggiRisposta,
  rigaConsumo,
  nuovaChiave,
  leggiBearer,
  chiaveGiusta,
  pacchetto,
  rigaRicarica,
  metadatiRicarica,
  ricaricaDaSessione,
  nuovoCassetto,
}
