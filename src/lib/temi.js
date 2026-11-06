// IL CATALOGO DEI TEMI NEL BACKOFFICE (REQ-FLOTTA-032): le basi e gli stili
// che l'app sa disegnare, e i colori delle basi per l'anteprima. Le basi
// sono quelle di THEME_PRESETS in src/lib/themes.js di tana-drink, coi loro
// sette colori; se l'app ne cambia uno, si cambia anche qui. Le regole vere
// (cosa si può pubblicare) stanno nelle Functions (functions/lib/temi.js).

import catalogo from '../../functions/temi/catalogo.json'
import catalogoStili from '../../functions/temi/stili.json'

export const CHIAVI_COLORE = [
  { key: '--bg', label: 'Sfondo' },
  { key: '--bg-2', label: 'Sfondo secondario' },
  { key: '--card', label: 'Card' },
  { key: '--accent', label: 'Colore accento' },
  { key: '--accent-2', label: 'Accento secondario' },
  { key: '--text', label: 'Testo' },
  { key: '--muted', label: 'Testo attenuato' },
]

const colori = (bg, bg2, card, accent, accent2, text, muted) => ({
  '--bg': bg,
  '--bg-2': bg2,
  '--card': card,
  '--accent': accent,
  '--accent-2': accent2,
  '--text': text,
  '--muted': muted,
})

export const BASI = [
  { id: 'tana-scuro', nome: 'Tana scuro', colori: colori('#0e0e15', '#15151f', '#1a1a26', '#e52e71', '#f5b94a', '#f5f5f7', '#9b9ba8') },
  { id: 'notte-blu', nome: 'Notte blu', colori: colori('#0a1220', '#101a2c', '#152238', '#3b82f6', '#38bdf8', '#eef2f8', '#8fa3bf') },
  { id: 'catppuccin', nome: 'Catppuccin scuro', colori: colori('#11111b', '#181825', '#1e1e2e', '#cba6f7', '#fab387', '#cdd6f4', '#a6adc8') },
  { id: 'catppuccin-chiaro', nome: 'Catppuccin chiaro', colori: colori('#dce0e8', '#e6e9ef', '#eff1f5', '#8839ef', '#fe640b', '#4c4f69', '#6c6f85') },
  { id: 'pico-scuro', nome: 'Pico scuro', colori: colori('#13171f', '#1a1f28', '#181c25', '#01aaff', '#01aaff', '#c2c7d0', '#7b8495') },
  { id: 'pico-chiaro', nome: 'Pico chiaro', colori: colori('#fbfbfc', '#ffffff', '#ffffff', '#0172ad', '#0172ad', '#373c44', '#646b79') },
  { id: 'chiaro', nome: 'Chiaro', colori: colori('#f2f2f7', '#ffffff', '#ffffff', '#c2185b', '#a8790a', '#17171f', '#5c5c6b') },
  { id: 'crema', nome: 'Crema', colori: colori('#f6f1e7', '#fffaf0', '#fffdf7', '#a3552b', '#8c6d1f', '#241d12', '#6f6353') },
]

// Gli stili del menù per tutti. «notte» è esclusivo della Tana: non c'è.
export const STILI = [
  { id: 'classico', nome: 'Classico' },
  { id: 'lavagna', nome: 'Lavagna' },
  { id: 'deco', nome: 'Deco' },
  { id: 'riviera', nome: 'Riviera' },
  { id: 'giornale', nome: 'Giornale' },
]

// Gli stili in licenza (REQ-FLOTTA-039): gli esclusivi della Tana, che
// l'admin assegna dalla scheda del locale e la licenza nomina in `temi`.
// Gli id sono quelli `inLicenza` di src/lib/stileMenu.js in tana-drink.
export const ESCLUSIVI = [
  { id: 'notte', nome: 'Notte' },
  { id: 'meraviglie', nome: 'Meraviglie' },
  { id: 'carte', nome: 'Carte' },
]

// Gli stili a ricetta del repository (REQ-FLOTTA-034): un tema li può
// usare come quelli dell'app. Nel backoffice si vedono e si ritirano.
export const STILI_RICETTA = catalogoStili.stili.map((s) => ({ ...s, stato: s.stato || 'pubblicato', dal_repository: true }))

export function stiliDaMostrare(nelDatabase) {
  const ids = new Set((nelDatabase || []).map((s) => s.id))
  return [...(nelDatabase || []), ...STILI_RICETTA.filter((s) => !ids.has(s.id))]
}

// Il nome di uno stile: dell'app, in licenza, o a ricetta.
export const nomeStile = (id) => [...STILI, ...ESCLUSIVI, ...STILI_RICETTA].find((s) => s.id === id)?.nome || id

export const STATI_DETTI = { bozza: 'Bozza', pubblicato: 'Pubblicato', ritirato: 'Ritirato' }

// LA STRUTTURA DEL MENÙ (REQ-FLOTTA-040): come il menù dei clienti è diviso
// in pagine. Gli id sono quelli di `impaginazione` nella ricetta degli
// stili (functions/lib/stili.js).
export const IMPAGINAZIONI = [
  { id: 'unica', nome: 'Tutto in una pagina' },
  { id: 'per-categoria', nome: 'Una pagina per categoria' },
  { id: 'per-macro-categoria', nome: 'Una pagina per macro categoria' },
]
export const nomeImpaginazione = (id) => IMPAGINAZIONI.find((i) => i.id === id)?.nome || id

// Chi ha fatto un tema su misura.
export const ORIGINI_DETTE = { mockup: 'dal tuo mockup', fornitore: 'dal fornitore' }

// I sette colori di un tema: quelli della base, con sopra i ritocchi.
export function coloriDelTema(tavolozza) {
  const base = BASI.find((b) => b.id === tavolozza?.base) || BASI[0]
  return { ...base.colori, ...(tavolozza?.colori || {}) }
}

// I temi del repository (REQ-FLOTTA-033): pubblicati col deploy. Nel
// backoffice si vedono insieme a quelli del database; uno con lo stesso id
// nel database vince (è così che si ritirano).
export const TEMI_DEL_REPOSITORY = catalogo.temi.map((t) => ({ ...t, stato: t.stato || 'pubblicato', dal_repository: true }))

export function temiDaMostrare(nelDatabase) {
  const ids = new Set((nelDatabase || []).map((t) => t.id))
  return [...(nelDatabase || []), ...TEMI_DEL_REPOSITORY.filter((t) => !ids.has(t.id))]
}

export const temaVuoto = () => ({ id: '', nome: '', descrizione: '', tavolozza: { base: 'tana-scuro', colori: {} }, stile: 'classico' })
