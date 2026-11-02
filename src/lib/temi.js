// IL CATALOGO DEI TEMI NEL BACKOFFICE (REQ-FLOTTA-032): le basi e gli stili
// che l'app sa disegnare, e i colori delle basi per l'anteprima. Le basi
// sono quelle di THEME_PRESETS in src/lib/themes.js di tana-drink, coi loro
// sette colori; se l'app ne cambia uno, si cambia anche qui. Le regole vere
// (cosa si può pubblicare) stanno nelle Functions (functions/lib/temi.js).

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

export const STATI_DETTI = { bozza: 'Bozza', pubblicato: 'Pubblicato', ritirato: 'Ritirato' }

// I sette colori di un tema: quelli della base, con sopra i ritocchi.
export function coloriDelTema(tavolozza) {
  const base = BASI.find((b) => b.id === tavolozza?.base) || BASI[0]
  return { ...base.colori, ...(tavolozza?.colori || {}) }
}

export const temaVuoto = () => ({ id: '', nome: '', descrizione: '', tavolozza: { base: 'tana-scuro', colori: {} }, stile: 'classico' })
