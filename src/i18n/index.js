// I testi della prima pagina per lingua (DESIGN.md §6). Una lingua che non
// c'è torna all'italiano, la predefinita.
import it from './home.it.js'
import en from './home.en.js'

export const TESTI = { it, en }
export const testi = (lingua) => TESTI[lingua] || it
