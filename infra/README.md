# infra: i progetti Firebase dei locali, con Terraform

`istanza/main.tf` crea il progetto `drinkpos-<slug>` di un locale con
Firebase, Firestore, Hosting, web app e Auth. Lo applica il workflow
`.github/workflows/provisiona-istanza.yml` a ogni attivazione
(REQ-FLOTTA-006); `aggiorna-istanza.yml` pubblica una versione nuova
dell'app senza Terraform (REQ-FLOTTA-009). Il perché sta in
[docs/flotta-nella-regia.md](../docs/flotta-nella-regia.md).

Lo stato di Terraform sta nel bucket GCS `drink-regia-tfstate`, una
cartella per locale (`istanze/<slug>`).

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
| `REGIA_SA_EMAIL` | variabile | `600871952552-compute@developer.gserviceaccount.com` | `246268671867-compute@developer.gserviceaccount.com` |
| `ORG_ID` | variabile, facoltativa | l'organizzazione Google Cloud | la stessa |

`REGIA_SA_EMAIL` è l'account con cui girano le Functions di quella regia:
il Terraform gli dà `roles/datastore.user` sul locale, così la regia può
scrivere la licenza (sospendere, riattivare, chiudere). Non ha un valore
predefinito, apposta.

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
