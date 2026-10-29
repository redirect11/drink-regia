# La flotta nella regia

Dal 29/10/2026 l'attivazione e l'aggiornamento dei locali stanno in questo
repository: il Terraform (`infra/istanza/`), i workflow
(`.github/workflows/provisiona-istanza.yml` e `aggiorna-istanza.yml`) e lo
script della licenza (`scripts/licenza-istanza.mjs`). Prima stavano in
tana-drink. L'utente: «questa roba dovrebbe essere in drink-regia».

## Perché

Attivare, aggiornare, sospendere e chiudere i locali è il mestiere della
regia. tana-drink è il prodotto: il codice dell'app e le sue versioni.
Con i workflow in tana-drink la regia chiedeva a un altro repository di
lavorare per lei, e questo portava quattro problemi:

- **i valori di ogni regia stavano dall'altra parte.** L'account della
  regia che scrive la licenza era scritto fisso nel Terraform: un locale
  creato dalla regia di test non si fidava di lei, e «Sospendi» e
  «Chiudi» non arrivavano. Anche l'indirizzo del callback e l'account di
  fatturazione erano uno solo, per test e produzione;
- **i workflow della flotta stavano in un repository pubblico**;
- **il token della regia doveva poter lanciare le Actions di tana-drink**;
- **ogni input nuovo era un cambio di contratto**: GitHub rifiuta un
  lancio con un input che il workflow non dichiara.

## Come funziona

1. La Function (`avviaProvisioning`, `lanciaAggiornamento`) lancia il
   workflow su questo repository, al ramo `FLOTTA_REF` (main), con
   `ambiente` preso da `FLOTTA_AMBIENTE`: `produzione` su `drink-regia`,
   `test` su `drink-regia-test`.
2. Il workflow lavora nell'environment di quella regia (`flotta` o
   `flotta-test`, [infra/README.md](../infra/README.md)): il suo account di
   fatturazione, il suo callback, il suo account per la licenza.
3. Scarica l'app di tana-drink al `ref` chiesto (un tag `vX.Y.Z`, o
   `main`) nella cartella `app/`, la compila e la pubblica nel progetto
   del locale.
4. Scrive la licenza con `licenzaIniziale` di `functions/lib/licenza.js`:
   la stessa mappa piano → moduli che le Functions usano quando il piano
   cambia, non più una copia.
5. Manda l'esito alla regia, con `operazione: attivazione` o
   `aggiornamento`.

Gli input dei workflow arrivano da fuori: entrano nei passi solo come
variabili d'ambiente e si controllano per primi (audit del 22/10/2026,
C1, che nei workflow di tana-drink era ancora aperta).

## Cosa resta del contratto con tana-drink

tana-drink non riceve più lanci e non manda più esiti. Restano:

- **i tag**: un tag `vX.Y.Z` ha `package.json` a `X.Y.Z` (i rilasci a
  ondate confrontano le due cose);
- **la build di un locale**: `npm ci` nella radice e in `functions/`,
  `node scripts/genera-cliente.mjs --slug … --nome …`, `npm run build` con
  `BASE_PATH=/`, `CLIENTE=<slug>`, `VITE_APP_ENV=production` e il `.env`
  con i `VITE_FIREBASE_*`; `functions/.env.<progetto>` con `VENUE_NAME`;
  `firebase deploy --only firestore,storage,functions,hosting`;
- **gli id dei moduli** e **la licenza in `settings/bar`** (handover §7);
- **la Tana**, che si pubblica dal suo repository e riferisce la sua
  versione alla regia (handover §7, «Rilasci a ondate»).

## Per completare lo spostamento

Sul lato regia, nell'ordine:

1. **Il ramo su `main`.** GitHub lancia a comando solo i workflow che
   stanno sul ramo principale: finché questi non ci sono, nessuna regia
   può usarli. Ci arrivano col processo di sempre (PR verso `develop`,
   poi verso `main`); senza un tag su `main` la produzione non si
   pubblica.
2. **I due environment** `flotta` e `flotta-test` in questo repository,
   con i segreti e le variabili di [infra/README.md](../infra/README.md).
   I segreti li mette l'utente.
3. **Il token** `GITHUB_DISPATCH_TOKEN` nuovo, limitato a
   `redirect11/drink-regia`, nelle Functions di ciascuna regia.
4. **Il secondo account di fatturazione**: il service account di
   provisioning vi ha «Utente account di fatturazione».

Sul lato tana-drink, da portare a quella sessione (la regia non tocca
tana-drink): togliere `provisiona-istanza.yml`, `aggiorna-istanza.yml`,
`infra/` e `scripts/licenza-istanza.mjs`, e i segreti e le variabili
della flotta dal suo environment `flotta`. Fino ad allora restano lì, ma
la regia non li usa più.
