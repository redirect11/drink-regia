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
