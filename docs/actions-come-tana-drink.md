# Le Actions della regia come quelle di tana-drink, con un progetto di test

Istruzioni per la sessione che mantiene la regia. Obiettivo: lo stesso
modello di pubblicazione di tana-drink, con un **progetto Firebase di
test** (`drink-regia-test`) accanto alla produzione (`drink-regia`),
esattamente come `tana-drink-test` sta accanto a `tana-drink`.

Riferimenti da cui copiare, nel repository tana-drink (worktree
`C:\Users\Daniele\git\tana-drink-flotta`): `.github/workflows/test.yml`,
`firebase-hosting.yml`, `deploy.yml`, `docs/gitflow.md` (sezione «Il
deploy»), `scripts/abilita-api.mjs`, `scripts/abilita-accesso-email.mjs`,
`scripts/lib-firestore.js` (la funzione `accessToken`, che prende il token
del Firebase CLI: su questa macchina non c'è gcloud).

Regole che valgono per tutto il lavoro qui sotto:

- **Creare un progetto Firebase, dare ruoli IAM, scrivere segreti**: sono
  azioni sull'infrastruttura. Si fanno **solo col permesso esplicito
  dell'utente, chiesto in quella sessione**: il permesso dato un'altra
  volta non vale. Nella sessione di tana-drink il classificatore ha
  bloccato `firebase projects:create` e i ruoli IAM finché l'utente non
  ha detto «ti do il permesso».
- **I segreti non passano mai per la chat.** `sdkconfig`, chiavi JSON dei
  service account, chiavi Stripe, token: in un file nella scratchpad, poi
  `gh secret set … < file` o `firebase functions:secrets:set`, poi il
  file si cancella. Non si stampano, non si citano.
- **La produzione (`drink-regia`) non si tocca** se non col via libera:
  qui si costruisce il test, e il deploy in produzione passa dal tag su
  `main` con l'approvazione su GitHub.

---

## 1. Il modello (quello di tana-drink)

| Cosa si fa | Cosa succede |
|---|---|
| push su un ramo qualsiasi (tranne `release/**`) | lint, test, build. Nessun deploy. |
| pull request verso `develop` o `main` | lint, test, build **e coverage** |
| lancio a mano di «Deploy to Firebase» su un ramo | va sul **test**, subito |
| tag su un commit **non** in `main` | va sul **test**, subito |
| tag su un commit **di `main`** | va in **produzione**, dopo l'approvazione di una persona |

Il ramo non conta: conta **dove sta il commit taggato**. Lo decide il job
«Dove va» con `git merge-base --is-ancestor`. I segreti stanno nelle
GitHub Environments `test` e `production`, **stessi nomi, valori
diversi**; l'approvazione è «Required reviewers» sull'environment
`production`, impostata una volta a mano su GitHub.

Con il test, cambia una cosa nel processo scritto in `docs/handover.md`:
**la versione si tagga su `develop`** (`v0.1.0-beta`, va sul test) e
poi, dopo la PR, **di nuovo su `main`** (`v0.1.0`, produzione). Come in
tana-drink. Aggiornare `handover.md` §3 quando il test esiste.

Differenza rispetto a tana-drink: la regia non ha né la flotta né il
`CLIENTE`, quindi il ramo «flotta» di `firebase-hosting.yml` non si
porta. Tutto quello che non è `main` va sul test.

---

## 2. Il progetto di test: `drink-regia-test`

Da fare una volta, nell'ordine. Ogni punto che scrive sull'infrastruttura
si fa col permesso dell'utente.

1. **Creare il progetto** (console Firebase «Aggiungi progetto», o
   `npx firebase-tools projects:create drink-regia-test --display-name
   "Drink regia (test)"`). Gli id sono globali: se è preso, `drink-regia-t`
   o simile, e si cambia ovunque qui sotto.
2. **Piano Blaze** sul progetto (console → Fatturazione, stesso account di
   fatturazione di `drink-regia`). Serve per le Functions gen2. Per un
   sito di test resta a zero.
3. **API**: copiare `scripts/abilita-api.mjs` e `scripts/lib-firestore.js`
   da tana-drink in `scripts/` della regia (prendendo di `lib-firestore.js`
   solo `accessToken` e `arg`), poi
   `node scripts/abilita-api.mjs --project drink-regia-test`. L'elenco di
   default basta (firebase, firestore, identitytoolkit, hosting,
   cloudfunctions, cloudbuild, artifactregistry, run, eventarc, pubsub,
   storage, iam, serviceusage).
4. **Firestore** in `europe-west1`
   (`npx firebase-tools firestore:databases:create "(default)" --location
   europe-west1 --project drink-regia-test`, o dalla console).
5. **App web**: `npx firebase-tools apps:create web regia --project
   drink-regia-test`.
6. **Auth con email e password**, senza console: copiare
   `scripts/abilita-accesso-email.mjs` da tana-drink (la versione del
   22/10/2026, che fa anche `initializeAuth`) e lanciarlo con
   `--project drink-regia-test`.
7. **Hosting**: il sito di default nasce col progetto
   (`drink-regia-test.web.app`). Niente altro.

---

## 3. Il service account del deploy, per ciascun progetto

Firebase crea `firebase-adminsdk-fbsvc@<progetto>.iam.gserviceaccount.com`.
È quello che tana-drink usa per il deploy, e si usa lo stesso qui, per
`drink-regia-test` e per `drink-regia`. Per ciascuno:

1. **Ruoli** sul progetto (console → IAM, o lo stesso approccio REST di
   `scripts/ruoli-provisioning.mjs`): `roles/firebase.admin`
   (copre hosting, regole, Functions), `roles/serviceusage.serviceUsageConsumer`,
   `roles/datastore.indexAdmin`, `roles/firebaserules.admin`,
   `roles/secretmanager.admin` (il deploy controlla che i segreti delle
   Functions esistano e dà al SA di runtime il permesso di leggerli: senza,
   si ferma con `secretmanager.secrets.get` negato), `roles/cloudscheduler.admin`
   (la pianificazione di `sospendiMorosi`), `roles/artifactregistry.admin`
   (la pulizia automatica delle immagini vecchie) e `roles/run.admin`:
   senza, le Functions HTTP e callable nascono **private** (`allUsers` non
   riceve `roles/run.invoker`), Google risponde 403 a sito, Stripe e
   tana-drink, e il deploy non lo dice. Le API che il SA del
   deploy non può accendere da solo vanno abilitate prima, compresi
   `secretmanager`, `cloudscheduler` (la Function pianificata) e
   `firebaseextensions`.
   Al primo deploy delle Functions il CLI vuole dare tre ruoli agli
   agenti di servizio e, se non è proprietario, si ferma: vanno dati prima
   (`roles/iam.serviceAccountTokenCreator` all'agente Pub/Sub
   `service-<numero>@gcp-sa-pubsub.iam.gserviceaccount.com`, che nasce solo
   al primo uso e si fa nascere con `services.generateServiceIdentity`;
   `roles/run.invoker` e `roles/eventarc.eventReceiver` al SA di runtime).
   Se un primo deploy fallisce a metà, le Functions di Firestore rimaste
   create male vanno cancellate (`functions:delete`) prima di riprovare:
   altrimenti il CLI le vede come HTTPS e rifiuta di cambiarle.
2. **Functions gen2**: il SA del deploy deve poter «agire come» il SA di
   runtime (`<numero-progetto>-compute@developer.gserviceaccount.com`):
   `roles/iam.serviceAccountUser` concesso **sul SA di runtime**, non sul
   progetto. Senza, il deploy fallisce con `iam.serviceaccounts.actAs`.
   Il numero di progetto lo dà `npx firebase-tools projects:list`.
   Lo stesso ruolo serve **anche sul SA di App Engine**
   (`<progetto>@appspot.gserviceaccount.com`): il CLI lo controlla per le
   Functions pianificate (`sospendiMorosi`) e senza si ferma con
   `iam.serviceAccounts.ActAs` (provato su `drink-regia-test`, 29/10/2026).
3. **Chiave JSON** del SA (console → IAM → Service account → Chiavi →
   Aggiungi chiave), scaricata in un file nella scratchpad e messa
   nell'environment GitHub:

   ```sh
   gh secret set FIREBASE_SERVICE_ACCOUNT -R redirect11/drink-regia -e test < <file>
   gh secret set FIREBASE_SERVICE_ACCOUNT -R redirect11/drink-regia -e production < <file-prod>
   ```

   poi il file si cancella. (Per `production` oggi manca: è lo stesso
   segreto che il deploy da tag aspetta già.)

---

## 4. Gli environment GitHub

Due environment, `test` e `production` (quest'ultimo esiste già). Per
ciascuno i segreti, **stessi nomi, valori del suo progetto**:

| Segreto | Da dove |
|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | `npx firebase-tools apps:sdkconfig web --project <progetto> > <file>` nella scratchpad, poi `gh secret set <NOME> -e <env> --body "<valore>"` letto dal file con uno script, mai a mano in chat |
| `FIREBASE_SERVICE_ACCOUNT` | §3 |

`VITE_FIREBASE_PROJECT_ID` è anche la **guardia**: il deploy si ferma se
non coincide col progetto di destinazione, così i segreti sbagliati non
pubblicano il test sulla produzione.

Su `production`: *Settings → Environments → production → Required
reviewers* con l'utente. Senza quella spunta un tag su `main`
pubblicherebbe da solo. Verificare che ci sia.

Creare l'environment `test` da GitHub (*Settings → Environments → New
environment*), senza reviewer.

---

## 5. Le Functions sul test

- **Segreti** del progetto di test, con
  `npx firebase-tools functions:secrets:set <NOME> --project drink-regia-test`
  (il valore da un file, `< file`): `PROVISIONING_CALLBACK_SECRET` (un
  valore **diverso** da quello di produzione), `STRIPE_SECRET_KEY` e
  `STRIPE_WEBHOOK_SECRET` **in modalità test** di Stripe (chiavi `sk_test_…`
  e `whsec_…` di un endpoint webhook puntato a
  `https://europe-west1-drink-regia-test.cloudfunctions.net/stripeWebhook`),
  `GITHUB_DISPATCH_TOKEN` vedi sotto.
- **Configurazione non segreta per progetto**: Firebase legge
  `functions/.env.<progetto>` sopra `functions/.env`. Creare
  `functions/.env.drink-regia-test` con `FLOTTA_REF` e `APP_REF` a
  `develop`, e `functions/.env.drink-regia` con `APP_REF=main`. Committati tutti e due: non
  contengono segreti.
- **Il test non deve creare istanze vere senza volerlo.** Oggi
  `avviaProvisioning` lancia il workflow di tana-drink, che crea un
  progetto Google e lo paga. Due strade, da scegliere con l'utente:
  1. sul test **niente `GITHUB_DISPATCH_TOKEN`**: la richiesta finisce in
     `errore` con il messaggio del dispatch, e si prova tutto il resto
     (registrazione, Stripe test, backoffice, sospensioni);
  2. un flag `PROVISIONING_SIMULATO=true` in `functions/.env.drink-regia-test`
     che fa scrivere alla Function l'esito `attiva` con un progetto finto
     (`drinkpos-<slug>`, url `https://drinkpos-<slug>.web.app`) senza
     dispatch: da implementare in `functions/lib/provisioning.js`, con test.
  In ogni caso il **callback** del workflow di tana-drink torna
  all'indirizzo scritto nella variabile `REGIA_CALLBACK_URL` di quel
  repository, che è uno solo (la produzione). Per attivazioni vere dal
  test servirebbe un input `callback_url` nel dispatch e nel workflow:
  è un cambio di contratto (vedi `handover.md` §7), da chiedere
  all'utente per la sessione di tana-drink.

---

## 6. I tre workflow

Sostituiscono `.github/workflows/ci.yml`, che oggi fa tutto in uno
(test a ogni push, deploy solo da tag su `main` o a mano). Si tolgono
`ci.yml` e si aggiungono i tre qui sotto. Nel repository della regia i
push **non hanno avviato la CI da soli** finora: dopo averli messi,
verificare con un push su un ramo di lavoro che `Tests` parta; se non
parte, lanciare `gh workflow run test.yml --ref <ramo>` e aprire una
voce nei lavori aperti per capirlo.

### `.github/workflows/test.yml`

```yaml
name: Tests

# GIRA A OGNI PUSH, TRANNE SULLA LINEA DI RILASCIO (release/** è il posto
# di lavoro quotidiano: i test lì si fanno in locale). Sulle pull request
# verso develop e main gira anche la coverage. Un push non pubblica mai.
on:
  push:
    branches:
      - '**'
      - '!release/**'
  pull_request:
    branches:
      - develop
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  test:
    name: Lint, test e build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - name: Test con coverage
        if: github.event_name == 'pull_request'
        run: npm run test:coverage
      - name: Rapporto di coverage
        if: github.event_name == 'pull_request' && always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 14
```

Serve lo script `test:coverage` in `package.json`
(`vitest run --coverage`, con `@vitest/coverage-v8` tra le dipendenze di
sviluppo e le soglie in `vitest.config.mjs`, come in tana-drink: sono
un cricchetto, si alzano e non si abbassano).

### `.github/workflows/firebase-hosting.yml`

```yaml
name: Deploy to Firebase

# UN PUSH NON PUBBLICA. Pubblicano il tag o il lancio a mano:
#   tag su un commit di `main`   → PRODUZIONE (drink-regia), con approvazione
#   tag su qualsiasi altro commit → TEST (drink-regia-test), subito
#   lancio a mano su un ramo      → TEST, senza tag
# Il ramo non conta: conta dove sta il commit (job «Dove va»).
# I segreti stanno nelle GitHub Environments «production» e «test», con
# gli stessi nomi. L'approvazione è «Required reviewers» su «production».
on:
  push:
    tags:
      - '**'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: firebase-deploy
  cancel-in-progress: false

jobs:
  test:
    name: Lint e test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test

  destinazione:
    name: Dove va
    needs: test
    runs-on: ubuntu-latest
    outputs:
      ambiente: ${{ steps.scelta.outputs.ambiente }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - id: scelta
        run: |
          git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main
          if git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
            echo "ambiente=production" >> "$GITHUB_OUTPUT"
            echo "${GITHUB_REF_NAME} è su main → PRODUZIONE (con approvazione)."
          else
            echo "ambiente=test" >> "$GITHUB_OUTPUT"
            echo "${GITHUB_REF_NAME} non è su main → TEST."
          fi

  prova:
    name: Test
    needs: destinazione
    if: needs.destinazione.outputs.ambiente == 'test'
    uses: ./.github/workflows/deploy.yml
    with:
      ambiente: test
      progetto: drink-regia-test
      versione: ${{ github.ref_name }}
    secrets: inherit

  produzione:
    name: Produzione
    needs: destinazione
    if: needs.destinazione.outputs.ambiente == 'production'
    uses: ./.github/workflows/deploy.yml
    with:
      ambiente: production
      progetto: drink-regia
      versione: ${{ github.ref_name }}
    secrets: inherit
```

### `.github/workflows/deploy.yml`

```yaml
name: Deploy (riusabile)

# IL DEPLOY VERO, chiamato da firebase-hosting.yml. Sta a parte perché
# l'`environment:` deve essere scritto a chiare lettere: è quello che fa
# scattare l'approvazione sulla produzione.
on:
  workflow_call:
    inputs:
      ambiente:
        description: "Environment GitHub (production | test)"
        required: true
        type: string
      progetto:
        description: 'Progetto Firebase di destinazione'
        required: true
        type: string
      versione:
        description: 'Etichetta della versione pubblicata (il tag)'
        required: false
        type: string
        default: ''

permissions:
  contents: read

jobs:
  deploy:
    name: Pubblica su ${{ inputs.progetto }}
    runs-on: ubuntu-latest
    environment: ${{ inputs.ambiente }}
    env:
      TARGET_PROJECT: ${{ inputs.progetto }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm ci --prefix functions

      # La config del build deve corrispondere al progetto di destinazione:
      # con i segreti sbagliati si fallisce, non si pubblica altrove.
      - name: Guardia ambiente
        env:
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
        run: |
          if [ "$VITE_FIREBASE_PROJECT_ID" != "$TARGET_PROJECT" ]; then
            echo "::error::Config ($VITE_FIREBASE_PROJECT_ID) ≠ progetto di destinazione ($TARGET_PROJECT). Configura i segreti dell'environment GitHub."
            exit 1
          fi
          echo "Deploy su $TARGET_PROJECT — versione ${{ inputs.versione || github.ref_name }}."

      - name: Build
        env:
          VITE_APP_ENV: ${{ inputs.ambiente == 'production' && 'production' || 'test' }}
          VITE_APP_VERSION: ${{ inputs.versione || github.ref_name }}
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
        run: npm run build

      - name: Deploy regole Firestore, Functions e Hosting
        env:
          SA_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: |
          echo "$SA_JSON" > /tmp/sa.json
          GOOGLE_APPLICATION_CREDENTIALS=/tmp/sa.json \
            npx firebase-tools deploy --only firestore,functions,hosting \
            --project "$TARGET_PROJECT" --force
          rm /tmp/sa.json
```

`VITE_APP_ENV` e `VITE_APP_VERSION` sono nuove: servono a far mostrare
al sito un nastro «TEST» e la versione in piè di pagina quando non è
produzione (vedi §7). Non ci sono VAPID né reCAPTCHA: la regia non ha
push né App Check (quando l'audit porterà App Check, si aggiunge
`VITE_RECAPTCHA_SITE_KEY` qui e nei due environment).

---

## 7. Lato sito

- **Nastro «TEST»** quando `import.meta.env.VITE_APP_ENV !== 'production'`,
  e la versione (`VITE_APP_VERSION`, con `package.json` come ripiego) nel
  piè di pagina. In tana-drink è `VersionBadge`; qui basta una riga in
  `App.jsx`. Così chi guarda `drink-regia-test.web.app` sa cosa sta
  guardando.
- **Domini autorizzati di Auth**: il progetto di test ha i suoi
  (`drink-regia-test.web.app`, `firebaseapp.com`, `localhost`): nascono
  da soli.
- **Un test che legge i workflow**, come `tests/unit/flottaCi.test.js` in
  tana-drink: parsa i tre YAML e verifica che `main` vada su
  `production`, tutto il resto su `test`, che i job di deploy abbiano
  `environment:` scritto, che la guardia sul `PROJECT_ID` ci sia. Si
  cita in un requisito `REQ-DEV-002` del registro della regia.

---

## 8. Verifica, in ordine

1. Branch di lavoro (`release/0.1.0`): mettere i tre workflow, togliere
   `ci.yml`, aggiungere `test:coverage`, il nastro e il test dei
   workflow. Push: deve partire `Tests` (o si lancia a mano).
2. `gh workflow run firebase-hosting.yml -R redirect11/drink-regia --ref
   release/0.1.0`: deve finire su `drink-regia-test`. Aprire
   `https://drink-regia-test.web.app`: nastro «TEST», registrazione con
   email di verifica, accesso, claim admin con
   `node scripts/admin-regia.mjs --email … --project drink-regia-test`.
3. PR verso `develop`, merge, poi `git tag v0.1.0-beta` su `develop` e
   push del tag: deve pubblicare sul test da solo.
4. Solo col via libera dell'utente: PR verso `main`, tag `v0.1.0` su
   `main`, approvazione su GitHub, produzione. Subito dopo `package.json`
   a `0.2.0-beta` sul ramo nuovo.

---

## 9. Da aggiornare quando è fatto

`docs/handover.md` (§3: tag su `develop` per il test; §5: tabella dello
stato con il progetto di test), `README.md` (il test e i due environment),
`CLAUDE.md` (una riga: «un tag fuori da main va sul test»),
`requirements/requirements.yaml` (`REQ-DEV-002` con il test dei workflow),
e la nota in `functions/.env` sul file per progetto.
