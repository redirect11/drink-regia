'use strict'

// ── LE COMUNICAZIONI AUTOMATICHE AL TITOLARE, LOGICA PURA ──────────────
// (REQ-FLOTTA-027)
//
// L'utente, 02/11/2026: «Gestire anche le comunicazioni automatiche di
// reminder di pagamenti, pagamento riuscito etc.» Decisioni dello stesso
// giorno: le email di Stripe (ricevuta, pagamento fallito, rinnovo in
// arrivo, carta in scadenza) si accendono in Stripe; la regia manda i
// promemoria dei pagamenti a mano (7 giorni prima di «pagato fino al» e il
// giorno dopo, quando comincia la grazia), il «pagamento ricevuto» di un
// pagamento a mano, e il locale tornato al Free o riattivato. Il locale
// fermo lo dice il primo avviso della conservazione dei dati
// (lib/conservazione.js), che porta già la data e cosa fare.
//
// Le email vanno nella coda `mail` (estensione Trigger Email di Firebase,
// con l'SMTP di Resend): qui solo destinatario, oggetto e testo.
//
// E una all'admin: la richiesta di cambio degli orari di servizio
// (REQ-FLOTTA-095, più sotto).

const { GIORNI, NOMI_GIORNI, giornoDetto } = require('./orari-servizio.js')

const GIORNO = 86400000
const ms = (iso) => Date.parse(iso || '')
const data = (iso) => new Date(iso).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long', year: 'numeric' })
// L'articolo davanti a una data: «il 30 novembre», «l'8 dicembre», «il 1°
// dicembre»; «al 30», «all'8», «al 1°». `prep`: '' (il), 'al', 'dal'.
function conArticolo(iso, prep = '') {
  const d = data(iso)
  const giorno = Number(d.split(' ')[0])
  const testo = giorno === 1 ? d.replace(/^1 /, '1° ') : d
  const elide = giorno === 8 || giorno === 11
  if (!prep) return elide ? `l'${testo}` : `il ${testo}`
  return elide ? `${prep}l'${testo}` : `${prep} ${testo}`
}
const posta = (cliente, oggetto, righe) => (cliente?.email ? { to: cliente.email, message: { subject: oggetto, text: righe.join('\n') } } : null)
const nome = (cliente) => cliente?.nome_locale || 'Il tuo locale'

// ── I PROMEMORIA DI UN PAGAMENTO A MANO ──────────────────────────────
// Due: 7 giorni prima di «pagato fino al» e il giorno dopo, alle 9 di Roma
// (le 8 UTC: d'estate le 10, va bene lo stesso). Con Stripe li manda Stripe.
const PROMEMORIA = [
  { tipo: 'prima', giorni: -7 },
  { tipo: 'scaduto', giorni: 1 },
]

function orariPromemoria(cliente, adesso = new Date()) {
  const ab = cliente?.abbonamento
  if (ab?.origine !== 'manuale' || ab.stato !== 'attivo' || !Number.isFinite(ms(ab.pagato_fino_al))) return []
  const giorno = ms(String(ab.pagato_fino_al).slice(0, 10))
  return PROMEMORIA.map((p) => ({ tipo: p.tipo, il: new Date(giorno + p.giorni * GIORNO + 8 * 3600000).toISOString() })).filter((p) => ms(p.il) > adesso.getTime())
}

// Quale promemoria è questo compito: null se nel frattempo il pagamento è
// arrivato (la data è cambiata) o il piano non è più a mano.
function promemoriaDelCompito(cliente, il) {
  return orariPromemoria(cliente, new Date(0)).find((p) => p.il === il)?.tipo ?? null
}

// Un promemoria già mandato non si rimanda: la chiave sta sul cliente.
const chiavePromemoria = (cliente, tipo) => `${String(cliente?.abbonamento?.pagato_fino_al || '').slice(0, 10)}:${tipo}`
const giaMandato = (cliente, chiave) => (cliente?.avvisi_pagamento || []).includes(chiave)

function emailPromemoria(cliente, tipo, { validaFino = null } = {}) {
  const fino = cliente.abbonamento.pagato_fino_al
  if (tipo === 'prima') {
    return posta(cliente, `${nome(cliente)}: l'abbonamento è pagato fino ${conArticolo(fino, 'al')}`, [
      'Buongiorno,',
      '',
      `l'abbonamento di ${nome(cliente)} è pagato fino ${conArticolo(fino, 'al')}. Per continuare senza interruzioni, rinnova il pagamento entro quella data come concordato, o scrivici.`,
    ])
  }
  return posta(cliente, `${nome(cliente)}: il pagamento dell'abbonamento è scaduto`, [
    'Buongiorno,',
    '',
    `il periodo pagato dell'abbonamento di ${nome(cliente)} è finito ${conArticolo(fino)}.${validaFino ? ` L'app continua a funzionare fino ${conArticolo(validaFino, 'al')}: senza un pagamento entro quel giorno si ferma.` : ''}`,
    '',
    'Se hai già pagato, ignora questo messaggio: lo registriamo appena lo riceviamo.',
  ])
}

// ── IL PAGAMENTO RICEVUTO (a mano; con Stripe c'è la ricevuta di Stripe) ──
function emailPagamentoRicevuto(cliente) {
  return posta(cliente, `${nome(cliente)}: pagamento ricevuto`, ['Buongiorno,', '', `abbiamo registrato il pagamento: l'abbonamento di ${nome(cliente)} è pagato fino ${conArticolo(cliente.abbonamento.pagato_fino_al, 'al')}. Grazie.`])
}

// ── IL LOCALE CHE CAMBIA PER IL PAGAMENTO ────────────────────────────
// 'ripiega' (al Free), 'riattiva' e 'ripristina' (si torna a lavorare).
function emailStato(cliente, azione) {
  if (azione === 'ripiega') {
    return posta(cliente, `${nome(cliente)}: il locale è passato al piano Free`, [
      'Buongiorno,',
      '',
      `poiché l'abbonamento di ${nome(cliente)} non risulta pagato, il locale è passato al piano Free: l'app continua a funzionare con i limiti del Free, e i dati restano tutti.`,
      '',
      'Per riavere il piano di prima basta riattivare l\'abbonamento dalla tua area clienti.',
    ])
  }
  if (azione === 'riattiva' || azione === 'ripristina') {
    return posta(cliente, `${nome(cliente)}: il locale è di nuovo attivo`, [
      'Buongiorno,',
      '',
      `il pagamento è arrivato: ${nome(cliente)} è di nuovo attivo con il suo piano${azione === 'riattiva' ? ', e la cancellazione dei dati è annullata' : ''}.`,
    ])
  }
  return null
}

// ── ALL'ADMIN: LA RICHIESTA DI CAMBIO DEGLI ORARI (REQ-FLOTTA-095) ────
// Daniele, 13/11/2026: «A me arriva solo la richiesta, poi rispondo io a
// mano al momento». Una email per richiesta, col locale, gli orari di
// prima e dopo e il motivo. Al titolare nessuna email con la decisione: la
// legge nella sua area, e la risposta gliela dà l'admin.

// Gli indirizzi dell'admin: gli account col claim admin (quelli con cui si
// entra nel backoffice), attivi e con l'email. Così nel codice, che è in un
// repository pubblico, non c'è nessun indirizzo.
function indirizziAdmin(utenti) {
  const indirizzi = (utenti || []).filter((u) => u?.customClaims?.admin === true && !u.disabled && u.email).map((u) => String(u.email).toLowerCase())
  return [...new Set(indirizzi)].sort()
}

const dataEOra = (iso) => `${data(iso)}, ${new Date(iso).toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })}`

function emailRichiestaOrari(cliente, richiesta, destinatari) {
  if (!richiesta || !destinatari?.length) return null
  const locale = cliente?.nome_locale || cliente?.slug || 'Un locale'
  const righe = GIORNI.map((id) => {
    const prima = giornoDetto(richiesta.prima?.[id])
    const dopo = giornoDetto(richiesta.giorni?.[id])
    return `${NOMI_GIORNI[id]}: ${prima === dopo ? `${prima} (uguale)` : `${prima} → ${dopo}`}`
  })
  return {
    to: destinatari,
    message: {
      subject: `${locale} chiede di cambiare gli orari di servizio`,
      text: [
        `${locale}${cliente?.slug ? ` (${cliente.slug})` : ''} chiede di cambiare gli orari di servizio.`,
        `Titolare: ${cliente?.email || 'email non indicata'}`,
        `Chiesta il: ${dataEOra(richiesta.chiesta_il)}`,
        `Motivo: «${richiesta.motivo}»`,
        '',
        'Orari di adesso → orari chiesti:',
        ...righe,
        '',
        'La richiesta si approva o si rifiuta dal backoffice, nella scheda del locale (blocco Titolare). Al titolare non parte nessuna email: la risposta gliela dai tu.',
      ].join('\n'),
    },
  }
}

// L'id del documento nella coda: viene dalla richiesta, così la stessa
// richiesta non manda due email (accodaUnaVolta). Null senza una data.
function idEmailRichiestaOrari(uid, richiesta) {
  const quando = ms(richiesta?.chiesta_il)
  return uid && Number.isFinite(quando) ? `orari_${uid}_${quando}` : null
}

// Un'email nella coda una volta sola: il documento si crea solo se non
// c'è (Firestore risponde ALREADY_EXISTS, codice 6). True se è entrata.
// Il database arriva da fuori, come in orari-servizio.js (cambiaOrari).
async function accodaUnaVolta(db, id, documento) {
  if (!id || !documento) return false
  try {
    await db.collection('mail').doc(id).create(documento)
    return true
  } catch (e) {
    if (e?.code === 6 || /already exists/i.test(String(e?.message || ''))) return false
    throw e
  }
}

module.exports = { conArticolo, PROMEMORIA, orariPromemoria, promemoriaDelCompito, chiavePromemoria, giaMandato, emailPromemoria, emailPagamentoRicevuto, emailStato, indirizziAdmin, emailRichiestaOrari, idEmailRichiestaOrari, accodaUnaVolta }
