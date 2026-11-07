// =====================================================================
//  I LOCALI DI PROVA DELLA REGIA DI TEST, LOGICA PURA (REQ-DEV-004).
//
//  L'utente, 07/11/2026: «sulla versione di test dovremmo creare un po' di
//  utenti che abbiano varie attivazioni del prodotto (gratuito, completo,
//  mix di moduli, basic, etc...) e poi fare testing e2e con playwright per
//  i casi d'uso comuni». Qui si DESCRIVONO le persone e i documenti che
//  ognuna ha nella regia: un titolare per ogni situazione che il prodotto
//  conosce (Free, Base, Completo, moduli in più, Fondatore, sconto al 100%,
//  modulo in prova, moroso, disdetto, in attesa di autorizzazione, senza
//  piano, eliminato), più l'amministratore, i contatti, i codici sconto, un
//  cassetto AI con i suoi consumi, il libro dei movimenti e il traffico
//  degli ultimi giorni. Lo script scripts/semina-test.mjs scrive; questo
//  file si prova (tests/semina.test.js) e lo leggono i test Playwright
//  (e2e/), così le persone sono le stesse da tutte e due le parti.
//
//  Ogni documento porta `semina: true`: è il segno che lo script usa per
//  ripulire (--pulisci) senza toccare i locali veri del test (prova-bar, la
//  Tana di test, la demo).
//
//  LE ISTANZE sono registrate come «esistenti» con `licenza_dalla_regia:
//  false` (functions/lib/esistente.js): i loro progetti Google non
//  esistono, e così la regia non prova mai a scrivergli una licenza.
//  Sospendi, Chiudi e gli aggiornamenti non si provano su di loro.
// =====================================================================

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const listino = require('../functions/piani.json')

// Il dominio delle email di prova: `.example` è riservato e non consegna.
export const DOMINIO_SEMINA = 'semina.example'
export const emailDi = (slug) => `${slug}@${DOMINIO_SEMINA}`
export const uidDi = (slug) => `semina-${slug}`
export const ADMIN = { slug: 'admin-semina', nome: 'Amministrazione di prova' }

const GIORNO_MS = 86400000
const giorni = (adesso, n) => new Date(adesso.getTime() + n * GIORNO_MS)
const iso = (adesso, n) => giorni(adesso, n).toISOString()
const giorno = (adesso, n) => iso(adesso, n).slice(0, 10)

// LE PERSONE. Per ognuna: lo slug (è anche l'email e l'uid), il nome del
// locale, il piano e la situazione dell'abbonamento, l'istanza. `caso`
// dice a parole cosa rappresenta: i test Playwright scelgono da lì.
export const PERSONE = [
  { slug: 'free-angolo', nome: 'L’Angolo', caso: 'free', piano: 'free', abbonamento: { origine: 'gratuito' }, istanza: { profilo: 'leggero' }, registrato: -20 },
  { slug: 'base-tre-terminali', nome: 'Bar Tre Terminali', caso: 'base-manuale', piano: 'base', terminali: 4, abbonamento: { origine: 'manuale', pagato_fino_al: 300 }, registrato: -45 },
  { slug: 'completo-stripe', nome: 'Osteria del Completo', caso: 'completo-stripe', piano: 'completo', terminali: 3, abbonamento: { origine: 'stripe', pagato_fino: 25 }, cassetto: true, registrato: -70 },
  { slug: 'base-mix-moduli', nome: 'Caffè Mix', caso: 'base-moduli', piano: 'base', moduli: ['magazzino', 'statistiche'], abbonamento: { origine: 'stripe', pagato_fino: 12, intervallo: 'anno' }, registrato: -30 },
  { slug: 'fondatore-base', nome: 'Pub dei Fondatori', caso: 'fondatore', piano: 'base', abbonamento: { origine: 'stripe', pagato_fino: 18, fondatore: 1 }, registrato: -60 },
  { slug: 'sconto-cento', nome: 'Circolo Omaggio', caso: 'sconto-100', piano: 'completo', abbonamento: { origine: 'sconto' }, sconto: { codice: 'SEMINA-100', percentuale: 100, durata_mesi: null }, registrato: -15 },
  { slug: 'in-prova-magazzino', nome: 'Trattoria in Prova', caso: 'prova-modulo', piano: 'base', abbonamento: { origine: 'manuale', pagato_fino_al: 300 }, prove: { magazzino: 60 }, registrato: -8 },
  { slug: 'moroso-sospeso', nome: 'Bar Moroso', caso: 'moroso', piano: 'base', abbonamento: { origine: 'manuale', pagato_fino_al: -20, stato: 'non pagato' }, istanza: { licenza_stato: 'sospesa', licenza_motivo: 'pagamento non ricevuto', licenza_per: 'pagamento' }, registrato: -90 },
  { slug: 'disdetto-chiuso', nome: 'Enoteca Disdetta', caso: 'disdetto', piano: 'completo', abbonamento: { origine: 'stripe', stato: 'disdetto', aggiornato: -5 }, istanza: { licenza_stato: 'chiusa', licenza_motivo: 'abbonamento disdetto', licenza_per: 'pagamento' }, registrato: -120 },
  { slug: 'da-approvare', nome: 'Bistrot da Approvare', caso: 'da-approvare', piano: 'base', abbonamento: { origine: 'manuale', pagato_fino_al: 300 }, richiesta: 'da approvare', registrato: -2 },
  { slug: 'senza-piano', nome: 'Locale Senza Piano', caso: 'senza-piano', registrato: -1 },
  { slug: 'eliminato-chiuso', nome: 'Chiosco Eliminato', caso: 'eliminato', piano: 'base', abbonamento: { origine: 'manuale', stato: 'disdetto' }, istanza: { stato: 'eliminata' }, registrato: -150 },
]
export const persona = (caso) => PERSONE.find((p) => p.caso === caso)

const PROVINCE = ['NA', 'MI', 'RM', 'TO', 'BO', 'FI']
const TIPI = ['bar', 'ristorante', 'pub', 'altro']

// Il documento clienti/{uid} di una persona, schema 2, con i blocchi della
// registrazione pieni (così le regole dell'allowlist non la bloccano) e
// l'abbonamento nella sua situazione.
export function documentoCliente(p, adesso) {
  const i = PERSONE.indexOf(p)
  const creato = iso(adesso, p.registrato)
  const sede = { via: `Via della Prova ${i + 1}`, cap: '80035', citta: 'Nola', provincia: PROVINCE[i % PROVINCE.length] }
  const base = {
    uid: uidDi(p.slug),
    versione_schema: 2,
    email: emailDi(p.slug),
    nome_locale: p.nome,
    slug: p.slug,
    locale: { tipo: TIPI[i % TIPI.length], indirizzo: sede, telefono: `081 000 ${String(100 + i)}`, sito: '' },
    fatturazione: { ragione_sociale: `${p.nome} S.r.l.`, partita_iva: String(10000000000 + i * 7919).slice(0, 11), codice_fiscale: '', pec: `${p.slug}@pec.${DOMINIO_SEMINA}`, sdi: '0000000', sede_legale: sede },
    referente: { nome: 'Titolare', cognome: p.nome.split(' ').pop(), ruolo: 'titolare', telefono: '' },
    consensi: { termini_il: creato, privacy_il: creato, marketing: i % 2 === 0 },
    creato_il: creato,
    semina: true,
  }
  if (!p.piano) return base
  const ab = p.abbonamento || {}
  const abbonamento = { stato: ab.stato || 'attivo', origine: ab.origine, dal: creato }
  if (ab.pagato_fino_al != null) abbonamento.pagato_fino_al = giorno(adesso, ab.pagato_fino_al)
  if (ab.pagato_fino != null) {
    abbonamento.pagato_fino = iso(adesso, ab.pagato_fino)
    abbonamento.rinnovo_il = abbonamento.pagato_fino
    abbonamento.ultimo_pagamento = iso(adesso, ab.pagato_fino - 30)
  }
  if (ab.origine === 'stripe') {
    abbonamento.stripe_customer = `cus_semina_${p.slug}`
    abbonamento.stripe_subscription = `sub_semina_${p.slug}`
    abbonamento.intervallo = ab.intervallo || 'mese'
  }
  if (ab.fondatore) abbonamento.fondatore = { numero: ab.fondatore, il: creato, fino_al: iso(adesso, p.registrato + listino.fondatori.mesi * 30) }
  if (ab.aggiornato != null) abbonamento.aggiornato_il = iso(adesso, ab.aggiornato)
  const doc = { ...base, piano: p.piano, moduli: p.moduli || [], terminali: p.terminali || 1, abbonamento }
  if (p.sconto) doc.sconto = { ...p.sconto, dal: creato, fino: null }
  if (p.prove) doc.prove = Object.fromEntries(Object.entries(p.prove).map(([m, g]) => [m, { dal: creato, scade_il: iso(adesso, g) }]))
  return doc
}

// Il documento istanze/{slug}: un locale esistente che la regia non
// governa, nella situazione della persona. Null per chi non è attivo.
export function documentoIstanza(p, adesso) {
  if (!p.piano || p.richiesta) return null
  const extra = p.istanza || {}
  return {
    slug: p.slug,
    uid: uidDi(p.slug),
    progetto: `drinkpos-${p.slug}`,
    url: `https://${p.slug}.drink.app`,
    stato: extra.stato || 'attiva',
    origine: 'esistente',
    interna: false,
    aggiornamenti_dalla_regia: false,
    licenza_dalla_regia: false,
    cliente: p.slug,
    build: {},
    profilo: extra.profilo || 'completo',
    versione: 'v1.10.4',
    errore: null,
    registrata_il: iso(adesso, p.registrato + 1),
    aggiornata_il: iso(adesso, Math.min(-1, p.registrato + 2)),
    ...(extra.licenza_stato ? { licenza_stato: extra.licenza_stato, licenza_motivo: extra.licenza_motivo || null, licenza_per: extra.licenza_per || 'admin', licenza_dal: iso(adesso, Math.max(p.registrato + 3, -3)) } : {}),
    ...(extra.stato === 'eliminata' ? { eliminazione: { stato: 'eliminata', richiedente: 'titolare', il: iso(adesso, -10), eliminata_il: iso(adesso, -10) } } : {}),
    semina: true,
  }
}

// La richiesta di attivazione, per chi ne ha una in sospeso. Mai «in coda»:
// quello stato fa partire il workflow della flotta (avviaProvisioning).
export function documentoRichiesta(p, adesso) {
  if (!p.richiesta) return null
  if (p.richiesta === 'in coda') throw new Error('Una richiesta di prova non può essere «in coda»: farebbe partire un’attivazione vera.')
  return { uid: uidDi(p.slug), slug: p.slug, nome_locale: p.nome, piano: p.piano, moduli: p.moduli || [], stato: p.richiesta, chiesta_il: iso(adesso, p.registrato + 1), chiesta_da: 'titolare', semina: true }
}

// Il cassetto AI di chi ce l'ha, con qualche consumo e due ricariche.
export function documentiCassetto(p, adesso) {
  if (!p.cassetto) return null
  const mese = iso(adesso, 0).slice(0, 7)
  const consumi = [
    { il: iso(adesso, -1), mese, tipo: 'descrizione', modello: listino.ai.modello, token_input: 1200, token_output: 180, fallback: false, costo_microeuro: 9000, esito: 'ok' },
    { il: iso(adesso, -3), mese, tipo: 'fattura', modello: listino.ai.modello, token_input: 8000, token_output: 1500, fallback: false, costo_microeuro: 52000, esito: 'ok' },
    { il: iso(adesso, -6), mese, tipo: 'tema', modello: listino.ai.modello, token_input: 4000, token_output: 2500, fallback: false, costo_microeuro: 60000, esito: 'ok' },
  ].map((c) => ({ ...c, semina: true }))
  const speso = consumi.reduce((s, c) => s + c.costo_microeuro, 0)
  const ricariche = [
    { id: `cs_semina_${p.slug}_1`, il: iso(adesso, -40), importo_microeuro: 25_000_000, origine: 'stripe', pacchetto: 'ai-25', nota: null, da: null, semina: true },
    { id: `omaggio-semina-${p.slug}`, il: iso(adesso, -10), importo_microeuro: 5_000_000, origine: 'omaggio', pacchetto: null, nota: 'Benvenuto', da: uidDi(ADMIN.slug), semina: true },
  ]
  const ricaricato = ricariche.reduce((s, r) => s + r.importo_microeuro, 0)
  return {
    cassetto: {
      slug: p.slug,
      uid: uidDi(p.slug),
      attivo: true,
      interna: false,
      credito_microeuro: ricaricato - speso - 2_000_000,
      tetto_mensile_microeuro: listino.ai.tetto_mensile_predefinito * 1_000_000,
      mese,
      speso_mese_microeuro: speso,
      creato_il: iso(adesso, p.registrato + 2),
      ultima_ricarica_il: ricariche[1].il,
      ultimo_uso_il: consumi[0].il,
      semina: true,
    },
    consumi,
    ricariche,
  }
}

// Le richieste di contatto: una aperta (senza-piano vuole il Base), una
// gestita (da-approvare, lavorata), una dall'app per un modulo.
export function documentiContatti(adesso) {
  const aperta = (p, scelta, nota, n) => ({ uid: uidDi(p.slug), email: emailDi(p.slug), nome_locale: p.nome, slug: p.slug, scelta, telefono: '333 1234567', nota, codice: null, stato: 'aperta', chiesta_il: iso(adesso, n), semina: true })
  const senza = persona('senza-piano')
  const daApprovare = persona('da-approvare')
  const base = persona('base-manuale')
  return [
    { id: uidDi(senza.slug), ...aperta(senza, { piano: 'base', moduli: ['menu_tavoli'], terminali: 2, intervallo: 'mese' }, 'Vorrei partire entro il mese, chiamatemi la mattina.', -1) },
    { id: uidDi(daApprovare.slug), ...aperta(daApprovare, { piano: 'base', moduli: [], terminali: 1, intervallo: 'mese' }, null, -3), stato: 'gestita', gestita_il: iso(adesso, -2), gestita_da: emailDi(ADMIN.slug) },
    { id: `${uidDi(base.slug)}_staff`, ...aperta(base, { piano: 'base', moduli: ['staff'], terminali: 4, intervallo: 'mese' }, 'Dall’app: aggiungere Personale e ore.', -2) },
  ]
}

// I codici sconto: uno di benvenuto a tempo, e il 100% del Circolo.
export function documentiSconti(adesso) {
  return [
    { codice: 'BENVENUTO-20', percentuale: 20, durata_mesi: 3, usi_massimi: 50, usi: 2, descrizione: 'Benvenuto: tre mesi al 20%', attivo: true, creato_il: iso(adesso, -50), creato_da: emailDi(ADMIN.slug), semina: true },
    { codice: 'SEMINA-100', percentuale: 100, durata_mesi: null, usi_massimi: 1, usi: 1, descrizione: 'Il circolo: tutto gratis', attivo: true, creato_il: iso(adesso, -16), creato_da: emailDi(ADMIN.slug), semina: true },
    { codice: 'ESTATE-10', percentuale: 10, durata_mesi: 1, usi_massimi: 10, usi: 10, descrizione: 'Finita', attivo: false, creato_il: iso(adesso, -100), creato_da: emailDi(ADMIN.slug), semina: true },
  ]
}

const alCentesimo = (n) => Math.round(n * 100) / 100
const conIva = (importo) => {
  const iva = alCentesimo((importo * listino.iva) / 100)
  return { importo: alCentesimo(importo), iva, totale: alCentesimo(importo + iva) }
}
const prezzoDi = ({ piano, moduli = [], terminali = 1 }) => {
  const p = listino.piani[piano]
  const inclusi = new Set(p.include)
  const extra = listino.moduli.filter((m) => moduli.includes(m.id) && !inclusi.has(m.id)).reduce((s, m) => s + m.prezzo, 0)
  return alCentesimo(p.prezzo + extra + Math.max(0, terminali - (p.terminali || 1)) * listino.terminale_in_piu)
}

// IL LIBRO DEI MOVIMENTI degli ultimi mesi: per chi paga con Stripe una
// fattura al mese dalla registrazione (la prima con l'attivazione), per chi
// paga a mano un bonifico ogni tre mesi, la ricarica AI del cassetto.
export function movimentiDiProva(adesso) {
  const out = []
  for (const p of PERSONE) {
    const ab = p.abbonamento || {}
    if (!p.piano || !['stripe', 'manuale'].includes(ab.origine) || p.istanza?.stato === 'eliminata' || p.richiesta) continue
    const canone = ab.fondatore ? listino.fondatori.prezzi[p.piano] ?? prezzoDi(p) : prezzoDi(p)
    const mensile = ab.intervallo === 'anno' ? alCentesimo(canone * listino.annuale.mensilita) : canone
    const passo = ab.intervallo === 'anno' ? 365 : ab.origine === 'stripe' ? 30 : 90
    // Chi non paga più (moroso, disdetto) ha smesso un mese fa.
    const ultimo = (ab.stato || 'attivo') === 'attivo' ? 0 : -25
    for (let n = 1, g = p.registrato; g <= ultimo; g += passo, n += 1) {
      const attivazione = n === 1 && !ab.fondatore ? listino.attivazione : 0
      const uid = uidDi(p.slug)
      if (ab.origine === 'stripe') {
        out.push({ id: `fattura-in_semina_${p.slug}_${n}`, il: iso(adesso, g), tipo: 'abbonamento', uid, slug: p.slug, ...conIva(mensile + attivazione), origine: 'stripe', riferimento: `in_semina_${p.slug}_${n}`, descrizione: n === 1 ? `Attivazione; Piano ${p.piano}` : `Piano ${p.piano}`, periodo: { dal: iso(adesso, g), al: iso(adesso, g + passo) }, semina: true })
      } else {
        out.push({ id: `manuale-semina-${p.slug}-${n}`, il: iso(adesso, g), tipo: 'manuale', uid, slug: p.slug, ...conIva(mensile * 3 + attivazione), origine: 'manuale', riferimento: `manuale-semina-${p.slug}-${n}`, descrizione: `Bonifico: ${p.piano} per tre mesi`, periodo: null, da: emailDi(ADMIN.slug), semina: true })
      }
    }
    if (p.cassetto) {
      out.push({ id: `ricarica-cs_semina_${p.slug}_1`, il: iso(adesso, -40), tipo: 'ricarica_ai', uid: uidDi(p.slug), slug: p.slug, ...conIva(25), origine: 'stripe', riferimento: `cs_semina_${p.slug}_1`, descrizione: 'Credito AI ai-25', periodo: null, semina: true })
    }
  }
  return out.sort((a, b) => a.il.localeCompare(b.il))
}

// Un generatore deterministico: gli stessi numeri a ogni semina, così i
// test e lo screenshot non cambiano da un giorno all'altro (per lo stesso
// giorno di semina).
function casuale(seme) {
  let s = seme >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

// IL TRAFFICO degli ultimi 60 giorni: più viste nel fine settimana, qualche
// registrazione e qualche passo della vendita.
export function trafficoDiProva(adesso, giorniIndietro = 60) {
  const r = casuale(20261107)
  const out = []
  for (let g = -giorniIndietro + 1; g <= 0; g += 1) {
    const data = giorni(adesso, g)
    const festivo = [0, 5, 6].includes(data.getUTCDay())
    const viste = Math.round(18 + r() * 30 + (festivo ? 25 : 0) + Math.max(0, g + giorniIndietro) * 0.4)
    const en = Math.round(viste * (0.08 + r() * 0.1))
    const registrati = Math.round(viste * 0.22)
    const google = Math.round(viste * (0.25 + r() * 0.2))
    const instagram = Math.round(viste * (0.1 + r() * 0.15))
    const eventi = {}
    if (r() < 0.45) eventi.registrazione = 1 + Math.floor(r() * 2)
    if (eventi.registrazione && r() < 0.6) eventi[r() < 0.5 ? 'checkout' : 'contatto'] = 1
    if (r() < 0.25) eventi.free = 1
    if (r() < 0.3) eventi.attivazione = 1
    out.push({
      giorno: data.toISOString().slice(0, 10),
      viste,
      pagine: { home: viste - registrati - en, en, registrati: Math.round(registrati * 0.6), accedi: Math.round(registrati * 0.25), dashboard: registrati - Math.round(registrati * 0.6) - Math.round(registrati * 0.25) },
      lingue: { it: viste - en, en },
      provenienze: { diretto: viste - google - instagram, google_com: google, instagram_com: instagram },
      eventi,
      semina: true,
    })
  }
  return out
}

// I posti Fondatori assegnati di prova: solo quelli delle persone.
export const postiFondatori = (adesso) =>
  Object.fromEntries(
    PERSONE.filter((p) => p.abbonamento?.fondatore).map((p) => [uidDi(p.slug), { numero: p.abbonamento.fondatore, il: iso(adesso, p.registrato), slug: p.slug, semina: true }])
  )

// Un progetto su cui seminare: mai la produzione.
export const PROGETTO_DI_TEST = /-test$/
export function progettoAmmesso(id) {
  return typeof id === 'string' && PROGETTO_DI_TEST.test(id) && id !== 'drink-regia'
}

// Una password di prova che passa i controlli del sito (10 caratteri con
// una cifra): la genera lo script e la scrive in .env.e2e, mai a schermo.
export function passwordDiProva(byteCasuali) {
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const lettere = [...byteCasuali].map((b) => alfabeto[b % alfabeto.length]).join('')
  return `Semina${lettere.slice(0, 10)}7`
}
