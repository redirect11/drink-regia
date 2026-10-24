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
  if (!/^https:\/\/[^\s/]+/.test(url)) throw new DatiNonValidi('L’indirizzo dell’app deve cominciare con https://.')
  return { nome, slug, email, progetto, url, terminali, interna: dati?.interna !== false }
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

module.exports = { slugDaNome, DatiNonValidi, datiEsistente, documentiEsistente, scriveLicenza }
