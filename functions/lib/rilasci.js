'use strict'

// ── I RILASCI A ONDATE, LOGICA PURA (REQ-FLOTTA-012) ───────────────────
//
// «Gli aggiornamenti vanno fatti a ondate [...] Va bene gestiamolo»
// (l'utente, 27/10/2026). Con un progetto per locale, un rilascio di
// tana-drink non si porta a tutti in un colpo: un errore toccherebbe tutti
// i locali insieme. Si va per ondate, nell'ordine:
//   1. prova     le istanze di prova (nostre, senza clienti veri);
//   2. interna   le installazioni interne, come la Tana: se è un locale
//                esistente si aggiorna dal suo repository, e qui si
//                aspetta che riferisca la versione;
//   3. pilota    i locali che hanno accettato di ricevere prima;
//   4. generale  tutti gli altri.
// Un'ondata parte solo quando l'admin la avvia e quella prima è finita
// senza errori. Un aggiornamento fallito ferma il rilascio: si riprova o
// si torna alla versione di prima, poi si riprende.
//
// Un rilascio è un TAG (vX.Y.Z), mai `main`: fra un'ondata e l'altra
// `main` può andare avanti, e i locali finirebbero su versioni diverse.
// Il tag è anche l'id del documento rilasci/{tag}.

const TAG = /^v\d+\.\d+\.\d+$/
const ONDATE = ['prova', 'interna', 'pilota', 'generale']
// I gruppi che l'admin assegna a mano; «interna» viene dall'istanza.
const GRUPPI = ['prova', 'pilota', 'generale']
const APERTI = ['in corso', 'fermo']

class RilascioNonValido extends Error {}

const daFlotta = (ist) => ist?.origine !== 'esistente'

function ondataDi(ist) {
  if (ist?.interna === true || !daFlotta(ist)) return 'interna'
  return GRUPPI.includes(ist?.gruppo_rilascio) ? ist.gruppo_rilascio : 'generale'
}

// Chi riceve il rilascio: le istanze attive. Una chiusa no: la sua app
// è ferma e non serve aggiornarla. Una sospesa sì, così alla
// riattivazione è già allineata.
const partecipa = (ist) => ist?.stato === 'attiva' && ist?.licenza_stato !== 'chiusa'

// Il rilascio nasce con le ondate fotografate in quel momento: chi si
// attiva dopo nasce già con l'ultima versione.
function nuovoRilascio(ref, istanze, { da = null, adesso = new Date() } = {}) {
  if (!TAG.test(String(ref || ''))) throw new RilascioNonValido('Un rilascio è un tag vX.Y.Z di tana-drink, non un ramo.')
  const voci = Object.entries(istanze || {}).filter(([, ist]) => partecipa(ist))
  const ondate = ONDATE.map((nome) => ({
    nome,
    slugs: voci.filter(([, ist]) => ondataDi(ist) === nome).map(([slug]) => slug).sort(),
    avviata_il: null,
  })).filter((o) => o.slugs.length > 0)
  if (!ondate.length) throw new RilascioNonValido('Nessuna istanza attiva a cui portare il rilascio.')
  return { ref, stato: 'in corso', ondata: -1, ondate, creato_il: adesso.toISOString(), creato_da: da, aggiornato_il: adesso.toISOString() }
}

// A che punto è un locale in questo rilascio.
function esitoDi(ist, rilascio) {
  const agg = ist?.aggiornamento
  if (agg?.rilascio === rilascio.ref) {
    // Tornato alla versione di prima: per questo rilascio è fuori.
    if (agg.ritorno) return 'escluso'
    if (['in corso', 'riuscito', 'fallito'].includes(agg.stato)) return agg.stato
  }
  // Un locale esistente pubblica da sé: conta la versione che riferisce.
  if (!daFlotta(ist) && ist?.versione === rilascio.ref) return 'riuscito'
  return 'in attesa'
}

const VUOTO = () => ({ 'in attesa': 0, 'in corso': 0, riuscito: 0, fallito: 0, escluso: 0 })

function contaOndata(ondata, istanze, rilascio) {
  const conti = VUOTO()
  for (const slug of ondata.slugs) conti[esitoDi(istanze?.[slug], rilascio)] += 1
  return conti
}

// Un'ondata è finita quando nessuno aspetta, lavora o ha fallito.
const finita = (c) => c['in attesa'] === 0 && c['in corso'] === 0 && c.fallito === 0

function puoAvanzare(rilascio, istanze) {
  const no = (perche) => ({ ok: false, perche, prossima: null })
  if (!rilascio || !APERTI.includes(rilascio.stato)) return no('Il rilascio non è in corso.')
  if (rilascio.ondata >= 0) {
    const attuale = rilascio.ondate[rilascio.ondata]
    const c = contaOndata(attuale, istanze, rilascio)
    if (c.fallito) return no(`Nell’ondata «${attuale.nome}» ci sono aggiornamenti falliti: riprova o torna alla versione di prima.`)
    if (c['in corso']) return no(`L’ondata «${attuale.nome}» è ancora in corso.`)
    if (c['in attesa']) {
      return no(attuale.nome === 'interna'
        ? 'Le installazioni interne non hanno ancora riferito questa versione: si pubblicano dal loro repository.'
        : `L’ondata «${attuale.nome}» non è finita.`)
    }
  }
  const prossima = rilascio.ondata + 1
  if (prossima >= rilascio.ondate.length) return no('Tutte le ondate sono partite.')
  return { ok: true, perche: null, prossima }
}

// L'ondata successiva parte: il rilascio passa avanti e dice chi lanciare.
// I locali esistenti non si lanciano: si aspetta la loro versione.
function avanzamento(rilascio, istanze, adesso = new Date()) {
  const p = puoAvanzare(rilascio, istanze)
  if (!p.ok) throw new RilascioNonValido(p.perche)
  const ondate = rilascio.ondate.map((o, i) => (i === p.prossima ? { ...o, avviata_il: adesso.toISOString() } : o))
  const daLanciare = ondate[p.prossima].slugs.filter((slug) => daFlotta(istanze?.[slug]) && partecipa(istanze?.[slug]))
  return {
    rilascio: { ...rilascio, ondate, ondata: p.prossima, stato: 'in corso', fermato_perche: null, aggiornato_il: adesso.toISOString() },
    daLanciare,
  }
}

// Dopo ogni esito: un fallimento nell'ondata attuale ferma il rilascio,
// l'ultima ondata finita lo chiude. Ritorna il rilascio da scrivere, o
// null se non cambia.
function dopoEsito(rilascio, istanze, adesso = new Date()) {
  if (!rilascio || !APERTI.includes(rilascio.stato) || rilascio.ondata < 0) return null
  const attuale = rilascio.ondate[rilascio.ondata]
  const c = contaOndata(attuale, istanze, rilascio)
  if (c.fallito && rilascio.stato === 'in corso') {
    const chi = attuale.slugs.filter((s) => esitoDi(istanze?.[s], rilascio) === 'fallito')
    return { ...rilascio, stato: 'fermo', fermato_perche: `Aggiornamento fallito: ${chi.join(', ')}`, aggiornato_il: adesso.toISOString() }
  }
  if (finita(c) && rilascio.ondata === rilascio.ondate.length - 1) {
    return { ...rilascio, stato: 'completato', fermato_perche: null, completato_il: adesso.toISOString(), aggiornato_il: adesso.toISOString() }
  }
  return null
}

// Quello che il backoffice mostra, calcolato qui e scritto nel documento:
// la regola sta in un posto solo.
function conRiepilogo(rilascio, istanze) {
  const p = puoAvanzare(rilascio, istanze)
  return {
    ...rilascio,
    riepilogo: rilascio.ondate.map((o) => ({ nome: o.nome, ...contaOndata(o, istanze, rilascio) })),
    puo_avanzare: p.ok,
    prossima: p.ok ? rilascio.ondate[p.prossima].nome : null,
    perche_fermo: p.ok ? null : p.perche,
  }
}

// Il documento aggiornamento di un'istanza quando parte un aggiornamento.
// La versione di prima si tiene: è il tag a cui tornare se va male.
function aggiornamentoLanciato(ist, ref, { rilascio = null, ritorno = false, adesso = new Date() } = {}) {
  return {
    ref,
    rilascio,
    ritorno: Boolean(ritorno),
    stato: 'in corso',
    chiesto_il: adesso.toISOString(),
    finito_il: null,
    errore: null,
    // Tornando indietro, la «precedente» resta quella di prima del rilascio.
    versione_precedente: ritorno ? ist?.aggiornamento?.versione_precedente ?? null : ist?.versione ?? null,
  }
}

// Il tag a cui tornare dopo un aggiornamento andato male, se c'è.
function versioneDiRitorno(ist) {
  const v = ist?.aggiornamento?.versione_precedente
  return TAG.test(String(v || '')) ? v : null
}

module.exports = {
  TAG,
  ONDATE,
  GRUPPI,
  APERTI,
  RilascioNonValido,
  ondataDi,
  partecipa,
  nuovoRilascio,
  esitoDi,
  contaOndata,
  puoAvanzare,
  avanzamento,
  dopoEsito,
  conRiepilogo,
  aggiornamentoLanciato,
  versioneDiRitorno,
}
