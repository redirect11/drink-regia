'use strict'

// ── IL CATALOGO DEI TEMI, LOGICA PURA (REQ-FLOTTA-032) ─────────────────
//
// Richiesta dall'app (tana-drink, REQ-MENU-023), decisioni dell'utente del
// 02/11/2026: «Una sezione marketplace per i temi in aspetto. È una pagina
// che carica tutti i temi disponibili. Serve un posto dove pubblicarne di
// nuovi.» Pubblica solo il fornitore, dalla regia; per ora tutti gratis.
//
// UN TEMA È UNA RICETTA, NON CODICE: una tavolozza (una delle basi
// dell'app, più se serve i sette colori) e uno degli stili del menù che
// l'app sa già disegnare. Non può rompere il menù e funziona senza rete.
//
//   { id, nome, descrizione, prezzo: 0,
//     tavolozza: { base: 'notte-blu', colori: { '--accent': '#d4af37' } },
//     stile: 'deco' }
//
// LA STESSA VALIDAZIONE DELL'APP (leggiTema in src/lib/marketplaceTemi.js di
// tana-drink, la fonte della verità), più severa dove l'app aggiusta: qui un
// nome troppo lungo o un colore sbagliato si rifiutano, perché un tema che
// l'app scarterebbe o taglierebbe non va pubblicato.

const BASI = ['tana-scuro', 'notte-blu', 'catppuccin', 'catppuccin-chiaro', 'pico-scuro', 'pico-chiaro', 'chiaro', 'crema']
// Gli stili che ogni app conosce. Uno stile nuovo arriva con una versione
// dell'app, e allora si aggiunge qui.
const STILI = ['classico', 'lavagna', 'deco', 'riviera', 'giornale']
// Gli stili in licenza (tana-drink, stileMenu.js, `inLicenza`): «notte» e
// «meraviglie» sono esclusivi della Tana, non vanno in un tema pubblicato
// per tutti. Li assegna l'admin dalla scheda del locale (REQ-FLOTTA-039).
const ESCLUSIVI = ['notte', 'meraviglie']
const CHIAVI_COLORE = ['--bg', '--bg-2', '--card', '--accent', '--accent-2', '--text', '--muted']
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const COLORE = /^#[0-9a-fA-F]{6}$/
const STATI = ['bozza', 'pubblicato', 'ritirato']

const testo = (v) => (typeof v === 'string' ? v.trim() : '')
// Gli stili a ricetta pubblicati (REQ-FLOTTA-034): un tema li può usare.
const stili = require('./stili.js')
const STILI_RICETTA = () => stili.catalogoStili([]).map((s) => s.id)

// I TEMI DEL REPOSITORY (REQ-FLOTTA-033). L'utente, 02/11/2026: «senza
// spendere crediti, tu potresti creare temi, o un agente, e li carica sul
// marketplace». I temi disegnati dal fornitore (o da un agente, con una PR)
// stanno in functions/temi/catalogo.json: i test li controllano, il deploy
// li pubblica. Quello nel database (dal backoffice) con lo stesso id vince.
const TEMI_DEL_REPOSITORY = require('../temi/catalogo.json').temi.map((t) => ({ ...t, stato: t.stato || 'pubblicato', dal_repository: true }))

// Il contrasto fra due colori #rrggbb, come lo misura il WCAG (da 1 a 21).
// I temi del repository devono farsi leggere: i test lo controllano.
function luminanza(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function contrasto(a, b) {
  const [chiaro, scuro] = [luminanza(a), luminanza(b)].sort((x, y) => y - x)
  return (chiaro + 0.05) / (scuro + 0.05)
}

// Un tema scritto dall'admin → { tema } da salvare, o { errore }.
// `stiliRicetta`: gli id degli stili a ricetta pubblicati, che un tema può
// usare come quelli dell'app (un'app che non ha ancora il motore delle
// ricette scarta il tema, e va bene così).
function temaPulito(dati, { stiliRicetta = STILI_RICETTA() } = {}) {
  const id = testo(dati?.id).toLowerCase()
  if (!ID.test(id)) return { errore: 'Identificativo: minuscole, cifre e trattini, da 2 a 41 caratteri.' }
  const nome = testo(dati?.nome)
  if (!nome || nome.length > 40) return { errore: 'Il nome ci vuole, fino a 40 caratteri.' }
  const descrizione = testo(dati?.descrizione)
  if (descrizione.length > 240) return { errore: 'La descrizione arriva al massimo a 240 caratteri.' }
  const t = dati?.tavolozza || {}
  if (!BASI.includes(t.base)) return { errore: `La base della tavolozza è una fra: ${BASI.join(', ')}.` }
  if (ESCLUSIVI.includes(dati?.stile)) return { errore: `Lo stile «${dati.stile}» è un esclusivo: non va in un tema per tutti.` }
  if (!STILI.includes(dati?.stile) && !stiliRicetta.includes(dati?.stile)) return { errore: `Lo stile è uno fra: ${[...STILI, ...stiliRicetta].join(', ')}.` }
  const colori = {}
  for (const [k, v] of Object.entries(t.colori && typeof t.colori === 'object' ? t.colori : {})) {
    if (v === '' || v == null) continue
    if (!CHIAVI_COLORE.includes(k)) return { errore: `Il colore ${k} non è uno dei sette del tema.` }
    if (!COLORE.test(String(v))) return { errore: `Il colore ${k} va scritto come #rrggbb.` }
    colori[k] = String(v).toLowerCase()
  }
  // Per ora tutti gratis: «Compra» nell'app non c'è ancora (REQ-LIC-011).
  if (Number(dati?.prezzo || 0) !== 0) return { errore: 'Per ora i temi sono tutti gratis.' }
  return { tema: { id, nome, descrizione, prezzo: 0, tavolozza: { base: t.base, colori }, stile: dati.stile } }
}

// Quello che va fuori, nel catalogo: solo i campi del tema.
const perIlCatalogo = (doc) => ({
  id: doc.id,
  nome: doc.nome,
  descrizione: doc.descrizione || '',
  prezzo: 0,
  tavolozza: { base: doc.tavolozza.base, colori: { ...(doc.tavolozza.colori || {}) } },
  stile: doc.stile,
})

// Il catalogo pubblico: i temi del repository con sopra quelli del database
// (lo stesso id vince il database), solo i pubblicati, e solo se ancora
// validi (uno salvato con regole vecchie non esce), in ordine di nome.
function catalogoPubblico(docs, daRepository = TEMI_DEL_REPOSITORY, { stiliRicetta = STILI_RICETTA() } = {}) {
  const perId = new Map((daRepository || []).map((t) => [t.id, t]))
  for (const d of docs || []) if (d?.id) perId.set(d.id, d)
  return [...perId.values()]
    .filter((d) => d?.stato === 'pubblicato' && !temaPulito(d, { stiliRicetta }).errore)
    .map(perIlCatalogo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

// Il documento da scrivere per un'azione dell'admin, o { errore }.
// - salva: il tema com'è scritto; uno nuovo nasce bozza, uno pubblicato
//   resta pubblicato (il ritocco va subito nel catalogo);
// - pubblica / ritira: cambia lo stato, ricontrollando il tema.
function azioneSuTema(prima, azione, dati, { da = null, adesso = new Date(), stiliRicetta = STILI_RICETTA() } = {}) {
  const ora = adesso.toISOString()
  if (azione === 'salva') {
    const { tema, errore } = temaPulito(dati, { stiliRicetta })
    if (errore) return { errore }
    if (prima && prima.id !== tema.id) return { errore: 'L’identificativo di un tema non cambia: creane uno nuovo.' }
    return { doc: { ...(prima || { creato_il: ora, stato: 'bozza' }), ...tema, aggiornato_il: ora, aggiornato_da: da } }
  }
  if (!prima) return { errore: 'Tema sconosciuto.' }
  if (azione === 'pubblica') {
    const { errore } = temaPulito(prima, { stiliRicetta })
    if (errore) return { errore: `Non si pubblica: ${errore}` }
    return { doc: { ...prima, stato: 'pubblicato', pubblicato_il: ora, aggiornato_da: da } }
  }
  if (azione === 'ritira') {
    if (prima.stato !== 'pubblicato') return { errore: 'Si ritira solo un tema pubblicato.' }
    return { doc: { ...prima, stato: 'ritirato', ritirato_il: ora, aggiornato_da: da } }
  }
  return { errore: 'Azione sconosciuta.' }
}

// Il tema del repository con quell'id, come se fosse nel database: serve a
// ritirarlo (o ripubblicarlo) dal backoffice.
const dalRepository = (id, daRepository = TEMI_DEL_REPOSITORY) => daRepository.find((t) => t.id === id) || null

// ── I TEMI IN LICENZA DI UN LOCALE (REQ-FLOTTA-039) ─────────────────────
// Richiesta da tana-drink, 05/11/2026: «i temi esclusivi per la Tana
// dovrebbero essere anche visibili in regia, come se la Tana li avesse
// acquistati». Gli id degli stili che la licenza nomina in `temi`
// (clienti/{uid}.temi → licenza.temi): l'app accende uno stile `inLicenza`
// solo se è lì. Un id che l'app non conosce l'app lo ignora, quindi si può
// scrivere prima che l'app lo abbia. → l'elenco pulito (minuscolo, senza
// doppioni, in ordine), o null se non è un elenco di id.
function temiPuliti(valore) {
  if (valore == null) return []
  if (!Array.isArray(valore) || valore.length > 20) return null
  const temi = valore.map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
  if (!temi.every((t) => ID.test(t))) return null
  return [...new Set(temi)].sort()
}

// Quello che il locale ha installato dall'app, letto adesso dal suo
// settings/bar (stili gratis, temi del marketplace, lo stile in uso): solo
// quello che la scheda mostra, e niente si salva nella regia.
function installatiDalLocale(bar) {
  const idValido = (v) => typeof v === 'string' && ID.test(v)
  const elenco = (v) => (Array.isArray(v) ? v : [])
  return {
    stili_installati: elenco(bar?.stili_installati).filter(idValido),
    temi_installati: elenco(bar?.temi_installati)
      .filter((t) => idValido(t?.id))
      .map((t) => ({ id: t.id, nome: testo(t.nome).slice(0, 40) || t.id, stile: idValido(t.stile) ? t.stile : null })),
    stile_menu: idValido(bar?.stile_menu) ? bar.stile_menu : null,
  }
}

module.exports = { BASI, STILI, ESCLUSIVI, CHIAVI_COLORE, STATI, TEMI_DEL_REPOSITORY, temaPulito, perIlCatalogo, catalogoPubblico, azioneSuTema, dalRepository, contrasto, temiPuliti, installatiDalLocale }
