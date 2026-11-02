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
// «notte» è esclusivo della Tana: non va in un tema pubblicato per tutti.
const ESCLUSIVI = ['notte']
const CHIAVI_COLORE = ['--bg', '--bg-2', '--card', '--accent', '--accent-2', '--text', '--muted']
const ID = /^[a-z0-9][a-z0-9-]{1,40}$/
const COLORE = /^#[0-9a-fA-F]{6}$/
const STATI = ['bozza', 'pubblicato', 'ritirato']

const testo = (v) => (typeof v === 'string' ? v.trim() : '')

// Un tema scritto dall'admin → { tema } da salvare, o { errore }.
function temaPulito(dati) {
  const id = testo(dati?.id).toLowerCase()
  if (!ID.test(id)) return { errore: 'Identificativo: minuscole, cifre e trattini, da 2 a 41 caratteri.' }
  const nome = testo(dati?.nome)
  if (!nome || nome.length > 40) return { errore: 'Il nome ci vuole, fino a 40 caratteri.' }
  const descrizione = testo(dati?.descrizione)
  if (descrizione.length > 240) return { errore: 'La descrizione arriva al massimo a 240 caratteri.' }
  const t = dati?.tavolozza || {}
  if (!BASI.includes(t.base)) return { errore: `La base della tavolozza è una fra: ${BASI.join(', ')}.` }
  if (ESCLUSIVI.includes(dati?.stile)) return { errore: `Lo stile «${dati.stile}» è un esclusivo: non va in un tema per tutti.` }
  if (!STILI.includes(dati?.stile)) return { errore: `Lo stile è uno fra: ${STILI.join(', ')}.` }
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

// Il catalogo pubblico: solo i pubblicati, e solo se ancora validi (uno
// salvato con regole vecchie non esce), in ordine di nome.
function catalogoPubblico(docs) {
  return (docs || [])
    .filter((d) => d?.stato === 'pubblicato' && !temaPulito(d).errore)
    .map(perIlCatalogo)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
}

// Il documento da scrivere per un'azione dell'admin, o { errore }.
// - salva: il tema com'è scritto; uno nuovo nasce bozza, uno pubblicato
//   resta pubblicato (il ritocco va subito nel catalogo);
// - pubblica / ritira: cambia lo stato, ricontrollando il tema.
function azioneSuTema(prima, azione, dati, { da = null, adesso = new Date() } = {}) {
  const ora = adesso.toISOString()
  if (azione === 'salva') {
    const { tema, errore } = temaPulito(dati)
    if (errore) return { errore }
    if (prima && prima.id !== tema.id) return { errore: 'L’identificativo di un tema non cambia: creane uno nuovo.' }
    return { doc: { ...(prima || { creato_il: ora, stato: 'bozza' }), ...tema, aggiornato_il: ora, aggiornato_da: da } }
  }
  if (!prima) return { errore: 'Tema sconosciuto.' }
  if (azione === 'pubblica') {
    const { errore } = temaPulito(prima)
    if (errore) return { errore: `Non si pubblica: ${errore}` }
    return { doc: { ...prima, stato: 'pubblicato', pubblicato_il: ora, aggiornato_da: da } }
  }
  if (azione === 'ritira') {
    if (prima.stato !== 'pubblicato') return { errore: 'Si ritira solo un tema pubblicato.' }
    return { doc: { ...prima, stato: 'ritirato', ritirato_il: ora, aggiornato_da: da } }
  }
  return { errore: 'Azione sconosciuta.' }
}

module.exports = { BASI, STILI, ESCLUSIVI, CHIAVI_COLORE, STATI, temaPulito, perIlCatalogo, catalogoPubblico, azioneSuTema }
