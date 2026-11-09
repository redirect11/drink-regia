# infra: i progetti Firebase dei locali, con Terraform

`istanza/main.tf` crea il progetto `drinkpos-<slug>` di un locale con
Firebase, Firestore, Hosting, web app e Auth. Lo applica il workflow
`.github/workflows/provisiona-istanza.yml` a ogni attivazione
(REQ-FLOTTA-006); `aggiorna-istanza.yml` pubblica una versione nuova
dell'app (REQ-FLOTTA-009), col Terraform solo per un locale Free che
passa al profilo completo. Il perché sta in
[docs/flotta-nella-regia.md](../docs/flotta-nella-regia.md).

Lo stato di Terraform sta nel bucket GCS `drink-regia-tfstate`, una
cartella per locale (`istanze/<slug>`).

## Quattro job: la chiave e il codice dell'app non stanno mai insieme

Dal 09/11/2026 (REQ-FLOTTA-047, audit punto 6) `provisiona-istanza.yml` e
`aggiorna-istanza.yml` sono quattro job in fila:

| Job | Environment e chiave | Cosa fa |
|---|---|---|
| `controlla` | no | gli input, «è un rilascio?», il checkout di tana-drink al `ref` e «la versione va bene per questa regia?». Esporta lo SHA controllato e il ramo |
| `prepara` | sì | il Terraform (attivazione: init, import, apply; aggiornamento: solo un Free che compra), il controllo dell'etichetta `ambiente` (aggiornamento, REQ-FLOTTA-048), la configurazione web del progetto → output del job |
| `compila` | no | tana-drink allo SHA controllato, `.env` dall'output di `prepara`, `npm ci`, `genera-cliente`, `npm run build`, `app.tgz` come artifact (un giorno) |
| `pubblica` | sì | scarica l'artifact, licenza, Storage, segreti, deploy, titolare, esito alla regia |

Il codice di tana-drink gira solo in `compila`, dove non c'è niente da
rubare; `prepara` e `pubblica` non scaricano l'app e non ne installano
niente. La configurazione web che attraversa i job è quella del client
(`VITE_FIREBASE_*`), pubblica per disegno. Se `controlla`, `prepara` o
`compila` falliscono, `pubblica` parte lo stesso, fallisce al primo passo e
manda l'esito di errore alla regia. `elimina-istanza.yml` non compila
niente e resta un job solo.

## L'etichetta `ambiente`: di quale regia è un progetto

Le due regie usano la stessa chiave di provisioning. Quello che distingue
un locale di produzione da uno di test è l'etichetta `ambiente`
(`produzione` o `test`) che il Terraform mette sul progetto. Dal
09/11/2026 (REQ-FLOTTA-048, audit punto 7):

- `elimina-istanza.yml`, prima del backup e di qualunque cancellazione,
  esige l'etichetta dell'ambiente che lancia **e** lo stato Terraform in
  `istanze/<slug>/`; se una delle due manca si ferma;
- `aggiorna-istanza.yml`, subito dopo le credenziali, esige l'etichetta.

Un **locale esistente** (la Tana su `tana-drink`, la demo su
`drinkpos-demo`: REQ-FLOTTA-018, REQ-FLOTTA-019) non l'ha creato il
Terraform e non ha l'etichetta: gliela dà una volta, a mano, chi lo affida
a quella regia, e fino ad allora nessuna regia lo tocca:

```sh
gcloud projects update drinkpos-demo --update-labels ambiente=produzione
gcloud projects update tana-drink --update-labels ambiente=produzione
```

## I due environment GitHub della flotta

Ogni regia lancia sul suo: la produzione (`drink-regia`) su `flotta`, la
regia di test (`drink-regia-test`) su `flotta-test`. Lo sceglie l'input
`ambiente` del workflow, che le Functions prendono da `FLOTTA_AMBIENTE` in
`functions/.env.<progetto>`. Stessi nomi, valori diversi:

| Nome | Tipo | `flotta` (produzione) | `flotta-test` (test) |
|---|---|---|---|
| `PROVISIONING_SA_JSON` | segreto | la chiave di `provisioning@drink-regia` | la stessa |
| `BILLING_ACCOUNT_ID` | segreto | l'account di fatturazione dei locali veri | il secondo account, solo prove (`01D78D-…`) |
| `PROVISIONING_CALLBACK_SECRET` | segreto | lo stesso valore del segreto delle Functions di `drink-regia` | lo stesso valore del segreto delle Functions di `drink-regia-test` |
| `TFSTATE_BUCKET` | variabile | `drink-regia-tfstate` | `drink-regia-tfstate` |
| `REGIA_CALLBACK_URL` | variabile | `https://europe-west1-drink-regia.cloudfunctions.net/esitoProvisioning` | `https://europe-west1-drink-regia-test.cloudfunctions.net/esitoProvisioning` |
| `REGIA_URL` | variabile | `https://drink-regia.web.app` | `https://drink-regia-test.web.app` |
| `REGIA_SA_EMAIL` | variabile | `runtime-regia@drink-regia.iam.gserviceaccount.com` (finché non c'è: `600871952552-compute@developer.gserviceaccount.com`) | `runtime-regia@drink-regia-test.iam.gserviceaccount.com` (finché non c'è: `246268671867-compute@developer.gserviceaccount.com`) |
| `ORG_ID` | variabile, facoltativa | l'organizzazione Google Cloud | la stessa |
| `ARCHIVIO_BUCKET` | variabile | `drink-regia-archivio` (nel progetto `drink-regia`) | `drink-regia-test-archivio` (nel progetto `drink-regia-test`) |

`REGIA_SA_EMAIL` è l'account con cui girano le Functions di quella regia:
il Terraform gli dà `roles/datastore.user` sul locale, così la regia può
scrivere la licenza (sospendere, riattivare, chiudere). Non ha un valore
predefinito, apposta. Dall'audit del 09/11/2026 (finding 3) è l'account
dedicato `runtime-regia@<regia>`, creato da `scripts/account-runtime.mjs`
con i soli ruoli che il codice usa e senza Editor; l'account predefinito
di Compute Engine resta solo finché quello dedicato non è acceso
(`RUNTIME_SERVICE_ACCOUNT` in `functions/.env.<progetto>`). Cambiare la
variabile e rilanciare «Aggiorna istanza» su ogni locale fa convergere il
Terraform: il nuovo account entra, il vecchio esce.

Il segreto `GITHUB_DISPATCH_TOKEN` delle Functions di ciascuna regia è un
token fine-grained con **Actions: Read and write** su `redirect11/drink-regia`
soltanto.

## Prerequisiti, una volta, a mano

1. **Account di fatturazione** (Blaze): il service account di
   provisioning ha «Utente account di fatturazione» su **ognuno** dei due.
2. **Quota di progetti** sull'account di fatturazione: di partenza 5
   (richiesta di aumento in corso dal 27/10/2026).
3. **Service account di provisioning** `provisioning@drink-regia`, con
   «Amministratore oggetti Storage» sul bucket `drink-regia-tfstate`.
4. **Senza Organizzazione Google Cloud** un service account non può
   creare progetti: il progetto `drinkpos-<slug>` lo crea una persona
   (`npx firebase-tools projects:create drinkpos-<slug>`), gli collega
   l'account di fatturazione giusto e dà al service account di
   provisioning il ruolo «Proprietario». Il workflow lo importa e lo
   completa; se manca, si ferma e lo dice. Con `ORG_ID` lo crea Terraform,
   e chi crea il progetto ne è proprietario.
5. **Il bucket degli archivi** di ciascuna regia (REQ-FLOTTA-014,
   `elimina-istanza.yml`), creato una volta:
   - nome come in `ARCHIVIO_BUCKET`, regione `europe-west1`, accesso
     uniforme, accesso pubblico **impedito**;
   - una regola del ciclo di vita: **elimina gli oggetti dopo 180 giorni**
     (è la durata scritta nei termini e nella privacy);
   - `provisioning@drink-regia`: «Amministratore oggetti Storage» sul
     bucket (ci scrive il backup);
   - l'account di runtime delle Functions di quella regia
     (`REGIA_SA_EMAIL`): «Visualizzatore oggetti Storage» sul bucket, e
     «Creatore token account di servizio» **su se stesso**, per firmare il
     link di download che `scaricaArchivio` dà al titolare. Nessun altro.
   Il workflow usa `gcloud`: il runner di GitHub ce l'ha, e lo autentica
   `google-github-actions/auth` con la stessa chiave di provisioning.

I ruoli del service account di provisioning (punti 1, 3, 4 e 5) li dà
`scripts/ruoli-provisioning.mjs`, lanciato da una persona col suo accesso:

```sh
node scripts/ruoli-provisioning.mjs --sa provisioning@drink-regia.iam.gserviceaccount.com \
  --billing <id> --bucket drink-regia-tfstate --bucket drink-regia-archivio \
  --progetto drinkpos-<slug>
```

`--billing` vale per un account alla volta; `--bucket` e `--progetto` si
ripetono. Quelli dell'account di runtime sul bucket degli archivi restano
da dare a mano.

## I due profili

La variabile `profilo` (input omonimo dei workflow) decide che cosa nasce:

- **completo**, il predefinito: tutte le API, gli agenti di Eventarc e
  Pub/Sub, poi Storage, segreti e Functions dal workflow;
- **leggero**, il piano Free (REQ-FLOTTA-015): solo le API di Firebase,
  Firestore, regole, Hosting, accesso e App Check, senza le API e gli
  agenti delle Functions. Anche il leggero ha l'account di fatturazione:
  senza, Google non accende l'accesso con email (`BILLING_NOT_ENABLED`,
  provato su `drinkpos-prova-free` il 30/10/2026). Il costo resta zero
  perché database, sito e accesso stanno nelle soglie gratuite.

Quando un locale Free compra, `aggiorna-istanza.yml` col profilo completo
rifà l'apply se nello stato manca l'API delle Functions. Un progetto
senza stato (un locale esistente, come la Tana) non lo tocca.

## Gli slug di prova

I nomi dei progetti Google sono unici ovunque: uno slug usato dalla regia
di test non è più disponibile per la produzione. Le istanze di prova usano
slug che iniziano con `prova-`.

## Come si prova senza toccare niente

```sh
cd infra/istanza
terraform init -backend=false
terraform validate
terraform plan -var slug=prova-demo -var ambiente=test \
  -var billing_account=XXX -var regia_sa_email=YYY   # solo piano, niente apply
```

I workflow li controlla `tests/flotta.test.js`.
