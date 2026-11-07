# Il commerciale: il libro dei movimenti, il traffico, la dashboard

Scritto il 07/11/2026 (REQ-FLOTTA-041, REQ-FLOTTA-042). L'utente: «ho
bisogno anche di un backoffice per la parte commerciale e una dashboard
che mi mostra il guadagno, le attivazioni, il traffico e altre cose utili.
Prendi ispirazione dai vari e-commerce online».

## Cosa mostra un pannello di vendita, e cosa mostra il nostro

Un pannello di un negozio online (Shopify, WooCommerce) mette in cima
quattro numeri col confronto sul periodo prima, poi gli andamenti, poi
cosa si vende, poi il percorso del visitatore, poi quello che chiede
attenzione, e in fondo gli ordini. Qui la stessa struttura, con le parole
di un abbonamento:

| Nel negozio | Nella regia |
|---|---|
| Vendite del periodo | Incasso del periodo: l'imponibile dei movimenti |
| Ricavo ricorrente | Canone mensile ricorrente (MRR), l'annuo, il canone per cliente |
| Ordini | Movimenti: fatture Stripe, ricariche AI, pagamenti a mano |
| Clienti nuovi | Registrati nel periodo, app attive |
| Sessioni | Viste del sito (senza cookie non si contano i visitatori) |
| Prodotti più venduti | Per piano e per modulo (comprato a parte, incluso, in prova) |
| Imbuto di conversione | Viste → registrazioni → scelte del piano → attivazioni chieste |
| Provenienze | Il dominio di chi ci ha mandato, e le pagine più viste |
| Da gestire | Contatti aperti, attivazioni da autorizzare, fallite, locali fermi, pagamenti falliti, scadenze a 14 giorni |
| Esportazione | CSV degli abbonamenti e dei movimenti |

Quello che NON c'è, perché non c'è nel materiale: recensioni, carrelli
abbandonati, costi di acquisizione, margini (il costo dei modelli AI è
l'unico costo che la regia conosce, e sta nel cassetto).

## Il libro dei movimenti (`movimenti/{id}`)

Una riga per incasso: `{ id, il, tipo, uid, slug, importo, iva, totale,
origine, riferimento, descrizione, periodo?, da? }`. L'imponibile è
`importo`; `totale` è quello che il cliente ha pagato.

| Chi scrive | Quando | Tipo | Id |
|---|---|---|---|
| `stripeWebhook` | `invoice.paid` | abbonamento | `fattura-<invoice id>` |
| `stripeWebhook` | ricarica AI accreditata | ricarica_ai | `ricarica-<session id>` |
| `registraPagamento` | l'admin scrive la data e l'importo | manuale | `manuale-<ms>-<slug>` |
| `gestisciCassettoAI` ricarica | credito accreditato a mano | ricarica_ai | `ricarica-manuale-…` |

Un omaggio di credito AI non è un movimento. Con un coupon (Fondatori)
l'imponibile si ricava da `amount_paid` meno `tax`, non dal `subtotal`,
che è prima dello sconto. L'id deterministico rende la scrittura
idempotente; un movimento che non si scrive non ferma il webhook (si rifà
a mano).

## Il traffico (`traffico/{giorno}`)

Contatori per giorno di Roma: `viste`, `pagine.<nome>`, `lingue.<it|en>`,
`provenienze.<dominio>`, `eventi.<passo>`. La Function `traccia` (POST,
cors aperto, 204) incrementa; il sito la chiama a ogni cambio di pagina
(`App.jsx`) e a ogni passo (`db.js`: registrazione, free, checkout,
contatto, codice, attivazione). Niente cookie, niente identificativi,
niente IP: non serve un banner, e non si sa quanti visitatori sono. La
Function non legge niente: un contatore gonfiato apposta è il danno
peggiore che può fare. Se un giorno servisse, App Check.

## I numeri (`src/lib/commerciale.js`)

- **Canone mensile di un cliente**: come la dashboard del titolare: prezzo
  del piano coi moduli e i terminali, meno lo sconto Fondatori finché vale,
  poi lo sconto del codice; l'annuale conta per il mensile. Zero per Free,
  interne, sconti al 100%, chi non è `attivo` o `in sospeso`.
- **Classe**: eliminato > disdetto (o licenza chiusa) > fermo (non pagato
  o licenza sospesa) > in attesa (senza piano o abbonamento) > Free >
  gratis (interna, sconto) > pagante. «Da approvare» con un piano pagato a
  mano è pagante.
- **Incasso**: somma di `importo` dei movimenti nel periodo; il periodo
  prima è lo stesso numero di giorni subito prima.
- **Conversione**: paganti su registrati dall'inizio, senza gli eliminati.
  Non è una coorte.
- **Scadenze**: pagamenti a mano (`pagato_fino_al`), rinnovi Stripe
  (`rinnovo_il`), prove (`prove.<modulo>.scade_il`), sconti a tempo
  (`sconto.fino`) entro 14 giorni.

## I grafici

Una serie sola, le barre nell'oro della regia e il testo coi suoi colori;
barre fino a 24px con la punta tonda e la base squadrata, un vuoto del
fondo fra loro; un'etichetta sola, sul giorno più alto; le date agli
estremi e in mezzo (tutte con sette giorni); il titolo di ogni barra al
passaggio del mouse; e sotto, «Vedi i numeri», la tabella. Niente
librerie: SVG scritto a mano in `Commerciale.jsx`.

## Come si prova

Sul test, dopo `npm run semina:test`: le persone hanno movimenti e
traffico degli ultimi mesi, e «Commerciale» mostra numeri sensati;
`npm run test:e2e` lo verifica. In produzione i movimenti veri arrivano
col primo pagamento, il traffico dal primo deploy con la Function.
