// ── IL LISTINO PER LE FUNCTIONS ──────────────────────────────────────
//
// piani.json sta nella radice del repository perché lo legge anche il
// sito, ma Firebase carica solo la cartella functions/: il predeploy di
// firebase.json ne mette una copia in functions/piani.json (non è in git).
// Si legge prima l'originale, così in locale, nei test e sugli emulatori,
// conta sempre il file vero e mai una copia rimasta indietro; sul server
// l'originale non c'è e si legge la copia.

let listino
try {
  listino = require('../../piani.json')
} catch {
  listino = require('../piani.json')
}

module.exports = listino
