// I CODICI SCONTO NEL SITO (REQ-FLOTTA-028): il prezzo dopo lo sconto e lo
// sconto a parole. Le regole vere stanno nelle Functions
// (functions/lib/sconti.js): qui solo quello che si mostra.

// Lo sconto vale ancora? Illimitato sempre; a tempo fino al suo giorno.
export function scontoAttivo(cliente, adesso = new Date()) {
  const s = cliente?.sconto
  if (!s?.codice || !Number.isFinite(Number(s.percentuale))) return null
  if (s.fino && Date.parse(`${String(s.fino).slice(0, 10)}T23:59:59Z`) < adesso.getTime()) return null
  return s
}

// Il prezzo al mese dopo lo sconto, arrotondato al centesimo.
export function prezzoConSconto(prezzo, cliente, adesso = new Date()) {
  const s = scontoAttivo(cliente, adesso)
  if (!s) return prezzo
  return Math.round(prezzo * (100 - Number(s.percentuale))) / 100
}

// Gli usi di un codice, per l'elenco del backoffice: «3 usi», «3 usi su
// 10», «10 usi su 10, esaurito». Le prenotazioni dei Checkout in corso
// non si contano qui: le conta il server quando decide.
export function usiDetti(codice) {
  const usi = Number(codice?.usi) || 0
  const detti = `${usi} ${usi === 1 ? 'uso' : 'usi'}`
  if (codice?.usi_massimi == null) return detti
  return usi >= codice.usi_massimi ? `${detti} su ${codice.usi_massimi}, esaurito` : `${detti} su ${codice.usi_massimi}`
}

// «TANA-100, 100%, illimitato» o «PROVA-20, 20% fino al 31/12/2026».

export function scontoDetto(cliente, adesso = new Date()) {
  const s = scontoAttivo(cliente, adesso)
  if (!s) return null
  const quanto = `${s.codice}, ${s.percentuale}%`
  return s.fino ? `${quanto} fino al ${new Date(s.fino).toLocaleDateString('it-IT')}` : `${quanto}, illimitato`
}

// ── UN CODICE NUOVO (audit del 09/11/2026, finding 15) ─────────────────
// Almeno 8 caratteri fra lettere maiuscole, cifre e trattini, con almeno 2
// cifre: la regola che conta è quella delle Functions
// (functions/lib/sconti.js, CODICE_NUOVO), qui la stessa per dirlo prima di
// chiamare. I testi sono gli stessi, parola per parola (tests/sconti.test.js).
export const CODICE_VALIDO = /^(?=(?:[A-Z-]*[0-9]){2})[A-Z0-9][A-Z0-9-]{7,23}$/
export const REGOLA_CODICE = 'Codice non valido: almeno 8 caratteri fra lettere maiuscole, cifre e trattini, con almeno 2 cifre.'
export const LIMITE_PER_IL_CENTO = 'Un codice al 100% ha sempre un limite di usi.'

// Il codice che il backoffice propone: cinque lettere, un trattino, quattro
// cifre (BARCA-4821), dal generatore casuale del browser. Senza O e I, che
// si confondono con 0 e 1 quando si dettano al telefono. L'admin lo può
// cambiare, ma la regola vale anche per il suo.
const LETTERE = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export function generaCodice(casuali = (n) => crypto.getRandomValues(new Uint32Array(n))) {
  const r = casuali(9)
  const lettere = [...r.slice(0, 5)].map((x) => LETTERE[x % LETTERE.length]).join('')
  const cifre = [...r.slice(5, 9)].map((x) => String(x % 10)).join('')
  return `${lettere}-${cifre}`
}
