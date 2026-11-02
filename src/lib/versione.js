// LA VERSIONE DEL SITO (REQ-DEV-002), a parole. L'utente, 02/11/2026: «a
// che versione del backoffice siamo? Dove vedo la versione?». Sul test il
// deploy parte da un ramo, e prima il piè di pagina diceva solo «develop»:
// ora dice la versione di package.json, il ramo e il commit. In produzione
// parte da un tag, e basta il tag.
//
// `versione`: il tag (vX.Y.Z) se il deploy parte da un tag, se no quella di
// package.json; `ramo` e `commit` li mette il deploy (deploy.yml).
export function versioneDetta({ versione, ramo = '', commit = '' } = {}) {
  const v = versione || 'v?'
  const pezzi = [v]
  if (ramo && ramo !== v) pezzi.push(ramo)
  if (commit) pezzi.push(String(commit).slice(0, 7))
  return pezzi.join(' · ')
}
