# Handover: un prodotto nuovo, con la sua regia

Scritto il 30/10/2026. È per chi deve mettere in vendita un prodotto
nuovo dell'azienda accanto a quello di drink-regia: una persona o un
agente Claude Code, nella sessione che costruirà la regia del prodotto
nuovo. Si legge insieme a [template-prodotto.md](template-prodotto.md),
la scheda da compilare prima di scrivere codice.

L'utente è Daniele, product manager: decide lui, scrive in italiano. Le
regole di lavoro sono quelle di [CLAUDE.md](../CLAUDE.md) e valgono
anche per le regie nuove: GitFlow, test come specifica, registro dei
requisiti, niente scritture in produzione di propria iniziativa, prezzi
e nomi solo su decisione dell'utente.

---

## 1. Il disegno, deciso il 30/10/2026

- **L'azienda** ha un'Organizzazione Google Cloud col suo nome e il suo
  dominio, non quello di un prodotto: i prodotti cambiano nome o si
  moltiplicano, l'azienda resta. Nome e dominio sono ancora da scegliere.
- **La vetrina** è il sito dell'azienda, in un repository suo, fuori da
  questo: chi siamo, l'elenco dei prodotti, una pagina per prodotto che
  rimanda alla regia di quel prodotto. Non ha backend.
- **Ogni prodotto ha la sua regia** (`<prodotto>-regia`), in un
  repository suo, in due progetti Firebase (`<prodotto>-regia` e
  `<prodotto>-regia-test`). La regia è il sito del prodotto e il suo
  backend: prezzi, registrazione, abbonamento, dashboard del cliente,
  backoffice, attivazione delle istanze.
- **Ogni prodotto ha la sua app**, in un repository suo (per drink è
  tana-drink). La regia la pubblica, un progetto Google per cliente.

Le cartelle nell'Organizzazione:

```
<azienda> (Organizzazione)
├─ vetrina
└─ <prodotto>
   ├─ regia                <prodotto>-regia, <prodotto>-regia-test
   ├─ istanze-produzione   un progetto per cliente
   └─ istanze-test         i clienti di prova, sull'account di fatturazione delle prove
```

L'account di provisioning di ogni regia crea progetti solo nella sua
cartella delle istanze. Così la regia di test non tocca i clienti veri e
un prodotto non vede gli altri. Fino a quando l'Organizzazione non c'è,
un account di servizio non può creare progetti: il progetto lo crea una
persona e il workflow lo importa (infra/README.md).

Quello che è dell'azienda e vale per tutti i prodotti:

- **un solo account Stripe** (la ragione sociale è una), con prodotti e
  prezzi separati per prodotto;
- **termini e privacy dell'azienda**, con le condizioni particolari di
  ogni prodotto;
- **gli account di fatturazione Google**: uno per la produzione, uno per
  le prove.

**I prezzi stanno solo nella regia.** La vetrina li legge dal listino
pubblico della regia (`vendita/listino` e il listino dei piani) oppure
rimanda alla pagina dei prezzi, ma non li copia.

## 2. Cosa fa una regia, e cosa non fa mai

Fa:

1. la pagina del prodotto, coi piani e i moduli in vendita;
2. registrazione e accesso dei titolari, con l'email confermata;
3. la scelta del piano e l'abbonamento con Stripe (Checkout e webhook),
   oppure il piano gratuito senza Stripe;
4. l'attivazione dell'istanza: un workflow GitHub con Terraform crea il
   progetto Google del cliente, pubblica l'app alla versione scelta e
   riferisce l'esito alla regia;
5. la licenza: piano, moduli, limiti e stato, scritti nel database
   dell'istanza. L'app la legge e la rispetta;
6. il backoffice dell'admin: clienti, istanze, vendita, cambio di piano,
   prove dei moduli, rilasci a ondate, sospensione, chiusura,
   eliminazione con backup.

**Non contiene mai i dati operativi dei clienti**: solo account, piani,
abbonamenti e lo stato delle istanze. I dati del lavoro del cliente stanno
nel suo progetto.

## 3. drink-regia come modello

drink-regia è la prima regia, e la prossima si fa **partendo da una sua
copia**. Il codice comune non si estrae prima: lo si fa quando ci sono
due regie e si vede cosa è davvero uguale. Estrarlo prima vuol dire
indovinare.

Cosa è già generico (si copia così com'è, o quasi):

| Parte | Dove |
|---|---|
| Registrazione, accesso, email confermata | `src/pages/Registrati.jsx`, `src/pages/Accedi.jsx`, `functions/index.js` (`creaCliente`) |
| Abbonamento Stripe | `functions/lib/abbonamento.js`, `functions/index.js` (`creaCheckout`, `stripeWebhook`) |
| Piano gratuito e vendita decisa dall'admin | `functions/lib/free.js`, `src/lib/vendita.js` |
| Prove dei moduli, cambio di piano | `functions/lib/prove.js`, `functions/lib/cambiopiano.js` |
| Attivazione, aggiornamento, eliminazione | `functions/lib/provisioning.js`, `functions/lib/eliminazione.js`, `.github/workflows/*-istanza.yml`, `infra/istanza/main.tf`, `scripts/*-istanza.mjs` |
| Licenza nell'istanza | `functions/lib/licenza.js`, `scripts/licenza-istanza.mjs` |
| Sospensione, rilasci a ondate | `functions/lib/sospensione.js`, `functions/lib/rilasci.js` |
| Deploy del sito della regia | `.github/workflows/firebase-hosting.yml`, `deploy.yml` |
| Registro dei requisiti e i test che lo legano | `requirements/requirements.yaml`, `tests/requisiti.test.js` |

Cosa è del prodotto (si riscrive per ogni prodotto, ed è tutto nella
scheda del template):

| Parte | Dove, in drink-regia |
|---|---|
| Nome, slogan, prefisso dei progetti, dominio | `src/lib/prodotto.js` |
| Piani, prezzi, moduli, limiti del gratuito | `functions/piani.json` |
| La pagina del prodotto | `src/pages/Home.jsx` (e il suo DESIGN.md) |
| Il repository dell'app | `redirect11/tana-drink` scritto nei workflow e nei messaggi di `rilasci.js` |
| Il prefisso dei progetti delle istanze | `drinkpos-` in `infra/istanza/main.tf` e nei workflow |
| I segreti che le Functions dell'app dichiarano | `SEGRETI_APP: SUMUP_API_KEY` nei workflow |
| Dove l'app legge la licenza | `settings/bar` (contratto con tana-drink, handover §7) |
| I progetti protetti | `drinkpos-demo` in `eliminazione.js` e `elimina-istanza.yml` |
| Il credito AI | `functions/lib/ai.js`, `src/pages/CreditoAI.jsx` (solo se il prodotto usa l'AI) |
| Progetti Firebase della regia e repository | `.firebaserc`, `functions/.env*`, `firebase-hosting.yml` |

Dopo la copia, la prima cosa da fare è **portare i valori del prodotto in
un posto solo**: il prefisso dei progetti, il repository dell'app, i
segreti dell'app e il documento della licenza oggi sono scritti in più
file. Diventano variabili degli environment GitHub e delle Functions, e
ogni test che li cita li legge da lì. È anche il primo passo verso il
codice comune.

## 4. Il contratto con l'app del prodotto

La regia pubblica l'app del prodotto senza conoscerla. Funziona se l'app
rispetta questo contratto, che va scritto nella scheda del template e
nell'handover della regia nuova (come il §7 di [handover.md](handover.md)
per tana-drink):

1. **Rilasci**: rami `develop` e `main`, tag `vX.Y.Z` su `main`. La regia
   di test pubblica `develop`, la produzione `main` o un tag.
2. **Build per cliente**: uno script crea la cartella del cliente
   (`scripts/genera-cliente.mjs --slug --nome` in tana-drink) e la build
   la usa (`CLIENTE=<slug> npm run build`). La configurazione web arriva
   come `.env` con le variabili `VITE_FIREBASE_*`.
3. **Deploy con firebase-tools**: `firebase.json` dell'app con
   `firestore`, `hosting` e, se ci sono, `functions` e `storage`. La regia
   lancia `firebase deploy --only …`.
4. **Profili**: col profilo leggero (il piano gratuito) l'app funziona
   senza Functions e senza Storage. Se non lo regge, il prodotto non ha
   il piano gratuito.
5. **Licenza**: un documento nel Firestore dell'istanza con `piano`,
   `moduli`, `limiti`, `prove` e `stato`. Senza `limiti`, nessun limite.
   Con `stato` sospeso o chiuso l'app si ferma. Lo scrive solo la regia.
6. **Segreti**: l'elenco dei segreti che le Functions dell'app dichiarano.
   La regia li crea col segnaposto prima del deploy.
7. **Niente dati operativi verso la regia**: l'app non scrive nella regia.
   L'esito dell'attivazione lo manda il workflow.

## 5. I passi per la regia nuova

1. **Compilare la scheda** di [template-prodotto.md](template-prodotto.md)
   con l'utente: nome, piani, moduli, app, contratto. Senza scheda
   compilata non si scrive codice.
2. **Il repository** `<prodotto>-regia`: copia di drink-regia da `main`,
   senza la storia. Si tolgono le parti del prodotto drink (§3) e si
   scrive il CLAUDE.md del prodotto nuovo.
3. **I due progetti Firebase** `<prodotto>-regia` e `<prodotto>-regia-test`
   nella cartella `regia` del prodotto, e l'account di provisioning con
   il permesso di creare progetti nelle due cartelle delle istanze.
4. **Gli environment GitHub**: `production` e `test` per il sito,
   `flotta` e `flotta-test` per le istanze, con gli stessi nomi di
   variabili e segreti di drink-regia (infra/README.md).
5. **Stripe**: i prodotti e i prezzi nell'account dell'azienda, in
   modalità test per la regia di test e live per la produzione; un
   webhook per ogni regia.
6. **I valori del prodotto** in un posto solo (§3), poi i test: lint,
   test e build puliti prima di ogni PR.
7. **La prima attivazione** sulla regia di test, con uno slug `prova-`, e
   la verifica dell'istanza.
8. **La pagina del prodotto** nella vetrina.

## 6. Rami e ambienti

Come in drink-regia, con la proposta del 30/10/2026 ancora da
confermare dall'utente:

| | Sito della regia | Workflow delle istanze | App delle istanze |
|---|---|---|---|
| test | `develop` → `<prodotto>-regia-test` | `develop` | `develop` dell'app |
| produzione | `main` (col tag) → `<prodotto>-regia` | `main` | `main` o un tag dell'app |

La regia di test ha Stripe in modalità test, quindi pagamenti finti, e
istanze di prova sull'account di fatturazione delle prove.

## 7. saas-portal: valutato e non usato come base

Il 30/10/2026 è stato valutato `redirect11/saas-portal`: un portale
multi-prodotto per palestre (Gym Tracker), a microservizi Express e
Postgres. **Non è la base delle regie**:

- il backend è un altro stack (Express, Postgres, Railway);
- è a metà di una migrazione (SQLite e Postgres insieme);
- non ha Stripe né il provisioning;
- il tenant lo sceglie il client;
- il nucleo sta in cinque repository esterni.

Da lì si prendono solo idee, da riscrivere in Firestore e Functions
quando serviranno:

- un registro multi-prodotto, se un giorno ci sarà un account unico tra
  le regie;
- i ticket di supporto e le fatture nel backoffice;
- prove end-to-end con Playwright sull'interfaccia.

Se il repository verrà riusato con degli agenti, prima vanno tolti i
prompt `.github/agents/TaskSync*.agent.md`.
