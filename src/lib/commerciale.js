// ── IL COMMERCIALE, LOGICA PURA (REQ-FLOTTA-041, REQ-FLOTTA-042) ─────────
//
// L'utente, 07/11/2026: «un backoffice per la parte commerciale e una
// dashboard che mi mostra il guadagno, le attivazioni, il traffico e altre
// cose utili. Prendi ispirazione dai vari e-commerce online». Quello che
// un pannello di vendita mostra a chi vende: quanto entra e quanto
// entrerà (incasso del periodo, canone mensile ricorrente), quanti clienti
// e di che tipo, cosa si vende (piani, moduli), il percorso da visitatore a
// pagante, cosa scade e cosa chiede attenzione. Qui si CALCOLA tutto da
// quello che la regia ha già (clienti, istanze, richieste, contatti,
// cassetti AI) più il libro dei movimenti e i contatori del traffico; la
// pagina (Commerciale.jsx) disegna e basta.
//
// Le regole dei numeri, perché non si discutano ogni volta:
// - CANONE MENSILE (MRR): la somma dei canoni di chi paga, IVA esclusa,
//   al netto degli sconti; un piano annuale conta per il suo mensile; il
//   Free, le interne, gli sconti al 100% e chi non è attivo valgono 0.
// - INCASSO: la somma dell'imponibile dei movimenti nel periodo. È quello
//   che è entrato davvero (fatture di Stripe, bonifici registrati, credito
//   AI venduto); gli omaggi non ci sono.
// - CONVERSIONE: paganti su registrati, dall'inizio; non una coorte.

import { PIANI, MODULI, prezzoMensile, prezzoFondatori, FONDATORI } from './piani.js'
import { prezzoConSconto } from './sconti.js'
import { STATI } from './istanze.js'
import { statoCredito } from './ai.js'

export const PERIODI = [
  { id: '7', nome: 'Ultimi 7 giorni', giorni: 7 },
  { id: '30', nome: 'Ultimi 30 giorni', giorni: 30 },
  { id: '90', nome: 'Ultimi 90 giorni', giorni: 90 },
  { id: '365', nome: 'Ultimo anno', giorni: 365 },
]
export const periodoDi = (id) => PERIODI.find((p) => p.id === String(id)) || PERIODI[1]

const alCentesimo = (n) => Math.round((Number(n) || 0) * 100) / 100
const GIORNO_MS = 86400000

// Il giorno a Roma, AAAA-MM-GG, come functions/lib/traffico.js.
export function giornoDi(istante) {
  const d = istante instanceof Date ? istante : new Date(istante)
  if (!Number.isFinite(d.getTime())) return null
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day}`
}

// I giorni del periodo, dal più vecchio a oggi compreso.
export function giorniDelPeriodo(giorni, adesso = new Date()) {
  const out = []
  for (let i = giorni - 1; i >= 0; i -= 1) out.push(giornoDi(new Date(adesso.getTime() - i * GIORNO_MS)))
  return out
}

// ── il canone di un cliente ──

const STATI_CHE_PAGANO = ['attivo', 'in sospeso']

// Il canone mensile di un cliente, al netto di sconti e del prezzo
// Fondatori finché vale; 0 per chi non paga. Le stesse regole della
// dashboard del titolare (Dashboard.jsx), così i due vedono lo stesso numero.
export function canoneMensile(cliente, adesso = new Date()) {
  if (!cliente?.piano || !PIANI[cliente.piano] || PIANI[cliente.piano].gratuito) return 0
  const ab = cliente.abbonamento || {}
  if (!STATI_CHE_PAGANO.includes(ab.stato)) return 0
  if (['interna', 'sconto', 'gratuito'].includes(ab.origine)) return 0
  const f = ab.fondatore
  const scontoFondatore = f?.fino_al && new Date(f.fino_al) > adesso && prezzoFondatori(cliente.piano) != null ? PIANI[cliente.piano].prezzo - prezzoFondatori(cliente.piano) : 0
  return alCentesimo(prezzoConSconto(prezzoMensile(cliente) - scontoFondatore, cliente, adesso))
}

// ── che cliente è ──

export const CLASSI = {
  PAGANTE: 'pagante',
  FREE: 'free',
  GRATIS: 'gratis',
  IN_ATTESA: 'in_attesa',
  FERMO: 'fermo',
  DISDETTO: 'disdetto',
  ELIMINATO: 'eliminato',
}
export const CLASSI_DETTE = {
  pagante: 'Paganti',
  free: 'Free',
  gratis: 'Gratis (interne, sconti al 100%)',
  in_attesa: 'Senza piano o da attivare',
  fermo: 'Fermi (non pagato, sospesi)',
  disdetto: 'Disdetti',
  eliminato: 'Eliminati',
}

// La classe di una riga del backoffice ({ cliente, istanza, richiesta, stato }).
export function classifica(riga) {
  const c = riga?.cliente || {}
  const ab = c.abbonamento || {}
  const licenza = riga?.istanza?.licenza_stato || 'attiva'
  if (riga?.stato === STATI.ELIMINATA) return CLASSI.ELIMINATO
  if (ab.stato === 'disdetto' || licenza === 'chiusa') return CLASSI.DISDETTO
  if (ab.stato === 'non pagato' || licenza === 'sospesa') return CLASSI.FERMO
  if (!c.piano || !ab.stato) return CLASSI.IN_ATTESA
  if (PIANI[c.piano]?.gratuito) return CLASSI.FREE
  if (['interna', 'sconto'].includes(ab.origine)) return CLASSI.GRATIS
  return CLASSI.PAGANTE
}

// ── il riepilogo ──

const dentro = (iso, dal, al) => {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) && t >= dal && t < al
}
const somma = (xs, f) => alCentesimo(xs.reduce((s, x) => s + (Number(f(x)) || 0), 0))
export const variazione = (ora, prima) => (prima > 0 ? Math.round(((ora - prima) / prima) * 100) : ora > 0 ? null : 0)

// Le scadenze dei prossimi giorni: pagamenti a mano, prove, rinnovi Stripe.
function scadenzeProssime(righe, { adesso, entroGiorni = 14 }) {
  const fine = adesso.getTime() + entroGiorni * GIORNO_MS
  const out = []
  for (const r of righe) {
    const c = r.cliente
    const ab = c.abbonamento || {}
    const aggiungi = (tipo, quando, dettaglio = null) => {
      const t = Date.parse(quando || '')
      if (Number.isFinite(t) && t <= fine) out.push({ slug: c.slug, nome: c.nome_locale, tipo, il: new Date(t).toISOString(), scaduta: t < adesso.getTime(), dettaglio })
    }
    if (ab.origine === 'manuale' && ab.stato === 'attivo' && ab.pagato_fino_al) aggiungi('pagamento', `${String(ab.pagato_fino_al).slice(0, 10)}T23:59:59+01:00`)
    if (ab.origine === 'stripe' && STATI_CHE_PAGANO.includes(ab.stato) && ab.rinnovo_il) aggiungi('rinnovo', ab.rinnovo_il)
    for (const [modulo, p] of Object.entries(c.prove || {})) if (p?.scade_il) aggiungi('prova', p.scade_il, MODULI.find((m) => m.id === modulo)?.nome || modulo)
    if (c.sconto?.fino) aggiungi('sconto', `${String(c.sconto.fino).slice(0, 10)}T23:59:59+01:00`, c.sconto.codice)
  }
  return out.sort((a, b) => a.il.localeCompare(b.il))
}

// Il percorso di vendita dai contatori del traffico: viste → registrazioni →
// scelte (free, checkout, contatto, codice) → attivazioni.
function imbutoDi(eventi, viste) {
  const n = (k) => Number(eventi[k]) || 0
  return [
    { passo: 'Viste', quanti: viste },
    { passo: 'Registrazioni', quanti: n('registrazione') },
    { passo: 'Scelta del piano', quanti: n('checkout') + n('contatto') + n('free') + n('codice') },
    { passo: 'Attivazioni chieste', quanti: n('attivazione') },
  ]
}

// Tutto quello che la dashboard mostra, da quello che la regia ha.
//   righe:     le righe del backoffice ({ cliente, istanza, richiesta, cassetto, stato })
//   movimenti: il libro dei movimenti (tutti quelli letti)
//   traffico:  i documenti traffico/{giorno}
//   contatti:  le richieste di contatto
//   fondatori: fondatori/posti (o null)
export function riepilogo({ righe = [], movimenti = [], traffico = [], contatti = [], fondatori = null } = {}, { giorni = 30, adesso = new Date() } = {}) {
  const al = adesso.getTime() + 1
  const dal = al - giorni * GIORNO_MS
  const dalPrima = dal - giorni * GIORNO_MS
  const giorniPeriodo = giorniDelPeriodo(giorni, adesso)
  const nelPeriodo = (iso) => dentro(iso, dal, al)
  const nelPrecedente = (iso) => dentro(iso, dalPrima, dal)

  // I clienti.
  const classi = righe.map((r) => ({ r, classe: classifica(r) }))
  const quanti = (classe) => classi.filter((x) => x.classe === classe).length
  const paganti = classi.filter((x) => x.classe === CLASSI.PAGANTE).map((x) => x.r)
  const nuovi = righe.filter((r) => nelPeriodo(r.cliente?.creato_il)).length
  const nuoviPrima = righe.filter((r) => nelPrecedente(r.cliente?.creato_il)).length
  const istanzeAttive = righe.filter((r) => r.stato === STATI.ATTIVA && (r.istanza?.licenza_stato || 'attiva') === 'attiva').length
  const disdettiNelPeriodo = righe.filter((r) => classifica(r) === CLASSI.DISDETTO && nelPeriodo(r.cliente?.abbonamento?.aggiornato_il)).length

  // I ricavi.
  const canoni = paganti.map((r) => ({ r, canone: canoneMensile(r.cliente, adesso) }))
  const mrr = somma(canoni, (x) => x.canone)
  const movPeriodo = movimenti.filter((m) => nelPeriodo(m.il))
  const movPrima = movimenti.filter((m) => nelPrecedente(m.il))
  const incasso = somma(movPeriodo, (m) => m.importo)
  const incassoPrecedente = somma(movPrima, (m) => m.importo)
  const perTipo = { abbonamento: 0, ricarica_ai: 0, manuale: 0 }
  for (const m of movPeriodo) perTipo[m.tipo] = alCentesimo((perTipo[m.tipo] || 0) + (Number(m.importo) || 0))

  // Il credito AI: quanto ne hanno ancora i locali (un debito verso di
  // loro) e quanto hanno speso questo mese.
  const cassetti = righe.map((r) => statoCredito(r.cassetto, adesso)).filter(Boolean)
  const ai = {
    venduto: perTipo.ricarica_ai,
    creditoResiduo: somma(cassetti, (s) => s.credito),
    spesoMese: somma(cassetti, (s) => s.spesoMese),
    cassetti: cassetti.length,
  }

  // Cosa si vende.
  const perPiano = Object.values(PIANI).map((p) => {
    const suoi = righe.filter((r) => r.cliente?.piano === p.id && [CLASSI.PAGANTE, CLASSI.FREE, CLASSI.GRATIS].includes(classifica(r)))
    return { id: p.id, nome: p.nome, quanti: suoi.length, mrr: somma(suoi, (r) => canoneMensile(r.cliente, adesso)) }
  })
  const perModulo = MODULI.map((m) => ({
    id: m.id,
    nome: m.nome,
    // Comprati a parte (sul Base) e inclusi (nel Completo): due numeri, perché
    // dicono due cose diverse su cosa tira.
    comprati: paganti.filter((r) => (r.cliente.moduli || []).includes(m.id) && !(PIANI[r.cliente.piano]?.include || []).includes(m.id)).length,
    inclusi: paganti.filter((r) => (PIANI[r.cliente.piano]?.include || []).includes(m.id)).length,
    inProva: righe.filter((r) => r.cliente?.prove?.[m.id]?.scade_il && Date.parse(r.cliente.prove[m.id].scade_il) > adesso.getTime()).length,
  }))
  const terminaliInPiu = paganti.reduce((s, r) => s + Math.max(0, (Number(r.cliente.terminali) || 1) - (PIANI[r.cliente.piano]?.terminali || 1)), 0)

  // La conversione, dall'inizio.
  const registrati = righe.filter((r) => classifica(r) !== CLASSI.ELIMINATO).length
  const conPiano = righe.filter((r) => r.cliente?.piano && classifica(r) !== CLASSI.ELIMINATO).length
  const conversione = {
    registrati,
    conPiano,
    paganti: paganti.length,
    tasso: registrati ? Math.round((paganti.length / registrati) * 1000) / 10 : 0,
    free: quanti(CLASSI.FREE),
  }

  // Le serie per giorno.
  const perGiorno = (xs, chiave, valore = () => 1) => {
    const conta = Object.fromEntries(giorniPeriodo.map((g) => [g, 0]))
    for (const x of xs) {
      const g = chiave(x)
      if (g in conta) conta[g] = alCentesimo(conta[g] + (Number(valore(x)) || 0))
    }
    return giorniPeriodo.map((g) => conta[g])
  }
  const trafficoPerGiorno = Object.fromEntries(traffico.map((t) => [t.giorno, t]))
  const serie = {
    giorni: giorniPeriodo,
    incassi: perGiorno(movPeriodo, (m) => giornoDi(m.il), (m) => m.importo),
    registrazioni: perGiorno(righe.filter((r) => nelPeriodo(r.cliente?.creato_il)), (r) => giornoDi(r.cliente.creato_il)),
    viste: giorniPeriodo.map((g) => Number(trafficoPerGiorno[g]?.viste) || 0),
  }

  // Il traffico del periodo.
  const tDocs = giorniPeriodo.map((g) => trafficoPerGiorno[g]).filter(Boolean)
  const sommaMappe = (campo) => {
    const out = {}
    for (const t of tDocs) for (const [k, v] of Object.entries(t[campo] || {})) out[k] = (out[k] || 0) + (Number(v) || 0)
    return out
  }
  const inOrdine = (mappa) => Object.entries(mappa).map(([nome, viste]) => ({ nome, viste })).sort((a, b) => b.viste - a.viste)
  const viste = tDocs.reduce((s, t) => s + (Number(t.viste) || 0), 0)
  const vistePrima = traffico.filter((t) => t.giorno && dentro(`${t.giorno}T12:00:00+01:00`, dalPrima, dal)).reduce((s, t) => s + (Number(t.viste) || 0), 0)
  const eventi = sommaMappe('eventi')
  const trafficoRiepilogo = {
    viste,
    vistePrima,
    perPagina: inOrdine(sommaMappe('pagine')),
    provenienze: inOrdine(sommaMappe('provenienze')),
    lingue: sommaMappe('lingue'),
    eventi,
    imbuto: imbutoDi(eventi, viste),
    giorniConDati: tDocs.length,
  }

  // Cosa chiede attenzione.
  const attenzione = {
    pagamentiFalliti: righe.filter((r) => r.cliente?.abbonamento?.ultimo_fallimento && nelPeriodo(r.cliente.abbonamento.ultimo_fallimento)).map((r) => ({ slug: r.cliente.slug, nome: r.cliente.nome_locale, il: r.cliente.abbonamento.ultimo_fallimento })),
    contattiAperti: contatti.filter((c) => c.stato === 'aperta').length,
    daApprovare: righe.filter((r) => r.stato === STATI.DA_APPROVARE).length,
    attivazioniFallite: righe.filter((r) => r.stato === STATI.ERRORE).length,
    fermi: quanti(CLASSI.FERMO),
  }

  const assegnati = Object.keys(fondatori?.assegnati || {}).length
  return {
    periodo: { giorni, dal: new Date(dal).toISOString(), al: adesso.toISOString() },
    clienti: {
      totale: righe.length,
      nuovi,
      nuoviPrima,
      paganti: paganti.length,
      free: quanti(CLASSI.FREE),
      gratis: quanti(CLASSI.GRATIS),
      inAttesa: quanti(CLASSI.IN_ATTESA),
      fermi: quanti(CLASSI.FERMO),
      disdetti: quanti(CLASSI.DISDETTO),
      disdettiNelPeriodo,
      eliminati: quanti(CLASSI.ELIMINATO),
      istanzeAttive,
    },
    ricavi: {
      mrr,
      arr: alCentesimo(mrr * 12),
      arpu: paganti.length ? alCentesimo(mrr / paganti.length) : 0,
      incasso,
      incassoPrecedente,
      variazione: variazione(incasso, incassoPrecedente),
      iva: somma(movPeriodo, (m) => m.iva),
      lordo: somma(movPeriodo, (m) => m.totale),
      perTipo,
      movimentiNelPeriodo: movPeriodo.length,
    },
    ai,
    perPiano,
    perModulo,
    terminaliInPiu,
    conversione,
    scadenze: scadenzeProssime(righe, { adesso }),
    attenzione,
    fondatori: { posti: FONDATORI.posti, assegnati, liberi: Math.max(0, FONDATORI.posti - assegnati) },
    serie,
    traffico: trafficoRiepilogo,
    ultimiMovimenti: [...movimenti].sort((a, b) => String(b.il).localeCompare(String(a.il))).slice(0, 20),
  }
}

// ── gli abbonamenti, in tabella ──

// Una riga per cliente, con quello che chi vende guarda: classe, piano,
// canone, da quando, fino a quando, quanto ha pagato in tutto.
export function tabellaAbbonamenti(righe = [], movimenti = [], adesso = new Date()) {
  const pagatoDa = {}
  for (const m of movimenti) pagatoDa[m.uid] = alCentesimo((pagatoDa[m.uid] || 0) + (Number(m.importo) || 0))
  return righe
    .map((r) => {
      const c = r.cliente || {}
      const ab = c.abbonamento || {}
      return {
        uid: c.uid,
        slug: c.slug,
        nome: c.nome_locale,
        email: c.email,
        classe: classifica(r),
        piano: c.piano ? PIANI[c.piano]?.nome || c.piano : null,
        moduli: (c.moduli || []).map((id) => MODULI.find((m) => m.id === id)?.nome || id),
        terminali: Number(c.terminali) || 1,
        canone: canoneMensile(c, adesso),
        origine: ab.origine || null,
        stato: ab.stato || null,
        dal: ab.dal || c.creato_il || null,
        fino: ab.pagato_fino_al || ab.pagato_fino || ab.rinnovo_il || null,
        sconto: c.sconto?.codice || null,
        fondatore: Boolean(ab.fondatore?.numero),
        pagato: pagatoDa[c.uid] || 0,
        creato_il: c.creato_il || null,
      }
    })
    .sort((a, b) => b.canone - a.canone || String(a.nome).localeCompare(String(b.nome)))
}

// ── l'esportazione in CSV ──
// Punto e virgola e virgola decimale: è quello che Excel in italiano apre
// senza chiedere niente.
// UNA CELLA CHE COMINCIA COME UNA FORMULA (audit del 09/11/2026, finding
// 27): nome del locale, email e codice sconto li scrivono i clienti, e
// l'admin apre il CSV in Excel, che una cella che comincia con = + - @ (o
// con un tab o un ritorno a capo) la esegue come formula: un nome
// «=HYPERLINK(...)» diventa un link, un «@SUM» una chiamata. Un apostrofo
// davanti la fa restare testo, com'è l'uso in Excel; i numeri veri passano
// prima e non lo prendono. Vale anche dentro le virgolette: Excel la
// formula la valuta lo stesso.
const neutra = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s)
export const cella = (v) => {
  if (v == null) return ''
  if (typeof v === 'number') return String(v).replace('.', ',')
  if (Array.isArray(v)) return `"${neutra(v.join(', ')).replace(/"/g, '""')}"`
  const s = neutra(String(v))
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function csv(righe, colonne) {
  const testa = colonne.map(([nome]) => cella(nome)).join(';')
  const corpo = righe.map((r) => colonne.map(([, prendi]) => cella(typeof prendi === 'function' ? prendi(r) : r[prendi])).join(';'))
  return [testa, ...corpo].join('\r\n')
}
export const COLONNE_ABBONAMENTI = [
  ['Locale', 'nome'],
  ['Identificativo', 'slug'],
  ['Email', 'email'],
  ['Classe', (r) => CLASSI_DETTE[r.classe] || r.classe],
  ['Piano', 'piano'],
  ['Moduli', 'moduli'],
  ['Terminali', 'terminali'],
  ['Canone mensile', 'canone'],
  ['Origine', 'origine'],
  ['Stato', 'stato'],
  ['Dal', (r) => (r.dal ? String(r.dal).slice(0, 10) : '')],
  ['Fino', (r) => (r.fino ? String(r.fino).slice(0, 10) : '')],
  ['Sconto', 'sconto'],
  ['Fondatore', (r) => (r.fondatore ? 'sì' : 'no')],
  ['Pagato in tutto', 'pagato'],
  ['Registrato il', (r) => (r.creato_il ? String(r.creato_il).slice(0, 10) : '')],
]
export const COLONNE_MOVIMENTI = [
  ['Data', (m) => String(m.il || '').slice(0, 10)],
  ['Tipo', 'tipo'],
  ['Locale', 'slug'],
  ['Imponibile', 'importo'],
  ['IVA', 'iva'],
  ['Totale', 'totale'],
  ['Origine', 'origine'],
  ['Riferimento', 'riferimento'],
  ['Descrizione', 'descrizione'],
]
