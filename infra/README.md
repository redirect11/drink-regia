# infra: i progetti Firebase dei locali, con Terraform

`istanza/main.tf` crea il progetto `drinkpos-<slug>` di un locale con
Firebase, Firestore, Hosting, web app e Auth. Lo applica il workflow
`.github/workflows/provisiona-istanza.yml` a ogni attivazione
(REQ-FLOTTA-006); `aggiorna-istanza.yml` pubblica una versione nuova
dell'app (REQ-FLOTTA-009), col Terraform solo per un locale Free che
passa al profilo completo. Il perché sta in
[docs/flotta-nella-regia.md](../docs/flotta-nella-regia.md).

Lo stato di Terraform sta in un bucket GCS per regia (`TFSTATE_BUCKET`), una
cartella per locale (`istanze/<slug>`): `drink-regia-tfstate` per la
produzione, `drink-regia-test-tfstate` per il test (REQ-FLOTTA-136, dal
17/11/2026: gli stati dei locali di prova sono stati copiati lì; le copie
vecchie in `drink-regia-tfstate` si cancellano quando il test è passato).

## Come i workflow entrano su Google (REQ-FLOTTA-136, fase 0)

I quattro workflow della flotta prendono le credenziali da
`scripts/credenziali-flotta.mjs`, nel passo «Credenziali di provisioning».
Il modo lo sceglie l'environment:

- **senza chiave**, se ha le variabili `FLOTTA_WIF_PROVIDER` e `FLOTTA_SA`:
  il job chiede a GitHub un gettone firmato (serve `id-token: write`, che
  hanno solo i job con le credenziali, mai `compila`) e Google lo scambia con
  un accesso di un'ora all'account della regia. Il fornitore accetta solo
  questo repository (per id numerico, `1429043866`) e solo l'environment
  della sua regia;
- **con la chiave** di prima (`PROVISIONING_SA_JSON`), finché l'environment
  non ha le due variabili.

Per tornare alla chiave basta togliere le due variabili dall'environment
(e, sul test, rimettere `TFSTATE_BUCKET` a `drink-regia-tfstate` dopo aver
ricopiato lì gli stati: l'account della chiave non legge il bucket nuovo).

| Regia | Account | Pool e fornitore |
|---|---|---|
| test | `provisioning@drink-regia-test.iam.gserviceaccount.com` | `projects/246268671867/locations/global/workloadIdentityPools/github/providers/drink-regia` (condizione: repository `1429043866`, environment `flotta-test`) |
| produzione | `provisioning@drink-regia.iam.gserviceaccount.com` | `projects/600871952552/locations/global/workloadIdentityPools/github/providers/drink-regia` (condizione: repository `1429043866`, environment `flotta`; creato il 17/11/2026, con Browser su `drink-regia`) |

L'account di test ha i ruoli sui locali di prova (gli stessi che aveva
quello di produzione), su `tana-drink-test`, su
`drink-regia-test-archivio` e `drink-regia-test-tfstate` (amministratore
oggetti) e sull'account di fatturazione delle prove (`billing.user`); il
ruolo di autore dei progetti nell'organizzazione lo dà un amministratore di
`stone-b.it` (dato il 17/11/2026: è anche l'unico ruolo che l'account di
produzione ha lì). Ha in più **Browser** (`roles/browser`) sul progetto della
sua regia: senza chiave, `google-auth-library` chiede il progetto
predefinito leggendo il progetto del pool, e senza quel ruolo si ferma con
403 prima di fare qualunque cosa (con la chiave il progetto stava nel file).
L'account di produzione ha lo stesso ruolo su `drink-regia` dal 17/11/2026.

**La chiave, alla fine** (Daniele, 17/11/2026): niente copie di riserva.
Quando la produzione ha lavorato qualche giorno senza chiave, la chiave si
**disattiva** (`gcloud iam service-accounts keys disable`, reversibile);
qualche giorno dopo si cancella insieme a `PROVISIONING_SA_JSON`. In
emergenza se ne crea una nuova (`drink-regia` è fuori dall'organizzazione,
dove la creazione delle chiavi è vietata) e la si mette nel segreto: i
workflow tornano da soli al modo con la chiave.

Provato sulla regia di test il 17/11/2026, tutto senza chiave: «Prepara
l'AI» su `tana-drink-test`, «Aggiorna» di prova-bar, il collaudo con
«Aggiorna subito» dalla regia, e un locale nuovo (`prova-fase0`) attivato
ed eliminato, con l'archivio e lo stato di Terraform nel bucket nuovo. Quando le due regie sono passate, l'account di produzione
perde i ruoli sui locali di prova e la chiave si cancella.

## I pacchetti per versione (REQ-FLOTTA-137, interfaccia 16)

tana-drink compila una volta a ogni tag e carica il pacchetto nel bucket
della regia; il lavoro della flotta su Google (REQ-FLOTTA-138) lo pubblica
nei locali senza ricompilare. Il formato e i controlli sono in
`docs/contratto-regia-app.md` (interfaccia 16) e `scripts/lib-pacchetto.js`.

| Regia | Bucket | Chi carica | Chi legge |
|---|---|---|---|
| test | `drink-regia-test-rilasci` (europe-west1, accesso uniforme, niente pubblico, versioni attive; creato il 17/11/2026) | `rilasci@drink-regia-test`, solo `storage.objectCreator`: crea, non sovrascrive né cancella | `provisioning@drink-regia-test` (`objectViewer`) |
| produzione | `drink-regia-rilasci` (da creare, dopo il test) | `rilasci@drink-regia` | `provisioning@drink-regia` |

`rilasci@` si raggiunge solo dal fornitore `tana-drink` del pool `github`
della sua regia: accetta il repository tana-drink (id `1259880473`) e solo
i tag (`refs/tags/v…`). Niente chiavi.

## Il lavoro della flotta su Google (REQ-FLOTTA-138)

Un Cloud Run Job `flotta` nel progetto di ogni regia fa quello che fanno i
workflow provisiona, aggiorna ed elimina, senza GitHub: prende l'app dal
pacchetto (sopra), la controlla, la personalizza per il locale e la
pubblica. Lo script è `scripts/flotta-lavoro.mjs`, le regole in
`scripts/lib-lavoro.js`; i passi e gli script sono quelli dei workflow.

- **Chi è**: gira come l'account della flotta della sua regia
  (`provisioning@<regia>`), lo stesso della fase 0, senza chiave: le
  credenziali le dà Cloud Run.
- **Un'esecuzione, un'operazione**: chi la lancia (la regia, REQ-FLOTTA-139;
  oggi una persona) passa `COMANDO` (`attiva`, `aggiorna`, `elimina`),
  `SLUG`, `AMBIENTE`, `VERSIONE` (per attivare e aggiornare), e come nei
  workflow `NOME`, `PIANO`, `MODULI`, `PROFILO`, `UID_TITOLARE`,
  `EMAIL_TITOLARE`; `RUN_ID`, un intero, è il segno dell'esecuzione per la
  callback (senza, l'istante in millisecondi).
- **Le impostazioni della regia**, fissate sul lavoro: `TFSTATE_BUCKET`,
  `RILASCI_BUCKET`, `REGIA_URL`, `REGIA_CALLBACK_URL`, `REGIA_SA_EMAIL`,
  `BILLING_ACCOUNT_ID`, `ARCHIVIO_BUCKET`, `ORG_ID` (se c'è), e il segreto
  `PROVISIONING_CALLBACK_SECRET` da Secret Manager: quello delle Functions
  della regia, letto dall'account della flotta.
- **Il blocco**: `gs://<TFSTATE_BUCKET>/blocchi/drinkpos-<slug>.json`,
  creato solo se non c'è e tolto alla fine. Un'altra esecuzione sullo stesso
  locale aspetta, al più 20 minuti; un blocco più vecchio di 70 minuti è di
  un'esecuzione morta e si toglie.
- **Il tempo massimo**: un'ora (`--task-timeout=3600`), nessun nuovo
  tentativo del lavoro (`--max-retries=0`): i tentativi sono dentro i passi.
- **L'esito**: sempre alla regia, con la callback dei workflow
  (`esitoProvisioning`), mai scritto direttamente nel suo database.
- **I log**: in Cloud Logging del progetto della regia.
- **La demo e i locali esistenti** (la Tana) restano sui workflow.

L'immagine (`infra/flotta/Dockerfile`: Node 22, Terraform 1.9.8,
firebase-tools 15.36.0, gcloud, gli script e `infra/istanza`) si costruisce
con Cloud Build nel progetto della regia, e si ricostruisce a ogni rilascio
della regia:

```sh
gcloud builds submit --project drink-regia-test --config infra/flotta/cloudbuild.yaml \
  --ignore-file infra/flotta/.gcloudignore --substitutions _VERSIONE=<versione>
```

La prima volta, per regia (sul test con `drink-regia-test`, numero
`246268671867`):

```sh
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project drink-regia-test
gcloud artifacts repositories create flotta --repository-format=docker --location=europe-west1 --project drink-regia-test
gcloud secrets add-iam-policy-binding PROVISIONING_CALLBACK_SECRET --project drink-regia-test \
  --member serviceAccount:provisioning@drink-regia-test.iam.gserviceaccount.com --role roles/secretmanager.secretAccessor
gcloud run jobs create flotta --project drink-regia-test --region europe-west1 \
  --image europe-west1-docker.pkg.dev/drink-regia-test/flotta/lavoro:<versione> \
  --service-account provisioning@drink-regia-test.iam.gserviceaccount.com \
  --task-timeout=3600 --max-retries=0 --cpu=2 --memory=4Gi \
  --set-secrets PROVISIONING_CALLBACK_SECRET=PROVISIONING_CALLBACK_SECRET:latest \
  --set-env-vars TFSTATE_BUCKET=drink-regia-test-tfstate,RILASCI_BUCKET=drink-regia-test-rilasci,…
```

Un'esecuzione a mano:

```sh
gcloud run jobs execute flotta --project drink-regia-test --region europe-west1 \
  --update-env-vars COMANDO=aggiorna,SLUG=prova-bar,AMBIENTE=test,VERSIONE=<versione>,PROFILO=completo
```

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
| `PROVISIONING_SA_JSON` | segreto | la chiave di `provisioning@drink-regia` | la stessa (non serve più quando ci sono le due variabili sotto) |
| `FLOTTA_WIF_PROVIDER` | variabile, facoltativa | `projects/600871952552/locations/global/workloadIdentityPools/github/providers/drink-regia` (si accende quando i workflow nuovi sono su `main`: `flotta` accetta solo `main`) | `projects/246268671867/locations/global/workloadIdentityPools/github/providers/drink-regia` |
| `FLOTTA_SA` | variabile, facoltativa | `provisioning@drink-regia.iam.gserviceaccount.com` | `provisioning@drink-regia-test.iam.gserviceaccount.com` |
| `BILLING_ACCOUNT_ID` | segreto | l'account di fatturazione dei locali veri | il secondo account, solo prove (`01D78D-…`) |
| `PROVISIONING_CALLBACK_SECRET` | segreto | lo stesso valore del segreto delle Functions di `drink-regia` | lo stesso valore del segreto delle Functions di `drink-regia-test` |
| `TFSTATE_BUCKET` | variabile | `drink-regia-tfstate` | `drink-regia-test-tfstate` (insieme alle due variabili sopra) |
| `REGIA_CALLBACK_URL` | variabile | `https://europe-west1-drink-regia.cloudfunctions.net/esitoProvisioning` | `https://europe-west1-drink-regia-test.cloudfunctions.net/esitoProvisioning` |
| `REGIA_URL` | variabile | `https://drink-regia.web.app` | `https://drink-regia-test.web.app` |
| `REGIA_SA_EMAIL` | variabile | `runtime-regia@drink-regia.iam.gserviceaccount.com` (finché non c'è: `600871952552-compute@developer.gserviceaccount.com`) | `runtime-regia@drink-regia-test.iam.gserviceaccount.com` (finché non c'è: `246268671867-compute@developer.gserviceaccount.com`) |
| `ORG_ID` | variabile, facoltativa | l'organizzazione Google Cloud | la stessa |
| `ARCHIVIO_BUCKET` | variabile | `drink-regia-archivio` (nel progetto `drink-regia`) | `drink-regia-test-archivio` (nel progetto `drink-regia-test`) |

`ARCHIVIO_BUCKET` sta anche in `functions/.env.<progetto>` della regia, con
lo stesso valore: dal 09/11/2026 (REQ-FLOTTA-049) il callback di
eliminazione non lo dichiara più, e il link che il titolare scarica lo
firma la regia sul suo bucket.

`REGIA_SA_EMAIL` è l'account con cui girano le Functions di quella regia:
il Terraform gli dà `roles/datastore.user` sul locale, così la regia può
scrivere la licenza (sospendere, riattivare, chiudere). Non ha un valore
predefinito, apposta. Dall'audit del 09/11/2026 (finding 3) è l'account
dedicato `runtime-regia@<regia>`, creato da `scripts/account-runtime.mjs`
con i soli ruoli che il codice usa e senza Editor; l'account predefinito
di Compute Engine resta solo finché quello dedicato non è acceso
(`RUNTIME_SERVICE_ACCOUNT` in `functions/.env.<progetto>`). Cambiare la
variabile e rilanciare «Aggiorna istanza» su ogni locale fa convergere il
Terraform: il nuovo account entra, il vecchio esce. Un locale dove non è
successo (il 14/11/2026 `drinkpos-prova-e2e`, rimasto al vecchio account:
la presentazione rispondeva 500, REQ-FLOTTA-108) lo segnala la sezione
«Salute» del backoffice coi ruoli che mancano e la riga di
`scripts/account-runtime.mjs --locale` che li dà (REQ-FLOTTA-109).
Per leggere i registri della regia la sezione chiede all'account anche
`roles/logging.viewer`, sul solo progetto della regia: lo dà lo stesso
script, rilanciato su ciascuna regia.

Il segreto `GITHUB_DISPATCH_TOKEN` delle Functions di ciascuna regia è un
token fine-grained con **Actions: Read and write** su `redirect11/drink-regia`
soltanto.

**Da quale ramo o tag si usano gli environment** (impostato il 14/11/2026
con l'API di GitHub, Settings → Environments → «Deployment branches and
tags»; Daniele: «ok procedi basta che non facciamo guai»):

| Environment | Regola | Perché |
|---|---|---|
| `flotta` | solo il ramo `main` | la chiave dei locali di produzione la usa solo codice passato da una PR; la regia lancia sempre da `main` (`FLOTTA_REF`) |
| `flotta-test` | rami `main` e `develop` | come sopra, con `develop` per provare i workflow prima del rilascio |
| `production` | solo i tag `v*`, e l'approvazione di Daniele | il sito di produzione si pubblica da un tag (`firebase-hosting.yml`), e GitHub confronta la regola col tag, non col ramo; l'ultimo passo aspetta l'ok di Daniele, come in tana-drink |
| `test` | nessuna | il lancio a mano di «Deploy to Firebase» e di Playwright da un ramo qualunque va sul test |

Un workflow della flotta lanciato a mano da un altro ramo viene rifiutato
prima di partire: è voluto. Per togliere una regola: `gh api -X PUT
repos/redirect11/drink-regia/environments/<nome>` con
`deployment_branch_policy` vuoto. L'approvazione su `flotta` non c'è,
apposta: ogni aggiornamento chiederebbe due approvazioni (i job «prepara» e
«pubblica») e la regia, che segna «in corso» al lancio e non ha un tempo
massimo, lascerebbe la scheda bloccata finché nessuno approva.

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
   **Dal 17/11/2026 c'è l'Organizzazione `stone-b.it`** (ID `99789676875`,
   REQ-FLOTTA-132): `ORG_ID` è nell'environment `flotta-test`, e il test
   usa l'account di fatturazione da 20. All'account di provisioning serve
   «Project Creator» sull'Organizzazione (c'è). Due cose dell'Organizzazione
   da sapere: la «Condivisione limitata per i domini» è impostata su
   «Tutti», altrimenti né l'account della flotta né le Functions pubbliche
   dei locali entrerebbero nei permessi; e
   `iam.automaticIamGrantsForDefaultServiceAccounts` è applicata, quindi
   l'Editor all'account predefinito di Compute lo dà il Terraform
   (`compute_predefinito`).
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
