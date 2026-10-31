'use strict'

// ── GLI AGGIORNAMENTI: OBBLIGATORI O A SCELTA, LOGICA PURA (REQ-FLOTTA-020) ─
//
// L'utente, 31/10/2026: due modi di aggiornare un locale. «Uno quello
// attuale» (la regia pubblica, l'app dice «aggiorna» e poi le novità) e uno
// dove il titolare vede prima le novità e sceglie, anche di saltare.
// E «nei vari piani siano garantiti aggiornamenti fino a che si paga. Se non
// si paga, si ritorna alla versione gratis ma senza possibilità di
// aggiornare». Le due regole le accende l'admin della regia; chi ha già un
// piano non cambia niente fino al rinnovo, e riceve un avviso.
//
// Decisioni dello stesso giorno:
// - un rilascio OBBLIGATORIO (sicurezza, compatibilità con la regia) arriva
//   a tutti, anche a chi ha saltato o non paga: come responsabili del
//   trattamento non lasciamo falle note sui siti che ospitiamo;
// - con «solo finché si paga» il Free riceve solo gli obbligatori;
// - il titolare sceglie nell'app e nella dashboard: vale la prima risposta.
//
// Le parole dell'app e il contratto con tana-drink sono in
// docs/handover.md §7 (e in tana-drink, docs/aggiornamenti-dalla-regia.md).

const { eGratuito } = require('./free.js')

const GIORNO = 86400000
// Senza una data di rinnovo (un piano dato a mano, il Free) le condizioni
// nuove valgono dopo questo preavviso.
const GIORNI_PREAVVISO = 30
// Le note di una proposta stanno nel documento dell'istanza e nella licenza
// dell'app: un changelog intero non ci va.
const NOTE_MAX = 20000
const MODALITA = ['obbligatori', 'a_scelta']
const SCELTE = ['aggiorna', 'salta']
const TAG = /^v\d+\.\d+\.\d+$/

// Le regole di oggi: com'era prima di REQ-FLOTTA-020.
const REGOLE_BASE = Object.freeze({ a_scelta: false, solo_finche_paga: false })

// Le regole come le scrive l'admin (impostazioni/aggiornamenti).
const regolePulite = (doc) => ({ a_scelta: doc?.a_scelta === true, solo_finche_paga: doc?.solo_finche_paga === true })
const regoleUguali = (a, b) => a.a_scelta === b.a_scelta && a.solo_finche_paga === b.solo_finche_paga

// Le condizioni in vigore per un'istanza. Quelle con cui è nata (o che ha
// già preso) stanno in `condizioni_aggiornamenti`; quelle che l'admin ha
// cambiato aspettano in `condizioni_prossime` fino alla loro data. Le
// istanze di prima di REQ-FLOTTA-020 non hanno niente: le regole di sempre.
function condizioniIn(ist, adesso = new Date()) {
  const prossime = ist?.condizioni_prossime
  if (prossime && Date.parse(prossime.dal) <= adesso.getTime()) return regolePulite(prossime)
  return ist?.condizioni_aggiornamenti ? regolePulite(ist.condizioni_aggiornamenti) : { ...REGOLE_BASE }
}

// Paga? Il Free non paga per definizione; chi è «in sospeso» o «disdetto»
// nemmeno. Un'istanza tornata al Free per un pagamento mancato (vedi
// `ripiego`) non paga finché l'abbonamento non torna attivo.
function nonPagaPerche(cliente) {
  if (eGratuito(cliente?.piano)) return 'free'
  if (cliente?.abbonamento?.stato !== 'attivo') return 'non_pagato'
  return null
}

// Come si aggiorna questo locale: { modalita, inclusi, motivo }.
// La modalità fissata dall'admin sull'istanza vince sulle regole; la Tana e
// le altre installazioni interne non pagano e li ricevono comunque.
function regolaDi(ist, cliente, adesso = new Date()) {
  const cond = condizioniIn(ist, adesso)
  const modalita = MODALITA.includes(ist?.modalita_aggiornamenti) ? ist.modalita_aggiornamenti : cond.a_scelta ? 'a_scelta' : 'obbligatori'
  if (!cond.solo_finche_paga || ist?.interna === true) return { modalita, inclusi: true, motivo: null }
  const motivo = nonPagaPerche(cliente)
  return { modalita, inclusi: !motivo, motivo }
}

// Cosa fa un rilascio con questo locale: 'lancia' (si pubblica, come oggi),
// 'proponi' (si propone al titolare) o 'escludi' (il piano non lo comprende).
function cosaFareNelRilascio(ist, cliente, rilascio, adesso = new Date()) {
  if (rilascio?.obbligatorio === true) return 'lancia'
  const r = regolaDi(ist, cliente, adesso)
  if (!r.inclusi) return 'escludi'
  return r.modalita === 'a_scelta' ? 'proponi' : 'lancia'
}

// ── LE NOTE: le sezioni del CHANGELOG di tana-drink fra due versioni ──
// I titoli sono `## X.Y.Z — data` (o `## X.Y.Z-beta — …`): è il contratto
// che usa anche l'app (sezioneChangelog in src/lib/novita.js di tana-drink).
function versioneDi(testo) {
  const m = /(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/.exec(String(testo || ''))
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: Boolean(m[4]) } : null
}

// Ordine delle versioni: una -beta viene prima della sua uscita.
function confronta(a, b) {
  for (let i = 0; i < 3; i += 1) if (a.n[i] !== b.n[i]) return a.n[i] - b.n[i]
  return (a.pre ? 0 : 1) - (b.pre ? 0 : 1)
}

// Le sezioni con versione dopo `da` e fino ad `a` compresa. Senza `da` (un
// locale che non ha mai riferito la versione) solo quella di `a`. Nessuna
// sezione che combacia: stringa vuota, e la proposta esce senza note.
function noteTra(md, da, a) {
  const fino = versioneDi(a)
  if (!fino) return ''
  const dopo = versioneDi(da)
  const righe = String(md || '').split('\n')
  const sezioni = []
  let attuale = null
  for (const riga of righe) {
    if (riga.startsWith('## ')) {
      const v = versioneDi(riga)
      attuale = v ? { v, righe: [riga] } : null
      if (attuale) sezioni.push(attuale)
    } else if (attuale) {
      attuale.righe.push(riga)
    }
  }
  const scelte = sezioni.filter(({ v }) => {
    if (confronta(v, fino) > 0) return false
    if (!fino.pre && v.pre) return false
    return dopo ? confronta(v, dopo) > 0 : confronta(v, fino) === 0
  })
  const testo = scelte.map((s) => s.righe.join('\n').replace(/\n+---\s*$/, '').trimEnd()).join('\n\n')
  return testo.length > NOTE_MAX ? `${testo.slice(0, NOTE_MAX).trimEnd()}\n\n…` : testo
}

// ── LA PROPOSTA E LA SCELTA ──────────────────────────────────────────

// La proposta su un'istanza. `attesa` resta vera finché il titolare non
// sceglie «Aggiorna» (anche dopo «Salta»: in Informazioni può cambiare
// idea): la scelta che arriva (sceltaDallApp, la dashboard) vale solo così.
function nuovaProposta(tag, { rilascio = null, note = '', adesso = new Date() } = {}) {
  return { tag, rilascio, note: String(note || '').slice(0, NOTE_MAX + 4), proposta_il: adesso.toISOString(), saltata_il: null, attesa: true, scelta_letta_il: null, presa_il: null }
}

// LA STESSA SCELTA DUE VOLTE (tana-drink, 31/10/2026): se la risposta tarda,
// il titolare riprova, e due «Aggiorna» possono arrivare insieme. Il primo
// si PRENDE la proposta (in una transazione) e lancia; il secondo trova la
// proposta presa e risponde 409 senza fare niente. Una presa più vecchia di
// PRESA_MAX (la Function caduta a metà) si può riprendere.
const PRESA_MAX = 5 * 60 * 1000
function puoPrendere(proposta, tag, adesso = new Date()) {
  if (!proposta?.attesa || proposta.tag !== tag) return false
  const presa = Date.parse(proposta.presa_il || '')
  return !Number.isFinite(presa) || adesso.getTime() - presa > PRESA_MAX
}

// La proposta non serve più: il locale è già a quella versione o oltre
// (un «Aggiorna subito» dell'admin, un rilascio obbligatorio).
function propostaSuperata(proposta, versione) {
  const v = versioneDi(versione)
  const p = versioneDi(proposta?.tag)
  return Boolean(proposta?.attesa && v && p && confronta(v, p) >= 0)
}

// La scelta del titolare vale? Torna 'aggiorna', 'salta' o null. Deve
// essere sul tag proposto e, per «salta», su una proposta non già saltata.
// Una scelta già letta (stessa data) non si rilegge.
function sceltaValida(scelta, proposta, { giaLetta = null } = {}) {
  if (!proposta?.attesa || !SCELTE.includes(scelta?.scelta)) return null
  if (scelta.tag !== proposta.tag) return null
  const il = dataDi(scelta.il)
  if (giaLetta && il && il === giaLetta) return null
  if (scelta.scelta === 'salta' && proposta.saltata_il) return null
  return scelta.scelta
}

// Una data di Firestore (Timestamp), ISO o Date, in ISO.
function dataDi(v) {
  if (!v) return null
  if (typeof v === 'string') return Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null
  if (v instanceof Date) return v.toISOString()
  if (typeof v.toDate === 'function') return v.toDate().toISOString()
  return null
}

// ── IL CAMBIO DELLE REGOLE, CON PREAVVISO ─────────────────────────────

// Da quando valgono le regole nuove per questo locale: il suo prossimo
// rinnovo se lo sappiamo (Stripe lo dice), se no dopo il preavviso.
function dataDelCambio(cliente, adesso = new Date()) {
  const rinnovo = Date.parse(cliente?.abbonamento?.rinnovo_il || '')
  if (Number.isFinite(rinnovo) && rinnovo > adesso.getTime()) return new Date(rinnovo).toISOString()
  return new Date(adesso.getTime() + GIORNI_PREAVVISO * GIORNO).toISOString()
}

// I mesi a mano: il Node della CI non ha i dati di lingua italiani
// (docs/handover.md §8), e l'avviso uscirebbe in inglese. Il giorno è quello
// di Roma.
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
function giorno(iso) {
  const parti = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(iso)).map((p) => [p.type, p.value])
  )
  return `${Number(parti.day)} ${MESI[Number(parti.month) - 1]} ${parti.year}`
}

// Il testo dell'avviso, che l'app e la dashboard mostrano così com'è.
// È un testo contrattuale: si cambia con l'utente.
function testoAvviso(prima, dopo, dal) {
  const frasi = []
  if (dopo.a_scelta && !prima.a_scelta) frasi.push('prima di ogni aggiornamento vedrai le novità e potrai scegliere se installarlo o saltarlo')
  if (!dopo.a_scelta && prima.a_scelta) frasi.push('gli aggiornamenti si installeranno da soli, come prima, senza chiederti di sceglierli')
  if (dopo.solo_finche_paga && !prima.solo_finche_paga) {
    frasi.push('gli aggiornamenti saranno compresi solo finché l’abbonamento è pagato: senza pagamento il locale torna al piano Free e riceve soltanto le correzioni di sicurezza e di compatibilità')
  }
  if (!dopo.solo_finche_paga && prima.solo_finche_paga) frasi.push('gli aggiornamenti arriveranno a tutti i piani, anche senza abbonamento a pagamento')
  return `Dal ${giorno(dal)}, al rinnovo, cambiano le condizioni degli aggiornamenti: ${frasi.join('; ')}. Fino ad allora per il tuo locale non cambia niente.`
}

// Cosa scrivere su un'istanza quando l'admin cambia le regole. null se per
// lei non cambia niente (o non è attiva).
function cambioPerIstanza(ist, cliente, regole, adesso = new Date()) {
  if (ist?.stato !== 'attiva' || ist?.licenza_stato === 'chiusa') return null
  const prima = condizioniIn(ist, adesso)
  if (regoleUguali(prima, regole)) {
    // Si è tornati alle regole in vigore: l'avviso di prima non vale più.
    return ist.condizioni_prossime ? { condizioni_prossime: null, avviso_aggiornamenti: null } : null
  }
  const dal = dataDelCambio(cliente, adesso)
  return {
    condizioni_aggiornamenti: prima,
    condizioni_prossime: { ...regole, dal },
    avviso_aggiornamenti: { id: `condizioni-${adesso.toISOString().slice(0, 10)}`, testo: testoAvviso(prima, regole, dal), dal },
  }
}

// Le condizioni prossime arrivate alla loro data diventano quelle in vigore.
function promozione(ist, adesso = new Date()) {
  const p = ist?.condizioni_prossime
  if (!p || !(Date.parse(p.dal) <= adesso.getTime())) return null
  return { condizioni_aggiornamenti: regolePulite(p), condizioni_prossime: null, avviso_aggiornamenti: null }
}

// ── IL RITORNO AL FREE DI CHI NON PAGA ────────────────────────────────
// Con «solo finché si paga» in vigore, un abbonamento non pagato non
// sospende il locale: lo riporta al Free, che lavora coi limiti e riceve
// solo gli obbligatori; quando torna a pagare il piano torna il suo. Lo
// decide il cambio di stato dell'abbonamento (scadenze.azioneDiPagamento,
// REQ-FLOTTA-023), non un giro quotidiano.
// Chi non paga torna al Free invece di fermarsi?
const ripiegaInveceDiSospendere = (ist, adesso = new Date()) => ist?.interna !== true && condizioniIn(ist, adesso).solo_finche_paga

// ── QUELLO CHE SA L'APP: settings/bar.licenza.aggiornamenti ───────────
// `sceltaUrl`: dove l'app manda «Aggiorna» o «Salta» (sceltaDallApp).
function licenzaAggiornamenti(ist, cliente, adesso = new Date(), { sceltaUrl = null } = {}) {
  const r = regolaDi(ist, cliente, adesso)
  const p = ist?.proposta_aggiornamento
  const proposta = p?.attesa && r.inclusi ? { tag: p.tag, note: p.note || '', proposta_il: p.proposta_il, saltata_il: p.saltata_il || null } : null
  const a = ist?.avviso_aggiornamenti
  return {
    modalita: r.modalita,
    inclusi: r.inclusi,
    motivo: r.motivo,
    proposta,
    avviso: a ? { id: a.id, testo: a.testo, dal: a.dal } : null,
    scelta_url: sceltaUrl,
  }
}

// ── LA SCELTA DALL'APP: UNA CHIAMATA ALLA REGIA ───────────────────────
// Il titolare tocca «Aggiorna» o «Salta» e l'app chiama la regia
// (sceltaDallApp) col token d'accesso che Firebase le ha già dato. Niente
// chiavi nel browser, niente documento da andare a leggere: la regia
// riconosce il locale dal progetto del token, lo verifica, e applica la
// scelta subito. Vale anche per il Free, che non ha Functions: chiama il
// browser.

// Il progetto Firebase da cui viene il token (il campo «aud»). Si legge
// senza fidarsi: serve solo a sapere con quale progetto verificarlo.
function progettoDelToken(token) {
  const parti = String(token || '').split('.')
  if (parti.length !== 3) return null
  try {
    const aud = JSON.parse(Buffer.from(parti[1], 'base64url').toString('utf8'))?.aud
    return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(aud || '') ? aud : null
  } catch {
    return null
  }
}

const bearerDi = (intestazione) => /^Bearer\s+(\S+)$/i.exec(String(intestazione || ''))?.[1] || null

// Il corpo della chiamata: { tag, scelta }, o null.
function corpoScelta(corpo) {
  const tag = String(corpo?.tag || '')
  return TAG.test(tag) && SCELTE.includes(corpo?.scelta) ? { tag, scelta: corpo.scelta } : null
}

// Il titolare, in tana-drink, è il ruolo «admin» nei claim del suo accesso.
const eTitolare = (token) => token?.role === 'admin'

module.exports = {
  MODALITA,
  SCELTE,
  TAG,
  REGOLE_BASE,
  GIORNI_PREAVVISO,
  NOTE_MAX,
  regolePulite,
  regoleUguali,
  condizioniIn,
  regolaDi,
  cosaFareNelRilascio,
  versioneDi,
  confronta,
  noteTra,
  nuovaProposta,
  puoPrendere,
  PRESA_MAX,
  progettoDelToken,
  bearerDi,
  corpoScelta,
  eTitolare,
  propostaSuperata,
  sceltaValida,
  dataDi,
  dataDelCambio,
  testoAvviso,
  cambioPerIstanza,
  promozione,
  ripiegaInveceDiSospendere,
  licenzaAggiornamenti,
}
