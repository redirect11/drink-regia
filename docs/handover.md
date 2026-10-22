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

---

## 1. Perimetro: cosa è tuo e cosa no

**Tuo** (repository `redirect11/drink-regia`, privato): il sito del
prodotto. Prima pagina, registrazione e accesso dei titolari, dashboard
del cliente, backoffice, abbonamento Stripe, Cloud Functions che lanciano
l'attivazione di un'istanza e ne ricevono l'esito, regole Firestore della
regia, listino (`piani.json`), testi legali, questo documento.
Progetto Firebase **`drink-regia`** (Hosting, Auth, Firestore
`europe-west1`, Functions gen2 `europe-west1`).

**Non tuo** (repository `redirect11/tana-drink`, pubblico, cartella
`C:\Users\Daniele\git\tana-drink` e worktree `tana-drink-flotta` sul ramo
`feature/flotta`): l'app dei locali, il Terraform delle istanze
(`infra/istanza`), i workflow `provisiona-istanza.yml` e
`aggiorna-istanza.yml`, gli script `licenza-istanza.mjs`,
`abilita-accesso-email.mjs`, `ruoli-provisioning.mjs`, le cartelle
`clienti/<slug>`. Quando una modifica della regia richiede un cambio di
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
- **Prezzi** (`piani.json`) e **nome del prodotto** (`src/lib/prodotto.js`)
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

### Stato di oggi (22/10/2026)

Esistono solo `develop` e `main`, allineati fin qui con commit diretti
su `develop` durante la costruzione. **Da ora si apre
`release/0.1.0`** da `develop` e si lavora lì. `package.json` è a
`0.1.0`: la prima pubblicazione sarà il tag `v0.1.0`, e subito dopo il
ramo di lavoro passa a `0.2.0-beta`.

### A pubblicare è il tag, non il push

Workflow `.github/workflows/ci.yml`:

- ogni push e PR: lint, test, build. Finisce lì.
- **tag `v*` su un commit di `main`**: dopo i test, deploy di regole
  Firestore, Functions e Hosting su `drink-regia`, dentro l'environment
  GitHub `production`, che **aspetta un'approvazione a mano su GitHub**
  (Actions → il run → Review deployments).
- `workflow_dispatch` con input `pubblica=true`: stesso deploy, a mano.
  Si usa solo col via libera dell'utente.

**Stranezza nota**: nel repository della regia i push **non avviano la
CI da soli**. Dopo ogni push si lancia:

```sh
gh workflow run ci.yml -R redirect11/drink-regia --ref <ramo>
gh run list -R redirect11/drink-regia -L 1
```

Da capire perché (è nella lista dei lavori); finché non si capisce, si
lancia a mano e si aspetta il verde prima di ogni PR.

### Il rilascio, passo per passo

```sh
# 1. sul ramo di lavoro: package.json alla versione senza -beta, CHANGELOG datato
# 2. PR release/x.y.z -> develop (test verdi, cancello di qualità sotto)
# 3. PR develop -> main (sempre dal ramo di release, mai da altro)
# 4. tag su main, che pubblica:
git fetch origin && git checkout main && git pull
git tag vX.Y.Z && git push origin vX.Y.Z
# 5. su GitHub: Actions -> approvare il deploy nell'environment production
# 6. SUBITO DOPO, sul nuovo ramo di lavoro: package.json alla prossima con -beta
```

Il tag si mette **solo su `main`** (non c'è il test, quindi non c'è il
tag su `develop` come in tana-drink). Mai tag su rami di release o
hotfix. Il CHANGELOG oggi non esiste: si crea con la prima release
(`CHANGELOG.md`, una voce per ogni cambiamento visibile, nello stesso
commit del cambiamento).

### Il cancello di qualità, prima di ogni PR verso `develop`

```sh
npm run lint          # pulito (guardare il codice di uscita)
npm test              # verde: 83 test al 22/10/2026
npm run build         # compila
```

Più: registro dei requisiti aggiornato coi test citati, un giro di
refactoring sul diff (riuso, complessità, commenti sul perché: con
Claude, `/simplify`), CHANGELOG se c'è qualcosa di visibile. Non si
«sistema» un test per farlo passare: se fallisce, o il codice è
sbagliato o il test descriveva una cosa che si è deciso di cambiare, e
allora si cambia il test spiegando perché.

### Issue GitHub

Le issue si aprono dal registro (in tana-drink c'è
`scripts/generate-issues.mjs`, qui non ancora: da portare se serve) e le
segnalazioni dell'utente diventano voci `REQ-*` o, per i difetti, un
registro `requirements/bugs.yaml` da creare con lo stesso formato
(stati `todo`/`fixed`/`wontfix`, campo `in_produzione`). Un bug
`fixed` chiude la sua issue.

---

## 4. Com'è fatta la regia

```
src/App.jsx                 barra con menù, rotte, piè di pagina
src/pages/Home.jsx          landing page (hero, funzioni, passi, prezzi, domande, contatti)
src/pages/Registrati.jsx    registrazione a 4 passi (locale, fatturazione, referente, consensi) + verifica email
src/pages/Accedi.jsx        email e password; recupero password
src/pages/Dashboard.jsx     il titolare: locale, piano, stato dell'istanza, attivazione, cambio piano
src/pages/SceltaPiano.jsx   piano, moduli, terminali, totale mensile
src/pages/Backoffice.jsx    admin: clienti, richieste, istanze, deploy automatico, Nuovo locale
src/pages/Legali.jsx        Termini e Privacy (struttura con segnaposto TITOLARE)
src/lib/prodotto.js         nome, slogan, dominio, URL demo, email contatti (segnaposto)
src/lib/piani.js            listino da piani.json: prezzoMensile, moduliDellaScelta, euro
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
piani.json                  piani, moduli, terminale in più, attivazione
scripts/admin-regia.mjs     dà o toglie il claim admin a un account
requirements/requirements.yaml  REQ-FLOTTA-002..011 (lato regia), REQ-DEV-001
tests/                      vitest, happy-dom; 15 file
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
`settings/bar.licenza` nell'istanza), `sospendiMorosi` (ogni giorno alle
6, Europe/Rome), `aggiornaIstanza` (dispatch di `aggiorna-istanza.yml`),
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

## 5. Lo stato del progetto Firebase e dei segreti (22/10/2026)

| Cosa | Stato |
|---|---|
| Hosting `drink-regia.web.app` | pubblicato una volta (hosting + regole), **senza la landing page nuova** |
| Functions | **nessuna pubblicata** |
| Auth | email/password attivo |
| Firestore | `europe-west1`, regole pubblicate |
| Blaze | attivo |
| Environment GitHub `production` | segreti `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`; **manca `FIREBASE_SERVICE_ACCOUNT`** (chiave del SA di deploy: senza, il deploy da tag fallisce) |
| Segreti delle Functions | `PROVISIONING_CALLBACK_SECRET` presente; **mancano `GITHUB_DISPATCH_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`** |
| `functions/.env` | `GITHUB_REPO=redirect11/tana-drink`, `GITHUB_REF` e `APP_REF` = `feature/flotta` (temporaneo: a `main` quando la flotta è merged) |
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
   attivazione una tantum addebitata; header di sicurezza in
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
   [actions-come-tana-drink.md](actions-come-tana-drink.md). Quando è
   fatto, il tag su `develop` va sul test e questo file si aggiorna.
10. **Quando la flotta è merged in tana-drink**: `GITHUB_REF` e `APP_REF`
   a `main` in `functions/.env`.

---

## 7. I contratti condivisi con tana-drink

Se cambia uno di questi, cambia anche l'altro lato, **nello stesso
giorno**, e lo si scrive all'utente perché lo porti nell'altra sessione.

- **Id dei moduli.** `piani.json` → `moduli[].id` e
  `functions/lib/licenza.js` (MAPPA, TUTTI) devono combaciare con
  `src/lib/licenza.js` (MODULI_PREMIUM) e `scripts/licenza-istanza.mjs`
  in tana-drink. Oggi: `menu_tavoli`, `ordini_cliente`, `clienti`,
  `magazzino` (porta `conta`, `fatture`, `scadenzario`), `statistiche`,
  `staff`, `sumup`. Il modulo del lettore si chiama `sumup` e **non**
  `pagamenti`, perché `pagamenti` è la sezione della cassa nel
  gestionale e il nome uguale la spegneva col piano base.
- **Input del dispatch** (`functions/lib/provisioning.js`,
  `dispatchPayload` e l'equivalente per l'aggiornamento) ↔ `inputs` di
  `provisiona-istanza.yml` e `aggiorna-istanza.yml`: `slug`,
  `nome_locale`, `piano`, `moduli` (virgole), `uid`, `ref`. Lo slug ha lo
  stesso regex ovunque: `^[a-z][a-z0-9-]{4,28}[a-z0-9]$`.
- **Callback** `esitoProvisioning`: bearer `PROVISIONING_CALLBACK_SECRET`
  (stesso valore nel repository tana-drink come segreto), corpo con
  `slug`, `stato`, `progetto`, `url`, `errore`, `versione`.
- **Licenza nell'istanza**: `settings/bar.licenza` = `{ piano, moduli:
  {id: bool}, stato: attiva|sospesa|chiusa, motivo, dal, slug, regia_url,
  scritta_il }`. La scrive `licenza-istanza.mjs` alla prima attivazione e
  poi le Functions della regia (`impostaStatoIstanza`,
  `licenzaSegueIlPiano`). L'app la legge in `src/lib/licenza.js`.
- **Versione**: le istanze ricevono l'app di tana-drink al `ref` scelto
  dal backoffice (`main` o un tag `vX.Y.Z` di tana-drink); la regia ha
  la sua numerazione, indipendente.
- **Nome del prodotto e prefisso dei progetti**: `src/lib/prodotto.js`
  qui, `PREFISSO_PROGETTI = 'drinkpos'` anche in Terraform di tana-drink.

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
