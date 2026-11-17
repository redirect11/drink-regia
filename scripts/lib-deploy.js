// =====================================================================
//  LE FUNCTIONS FALLITE IN UN DEPLOY, dall'uscita di firebase-tools.
//
//  Per scripts/funzioni-fallite.mjs (REQ-FLOTTA-130): il deploy della
//  nascita di un locale, prima di riprovare, cancella le Functions che il
//  tentativo ha lasciato a metà. firebase-tools le elenca così
//  (lib/deploy/functions/release/reporter.js, 15.x):
//
//    Functions deploy had errors with the following functions:
//    \tstaffAdmin(europe-west1)
//    \tcodebase:altra(europe-west1)
//
//  Qui solo la parte pura, che si prova. Il codebase di default non ha
//  prefisso; un altro codebase sì, e la cancellazione vuole solo il nome.
// =====================================================================
const TITOLO = 'Functions deploy had errors with the following functions:'
// Le sequenze di colore del terminale, se l'uscita le ha.
const senzaColori = (testo) => testo.replace(/\u001b\[[0-9;]*m/g, '')

export function funzioniFallite(testo) {
  const righe = senzaColori(String(testo || '')).split(/\r?\n/)
  const fallite = []
  for (let i = 0; i < righe.length; i++) {
    if (!righe[i].includes(TITOLO)) continue
    for (let j = i + 1; j < righe.length; j++) {
      const m = righe[j].match(/^\t(?:[A-Za-z0-9_-]+:)?([A-Za-z0-9_-]+)\(([a-z0-9-]+)\)\s*$/)
      if (!m) break
      fallite.push({ nome: m[1], regione: m[2] })
    }
  }
  // Una sola volta per Function, anche se il titolo compare più volte.
  return [...new Map(fallite.map((f) => [`${f.nome}@${f.regione}`, f])).values()]
}
