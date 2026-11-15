'use strict'

// ── IL SITO SI PRESENTA ALLA REGIA, LOGICA PURA (REQ-FLOTTA-026) ───────
//
// L'utente, 02/11/2026: «non deve essere il deploy ad avvisare la regia ma
// l'istanza del sito stesso in qualche modo. Cioè regia e il sito custom
// del bar si devono parlare dopo il deploy e si scambiano dati tra loro
// rispetto alle licenze attivazione e etc.»
//
// Al primo avvio di ogni versione l'app chiama la regia (la Function
// `presentazione`) col token di chi ha fatto l'accesso: «sono il progetto
// X, versione Y». Da qualunque deploy arrivi, della regia o di GitHub. La
// regia riconosce il progetto fra le sue istanze, verifica il token con
// quel progetto e si segna la versione. Dopo, la regia parla al sito
// scrivendo la licenza, come sempre. Nessun giro periodico: si chiama una
// volta per versione e, dalla REQ-FLOTTA-112, col codice del dispositivo
// anche a versione invariata, al più una volta al giorno.
//
// tana-drink, 02/11/2026: «l'app non fa accessi anonimi, quindi la
// presentazione parte solo con qualcuno collegato. Su un'installazione
// nuova senza licenza e senza sessione, la schermata «non attivata» copre
// anche la pagina di accesso [...]. La licenza va scritta all'attivazione,
// prima dell'app». Quindi la presentazione NON è l'attivazione: la licenza
// c'è già prima dell'app (scripts/licenza-istanza.mjs nell'attivazione
// della regia; il deploy di tana-drink per la Tana). Se manca lo stesso,
// e un dispositivo ha ancora una sessione aperta, la regia la riscrive.
//
// Non passa nessun dato operativo del locale: identità, versione, licenza.

// Una versione dell'app: v1.10.4, o 1.10.4-beta.2.
const VERSIONE = /^v?\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z.-]{1,20})?$/

// Il codice del dispositivo (REQ-FLOTTA-112): 16 byte casuali in base64url
// senza padding, tenuti dall'app sul dispositivo e slegati da ogni dato del
// locale (tana-drink, 15/11/2026).
const CODICE = /^[A-Za-z0-9_-]{22}$/
// Le app che non mandano il codice (fino alla 1.10.50) contano come un
// dispositivo solo.
const SENZA_CODICE = 'senza_codice'
const GIORNO = 24 * 3600 * 1000
// Un dispositivo che non si presenta da 30 giorni esce dal conto: l'app con
// il codice si ripresenta almeno una volta al giorno, quando la si usa.
const DISPOSITIVO_SCADE = 30 * GIORNO
// Un limite, perché un documento d'istanza non cresca senza fine (tablet
// cambiati, browser puliti: ogni volta un codice nuovo).
const MAX_DISPOSITIVI = 50

// Il corpo della chiamata: { versione, dispositivo? }. Null se la versione
// non va; un codice di forma sbagliata si ignora e la chiamata vale come
// quelle senza codice: non è un motivo per perdere la versione.
function corpoPresentazione(body) {
  const v = String(body?.versione ?? '').trim()
  if (!VERSIONE.test(v)) return null
  const d = body?.dispositivo
  return { versione: v.startsWith('v') ? v : `v${v}`, dispositivo: typeof d === 'string' && CODICE.test(d) ? d : null }
}

// L'ordine delle versioni, come semver: i numeri, poi la beta prima della
// sua uscita, poi le parti della beta (numeri come numeri: beta.2 prima di
// beta.10). Quello di aggiornamenti.js tiene tutte le beta alla pari, e qui
// non basta.
function parti(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(v || ''))
  return m ? { n: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split('.') : [] } : { n: [-1, -1, -1], pre: [] }
}
function confrontaVersioni(a, b) {
  const x = parti(a)
  const y = parti(b)
  for (let i = 0; i < 3; i += 1) if (x.n[i] !== y.n[i]) return x.n[i] - y.n[i]
  if (!x.pre.length || !y.pre.length) return (x.pre.length ? 0 : 1) - (y.pre.length ? 0 : 1)
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i += 1) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    const np = /^\d+$/.test(p)
    const nq = /^\d+$/.test(q)
    if (np && nq && Number(p) !== Number(q)) return Number(p) - Number(q)
    if (np !== nq) return np ? -1 : 1
    if (p !== q) return p < q ? -1 : 1
  }
  return 0
}

// Una presentazione da un canale di anteprima di Firebase Hosting:
// <sito>--<canale>.web.app o .firebaseapp.com. tana-drink li usa solo per
// gli e2e (15/11/2026), e non sono la versione installata del locale. Si
// riconosce dall'Origin della richiesta, che il browser mette da sé; i
// domini propri dei locali non sono mai anteprime.
const ANTEPRIMA = /^[a-z0-9-]+--[a-z0-9-]+\.(?:web\.app|firebaseapp\.com)$/
function daAnteprima(origine) {
  try {
    return ANTEPRIMA.test(new URL(String(origine || '')).hostname)
  } catch {
    return false
  }
}

// Lo stesso dispositivo con la stessa versione si riscrive al più ogni 6
// ore: l'app si ripresenta una volta al giorno, e dieci tablet che si
// aprono insieme dopo un deploy fanno una scrittura a testa, non dieci.
const RISCRIVI_DOPO = 6 * 3600 * 1000
const recente = (voce, versione, adesso) => voce?.versione === versione && adesso.getTime() - Date.parse(voce.il || '') < RISCRIVI_DOPO

// I dispositivi di prima. Un registro senza dispositivi (prima della
// REQ-FLOTTA-112) è il dispositivo senza codice, con la sua data.
function dispositiviDi(p) {
  if (p?.dispositivi && typeof p.dispositivi === 'object') return { ...p.dispositivi }
  return p?.versione ? { [SENZA_CODICE]: { versione: p.versione, il: p.il || p.prima_il || null } } : {}
}

function daRegistrare(prima, { versione, dispositivo = null, anteprima = false } = {}, adesso = new Date()) {
  const p = prima?.presentazione
  if (anteprima) return !recente(p?.anteprima, versione, adesso)
  return !recente(dispositiviDi(p)[dispositivo || SENZA_CODICE], versione, adesso)
}

// Quello che si segna sull'istanza.
// - `dispositivi`: per ogni codice la versione e l'ultima volta; via quelli
//   fermi da 30 giorni, al massimo 50 (esce quello visto meno di recente);
// - `versione`: la più alta fra i dispositivi, non l'ultima arrivata (il
//   14/11 un tablet alla 1.10.40 aveva preso il posto della 1.10.50);
// - `minima`: la più bassa, quella che dice quando si può togliere
//   un'interfaccia deprecata (docs/contratto-regia-app.md);
// - `prima_il`: la prima volta che la versione più alta si è presentata,
//   cioè quando è arrivata davvero al locale;
// - `anteprima`: l'ultima presentazione da un canale di anteprima, a parte.
// Niente «chi»: a presentarsi è un dipendente qualunque del locale, e il
// suo uid è un dato del locale che alla regia non serve (audit del
// 09/11/2026, finding 29; REQ-FLOTTA-051).
function registroPresentazione(prima, { versione, dispositivo = null, anteprima = false, adesso = new Date() } = {}) {
  const p = prima?.presentazione
  const il = adesso.toISOString()
  if (anteprima) return { presentazione: { ...(p || {}), anteprima: { versione, il } } }
  const dispositivi = dispositiviDi(p)
  dispositivi[dispositivo || SENZA_CODICE] = { versione, il }
  const attivi = Object.entries(dispositivi)
    .filter(([, d]) => adesso.getTime() - Date.parse(d?.il || '') <= DISPOSITIVO_SCADE)
    .sort(([, a], [, b]) => String(b.il).localeCompare(String(a.il)))
    .slice(0, MAX_DISPOSITIVI)
  const versioni = attivi.map(([, d]) => d.versione).sort(confrontaVersioni)
  const alta = versioni[versioni.length - 1]
  const stessa = p?.versione === alta
  return {
    presentazione: {
      versione: alta,
      minima: versioni[0],
      il,
      prima_il: stessa ? p.prima_il || p.il || il : il,
      dispositivi: Object.fromEntries(attivi),
      ...(p?.anteprima ? { anteprima: p.anteprima } : {}),
    },
  }
}

// Cosa fare della licenza del sito che si presenta.
// - 'non_dalla_regia': un locale esistente che la licenza la ha per conto
//   suo (la Tana, finché non la si collega);
// - 'non_attiva': un'istanza non ancora attiva, chiusa o eliminata nella
//   regia: non le si scrive niente;
// - 'scrivi': manca, e chi si presenta ha una sessione aperta: la regia la
//   riscrive (l'attivazione l'avrebbe dovuta scrivere prima dell'app);
// - 'presente': c'è già, e la regia la tiene aggiornata da sé.
function cosaFareConLaLicenza(ist, { esiste = false, riceve = true } = {}) {
  if (ist?.licenza_dalla_regia === false) return 'non_dalla_regia'
  if (!riceve) return 'non_attiva'
  return esiste ? 'presente' : 'scrivi'
}

module.exports = {
  VERSIONE,
  CODICE,
  SENZA_CODICE,
  DISPOSITIVO_SCADE,
  MAX_DISPOSITIVI,
  RISCRIVI_DOPO,
  corpoPresentazione,
  confrontaVersioni,
  daAnteprima,
  daRegistrare,
  registroPresentazione,
  cosaFareConLaLicenza,
}
