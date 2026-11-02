// ── LE DUE LINGUE DELLA PRIMA PAGINA (REQ-FLOTTA-002, DESIGN.md §6) ───
//
// L'utente, 29/10/2026: «vorrei che fosse sia in inglese che in
// italiano». L'italiano su `/`, l'inglese su `/en`: un indirizzo per
// lingua, perché Google indicizzi le due pagine (con `hreflang`) e perché
// un link condiviso apra la lingua di chi l'ha mandato. La lingua del
// browser non sposta nessuno: propone l'altra lingua con un avviso. La
// scelta fatta col selettore si ricorda nel browser, e solo quella porta
// da `/` a `/en`. Il resto del sito (registrazione, dashboard, backoffice,
// testi legali) per ora è solo in italiano.

export const LINGUE = ['it', 'en']
export const PREDEFINITA = 'it'
// Il nome di ogni lingua scritto nella lingua stessa, come lo cerca chi la parla.
export const NOMI_LINGUE = { it: 'Italiano', en: 'English' }

const CHIAVE = 'regia.lingua'

export const linguaValida = (l) => LINGUE.includes(l)

// La lingua dell'indirizzo: `/en` e tutto quello che sta sotto è inglese.
// Senza badare alle maiuscole, come React Router: `/EN` apre la pagina
// inglese, e la barra e il piè di pagina devono essere inglesi anche lì.
export const linguaDelPercorso = (percorso = '') => (/^\/en(\/|$)/i.test(String(percorso)) ? 'en' : PREDEFINITA)

export const percorsoDellaLingua = (lingua) => (lingua === 'en' ? '/en' : '/')

// Le lingue preferite del browser, in ordine (navigator.languages; i
// browser vecchi hanno solo navigator.language).
export function lingueDelBrowser(nav = globalThis.navigator) {
  if (Array.isArray(nav?.languages) && nav.languages.length) return [...nav.languages]
  return nav?.language ? [nav.language] : []
}

// La prima lingua del browser che sappiamo parlare; se nessuna, l'italiano.
export function linguaDelBrowser(lingue = []) {
  for (const l of lingue) {
    const base = String(l).toLowerCase().split('-')[0]
    if (linguaValida(base)) return base
  }
  return PREDEFINITA
}

// La preferenza ricordata. localStorage può mancare o rifiutarsi (finestra
// privata, cookie bloccati): allora non c'è preferenza, e la pagina va lo
// stesso.
// La scelta che il browser non ha lasciato salvare resta in memoria, per
// archivio, e vince su quella salvata prima: senza, chi passava a IT con
// l'archivio pieno (o in sola lettura) teneva il vecchio «en» e veniva
// rimandato su /en a ogni visita di `/`.
const nonSalvate = new WeakMap()

export function leggiPreferenza(archivio = globalThis.localStorage) {
  if (archivio && nonSalvate.has(archivio)) return nonSalvate.get(archivio)
  try {
    const v = archivio?.getItem(CHIAVE)
    return linguaValida(v) ? v : null
  } catch {
    return null
  }
}

export function salvaPreferenza(lingua, archivio = globalThis.localStorage) {
  if (!linguaValida(lingua)) return false
  try {
    archivio.setItem(CHIAVE, lingua)
    nonSalvate.delete(archivio)
    return true
  } catch {
    // Almeno non resti la scelta vecchia; e questa vale finché la pagina è aperta.
    try {
      archivio.removeItem(CHIAVE)
    } catch {
      // nemmeno togliere: resta la scelta in memoria
    }
    if (archivio && typeof archivio === 'object') nonSalvate.set(archivio, lingua)
    return false
  }
}

// La lingua da proporre con l'avviso: nessuna se chi legge ha già scelto,
// o se il browser parla la lingua della pagina.
export function linguaDaProporre(lingua, { preferenza = leggiPreferenza(), browser = lingueDelBrowser() } = {}) {
  if (preferenza) return null
  const proposta = linguaDelBrowser(browser)
  return proposta === lingua ? null : proposta
}

// I testi hanno segnaposto `{nome}`; quelli senza valore restano visibili,
// così un valore mancante si nota nella pagina invece di sparire.
export const interpola = (testo, valori = {}) =>
  String(testo).replace(/\{(\w+)\}/g, (m, k) => (k in valori ? String(valori[k]) : m))

export const plurale = (n, { uno, piu }) => interpola(n === 1 ? uno : piu, { n })

// Gli importi del listino: «32,70 €» in italiano, «€32.70» in inglese
// (DESIGN.md §6). Dal listino del 02/11/2026 (DEC-0005) i prezzi hanno i
// centesimi: si scrivono solo se ci sono (82 €, 32,70 €), e sempre a due
// cifre. L'inglese segue la convenzione inglese anche nei decimali (punto
// per i decimali, virgola per le migliaia): «€32,70» sarebbe un ibrido
// che un lettore inglese legge come trentaduemila. Le migliaia a mano,
// come euro() in piani.js: il Node della CI non ha i dati di lingua e
// Intl.NumberFormat non è affidabile lì.
export function importo(n, lingua = PREDEFINITA) {
  const v = Math.round((Number(n) || 0) * 100) / 100
  const centesimi = Math.round(Math.abs(v) * 100)
  const intero = String(Math.trunc(centesimi / 100))
  const cent = centesimi % 100
  const segno = v < 0 ? '-' : ''
  if (lingua === 'en') {
    return `${segno}€${intero.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${cent ? '.' + String(cent).padStart(2, '0') : ''}`
  }
  return `${segno}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${cent ? ',' + String(cent).padStart(2, '0') : ''} €`
}

// <html lang>, titolo, descrizione e i link `hreflang` fra le due versioni
// (DESIGN.md §6: servono a Google). Restituisce la funzione che rimette
// com'era, perché le altre pagine del sito sono in italiano e non hanno
// alternative.
export function applicaLingua(doc, { lingua, titolo, descrizione, origine = '' }) {
  const html = doc.documentElement
  const prima = { lang: html.getAttribute('lang'), titolo: doc.title }
  let meta = doc.head.querySelector('meta[name="description"]')
  const metaNuova = !meta
  if (metaNuova) {
    meta = doc.createElement('meta')
    meta.setAttribute('name', 'description')
    doc.head.appendChild(meta)
  }
  const descrizionePrima = meta.getAttribute('content')
  html.setAttribute('lang', lingua)
  doc.title = titolo
  meta.setAttribute('content', descrizione)
  const alternative = [...LINGUE, 'x-default'].map((hl) => {
    const link = doc.createElement('link')
    link.setAttribute('rel', 'alternate')
    link.setAttribute('hreflang', hl)
    link.setAttribute('href', `${origine}${percorsoDellaLingua(hl === 'x-default' ? PREDEFINITA : hl)}`)
    link.dataset.lingua = 'alternativa'
    doc.head.appendChild(link)
    return link
  })
  return () => {
    alternative.forEach((l) => l.remove())
    if (prima.lang) html.setAttribute('lang', prima.lang)
    else html.removeAttribute('lang')
    doc.title = prima.titolo
    if (metaNuova) meta.remove()
    else meta.setAttribute('content', descrizionePrima)
  }
}
