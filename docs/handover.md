# Handover — la sessione che mantiene il sito della regia

Scritto il 22/10/2026 dalla sessione che ha costruito la regia dentro il
lavoro sulla «flotta» di tana-drink. Da qui in poi **la regia ha una
sessione sua**, con questo file come punto di partenza. Chi legge è un
agente Claude Code aperto nella cartella `C:\Users\Daniele\git\drink-regia`.
L'utente è Daniele: product manager, decide lui; parla e scrive in
italiano; relaziona le richieste di Flavio, il titolare del primo locale
(La Tana del Coniglio, Nola).

Leggi nell'ordine: questo file, [CLAUDE.md](../CLAUDE.md), [README.md](../README.md),
[audit-sicurezza-privacy.md](audit-sicurezza-privacy.md), e in tana-drink
`docs/flotta.md` e `docs/architettura-prodotto.md` (solo per capire il
quadro: lì non si lavora da questa sessione).

Per un prodotto nuovo dell'azienda, con la sua regia (il disegno deciso il
30/10/2026: Organizzazione col nome dell'azienda, vetrina, una regia per
prodotto): [nuovo-prodotto.md](nuovo-prodotto.md) e la scheda
[template-prodotto.md](template-prodotto.md).

Come sono fatte infrastruttura e pipeline: [architettura.md](architettura.md).
Dove si vuole arrivare (servizi base, statistiche aggregate, marketing tra
prodotti): [sviluppi-futuri.md](sviluppi-futuri.md), con la prima proposta di
[modello-di-business.md](modello-di-business.md). Il punto su saas-portal
prima di archiviarlo: [saas-portal.md](saas-portal.md).

---

## 1. Perimetro: cosa è tuo e cosa no

**Tuo** (repository `redirect11/drink-regia`, privato): il sito del
prodotto. Prima pagina, registrazione e accesso dei titolari, dashboard
del cliente, backoffice, abbonamento Stripe, Cloud Functions che lanciano
l'attivazione di un'istanza e ne ricevono l'esito, regole Firestore della
regia, listino (`functions/piani.json`), testi legali, questo documento.
Dal 29/10/2026 anche la flotta (REQ-FLOTTA-013,
[flotta-nella-regia.md](flotta-nella-regia.md)): il Terraform dei locali
(`infra/istanza`), i workflow `provisiona-istanza.yml` e
`aggiorna-istanza.yml`, lo script `scripts/licenza-istanza.mjs`.
Progetto Firebase **`drink-regia`** (Hosting, Auth, Firestore
`europe-west1`, Functions gen2 `europe-west1`), e `drink-regia-test`.

**Non tuo** (repository `redirect11/tana-drink`, pubblico, cartella
`C:\Users\Daniele\git\tana-drink`): l'app dei locali, il suo
`scripts/genera-cliente.mjs`, le cartelle `clienti/<slug>`. La build per
cliente è in `develop` di tana-drink dal 30/10/2026, e il ramo
`feature/flotta` è chiuso: quello che ancora serviva
(`ruoli-provisioning.mjs`, i controlli dei workflow) è passato qui, il
resto c'era già. Quando una modifica della regia richiede un cambio di
là (vedi §7, i contratti condivisi), **si scrive cosa serve e lo si
chiede all'utente**, che lo porta nella sessione di tana-drink. Non si
apre quel repository da qui per modificarlo.

La regia **non contiene mai dati operativi dei locali**: solo account dei
titolari, piani, abbonamenti, stato delle istanze.

---

## 2. Le regole che non si negoziano

Sono le stesse di tana-drink, adattate. Per esteso in `CLAUDE.md`.

- **Tutto in italiano**: interfaccia, commenti, commit, PR, risposte.
- **Non si scrive in produzione di propria iniziativa.** `firebase deploy`
  su `drink-regia`, Functions comprese, solo col via libera esplicito
  dell'utente, ogni volta. Un canale di anteprima di Hosting
  (`hosting:channel:deploy`) è comunque un deploy sul progetto: si chiede.
  Gli script che toccano Firestore o Auth di `drink-regia` idem.
- **Mai segreti in chat.** Chiavi di service account, chiavi Stripe,
  token GitHub, `sdkconfig`: passano per file nella scratchpad e `gh
  secret set` / `firebase functions:secrets:set`, e non si stampano mai.
  Se l'utente incolla una credenziale, non si usa e non si salva.
- **Prezzi** (`functions/piani.json`) e **nome del prodotto** (`src/lib/prodotto.js`)
  si cambiano solo su decisione dell'utente. Oggi sono segnaposto.
- **I test sono la specifica** e il registro `requirements/requirements.yaml`
  è la mappa: ogni richiesta lavorata nasce o aggiorna la sua voce
  (`REQ-*`), e codice, test e requisito vanno nello stesso commit.
  `tests/requisiti.test.js` controlla che ogni file di test sia citato
  da un requisito e che ogni test citato esista.
- **Tono professionale a schermo**: niente toni da venditore nemmeno
  nella landing page, niente «sblocca», «scopri», «acquista ora» (un test
  lo controlla). Il perché delle scelte va nei commenti del codice.
- **Commenti che spiegano il perché**, con la data e la frase dell'utente
  quando la scelta nasce da una sua richiesta.
- **Niente riscritture di massa, niente Prettier a tappeto, niente
  rinomini non richiesti.**
- **`npm run lint` va giudicato dal codice di uscita**, non dall'output:
  in tana-drink usciva 1 senza stampare; qui finora stampa, ma la
  regola resta.
- **Fetch prima di tutto**: `git fetch` di partenza e destinazione prima
  di commit, PR o merge. La base invecchia in minuti quando l'utente
  lavora su più sessioni.

---

## 3. Il processo: GitFlow, tag, rilasci

È lo stesso previsto per tana-drink (`docs/gitflow.md` là), con una
differenza: **la regia non ha un ambiente di test**. Il sito è uno, in
produzione su `drink-regia`. Si prova in locale e sui test automatici.

### I rami

- `main`: produzione. Solo merge via pull request dal ramo di rilascio.
- `develop`: integrazione. Solo merge via pull request.
- `release/x.y.z`: il ramo di lavoro, staccato da `develop`. Se ne esiste
  uno aperto, si lavora lì. Il lavoro finito si porta sul ramo di
  rilascio con merge locali (fast-forward o rebase, storia lineare);
  le PR sono solo verso `develop` e verso `main`.
- `feature/<nome>`: solo per una funzione grossa o quando l'utente lo
  chiede.
- `hotfix/<nome>`: nasce da `main`, un solo ramo cumulativo; PR verso
  `main`, poi `develop` fuso nel ramo e PR verso `develop` dallo stesso
  ramo.
- **Un worktree per ramo**: non si cambia ramo nella cartella
  principale, si fa `git worktree add ../drink-regia-<x.y.x> release/x.y.z`.
  In un worktree nuovo mancano `.env` e `node_modules`
  (`npm install` e `npm install --prefix functions`).

Il repository è privato sul piano gratuito: **GitHub non permette la
protezione dei rami**. Le regole «mai commit diretti su develop o main»
valgono per disciplina, non per vincolo tecnico. Nessuna eccezione.

### Stato di oggi (22/10/2026, sera)

`release/0.1.0` è aperto da `develop` (worktree `../drink-regia-0.1.0`)
e ci si lavora. `package.json` è a `0.1.0`: la prima pubblicazione sarà
il tag `v0.1.0-beta` su `develop` (sul test) e poi `v0.1.0` su `main`
(produzione); subito dopo il ramo di lavoro passa a `0.2.0-beta`.

### Il test segue develop, la produzione il tag su main

Decisione dell'utente del 30/10/2026: un push su `develop` va sul test, in
produzione va solo un tag su `main`. Prima pubblicava solo il tag, anche
sul test.

Tre workflow, gli stessi di tana-drink (`docs/actions-come-tana-drink.md`
è il disegno, `tests/ci.test.js` li legge e li controlla):

| Cosa si fa | Cosa succede |
|---|---|
| push su un ramo qualsiasi (tranne `release/**`) | `test.yml`: lint, test, build. |
| push su `develop` (cioè un merge di una PR) | in più va sul **test** (`drink-regia-test`), subito |
| pull request verso `develop` o `main` | lint, test, build **e coverage** (`npm run test:coverage`, soglie in `vitest.config.mjs`: un cricchetto, si alzano e non si abbassano) |
| lancio a mano di «Deploy to Firebase» su un ramo | va sul **test** (`drink-regia-test`), subito |
| tag su un commit **non** in `main` | **nessun deploy**: il job «Dove va» si ferma e lo dice |
| tag su un commit **di `main`** | va in **produzione** (`drink-regia`). L'approvazione a mano non c'è (GitHub Free, §6) |

Il ramo non conta: conta **dove sta il commit taggato** (job «Dove va» di
`firebase-hosting.yml`, con `git merge-base --is-ancestor`). Il deploy
vero è `deploy.yml`, riusabile, con l'`environment:` scritto a chiare
lettere: `test` o `production`, **stessi nomi dei segreti, valori del
loro progetto**. `VITE_FIREBASE_PROJECT_ID` è anche la guardia: se non
coincide col progetto di destinazione il deploy si ferma. Il sito fuori
dalla produzione porta un nastro «TEST» con la versione (`VITE_APP_ENV`,
`VITE_APP_VERSION`, in `App.jsx`).

**Stranezza nota, forse passata**: fino al pomeriggio del 22/10 i push
non avviavano `ci.yml` da soli; la sera il push su `release/0.1.0` ha
avviato `generate-issues.yml` senza aiuto. Dopo un push su un ramo che
non sia `release/**` si verifica che `Tests` sia partito, altrimenti
(funziona solo quando `test.yml` è su `main`, il ramo di default):

```sh
gh workflow run test.yml -R redirect11/drink-regia --ref <ramo>
gh run list -R redirect11/drink-regia -L 1
```

### Il rilascio, passo per passo

```sh
# 1. sul ramo di lavoro: package.json alla versione senza -beta, CHANGELOG datato
# 2. PR release/x.y.z -> develop (test verdi, cancello di qualità sotto)
# 3. tag -beta su develop: va sul test da solo
git fetch origin && git checkout develop && git pull
git tag vX.Y.Z-beta && git push origin vX.Y.Z-beta
# 4. si prova su https://drink-regia-test.web.app
# 5. PR develop -> main (sempre dal ramo di release, mai da altro), col via libera
# 6. tag su main, che pubblica in produzione:
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
# 7. su GitHub: Actions -> approvare il deploy nell'environment production
# 8. SUBITO DOPO, sul nuovo ramo di lavoro: package.json alla prossima con -beta
```

Mai tag su rami di release o hotfix. Per provare un ramo di lavoro sul
test senza tag: `gh workflow run firebase-hosting.yml -R
redirect11/drink-regia --ref <ramo>`. Il `CHANGELOG.md` esiste dal
22/10: una voce per ogni cambiamento visibile, nello stesso commit del
cambiamento.

### Il cancello di qualità, prima di ogni PR verso `develop`

```sh
npm run lint          # pulito (guardare il codice di uscita)
npm test              # verde: 106 test al 22/10/2026 (sera)
npm run test:coverage # le soglie di vitest.config.mjs reggono
npm run build         # compila
```

Più: registro dei requisiti aggiornato coi test citati, un giro di
refactoring sul diff (riuso, complessità, commenti sul perché: con
Claude, `/simplify`), CHANGELOG se c'è qualcosa di visibile. Non si
«sistema» un test per farlo passare: se fallisce, o il codice è
sbagliato o il test descriveva una cosa che si è deciso di cambiare, e
allora si cambia il test spiegando perché.

### Issue GitHub e bacheca

Le issue nascono dal registro, come in tana-drink:
`scripts/generate-issues.mjs` (con `lib-requisiti.mjs` e `bacheca.mjs`,
copiati di là il 22/10) le apre per le voci con `generate_issue: true`,
le riallinea, le chiude. Il workflow `generate-issues.yml` lo lancia a
ogni push che tocca `requirements/requirements.yaml` o
`requirements/bugs.yaml`: su `feature/**` e `release/**` una voce finita
porta la scheda su «Implemented», su `develop` su «In test» (etichetta
`in-test`), su `main` chiude l'issue. Le segnalazioni dell'utente
diventano voci `REQ-*` o, per i difetti, voci di `requirements/bugs.yaml`
(stesso formato; stati `todo`/`fixed`/`wontfix`, campo `in_produzione`,
`severity`, `priority`), da creare alla prima segnalazione.

**La bacheca** è il project GitHub **«drink-regia», n. 5**
(https://github.com/users/redirect11/projects/5), creato il 22/10 con le
stesse colonne di tana-drink (To triage, Backlog, Ready, Implemented, In
test, Done) e i campi Priority, Severity, Size, collegato al repository.
Perché le schede si muovano da sole servono due cose, ancora da fare:
il segreto `PROJECT_TOKEN` nel repository (un token personale con scope
`project`, lo stesso di tana-drink: lo mette l'utente) e, dal project
stesso, il workflow «Auto-add to project» sulle issue del repository
(non si imposta via API). Senza, le issue si aggiornano lo stesso e le
schede si spostano a mano.

---

## 4. Com'è fatta la regia

```
src/App.jsx                 barra con menù, rotte, piè di pagina
src/pages/Home.jsx          landing page (hero, funzioni, passi, prezzi, domande, contatti)
src/pages/Registrati.jsx    registrazione a 4 passi (locale, fatturazione, referente, consensi) + verifica email
src/pages/Accedi.jsx        email e password; recupero password
src/pages/Dashboard.jsx     il titolare: locale, piano, stato dell'istanza, attivazione, cambio piano
src/pages/SceltaPiano.jsx   piano, moduli, terminali, totale mensile
src/pages/Backoffice.jsx    admin, in sezioni sotto /backoffice/*: locali, richieste, rilasci, vendita, nuovo locale
src/lib/backoffice.js       le sezioni del backoffice, i contatori del sotto-menù, i filtri dei locali
src/pages/Legali.jsx        Termini e Privacy (struttura con segnaposto TITOLARE)
src/lib/prodotto.js         nome, slogan, dominio, URL demo, email contatti (segnaposto)
src/lib/piani.js            listino da functions/piani.json: prezzoMensile, moduliDellaScelta, euro
src/lib/clienti.js          il documento cliente (schema 2), slug dal nome, nomi riservati
src/lib/validazione.js      P.IVA, CF, email, password (10 caratteri con cifra), consensi
src/lib/db.js               Auth e Firestore lato client; callable
src/lib/istanze.js          stati di richieste e istanze, puoAttivare
src/lib/firebase.js         init da VITE_FIREBASE_*
functions/index.js          le Functions (sotto)
functions/lib/provisioning.js  payload del dispatch GitHub, callback, stati
functions/lib/abbonamento.js   Stripe Checkout e webhook
functions/lib/sospensione.js   chi sospendere e chiudere
functions/lib/licenza.js       piano+moduli -> licenza.moduli dell'istanza
functions/.env              GITHUB_REPO, GITHUB_REF, APP_REF (non segreti, committato)
firestore.rules             clienti, istanze, richieste, impostazioni
functions/piani.json        piani, moduli, terminale in più, attivazione
scripts/admin-regia.mjs     dà o toglie il claim admin a un account
scripts/abilita-api.mjs, abilita-accesso-email.mjs, lib-firestore.js  un progetto nuovo, dalla riga di comando (token del Firebase CLI)
scripts/segreti-environment.mjs  i VITE_FIREBASE_* di un environment GitHub dalla sdkconfig
scripts/generate-issues.mjs, lib-requisiti.mjs, bacheca.mjs  le issue dal registro e la bacheca (da tana-drink)
.github/workflows/          test.yml, firebase-hosting.yml, deploy.yml, generate-issues.yml
requirements/requirements.yaml  REQ-FLOTTA-002..011 (lato regia), REQ-DEV-001..003
tests/                      vitest, happy-dom; 17 file
```

**Firestore** (`drink-regia`): `clienti/{uid}` (titolare: locale,
fatturazione, referente, consensi, slug, piano, moduli, terminali,
abbonamento), `istanze/{slug}` (progetto, url, stato, licenza_stato,
versione), `richieste/{slug}` (stati: `da attivare`, `da approvare`, `in
coda`, `in corso`, `attiva`, `errore`), `impostazioni/regia`
(`deploy_automatico`). Il claim `admin` sul token apre il backoffice.

**Functions** (`functions/index.js`): `avviaProvisioning` e
`rilanciaProvisioning` (trigger su `richieste`, dispatch del workflow di
tana-drink), `esitoProvisioning` (HTTP, callback del workflow con bearer
`PROVISIONING_CALLBACK_SECRET`), `creaCheckout` e `stripeWebhook`,
`impostaStatoIstanza` (sospendi, riattiva, chiudi: scrive
`settings/bar.licenza` nell'istanza), `scadenza` (i compiti alle date,
REQ-FLOTTA-023), `aggiornaIstanza` (dispatch di `aggiorna-istanza.yml`),
`cambiaScelta`, `licenzaSegueIlPiano` (trigger su `clienti`),
`creaCliente` (admin). Il runtime è il compute SA di default di
`drink-regia`, che ha `datastore.user` su ogni istanza (da cambiare:
audit H4).

**Come si entra.** Auth email/password è attiva su `drink-regia` dal
22/10 (fatto via API, senza console). Ci si registra dal sito, poi:

```sh
gcloud auth application-default login   # oppure GOOGLE_APPLICATION_CREDENTIALS
node scripts/admin-regia.mjs --email <email>
```

e si esce e rientra: compare «Backoffice». Non esiste login con Google
nella regia (scelta del 22/10: prima l'MFA sugli admin).

**In locale.** `npm run dev` serve il sito; senza `.env` con le
`VITE_FIREBASE_*` di `drink-regia` è solo vetrina. Non ci sono emulatori
configurati in `firebase.json`: aggiungerli è nella lista. Le prove che
scrivono vanno sugli emulatori, mai sul progetto vero. Il check visivo
con l'estensione Chrome: i server avviati dal Bash dell'agente stanno in
una sandbox che Chrome non raggiunge; avviarli da PowerShell con
`Start-Process` e aprire `http://127.0.0.1:<porta>/`. Il 22/10 nemmeno
così Chrome arrivava in locale (pagina d'errore): da capire, o usare un
canale di anteprima col via libera.

---

## 5. Lo stato del progetto Firebase e dei segreti (22/10/2026, test il 29/10)

| Cosa | Stato |
|---|---|
| Hosting `drink-regia.web.app` | pubblicato una volta (hosting + regole), **senza la landing page nuova né il fix C2** |
| Functions | **nessuna pubblicata** |
| Progetto di test `drink-regia-test` | **creato il 29/10/2026**, su Blaze col secondo account di fatturazione («Il mio account di fatturazione 2», solo prove). API, Firestore `europe-west1`, Auth email, SA del deploy con i ruoli di docs/actions-come-tana-drink.md §3. Sito, regole e 17 Functions pubblicati dal tag `v0.1.0-prova.3` (ramo `feature/rilasci-a-ondate`). Segreti delle Functions: `PROVISIONING_CALLBACK_SECRET` (lo stesso della produzione: tana-drink ne conosce uno), Stripe **sandbox**; `ANTHROPIC_API_KEY` e `GITHUB_DISPATCH_TOKEN` **segnaposto** (il cassetto AI e le attivazioni vere non partono finché non si mettono quelli veri). |
| Environment GitHub `test` | **creato il 29/10/2026**: i quattro `VITE_FIREBASE_*` e `FIREBASE_SERVICE_ACCOUNT` |
| Approvazione sulla produzione | **non disponibile**: GitHub Free non dà i «Required reviewers» a un repository privato (provato il 29/10/2026, errore 422). Oggi protegge solo il job «Dove va» (un tag fuori da `main` va sul test). Decisione dell'utente: GitHub Pro, o accettare il controllo del workflow |
| Segreto `PROJECT_TOKEN` (bacheca) | **manca**: lo mette l'utente |
| Auth | email/password attivo |
| Firestore | `europe-west1`, regole pubblicate |
| Blaze | attivo |
| Environment GitHub `production` | segreti `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`; **manca `FIREBASE_SERVICE_ACCOUNT`** (chiave del SA di deploy: senza, il deploy da tag fallisce) |
| Segreti delle Functions | `PROVISIONING_CALLBACK_SECRET` presente; **mancano `GITHUB_DISPATCH_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`** e, dal ramo `feature/cassetto-ai` (24/10), **`ANTHROPIC_API_KEY`**: senza, il deploy delle Functions si ferma |
| Cassetto AI (REQ-AI-003) | **scritto, non pubblicato**, sul ramo `feature/cassetto-ai`. La chiave Anthropic e la ricarica automatica del credito Anthropic sono da impostare nella Console di Claude (vedi §7, «Cassetto AI») |
| `functions/.env` | `GITHUB_REPO=redirect11/drink-regia`, `FLOTTA_REF=main`, `APP_REF=main`: in produzione solo quello che è su `main` di tana-drink, quindi niente attivazioni finché la 1.10 non ci arriva. Il test usa `develop` (`functions/.env.drink-regia-test`) |
| Segnaposto da decidere (utente) | nome del prodotto «Drink», prezzi, email `info@drink.app`, dominio `drink.app`, dati della società in `Legali.jsx` |

Progetti collegati: `drinkpos-demo` (istanza dimostrativa,
https://drinkpos-demo.web.app, Auth email attiva), istanze future
`drinkpos-<slug>`. Il SA di provisioning è `provisioning@drink-regia`
(chiave in `PROVISIONING_SA_JSON` nel repository tana-drink).

---

## 6. I lavori aperti, in ordine

L'elenco completo con i riferimenti al codice è in
`docs/audit-sicurezza-privacy.md`, parte 3. Qui l'ordine operativo.

1. **Le quattro falle gravi dell'audit, prima di qualunque attivazione
   vera.** Lato regia: C2 (la richiesta di attivazione la crea una
   callable che verifica l'abbonamento sul server; via la `create` dai
   client in `firestore.rules`), H1 (allowlist dei campi che il titolare
   può modificare in `clienti/{uid}`). Lato tana-drink, da chiedere
   all'utente: C1 (input dei workflow via `env:`), H2 (chiave `licenza`
   di `settings/bar` non scrivibile dai client). La validazione lato
   Function degli input del dispatch (`nome_locale`, `piano`, `moduli`,
   `ref`) è della regia e va fatta qui.
2. **Presa visione al posto del consenso privacy** in `Registrati.jsx` e
   `validazione.js`; `marketing_il` e `versione_testi` in `clienti.js` e
   nelle regole.
3. **Testi legali**: titolare reale, Stripe/Google/GitHub con i ruoli,
   trasferimenti extra-UE, conservazione, decisione automatizzata,
   storage tecnico, versione; DPA art. 28 come allegato; Termini
   corretti su avviso, cancellazione, disdetta. Bozze da far rivedere a
   un consulente.
4. **Dashboard «Il tuo account»**: modifica dati, export, revoca
   marketing, disdetta (Stripe Billing Portal), eliminazione; blocco
   termini per i clienti creati dall'admin.
5. **Email di servizio**: pagamento fallito, sospensione tra sette
   giorni, sospesa, chiusa, attivata. Mittente e dominio verificati per
   le email di Auth.
6. **Medie dell'audit**: callback con `run_id` e scadenza; `cambiaScelta`
   nel ramo manuale con approvazione; idempotenza del webhook;
   header di sicurezza in
   `firebase.json`; App Check e `maxInstances`; creazione dell'admin
   dell'istanza (è un passo del workflow di tana-drink: da chiedere).
7. **Infrastruttura**: `FIREBASE_SERVICE_ACCOUNT` nell'environment,
   segreti Stripe e token GitHub, primo deploy delle Functions (col via
   libera), poi la prima attivazione dal sito sulla demo. Capire perché i
   push non avviano la CI. Emulatori in `firebase.json`. Spostare i
   workflow della flotta fuori dal repository pubblico (decisione
   dell'utente: riguarda tana-drink).
8. **Landing page**: verifica visiva desktop e telefono (non fatta il
   22/10), poi pubblicazione col via libera.
9. **Le Actions come tana-drink, con il progetto di test
   `drink-regia-test`**: istruzioni complete in
   [actions-come-tana-drink.md](actions-come-tana-drink.md). Il codice
   è fatto il 22/10 (tre workflow, coverage, nastro TEST, script, test
   dei workflow, issue e bacheca). **Restano i passi di infrastruttura**,
   col permesso dell'utente: progetto `drink-regia-test` (§2), service
   account del deploy per i due progetti (§3), environment `test` e
   segreti (§4, §5), «Required reviewers» su `production`, `PROJECT_TOKEN`,
   «Auto-add» sulla bacheca. Poi la verifica di §8.
10. **Quando la flotta è merged in tana-drink**: `GITHUB_REF` e `APP_REF`
   a `main` in `functions/.env`.
11. **Il cassetto AI (REQ-AI-003)**, ramo `feature/cassetto-ai`, scritto e
   provato il 24/10. Restano: le decisioni dell'utente (pacchetti o
   consumo, ricarico, cambio, importi dei pacchetti, tetto predefinito:
   oggi segnaposto in `functions/piani.json`); la chiave `ANTHROPIC_API_KEY` nei
   segreti delle Functions; la Tana registrata dal backoffice («Locale
   esistente») e la sua chiave della regia; il lato app in tana-drink
   (contratto in §7). Il ramo non va in `release/0.1.0` finché la chiave
   non c'è: Firebase non pubblica Functions con un segreto mancante.
12. **I rilasci a ondate (REQ-FLOTTA-012)**, ramo `feature/rilasci-a-ondate`
   (parte da `feature/cassetto-ai`, va unito dopo), scritto e provato il
   27/10. La regia è pronta e lavora già con il workflow di oggi. In
   tana-drink restano tre ritocchi (contratto in §7, «Rilasci a
   ondate»), da portare a quella sessione: la regia non tocca tana-drink.
13. **Quota dei progetti Google e organizzazione** (decisioni dell'utente
   del 27/10/2026). Il modello resta un progetto per locale. L'utente
   chiede a Google l'aumento della quota di progetti sull'account di
   fatturazione; intanto apre un **secondo account di fatturazione per le
   prove** (il primo regge progetti in produzione e non si tocca). Su
   quello vanno `drink-regia-test` e i progetti delle istanze di prova:
   il segreto `BILLING_ACCOUNT_ID` dell'environment `flotta-test` della
   regia (punto 14) punta al secondo account, e l'account di servizio del
   provisioning ha `roles/billing.user` su di esso. Senza organizzazione
   i progetti delle istanze si creano a mano (`drinkpos-<slug>`) e il
   workflow li importa. **L'organizzazione Google** (Cloud Identity Free,
   su un dominio nostro verificato) toglie questo passo: con `ORG_ID` il
   Terraform della regia crea il progetto da solo, in una cartella dei
   locali. Le organizzazioni nuove nascono
   con regole di sicurezza accese: `iam.allowedPolicyMemberDomains`
   blocca `allUsers`, quindi sulla cartella dei locali va allentata,
   altrimenti le Functions pubbliche delle istanze (callable e webhook)
   non si pubblicano; `iam.managed.disableServiceAccountKeyCreation`
   blocca le chiavi JSON degli account di servizio creati dentro
   l'organizzazione (la strada giusta è Workload Identity Federation da
   GitHub, senza chiavi). I progetti di oggi possono restare fuori
   dall'organizzazione. Ogni passo si fa col permesso dell'utente.
14. **La flotta nella regia (REQ-FLOTTA-013)**: su `main` dalla 0.2.0 e
   0.2.1 (PR #4–#7), environment `flotta` e `flotta-test` coi segreti,
   token limitato alla regia. Provata il 29/10/2026 con la prima
   attivazione vera (`prova-bar` sulla regia di test, run 40946898455):
   istanza attiva su https://drinkpos-prova-bar.web.app. Da provare ancora:
   un'attivazione su un progetto del tutto nuovo (su `prova-bar` il bucket
   di Storage l'avevo creato a mano e gli agenti di Google erano già nati).
   In tana-drink, da portare a quella sessione: via `provisiona-istanza.yml`,
   `aggiorna-istanza.yml`, `infra/`, `scripts/licenza-istanza.mjs` e i
   segreti della flotta.
15. **Eliminare un locale (REQ-FLOTTA-014)**, ramo `feature/elimina-locale`
   (parte da `feature/backoffice-leggibile`, PR #8), scritto il 29/10/2026.
   Prima di usarlo, col permesso dell'utente: i due bucket degli archivi e
   i loro permessi ([infra/README.md](../infra/README.md), punto 5), la
   variabile `ARCHIVIO_BUCKET` nei due environment. Poi la prova su
   `prova-bar`: chiudere, eliminare subito dal backoffice di test, scaricare
   l'archivio dalla dashboard del titolare. Il DPA, quando si scrive, deve
   dire le stesse durate dei termini (30 giorni, archivio 180).
16. **Il dominio** (domanda dell'utente del 29/10/2026: regia su
   `regiadrink.it`, locali su `<slug>.regiadrink.it`). Quando c'è: DNS su
   Cloud DNS in `drink-regia`; il dominio della regia una volta sul sito
   `drink-regia`; nel Terraform dei locali `google_firebase_hosting_custom_domain`
   e `google_dns_record_set` per `<slug>.<dominio>`, e il dominio fra quelli
   autorizzati di Auth. Firebase non accetta un `*.` diviso fra progetti:
   ogni locale registra il suo. `DOMINIO_ISTANZE` in `src/lib/prodotto.js`.
   Da decidere: il nome, e se i locali stanno sotto un livello dedicato
   (`<slug>.app.<dominio>`).
17. **Il piano Free (REQ-FLOTTA-015)**, ramo `feature/piano-free` (parte da
   `feature/elimina-locale`), scritto il 30/10/2026. Fatti: il piano nel
   listino coi limiti, la licenza coi limiti, `scegliFree`, la vendita
   dell'admin (Free e moduli), il profilo leggero nei workflow e il passaggio
   al completo quando il locale compra, il buco di `cambiaScelta` chiuso.
   Restano: in tana-drink le richieste di
   [richieste-tana-drink-free.md](richieste-tana-drink-free.md) (finché non ci
   sono, il Free resta fuori vendita). Il progetto senza fatturazione
   (Spark) è stato provato il 30/10/2026 su `drinkpos-prova-free` e non
   regge: Google non accende l'accesso con email (`BILLING_NOT_ENABLED`).
   Il profilo leggero ha quindi la fatturazione, ma nel Terraform solo
   database, regole, sito e accesso (infra/README.md, «I due profili»); il
   Free è a un solo utente, il titolare (`limiti.utenti_max: 1`), perché
   senza Functions non c'è `staffAdmin`. Il nome del prodotto è ancora da decidere
   (candidati: Floorder, Floorista, Comandry).
18. **Le prove dei moduli e «Cambia piano» (REQ-FLOTTA-016)**, sullo stesso
   ramo, 30/10/2026: i giorni di prova li decide l'admin nel riquadro
   «Vendita»; il titolare prova un modulo una volta sola dalla dashboard;
   alla scadenza il suo compito la spegne (REQ-FLOTTA-023). «Cambia piano» al posto di «Piano
   a mano», con Stripe o fuori da Stripe, e lo storico sul cliente.
19. **I pagamenti online spenti (REQ-FLOTTA-017)**, ramo
   `feature/pagamenti-online`, 30/10/2026. L'interruttore «Pagamenti online
   con Stripe» parte spento: **dopo il deploy, sulla regia di test va
   acceso dal backoffice** per provare Stripe in modalità test; in
   produzione si accende quando si è pronti a ricevere i pagamenti (chiavi
   live, webhook). Spento, i titolari chiedono di essere contattati.
20. **La demo in sola lettura (REQ-FLOTTA-019)**, ramo
   `feature/demo-sola-lettura`, 30/10/2026. La modalità demo la decide la
   build `CLIENTE=demo`, non un interruttore. La regia pubblica la demo
   sempre leggera e col database chiuso a tutti (`infra/demo/firestore.rules`).
   Restano: in tana-drink la modalità demo (REQ-FLOTTA-019 e
   `docs/modalita-demo.md`, ramo `feature/modalita-demo`; finché non è su
   `main`, `drinkpos-demo` non si aggiorna dalla regia), poi la demo
   registrata nella regia di produzione come locale esistente. Dopo la
   demo: l’accesso di assistenza della regia ai locali, a tempo e
   registrato, insieme al DPA.
21. **Gli aggiornamenti obbligatori o a scelta (REQ-FLOTTA-020)**, ramo
   `feature/aggiornamenti-a-scelta`, 31/10/2026. Due regole dell'admin in
   «Rilasci» (a scelta del titolare; solo finché si paga), la modalità
   fissabile per locale, il rilascio obbligatorio, la proposta con le note
   e la scelta dalla dashboard, il ritorno al Free di chi non paga. Le
   regole partono spente: con tutte e due spente non cambia niente.
   I termini (punti 3 e 5) e il testo dell'avviso (`testoAvviso` in
   `functions/lib/aggiornamenti.js`) li ha approvati l'utente il 31/10/2026:
   sono contrattuali, si cambiano con lui. Resta l'app in tana-drink
   (REQ-FLOTTA-020 e `docs/aggiornamenti-dalla-regia.md`, ramo
   `feature/aggiornamenti-a-scelta`). Per la Tana la
   proposta arriva nell'app solo quando la regia le scriverà la licenza.
22. **L'installazione on premise (REQ-FLOTTA-021)**, requisito di business
   da fare, 31/10/2026, per intero in [on-premise.md](on-premise.md). Il
   gestionale intero nel locale col backup sul cloud del locale, l'app
   sempre la stessa dietro delle porte (in tana-drink: REQ-FLOTTA-021,
   `docs/porte-e-adattatori.md`, ramo `feature/porte-e-adattatori`), niente
   emulatori di Firebase in produzione, l'immagine preparata e aggiornata
   dalla regia. Si comincia dalle porte in tana-drink; la regia lavora
   dopo il prototipo del backend locale. Prezzi, comodato e dominio li
   decide l'utente.
23. **La licenza protetta (BUG-125 di tana-drink, REQ-FLOTTA-022)**, ramo
   `feature/licenza-protetta`, 31/10/2026. La regia scrive la licenza
   intera, calcolata dai suoi dati, in `licenza/attuale` e in
   `settings/bar.licenza` (doppia scrittura). Il backoffice in «Rilasci»
   allinea e verifica tutti i locali (controlli/licenze), a richiesta: niente
   giri pianificati, per decisione dell'utente. E `lanciaAggiornamento` la scrive **prima di ogni deploy**,
   e senza non lancia: l'app arriva ai locali solo da lì, quindi nessuno
   riceve l'app nuova senza la sua licenza, e tana-drink può pubblicarla
   senza aspettare l'allineamento. «Allinea tutte» resta un controllo.
   Dopo, quando tutti i locali hanno l'app nuova: smettere di scrivere
   `settings/bar.licenza` (in `scriviLicenza`) e cancellare il campo.
24. **Le scadenze a eventi (REQ-FLOTTA-023)**, ramo `feature/scadenze-a-eventi`,
   31/10/2026. Via `sospendiMorosi`, `proveScadute` ed
   `eliminazioniProgrammate`: il locale cambia quando cambia lo stato
   dell'abbonamento, e ogni scadenza ha un compito alla sua data (la
   Function `scadenza`, una coda di Cloud Tasks). **Prima del deploy, su
   ogni progetto della regia**: l'API `cloudtasks.googleapis.com` accesa e
   `roles/cloudtasks.queueAdmin` all'account del deploy (su
   `drink-regia-test`: `firebase-adminsdk-fbsvc@`). Il runtime ha già
   Editor. **Dopo il deploy**: «Programma le scadenze» in «Rilasci», una
   volta. **In Stripe**, quando si accendono i pagamenti online: Billing →
   tentativi (Smart Retries) e, a tentativi finiti, «segna l'abbonamento
   come non pagato» (non «cancellalo»: chiuderebbe il locale). Nella regia
   non resta nessuna Function a tempo: anche la scelta del titolare
   dall'app è una chiamata (`sceltaDallApp`, REQ-FLOTTA-020).
25. **Le riduzioni al taglio della giornata (REQ-FLOTTA-024)**, ramo
   `feature/riduzioni-al-taglio`, 01/11/2026, su richiesta di tana-drink:
   con le regole che leggono la licenza a ogni scrittura, un modulo spento
   in servizio fa rifiutare le scritture in coda di un tablet senza rete.
   `scriviLicenza` confronta la licenza nuova con quella scritta: se
   toglie qualcosa (un modulo, un terminale, i limiti del Free, una
   sospensione per il pagamento) fino al taglio scrive quella di prima più
   le aggiunte, segna `istanze/<slug>.riduzione_al_taglio` = `{ dal, cosa }`
   e programma un compito «taglio» (la stessa coda delle scadenze). L'ora
   è `settings/bar.business_day_cutoff_hour` del locale, 5 se manca, ora
   di Roma. Quello che aggiunge, e gli stati voluti dall'admin o dal
   titolare, valgono subito. Un locale che nasce scrive subito. Nello
   stesso ramo: l'attivazione scrive la licenza **prima** del deploy, e lo
   script parte da `licenza/attuale`, non più da `settings/bar.licenza`.
26. **Senza licenza valida non si parte, e i dati di un locale fermo
   (REQ-FLOTTA-025)**, ramo `feature/conservazione-dati`, 02/11/2026.
   L'utente: senza licenza, o con la licenza scaduta, il prodotto non
   parte; con l'opzione «solo finché si paga» diventa Free senza perdere
   i dati; altrimenti i dati si cancellano «entro un tot», con gli avvisi.
   Decisioni: 90 giorni; al Free non si cancella niente; avvisi subito, a
   7 giorni e il giorno prima, per email, nella dashboard e nell'app. Nella
   regia: un locale sospeso o chiuso per il pagamento, o chiuso dall'admin,
   riceve un'eliminazione programmata a 90 giorni (`richiedente:
   'conservazione'`); tornare a pagare, o la riattivazione dell'admin, la
   annulla; una sospensione dell'admin no, è una pausa. Alla data un
   locale ancora sospeso si chiude e si cancella, sempre dopo il backup.
   Gli stessi avvisi valgono per le cancellazioni chieste dal titolare o
   dall'admin. **L'email** va nella collezione `mail` nel formato
   dell'estensione Firebase «Trigger Email»: finché l'estensione non è
   installata con un SMTP, i messaggi restano lì e partono quando c'è
   (decisione e credenziali dell'utente). **I termini** (punto 6) e
   l'informativa lo dicono: testo da approvare dall'utente. In tana-drink:
   `docs/licenza-valida.md` sul ramo `feature/licenza-valida` (regole
   che negano tutto senza licenza valida, `alla_scadenza`, l'avviso
   della cancellazione, la licenza della Tana).
27. **Il sito si presenta alla regia (REQ-FLOTTA-026)**, ramo
   `feature/presentazione-alla-regia`, 02/11/2026. L'utente: «non deve
   essere il deploy ad avvisare la regia ma l'istanza del sito stesso».
   Al primo avvio di ogni versione l'app chiama `presentazione` col token
   di chi ha fatto l'accesso; la regia riconosce il progetto, si segna la
   versione (`istanze/<slug>.presentazione`) e, se manca, riscrive la
   licenza. **Non è l'attivazione** (tana-drink, 02/11/2026): l'app non fa
   accessi anonimi, e su un'installazione nuova senza licenza la schermata
   «non attivata» copre anche l'accesso, quindi la licenza si scrive
   all'attivazione, prima dell'app, come dice il contratto.
   I workflow della regia mettono nella build `VITE_REGIA_PROGETTO`. **La
   Tana** si collega così quando: (1) la regia di produzione è online; (2)
   la regia ha `roles/datastore.user` sui progetti della Tana (comando da
   lanciare l'utente); (3) la sua istanza nella regia passa a
   `licenza_dalla_regia: true` (un interruttore da fare). Fino ad allora
   la licenza della Tana la crea il deploy di tana-drink, solo se manca
   (la loro PR #261), e la presentazione segna solo la versione. In
   tana-drink: `docs/presentazione-alla-regia.md`, ramo
   `feature/presentazione-alla-regia`.
28. **I pagamenti e le comunicazioni (REQ-FLOTTA-023, REQ-FLOTTA-027)**,
   ramo `feature/pagamenti-e-avvisi`, 02/11/2026, dopo la verifica dei
   casi d'uso chiesta dall'utente. Nella regia: con Stripe la licenza
   scade alla fine del periodo pagato (`abbonamento.pagato_fino`, dalla
   fattura pagata) più 7 giorni, e alla scadenza si chiede a Stripe;
   disdetto con «solo finché si paga» va al Free; chi torna a pagare
   riapre anche un locale chiuso per il pagamento; «Gestisci
   l'abbonamento» apre il portale clienti di Stripe; le email (promemoria
   dei pagamenti a mano, pagamento ricevuto, Free, riattivato) vanno nella
   coda `mail`. **Da fare a mano, dall'utente**:
   - **Resend**: un account, il dominio di invio verificato (record DNS),
     una chiave API. Poi su ogni progetto della regia l'estensione
     Firebase **Trigger Email** (`firebase/firestore-send-email`), con
     collezione `mail`, SMTP `smtps://resend:<CHIAVE>@smtp.resend.com:465`
     e mittente del dominio verificato. La chiave non passa mai di qui.
   - **Stripe**, quando si accendono i pagamenti online: Billing →
     tentativi entro **7 giorni**, poi «segna l'abbonamento come non
     pagato» (non «cancellalo»); Customer emails: ricevute, pagamento
     fallito, rinnovo in arrivo, carta in scadenza; Customer portal:
     disdetta **a fine periodo**, cambio carta, fatture.
   - Dopo il deploy, «Programma le scadenze» una volta: programma anche i
     promemoria dei pagamenti a mano già aperti.
29. **I codici sconto e la Tana premium (REQ-FLOTTA-028)**, ramo
   `feature/codici-sconto`, 02/11/2026. I codici in `sconti/{CODICE}`
   (li crea e disattiva l'admin in «Vendita», li applica con «Sconto…»
   sulla scheda); `clienti/{uid}.sconto` = `{ codice, percentuale,
   durata_mesi, dal, fino }`. Al 100% illimitato l'abbonamento ha
   `origine: 'sconto'` e non scade. **La Tana**, quando la regia di
   produzione è online: il codice `TANA-100` (100%, illimitato), applicato;
   poi «Pubblicazione e licenza…» → «La licenza la scrive la regia», che la scrive
   subito col piano Completo (fatture comprese). Prima serve il permesso,
   da dare l'utente: `gcloud projects add-iam-policy-binding tana-drink
   --member=serviceAccount:<account di runtime della regia>
   --role=roles/datastore.user` (e lo stesso su `tana-drink-test` con la
   regia di test). Se manca, l'interruttore torna spento e lo dice. Nella
   stessa verifica: **la regola dei clienti** lasciava al titolare
   `moduli`, `terminali` e `prove` (la regia ne fa la licenza): ora solo
   `locale`, `fatturazione`, `referente`, `consensi`.
30. **Il titolare, admin del suo locale (REQ-FLOTTA-029)**, ramo
   `feature/titolare-admin`, 02/11/2026. A ogni deploy della regia
   (`provisiona-istanza` e `aggiorna-istanza`, input `email`) lo script
   `scripts/titolare-istanza.mjs` fa sì che nel progetto del locale ci sia
   l'account del cliente, con ruolo `admin`, e finché non ha una password
   gli manda l'email di Firebase per impostarla. Mai su un locale
   esistente. **prova-bar e prova-free** (nati senza nessun account): dopo
   il merge, «Aggiorna subito» dal backoffice di test; prova-free prima ha
   bisogno del suo cliente («Nuovo locale», nome «Prova Free»).
   **L'accesso con Google al banco**, chiesto dall'utente, mancano due
   pezzi: (1) in tana-drink il banco (`BartenderPage.jsx`) entra solo con
   email e password, Google c'è solo nell'area clienti; (2) i progetti dei
   locali hanno solo email e password (`infra/istanza`, `sign_in.email`):
   il fornitore Google vuole un client OAuth per progetto, che Google non
   lascia creare da Terraform. Con la stessa email Gmail l'account resta
   quello, ruolo compreso (da provare sul test).
   **La demo** (`drinkpos-demo`, REQ-FLOTTA-019) oggi gira la 1.10.0-beta
   di `feature/flotta`, cioè prima della modalità demo: va ripubblicata.
   Ne è proprietario l'account di provisioning della regia di
   **produzione**, e va registrata lì come locale esistente (progetto
   `drinkpos-demo`, cartella `demo`, aggiornata dalla regia).
31. **Il passaggio fra la regia e l'app (REQ-FLOTTA-030)**, ramo
   `feature/passaggio-sso`, 02/11/2026. «Apri la tua app» e «Area
   clienti» con un codice monouso (lib/passaggio.js); i dati del titolare
   nelle impostazioni dell'app a ogni deploy. **Permessi, da dare
   l'utente** (per i locali nuovi li dà il Terraform):
   - su ogni locale, all'account della regia: `roles/firebaseauth.viewer`
     sul progetto e `roles/iam.serviceAccountTokenCreator` sull'account
     `firebase-adminsdk-fbsvc@<progetto>` (il secondo dato il 02/11/2026
     sui tre locali di test e sulla Tana);
   - su ogni regia, all'account della regia, `roles/iam.serviceAccountTokenCreator`
     su sé stesso: per firmare l'accesso alla regia dall'app.
   **Da fare**: in tana-drink la pagina che riceve il codice, «Area
   clienti», i campi nuovi; poi l'identità centrale (Identity Platform
   nella regia, il banco che entra con l'account della regia).
32. **Il catalogo dei temi (REQ-FLOTTA-032)**, ramo `feature/catalogo-temi`,
   02/11/2026, richiesto dall'app (tana-drink REQ-MENU-023, PR #274). La
   sezione «Temi» del backoffice crea, pubblica e ritira i temi
   (`temi/{id}`); `catalogoTemi` li dà all'app. **Come si prova**:
   pubblicare un tema sulla regia di test, poi su tana-drink-test
   Impostazioni → Aspetto → Marketplace: il tema compare in «Nel
   marketplace», e «Prova sul menù» mostra i suoi colori e il suo stile.
   Le basi coi loro colori sono copiate in `src/lib/temi.js` per
   l'anteprima: se tana-drink cambia una base, si cambia anche lì; uno
   stile nuovo dell'app si aggiunge a `STILI` (functions/lib/temi.js e
   src/lib/temi.js).
33. **I temi del repository (REQ-FLOTTA-033)**, ramo
   `feature/temi-nel-repository`, 02/11/2026. L'utente: «senza spendere
   crediti, tu potresti creare temi, o un agente». Un tema nuovo è una voce
   in `functions/temi/catalogo.json`: i test lo controllano (regole
   dell'app e contrasto), il deploy lo pubblica. Si ritira dal backoffice
   (la copia nel database vince); si cambia nel file. Così un agente può
   proporre temi con una PR, senza credito AI.
34. **Gli stili a ricetta (REQ-FLOTTA-034)**, ramo `feature/stili-a-ricetta`,
   02/11/2026. La forma del menù come scelta fra valori fissi
   (`functions/lib/stili.js`: il vocabolario e i caratteri), negli stessi
   modi dei temi: il repository (`functions/temi/stili.json`, sette
   stili), il catalogo pubblico, il ritiro dal backoffice. In tana-drink il
   motore che li disegna: `docs/stili-a-ricetta.md` sul ramo
   `feature/stili-a-ricetta`. Finché l'app non ce l'ha, scarta gli stili a
   ricetta e i temi che li usano: si possono pubblicare prima.

---

## 7. I contratti condivisi con tana-drink

Se cambia uno di questi, cambia anche l'altro lato, **nello stesso
giorno**, e lo si scrive all'utente perché lo porti nell'altra sessione.

Dal 29/10/2026 (REQ-FLOTTA-013, [flotta-nella-regia.md](flotta-nella-regia.md))
i workflow della flotta stanno nella regia: input del dispatch e callback
dei locali sono roba nostra, provata da `tests/flotta.test.js`, non più un
contratto. Con tana-drink restano l'app a un tag, la sua build, gli id dei
moduli, la licenza nell'istanza e la Tana.

- **La build di un locale** (`provisiona-istanza.yml`, `aggiorna-istanza.yml`
  qui, sull'app scaricata in `app/`): `npm ci` nella radice e in
  `functions/`; `node scripts/genera-cliente.mjs --slug … --nome …`;
  `npm run build` con `BASE_PATH=/`, `CLIENTE=<slug>`,
  `VITE_APP_ENV=production` e il `.env` con i `VITE_FIREBASE_*`;
  `functions/.env.<progetto>` con `VENUE_NAME`;
  `firebase deploy --only firestore,storage,functions,hosting`. Se
  tana-drink cambia uno di questi comandi, cambiano i nostri workflow.
- **I segreti che le Functions dell'app dichiarano** (`defineSecret`):
  oggi solo `SUMUP_API_KEY`. Stanno in `SEGRETI_APP` dei due workflow, che
  li creano nel progetto del locale col segnaposto `non-configurato` se
  mancano (`scripts/segreti-istanza.mjs`), senza mai sovrascriverli: il
  valore vero è del locale. Se l'app ne dichiara uno nuovo, si aggiunge
  lì, altrimenti Firebase non pubblica le Functions.
- **I limiti del Free e il profilo leggero** (REQ-FLOTTA-015, dal
  30/10/2026, per intero in [richieste-tana-drink-free.md](richieste-tana-drink-free.md)).
  La regia scrive `settings/bar.licenza.limiti` = `{ prodotti_max: 10,
  conti_aperti_max: 5, sconti: false, storico_giorni: 7, utenti_max: 1,
  marchio: true, comande: false }` (`comande: false` dal 31/10/2026:
  l'utente, «le comande fuori dal free, nel senso che la visualizzazione
  per comande non funziona»)
  per il Free, e `null` per i piani a pagamento. L'app applica i limiti solo
  se la voce c'è: senza, nessun limite (la Tana non ha la voce). Un locale
  Free si pubblica col profilo leggero (`--only firestore,hosting`): l'app
  deve lavorare senza le sue Functions e senza Storage. La regia passa anche
  `VITE_PROFILO` (completo o leggero) a ogni build delle istanze. Fatto in
  tana-drink il 30/10/2026 (PR #239, #240: REQ-LIC-003, REQ-LIC-004).
- **Le prove dei moduli** (REQ-FLOTTA-016): un modulo in prova è acceso in
  `licenza.moduli` come uno comprato, e `licenza.prove` = `{ magazzino:
  '<scadenza ISO>' }` dice fino a quando. L'app può mostrarlo («in prova
  fino al…»); non deve fare altro, la scadenza la gestisce la regia.
- **Id dei moduli.** `functions/piani.json` → `moduli[].id` e
  `functions/lib/licenza.js` (MAPPA, TUTTI) devono combaciare con
  `src/lib/licenza.js` (MODULI_PREMIUM) in tana-drink. Oggi: `menu_tavoli`, `ordini_cliente`, `clienti`,
  `magazzino` (porta `conta`, `fatture`, `scadenzario`), `statistiche`,
  `staff`, `sumup`. Il modulo del lettore si chiama `sumup` e **non**
  `pagamenti`, perché `pagamenti` è la sezione della cassa nel
  gestionale e il nome uguale la spegneva col piano base.
- **Slug**: lo stesso regex ovunque, `^[a-z][a-z0-9-]{4,28}[a-z0-9]$`
  (Functions, workflow, Terraform, `genera-cliente.mjs` in tana-drink).
- **Callback della Tana** `esitoProvisioning`: bearer
  `PROVISIONING_CALLBACK_SECRET`, corpo con `slug`, `stato`, `progetto`,
  `url`, `errore`, `versione`, `ref`, `ambiente`, `operazione` (sotto,
  «Rilasci a ondate»). È l'unico esito che arriva ancora da tana-drink.
- **Licenza nell'istanza** (BUG-125 di tana-drink, dal 31/10/2026):
  `licenza/attuale` = `{ piano, moduli: {id: bool}, terminali, limiti,
  prove, stato: attiva|sospesa|chiusa, motivo, dal, slug, regia_url,
  aggiornamenti, valida_fino, alla_scadenza, cancellazione, scritta_il }`.
  `valida_fino` (dal 31/10/2026, per tana-drink) è il momento in cui la
  regia fermerebbe il locale se nessuno paga: per un piano pagato a mano
  «pagato fino al» più i giorni di grazia, portato al taglio della giornata
  dopo (REQ-FLOTTA-024: mai a mezzanotte in servizio); `null` se non
  scade (Free, omaggi, interne, Stripe, dove decide lo stato
  dell'abbonamento). Nel database c'è anche `valida_fino_ts`, lo stesso
  istante come Timestamp di Firestore (`null` se non scade): tana-drink,
  02/11/2026, «le regole leggono la scadenza solo da valida_fino_ts […].
  Senza quel campo, lato server la licenza non scade mai». La verifica
  delle licenze vuole i due campi d'accordo. `alla_scadenza` (dal 02/11/2026, REQ-FLOTTA-025):
  `'free'` con «solo finché si paga», se no `'ferma'`: passata
  `valida_fino` l'app, anche senza rete, lavora col Free o si ferma.
  `cancellazione`: `{ il, richiedente: 'conservazione' | 'titolare' |
  'admin' }` se i dati del locale hanno una cancellazione programmata,
  per l'avviso nell'app; se no `null`. Dall'app la leggono tutti e non la scrive
  nessuno: prima stava in `settings/bar.licenza`, che ogni bartender può
  riscrivere. La regia la **calcola dai suoi dati** (`licenzaProtetta` in
  `functions/lib/licenza.js`) e la scrive intera a ogni cambio, in
  `licenza/attuale` e, finché tutti i locali non hanno l'app che legge solo
  quella, anche in `settings/bar.licenza`. La scrivono
  `scripts/licenza-istanza.mjs` alla prima attivazione, prima della
  consegna, e poi la sola `scriviLicenza` delle Functions. Con l'app nuova
  un locale senza `licenza/attuale` mostra «Installazione non attivata».
  Le regole chieste da tana-drink il 01/11/2026, che la regia rispetta:
  (1) ogni locale ha `licenza/attuale` **prima** di ricevere l'app nuova,
  e `moduli` nomina **tutti** i moduli (uno che manca per l'app vale «non
  incluso»): l'attivazione la scrive prima del deploy, ogni aggiornamento
  prima di lanciare; (2) `licenza/attuale` **non si cancella mai** a un
  locale attivo. Un locale si ferma con `stato: 'sospesa' | 'chiusa'`.
  L'utente, 02/11/2026: senza licenza, o con la licenza scaduta, il
  prodotto **non parte** né nell'app né nelle regole; «documento assente =
  nessun limite» non va (richiesta in tana-drink, REQ-FLOTTA-025);
  (3) gli sconti si spengono solo con `limiti.sconti: false`, un
  booleano: ogni altro valore, o la voce assente, vuol dire permessi;
  (4) quello che **toglie** (un piano più piccolo, un modulo, un
  terminale, il passaggio al Free, una sospensione per il pagamento)
  arriva al **taglio della giornata** del locale (REQ-FLOTTA-024): fino
  ad allora la licenza è quella di prima più le aggiunte. Le sospensioni e
  le chiusure dell'admin o del titolare valgono subito.
- **Il passaggio fra la regia e l'app** (REQ-FLOTTA-030, dal 02/11/2026).
  Dalla regia: l'app si apre a `<url del locale>/#accesso-regia=<codice>`;
  l'app toglie subito il codice dall'indirizzo e fa `POST
  https://europe-west1-<VITE_REGIA_PROGETTO>.cloudfunctions.net/scambiaPassaggio`
  col corpo `{ "codice": "…" }`: `200 { token }` da usare con
  `signInWithCustomToken`; `400` codice non valido; `403` scaduto, già
  usato o da un altro sito; `503` firma non riuscita. Verso la regia: il
  titolare (ruolo admin) fa `POST …/passaggioVersoRegia` con
  `Authorization: Bearer <ID token>` appena rinnovato (`getIdToken(true)`),
  e apre l'`url` della risposta (`200 { url }`; `401`, `403` non è il
  titolare o il token è vecchio, `404`). **I dati del titolare** in
  `settings/bar`, a ogni deploy, solo se vuoti: `venue_name`,
  `venue_legal_name`, `venue_address`, `venue_postal_city`, `venue_city`,
  e i nuovi `venue_phone`, `venue_vat_number`, `venue_tax_code`,
  `venue_legal_address`.
- **Il catalogo dei temi** (REQ-FLOTTA-032, dal 02/11/2026; in tana-drink
  REQ-MENU-023, `docs/marketplace-temi.md`). `GET
  https://europe-west1-<VITE_REGIA_PROGETTO>.cloudfunctions.net/catalogoTemi`,
  senza token, CORS aperto → `200 { temi: [{ id, nome, descrizione, prezzo:
  0, tavolozza: { base, colori }, stile }] }`, solo i pubblicati, in ordine
  di nome. La fonte della verità su cosa è un tema è `leggiTema` in
  `src/lib/marketplaceTemi.js` di tana-drink. Dal 02/11/2026 (REQ-FLOTTA-034)
  la risposta porta anche `stili: [{ id, nome, descrizione, prezzo: 0,
  ricetta }]`, gli stili a ricetta pubblicati, e un tema può avere come
  `stile` l'id di uno di loro. La ricetta, versione 1: `caratteri: { titolo,
  voce, testo }` (fra `CARATTERI` di functions/lib/stili.js), `titoli: {
  maiuscolo, corsivo, allineamento, dimensione, spaziatura }`,
  `intestazione`, `voce: { forma, prezzo, separatore, immagine }`,
  `cornice`, `angoli`, `sfondo`, `colori` facoltativi; i valori in
  `VALORI` dello stesso file. La regia manda sempre la ricetta completa.
- **La presentazione alla regia** (REQ-FLOTTA-026, dal 02/11/2026). Al
  primo avvio di ogni versione l'app fa `POST
  https://europe-west1-<VITE_REGIA_PROGETTO>.cloudfunctions.net/presentazione`
  con `Authorization: Bearer <ID token>` di un utente qualunque del
  locale e il corpo `{ "versione": "v1.10.4" }`. Il progetto della regia
  arriva nella build (`VITE_REGIA_PROGETTO`: `drink-regia` o
  `drink-regia-test`; l'app accetta solo quei due, come per
  `scelta_url`). Risposte: `200 { ok, licenza: 'scritta' | 'presente' |
  'non_dalla_regia' | 'non_attiva' }`; `400` versione non valida; `401`
  token mancante o non valido; `404` progetto che la regia non conosce;
  `503` la licenza non si è scritta. L'app la chiama una volta per
  versione nuova, con qualcuno collegato: mai a tempo, e mai senza
  sessione (niente accessi anonimi). Non attiva un'installazione: la
  licenza c'è prima dell'app (l'attivazione della regia, o il deploy di
  tana-drink per la Tana); se manca e un dispositivo ha ancora una
  sessione, la presentazione la fa riscrivere.
- **Gli aggiornamenti obbligatori o a scelta** (REQ-FLOTTA-020, dal
  31/10/2026, per intero in tana-drink, `docs/aggiornamenti-dalla-regia.md`).
  La regia scrive `settings/bar.licenza.aggiornamenti` = `{ modalita:
  'obbligatori' | 'a_scelta', inclusi, motivo: null | 'free' | 'non_pagato',
  proposta: null | { tag, note, proposta_il, saltata_il }, avviso: null |
  { id, testo, dal }, scelta_url }` (`licenzaAggiornamenti`, dentro
  `licenza/attuale`). La scelta del titolare l'app la manda con una
  chiamata: `POST <scelta_url>` con `Authorization: Bearer <ID token del
  titolare>`, il token che Firebase dà all'app nel progetto del locale, e
  il corpo `{ "tag": "vX.Y.Z", "scelta": "aggiorna" | "salta" }`. La regia
  (`sceltaDallApp`) riconosce il locale dal progetto del token, lo
  verifica, vuole il ruolo `admin` (il titolare) e applica subito.
  Risposte: `200 { ok, scelta }`; `400` corpo sbagliato; `401` token
  mancante o non valido; `403` non è il titolare; `404` locale
  sconosciuto; `409` la proposta non è più quella, o la stessa scelta è
  già arrivata (il titolare riprova: la seconda non fa niente); `502`
  l'aggiornamento non è partito, con `errore`. Dal 31/10/2026 al posto del documento
  `aggiornamenti/scelta` letto ogni dieci minuti. Le note sono le
  sezioni `## X.Y.Z — data` del `CHANGELOG.md` di tana-drink al tag: quel
  formato dei titoli è contratto. Senza la voce l'app fa come oggi.
- **Versione**: le istanze ricevono l'app di tana-drink al `ref` scelto
  dal backoffice (`main` o un tag `vX.Y.Z` di tana-drink); la regia ha
  la sua numerazione, indipendente.
- **Nome del prodotto e prefisso dei progetti**: `src/lib/prodotto.js`
  e `infra/istanza/main.tf` qui (`PREFISSO_PROGETTI = 'drinkpos'`).
- **Cassetto AI** (REQ-AI-003, dal 24/10/2026). L'installazione non
  chiama mai il modello e non ha la chiave di Anthropic: una Function
  **dell'installazione** (mai il browser: i clienti del locale hanno
  account sullo stesso progetto) fa
  `POST https://europe-west1-drink-regia.cloudfunctions.net/richiestaAI`
  con `Authorization: Bearer <slug>.<segreto>` (la chiave della regia,
  creata dal backoffice con «Chiave AI», nei segreti dell'installazione)
  e uno di questi corpi JSON:
  `{ "tipo": "descrizione", "nome", "produttore"?, "categoria"?, "note"? }`
  oppure `{ "tipo": "fattura", "file": <base64>, "media_type":
  "application/pdf" | "image/jpeg" | "image/png" | "image/webp" |
  "image/gif" }` (foto fino a 5 MB, PDF fino a 20 MB). Risposte:
  `200 { ok, tipo, risultato, costo_eur, credito_eur }`; `400` richiesta
  sbagliata; `401` chiave non valida; `402 { codice: credito | tetto |
  spento | senza-cassetto }` credito o tetto non bastano: **si ferma solo
  l'AI**; `422 { codice, costo_eur, credito_eur }` il modello non ha dato
  un risultato usabile (il costo resta); `503` servizio occupato, si
  riprova. `risultato` per la descrizione è `{ descrizione, da_verificare:
  [] }`; per la fattura `{ fornitore: { ragione_sociale, partita_iva },
  numero, data, righe: [{ descrizione, codice, quantita, unita,
  prezzo_unitario, sconto_percentuale, aliquota_iva, importo }],
  imponibile, iva, totale, da_verificare: [] }`, con `null` per i dati
  assenti. Tutto è una **proposta da rivedere** prima di pubblicarla o
  registrarla. Gli schemi stanno in `functions/lib/ai.js`.
- **Rilasci a ondate** (REQ-FLOTTA-012, dal 27/10/2026). La regia porta
  un rilascio ai locali un'ondata alla volta con `aggiorna-istanza.yml`
  (dal 29/10/2026 il suo, che manda già `"operazione"` nel callback). Il
  `ref` di un rilascio è sempre un tag `vX.Y.Z` di tana-drink. Lato
  tana-drink servono due cose:
  1. **Il tag e la versione combaciano.** La regia confronta la
     `versione` riferita (`v` + `package.json`) con il tag del rilascio,
     e usa la versione di prima come tag a cui tornare: il tag `vX.Y.Z`
     deve avere `package.json` a `X.Y.Z`.
  2. **La Tana riferisce la sua versione.** È un locale esistente: si
     pubblica dal suo repository, e l'ondata delle interne aspetta che
     riferisca il tag. Dopo un deploy di produzione riuscito, il
     workflow della Tana manda allo stesso callback
     `{ "slug": "<slug della Tana nella regia>", "stato": "attiva",
     "operazione": "aggiornamento", "versione": "vX.Y.Z", "ref":
     "vX.Y.Z", "ambiente": "produzione" }` con il bearer
     `PROVISIONING_CALLBACK_SECRET`. Su un locale esistente la regia
     registra solo la versione, mai lo stato.

---

## 8. Cose da sapere, imparate sbagliando

- `drink-demo` come id di progetto Google era già di qualcun altro: da
  qui il prefisso `drinkpos-`. Gli id sono globali, si controlla prima.
- Un progetto nuovo risponde `CONFIGURATION_NOT_FOUND` da Auth finché
  non è inizializzata: lo fa `identityPlatform:initializeAuth` (lo
  script di tana-drink lo fa; Terraform lo fa per le istanze).
- Il test della Home cerca i nomi dei moduli **nella tabella**: lo stesso
  nome compare anche tra le funzioni raccontate sopra.
- `euro()` mette il punto delle migliaia a mano: il Node della CI non ha
  i dati di lingua italiani.
- Nei test, `window.location` non si spia: si passa una funzione `vai`
  come prop.
- Le Writes dell'agente su file mai letti nella sessione falliscono: si
  legge prima.
- La memoria dell'agente è per cartella di progetto: questa sessione
  parte senza quella di tana-drink. Le decisioni dell'utente da
  conservare stanno qui e in `CLAUDE.md`; si scrivono lì, non si
  ridiscutono.
