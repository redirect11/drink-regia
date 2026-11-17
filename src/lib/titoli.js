// ── IL TITOLO DI OGNI PAGINA (REQ-FLOTTA-125, punto A; WCAG 2.4.2) ─────
//
// L'audit del 17/11/2026 ha trovato lo stesso <title> (quello di
// index.html) su /registrati, /accedi, /termini, /privacy e su tutte le
// sezioni di dashboard e backoffice: il titolo è la prima cosa che un
// lettore di schermo legge entrando in una pagina, e il nome della scheda
// del browser. Qui, senza React, il titolo di ogni indirizzo; lo mette la
// pagina stessa con <Titolo> (src/components/Titolo.jsx).
//
// Prima la pagina, poi la sezione, in fondo il prodotto: nelle schede
// strette e nei lettori di schermo si legge per primo quello che cambia.
// Le parole sono quelle che la pagina già mostra (il titolo, la voce del
// menù), così titolo e pagina non si smentiscono.
//
// `null` per la prima pagina: lei e l'anteprima del sito chiuso hanno il
// titolo nella loro lingua (applicaLingua, in src/lib/lingua.js).

import { NOME_ESTESO } from './prodotto.js'
import { BASE_TITOLARE, SEZIONI_TITOLARE } from './areaTitolare.js'
import { BASE, SEZIONI, AGGIUNTE } from './backoffice.js'

// Le pagine solo in italiano, col titolo che mostrano.
const PAGINE = {
  '/accedi': 'Accedi',
  '/registrati': 'Registra il tuo locale',
  '/termini': 'Termini di servizio',
  '/privacy': 'Informativa sulla privacy',
  '/accesso': 'Accesso dall’app del locale',
}

export const conProdotto = (...parti) => [...parti, NOME_ESTESO].join(' · ')

export function titoloPagina(percorso) {
  // «/dashboard/» scritto a mano è la stessa pagina di «/dashboard».
  const p = String(percorso || '/').replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/en') return null
  if (PAGINE[p]) return conProdotto(PAGINE[p])
  const [, primo, secondo = '', terzo] = p.split('/')
  if (`/${primo}` === BASE_TITOLARE) {
    // Una sezione che non c'è rimanda alla panoramica (Dashboard.jsx).
    const sezione = SEZIONI_TITOLARE.find((s) => s.id === secondo) || SEZIONI_TITOLARE[0]
    return conProdotto(sezione.nome, 'Dashboard')
  }
  if (`/${primo}` === BASE) {
    const sezione = SEZIONI.find((s) => s.id === secondo)
    if (!sezione) return conProdotto('Backoffice')
    const aggiunta = sezione.id === 'aggiungi' && AGGIUNTE.find((a) => a.id === terzo)
    return aggiunta ? conProdotto(aggiunta.nome, sezione.nome, 'Backoffice') : conProdotto(sezione.nome, 'Backoffice')
  }
  return null
}
