// ── LA LICENZA DI UN'ISTANZA DAL PIANO, LOGICA PURA (REQ-FLOTTA-010) ───
//
// Il piano e i moduli comprati nella regia (piani.json) diventano le
// funzioni premium dell'app (src/lib/licenza.js in tana-drink: conta,
// fatture, scadenzario). La prima volta la scrive il workflow
// dell'attivazione (scripts/licenza-istanza.mjs, con licenzaIniziale);
// poi la riscrivono le Functions quando il piano cambia.

const listino = require('../piani.json')
const { proveAttive } = require('./prove.js')
const { licenzaAggiornamenti, ripiegaInveceDiSospendere } = require('./aggiornamenti.js')
const { ORA_DEL_TAGLIO } = require('./taglio.js')
const { quandoSospendere } = require('./orari-servizio.js')
const { cancellazioneDellaLicenza } = require('./conservazione.js')
const { scadenzaPagamento, GIORNI_DI_GRAZIA } = require('./scadenze.js')
const { temiPuliti, temiSuMisuraPerLicenza } = require('./temi.js')
const { rinnovoUrl } = require('./rinnovo.js')

// I temi in licenza (REQ-FLOTTA-039): gli id degli stili esclusivi o
// comprati, da clienti/{uid}.temi. Non dipendono dal piano: un esclusivo
// assegnato dal fornitore resta anche a chi torna al Free.
const temiLicenza = (cliente) => temiPuliti(cliente?.temi) || []

// I temi su misura del locale (REQ-FLOTTA-040): i temi interi, dal mockup o
// dal fornitore, da clienti/{uid}/temi_su_misura. Come gli esclusivi non
// dipendono dal piano: chi li chiama li passa (`temiSuMisura`), con gli
// stili a ricetta pubblicati (`stiliRicetta`) per controllarli.

// Stessi id nel listino e nell'app (REQ-LIC-002 in tana-drink); il
// magazzino porta con sé l'inventario, che senza magazzino non ha niente da
// contare. Le fatture ai clienti e ai fornitori si vendono a parte
// (decisione dell'utente del 07/11/2026): sono altri mestieri, e lo
// scadenzario dei fornitori nell'app lavora anche senza magazzino
// (tana-drink REQ-LIC-015).
const MAPPA = {
  menu_tavoli: ['menu_tavoli'],
  ordini_cliente: ['ordini_cliente'],
  clienti: ['clienti'],
  magazzino: ['magazzino', 'conta'],
  fatture: ['fatture'],
  scadenzario: ['scadenzario'],
  statistiche: ['statistiche'],
  staff: ['staff'],
  sumup: ['sumup'],
}
const TUTTI = ['menu_tavoli', 'ordini_cliente', 'clienti', 'magazzino', 'conta', 'fatture', 'scadenzario', 'statistiche', 'staff', 'sumup']

// { conta: true, fatture: false, … } per una scelta. Il Free non accende
// nessun modulo comprato, qualunque cosa porti la scelta (REQ-FLOTTA-015);
// i moduli in prova si accendono per tutti, Free compreso: quali si possono
// provare lo decide l'admin (REQ-FLOTTA-016). Quelli compresi nel piano
// (`include`: il menù digitale nel Base) si accendono senza comprarli.
function moduliLicenza({ piano = 'base', moduli = [], prove = [] } = {}) {
  const p = listino.piani[piano] ? piano : 'base'
  const comprati = listino.piani[p].gratuito ? [] : moduli || []
  const daAccendere = [...listino.piani[p].include, ...comprati, ...(prove || [])]
  const accesi = p === 'completo' ? TUTTI : [...new Set(daAccendere.flatMap((m) => MAPPA[m] || []))]
  return Object.fromEntries(TUTTI.map((m) => [m, accesi.includes(m)]))
}

// Le prove ancora in corso, con la loro scadenza: { magazzino: '2026-…' }.
const proveInCorso = (cliente, adesso) => Object.fromEntries(proveAttive(cliente, adesso).map((id) => [id, cliente.prove[id].scade_il]))

// I limiti del piano per l'app (REQ-FLOTTA-015): il Free li porta, gli
// altri piani scrivono null, cioè nessun limite. Contratto con tana-drink
// (handover §7): senza limiti scritti l'app non ne applica nessuno.
const limitiLicenza = (piano) => listino.piani[piano]?.limiti || null

// La patch per settings/bar dell'istanza quando il piano cambia.
function patchLicenzaPiano(scelta, adesso = new Date()) {
  const p = listino.piani[scelta?.piano] ? scelta.piano : 'base'
  return {
    'licenza.piano': p,
    'licenza.moduli': moduliLicenza({ piano: p, moduli: scelta?.moduli, prove: proveAttive(scelta, adesso) }),
    'licenza.terminali': Math.max(1, Number(scelta?.terminali) || 1),
    'licenza.temi': temiLicenza(scelta),
    'licenza.limiti': limitiLicenza(p),
    'licenza.prove': proveInCorso(scelta, adesso),
    'licenza.scritta_il': adesso.toISOString(),
  }
}

// La prima licenza di un'istanza, dopo il deploy dell'attivazione o di un
// aggiornamento: cosa scrivere in settings/bar dato quello che c'è già.
// Lo stato (attiva, sospesa, chiusa: REQ-FLOTTA-008) non si tocca se la
// regia l'ha già scritto: una riattivazione passa da lì, non da un deploy.
// Il nome del locale si scrive solo se manca: lo cambia il locale.
function licenzaIniziale(attuale, { piano = 'base', moduli = [], temi = [], slug, nome, regiaUrl }, adesso = new Date()) {
  const p = listino.piani[piano] ? piano : 'base'
  const nomeLocale = String(nome || slug)
  const patch = {
    licenza: {
      ...(attuale?.licenza || {}),
      piano: p,
      moduli: moduliLicenza({ piano: p, moduli }),
      temi: temiLicenza({ temi }),
      // I temi su misura arrivano con la licenza che la regia riscrive
      // dopo l'attivazione (scriviLicenza): la prima è senza.
      temi_su_misura: [],
      limiti: limitiLicenza(p),
      stato: attuale?.licenza?.stato || 'attiva',
      slug,
      regia_url: regiaUrl,
      // Dove il titolare rinnova un locale sospeso (REQ-FLOTTA-090).
      rinnovo_url: rinnovoUrl(regiaUrl),
      scritta_il: adesso.toISOString(),
    },
  }
  if (!attuale?.venue_name) patch.venue_name = nomeLocale
  if (!attuale?.venue_short_name) patch.venue_short_name = nomeLocale.length > 12 ? nomeLocale.split(/\s+/)[0] : nomeLocale
  return patch
}

// È cambiato qualcosa che la licenza deve sapere?
// Anche una prova accesa o tolta (REQ-FLOTTA-016), o un tema in licenza
// (REQ-FLOTTA-039): la licenza li deve sapere.
function sceltaCambiata(prima, dopo) {
  const prove = (c) => Object.entries(c?.prove || {}).map(([id, p]) => `${id}@${p?.scade_il}`).sort()
  const chiave = (c) => JSON.stringify([c?.piano || null, [...(c?.moduli || [])].sort(), Number(c?.terminali) || 1, prove(c), temiLicenza(c)])
  return chiave(prima) !== chiave(dopo)
}

// ── LA LICENZA PROTETTA: licenza/attuale (BUG-125 di tana-drink) ────────
// In settings/bar la licenza la può riscrivere ogni bartender: le regole
// dell'app danno tutto settings/ al banco, e un locale Free poteva
// accendersi da solo piano e moduli. La licenza passa in un documento suo,
// licenza/attuale, che dall'app si legge e non si scrive. Lo scrive solo la
// regia, con le sue credenziali.
//
// Si CALCOLA dai dati della regia, non si copia da settings/bar: quella
// copia potrebbe essere già stata manomessa. Stesso contenuto di oggi:
// piano, moduli, terminali, limiti, prove, stato col motivo e la data, slug,
// regia_url, rinnovo_url (REQ-FLOTTA-090), aggiornamenti.
//
// Attenzione (BUG-125): con l'app nuova un locale SENZA licenza/attuale
// mostra «Installazione non attivata». La copia va fatta per tutti i locali
// e verificata prima di quel rilascio.
// FINO A QUANDO VALE (tana-drink, 31/10/2026): `valida_fino` è il momento
// in cui la regia fermerebbe il locale se nessuno paga, così l'app lo sa
// anche senza rete (e l'on premise, che sta nel locale). Solo un piano
// pagato a mano ha una data: «pagato fino al» più i giorni di grazia, la
// stessa del compito della regia (REQ-FLOTTA-023). Con Stripe, dal
// 02/11/2026, la fine del periodo pagato più la stessa grazia. Null se non
// scade: il Free, un omaggio, le interne.
//
// La data cade dove la regia lo ferma davvero: dal 13/11/2026
// (REQ-FLOTTA-095) al momento della sospensione per pagamento calcolato
// sulla scadenza, fuori dall'orario di servizio del locale; senza orari,
// al taglio della giornata dopo la scadenza come prima (REQ-FLOTTA-024).
// Un'app senza rete che si fermasse a mezzanotte lo farebbe in servizio.
function validaFino(ist, cliente, giorniGrazia = GIORNI_DI_GRAZIA, oraTaglio = ORA_DEL_TAGLIO) {
  if (ist?.interna === true || ist?.ripiego_free) return null
  const scadenza = scadenzaPagamento(cliente, giorniGrazia)
  return scadenza ? quandoSospendere(cliente, { adesso: new Date(scadenza), oraTaglio }).toISOString() : null
}

// COSA SUCCEDE ALLA SCADENZA (l'utente, 02/11/2026: «se non c'è nessuna
// licenza non dovrebbe partire proprio il prodotto, o licenza scaduta […]
// al massimo, se dalla regia è attiva l'opzione, dovrebbe diventare
// versione free ma senza far perdere i dati»): 'free' con «solo finché si
// paga» (REQ-FLOTTA-020), se no 'ferma'. Così l'app, anche senza rete,
// passata valida_fino sa se lavorare col Free o fermarsi.
const allaScadenza = (ist, adesso) => (ripiegaInveceDiSospendere(ist, adesso) ? 'free' : 'ferma')

function licenzaProtetta(ist, cliente, { slug, regiaUrl = null, sceltaUrl = null, giorniGrazia = GIORNI_DI_GRAZIA, oraTaglio = ORA_DEL_TAGLIO, adesso = new Date(), temiSuMisura = [], stiliRicetta } = {}) {
  // Tornato al Free per un pagamento mancato (REQ-FLOTTA-020): il suo piano
  // torna col pagamento, non qui.
  const scelta = ist?.ripiego_free ? { piano: 'free' } : cliente
  const p = listino.piani[scelta?.piano] ? scelta.piano : 'base'
  return {
    piano: p,
    moduli: moduliLicenza({ piano: p, moduli: scelta?.moduli, prove: proveAttive(scelta, adesso) }),
    terminali: Math.max(1, Number(scelta?.terminali) || 1),
    temi: temiLicenza(cliente),
    temi_su_misura: temiSuMisuraPerLicenza(temiSuMisura, stiliRicetta ? { stiliRicetta } : {}),
    limiti: limitiLicenza(p),
    prove: proveInCorso(scelta, adesso),
    stato: ist?.licenza_stato || 'attiva',
    motivo: ist?.licenza_stato && ist.licenza_stato !== 'attiva' ? ist.licenza_motivo || null : null,
    dal: ist?.licenza_dal || null,
    slug: slug || cliente?.slug || null,
    regia_url: regiaUrl,
    // REQ-FLOTTA-090 (Daniele, 13/11/2026: «dobbiamo portare l'utente alla
    // schermata di pagamento per il rinnovo»): dove l'app manda il titolare
    // di un locale sospeso o chiuso. Un campo in più, contratto con
    // tana-drink (handover §7); null senza indirizzo della regia.
    rinnovo_url: rinnovoUrl(regiaUrl),
    aggiornamenti: licenzaAggiornamenti(ist, cliente, adesso, { sceltaUrl }),
    valida_fino: validaFino(ist, cliente, giorniGrazia, oraTaglio),
    alla_scadenza: allaScadenza(ist, adesso),
    // La cancellazione dei dati programmata, per l'avviso nell'app
    // (REQ-FLOTTA-025): { il, richiedente } o null.
    cancellazione: cancellazioneDellaLicenza(ist),
    scritta_il: adesso.toISOString(),
  }
}

// Due licenze dicono la stessa cosa? La data di scrittura non conta.
// rinnovo_url (REQ-FLOTTA-090) conta: una licenza scritta prima, senza,
// per la verifica è diversa, e «Allinea» la riscrive col campo.
const CHIAVI_PROTETTA = ['piano', 'moduli', 'terminali', 'temi', 'temi_su_misura', 'limiti', 'prove', 'stato', 'motivo', 'slug', 'regia_url', 'rinnovo_url', 'aggiornamenti', 'valida_fino', 'alla_scadenza', 'cancellazione']
function ordinato(v) {
  if (Array.isArray(v)) return v.map(ordinato)
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordinato(v[k])]))
  return v ?? null
}
const stessaLicenza = (a, b) => Boolean(a && b) && CHIAVI_PROTETTA.every((k) => JSON.stringify(ordinato(a[k])) === JSON.stringify(ordinato(b[k])))

// LA SCADENZA PER LE REGOLE (tana-drink, 02/11/2026): «le regole leggono
// la scadenza solo da valida_fino_ts come Timestamp, perché una data
// scritta come testo non la sanno leggere. Senza quel campo, lato server
// la licenza non scade mai.» Quindi nel database la licenza porta anche
// valida_fino_ts, lo stesso istante di valida_fino come Timestamp di
// Firestore (null se non scade). `aTimestamp` lo fa chi scrive (le
// Functions, con firebase-admin): qui la logica resta pura.
function perIlDatabase(lic, aTimestamp) {
  return { ...lic, valida_fino_ts: lic?.valida_fino ? aTimestamp(new Date(lic.valida_fino)) : null }
}

// I due campi dicono la stessa scadenza? Un Timestamp ha toMillis().
function scadenzaCoerente(doc) {
  const testo = Date.parse(doc?.valida_fino || '')
  const ts = doc?.valida_fino_ts
  if (!Number.isFinite(testo)) return ts == null
  return typeof ts?.toMillis === 'function' && ts.toMillis() === testo
}

module.exports = { moduliLicenza, temiLicenza, patchLicenzaPiano, licenzaIniziale, sceltaCambiata, licenzaProtetta, stessaLicenza, validaFino, perIlDatabase, scadenzaCoerente, TUTTI }
