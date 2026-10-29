// ── I RILASCI A ONDATE NEL BACKOFFICE (REQ-FLOTTA-012) ─────────────────
//
// Le regole stanno nelle Functions (functions/lib/rilasci.js), che
// scrivono nel documento del rilascio anche il riepilogo: qui solo le
// parole con cui il backoffice lo dice.

export const NOMI_ONDATE = {
  prova: 'Istanze di prova',
  interna: 'Installazioni interne',
  pilota: 'Locali pilota',
  generale: 'Tutti gli altri',
}

export const GRUPPI = [
  { id: 'generale', nome: 'Generale' },
  { id: 'pilota', nome: 'Pilota' },
  { id: 'prova', nome: 'Prova' },
]

export const TAG = /^v\d+\.\d+\.\d+$/

export const rilascioAperto = (rilasci) => (rilasci || []).find((r) => r.stato === 'in corso' || r.stato === 'fermo') || null

// L'aggiornamento di un locale, in una riga.
export function aggiornamentoDetto(agg) {
  if (!agg?.stato) return null
  const verso = agg.ritorno ? `ritorno a ${agg.ref}` : `aggiornamento a ${agg.ref}`
  if (agg.stato === 'in corso') return `${verso} in corso`
  if (agg.stato === 'riuscito') return null
  return `${verso} fallito${agg.errore ? `: ${agg.errore}` : ''}`
}

// I conti di un'ondata, in parole: solo quello che c'è.
export function contiDetti(r) {
  const parti = [
    [r.riuscito, 'aggiornati'],
    [r['in corso'], 'in corso'],
    [r.fallito, 'falliti'],
    [r['in attesa'], 'in attesa'],
    [r.escluso, 'tornati indietro'],
  ]
  return parti.filter(([n]) => n > 0).map(([n, p]) => `${n} ${p}`).join(' · ') || '—'
}
