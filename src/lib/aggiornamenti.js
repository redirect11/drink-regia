// ── GLI AGGIORNAMENTI OBBLIGATORI O A SCELTA, NEL SITO (REQ-FLOTTA-020) ─
//
// Le regole stanno nelle Functions (functions/lib/aggiornamenti.js), che
// scrivono sull'istanza `regola_aggiornamenti`, la proposta e l'avviso:
// qui solo le parole con cui la dashboard e il backoffice li dicono.

export const MODALITA = [
  { id: 'obbligatori', nome: 'Automatici' },
  { id: 'a_scelta', nome: 'A scelta del titolare' },
]

const NOME_MODALITA = Object.fromEntries(MODALITA.map((m) => [m.id, m.nome]))

// La regola di un locale, in una riga: «Automatici», «A scelta del
// titolare», «Solo gli obbligatori (piano Free)».
export function regolaDetta(regola) {
  if (!regola) return null
  if (regola.inclusi === false) return `Solo gli obbligatori (${regola.motivo === 'free' ? 'piano Free' : 'abbonamento non pagato'})`
  return NOME_MODALITA[regola.modalita] || null
}

// Perché il piano non comprende gli aggiornamenti, detto al titolare.
export function percheNonInclusi(motivo) {
  if (motivo === 'free') return 'Il piano Free non comprende gli aggiornamenti: arrivano solo le correzioni di sicurezza e di compatibilità. Con un piano a pagamento ricevi anche le novità.'
  return 'L’abbonamento non risulta pagato: il locale lavora col piano Free e riceve solo le correzioni di sicurezza e di compatibilità. Quando il pagamento torna in regola, riprendono anche le novità.'
}

// La proposta di un locale, per il backoffice: «v1.11.0 proposta», «v1.11.0
// saltata il 2/11/2026».
export function propostaDetta(p) {
  if (!p?.attesa) return null
  return p.saltata_il ? `${p.tag} saltata il ${new Date(p.saltata_il).toLocaleDateString('it-IT')}` : `${p.tag} proposta al titolare`
}

// Le note di una versione sono il Markdown del CHANGELOG di tana-drink:
// titoli `##`, sottotitoli `###`, voci `-`. Niente libreria per così poco:
// blocchi semplici, che React mostra senza HTML grezzo.
export function blocchiDelleNote(md) {
  const blocchi = []
  for (const riga of String(md || '').split('\n')) {
    const t = riga.trim()
    if (!t || t === '---') continue
    if (t.startsWith('### ')) blocchi.push({ tipo: 'sotto', testo: t.slice(4) })
    else if (t.startsWith('## ')) blocchi.push({ tipo: 'titolo', testo: t.slice(3) })
    else if (/^[-*] /.test(t)) blocchi.push({ tipo: 'voce', testo: t.slice(2) })
    else blocchi.push({ tipo: 'testo', testo: t })
  }
  return blocchi
}

// Il testo senza i segni del Markdown in linea (**, `, i link).
export const senzaSegni = (s) =>
  String(s || '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
