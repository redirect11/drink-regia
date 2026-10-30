# Scheda di un prodotto nuovo

Il template da copiare e compilare con l'utente prima di costruire la
regia di un prodotto nuovo ([nuovo-prodotto.md](nuovo-prodotto.md)). Una
copia per prodotto, nel repository della sua regia, come
`docs/scheda-prodotto.md`. Ogni campo vuoto è una domanda per l'utente:
non si sceglie al suo posto. La colonna «drink» è l'esempio già
compilato.

## 1. Il prodotto

| Campo | Valore | drink |
|---|---|---|
| Nome visibile | | da decidere (segnaposto «Drink») |
| Slug tecnico (non cambia più) | | `drink` |
| Prefisso dei progetti delle istanze (unico su Google) | | `drinkpos` |
| Per chi è | | bar e ristoranti: comande, conti, cassa |
| Slogan e descrizione | | `src/lib/prodotto.js` |
| Dominio del prodotto e delle istanze | | da decidere (`<slug>.<dominio>`) |
| Email di contatto | | sul dominio del prodotto |
| Lingue del sito | | italiano; inglese previsto (DESIGN.md della home) |

## 2. Repository e progetti

| Campo | Valore | drink |
|---|---|---|
| Repository della regia | | `redirect11/drink-regia` |
| Repository dell'app | | `redirect11/tana-drink` (pubblico) |
| Progetto Firebase della regia | | `drink-regia` |
| Progetto Firebase della regia di test | | `drink-regia-test` |
| Cartella nell'Organizzazione | | da creare con l'Organizzazione |
| Account di fatturazione, produzione e prove | | due, quello delle prove per le istanze `prova-` |
| Bucket dello stato Terraform e dell'archivio | | `drink-regia-tfstate`, `drink-regia-archivio`, `drink-regia-test-archivio` |
| Istanza dimostrativa (protetta, non si elimina) | | `drinkpos-demo` |

## 3. Piani e moduli

I prezzi li decide l'utente. Vanno nel listino della regia, e da nessun
altra parte.

| Piano | Prezzo al mese | Terminali | Include | Limiti | Profilo |
|---|---|---|---|---|---|
| | | | | | |

drink: Free 0 € (un terminale, 10 prodotti, 5 conti aperti, solo il
titolare, profilo leggero), Base e Completo (`functions/piani.json`).

| Modulo | Id | Prezzo al mese | Si può provare? Per quanti giorni? |
|---|---|---|---|
| | | | |

- Il piano gratuito c'è? Con quali limiti? L'app li sa far rispettare?
- I moduli si vendono a parte, o solo dentro i piani?
- Terminali in più: si vendono? A quanto?
- Il prodotto usa l'AI a credito, come drink?

## 4. Il contratto con l'app

Le risposte diventano il §7 dell'handover della regia nuova
([nuovo-prodotto.md](nuovo-prodotto.md) §4).

| Domanda | Risposta | drink |
|---|---|---|
| Rami e rilasci dell'app | | `develop`, `main`, tag `vX.Y.Z` |
| Come si crea la cartella del cliente | | `node scripts/genera-cliente.mjs --slug --nome` |
| Come si compila per un cliente | | `CLIENTE=<slug> npm run build`, `.env` con `VITE_FIREBASE_*` |
| Cosa pubblica `firebase deploy` | | `firestore,storage,functions,hosting`; leggero `firestore,hosting` |
| Il documento della licenza nel Firestore dell'istanza | | `settings/bar.licenza` |
| Cosa fa l'app con la licenza sospesa o chiusa | | si ferma e lo dice |
| I segreti delle Functions dell'app | | `SUMUP_API_KEY` |
| Gli agenti di Google che le Functions usano | | Eventarc, Pub/Sub (trigger di Firestore) |
| Funziona senza Functions né Storage (profilo leggero)? | | sì, con le richieste di `richieste-tana-drink-free.md` |
| Account dello staff: chi li crea | | la Function `staffAdmin` dell'app; nel Free solo il titolare |
| Pagamenti dentro l'app (POS, lettori) | | SumUp, solo nei piani a pagamento |

## 5. Ambienti

| | Sito della regia | Workflow delle istanze | App delle istanze | Stripe |
|---|---|---|---|---|
| test | `develop` | `develop` | `develop` | modalità test |
| produzione | `main` col tag | `main` | `main` o tag | live |

Gli environment GitHub, coi nomi di drink-regia: `production` e `test`
(il sito), `flotta` e `flotta-test` (le istanze). Variabili e segreti:
infra/README.md di drink-regia.

## 6. Legale

| Campo | Valore | drink |
|---|---|---|
| Titolare del trattamento | | l'azienda (ragione sociale da decidere) |
| Condizioni particolari del prodotto | | in `src/pages/Legali.jsx` |
| Quanto si tiene il backup dopo l'eliminazione | | 180 giorni, lo scarica solo il titolare |
| Preavviso della cancellazione chiesta dal cliente | | 30 giorni, annullabile |

## 7. Prima di aprire il repository

- [ ] Scheda compilata e letta dall'utente
- [ ] Nome e prefisso dei progetti liberi (cercati su Google e sui domini)
- [ ] Contratto con l'app accettato dalla sessione che lavora sull'app
- [ ] Prezzi decisi dall'utente
- [ ] Organizzazione e cartelle pronte, o progetti creati a mano
