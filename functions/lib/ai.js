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

const listino = require('../piani.json')
const temi = require('./temi.js')
const stili = require('./stili.js')

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

// ── IL MODELLO PER TIPO DI RICHIESTA (REQ-FLOTTA-092) ──
// Daniele, 13/11/2026, su Sonnet: «Per tutto». Ogni tipo di richiesta ha
// il suo modello, lo sceglie l'admin dal backoffice e sta in
// impostazioni/regia.ai_modelli; senza scelta vale il predefinito del
// listino (piani.json → ai.modello). Si sceglie solo fra i modelli che
// hanno un prezzo nel listino: una richiesta che non si sa prezzare non
// parte. «chat» c'è già fra i tipi anche se la regia non la serve ancora:
// la scelta si prepara prima che arrivi.
const TIPI_MODELLO = ['descrizione', 'fattura', 'tema', 'chat']
const modelliDelListino = () => Object.keys(AI.prezzi_usd_per_milione)
const nelListino = (modello) => typeof modello === 'string' && Object.hasOwn(AI.prezzi_usd_per_milione, modello)
const mappa = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

// Il modello di un tipo, dalle impostazioni della regia. Il documento lo
// può scrivere l'admin anche senza la Function (le regole glielo
// permettono), e un modello può uscire dal listino dopo essere stato
// scelto: per questo il valore si ricontrolla qui, a ogni richiesta.
function modelloPer(tipo, impostazioni) {
  const scelti = impostazioni?.ai_modelli
  const scelto = mappa(scelti) && Object.hasOwn(scelti, tipo) ? scelti[tipo] : null
  return nelListino(scelto) ? scelto : AI.modello
}

// La scelta che arriva dal backoffice (gestisciModelliAI): una mappa non
// vuota { tipo: modello }, tipi conosciuti e modelli del listino. Rende
// solo quello che è arrivato: la Function lo scrive con merge.
function validaModelliAI(dati) {
  if (!mappa(dati) || !Object.keys(dati).length) throw new RichiestaNonValida('Indica almeno un tipo di richiesta e il suo modello.')
  const scelta = {}
  for (const [tipo, modello] of Object.entries(dati)) {
    if (!TIPI_MODELLO.includes(tipo)) throw new RichiestaNonValida(`Tipo di richiesta sconosciuto: «${tipo}».`)
    if (!nelListino(modello)) throw new RichiestaNonValida(`Il modello «${String(modello)}» non ha un prezzo nel listino.`)
    scelta[tipo] = modello
  }
  return scelta
}

// Il costo in micro-euro di una risposta del modello. Con i fallback la
// verità sta in `usage.iterations`, un tentativo per riga, ciascuno al
// prezzo del modello che l'ha eseguito; senza, basta la usage in cima.
// Si contano tutti i tentativi riportati, anche quelli rifiutati prima di
// scrivere: se Anthropic non li fattura il locale paga qualche token in
// più, mai in meno di quello che paghiamo noi.
// La scrittura in cache costa 1,25 volte l'ingresso (durata di 5 minuti,
// la predefinita; quella di un'ora costerebbe il doppio, e la regia non la
// chiede). La stessa cifra nel costo e nella stima della chat.
const SCRITTURA_CACHE = 1.25

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
        (Number(t.cache_creation_input_tokens) || 0) * p.input * SCRITTURA_CACHE +
        (Number(t.cache_read_input_tokens) || 0) * lettura +
        (Number(t.output_tokens) || 0) * p.output) /
      1_000_000
  }
  // Per eccesso: un micro-euro arrotondato in giù a ogni chiamata, su
  // migliaia di chiamate, è un ammanco vero.
  return Math.ceil(usd * AI.cambio_eur_per_usd * AI.ricarico * MICRO)
}

// ── le richieste che si possono fare ──
// Dalle installazioni due sole, quelle dei requisiti dell'app (tana-drink):
// la descrizione di un prodotto per il menù (REQ-AI-002) e la lettura di
// una fattura d'acquisto (REQ-AI-001). Niente testo libero: una chiave
// rubata a un'installazione non diventa un accesso generico al modello.
// La terza, «tema» (REQ-FLOTTA-040: il tema dal mockup di Canva), la chiede
// il titolare dal sito della regia, con lo stesso credito.
const TIPI_INSTALLAZIONE = ['descrizione', 'fattura']

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

// IL TEMA DAL MOCKUP (REQ-FLOTTA-040): lo schema chiude ogni scelta sui
// valori che l'app sa disegnare (le basi e gli stili di lib/temi.js, i
// caratteri e il vocabolario della ricetta di lib/stili.js), così il
// modello non inventa un carattere o uno sfondo che non esistono. La
// struttura del menù non c'è: l'ha scelta il titolare, e la mette la regia.
// I colori propri della ricetta nemmeno: i colori sono quelli del tema.
const unoFra = (valori) => ({ type: 'string', enum: valori })
const SCHEMA_TEMA = {
  type: 'object',
  properties: {
    nome: { type: 'string' },
    descrizione: { type: 'string' },
    tavolozza: {
      type: 'object',
      properties: {
        base: unoFra(temi.BASI),
        colori: {
          type: 'object',
          properties: Object.fromEntries(temi.CHIAVI_COLORE.map((k) => [k, { type: 'string' }])),
          required: temi.CHIAVI_COLORE,
          additionalProperties: false,
        },
      },
      required: ['base', 'colori'],
      additionalProperties: false,
    },
    stile_vicino: unoFra(temi.STILI),
    ricetta: {
      type: 'object',
      properties: {
        caratteri: {
          type: 'object',
          properties: { titolo: unoFra(stili.CARATTERI), voce: unoFra(stili.CARATTERI), testo: unoFra(stili.CARATTERI) },
          required: ['titolo', 'voce', 'testo'],
          additionalProperties: false,
        },
        titoli: {
          type: 'object',
          properties: {
            maiuscolo: { type: 'boolean' },
            corsivo: { type: 'boolean' },
            allineamento: unoFra(stili.VALORI['titoli.allineamento']),
            dimensione: unoFra(stili.VALORI['titoli.dimensione']),
            spaziatura: unoFra(stili.VALORI['titoli.spaziatura']),
          },
          required: ['maiuscolo', 'corsivo', 'allineamento', 'dimensione', 'spaziatura'],
          additionalProperties: false,
        },
        intestazione: unoFra(stili.VALORI.intestazione),
        voce: {
          type: 'object',
          properties: {
            forma: unoFra(stili.VALORI['voce.forma']),
            prezzo: unoFra(stili.VALORI['voce.prezzo']),
            separatore: unoFra(stili.VALORI['voce.separatore']),
            immagine: unoFra(stili.VALORI['voce.immagine']),
          },
          required: ['forma', 'prezzo', 'separatore', 'immagine'],
          additionalProperties: false,
        },
        cornice: unoFra(stili.VALORI.cornice),
        angoli: unoFra(stili.VALORI.angoli),
        sfondo: unoFra(stili.VALORI.sfondo),
      },
      required: ['caratteri', 'titoli', 'intestazione', 'voce', 'cornice', 'angoli', 'sfondo'],
      additionalProperties: false,
    },
    da_verificare: { type: 'array', items: { type: 'string' } },
  },
  required: ['nome', 'descrizione', 'tavolozza', 'stile_vicino', 'ricetta', 'da_verificare'],
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

const SISTEMA_TEMA =
  'Guarda il mockup del menù di un bar (fatto con Canva o uno strumento simile) e descrivilo come il tema di un’app di menù, ' +
  'scegliendo solo fra i valori ammessi. ' +
  'I sette colori sono esadecimali #rrggbb letti dal mockup: sfondo, sfondo secondario, card (il riquadro di una voce), ' +
  'accento (prezzi e titoli), accento secondario (i tasti), testo, testo attenuato; la base è quella più vicina. ' +
  'Il testo deve leggersi: contrasto WCAG di almeno 4,5 fra testo e sfondo e fra testo e card, almeno 3 fra testo attenuato e sfondo ' +
  'e fra accento e sfondo; se i colori del mockup non bastano, scuriscili o schiariscili quanto serve e dillo in da_verificare. ' +
  'Lo stile vicino è quello dell’app che somiglia di più all’impaginazione del mockup. ' +
  'Nella ricetta scegli i tre caratteri per somiglianza (serif, bastone, corsivo, display), e poi titoli, intestazione, ' +
  'forma delle voci, posizione del prezzo, separatori, immagini, cornice, angoli e sfondo come li mostra il mockup. ' +
  'Nome breve (fino a 40 caratteri) e descrizione sobria (fino a 240), in italiano, senza superlativi e senza nomi di marchi. ' +
  'In da_verificare elenca quello che l’app non può riprodurre (animazioni, immagini, un carattere che non c’è) e ogni scelta incerta. ' +
  'Il tema è una proposta che il locale rilegge prima di usarla.'

// Il file di una richiesta (una foto o un PDF in base64, dentro i limiti)
// → il blocco per il modello e i byte veri.
function bloccoFile(corpo, { cosa = 'Il file' } = {}) {
  const media = String(corpo.media_type || '')
  const dati = String(corpo.file || '').replace(/\s/g, '')
  if (!dati || !/^[A-Za-z0-9+/]+=*$/.test(dati)) throw new RichiestaNonValida(`${cosa} manca o non è in base64.`)
  const byte = Math.floor((dati.length * 3) / 4)
  if (media === MEDIA_PDF) {
    if (byte > MAX_PDF) throw new RichiestaNonValida('Il PDF supera i 20 MB.')
    return { blocco: { type: 'document', source: { type: 'base64', media_type: MEDIA_PDF, data: dati } }, byte }
  }
  if (MEDIA_IMMAGINE.includes(media)) {
    if (byte > MAX_IMMAGINE) throw new RichiestaNonValida('La foto supera i 5 MB: riducila prima di mandarla.')
    return { blocco: { type: 'image', source: { type: 'base64', media_type: media, data: dati } }, byte }
  }
  throw new RichiestaNonValida('Formato non accettato: serve una foto (JPEG, PNG, WebP, GIF) o un PDF.')
}

const STRUTTURE_DETTE = { unica: 'tutto in una pagina', 'per-categoria': 'una pagina per categoria', 'per-macro-categoria': 'una pagina per macro categoria' }

// Il messaggio per il modello, dal corpo che manda l'installazione.
// { tipo: 'descrizione', nome, produttore?, categoria?, note? }
// { tipo: 'fattura', file: <base64>, media_type }
// { tipo: 'tema', file: <base64>, media_type, struttura, note? } (dal sito)
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
    const { blocco, byte } = bloccoFile(corpo, { cosa: 'Il file della fattura' })
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
  if (tipo === 'tema') {
    const { blocco, byte } = bloccoFile(corpo, { cosa: 'Il mockup' })
    if (!stili.IMPAGINAZIONI.includes(corpo.struttura)) throw new RichiestaNonValida('Scegli la struttura del menù: una pagina sola, una per categoria o una per macro categoria.')
    const righe = [`Ricava il tema da questo mockup. Struttura del menù scelta dal locale: ${STRUTTURE_DETTE[corpo.struttura]}.`]
    if (corpo.note) righe.push(`Note del locale: ${testo(corpo.note, 300)}`)
    return {
      tipo,
      struttura: corpo.struttura,
      // Un tema è un giudizio su un'immagine: lo sforzo medio, come la
      // fattura; la risposta è corta (una ricetta), il ragionamento no.
      max_tokens: 8000,
      effort: 'medium',
      system: SISTEMA_TEMA,
      content: [blocco, { type: 'text', text: righe.join('\n') }],
      schema: SCHEMA_TEMA,
      stimaInputToken: 3000 + Math.ceil(byte / 200),
    }
  }
  throw new RichiestaNonValida('Richiesta AI sconosciuta: si accettano «descrizione», «fattura» e «tema».')
}

// I parametri della chiamata a Claude. Il fallback «default» rifà sul
// server, con un altro modello scelto da Anthropic, una richiesta che i
// filtri di sicurezza rifiutassero per errore (il nome di un amaro o un
// PDF possono incappare in un falso positivo); il costo segue il modello
// che ha risposto (costoMicroeuro).
function parametriClaude(m, { modello = AI.modello } = {}) {
  // LA CACHE DELLA CHAT (REQ-FLOTTA-094): il segno sulle istruzioni (che
  // coprono anche gli strumenti, che vengono prima) e quello in cima alla
  // richiesta, che Anthropic mette sull'ultimo blocco della conversazione.
  const cache = m.parametri ? { system: m.parametri.system, ...(m.parametri.cache_control ? { cache_control: m.parametri.cache_control } : {}) } : {}
  return {
    ...parametriConteggio(m, { modello }),
    ...cache,
    max_tokens: m.max_tokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  }
}

// Quello che si conta prima di prenotare (REQ-FLOTTA-093): lo stesso
// modello, le stesse istruzioni, lo stesso messaggio e lo stesso formato
// della richiesta che parte (lo schema della risposta pesa sull'ingresso),
// senza i parametri del ripiego, che il conteggio non conosce.
// LA CHAT (REQ-FLOTTA-094) porta i suoi parametri già fatti (lib/ai-chat.js:
// istruzioni, conversazione, strumenti): qui si mette solo il modello, lo
// stesso per il conteggio e per la chiamata.
const senzaCache = (b) => {
  const copia = { ...b }
  delete copia.cache_control
  return copia
}
function parametriConteggio(m, { modello = AI.modello } = {}) {
  if (m.parametri) {
    const { system, messages, tools, tool_choice } = m.parametri
    // I segni della cache non cambiano i token: al conteggio non servono.
    const sistema = Array.isArray(system) ? system.map(senzaCache) : system
    return { model: modello, system: sistema, messages, ...(tools?.length ? { tools, tool_choice } : {}) }
  }
  return {
    model: modello,
    system: m.system,
    messages: [{ role: 'user', content: m.content }],
    output_config: { effort: m.effort, format: { type: 'json_schema', schema: m.schema } },
  }
}

// ── QUANTO PUÒ COSTARE AL MASSIMO (REQ-FLOTTA-088, REQ-FLOTTA-093) ──
// Daniele, 13/11/2026, sul credito sotto zero: «Non deve mai succedere».
// La stima mette da parte DUE TENTATIVI COMPLETI: il ripiego `fallbacks:
// 'default'` rifà la richiesta con un altro modello dopo un rifiuto, e un
// rifiuto a metà risposta si paga (ingresso e uscita già scritta), mentre
// il ripiego riceve il testo già scritto come contesto. Quindi:
//   uscita   = 2 × max_tokens
//   ingresso = I (primo tentativo) + I + max_tokens (il secondo)
// con I = i token d'ingresso contati (countTokens) più il 5%, perché il
// conteggio «è una stima, può differire di poco». Senza conteggio, I è la
// stima per byte della richiesta.
// Ogni voce al prezzo PIÙ ALTO del listino, preso voce per voce: il
// ripiego può rispondere con un modello più caro di quello chiesto, e un
// modello che il listino non conosce si paga a uno del listino (prezziDi).
// Col massimo voce per voce la stima copre ogni coppia di modelli anche se
// un giorno il più caro in ingresso non fosse il più caro in uscita.
const MARGINE_CONTEGGIO = 0.05
const TENTATIVI_MASSIMI = 2
const contoValido = (n) => Number.isSafeInteger(n) && n > 0
// Il tempo massimo del conteggio (revisione della PR #234): coi valori
// predefiniti dell'SDK (10 minuti, 2 nuovi tentativi anche sui 429) un
// conteggio lento consumava il tempo della Function (TIMEOUT_AI_SECONDI)
// prima della chiamata al modello, e la prenotazione scadeva alla stima.
// Dopo 10 secondi il conteggio vale come fallito.
const TEMPO_CONTEGGIO_MS = 10_000
// Il conteggio, entro il tempo massimo: anche uno iniettato, o un SDK che
// non rispettasse le sue opzioni, non tiene ferma la richiesta.
async function contaEntroIlTempo(conta) {
  let timer
  const scaduto = new Promise((_, no) => {
    timer = setTimeout(() => no(new Error(`il conteggio non ha risposto in ${TEMPO_CONTEGGIO_MS / 1000} secondi`)), TEMPO_CONTEGGIO_MS)
  })
  try {
    return await Promise.race([Promise.resolve().then(conta), scaduto])
  } finally {
    clearTimeout(timer)
  }
}

// CON LA CACHE IN SCRITTURA (REQ-FLOTTA-094, la chat): ogni token
// d'ingresso di ciascun tentativo può finire scritto in cache, a
// SCRITTURA_CACHE volte il suo prezzo. L'opzione la chiede solo chi usa la
// cache; le altre richieste restano come erano.
function stimaMassimaMicroeuro(m, { inputContati, scritturaCache = false } = {}) {
  const base = contoValido(inputContati) ? Math.ceil(inputContati * (1 + MARGINE_CONTEGGIO)) : m.stimaInputToken
  const prezzi = Object.values(AI.prezzi_usd_per_milione)
  const pin = Math.max(...prezzi.map((p) => p.input))
  const pout = Math.max(...prezzi.map((p) => p.output))
  const ingresso = base + (base + m.max_tokens)
  const uscita = TENTATIVI_MASSIMI * m.max_tokens
  const usd = (ingresso * pin * (scritturaCache ? SCRITTURA_CACHE : 1) + uscita * pout) / 1_000_000
  // Più UN micro-euro (revisione della PR #234, 13/11/2026): la stima
  // moltiplica i totali, costoMicroeuro somma i tentativi uno per uno, e
  // in virgola mobile i due conti possono cadere da parti diverse del
  // Math.ceil (24 casi su 72.369: costo 971.356 µ€ contro una stima di
  // 971.355). L'errore di arrotondamento è molto sotto il micro-euro, e un
  // micro-euro intero dopo il ceil lo copre sempre.
  return Math.ceil(usd * AI.cambio_eur_per_usd * AI.ricarico * MICRO) + 1
}

// Una richiesta con un file (una fattura, un mockup): senza conteggio la
// sua stima per byte non è sicura (un PDF scansionato pesa pochi byte e
// molti token), e non parte.
const conFile = (m) => (m.content || []).some((b) => b?.type !== 'text')
// La chat (REQ-FLOTTA-094) senza conteggio non parte: deve sapere se la
// conversazione sta nel limite dell'admin (Daniele, 13/11/2026: «per tutti
// i 10 i punti facciamo come dici»).
const contoObbligatorio = (m) => m.conteggio_obbligatorio === true || conFile(m)

// Si può partire? Il cassetto deve essere acceso, il credito deve bastare
// per il caso peggiore e il mese non deve sforare il tetto. Il credito qui
// è già al netto delle richieste in corso: la prenotazione (prenota, sotto)
// lo scala prima della chiamata, così due richieste insieme non spendono lo
// stesso euro.
function puoChiedere(cassetto, stima, adesso = new Date()) {
  const s = statoCassetto(cassetto, adesso)
  if (!cassetto) return { ok: false, codice: 'senza-cassetto', perche: 'Il credito AI di questa installazione non è attivo.' }
  if (!s.attivo) return { ok: false, codice: 'spento', perche: 'Le funzioni AI di questa installazione sono spente.' }
  if (s.credito <= 0 || s.credito < stima) return { ok: false, codice: 'credito', perche: 'Credito AI esaurito: si ricarica dal sito.' }
  if (s.spesoMese + stima > s.tetto) return { ok: false, codice: 'tetto', perche: 'Raggiunto il tetto mensile del credito AI.' }
  return { ok: true, codice: null, perche: null }
}

// IL CREDITO SENZA IL MODELLO (REQ-FLOTTA-085): il gestionale lo chiede
// per le Impostazioni e per nascondere i tasti AI quando non servono. Una
// lettura del cassetto, niente addebito. `attivo` dice se una richiesta
// potrebbe partire adesso; `motivo` è il codice di puoChiedere quando no.
// La misura è la stima della richiesta più piccola, una descrizione
// (REQ-FLOTTA-088): con un micro-euro l'app mostrava i tasti a un locale
// che poi riceveva 402 a ogni richiesta.
// Senza cassetto o spento: il 402 di sempre, non c'è niente da mostrare.
const stimaDescrizione = () => stimaMassimaMicroeuro(preparaMessaggio({ tipo: 'descrizione', nome: 'Prodotto' }))
// `ricarica` è quello che dice ricaricaDelLocale (sotto); senza, il locale
// non è ricaricabile: meglio rimandare all'assistenza che a un sito dove
// la ricarica poi si rifiuta.
function rispostaCredito(cassetto, adesso = new Date(), ricarica = NON_RICARICABILE) {
  const via = puoChiedere(cassetto, stimaDescrizione(), adesso)
  if (via.codice === 'senza-cassetto' || via.codice === 'spento') return { ok: false, http: 402, codice: via.codice, errore: via.perche }
  const s = statoCassetto(cassetto, adesso)
  return {
    ok: true,
    tipo: 'credito',
    credito_eur: inEuro(s.credito),
    tetto_mensile_eur: inEuro(s.tetto),
    speso_mese_eur: inEuro(s.spesoMese),
    attivo: via.ok,
    motivo: via.codice,
    ricaricabile: ricarica?.ricaricabile === true,
    ricarica_url: ricarica?.ricaricabile === true ? ricarica.ricarica_url : null,
  }
}

// SI PUÒ RICARICARE, E DOVE (REQ-FLOTTA-091). Richiesta di tana-drink del
// 13/11/2026: con `ricaricabile: false` l'app rimanda all'assistenza invece
// che al sito. Le condizioni sono quelle di creaRicaricaAI (index.js), che
// resta la porta vera: pagamenti online accesi, sito aperto, e non un
// locale interno (la Tana la ricarichiamo noi). Senza un indirizzo della
// regia non c'è dove mandare il titolare. L'indirizzo è la sezione
// «Credito AI» dell'area del titolare (src/lib/areaTitolare.js), con la
// sola origine di REGIA_URL, come rinnovo_url (lib/rinnovo.js).
const PERCORSO_RICARICA = '/dashboard/credito-ai'
const NON_RICARICABILE = Object.freeze({ ricaricabile: false, ricarica_url: null })
function ricaricaDelLocale({ istanza, vendita, sitoChiuso, regiaUrl } = {}) {
  if (vendita?.pagamenti_online !== true || sitoChiuso !== false || istanza?.interna === true) return { ...NON_RICARICABILE }
  let origine = null
  try {
    const u = new URL(String(regiaUrl || ''))
    if (u.protocol === 'https:' || u.protocol === 'http:') origine = u.origin
  } catch {
    origine = null
  }
  return origine ? { ricaricabile: true, ricarica_url: `${origine}${PERCORSO_RICARICA}` } : { ...NON_RICARICABILE }
}

// ── IL FREE NON HA L'AI (REQ-FLOTTA-087) ──
// Daniele, 13/11/2026: «I free non hanno l'ai». Il piano vero è quello
// della licenza che l'app riceve (licenza.js, licenzaProtetta): Free se il
// locale è tornato al Free perché non paga (istanza.ripiego_free), se no il
// piano del cliente. Se le due fonti non dicono lo stesso vale la più
// restrittiva, perché concedere l'AI per sbaglio spende credito. Senza
// cliente la licenza non si calcola (scriviLicenza) e l'AI non si concede.
// Si guarda il limite del listino (limiti.ai === false), lo stesso che
// arriva all'app.
// NIENTE `istanza.licenza_piano` (revisione del 13/11/2026, M1): quella
// copia la scrivono solo ripiegaAlFree e licenzaSegueIlPiano, non
// scriviLicenza («Allinea»). Un locale che torna a pagare mentre l'istanza
// non è attiva teneva la copia a 'free' e riceveva 402 piano per sempre,
// senza un tasto dell'admin che la correggesse.
const SENZA_AI_NEL_PIANO = 'Il piano Free non comprende le funzioni AI.'
const pianoSenzaAI = (id) => Boolean(id) && listino.piani[id]?.limiti?.ai === false
function aiConcessa(istanza, cliente) {
  if (!cliente) return false
  const piani = [istanza?.ripiego_free ? 'free' : null, cliente.piano]
  return !piani.some(pianoSenzaAI)
}

// ── LA PRENOTAZIONE DEL CREDITO (REQ-FLOTTA-088) ──
// Audit del 13/11/2026: il credito si controllava fuori transazione e si
// scalava dopo la risposta, quindi N richieste insieme vedevano lo stesso
// credito e passavano tutte. Ora, in una transazione PRIMA della chiamata,
// si prenota la stima massima (credito giù, speso del mese su) e la
// richiesta si segna nel cassetto, in `prenotazioni: { id: { il, stima,
// tipo, mese } }`; dopo la risposta, in un'altra transazione, si corregge
// col costo vero (chiudiPrenotazione). Una mappa e non un contatore: ogni
// prenotazione ha la sua ora, e una rimasta appesa si riconosce.

// Il timeout delle Functions AI: index.js lo usa in OPTS_AI, e una
// prenotazione più vecchia di così (più un minuto di margine per gli
// orologi e la transazione finale) non può più chiudersi da sola.
const TIMEOUT_AI_SECONDI = 300
const SCADENZA_PRENOTAZIONE_MS = (TIMEOUT_AI_SECONDI + 60) * 1000
// Le richieste AI insieme di un locale. Due: al banco una persona chiede
// una descrizione mentre un'altra legge una fattura, e più di così da un
// bar non arriva se non da un errore o da un abuso. Con richiestaAI a 10
// istanze per 3 richieste ciascuna (index.js), un locale solo occupa al
// massimo 2 posti su 30, e gli altri locali lavorano.
const MAX_CONTEMPORANEE = 2
const OCCUPATO = 'Troppe richieste AI insieme: riprova tra poco.'

// L'ora di una prenotazione, o null se non è una data credibile: le
// prenotazioni le scrive solo prenota(), ma una voce rotta (scritta a mano,
// da una versione vecchia, o a metà) non deve bloccare il locale
// (revisione del 13/11/2026, B3). Una data più avanti di un minuto
// rispetto a adesso non l'ha scritta prenota(): conta come rotta, se no
// occuperebbe un posto fra le contemporanee per sempre.
const MARGINE_OROLOGI_MS = 60 * 1000
function oraPrenotazione(p, adesso) {
  const t = typeof p?.il === 'string' ? Date.parse(p.il) : NaN
  return Number.isFinite(t) && t <= adesso.getTime() + MARGINE_OROLOGI_MS ? t : null
}
const MESE_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/

const scaduta = (p, adesso) => {
  const t = oraPrenotazione(p, adesso)
  return t === null || adesso.getTime() - t > SCADENZA_PRENOTAZIONE_MS
}

// Le prenotazioni divise in vive e scadute. Una scaduta è una Function
// morta fra la prenotazione e la correzione: non conta più fra le
// contemporanee, e si considera CONSUMATA alla stima, non restituita,
// perché Anthropic potrebbe averci già fatturato la risposta. Il locale
// paga al massimo la stima, cioè il caso peggiore che gli era stato
// riservato; la riga di consumo lo dice (rigaInterrotta). Una voce senza
// un'ora valida si tratta come scaduta.
function dividiPrenotazioni(cassetto, adesso) {
  const vive = {}
  const scadute = []
  const mappa = cassetto?.prenotazioni
  if (!mappa || typeof mappa !== 'object' || Array.isArray(mappa)) return { vive, scadute }
  for (const [id, p] of Object.entries(mappa)) {
    if (scaduta(p, adesso)) scadute.push({ id, ...(p && typeof p === 'object' ? p : {}) })
    else vive[id] = p
  }
  return { vive, scadute }
}

// Prenota la stima di una richiesta, o dice perché no. → { ok, http,
// codice, perche, credito, patch, scadute }: `patch` è quello da scrivere
// nel cassetto (anche quando si rifiuta, per togliere le scadute: così le
// loro righe «interrotta» si scrivono una volta sola), null se non c'è
// niente da scrivere; `scadute` sono le prenotazioni da chiudere come
// interrotte. Un rifiuto non tocca il credito.
//
// QUANTO PROMETTE (revisione del 13/11/2026, M3; REQ-FLOTTA-093). Due
// richieste insieme non spendono lo stesso credito: ognuna parte solo se
// il credito, già al netto delle altre, copre la sua stima. La stima conta
// i token d'ingresso veri e due tentativi completi (stimaMassimaMicroeuro),
// quindi il costo vero non la supera; se succede lo stesso, è un difetto, e
// chiudiPrenotazione ferma il credito a zero e segna il resto da
// recuperare. Il credito non va mai sotto zero.
// IL TETTO AL CAMBIO DI MESE (B2), una scelta: le richieste prenotate a
// fine mese portano il loro costo vero nel mese nuovo (chiudiPrenotazione),
// che però, alla prenotazione delle sue prime richieste, non le vedeva.
// Il mese nuovo può quindi sforare il tetto del costo vero di al massimo
// MAX_CONTEMPORANEE richieste (la stima, o di più per un PDF che costa più
// della sua stima). Tenerne conto vorrebbe dire contare le prenotazioni del
// mese vecchio nel mese nuovo: pochi centesimi, una volta al mese, non
// valgono la regola in più.
// UNA VOLTA SOLA PER ID (revisione della PR #227, 13/11/2026): Firestore
// ripete la transazione anche quando la conferma del commit si perde
// (DEADLINE_EXCEEDED, UNAVAILABLE), e il nuovo tentativo può trovare la
// prenotazione già scritta dal primo. Allora è già fatta: si risponde ok
// senza scalare di nuovo la stima e senza contarla fra le contemporanee
// (sennò due stime per una chiamata, o un 429 con la stima appesa).
function prenota(cassetto, { id, stima, tipo, adesso = new Date() }) {
  if (!cassetto) {
    const via = puoChiedere(null, stima, adesso)
    return { ok: false, http: 402, codice: via.codice, perche: via.perche, credito: 0, patch: null, scadute: [] }
  }
  const { vive, scadute } = dividiPrenotazioni(cassetto, adesso)
  const pulizia = scadute.length ? { prenotazioni: vive } : null
  if (id != null && Object.hasOwn(vive, id)) {
    return { ok: true, http: 200, codice: null, perche: null, credito: statoCassetto(cassetto, adesso).credito, patch: pulizia, scadute }
  }
  const no = (http, codice, perche) => ({ ok: false, http, codice, perche, credito: Number(cassetto.credito_microeuro) || 0, patch: pulizia, scadute })
  const via = puoChiedere(cassetto, stima, adesso)
  // Il cassetto spento si dice prima di tutto: non è un problema di
  // affollamento. Poi l'affollamento, poi i soldi.
  if (via.codice === 'spento') return no(402, via.codice, via.perche)
  if (Object.keys(vive).length >= MAX_CONTEMPORANEE) return no(429, 'occupato', OCCUPATO)
  if (!via.ok) return no(402, via.codice, via.perche)
  const s = statoCassetto(cassetto, adesso)
  return {
    ok: true,
    http: 200,
    codice: null,
    perche: null,
    credito: s.credito - stima,
    patch: {
      credito_microeuro: s.credito - stima,
      speso_mese_microeuro: s.spesoMese + stima,
      mese: s.mese,
      prenotazioni: { ...vive, [id]: { il: adesso.toISOString(), stima, tipo, mese: s.mese } },
      ultimo_uso_il: adesso.toISOString(),
    },
    scadute,
  }
}

// La correzione dopo la risposta: la differenza fra stima e costo vero
// torna nel credito ed esce dallo speso del mese, e la prenotazione si
// toglie. Costo zero (la chiamata non è partita, 503): torna tutta la
// stima. Se il mese è cambiato fra prenotazione e risposta la stima stava
// nel mese vecchio, che non si tiene più: il mese nuovo porta il costo
// vero. Una prenotazione che non c'è più è già stata chiusa come
// interrotta, alla stima: non si corregge una seconda volta.
// LO SFORAMENTO (REQ-FLOTTA-093, Daniele, 13/11/2026: «per tutti i 10 i
// punti facciamo come dici»): un costo vero sopra la stima non dovrebbe
// esistere (la stima conta due tentativi completi), ed è un difetto. Se il
// credito non basta a coprirlo, il credito si ferma a ZERO e quello che
// manca si somma a `sforato_microeuro`, che l'admin vede nella
// scheda del locale; lo speso del mese e la riga dei consumi tengono il
// costo vero. Lo sforato non si chiede al locale: Daniele, 13/11/2026,
// «gestisco io a mano. In realtà è un costo che ci accolliamo».
function chiudiPrenotazione(cassetto, { id, costo, adesso = new Date() }) {
  const p = cassetto?.prenotazioni?.[id]
  if (!p) return { trovata: false, patch: null }
  const s = statoCassetto(cassetto, adesso)
  const stima = Number(p.stima) || 0
  const resto = Object.fromEntries(Object.entries(cassetto.prenotazioni).filter(([k]) => k !== id))
  const spesoMese = p.mese === s.mese ? s.spesoMese - stima + costo : s.spesoMese + costo
  const credito = s.credito + stima - costo
  const manca = costo > stima && credito < 0 ? -credito : 0
  return {
    trovata: true,
    patch: {
      credito_microeuro: manca ? 0 : credito,
      speso_mese_microeuro: Math.max(0, spesoMese),
      mese: s.mese,
      prenotazioni: resto,
      ultimo_uso_il: adesso.toISOString(),
      ...(manca ? { sforato_microeuro: (Number(cassetto.sforato_microeuro) || 0) + manca } : {}),
    },
  }
}

// La riga dei consumi di una prenotazione scaduta: la stima come costo,
// nel mese in cui era stata prenotata, con l'esito che lo dice. Una voce
// rotta (B3) non lancia: senza un'ora valida va nel mese corrente, e senza
// una stima leggibile costa zero.
function rigaInterrotta(p, adesso = new Date()) {
  const t = oraPrenotazione(p, adesso)
  const mese = typeof p?.mese === 'string' && MESE_VALIDO.test(p.mese) ? p.mese : meseDi(t === null ? adesso : new Date(t))
  return {
    il: adesso.toISOString(),
    mese,
    tipo: typeof p?.tipo === 'string' ? p.tipo : null,
    modello: null,
    token_input: 0,
    token_output: 0,
    fallback: false,
    costo_microeuro: Math.max(0, Number(p?.stima) || 0),
    esito: 'interrotta',
    prenotata_il: t === null ? null : p.il,
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
    // Quanto dell'ingresso è stato letto dalla cache e quanto scritto
    // (REQ-FLOTTA-094): dice se la cache della chat lavora.
    token_cache_lettura: Number(u.cache_read_input_tokens) || 0,
    token_cache_scrittura: Number(u.cache_creation_input_tokens) || 0,
    token_output: Number(u.output_tokens) || 0,
    fallback: Array.isArray(u.iterations) && u.iterations.some((t) => t?.type === 'fallback_message'),
    costo_microeuro: costo,
    esito,
  }
}

// ── UNA RICHIESTA COL CREDITO PRENOTATO, DA CAPO A FONDO (REQ-FLOTTA-088) ──
// L'ordine delle cose per richiestaAI e per il tema dal mockup; index.js
// ci mette Firestore e Anthropic (interrogaClaude), qui si decide. Fuori
// da index.js perché si possa provare con un cassetto e un modello finti.
//   crea()               → { Anthropic, client }: il client del modello.
//   prenota(stima)       → l'esito di prenota(), scritto in transazione.
//   chiudi(costo, riga)  → il credito dopo chiudiPrenotazione(), in
//                          transazione, con la riga dei consumi.
// → { ok: true, risultato, costo_eur, credito_eur }, oppure { ok: false,
// http, errore, codice, ... } con i codici del contratto (402, 422, 429,
// 503): mai un'eccezione, che diventerebbe un 500 muto.
//
// Revisione del 13/11/2026 (B1): prima il client si creava DOPO la
// prenotazione e fuori dal try, e un suo errore lasciava la stima appesa
// (pagata alla scadenza per una chiamata mai fatta). Ora:
// - il client si crea PRIMA di prenotare: se non si crea non si è speso
//   niente, 503;
// - una prenotazione che non si scrive (transazione fallita) è un 503
//   «riprova»; se la transazione aveva scritto e si è persa solo la
//   conferma, la prenotazione si restituisce subito (chiudi a costo zero),
//   così il credito torna com'era;
// - un costo che non si calcola vale la stima, che è il caso peggiore già
//   riservato; una risposta che non si legge è un 422 col suo costo;
// - LA CHIUSURA CHE FALLISCE dopo una risposta del modello: il locale
//   riceve comunque il risultato che ha pagato, e paga UNA volta sola, la
//   stima. Non si riprova a chiudere (runTransaction ha già riprovato), e
//   non si rifà la chiamata: la prenotazione resta, scade e si chiude
//   alla stima, con la riga «interrotta». La risposta dice la stima come
//   costo e il credito com'era dopo la prenotazione, cioè quello che il
//   locale pagherà davvero. Se la transazione era riuscita e solo la
//   risposta di Firestore si è persa, il locale ha pagato il costo vero,
//   meno della stima detta: mai di più.
const NON_DISPONIBILE = 'Il servizio AI non è disponibile in questo momento.'
const RIPROVA = 'Il servizio AI è occupato: riprova tra poco.'
const breve = (e) => e?.message || String(e)

async function interrogaConPrenotazione({ slug, messaggio, modello = modelloPer(messaggio?.tipo, null), crea, conta, prenota: prenotaInTransazione, chiudi, log = console }) {
  let Anthropic
  let client
  try {
    ;({ Anthropic, client } = crea())
  } catch (e) {
    log.error(`[ai] ${slug}: il client del modello non si crea:`, breve(e))
    return { ok: false, http: 503, errore: NON_DISPONIBILE, codice: 'servizio' }
  }

  // IL CONTEGGIO PRIMA DI PRENOTARE (REQ-FLOTTA-093). Gratuito, con un suo
  // limite di richieste al minuto. Se non risponde, una descrizione usa la
  // stima per byte (il suo ingresso è testo corto, ben sotto la stima);
  // una richiesta con un file no: 503, senza prenotare niente.
  // I TEMPI (REQ-FLOTTA-094): quanto aspetta chi chiede, fra conteggio e
  // chiamata. Si misurano sul test con la riga «[ai] TEMPI» dei log: solo
  // numeri, mai il contenuto.
  const inizio = Date.now()
  let inputContati = null
  try {
    const parametri = parametriConteggio(messaggio, { modello })
    const contato = await contaEntroIlTempo(() => (conta ? conta(parametri) : client.messages.countTokens(parametri, { timeout: TEMPO_CONTEGGIO_MS, maxRetries: 0 })))
    inputContati = contato?.input_tokens
    if (!contoValido(inputContati)) throw new Error(`conteggio non valido: ${inputContati}`)
  } catch (e) {
    inputContati = null
    if (contoObbligatorio(messaggio)) {
      log.warn(`[ai] ${slug} ${messaggio.tipo}: il conteggio dei token non risponde, la richiesta non parte:`, breve(e))
      return { ok: false, http: 503, errore: RIPROVA, codice: 'servizio' }
    }
    log.warn(`[ai] ${slug} ${messaggio.tipo}: il conteggio dei token non risponde, si usa la stima per byte:`, breve(e))
  }
  // Un tetto sull'ingresso (la conversazione della chat troppo lunga,
  // REQ-FLOTTA-094): si rifiuta prima di prenotare, senza spendere niente.
  const troppo = inputContati != null && typeof messaggio.rifiutaIngresso === 'function' ? messaggio.rifiutaIngresso(inputContati) : null
  if (troppo) return { ok: false, ...troppo }
  const conteggioMs = Date.now() - inizio
  const stima = stimaMassimaMicroeuro(messaggio, { inputContati, scritturaCache: messaggio.scritturaCache === true })

  let prenotata
  try {
    prenotata = await prenotaInTransazione(stima)
  } catch (e) {
    log.error(`[ai] ${slug}: la prenotazione non si scrive:`, breve(e))
    // La transazione può aver scritto e aver perso solo la conferma: la
    // prenotazione allora c'è, e senza chiamata scadrebbe alla stima. Si
    // restituisce col suo id, a buon rendere; se non c'è non si tocca
    // niente (revisione della PR #227).
    await Promise.resolve()
      .then(() => chiudi(0, null))
      .catch((x) => log.error(`[ai] ${slug}: dopo la prenotazione fallita, la restituzione non si scrive:`, breve(x)))
    return { ok: false, http: 503, errore: RIPROVA, codice: 'servizio' }
  }
  if (prenotata.scadute?.length) log.warn(`[ai] ${slug}: ${prenotata.scadute.length} prenotazioni scadute, chiuse come interrotte`)
  if (!prenotata.ok) return { ok: false, http: prenotata.http, errore: prenotata.perche, codice: prenotata.codice, credito_eur: inEuro(prenotata.credito) }

  let risposta
  const partenza = Date.now()
  try {
    risposta = await client.beta.messages.stream(parametriClaude(messaggio, { modello })).finalMessage()
  } catch (e) {
    // Niente costo: se la chiamata non è arrivata in fondo non c'è una
    // usage da scalare, e la stima torna tutta. Il tipo dell'errore dice
    // di chi è il problema.
    const apiError = Anthropic?.APIError && e instanceof Anthropic.APIError
    const tipo = apiError ? e.type || e.status : 'rete'
    if (tipo === 'billing_error') {
      // IL NOSTRO credito presso Anthropic è finito: va ricaricato dalla
      // Console (o la ricarica automatica non è scattata). Riga cercabile
      // nei log: «[ai] CREDITO ANTHROPIC».
      log.error('[ai] CREDITO ANTHROPIC esaurito o pagamento rifiutato:', breve(e))
    } else {
      log.error(`[ai] ${slug} ${messaggio.tipo}: ${tipo}`, breve(e))
    }
    // Se anche la restituzione fallisce, la prenotazione scade da sé e si
    // consuma alla stima: lo dice il log, per rimborsarla a mano.
    await Promise.resolve()
      .then(() => chiudi(0, null))
      .catch((x) => log.error(`[ai] ${slug}: la prenotazione non è tornata, si consumerà alla stima:`, breve(x)))
    const riprova = [Anthropic?.RateLimitError, Anthropic?.InternalServerError, Anthropic?.APIConnectionError].some((C) => C && e instanceof C)
    return { ok: false, http: 503, errore: riprova ? RIPROVA : NON_DISPONIBILE, codice: 'servizio' }
  }

  // Una riga di log non deve mai fermare la risposta: una usage che non si
  // legge qui la gestiscono i conti di sotto.
  try {
    const u = risposta?.usage || {}
    log.info?.(
      `[ai] TEMPI ${slug} ${messaggio.tipo}: conteggio ${conteggioMs} ms, chiamata ${Date.now() - partenza} ms, ingresso ${inputContati ?? 'non contato'} token, dalla cache ${Number(u.cache_read_input_tokens) || 0}, in cache ${Number(u.cache_creation_input_tokens) || 0}`
    )
  } catch {
    // niente da fare: è solo una misura
  }

  // I conti della risposta, ognuno col suo ripiego: un'eccezione qui
  // lascerebbe la stima appesa e il locale senza risposta.
  let costo
  try {
    costo = costoMicroeuro(risposta, { modelloChiesto: modello })
    if (!Number.isFinite(costo) || costo < 0) throw new Error(`costo non valido: ${costo}`)
  } catch (e) {
    log.error(`[ai] ${slug}: il costo non si calcola, vale la stima:`, breve(e))
    costo = stima
  }
  // Un difetto, non un caso previsto: riga cercabile nei log, «[ai]
  // SFORAMENTO». Il credito si ferma a zero e il resto si segna da
  // recuperare (chiudiPrenotazione).
  if (costo > stima) {
    log.error(`[ai] SFORAMENTO ${slug} ${messaggio.tipo}: costo ${costo} micro-euro sopra la stima di ${stima} (contati ${inputContati ?? 'no'}, modello ${modello})`)
  }
  let letta
  try {
    // La chat legge la sua risposta da sé (un turno firmato, non uno schema).
    letta = (typeof messaggio.leggi === 'function' ? messaggio.leggi : leggiRisposta)(risposta)
  } catch (e) {
    log.error(`[ai] ${slug}: la risposta non si legge:`, breve(e))
    letta = { ok: false, codice: 'illeggibile', perche: 'La risposta del modello non era leggibile.' }
  }
  const esito = letta.ok ? 'ok' : letta.codice
  let riga
  try {
    riga = rigaConsumo({ tipo: messaggio.tipo, risposta, costo, esito })
  } catch {
    riga = rigaConsumo({ tipo: messaggio.tipo, risposta: null, costo, esito })
  }

  let conti
  try {
    const residuo = await chiudi(costo, riga)
    conti = { costo_eur: inEuro(costo), credito_eur: inEuro(residuo) }
  } catch (e) {
    // Riga cercabile nei log: «[ai] CHIUSURA». Il locale paga la stima.
    log.error(`[ai] CHIUSURA ${slug}: la correzione non si scrive, il locale pagherà la stima:`, breve(e))
    conti = { costo_eur: inEuro(stima), credito_eur: inEuro(prenotata.credito) }
  }
  if (!letta.ok) return { ok: false, http: 422, errore: letta.perche, codice: letta.codice, ...conti }
  return { ok: true, risultato: letta.risultato, ...conti }
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

// DA DOVE ARRIVA UNA RICARICA (ai/{slug}/ricariche.origine): «stripe» un
// pagamento dal sito; «manuale» un pagamento ricevuto fuori da Stripe e
// accreditato dall'admin; «omaggio» un regalo del fornitore (l'utente,
// 06/11/2026), senza pagamento. Il titolare le legge tutte, con l'origine.
const ORIGINI_RICARICA = ['stripe', 'manuale', 'omaggio']
// Un omaggio è un regalo, non un listino: fino a 200 €.
const MAX_OMAGGIO = 200

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
  SCRITTURA_CACHE,
  MICRO,
  TIPI_INSTALLAZIONE,
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
  parametriConteggio,
  MARGINE_CONTEGGIO,
  TENTATIVI_MASSIMI,
  TEMPO_CONTEGGIO_MS,
  TIPI_MODELLO,
  modelliDelListino,
  modelloPer,
  validaModelliAI,
  puoChiedere,
  rispostaCredito,
  ricaricaDelLocale,
  SENZA_AI_NEL_PIANO,
  aiConcessa,
  TIMEOUT_AI_SECONDI,
  SCADENZA_PRENOTAZIONE_MS,
  MAX_CONTEMPORANEE,
  prenota,
  chiudiPrenotazione,
  rigaInterrotta,
  interrogaConPrenotazione,
  leggiRisposta,
  rigaConsumo,
  pacchetto,
  rigaRicarica,
  metadatiRicarica,
  ricaricaDaSessione,
  nuovoCassetto,
  ORIGINI_RICARICA,
  MAX_OMAGGIO,
}
