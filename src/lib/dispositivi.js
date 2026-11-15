// I DISPOSITIVI DI UN LOCALE, A PAROLE (REQ-FLOTTA-112). Ogni dispositivo
// si presenta alla regia col suo codice casuale (tana-drink, 15/11/2026), e
// la Function tiene in istanze/{slug}.presentazione.dispositivi la versione
// e l'ultima volta di ognuno. Qui la riga della scheda: quanti sono e quali
// sono indietro rispetto alla versione più alta, il più indietro prima.
// Contano solo quelli visti negli ultimi 30 giorni, come nella Function
// (functions/lib/presentazione.js, DISPOSITIVO_SCADE).

const SCADE = 30 * 24 * 3600 * 1000
const SENZA_CODICE = 'senza_codice'

// Basta l'ordine dei numeri e della beta: serve solo a mettere prima il
// più indietro.
function ordine(a, b) {
  const p = (v) => (/^v?(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(v) || []).slice(1)
  const [x, y] = [p(a), p(b)]
  for (let i = 0; i < 3; i += 1) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) - Number(y[i])
  return (x[3] ? 0 : 1) - (y[3] ? 0 : 1) || String(x[3] || '').localeCompare(String(y[3] || ''), 'en', { numeric: true })
}

export function dispositiviDetti(presentazione, adesso = new Date()) {
  const attivi = Object.entries(presentazione?.dispositivi || {}).filter(([, d]) => adesso.getTime() - Date.parse(d?.il || '') <= SCADE)
  if (!attivi.length) return ''
  const indietro = new Map()
  for (const [codice, d] of attivi) {
    if (d.versione === presentazione.versione) continue
    const g = indietro.get(d.versione) || { quanti: 0, senzaCodice: false }
    g.quanti += 1
    g.senzaCodice ||= codice === SENZA_CODICE
    indietro.set(d.versione, g)
  }
  const detti = [...indietro.entries()]
    .sort(([a], [b]) => ordine(a, b))
    .map(([v, g]) => `${g.quanti} sulla ${v}${g.senzaCodice ? ' (app senza codice)' : ''}`)
  const quanti = `${attivi.length} ${attivi.length === 1 ? 'dispositivo' : 'dispositivi'}`
  return detti.length ? `${quanti} · ${detti.join(', ')}` : quanti
}
