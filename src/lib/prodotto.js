// ── IL NOME DEL PRODOTTO, IN UN POSTO SOLO (docs/flotta.md) ───────────
//
// Lo slug tecnico `drink` sta nei nomi dei progetti e dei repository e non
// si cambia; il nome visibile sì, e si cambia qui. «Drink» era il
// segnaposto dal 21/10/2026; il 09/11/2026 l'utente ha scelto il nome
// vero: «Lime – SmartOrders», col logo della fetta di lime che sembra un
// grafico a torta (src/components/Logo.jsx, public/favicon.svg).

export const SLUG_PRODOTTO = 'drink'

// Il prefisso dei PROGETTI Firebase delle istanze (`drinkpos-<slug>`). Gli
// id dei progetti Google sono globali: `drink-demo` era già di qualcun
// altro (22/10/2026), quindi il prefisso è più lungo dello slug del
// prodotto. La regia è `drink-regia`, creata a parte.
export const PREFISSO_PROGETTI = 'drinkpos'
// Il nome, la qualifica che lo accompagna nel marchio e il nome per esteso
// (il <title>, i documenti).
export const NOME_PRODOTTO = 'Lime'
export const QUALIFICA = 'SmartOrders'
export const NOME_ESTESO = `${NOME_PRODOTTO} – ${QUALIFICA}`
// Il sottotitolo del marchio: cosa fa, in una riga (i testi in due lingue
// stanno in src/i18n, piede.sottotitolo; questo è quello italiano, per
// index.html e per chi non ha i testi).
export const SOTTOTITOLO = 'Comande, cassa e gestione del locale, in un’app sola.'
// Lo slogan scelto dall'utente il 07/11/2026 con i testi della prima
// pagina (src/i18n): la categoria e il percorso del servizio.
export const SLOGAN = 'Il gestionale del tuo locale, dalla comanda alla cassa.'
export const DESCRIZIONE =
  'Comande dal tavolo e dal banco, conti e cassa, menù con QR, magazzino, statistiche, ore e paghe del personale: ' +
  'tutto il gestionale di un bar o di un ristorante in un’app sola, scritta nel cocktail bar che la usa ogni sera. ' +
  'Ogni locale ha la sua installazione, con i suoi dati e il suo indirizzo, e lavora anche senza rete.'

// Il dominio sotto cui nascono le istanze: <slug>.<DOMINIO_ISTANZE>. Da
// confermare col dominio vero del prodotto.
export const DOMINIO_ISTANZE = 'drink.app'

// L'installazione dimostrativa (REQ-FLOTTA-001): un locale neutro, con il
// menù pubblico, che la prima pagina può mostrare.
export const URL_DEMO = 'https://drinkpos-demo.web.app'

// Il contatto del prodotto. Segnaposto sul dominio delle istanze, come il
// dominio: si cambia quando c'è quello vero.
export const EMAIL_CONTATTI = `info@${DOMINIO_ISTANZE}`
