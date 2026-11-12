// Le stampanti del locale nella richiesta (REQ-FLOTTA-081): lo stesso
// elenco delle Functions, e lo stesso modo di dirle nel backoffice.
import elenco from '../../functions/stampanti.json'

export const GRUPPI_NON_FISCALI = elenco.non_fiscali
export const FISCALI = elenco.fiscali
export const NESSUNA = 'nessuna'
export const NON_SO = 'non_so'
export const ALTRA = 'altra'

// Per il titolare, che legge di sé: niente «non lo sa».
export function stampantiPerIlTitolare(s) {
  if (!s?.non_fiscale || !s?.fiscale) return null
  const nf = s.non_fiscale.scelta === ALTRA ? s.non_fiscale.altra : s.non_fiscale.scelta === NESSUNA ? 'nessuna per ora' : s.non_fiscale.scelta
  const rt = s.fiscale.scelta === ALTRA ? s.fiscale.altra : s.fiscale.scelta === NON_SO ? 'da indicare' : s.fiscale.scelta
  return `Stampante: ${nf} · Registratore telematico: ${rt}`
}

export function stampantiDette(s) {
  if (!s?.non_fiscale || !s?.fiscale) return null
  const nf = s.non_fiscale.scelta === ALTRA ? s.non_fiscale.altra : s.non_fiscale.scelta === NESSUNA ? 'non ancora' : s.non_fiscale.scelta
  const rt = s.fiscale.scelta === ALTRA ? s.fiscale.altra : s.fiscale.scelta === NON_SO ? 'non lo sa' : s.fiscale.scelta
  return `Stampante: ${nf} · RT: ${rt}`
}
