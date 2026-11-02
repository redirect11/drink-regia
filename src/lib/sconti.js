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

// «TANA-100, 100%, illimitato» o «PROVA-20, 20% fino al 31/12/2026».
export function scontoDetto(cliente, adesso = new Date()) {
  const s = scontoAttivo(cliente, adesso)
  if (!s) return null
  const quanto = `${s.codice}, ${s.percentuale}%`
  return s.fino ? `${quanto} fino al ${new Date(s.fino).toLocaleDateString('it-IT')}` : `${quanto}, illimitato`
}
