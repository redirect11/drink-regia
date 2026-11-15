'use strict'

// LA MEMORIA DI UN MINUTO (REQ-FLOTTA-119). Un indirizzo pubblico che legge
// Firestore a ogni chiamata, bombardato apposta, fa pagare le letture:
// tenendo in memoria quello che ha letto, un'istanza legge una volta per
// periodo invece che una per chiamata. Le chiamate che arrivano mentre la
// lettura è in corso la aspettano invece di farne un'altra; un errore non
// resta in memoria, così la chiamata dopo riprova.
// La memoria è quella dell'istanza: ogni istanza ha la sua, e un'istanza
// nuova parte vuota. Con un tetto di istanze basso le letture restano
// poche anche sotto carico.
function inMemoria(ms, carica, { adesso = () => Date.now() } = {}) {
  let tenuto = null
  let inCorso = null
  return function leggi() {
    if (tenuto && adesso() - tenuto.il < ms) return Promise.resolve(tenuto.valore)
    if (inCorso) return inCorso
    // La lettura parte subito; un errore lanciato prima della promessa
    // diventa una promessa rifiutata come gli altri.
    inCorso = new Promise((risolvi) => risolvi(carica()))
      .then((valore) => {
        tenuto = { valore, il: adesso() }
        return valore
      })
      .finally(() => {
        inCorso = null
      })
    return inCorso
  }
}

module.exports = { inMemoria }
