// ── UN LOCALE CHE ESISTE GIÀ, SENZA PROVISIONING (REQ-AI-003) ──────────
//
// Decisione dell'utente del 24/10/2026: la Tana «passi per il cassetto del
// nostro sito prima o poi, senza rompere niente ovviamente». La Tana ha
// già il suo progetto (`tana-drink`) e la sua app: nella regia entra come
// cliente esistente, con piano completo, e nessuna richiesta di
// attivazione (il workflow di provisioning non deve mai toccarla).
//
// SENZA ROMPERE NIENTE vuol dire tre cose, scritte nei documenti:
// - `interna: true` sull'istanza: la sospensione automatica dei morosi la
//   salta (sospensione.js), e un credito AI finito ferma solo l'AI;
// - `licenza_dalla_regia: false`: la regia non scrive `settings/bar.licenza`
//   nel progetto della Tana (né Sospendi né il piano che cambia), finché
//   qualcuno non la collega apposta;
// - il cassetto AI nasce vuoto: finché l'installazione non ha la sua
//   chiave della regia, lì le funzioni AI restano spente come oggi.

const SLUG = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/
// Gli id dei progetti Google hanno la stessa forma degli slug.
const PROGETTO = SLUG
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Lo slug dal nome, come nella registrazione (src/lib/clienti.js) e in
// creaCliente: minuscole, senza accenti, trattini.
function slugDaNome(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 30)
    .replace(/-+$/g, '')
}

class DatiNonValidi extends Error {}

// UN LOCALE ESISTENTE AGGIORNATO DALLA REGIA (REQ-FLOTTA-018, l'utente il
// 30/10/2026: «io farei la A»). Di norma un locale esistente pubblica da
// sé, dal suo repository. Con `aggiornamenti_dalla_regia` lo aggiorna la
// regia come gli altri, col workflow della flotta, ma sul SUO progetto.
// Servono due cose che per un locale della flotta vengono dallo slug: la
// cartella in clienti/ di tana-drink (la Tana è `tana`, troppo corto per
// essere uno slug della regia) e le chiavi pubbliche della build che il
// progetto non sa dire da sé (notifiche, App Check, Analytics). Sono
// pubbliche: finiscono comunque nell'app pubblicata, non sono segreti.
const CARTELLA = /^[a-z][a-z0-9-]{1,29}$/
const CHIAVI_BUILD = ['VITE_FIREBASE_MEASUREMENT_ID', 'VITE_FIREBASE_VAPID_KEY', 'VITE_RECAPTCHA_SITE_KEY']
const VALORE_BUILD = /^[A-Za-z0-9_-]{1,200}$/
// I progetti della regia non sono mai un locale: un errore di battitura
// pubblicherebbe l'app dei locali sopra il sito.
const PROGETTI_DELLA_REGIA = ['drink-regia', 'drink-regia-test']

function gestioneEsistente(dati, { slug }) {
  const cliente = String(dati?.cliente || '').trim() || slug
  if (!CARTELLA.test(cliente)) throw new DatiNonValidi(`Cartella del cliente «${cliente}» non valida: minuscole, cifre e trattini.`)
  const build = {}
  for (const [chiave, v] of Object.entries(dati?.build || {})) {
    if (!CHIAVI_BUILD.includes(chiave)) throw new DatiNonValidi(`La chiave «${chiave}» non è una di quelle della build.`)
    const valore = String(v ?? '').trim()
    if (!valore) continue
    if (!VALORE_BUILD.test(valore)) throw new DatiNonValidi(`Il valore di ${chiave} non è valido.`)
    build[chiave] = valore
  }
  return { aggiornamenti_dalla_regia: dati?.aggiornamenti_dalla_regia === true, cliente, build }
}

// I dati controllati: { nome_locale, email, progetto, url, slug? }.
function datiEsistente(dati) {
  const nome = String(dati?.nome_locale || '').trim().slice(0, 80)
  const slug = String(dati?.slug || '').trim() || slugDaNome(nome)
  const email = String(dati?.email || '').trim().toLowerCase()
  const progetto = String(dati?.progetto || '').trim()
  const url = String(dati?.url || '').trim().replace(/\/$/, '')
  const terminali = Math.max(1, Math.min(20, Math.floor(Number(dati?.terminali) || 2)))
  if (nome.length < 2) throw new DatiNonValidi('Serve il nome del locale.')
  if (!SLUG.test(slug)) throw new DatiNonValidi(`Identificativo «${slug}» non valido: minuscole, cifre e trattini, da 6 a 30 caratteri.`)
  if (!EMAIL.test(email)) throw new DatiNonValidi('Email del titolare non valida.')
  if (!PROGETTO.test(progetto)) throw new DatiNonValidi(`Progetto Firebase «${progetto}» non valido.`)
  if (PROGETTI_DELLA_REGIA.includes(progetto)) throw new DatiNonValidi(`«${progetto}» è un progetto della regia, non di un locale.`)
  if (!/^https:\/\/[^\s/]+/.test(url)) throw new DatiNonValidi('L’indirizzo dell’app deve cominciare con https://.')
  return { nome, slug, email, progetto, url, terminali, interna: dati?.interna !== false, gestione: gestioneEsistente(dati, { slug }) }
}

// I tre documenti: clienti/{uid}, istanze/{slug} e il cassetto ai/{slug}
// lo fa nuovoCassetto (ai.js). Nessun documento in richieste/: è quello
// che fa partire il provisioning, e qui non deve partire niente.
function documentiEsistente(d, { uid, adesso = new Date() }) {
  const ora = adesso.toISOString()
  return {
    cliente: {
      uid,
      versione_schema: 2,
      email: d.email,
      nome_locale: d.nome,
      slug: d.slug,
      locale: { tipo: 'altro', indirizzo: {}, telefono: '', sito: d.url },
      fatturazione: {},
      referente: {},
      consensi: { termini_il: null, privacy_il: null, marketing: false, nota: 'locale esistente registrato dall’amministratore' },
      piano: 'completo',
      moduli: [],
      terminali: d.terminali,
      abbonamento: { stato: 'attivo', origine: d.interna ? 'interna' : 'manuale', dal: ora },
      interna: d.interna,
      esistente: true,
      creato_da_admin: true,
      creato_il: ora,
    },
    istanza: {
      slug: d.slug,
      uid,
      progetto: d.progetto,
      url: d.url,
      stato: 'attiva',
      origine: 'esistente',
      interna: d.interna,
      licenza_dalla_regia: false,
      ...d.gestione,
      errore: null,
      registrata_il: ora,
      aggiornata_il: ora,
    },
  }
}

// La regia scrive la licenza nell'istanza? Sì per quelle nate dal
// provisioning (il campo manca: è il comportamento di sempre), no per
// quelle registrate come esistenti finché non le si collega.
const scriveLicenza = (istanza) => istanza?.licenza_dalla_regia !== false

module.exports = { slugDaNome, DatiNonValidi, datiEsistente, documentiEsistente, scriveLicenza, gestioneEsistente, CHIAVI_BUILD }
