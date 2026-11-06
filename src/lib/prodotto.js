// ── IL NOME DEL PRODOTTO, IN UN POSTO SOLO (docs/flotta.md) ───────────
//
// Lo slug tecnico `drink` sta nei nomi dei progetti e non si cambia; il
// nome visibile sì, e si cambia qui. «Drink» è un segnaposto finché
// l'utente non ne sceglie uno (21/10/2026: il nome non è ancora deciso).

export const SLUG_PRODOTTO = 'drink'

// Il prefisso dei PROGETTI Firebase delle istanze (`drinkpos-<slug>`). Gli
// id dei progetti Google sono globali: `drink-demo` era già di qualcun
// altro (22/10/2026), quindi il prefisso è più lungo dello slug del
// prodotto. La regia è `drink-regia`, creata a parte.
export const PREFISSO_PROGETTI = 'drinkpos'
export const NOME_PRODOTTO = 'Drink'
// Riscritti il 06/11/2026 con i testi della prima pagina (src/i18n).
export const SLOGAN = 'La cassa che regge il venerdì sera, anche senza rete.'
export const DESCRIZIONE =
  'Comande, conti, cassa, menù con QR e magazzino in un’app che ogni locale ha tutta per sé: ' +
  'la sua installazione, i suoi dati, il suo indirizzo. Lavora anche quando cade la rete. ' +
  'Nata al banco di un cocktail bar, con il locale pieno.'

// Il dominio sotto cui nascono le istanze: <slug>.<DOMINIO_ISTANZE>. Da
// confermare col dominio vero del prodotto.
export const DOMINIO_ISTANZE = 'drink.app'

// L'installazione dimostrativa (REQ-FLOTTA-001): un locale neutro, con il
// menù pubblico, che la prima pagina può mostrare.
export const URL_DEMO = 'https://drinkpos-demo.web.app'

// Il contatto del prodotto. Segnaposto sul dominio delle istanze, come il
// dominio: si cambia quando c'è quello vero.
export const EMAIL_CONTATTI = `info@${DOMINIO_ISTANZE}`
