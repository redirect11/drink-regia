# Handover — la sessione che mantiene il sito della regia

Scritto il 22/10/2026 dalla sessione che ha costruito la regia dentro il
lavoro sulla «flotta» di tana-drink. Da qui in poi **la regia ha una
sessione sua**, con questo file come punto di partenza. Chi legge è un
agente Claude Code aperto nella cartella `C:\Users\Daniele\git\drink-regia`.
L'utente è Daniele: product manager, decide lui; parla e scrive in
italiano; relaziona le richieste di Flavio, il titolare del primo locale
(La Tana del Coniglio, Nola).

Leggi nell'ordine: questo file, [CLAUDE.md](../CLAUDE.md), [README.md](../README.md),
[audit-sicurezza-2026-11-09.md](audit-sicurezza-2026-11-09.md) (l'audit più
recente, regia e app insieme; quello del 22/10,
[audit-sicurezza-privacy.md](audit-sicurezza-privacy.md), resta per la
parte GDPR), e in tana-drink
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
- **Un ramo per ogni lavoro, staccato da `develop`** (decisione di Daniele
  del 12/11/2026). `feature/<nome>` per una cosa nuova, `fix/<nome>` per
  una correzione, `hotfix/<nome>` per una correzione urgente. Ognuno ha
  la sua pull request verso `develop`, che unisce Daniele.
  FINO AL 12/11/2026 la regola scritta qui era un'altra: il lavoro su
  `release/x.y.z`, `feature/` solo per una funzione grossa, `hotfix/` da
  `main`. Ma da fine ottobre il lavoro andava già per rami singoli con la
  loro PR, e Daniele le univa una per una. Messo davanti alla
  differenza, ha scelto la pratica: «usa questa: una ventina di rami
  feature/, fix/ e hotfix/, tutti staccati da develop, ognuno con la sua
  PR». I rami `release/0.1.0`…`release/0.3.0` restano nella storia.
  IL RILASCIO IN PRODUZIONE (dalla 0.3.0, 13/11/2026; Daniele: «prima vai
  su test e poi su produzione»): un ramo di rilascio si stacca da
  `develop` quando develop è quello che va in produzione, e porta solo la
  versione senza `-beta` e il CHANGELOG datato. Prima una PR verso
  `develop`, poi il tag `-beta` su develop col collaudo, poi una PR dallo
  stesso ramo verso `main`, poi il tag `vX.Y.Z` su main. Il nome è
  `release/x.y.z`; per la 0.3.0 è `release/0.3.0-produzione`, perché
  `release/0.3.0` è il ramo vecchio rimasto nella storia. Un hotfix,
  quando `main` e `develop` saranno diversi, si stacca da `main` e ha due
  PR, verso `main` e verso `develop`.
- **Un worktree per ramo**: non si cambia ramo nella cartella
  principale, si fa `git worktree add ../drink-regia-<nome> -b feature/<nome> origin/develop`.
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

### A pubblicare è il tag: il test col collaudo, la produzione se il collaudo è riuscito

Decisione dell'utente del 09/11/2026: «i rilasci solo su tag». Dal 30/10
un push su `develop` pubblicava sul test da solo: il test cambiava sotto
le mani di chi ci stava provando, e un rilascio non era un gesto. Ora,
come in tana-drink, pubblica solo il tag; e il tag sul test porta con sé
il **collaudo** (REQ-DEV-009), le prove che scrivono e che il giro
Playwright in sola lettura evita apposta: la registrazione vera di un
titolare (poi eliminato dall'admin), la licenza del locale di prova
sospesa e riattivata, «Aggiorna subito» fino alla fine del workflow. La
produzione non lo ripete: il job «Collaudo riuscito sul test» cerca, fra
i run passati, un collaudo verde su un commit che il tag di produzione
contiene, e senza si ferma.

Tre workflow, gli stessi di tana-drink (`docs/actions-come-tana-drink.md`
è il disegno, `tests/ci.test.js` li legge e li controlla):

| Cosa si fa | Cosa succede |
|---|---|
| push su un ramo qualsiasi (tranne `release/**`), `develop` compreso | `test.yml`: lint, test, build. **Nessun deploy.** |
| pull request verso `develop` o `main` | lint, test, build **e coverage** (`npm run test:coverage`, soglie in `vitest.config.mjs`: un cricchetto, si alzano e non si abbassano) e le regole sull'emulatore |
| lancio a mano di «Deploy to Firebase» su un ramo | va sul **test** (`drink-regia-test`), poi le prove in sola lettura. Senza collaudo: serve a provare un ramo |
| tag su un commit **non** in `main` (`vX.Y.Z-beta` su `develop`) | va sul **test**, poi il **collaudo** (`e2e.yml` con `collaudo: true`: il passo «Collaudo sul test» del job Playwright) |
| tag su un commit **di `main`** | va in **produzione** (`drink-regia`) solo se esiste un collaudo riuscito sul test per un commit antenato; altrimenti «Collaudo riuscito sul test» si ferma e dice cosa fare. L'approvazione a mano non c'è (GitHub Free, §6) |

Il collaudo scrive sulla regia di test e lancia la flotta su `prova-bar`
(otto-dieci minuti): per questo gira solo sui tag. Vuole il segreto
`E2E_PASSWORD` dell'environment `test` e i locali seminati
(`npm run semina:test`); il cliente che registra si cancella da solo, con
«Elimina cliente…» del backoffice (REQ-FLOTTA-059), anche quelli rimasti
da un giro fallito. Si lancia anche a mano: Actions → «Test end-to-end» →
Run workflow, con la spunta del collaudo.

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
# 3. tag -beta su develop: va sul test, poi parte il collaudo (REQ-DEV-009)
git fetch origin && git checkout develop && git pull
git tag vX.Y.Z-beta && git push origin vX.Y.Z-beta
# 4. si aspetta «Collaudo sul test» verde (Actions, Deploy to Firebase) e si
#    prova a mano quello che il collaudo non copre, su https://drink-regia-test.web.app
# 5. PR develop -> main (sempre dal ramo di release, mai da altro), col via libera
# 6. tag su main: «Collaudo riuscito sul test» ritrova il collaudo del passo 3
#    e pubblica in produzione; senza, si ferma e lo dice
git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
# 7. SUBITO DOPO, sul nuovo ramo di lavoro: package.json alla prossima con -beta
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
`severity`, `priority`), da creare alla prima segnalazione. **Ogni voce
nasce con `generate_issue: true` e lo tiene anche da finita**: vuol dire
«seguita su GitHub», e una voce già `implemented` non apre comunque
un'issue nuova (`deveNascere` in `lib-requisiti.mjs`). Le voci dalla
REQ-FLOTTA-016 alla 034 erano nate con `false` e sulla bacheca non
c'erano: riallineate il 02/11/2026.

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
src/pages/Backoffice.jsx    admin, in sezioni sotto /backoffice/*: locali, commerciale, richieste, rilasci, vendita, temi, nuovo locale
src/pages/Commerciale.jsx   la dashboard di chi vende (REQ-FLOTTA-041): tessere, grafici per giorno, abbonamenti, movimenti, CSV
src/lib/commerciale.js      i numeri del commerciale: canone di un cliente, classe, riepilogo del periodo, tabelle, CSV
functions/lib/movimenti.js  il libro dei movimenti: una riga per incasso (fattura Stripe, ricarica AI, pagamento a mano)
functions/lib/traffico.js   il traffico del sito, contatori per giorno senza cookie (REQ-FLOTTA-042); la Function `traccia`
scripts/semina-test.mjs, lib-semina.mjs  i locali di prova sulla regia di test (REQ-DEV-004); .env.e2e
playwright.config.js, e2e/  i test end-to-end con Playwright: npm run test:e2e
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
scripts/ruoli-deploy.mjs    il SA del deploy di un progetto: API, ruoli, actAs, e con --chiave la chiave in FIREBASE_SERVICE_ACCOUNT dell'environment
scripts/generate-issues.mjs, lib-requisiti.mjs, bacheca.mjs  le issue dal registro e la bacheca (da tana-drink)
.github/workflows/          test.yml, firebase-hosting.yml, deploy.yml, generate-issues.yml
requirements/requirements.yaml  REQ-FLOTTA-002..011 (lato regia), REQ-DEV-001..003
tests/                      vitest, happy-dom; 17 file
tests/regole/, firebase.collaudo.json, vitest.regole.config.mjs  le regole Firestore sull'emulatore (`npm run test:regole`, REQ-DEV-007)
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
node scripts/admin-regia.mjs --email <email> --project drink-regia   # --project e' obbligatorio: niente predefinito
```

e si esce e rientra: compare «Backoffice». Dal 04/11/2026 si entra anche
con Google (REQ-FLOTTA-038, voce 41): il fornitore va acceso a mano sul
progetto. L'MFA sugli admin, che il 22/10 doveva venire prima, resta da
fare.

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
| Produzione `drink-regia`, dal 13/11/2026 | **la 0.3.0** (tag `v0.3.0`, PR #244): sito, regole, indici e 64 Functions in `europe-west1`. **Sito chiuso al pubblico** (`vendita/listino.sito_aperto` assente: anteprima, solo «Accedi», niente prezzi; si apre dal backoffice, Vendita). **Firestore `(default)` in `europe-west1`**, ricreato vuoto il 13/11/2026 (era in `nam5`, Stati Uniti; Daniele: «si hai il via libera»). Segreti delle Functions: `AI_CHAT_SECRET` casuale; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GITHUB_DISPATCH_TOKEN` col segnaposto `non-configurato` (Daniele: «Di stripe se blocchiamo vendite e registrazione lo lasciamo in sviluppo»); `ANTHROPIC_API_KEY` segnaposto, AI spenta finché non la si attiva con tana-drink. Nessun dato: la Tana e il claim admin si fanno dal backoffice e con `scripts/admin-regia.mjs` (§7, e `docs/la-tana-nella-regia.md` di tana-drink). Le email non partono: manca il dominio per Resend. |
| Progetto di test `drink-regia-test` | **creato il 29/10/2026**, su Blaze col secondo account di fatturazione («Il mio account di fatturazione 2», solo prove). API, Firestore `europe-west1`, Auth email, SA del deploy con i ruoli di docs/actions-come-tana-drink.md §3. Sito, regole e 17 Functions pubblicati dal tag `v0.1.0-prova.3` (ramo `feature/rilasci-a-ondate`). Segreti delle Functions: `PROVISIONING_CALLBACK_SECRET` (lo stesso della produzione: tana-drink ne conosce uno), Stripe **sandbox**; `ANTHROPIC_API_KEY` e `GITHUB_DISPATCH_TOKEN` **segnaposto** (il cassetto AI e le attivazioni vere non partono finché non si mettono quelli veri). Dal ramo `feature/ai-chat` (REQ-FLOTTA-094) `richiestaAI` lega anche **`AI_CHAT_SECRET`** (la firma dei turni della chat, almeno 32 caratteri casuali): va creato prima del primo tag beta che lo porta, se no il deploy di `richiestaAI` si ferma; in produzione solo col via libera di Daniele. |
| Environment GitHub `test` | **creato il 29/10/2026**: i quattro `VITE_FIREBASE_*` e `FIREBASE_SERVICE_ACCOUNT` |
| Approvazione sulla produzione | **non disponibile**: GitHub Free non dà i «Required reviewers» a un repository privato (provato il 29/10/2026, errore 422). Oggi protegge solo il job «Dove va» (un tag fuori da `main` va sul test). Decisione dell'utente: GitHub Pro, o accettare il controllo del workflow |
| Segreto `PROJECT_TOKEN` (bacheca) | **manca**: lo mette l'utente |
| Auth | email/password attivo |
| Firestore | `europe-west1`, regole pubblicate |
| Blaze | attivo |
| Environment GitHub `production` | segreti `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` e, dal 07/11/2026, `FIREBASE_SERVICE_ACCOUNT` (chiave del SA di deploy, messa da `scripts/ruoli-deploy.mjs` col via libera dell'utente; lo stesso script ha dato al SA i ruoli di docs/actions-come-tana-drink.md §3 e acceso Cloud Tasks, Scheduler ed Extensions) |
| Segreti delle Functions | `PROVISIONING_CALLBACK_SECRET` presente; **mancano `GITHUB_DISPATCH_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`** e, dal ramo `feature/cassetto-ai` (24/10), **`ANTHROPIC_API_KEY`**; dal ramo `feature/ai-chat` (13/11, REQ-FLOTTA-094) anche **`AI_CHAT_SECRET`**: senza, il deploy delle Functions si ferma |
| Cassetto AI (REQ-AI-003) | Functions pubblicate sul test; `ANTHROPIC_API_KEY` è un segnaposto. Dal 06/11/2026 la strada è la **federazione** (§7, «Cassetto AI»): sul test è pronta (account `ai-regia@drink-regia-test`, regola `gcp-drink-regia-test` nell'area di lavoro «drink», i quattro id in `functions/.env.drink-regia-test`), entra col primo deploy sul test e la verifica nella Console della regola si chiude al primo scambio di token. In produzione pronta allo stesso modo (account `ai-regia@drink-regia`, regola `gcp-drink-regia`, stessa area, i valori in `functions/.env.drink-regia`): entra col primo tag su main, e lì va tolto il segnaposto `ANTHROPIC_API_KEY` dai segreti solo quando il log della regola mostra lo scambio riuscito. La ricarica automatica del credito Anthropic va impostata nella Console |
| `functions/.env` | `GITHUB_REPO=redirect11/drink-regia`, `FLOTTA_REF=main`, `APP_REF=main`: in produzione solo quello che è su `main` di tana-drink, quindi niente attivazioni finché la 1.10 non ci arriva. Il test usa `develop` (`functions/.env.drink-regia-test`) |
| Segnaposto da decidere (utente) | prezzi, email `info@drink.app`, dominio `drink.app`, dati della società in `Legali.jsx`. Il nome del prodotto è deciso il 09/11/2026: «Lime – SmartOrders», logo a fetta di lime (`src/lib/prodotto.js`, `src/components/Logo.jsx`); gli slug tecnici `drink`/`drinkpos` e i nomi dei repository restano |

Progetti collegati: `drinkpos-demo` (istanza dimostrativa,
https://drinkpos-demo.web.app, Auth email attiva), istanze future
`drinkpos-<slug>`. Il SA di provisioning è `provisioning@drink-regia`
(chiave in `PROVISIONING_SA_JSON` nel repository tana-drink).

---

## 6. I lavori aperti, in ordine

L'elenco completo con i riferimenti al codice è in
`docs/audit-sicurezza-2026-11-09.md` (priorità operativa, blocchi A-E);
la parte GDPR resta in `docs/audit-sicurezza-privacy.md`, parte 3. Qui
l'ordine operativo scritto prima di quell'audit: le voci restano valide,
ma l'ordine aggiornato è quello del 09/11.

1. **Le quattro falle gravi dell'audit, prima di qualunque attivazione
   vera.** Lato regia: C2 (la richiesta di attivazione la crea una
   callable che verifica l'abbonamento sul server; via la `create` dai
   client in `firestore.rules`), H1 (allowlist dei campi che il titolare
   può modificare in `clienti/{uid}`: **chiusa il 02/11/2026**, punto 33).
   Lato tana-drink, da chiedere
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
   nel ramo manuale con approvazione (**fatta il 09/11/2026**,
   REQ-FLOTTA-046: la riduzione subito, l'aumento è una richiesta in
   `contatti/`); lo slug unico lato server e le ricerche per slug che si
   fermano davanti a un doppione (**fatto il 09/11/2026**, REQ-FLOTTA-045,
   finding 4 dell'audit del 09/11); idempotenza del webhook (**fatta il
   02/11/2026**, punto 33);
   header di sicurezza in `firebase.json` (**messi il 09/11/2026**,
   REQ-DEV-005: `X-Frame-Options`, `nosniff`, `Referrer-Policy`,
   `Permissions-Policy`, HSTS e una `Content-Security-Policy-Report-Only`;
   **il passo che manca**: dopo qualche giorno sul test, con la console
   del browser aperta su accesso con Google, Checkout e ritorno da Stripe,
   backoffice e temi su misura, se non compare nessuna violazione
   `Report-Only` togliere il suffisso in `firebase.json` e in
   `tests/hosting.test.js`, e la CSP diventa vincolante); App Check e
   `maxInstances`; creazione dell'admin dell'istanza (è un passo del
   workflow di tana-drink: da chiedere). La catena CI è pinnata e
   Dependabot acceso dal 09/11/2026 (REQ-DEV-006): le action a SHA, `npm
   audit` sulle dipendenze di produzione nel workflow di test; restano i
   major (`vite` 8, `vitest` 5, `happy-dom` 21, `firebase-admin` 14,
   `firebase-functions` 7, `stripe` 23) da fare in un ramo dedicato.
7. **Infrastruttura**: `FIREBASE_SERVICE_ACCOUNT` nell'environment
   (**fatto il 07/11/2026** con `scripts/ruoli-deploy.mjs`),
   segreti Stripe e token GitHub, primo deploy delle Functions (col via
   libera), poi la prima attivazione dal sito sulla demo. Capire perché i
   push non avviano la CI. L'emulatore Firestore per le regole c'è dal
   09/11/2026 (`firebase.collaudo.json`, `npm run test:regole`,
   REQ-DEV-007); resta da decidere se mettere in `firebase.json` anche
   Auth e Functions per lo sviluppo in locale. Spostare i workflow della
   flotta fuori dal repository pubblico (decisione dell'utente: riguarda
   tana-drink).
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
   titolare, valgono subito. Dal 13/11/2026 (REQ-FLOTTA-095) la
   sospensione per il pagamento non sta più qui: ha il suo momento fuori
   dall'orario di servizio, `istanze/<slug>.sospensione_al` = `{ dal,
   stato }` e un compito «sospensione». Un locale che nasce scrive subito. Nello
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
   **Lo stesso uid della regia (M7, ramo `feature/titolare-istanza`)**:
   l'input `uid` dei due workflow ora arriva allo script (`--uid`), e
   l'account nel locale ha l'uid di `clienti/{uid}`. Un segnaposto mai
   usato nato prima si ricrea con l'uid giusto, uno usato resta (avviso
   nel log). `aggiorna-istanza.yml` ha l'input `uid` nuovo, facoltativo:
   **il workflow deve stare su `main` prima che le Functions che lo
   mandano siano pubblicate**, come per `email` (GitHub rifiuta un input
   che il workflow non dichiara). La Tana: a mano, da tana-drink,
   `scripts/titolare-locale.mjs` (senza `--applica` dice solo cosa
   farebbe).
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
   **Dal 14/11/2026 anche i collaboratori (REQ-FLOTTA-098)**: «Apri l'app»
   di un collaboratore cerca nel progetto del locale il SUO account (la
   sua email, verificata, admin), non quello del titolare. Per l'app non
   cambia niente: riceve un accesso per un account suo, come prima.
   «Area clienti» resta del solo titolare.
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
35. **La demo in sicurezza (REQ-FLOTTA-019)**, ramo `feature/demo-sicura`,
   02/11/2026, dopo la revisione di sicurezza della demo. Il sito vivo era
   ancora un'app vera e la regia non lo ripubblicava. Ora il workflow non
   rigenera una cartella che c'è già, riconosce la demo dal segno nel
   `venue.json`, le dà una configurazione finta e nessuna regia, chiude
   anche lo Storage e aggiunge le intestazioni di sicurezza; la regia non
   le scrive niente. Restano: la pulizia del progetto,
   [docs/bonifica-demo.md](bonifica-demo.md), solo col via libera
   dell'utente; in tana-drink `docs/sicurezza-demo.md` sul ramo
   `feature/sicurezza-demo` (lo script di genera-cliente, gli indirizzi
   della regia spenti nella demo, l'app che si ferma se la rete non si
   spegne, l'informativa privacy per cliente, i dati della Tana rimasti
   nel pacchetto della demo).
36. **Fase 0 prima di vendere: IVA, H1, M4 (REQ-FLOTTA-035,
   REQ-FLOTTA-036)**, ramo `feature/fase0-regia`, 02/11/2026. Stato dei
   punti dell'audit: **H1 chiusa** (allowlist in `firestore.rules`, più
   P.IVA valida e consensi che non si cancellano; provata
   sull'emulatore), **M3 chiusa** (attivazione al Checkout, DEC-0005),
   **M4 chiusa** (registro `eventi_stripe`, ordine per `event.created`).
   Restano aperte H2 (tana-drink), H3, H4, M1, M2, M5-M8.
   L'IVA la aggiunge Stripe con una tax rate fissa al 22%, che la regia
   cerca per metadati e crea se manca (`aliquotaIvaSuStripe`). I cambi di
   piano usano prodotti con id fissi (`drink-piano-*`, `drink-modulo-*`,
   `drink-terminale`): prima mandavano `product_data`, che una
   subscription rifiuta. **Da fare a mano su Stripe e in console**
   (col via libera): la chiave usata dalle Functions deve poter leggere e
   creare tax rate e prodotti (con una chiave ristretta: «Tax rates» e
   «Products» in scrittura); fissare la versione API dell'endpoint del
   webhook (consigliata 2025-02-24.acacia, quella dell'SDK; le più recenti
   sono lette lo stesso); iscrivere l'endpoint a `checkout.session.completed`,
   `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`; la
   policy TTL di Firestore sul campo `scade_il` della collezione
   `eventi_stripe`; nel portale clienti, se si lascia cambiare piano da lì,
   le stesse aliquote. **Come si prova**: un Checkout in modalità test
   mostra «IVA 22%» e il totale; `stripe events resend` dello stesso
   evento risponde `duplicato: true`. La fattura elettronica (SDI) non la
   fa Stripe: si fa coi dati di `clienti/{uid}.fatturazione`, da decidere
   come (a mano o con un servizio).
37. **La vendita con l'admin di mezzo (REQ-FLOTTA-011, REQ-FLOTTA-028)**,
   ramo `feature/vendita-con-approvazione`, 02/11/2026. Il deploy automatico
   parte spento: ogni attivazione dopo un acquisto, e il profilo completo di
   un Free che compra, aspettano «Autorizza» o «Pubblica il piano» in
   «Richieste»; l'interruttore lo accende l'admin. Il codice sconto si
   scrive anche nella scelta del piano: il Checkout lo applica (o quello
   dell'admin), col prezzo Fondatori vale il più conveniente nel primo
   anno, al 100% il piano si attiva senza Stripe (`functions/lib/acquisto.js`).
   Da sapere: un codice lo usa chiunque lo conosca, senza un numero
   massimo di usi; un codice al 100% fatto girare attiva piani gratis, che
   però, col deploy spento, l'admin vede prima di pubblicarli.

38. **Il limite di usi dei codici sconto (REQ-FLOTTA-028)**, ramo
   `feature/limite-usi-codici`, 02/11/2026: chiude il «da sapere» della voce
   37. Un codice ha un numero massimo di usi (vuoto: nessun limite); conta
   i locali che prendono lo sconto, al pagamento, col 100% o dall'admin.
   Al Checkout l'uso si tiene da parte per la durata della sessione e si
   conta al webhook; esaurito, non si applica più per nessuno nuovo, e
   l'admin lo alza da «Limite…». I codici creati prima non hanno il
   contatore: partono da zero usi e senza limite.

39. **I moduli comprati dall'app (REQ-FLOTTA-037)**, ramo
   `feature/moduli-dall-app`, 02/11/2026, per REQ-LIC-012 di tana-drink.
   `catalogoModuli` e `moduloDallApp` (`functions/lib/moduliapp.js`): il
   titolare prova, aggiunge e disdice un modulo dal gestionale. La prova è
   una funzione sola con la dashboard (`accendiProva`); aggiungere e
   disdire cambiano la subscription come «Cambia piano» su un abbonamento
   Stripe attivo. Dal 04/11/2026 (ramo `feature/moduli-in-attesa`, per il
   contratto `in_attesa` che tana-drink ha scritto la sera del 02/11) su
   un piano gestito a mano la richiesta diventa una richiesta di contatto
   (`contatti/<uid>_<modulo>`, REQ-FLOTTA-017): l'admin la trova in
   «Richieste», scrive il piano con «Cambia piano» fuori da Stripe e la
   segna gestita. Da provare dopo il deploy su `drink-regia-test`, da un
   locale della flotta di test (la Tana non ha `regia_url` e non mostra i
   tasti).
40. **Il restyling della prima pagina (REQ-FLOTTA-002)**, ramo
   `feature/home-elegante`, 03/11/2026. L'utente: «più moderna, elegante e
   accattivante», e in inglese. L'inglese c'era già su `/en`, ma solo in
   `develop`: la produzione è ferma alla 0.2.1 e mostra la home vecchia,
   solo in italiano, finché non esce la 0.3.0. Stessi testi, messa in scena
   nuova (DESIGN.md §4, «Atmosfera»):
   - le luci del bar disegnate dal CSS al posto del segnaposto `hero.jpg`,
     che è stato tolto;
   - il titolo in due tempi con la svolta in oro;
   - il filo d'oro sulle carte e i bottoni a pillola;
   - i passi come linea del tempo, le domande come righe editoriali.

   La prima pagina non aspetta più l'accesso per comparire. Restano da
   fare le schermate vere dell'app nei riquadri delle funzioni
   (DESIGN.md §9.5).
41. **L'accesso con Google (REQ-FLOTTA-038)**, ramo `feature/accesso-google`,
   04/11/2026. «Entra con Google» in Accedi e «Registrati con Google»;
   chi entra la prima volta completa i dati del locale dalla dashboard.
   Stessa email, stesso account: la Tana e i locali esistenti ritrovano il
   loro. **Da fare a mano, dall'utente**, prima sul test e poi in
   produzione (col via libera): Firebase console → Authentication → Metodo
   di accesso → Google → Attiva, con l'email di assistenza; in Impostazioni
   → Domini autorizzati, il dominio del sito se non è `*.web.app` o
   `*.firebaseapp.com`. Finché è spento il tasto risponde «non è ancora
   attivo». Restano: l'MFA sugli admin; nell'informativa privacy, Google
   come fornitore dell'accesso (con gli altri testi legali, voce 3).
   **Se un titolare «non entra più con la password»** dopo aver usato
   Google: con «un account per email», Google con la stessa email di un
   account la cui email non era confermata prende il posto della password
   (stesso uid, il locale resta); si rientra con Google, o si rifà la
   password con «Password dimenticata?». Con l'email confermata i due
   accessi convivono. Non è un difetto (05/11/2026, da tana-drink).
   **La Tana in produzione** (Flavio titolare, email, passaggio): l'ordine
   del giorno è in tana-drink, `docs/la-tana-nella-regia.md`; dal
   05/11/2026 il lato app del passaggio è fatto e sta in `release/1.10.x`
   della Tana (REQ-FLOTTA-030 di tana-drink, `src/lib/passaggioRegia.js`),
   e arriva in produzione con la 1.10 su `main`.
42. **I temi dei locali (REQ-FLOTTA-039)**, ramo `feature/temi-in-licenza`,
   05/11/2026, richiesta da tana-drink (`docs/temi-dei-locali.md`).
   `clienti/{uid}.temi` → `licenza.temi`: gli esclusivi della Tana («Notte»,
   «Meraviglie») non spariscono più il giorno di «La licenza la scrive la
   regia». L'admin li assegna dalla scheda del locale («Temi…») e dal
   modulo «Locale esistente»; la scheda elenca moduli, temi in licenza e
   gli installati nell'app, letti dal progetto del locale all'apertura
   (`temiDelLocale`) e mai salvati. **Per la Tana in produzione**: registrarla
   con Notte e Meraviglie spuntati, prima del passo della licenza.
43. **I temi su misura (REQ-FLOTTA-040)**, ramo `feature/temi-su-misura`,
   06/11/2026 (`docs/temi-su-misura.md`). Due servizi: il tema dal mockup
   di Canva col credito AI (`temaDaMockup`, dalla dashboard: il modello
   legge il mockup, la regia controlla il tema e lo scrive in
   `clienti/{uid}/temi_su_misura`), e il tema fatto da noi su richiesta
   (`chiediTemaSuMisura` → richiesta di contatto; l'admin lo scrive dalla
   scheda del locale, «Nuovo tema su misura…», con la struttura del menù
   e la ricetta in JSON). La licenza porta `temi_su_misura` (§7). **Da
   decidere**: un prezzo fisso per tema oltre al costo del modello.
   **Da fare in tana-drink** (richiesta mandata lo stesso giorno): «I tuoi
   temi» nel marketplace dalla licenza, `impaginazione` nel motore delle
   ricette, le macro categorie nella struttura del menù. **Come si prova**:
   sul test, con un cassetto AI carico, dalla dashboard di un locale
   attivo: un PNG esportato da Canva, «Crea il tema col credito AI»; il
   tema compare nel riquadro e in `licenza/attuale.temi_su_misura` del
   progetto del locale.
44. **Il commerciale, il traffico, i locali di prova e Playwright
   (REQ-FLOTTA-041, REQ-FLOTTA-042, REQ-DEV-004)**, ramo
   `feature/commerciale-e2e`, 07/11/2026. L'utente: «un backoffice per la
   parte commerciale e una dashboard che mi mostra il guadagno, le
   attivazioni, il traffico», e «creare un po' di utenti che abbiano varie
   attivazioni […] e poi fare testing e2e con playwright». Fatti: il libro
   dei movimenti (`movimenti/`, scritto dal webhook, dai pagamenti
   registrati a mano, che ora chiedono l'importo, e dal credito AI a mano),
   il traffico (`traffico/{giorno}`, la Function `traccia`, il sito la
   chiama da `App.jsx` e da `db.js`), la sezione «Commerciale», la semina
   del test e i test Playwright. **Da fare a mano, dall'utente**: il
   segreto `E2E_PASSWORD` nell'environment GitHub `test` (il valore sta in
   `.env.e2e`, riga `E2E_PASSWORD`, scritto dalla semina) perché
   `e2e.yml` giri dopo i deploy su develop. **Come si usa**: `npm run
   semina:test` riscrive le persone sul test (idempotente; `--pulisci` le
   toglie); `npm run test:e2e` in locale compila il sito con `.env.e2e` e
   lo serve con vite preview sulla porta 4317 (la 4173 era occupata) coi
   dati e le Functions di drink-regia-test, quindi prova anche quello che
   non è ancora pubblicato; con `E2E_URL=https://drink-regia-test.web.app`
   contro il sito pubblicato. Le persone (`scripts/lib-semina.mjs`) sono
   istanze «esistenti» senza licenza dalla regia: Sospendi, Chiudi e gli
   aggiornamenti non si provano su di loro. Dopo il deploy sul test il
   traffico comincia a contare da solo; i movimenti veri arrivano col
   primo pagamento. Da sapere: la Function `traccia` è aperta, un
   contatore gonfiato apposta è il danno peggiore; App Check, se serve,
   dopo.
45. **Il sito chiuso (REQ-FLOTTA-043)**, ramo `feature/sito-chiuso`,
   07/11/2026. L'utente: «non abbiamo mai deployato in produzione […]
   una cosa che rende il sito indisponibile finché non decido di renderlo
   disponibile […] stile coming soon». L'interruttore «Sito aperto al
   pubblico» in «Vendita»: finché non è acceso, in produzione la prima
   pagina e la registrazione sono l'anteprima e le Functions della vendita
   rifiutano; sul test, finché non si decide, il sito è aperto (spento
   apposta, è chiuso anche lì: così si vede l'anteprima). **Il giorno
   dell'apertura**: accendere l'interruttore dal backoffice di produzione,
   nient'altro; prima, i segreti Stripe e il token GitHub (voce 7), e
   «Pagamenti online» se si vuole il Checkout.

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
  marchio: true, comande: false, stampa: false, ai: false }` (`comande:
  false` dal 31/10/2026: l'utente, «le comande fuori dal free, nel senso
  che la visualizzazione per comande non funziona»; `ai: false` dal
  13/11/2026, REQ-FLOTTA-087, Daniele: «I free non hanno l'ai»: l'app
  nasconde tasti AI e chat, e la regia rifiuta comunque con `402 piano`)
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
  Dal 09/11/2026 (REQ-FLOTTA-049, audit finding 12) la regia non si fida
  del corpo: `progetto` deve essere quello scritto sull'istanza, `url`
  deve stare sui domini dell'installazione, e i nostri workflow mandano
  anche `run_id` (`github.run_id`, numero) e `inviato_il` (ISO), che la
  regia accetta una volta sola ed entro dieci minuti. **Da chiedere a
  tana-drink**: che il workflow della Tana mandi gli stessi due campi;
  finché non lo fa, per un locale esistente restano facoltativi.
- **Licenza nell'istanza** (BUG-125 di tana-drink, dal 31/10/2026):
  `licenza/attuale` = `{ piano, moduli: {id: bool}, terminali, temi,
  temi_su_misura, limiti, prove, stato: attiva|sospesa|chiusa, motivo, dal,
  slug, regia_url, rinnovo_url, aggiornamenti, valida_fino, alla_scadenza,
  cancellazione, scritta_il }`.
  `rinnovo_url` (dal 13/11/2026, REQ-FLOTTA-090; Daniele: «dobbiamo
  portare l'utente alla schermata di pagamento per il rinnovo») è
  `<origine di regia_url>/dashboard/piano?rinnovo=1`, o `null` se la regia
  non sa il suo indirizzo: il tasto «Riattiva il locale» della schermata
  del titolare lo apre. Lì il riquadro del rinnovo dice, secondo il caso,
  «Il tuo locale è sospeso dal ‹data›» col tasto per pagare (sospeso per
  il pagamento, pagamenti online accesi, abbonamento con Stripe: la
  fattura aperta di Stripe o il portale; pagata, il locale si riattiva da
  solo, REQ-FLOTTA-023), oppure «Il tuo locale è sospeso: per riattivarlo
  scrivici a ‹email›» (pagamenti spenti, sospeso dall'admin, abbonamento
  a mano), oppure, chiuso, i contatti e la data della cancellazione dei
  dati. Chi non ha la sessione nella regia passa dall'accesso e arriva
  alla panoramica, dove un avviso porta al riquadro. Le licenze scritte
  prima del 13/11/2026 lo ricevono alla prossima riscrittura (un cambio
  di stato, di piano o di pagamento, un aggiornamento, «Allinea» nel
  backoffice): l'app deve trattare il campo assente come `null`. `temi` (dal 05/11/2026, REQ-FLOTTA-039, per
  REQ-LIC-010 di tana-drink) è l'elenco degli id degli stili in licenza,
  esclusivi o comprati (`notte`, `meraviglie`): l'app accende uno stile
  `inLicenza` solo se è lì. Viene da `clienti/{uid}.temi`, che scrive
  l'admin. `temi_su_misura` (dal 06/11/2026, REQ-FLOTTA-040,
  `docs/temi-su-misura.md`) è l'elenco dei temi fatti per quel locale,
  interi: `[{ id, nome, descrizione, prezzo: 0, tavolozza, stile,
  ricetta? }]`, lo stesso oggetto del catalogo più, se c'è, la ricetta
  (il vocabolario degli stili a ricetta, con `impaginazione`: `unica`,
  `per-categoria`, `per-macro-categoria`). Vengono da
  `clienti/{uid}/temi_su_misura`, i pubblicati; `[]` se il locale non ne
  ha. L'app li mostra nel marketplace fra i suoi, e con la ricetta li
  disegna col motore, senza usa lo stile.
  `valida_fino` (dal 31/10/2026, per tana-drink) è il momento in cui la
  regia fermerebbe il locale se nessuno paga: per un piano pagato a mano
  «pagato fino al» più i giorni di grazia, con Stripe (dal 02/11/2026) la
  fine del periodo pagato più la stessa grazia; `null` se non scade (Free,
  omaggi, interne, Stripe senza ancora una fattura pagata). Dal 13/11/2026
  (REQ-FLOTTA-095) la data cade al **momento della sospensione per
  pagamento** calcolato su quella scadenza, fuori dall'orario di servizio
  del locale (sotto, regola 4); per un locale senza orari di servizio al
  taglio della giornata dopo, come prima (REQ-FLOTTA-024: mai a mezzanotte
  in servizio). Nel database c'è anche `valida_fino_ts`, lo stesso
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
  terminale, il passaggio al Free) arriva al **taglio della giornata** del
  locale (REQ-FLOTTA-024): fino ad allora la licenza è quella di prima più
  le aggiunte. Lo **stato `sospesa` o `chiusa` voluto dal pagamento**
  (`motivo: 'pagamento non ricevuto'` o `'abbonamento disdetto'`), dal
  13/11/2026 (REQ-FLOTTA-095; Daniele: «Decidiamo la sospensione per
  Stripe fuori dall'orario di servizio quindi di sicuro non subito»),
  arriva **fuori dall'orario di servizio** del locale: all'ora del giorno
  in cui è stato attivato l'abbonamento; se cade in servizio, alla
  chiusura; se cade nell'ora prima dell'apertura, un'ora prima
  dell'apertura. Se gli orari non lasciano un momento adatto (aperto 24
  ore, meno di un'ora fra chiusura e apertura) all'ora dell'attivazione
  anche in servizio; senza orari, al taglio della giornata. Fino ad allora
  la licenza tiene lo stato di prima (`attiva`), e il locale lavora fino a
  quasi due giorni dopo il «non pagato» (Daniele, 13/11/2026: «Tenere la
  regola così e accettare fino a quasi due giorni … ok»): per esempio 28,5
  ore con un servizio 18:00–02:00 e l'abbonamento attivato alle 21:30, e
  circa 46 ore con un servizio dalle 10 alle 08 del giorno dopo. Un giorno
  aperto 24 ore si scrive 00:00–24:00. Gli orari restano nella regia
  (`clienti/{uid}.orari_servizio`): la licenza non li porta. Le sospensioni
  e le chiusure dell'admin o del titolare valgono subito. **Per l'app**:
  lo stato arriva quando arriva, e l'app lo applica appena lo legge, anche
  all'avvio; al momento della sospensione si ferma tutto così com'è
  (Daniele: «Alla riattivazione del servizio non si è mosso nulla e così
  deve essere»).
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
- **I moduli dall'app** (REQ-FLOTTA-037, dal 02/11/2026; in tana-drink
  REQ-LIC-012, `docs/marketplace-moduli.md`). `GET
  https://europe-west1-<VITE_REGIA_PROGETTO>.cloudfunctions.net/catalogoModuli`,
  senza token, CORS aperto → `200 { moduli: [{ id, prezzo, prova_giorni }] }`,
  solo i moduli in vendita, prezzo in euro al mese IVA esclusa. `POST
  …/moduloDallApp` con `Authorization: Bearer <ID token>` dell'app, corpo
  `{ modulo, azione: 'prova' | 'aggiungi' | 'disdici', ritorno }` → `200 {
  ok: true }` (aggiunto), `{ ok: true, scade_il }` (prova), `{ ok: true,
  dal }` (disdetto), e dal 04/11/2026 `{ ok: true, in_attesa: true }` su un
  piano gestito a mano (la richiesta va all'assistenza: l'admin la evade
  dal backoffice e l'app vede il cambio dalla licenza); errori `{ ok:
  false, errore }` con 400, 401, 403, 404, 409, 502, 503, e `errore`
  impersonale da mostrare così com'è. Dal 09/11/2026 (REQ-FLOTTA-050,
  audit finding 17) il `403` arriva anche a un admin del locale che non è
  il cliente della regia (stesso uid, M7, o email verificata uguale): i
  moduli li tocca solo il titolare, «Solo il titolare del locale può
  gestire i moduli.» Oggi la regia non risponde mai
  `checkout_url`: un modulo si compra online solo su un abbonamento Stripe
  già attivo. Disdire online risponde `dal` = oggi, col conguaglio come
  «Cambia piano», non la fine del periodo pagato.
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
  verifica, vuole il titolare e applica subito. Dal 09/11/2026
  (REQ-FLOTTA-050, audit finding 17) titolare vuol dire ruolo `admin` **e**
  l'account del cliente della regia: lo stesso uid (M7) o l'email
  verificata uguale; un altro admin del locale riceve `403`.
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
  con `Authorization: Bearer <gettone>`, il gettone d'identità di Google
  del suo account ai-locale (sotto: «Dal 12/11/2026 senza chiave»)
  e uno di questi corpi JSON:
  `{ "tipo": "descrizione", "nome", "produttore"?, "categoria"?, "note"? }`
  oppure `{ "tipo": "fattura", "file": <base64>, "media_type":
  "application/pdf" | "image/jpeg" | "image/png" | "image/webp" |
  "image/gif" }` (foto fino a 5 MB, PDF fino a 20 MB). Risposte:
  `200 { ok, tipo, risultato, costo_eur, credito_eur }`; `400` richiesta
  sbagliata; `401` locale non riconosciuto; `402 { codice: credito | tetto |
  spento | senza-cassetto }` credito o tetto non bastano: **si ferma solo
  l'AI**; `402 { codice: "piano", errore: "Il piano Free non comprende le
  funzioni AI." }` il locale è Free (REQ-FLOTTA-087, dal 13/11/2026), per
  ogni tipo compreso `credito`: l'app tratta il locale come senza AI e non
  riprova; `422 { codice, costo_eur, credito_eur }` il modello non ha dato
  un risultato usabile (il costo resta); `429 { codice: "occupato",
  errore: "Troppe richieste AI insieme: riprova tra poco." }` il locale ha
  già due richieste AI in corso (REQ-FLOTTA-088): si riprova dopo qualche
  secondo, non in un ciclo stretto; **`429` senza corpo** (o con un corpo
  che non è il nostro JSON) quando sono pieni i posti di `richiestaAI` per
  tutta la flotta: lo risponde Cloud Run prima che la regia veda la
  richiesta (dal 13/11/2026 i posti sono 10 istanze × 3 richieste = 30).
  È diverso da `429 { codice: "occupato" }`, ma l'app li deve trattare tutti e
  due come «riprova tra poco», con la stessa attesa; `503` servizio
  occupato o non disponibile, si riprova (anche quando la regia non
  riesce a prenotare il credito: la prenotazione, se si è scritta lo
  stesso, viene restituita subito; e per una fattura quando la regia non
  riesce a contarne i token, sotto).
  **Il credito si prenota** (REQ-FLOTTA-088, dal 13/11/2026): prima della
  chiamata la regia scala dal credito la stima massima della richiesta (al
  prezzo del modello più caro del listino), dopo la risposta restituisce
  la differenza col costo vero. `credito_eur` nelle risposte è già al netto
  delle richieste in corso. Una richiesta la cui Function si ferma a metà
  si paga alla stima, con una riga di consumo «interrotta». Se dopo la
  risposta del modello la regia non riesce a scrivere la correzione, il
  locale riceve comunque il risultato, con `costo_eur` uguale alla stima:
  è quello che pagherà, una volta sola (dalla revisione del 13/11/2026).
  **Il credito non va mai sotto zero** (REQ-FLOTTA-093, dal 13/11/2026,
  Daniele: «Non deve mai succedere»). Prima di prenotare la regia conta i
  token d'ingresso della richiesta con `countTokens` di Anthropic, e la
  stima mette da parte due tentativi completi (il ripiego dopo un rifiuto
  a metà risposta): uscita 2 × `max_tokens`, ingresso contato + 5% due
  volte più `max_tokens`. Se il conteggio non risponde, una descrizione
  usa la stima per byte con la stessa forma; una fattura risponde `503 {
  codice: "servizio" }` senza prenotare niente, da riprovare come gli
  altri 503. Se una richiesta costasse lo stesso più della stima (un
  difetto), il credito si ferma a zero e il resto la regia lo segna in
  `sforato_microeuro` nel cassetto, per l'admin: è un costo che Stonebit
  si accolla (Daniele, 13/11/2026: «gestisco io a mano. In realtà è un
  costo che ci accolliamo»), non un debito del locale. Per l'app il
  credito è zero e la richiesta dopo riceve `402 credito`. Il conteggio
  ha un tempo massimo di 10 secondi, poi vale come non riuscito. `risultato` per la descrizione è `{ descrizione, da_verificare:
  [] }`; per la fattura `{ fornitore: { ragione_sociale, partita_iva },
  numero, data, righe: [{ descrizione, codice, quantita, unita,
  prezzo_unitario, sconto_percentuale, aliquota_iva, importo }],
  imponibile, iva, totale, da_verificare: [] }`, con `null` per i dati
  assenti. Tutto è una **proposta da rivedere** prima di pubblicarla o
  registrarla. Gli schemi stanno in `functions/lib/ai.js`.
  **Il credito senza il modello** (REQ-FLOTTA-085, dal 13/11/2026):
  `{ "tipo": "credito" }` con lo stesso gettone → `200 { ok, tipo:
  "credito", credito_eur, tetto_mensile_eur, speso_mese_eur, attivo,
  motivo }`, gratis e senza riga di consumo. `attivo` dice se una
  richiesta può partire adesso (dal 13/11/2026: se il credito copre la
  stima di una descrizione, circa 0,22 € dal 13/11/2026, non un micro-euro); `motivo` è
  `null`, `"credito"` o `"tetto"`. Dal 13/11/2026 (REQ-FLOTTA-091,
  richiesta di tana-drink per il promemoria di ricarica) la risposta porta
  anche `ricaricabile` (booleano) e `ricarica_url`: `true` e
  `<origine della regia>/dashboard/credito-ai` (la sezione «Credito AI»
  dell'area del titolare) se il titolare può comprare credito dal sito
  adesso (pagamenti online accesi, sito aperto, locale non interno);
  altrimenti `false` e `null`, e l'app dice di rivolgersi all'assistenza.
  Un locale Free riceve `402 piano`. Senza cassetto o spento, il `402 { codice: senza-cassetto |
  spento }` di sempre. Va chiesto all'apertura delle Impostazioni e della
  chat, non a ogni pagina.
  **La chat del gestionale** (REQ-FLOTTA-094, dal 13/11/2026, per
  REQ-AI-006 di tana-drink; Daniele: «rendi questi parametri configurabili
  da backoffice di admin» e, sui dubbi, «per tutti i 10 i punti facciamo
  come dici»). Lo stesso gettone, il corpo
  `{ "tipo": "chat", "messaggi", "strumenti", "versione" }`: `messaggi` è la
  conversazione intera nel formato di Anthropic, perché la regia **non la
  conserva**; i turni di chi scrive sono un testo o blocchi `text` e
  `tool_result` di solo testo (immagini e documenti `400`: il file di una
  fattura passa dalla richiesta `fattura`); in un turno di chi scrive i
  `tool_result` vengono **prima** di qualunque `text` (sennò `400`); ogni `tool_result` risponde a
  un `tool_use` del turno del modello subito prima, e ogni `tool_use` ha
  il suo esito; due turni di chi scrive di fila vanno bene, due del modello
  no. La conversazione si rimanda **in sola aggiunta**: niente messaggi
  vecchi tolti, accorciati o ritoccati, né del modello né di chi scrive
  (la firma di ogni turno del modello copre tutti i messaggi che vengono
  prima). Se un giro di strumenti resta a metà (l'assistente si ferma
  dopo gli esiti, una richiesta fallisce), la domanda dopo si aggiunge in
  un turno suo dopo quello degli esiti, **senza unirli**: esiti e testo in
  due turni di fila sono accettati così (domanda di tana-drink del
  13/11/2026). I turni del modello si rimettono **esattamente** come la regia li ha
  dati: `{ role: "assistant", content, firma }`. `firma` è una stringa
  opaca per l'app (dalla revisione della PR #237 è `<impronta del
  contesto>.<HMAC>`): un HMAC-SHA256 della regia (segreto
  `AI_CHAT_SECRET`) su locale, versione, istruzioni e strumenti di quel
  momento, i messaggi che vengono prima del turno e il contenuto; un turno
  senza firma, ritoccato o spostato (in un'altra conversazione o in un
  altro punto) è un `400`. Il `content` di un turno può contenere blocchi
  `thinking` (il ragionamento, spesso col testo vuoto) e, dopo un
  ripiego su un altro modello, un blocco `fallback`: l'app li conserva
  come sono e li rimanda; per lo schermo bastano `testo` e
  `strumenti_richiesti`. `strumenti` sono
  solo identificativi, fra `giacenza`, `vendite`, `cerca_prodotti`,
  `proponi_descrizione`, `proponi_voce_menu`, `leggi_fattura` (il ruolo
  lo controlla l'app); l'elenco resta lo stesso per tutta la
  conversazione. `versione` è quella della prima risposta (assente al
  primo messaggio; se arriva lo stesso su una conversazione che non ha
  ancora turni del modello, la regia la ignora e risponde con quella di
  adesso, così una versione vecchia non fa aprire conversazioni nuove
  all'infinito); dal 13/11/2026 (revisione della PR #237) è
  `chat-2026-11-13.2`, e le conversazioni aperte con la `.1` ricevono il
  `409 versione`. Istruzioni, definizioni degli strumenti, modello
  (`impostazioni/regia.ai_modelli.chat`, REQ-FLOTTA-092) e limiti sono
  della regia. Risposta `200 { ok, tipo: "chat", turno, testo,
  strumenti_richiesti: [{ id, nome, input }], versione, limiti_strumenti: {
  giacenza, vendite, cerca_prodotti }, costo_eur, credito_eur }`:
  `limiti_strumenti` sono le righe che l'app restituisce al massimo per
  ogni strumento di lettura. Gli ingressi degli strumenti: `giacenza {
  prodotto }`, `vendite { dal, al?, prodotto? }` (AAAA-MM-GG),
  `cerca_prodotti { testo }`, `proponi_descrizione { prodotto }`,
  `proponi_voce_menu { prodotto, prezzo_eur? }`, `leggi_fattura {}`. Il
  modello chiede uno strumento per turno; dall'ultimo messaggio scritto da
  una persona, al massimo `max_strumenti_per_messaggio`, poi risponde con
  quello che ha. Una risposta oltre `max_token_risposta` si tronca: arriva
  il testo, senza strumenti a metà. Codici: `400` richiesta sbagliata o
  turno ritoccato; `401`; `402` come sopra (dal 13/11/2026 anche prima
  del conteggio: AI spenta o credito finito non consumano il conteggio);
  **`409 { codice: "versione" }`**
  quando cambia `VERSIONE_CHAT`, quando l'admin cambia le righe degli
  strumenti o l'app manda un altro elenco di `strumenti` a metà
  conversazione, e quando Anthropic rifiuta la conversazione con un 400
  (al conteggio o alla chiamata: la stessa conversazione non passerebbe
  mai, e la prenotazione torna intera), e **`409 { codice: "troppo-lunga" }`**
  la conversazione supera `max_token_conversazione` token d'ingresso
  (contati con `countTokens` prima di prenotare): in tutti e due i casi
  l'app apre una conversazione nuova, con due messaggi diversi; `422 {
  codice: rifiuto | vuota }` col costo; `429 occupato`; `503` servizio,
  anche quando il conteggio dei token non risponde (la chat senza
  conteggio non parte) o il segreto della firma non è configurato. Il
  credito passa dalla stessa prenotazione delle altre richieste, con la
  stessa stima e la stessa regola dello sforamento
  (`sforato_microeuro`, a carico di Stonebit), con la scrittura in cache dentro la stima:
  la chat usa la cache del prompt (Daniele: «Considera che una chat che
  cresce e la rimanda tutta il costo delle richieste aumenta»), coi segni
  sulle istruzioni e sull'ultimo blocco della conversazione. Ogni
  richiesta AI scrive nei log una riga «[ai] TEMPI» (conteggio e chiamata
  in millisecondi, token contati, letti e scritti in cache), e la riga dei
  consumi tiene `token_cache_lettura` e `token_cache_scrittura`. I limiti, in `impostazioni/regia.limiti_chat`,
  li cambia l'admin dal backoffice («Vendita» → «Limiti della chat AI»,
  Function `gestisciLimitiChat`): `max_token_risposta` 4.000 (al massimo
  16.000), `max_token_conversazione` 50.000 (al massimo 200.000),
  `max_strumenti_per_messaggio` 5 (al massimo 20), `righe` `{ giacenza: 5,
  vendite: 20, cerca_prodotti: 15 }` (al massimo 100). **Da chiedere a
  tana-drink**: distinguere il `409 troppo-lunga` dal `409 versione`
  (oggi `interpreta` li tratta tutti come versione) e leggere
  `limiti_strumenti` (oggi `LIMITI_RIGHE` è fisso nell'app).
  **Dal 12/11/2026 senza chiave** (REQ-FLOTTA-077, Daniele: «niente
  chiave»). Ogni locale della flotta ha un account Google dedicato,
  `ai-locale@<progetto>.iam.gserviceaccount.com`, creato dal suo
  Terraform. La Function AI dell'installazione **gira con quell'account**
  (in firebase-functions v2, `serviceAccount: 'ai-locale@'`), chiede a
  Google un **gettone d'identità** (ID token) col destinatario
  `regia-ai:<REGIA_PROGETTO>` e lo manda come
  `Authorization: Bearer <gettone>`; con google-auth-library:
  `new GoogleAuth().getIdTokenClient('regia-ai:' + REGIA_PROGETTO)` e le
  sue `getRequestHeaders()`. La regia ne fa controllare a Google firma,
  emittente, scadenza e destinatario, e riconosce il locale dal nome del
  progetto nell'indirizzo dell'account. Nessun altro account vale, nemmeno
  quello predefinito del progetto. Niente segreto da tenere: la «Chiave AI»
  di prima (`REGIA_AI_KEY`) è tolta dal 12/11/2026 (REQ-FLOTTA-079). Per
  un locale esistente come la Tana, l'account e il permesso del suo deploy
  li dà il workflow «Prepara l'AI di un locale esistente»
  (REQ-FLOTTA-078). Risposte e corpi restano quelli di sopra.
  **Come la regia si presenta ad Anthropic** (dal 06/11/2026): con la
  **federazione delle identità**, non con una chiave. L'emittente
  `google-cloud` nella Console (`accounts.google.com`, creato il
  02/11/2026) serve già a forkdiary: la regia ha un **workspace suo**
  («drink»), un account di servizio Anthropic e una regola per ogni
  regia (test e produzione), ognuna legata all'account Google
  `ai-regia@<progetto>.iam.gserviceaccount.com`, che crea
  `scripts/account-ai.mjs` (Firestore e log sul progetto; il deploy che
  agisce come lui). Le due Functions AI (`richiestaAI`, `temaDaMockup`)
  girano con quell'account (`AI_SERVICE_ACCOUNT`), che nei progetti dei
  locali non entra: per questo la licenza dopo un tema su misura la
  riscrive il trigger `licenzaSegueITemiSuMisura`. I quattro id della
  regola (`ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`,
  `ANTHROPIC_SERVICE_ACCOUNT_ID`, `ANTHROPIC_WORKSPACE_ID`) stanno in
  `functions/.env.<progetto>`: identificativi, non segreti. Senza la regola
  configurata vale ancora `ANTHROPIC_API_KEY`, e il segreto resta legato
  (anche vuoto, per il deploy). Il credito prepagato è quello
  dell'organizzazione nella Console; i consumi finiscono sul workspace
  della regola.
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

- **Il primo deploy in un progetto nuovo, 13/11/2026 (`v0.3.0` su
  `drink-regia`).** (1) Le Functions coi trigger Firestore falliscono la
  prima volta con «Permission denied while using the Eventarc Service
  Agent»: è l'agente di Eventarc appena nato, i permessi arrivano in
  qualche minuto. Si rilancia il job fallito (`gh run rerun <id>
  --failed`) e passa. (2) **Prima di qualunque dato, si guarda la
  posizione di Firestore** (`firebase firestore:databases:get
  "(default)"`): quella di produzione era `nam5` (Stati Uniti), creata
  dalla Console il 22/10 senza sceglierla, e non si cambia. Vuota, si è
  cancellata e ricreata in `europe-west1`: il nome `(default)` torna
  libero dopo circa 5 minuti. (3) Dopo, il deploy si ferma con «A
  firestore trigger location must match the firestore database region»:
  le quattro Functions coi trigger (`avviaProvisioning`,
  `rilanciaProvisioning`, `licenzaSegueIlPiano`,
  `licenzaSegueITemiSuMisura`) vanno cancellate con `firebase
  functions:delete … --region europe-west1` e il deploy le ricrea.

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
