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

// L'aggiornamento di un locale, in una riga. In corso dice da quanto (il
// workflow dura otto-dieci minuti: chi guarda deve capire che si muove);
// riuscito dice a cosa è arrivato (l'utente, 09/11/2026: «vorrei almeno un
// loading, qualcosa che mi faccia capire che sta succedendo qualcosa»).
export function aggiornamentoDetto(agg, adesso = new Date()) {
  if (!agg?.stato) return null
  const verso = agg.ritorno ? `ritorno a ${agg.ref}` : `aggiornamento a ${agg.ref}`
  if (agg.stato === 'in corso') {
    const minuti = agg.chiesto_il ? Math.max(0, Math.floor((adesso - new Date(agg.chiesto_il)) / 60000)) : null
    return `${verso} in corso${minuti == null ? '' : minuti < 1 ? ' da meno di un minuto' : ` da ${minuti} min`}`
  }
  if (agg.stato === 'riuscito') return `${agg.ritorno ? 'riportato' : 'aggiornato'} a ${agg.versione || agg.ref}`
  return `${verso} fallito${agg.errore ? `: ${agg.errore}` : ''}`
}

// Il run di GitHub Actions citato nell'errore («… GitHub Actions run
// 42666395985»), come link: è lì che si legge perché è fallito.
export function runNellErrore(errore) {
  const m = /run (\d{6,})/.exec(errore || '')
  return m ? `https://github.com/redirect11/drink-regia/actions/runs/${m[1]}` : null
}

// I conti di un'ondata, in parole: solo quello che c'è.
export function contiDetti(r) {
  const parti = [
    [r.riuscito, 'aggiornati'],
    [r['in corso'], 'in corso'],
    [r.fallito, 'falliti'],
    [r['in attesa'], 'in attesa'],
    [r.escluso, 'tornati indietro'],
    // Gli aggiornamenti a scelta (REQ-FLOTTA-020).
    [r.proposto, 'proposti al titolare'],
    [r.saltato, 'saltati dal titolare'],
    [r['non incluso'], 'senza aggiornamenti nel piano'],
  ]
  return parti.filter(([n]) => n > 0).map(([n, p]) => `${n} ${p}`).join(' · ') || '—'
}
