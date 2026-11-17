# Development guide

The entry point for anyone who develops on **drink-regia**, the control
plane ("regia") of Lime – SmartOrders: the product website, the customer
dashboard, the back office, the Cloud Functions, and the fleet (the
Terraform and the GitHub workflows that create, update and delete one
Firebase project per venue).

This page is in English by decision of Daniele (17/11/2026: «la
documentazione in inglese per favore»), and it is an exception: code,
comments, commits, pull requests, issues and the requirements register
stay in Italian. It does not rewrite the existing documents: it tells you
which one to open, and it adds the one thing that was missing, a single
table of who does what in the life of a venue (REQ-FLOTTA-129).
`tests/documentazione.test.js` fails if a script of `scripts/` or a
workflow of `.github/workflows/` is not mentioned here, or if a relative
link on this page points to a file that does not exist.

## Read first

| Document | What it is for |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | the working rules (branches, tests as specification, who decides what). Binding for people and agents |
| [handover.md](handover.md) | the starting point of every session: scope, release process (§3), state of the project, open work, contracts with tana-drink (§7) |
| [architettura.md](architettura.md) | how infrastructure and pipelines are built: projects, accounts, Functions by family, the life of an instance (§4), pipelines (§5) |
| [flotta-nella-regia.md](flotta-nella-regia.md) | why the fleet lives in this repository since 29/10/2026, and what remains of the contract with tana-drink |
| [../infra/README.md](../infra/README.md) | the venue Terraform, the four jobs, the `ambiente` label, the two GitHub environments of the fleet, one-off prerequisites |
| [contratto-regia-app.md](contratto-regia-app.md) | every interface between the control plane and the venue app, and how to change one without breaking venues |
| [dipendenze-firebase.md](dipendenze-firebase.md) | every place where the control plane depends on Firebase or Google Cloud |
| [actions-come-tana-drink.md](actions-come-tana-drink.md) | the CI/CD design shared with tana-drink, and the deploy account roles |
| [DESIGN.md](../DESIGN.md) | how the home page must look and read |
| [audit-sicurezza-2026-11-09.md](audit-sicurezza-2026-11-09.md) | the latest security audit (control plane and app) |
| [../requirements/requirements.yaml](../requirements/requirements.yaml) | the requirements register: every requirement cites its tests |
| [../CHANGELOG.md](../CHANGELOG.md) | one entry per visible change; the top section is the version in progress |

## Setting up the computer

**Prerequisites**

- **Node.js 22**: the Functions declare `"node": "22"`
  (`functions/package.json`) and every workflow uses Node 22.
- **firebase-tools**: no global install needed. It is a devDependency
  pinned in `package.json` (15.36.0); run it as `npx firebase-tools …`.
- **Java 21**, only for the Firestore rules tests on the emulator
  (`npm run test:regole`; CI uses Temurin 21 in `test.yml`).
- **gcloud**: optional. The maintenance scripts do not need it: they take
  an access token from the Firebase CLI login (`scripts/lib-firestore.js`,
  `accessToken`). You need it only for the few manual commands written in
  [../infra/README.md](../infra/README.md) and
  [flotta-nella-regia.md](flotta-nella-regia.md) (project labels, an IAM
  binding by hand). The GitHub runners have it.
- **Terraform ≥ 1.6**, only to validate `infra/istanza/main.tf` locally
  (the workflows pin 1.9.8). Never `apply` from your computer.
- **Playwright's Chromium**, only for the end-to-end tests:
  `npx playwright install chromium`.

**Preparation**

```sh
npm install                      # the site, the tests, firebase-tools
npm install --prefix functions   # the Functions; the scripts load firebase-admin and google-auth-library from here
npx firebase-tools login         # the session the maintenance scripts use
```

A new git worktree has neither `node_modules` nor `.env`: install again
there (one worktree per branch, [handover.md](handover.md) §3, «I rami»).

**Configuration files**

- `.env` (git-ignored): the four `VITE_FIREBASE_*` of the project the
  local site talks to. Without them the site starts in "showcase" mode:
  prices are visible, nobody can register (`src/lib/firebase.js:17`).
  Point it at `drink-regia-test`, never at production.
- `functions/.env.drink-regia`, `functions/.env.drink-regia-test`
  (committed): non-secret per-project configuration of the Functions
  (`FLOTTA_REF`, `FLOTTA_AMBIENTE`, `RUNTIME_SERVICE_ACCOUNT`,
  `ARCHIVIO_BUCKET`, …). Secrets live in Secret Manager
  (`firebase functions:secrets:set --project <project>`), never here.
- `.env.e2e` (git-ignored): written by `scripts/semina-test.mjs`; read by
  `playwright.config.js`.

## Lint, tests, build

```sh
npm run lint            # ESLint, must be clean
npm test                # vitest: tests/**/*.test.js(x), without tests/regole
npm run test:coverage   # same, with the thresholds of vitest.config.mjs (a ratchet: raise them, never lower them)
npm run build           # Vite, into dist/
```

All three of lint, test and build must be green before a pull request
(CLAUDE.md). If vitest stops with `kill EPERM` on Windows, run
`npx vitest run --pool=threads` [observed on one development machine].

**Tests are the specification.** Every requirement in
`requirements/requirements.yaml` lists its `test_cases`; every test file
must be cited by at least one requirement, and every cited test must
exist (`tests/requisiti.test.js`). A new piece of work starts as a `todo`
entry in the register, in a commit of its own; `generate-issues.yml`
turns it into an issue (never by hand).

## Emulators

The only emulator in use is **Firestore**, for the security rules:

```sh
npm run test:regole          # starts the emulator (firebase.collaudo.json, port 8082, project demo-drink-regia), runs tests/regole/, stops it
npm run test:regole:vitest   # the same tests, against an emulator you started yourself
```

They run in CI on every pull request (`test.yml`, job «Regole Firestore
(emulatore)»). There is no emulator wiring for Auth, Functions or Hosting:
the site code never calls a `connect…Emulator` function, and the Functions
are tested through their pure modules in `functions/lib/` with vitest. To
see the site with real data, run `npm run dev` with a `.env` that points
at `drink-regia-test`.

## End-to-end tests (Playwright)

Configuration in `playwright.config.js`, tests in `e2e/`. They run
against the **test** control plane, with the people seeded by
`scripts/semina-test.mjs` (`npm run semina:test`, test projects only: the
project name must end in `-test`).

- Locally, without `E2E_URL`: the site is built with `npm run build:e2e`
  (the `.env.e2e` configuration) and served by `vite preview` on port
  4317; data and Functions are those of `drink-regia-test`.
- In CI (`e2e.yml`), against `https://drink-regia-test.web.app`. The
  read-only tests run after every deploy to test; the **acceptance run**
  («collaudo»: `e2e/collaudo-registrazione.spec.js`,
  `e2e/collaudo-licenza.spec.js`) writes, registers a real owner and
  updates a test venue, and runs only on tags. Accessibility checks
  (`e2e/accessibilita.spec.js`) are part of the read-only set: a violation
  stops the acceptance run, and therefore the production release.

## Release process

Branching and releases are described in [handover.md](handover.md) §3
(«Il processo: GitFlow, tag, rilasci», with «Il rilascio, passo per
passo»). In short:

- **Branches.** One branch per piece of work, from `develop`:
  `feature/<name>`, `fix/<name>`, `hotfix/<name>`, each with its pull
  request towards `develop`. Never commit directly to `develop` or `main`.
  One git worktree per branch. Merges are Daniele's.
- **A push never publishes.** `test.yml` runs lint, test, build and the
  dependency audits on every push; on pull requests also coverage and the
  rules on the emulator.
- **The tag publishes** (`firebase-hosting.yml`, job «Dove va»: what
  matters is where the tagged commit is, `git merge-base --is-ancestor`):

| What you do | What happens |
|---|---|
| tag on a commit **not** in `main` (`vX.Y.Z-beta` on `develop`) | `deploy.yml` to **test** (`drink-regia-test`), then `e2e.yml` with the acceptance run |
| tag on a commit of `main` (`vX.Y.Z`) | job «Collaudo riuscito sul test» looks for a successful run on an ancestor commit whose step «Collaudo sul test» is green **and** whose code is the same: between that commit and the tag only `docs/`, `requirements/`, `tests/`, `.claude/` and `*.md` may differ (REQ-FLOTTA-118). Then `deploy.yml` to **production** (`drink-regia`); without it, it stops and says why |
| manual run of «Deploy to Firebase» on a branch | **test**, read-only e2e, no acceptance run |

- **Step by step**: a release branch `release/x.y.z` from `develop` with
  the version without `-beta` and the dated CHANGELOG → PR to `develop` →
  tag `vX.Y.Z-beta` on `develop` → wait for «Collaudo sul test» → PR from
  the same branch to `main` → tag `vX.Y.Z` on `main` → immediately after,
  the next version with `-beta` as the first commit of the new line.
- **Who**: beta tags on test can be created by an agent when Daniele asks
  in chat, after his merge; the production tag only with Daniele's
  explicit go-ahead (CLAUDE.md, «Regola zero»).
- `deploy.yml` refuses to publish if `VITE_FIREBASE_PROJECT_ID` of the
  environment is not the target project («Guardia ambiente»).
- The fleet workflows run only from allowed refs: environment `flotta`
  only from `main`, `flotta-test` from `main` and `develop`
  ([../infra/README.md](../infra/README.md), «Da quale ramo o tag si usano
  gli environment»). The control plane dispatches them at `FLOTTA_REF`
  (`functions/index.js:131`, default `main`).

The venue app is **not** released from here: it comes from tana-drink at
a tag or at `main`, and reaches venues through `aggiorna-istanza.yml` in
waves (REQ-FLOTTA-012).

## Where things are

| Path | What |
|---|---|
| `src/` | the website: React + Vite. `pages/` (home, registration, dashboard, back office), `lib/` (logic, tested), `i18n/` (home texts in Italian and English), `components/`. Product name in `src/lib/prodotto.js` (changed only by Daniele) |
| `functions/` | the Cloud Functions (gen2, `europe-west1`): `index.js` (every export), `lib/` (pure logic, tested), `piani.json` (prices: changed only by Daniele), `temi/`, `.env.<project>` |
| `scripts/` | maintenance scripts and the scripts the fleet workflows run (table below) |
| `infra/` | `istanza/main.tf` (one venue project), `demo/` (the locked-down rules and headers of `drinkpos-demo`), `README.md` |
| `.github/workflows/` | CI, site deploy, fleet, issues (table below) |
| `requirements/` | `requirements.yaml`, the register; `bugs.yaml` for defects, when it exists |
| `tests/` | vitest tests (the specification); `tests/regole/` runs on the Firestore emulator |
| `e2e/` | Playwright tests against the test control plane |
| `docs/` | design documents, mostly in Italian; this page in English |
| `public/` | static files of the site (fonts, videos, favicon) |
| `firestore.rules`, `firebase.json`, `firebase.collaudo.json` | control plane rules, Firebase deploy configuration, emulator configuration for the rules tests |

### The scripts

| Script | Who runs it, with which credentials | What it does |
|---|---|---|
| `scripts/licenza-istanza.mjs` | `provisiona-istanza.yml`, provisioning key | writes the first licence (`licenza/attuale`) and the venue name |
| `scripts/storage-istanza.mjs` | `provisiona-istanza.yml` and `aggiorna-istanza.yml`, provisioning key | creates the default Storage bucket, then grants the Storage role (REQ-FLOTTA-124) |
| `scripts/segreti-istanza.mjs` | the same two, provisioning key | creates the secrets the app declares, with a placeholder; never overwrites |
| `scripts/titolare-istanza.mjs` | the same two, provisioning key | the owner account in the venue, same uid as in the control plane, `role: admin` |
| `scripts/account-ai-locale.mjs` | `aggiorna-istanza.yml` and `prepara-ai-locale.yml`, provisioning key | the `ai-locale@` account and its roles, for venues where Terraform did not create it |
| `scripts/archivia-istanza.mjs` | `elimina-istanza.yml`, provisioning key | the readable backup before deletion |
| `scripts/ruoli-provisioning.mjs` | a person, Firebase CLI login | roles of the provisioning account (billing, buckets, venue projects) |
| `scripts/account-runtime.mjs` | a person, Firebase CLI login | the runtime account of the control plane Functions, and its roles on venues (`--locale`) |
| `scripts/account-ai.mjs` | a person, Firebase CLI login | the `ai-regia@` account for the Anthropic federation |
| `scripts/ruoli-deploy.mjs` | a person, Firebase CLI login | APIs and roles of the control plane deploy account; with `--chiave` its key into a GitHub environment |
| `scripts/segreti-environment.mjs` | a person, `gh` | the `VITE_FIREBASE_*` of a GitHub environment from the sdkconfig |
| `scripts/abilita-api.mjs` | a person, Firebase CLI login | enables the APIs a control plane project needs |
| `scripts/abilita-accesso-email.mjs` | a person, Firebase CLI login | turns on email/password sign-in on a control plane project |
| `scripts/admin-regia.mjs` | a person, `GOOGLE_APPLICATION_CREDENTIALS` or application-default login | gives or removes the `admin` claim on a control plane account |
| `scripts/semina-test.mjs` | a person, Firebase CLI login (test projects only) | seeds or cleans the test venues and people; writes `.env.e2e` |
| `scripts/generate-issues.mjs` | `generate-issues.yml`, GitHub token | issues from the register |
| `scripts/bacheca.mjs` | imported by `scripts/generate-issues.mjs` (`PROJECT_TOKEN`) | moves cards on the GitHub project board |
| `scripts/lib-requisiti.mjs` | imported by `scripts/generate-issues.mjs` and `tests/requisiti.test.js` | reads the register |
| `scripts/lib-firestore.js` | imported | access token from the Firebase CLI login, argument parsing |
| `scripts/lib-iam.js` | imported | adds a member to an IAM policy; the Storage service agent and its role |
| `scripts/funzioni-fallite.mjs` | `provisiona-istanza.yml` (deploy step, between attempts), no credentials | reads a deploy log and prints the Functions firebase-tools lists as failed, so they can be deleted before retrying (REQ-FLOTTA-130) |
| `scripts/lib-deploy.js` | imported by `scripts/funzioni-fallite.mjs` | parses the «Functions deploy had errors with the following functions» list |
| `scripts/lib-semina.mjs` | imported by `scripts/semina-test.mjs` and the e2e tests | who the seeded test people are |

### The workflows

| Workflow | When | What |
|---|---|---|
| `test.yml` | every push except `release/**`, every PR to `develop` or `main` | lint, test, build, dependency audits; on PRs coverage and the rules on the emulator |
| `firebase-hosting.yml` | tags, manual run | decides test or production, calls `deploy.yml` and `e2e.yml`, checks the acceptance run before production |
| `deploy.yml` | called by `firebase-hosting.yml` | builds and deploys the control plane to the given environment (`test`, `production`) |
| `e2e.yml` | called after a deploy to test, or by hand | Playwright, read-only; with `collaudo: true` also the acceptance run |
| `provisiona-istanza.yml` | dispatched by the control plane (or a person) | the birth of a venue |
| `aggiorna-istanza.yml` | dispatched by the control plane (or a person) | a new app version for a venue; Free → complete |
| `elimina-istanza.yml` | dispatched by the control plane | verified backup, then deletion of a venue |
| `prepara-ai-locale.yml` | a person | the AI account of an existing venue outside the fleet (the Tana) |
| `generate-issues.yml` | push touching the register | opens, aligns and closes issues |
| `guardiano.yml` | every 30 minutes | checks from outside that each control plane's site and watchdog answer |

## The life of a venue, step by step

Who does each step, with which credentials, and which permissions or
roles that step grants. Verified on the code of `develop` at 1541a0d
(17/11/2026); line numbers refer to that commit. The design and the
reasons are in [architettura.md](architettura.md) §4 and
[../infra/README.md](../infra/README.md); here only the actors.

**The identities that appear below**

| Identity | What it is | Where its credentials are |
|---|---|---|
| provisioning account | `provisioning@drink-regia.iam.gserviceaccount.com`, the same for both control planes | JSON key in the secret `PROVISIONING_SA_JSON` of the GitHub environments `flotta` and `flotta-test` |
| runtime account of the control plane | the account the control plane Functions run as: `runtime-regia@<control plane>` when `RUNTIME_SERVICE_ACCOUNT` is set (`functions/index.js:98-102`), otherwise the Compute Engine default account. Same value as `REGIA_SA_EMAIL` | no key: Google's runtime |
| dispatch token | `GITHUB_DISPATCH_TOKEN`, fine-grained, Actions read and write on this repository only | Secret Manager of each control plane |
| callback secret | `PROVISIONING_CALLBACK_SECRET`, bearer of the workflow → control plane callback | Secret Manager and the fleet environment, same value |
| venue deploy account | `deploy@drinkpos-<slug>`, created by Terraform. No workflow of this repository deploys with it; tana-drink's e2e tests present its Google token to `istanzaDiProva` | no key in this repository |
| a person | Daniele, with his own Google login | his login (Firebase CLI or gcloud) |

### Before the first venue (once, by a person)

| # | What happens | Who | Credentials | Roles or permissions granted |
|---|---|---|---|---|
| 0.1 | The provisioning account may use the billing accounts and the buckets | `scripts/ruoli-provisioning.mjs` (`--billing`, `--bucket`) | a person (Firebase CLI login) | `roles/billing.user` on each billing account (`ruoli-provisioning.mjs:47-53`); `roles/storage.objectAdmin` on the Terraform state bucket and the archive bucket (`:54-60`) |
| 0.2 | The runtime account of the control plane exists, with the minimum it needs | `scripts/account-runtime.mjs --progetto <control plane>` | a person | on the control plane project: `datastore.user`, `firebaseauth.admin`, `logging.logWriter`, `eventarc.eventReceiver`, `run.invoker`, `cloudtasks.enqueuer`, `logging.viewer`; on itself `iam.serviceAccountTokenCreator` and `iam.serviceAccountUser`; to the control plane deploy account `iam.serviceAccountUser` on it (`account-runtime.mjs:55-71`, `:116-120`) |
| 0.3 | The archive bucket of each control plane: 180-day lifecycle, public access prevented | by hand ([../infra/README.md](../infra/README.md), «Prerequisiti», point 5) | a person | `roles/storage.objectAdmin` to the provisioning account (0.1); «Storage Object Viewer» to the runtime account, **by hand** (the script does not give it) |
| 0.4 | Fleet environments `flotta`, `flotta-test` with secrets and variables; Functions secrets | by hand | a person | none |

### Birth

| # | What happens | Who | Credentials | Roles or permissions granted |
|---|---|---|---|---|
| B0 | **Without a Google Cloud Organization** (no `ORG_ID`) a service account cannot create projects: a person creates `drinkpos-<slug>` (`npx firebase-tools projects:create`), links the right billing account, gives the provisioning account Owner, **and labels it `ambiente=produzione` or `ambiente=test`** (`gcloud projects update drinkpos-<slug> --update-labels ambiente=…`): an existing project without the label of the launching control plane stops B4 (`provisiona-istanza.yml:249-259`). With `ORG_ID` Terraform creates the project and the creator owns it | a person; `scripts/ruoli-provisioning.mjs --progetto` for the Owner role | a person | `roles/owner` to the provisioning account (`ruoli-provisioning.mjs:61-71`); the `ambiente` label |
| B1 | The owner presses «Attiva»: the request is rebuilt on the server and written in `richieste/{slug}`; with automatic deploy off it waits for the admin | Function `chiediAttivazione` (`functions/index.js:246`) | runtime account, control plane Firestore only | none |
| B2 | The workflow is dispatched at `FLOTTA_REF`, with `ambiente` from `FLOTTA_AMBIENTE` and the inputs taken from the customer document | `avviaProvisioning` / `rilanciaProvisioning` (`functions/index.js:270`, `:278`) → `lancia` (`:181`) | dispatch token | none |
| B3 | Inputs checked; the app version must be a release (`main` or `vX.Y.Z`) in production; the tana-drink commit is fixed | `provisiona-istanza.yml`, job `controlla` (`:125`) | **none** | none |
| B4 | The project belongs to this control plane? An existing project must carry the launching `ambiente` label (REQ-FLOTTA-100) | job `prepara`, step «Il progetto è di questa regia?» (`:249`) | provisioning key, environment `flotta` or `flotta-test` | none |
| B5 | `terraform init` (state in `TFSTATE_BUCKET`, prefix `istanze/<slug>`), import of an existing project and Firestore, `terraform apply` | job `prepara` (`:266`, `:282`, `:308`), `infra/istanza/main.tf` | provisioning key | see the next table |
| B6 | The app is built for the venue (`genera-cliente.mjs`, `CLIENTE=<slug>`) and packed as an artifact | job `compila` (`:348`) | **none**, no environment: the only job where tana-drink code runs (REQ-FLOTTA-047) | none |
| B7 | First licence and venue name in the venue Firestore (`licenza/attuale`, `settings/bar`) | job `pubblica` (`:455`), `scripts/licenza-istanza.mjs` (step `:506`; writes at `licenza-istanza.mjs:146-147`) | provisioning key (uses `roles/datastore.user` from B5) | none |
| B8 | *Complete profile only.* The default bucket `<project>.firebasestorage.app` is created through the Firebase Storage API (Terraform cannot: «Another user owns the domain»). **Then** the Storage service agent `service-<project number>@gcp-sa-firebasestorage.iam.gserviceaccount.com` gets its role, so that the Storage rules can read the licence in Firestore. It is given here and not in Terraform because the service agent is born with the bucket: on a new venue Terraform's grant failed with «Service account … does not exist» (REQ-FLOTTA-124, `main.tf:292-312`). The script retries for up to two minutes while the agent does not exist yet | `scripts/storage-istanza.mjs` (step `:516`; bucket `storage-istanza.mjs:44-60`, role `:62-95`) | provisioning key; writing the project IAM policy works because the provisioning account is Owner (B0) [to verify with `ORG_ID`, where the creator is Owner] | **`roles/firebaserules.firestoreServiceAgent`** to the Storage service agent (`scripts/lib-iam.js:28-29`) |
| B9 | *Complete profile only.* The secrets the app's Functions declare (`SUMUP_API_KEY`) are created with the placeholder `non-configurato` | `scripts/segreti-istanza.mjs` (step `:523`) | provisioning key | none |
| B10 | `firebase deploy --only firestore,storage,functions,hosting` (light profile: `firestore,hosting`), retried twice after 90 s. Before each retry, the Functions the attempt left half-created are deleted (`scripts/funzioni-fallite.mjs`, REQ-FLOTTA-130): on a new venue a failed first creation blocks the next attempt with «Changing from an HTTPS function to a background triggered function». The image repository `gcf-artifacts` already exists, created by Terraform with Firebase's own cleanup policy (`firebase-functions-cleanup`, images older than a day), so the first builds do not race its creation | step `:527` | provisioning key | none |
| B11 | The owner account in the venue: same uid as in the control plane, admin, password e-mail | `scripts/titolare-istanza.mjs` (step `:551`) | provisioning key (Auth permissions of `roles/firebase.admin`) | custom claim `role: 'admin'` on the owner's account (`titolare-istanza.mjs:60`): an app role, not an IAM one |
| B12 | Outcome to the control plane, always, even after a failure | step «Esito alla regia» (`:562`) → Function `esitoProvisioning` (`functions/index.js:293`) | callback secret | none |
| B13 | On `attiva`: update rules, first licence computed by the control plane, owner data in `settings/bar` | `esitoProvisioning` → `scriviLicenza(slug, { subito: true })` (`functions/index.js:359`), `scriviDatiDelLocale` (`:1767`), through `firestoreDi` (`:826-833`) | runtime account (uses the B5 roles on the venue) | none |

**What B5 (Terraform, `infra/istanza/main.tf`) grants on the new project**

| Resource | Member | Roles |
|---|---|---|
| `google_project.istanza` (`:123-136`) | — | labels `prodotto`, `slug`, `ambiente`, `profilo`; billing account; `deletion_policy = "PREVENT"` |
| `google_project_iam_member.deploy` (`:200-220`) | `deploy@drinkpos-<slug>` (created here) | `firebase.admin`, `cloudfunctions.admin`, `run.admin`, `iam.serviceAccountUser`, `serviceusage.serviceUsageConsumer`, `storage.admin` |
| `google_project_iam_member.provisioning` (`:232-246`) | provisioning account | the same six, plus `datastore.user` |
| `google_project_iam_member.agente_eventarc` (`:264-270`) | Eventarc service agent (complete profile) | `eventarc.serviceAgent` |
| `google_project_iam_member.agente_pubsub` (`:272-278`) | Pub/Sub service agent (complete profile) | `iam.serviceAccountTokenCreator` |
| `google_project_iam_member.regia` (`:316-321`) | runtime account of the control plane (`REGIA_SA_EMAIL`) | `datastore.user`: writes the licence (suspend, reactivate, close) |
| `google_project_iam_member.regia_account` (`:328-333`) | the same | `firebaseauth.viewer`: reads the owner account for the hand-off to the app |
| `google_service_account_iam_member.regia_firma` (`:335-341`) | the same, on `firebase-adminsdk-fbsvc@drinkpos-<slug>` | `iam.serviceAccountTokenCreator`: signs the hand-off as the venue's SDK account |
| `google_project_iam_member.ai_locale` (`:355-364`) | `ai-locale@drinkpos-<slug>` (created here) | `datastore.user`, `logging.logWriter` |
| not here | Storage service agent | `firebaserules.firestoreServiceAgent` comes from B8; the old resources leave the state without being destroyed (`removed` blocks, `:300-312`) |

### Update

| # | What happens | Who | Credentials | Roles or permissions granted |
|---|---|---|---|---|
| U1 | Someone asks for a new version: the admin («Aggiorna», `aggiornaIstanza`, `functions/index.js:1316`), a rollout wave (`gestisciRilascio`, `:1339`), the owner's choice (`sceltaAggiornamento` `:1706`, `sceltaDallApp` `:1725`, via `applicaScelta` `:1648`), a Free venue that buys (`licenzaSegueIlPiano` `:2319`, `autorizzaProfiloCompleto` `:2375`) | Functions of the control plane | admin claim, or the owner's account | none |
| U2 | **The licence first**: if it cannot be written, the update does not start; then the workflow is dispatched | `lanciaAggiornamento` (`functions/index.js:1265`; licence at `:1287`) | runtime account (venue Firestore), then dispatch token | none |
| U3 | Inputs and app version, as B3; also the demo/real-venue guards | `aggiorna-istanza.yml`, job `controlla` (`:125`) | **none** | none |
| U4 | The project must carry the `ambiente` label of this control plane, with no exception (REQ-FLOTTA-048) | job `prepara`, step `:250` | provisioning key | none |
| U5 | *Free → complete only*: Terraform apply with the complete profile, only if the state lacks the Functions API; a project without Terraform state (an existing venue) is left alone | step «Il profilo completo nel progetto» (`:272-298`), `infra/istanza/main.tf` | provisioning key | the complete-profile resources of the B5 table (APIs, Eventarc and Pub/Sub agents) |
| U6 | Web configuration of the venue (`firebase-tools apps:sdkconfig`) → artifact | step `:309` | provisioning key | none |
| U7 | Build of the app at the checked commit | job `compila` (`:341`) | **none** | none |
| U8 | *Complete profile.* Bucket if missing, and the Storage role: **this is where venues activated before REQ-FLOTTA-124 receive it**, before the new rules are deployed | `scripts/storage-istanza.mjs` (step `:558`) | provisioning key | `roles/firebaserules.firestoreServiceAgent` to the Storage service agent, if missing |
| U9 | *Complete profile.* Secrets the new app version declares | `scripts/segreti-istanza.mjs` (step `:562`) | provisioning key | none |
| U10 | *Complete profile, not the demo.* The `ai-locale@` account, created if missing, with Terraform's roles; for an existing venue also lets its deploy account act as `ai-locale`. A failure is a warning and the deploy continues (the venue's AI stays off) | `scripts/account-ai-locale.mjs` (step `:573`) | provisioning key | `datastore.user`, `logging.logWriter` to `ai-locale@`; with `--deploy`, `iam.serviceAccountUser` on `ai-locale@` only |
| U11 | Demo only: locked rules and headers from `infra/demo/` | steps `:588`, `:605` | provisioning key | none |
| U12 | Deploy, as B10 | step `:613` | provisioning key | none |
| U13 | Owner admin, as B11 (not for an existing venue) | `scripts/titolare-istanza.mjs` (step `:637`) | provisioning key | custom claim `role: 'admin'` |
| U14 | Outcome; on `attiva` the control plane rewrites the licence and the owner data | step `:647` → `esitoProvisioning` (`functions/index.js:341-342`) | callback secret, then runtime account | none |

An **existing venue outside the fleet** (the Tana) gets its AI account
from `prepara-ai-locale.yml`: label check, then
`scripts/account-ai-locale.mjs --deploy firebase-adminsdk-fbsvc@<project>`,
with the provisioning key. Its Storage role, if missing, is a manual
`gcloud` command ([flotta-nella-regia.md](flotta-nella-regia.md)).

### Suspension and reactivation

No workflow and no Terraform: the control plane writes the licence
directly in the venue Firestore. The app reads `licenza/attuale` and stops
or restarts by itself ([contratto-regia-app.md](contratto-regia-app.md)
§1).

| # | What happens | Who | Credentials | Roles or permissions granted |
|---|---|---|---|---|
| S1 | The admin presses «Sospendi», «Riattiva» or «Chiudi» | `impostaStatoIstanza` (`functions/index.js:856`) → `scriviStatoIstanza` (`:838`) | admin claim; runtime account | none |
| S2 | The subscription changes state (Stripe, or a manual payment that expires): suspend or close for payment, keep the data 90 days; on payment, reactivate and cancel the scheduled deletion | `licenzaSegueIlPiano` (`:2319`) → `eseguiAzionePagamento` (`:991`), `conservaDati` (`:1014`), `annullaConservazione` (`:1060`); manual payments through the Cloud Tasks job `scadenza`, type `pagamento` (`:1083`) | runtime account | none |
| S3 | A payment suspension waits for the moment outside service hours: a Cloud Tasks job writes it then | `scriviLicenza` schedules `sospensione` (`:1540-1545`) via `programma` (`:1070`); `scadenza` type `sospensione` (`:1143`) | runtime account (`cloudtasks.enqueuer` from 0.2) | none |
| S4 | The licence is computed from the control plane data and written to `licenza/attuale` and, until every venue runs the new app, to `settings/bar.licenza` | `scriviLicenza` (`:1517`; writes at `:1561-1564`) through `firestoreDi` (`:826-833`) | runtime account, using `roles/datastore.user` on the venue (`main.tf:316-321`, or `scripts/account-runtime.mjs --locale` during a switch of runtime account) | none |

A simulated venue (REQ-FLOTTA-072) changes only its control plane
document; a registered existing venue that does not take its licence from
the control plane is refused (`functions/index.js:841-852`).

### Closure and deletion

| # | What happens | Who | Credentials | Roles or permissions granted |
|---|---|---|---|---|
| C1 | **Closure.** The admin closes («Chiudi», S1: data kept 90 days); or the owner closes and asks for deletion, which starts in 30 days and can be cancelled; or the admin asks for the deletion of an already closed venue, now or in 30 days. Both confirm by typing the project name | `impostaStatoIstanza` (`:856`, `:861-864`); `gestisciEliminazione` (`:3260`) | admin claim or the owner's account; runtime account; Stripe key for the end-of-period cancellation | none |
| C2 | At the due date (or immediately for the admin): a venue still suspended after 90 days is closed, then the workflow is dispatched | `scadenza` type `eliminazione` (`:1155`) → `lanciaEliminazione` (`:3233`) | runtime account, dispatch token | none |
| C3 | **Belongs to this control plane?** `ambiente` label **and** Terraform state in `istanze/<slug>/`; otherwise stop before reading anything (REQ-FLOTTA-048) | `elimina-istanza.yml`, job `elimina` (`:50`), step `:98` | provisioning key (`google-github-actions/auth`, `:81`), environment `flotta` or `flotta-test` | none |
| C4 | Readable backup: `dati.json`, `utenti.json` (no password hashes), `file/`, `manifesto.json`, zipped | `scripts/archivia-istanza.mjs` (step `:115`) | provisioning key (`datastore.user`, `storage.admin`, Auth through `firebase.admin`) | none |
| C5 | Native Firestore export into the venue's own bucket, under `_backup-eliminazione/`. A light-profile (Free) venue has no such bucket, because B8 runs only for the complete profile: [to verify] this step then fails, and the project is not deleted | `gcloud firestore export` (step `:121`) | provisioning key | none |
| C6 | Everything copied to `ARCHIVIO_BUCKET` (kept 180 days, then deleted by the bucket lifecycle) | step `:127` | provisioning key (`storage.objectAdmin` from 0.1) | none |
| C7 | Verification: zip size, manifest, complete export; otherwise the project is **not** touched | step `:136` | provisioning key | none |
| C8 | `gcloud projects delete` (Google can restore it for 30 days), then the Terraform state is removed. Terraform's `deletion_policy = "PREVENT"` does not apply: this path does not go through Terraform | steps `:152`, `:156` | provisioning key (Owner, from B0) | every role on the project disappears with it |
| C9 | Outcome with the archive path; the control plane records it | step `:163` → `esitoProvisioning`, `eliminazione` branch (`functions/index.js:300-311`) | callback secret | none |
| C10 | Only the owner downloads the archive: a signed link valid 15 minutes | `scaricaArchivio` (`:3332`) | runtime account: Storage Object Viewer on the archive bucket (0.3, by hand) and `iam.serviceAccountTokenCreator` on itself (0.2) | none |

## Things that are easy to get wrong

- **A permission that Terraform does not show.** The Storage role of B8
  and U8 comes from `scripts/storage-istanza.mjs`, the AI account of U10
  from `scripts/account-ai-locale.mjs`, the Owner role of B0 from a person.
  Reading `infra/istanza/main.tf` alone is not enough: use the tables
  above.
- **The `ambiente` label decides who may touch a project.** Both control
  planes use the same provisioning key; the label is the only thing that
  separates production venues from test venues (REQ-FLOTTA-048,
  REQ-FLOTTA-100).
- **Workflow inputs are a contract.** GitHub rejects a dispatch with an
  input the workflow does not declare
  ([flotta-nella-regia.md](flotta-nella-regia.md)), so a new input must be
  on the ref the control plane dispatches (`FLOTTA_REF`: `main` in
  production, `develop` on test) before the Functions that send it are
  deployed. The inputs are listed in
  [contratto-regia-app.md](contratto-regia-app.md) §12; how to change an
  interface is at the top of that document.
- **Never write to production on your own initiative**: deploys, scripts
  and trials go to `drink-regia-test` or to the emulator.
