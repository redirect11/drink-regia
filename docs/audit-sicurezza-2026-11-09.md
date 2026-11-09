# Audit di sicurezza — drink-regia e tana-drink

**Data:** 09/11/2026 · **Ambito:** i due repository insieme: la regia
(`redirect11/drink-regia`, `develop` a 7c8826b), l'app dei locali
(`redirect11/tana-drink`, `origin/develop` a b8eedf7; produzione `main` =
v1.9.3), e il confine fra i due: identità, segreti, Terraform, workflow,
catena CI/CD, IAM dei progetti Google.
**Modalità:** sola lettura. Nessun file modificato nei due repository,
nessun deploy, nessuna scrittura su Firestore o su Google Cloud. Letti i
file, la storia git, `npm audit`; interrogati in lettura l'API GitHub
(repository, environment, nomi dei secret, ruleset, alert) e `gcloud`
(IAM dei progetti, service account e chiavi, bucket).
**Precedenti:** [audit-sicurezza-privacy.md](audit-sicurezza-privacy.md)
(regia, 22/10/2026) e `docs/audit-sicurezza-2026-08-26.md` in tana-drink.
Ogni punto di quei due audit è riverificato qui (§ Stato dei precedenti).

> Nota di lettura. Tre letture indipendenti (regia, app, confine) sono
> state **unite e deduplicate**: lo stesso buco visto da più lati è un
> finding solo, ordinato per gravità reale. Per ogni punto: dove sta,
> chi lo sfrutta e con che danno, cosa fare. In coda, cosa è fatto bene
> e va preservato, cosa non si è potuto verificare, e l'ordine dei lavori.

---

## Quadro d'insieme

Il dettaglio è curato, la topologia no. Nel dettaglio: ogni callable
amministrativa della regia controlla il claim `admin`, i prezzi vengono dal
listino lato server, il webhook Stripe verifica la firma ed è idempotente,
gli input dei workflow passano solo da variabili d'ambiente validate per
prime, il passaggio regia↔app usa codici monouso con impronta e Origin, il
token del locale si verifica contro il progetto che dichiara. In tana-drink
la licenza vive in `licenza/attuale` e dall'app non la scrive nessuno, i
moduli e gli sconti sono imposti dalle regole, e dal 07/11 le regole si
provano in CI sull'emulatore.

Nella topologia ci sono **tre cose gravi**, tutte già vere oggi, non solo
quando la regia andrà in produzione:

1. **Una sola identità Proprietaria di tutta la flotta e della Tana in
   produzione**, con due chiavi JSON senza scadenza, la stessa chiave per
   la regia di test e di produzione, e una copia parcheggiata fra i
   segreti del repository **pubblico** tana-drink che non la usa più.
2. **Il repository tana-drink è pubblico e ha ancora nella storia i vocali
   e le foto del banco** con nomi di clienti e voci del personale: il
   finding più grave di agosto, mai lavorato.
3. **Il runtime delle Functions della regia è il compute service account
   di default**, Editor sulla regia, con lettura/scrittura e conio di
   token su ogni locale, Tana compresa.

Poi una fila di punti alti nel codice della regia (slug non unico con
effetti fra clienti, cambio piano «manuale» senza pagamento, build dell'app
che gira con la chiave owner in ambiente, eliminazione di un locale senza
controllo dell'ambiente), in tana-drink (produzione ferma alla 1.9.3 senza
le difese sulla licenza, foto del menù cancellabili da qualunque cliente
registrato, App Check mai imposto) e la solita igiene mancante su entrambi
(header, dipendenze, action non pinnate, test delle regole solo sul testo
nella regia).

Il freno di oggi è che la regia non ha mai deployato in produzione, il sito
è chiuso e il deploy automatico è spento. Non è una difesa: i permessi IAM
e le chiavi esistono già.

| # | Gravità | Finding | Dove |
|---|---|---|---|
| 1 | 🔴 Critica | SA di provisioning **Proprietario** di ogni locale e di `tana-drink` prod, due chiavi senza scadenza, stessa chiave test/prod, copia nel repo pubblico tana-drink con i segreti della vecchia flotta | confine |
| 2 | 🔴 Critica | tana-drink **pubblico** con i vocali/foto del banco nella storia e in due rami di release vivi (agosto #1, ancora aperto) | tana |
| 3 | 🟠 Alta | Runtime della regia = compute SA di default: `editor` sulla regia, `datastore.user` + `firebaseauth.viewer` + `tokenCreator` su ogni locale, già oggi sulla Tana | confine |
| 4 | 🟠 Alta | Slug del cliente non unico, scritto dal browser; `clienteDi(slug)` prende «il primo» → dati e abbonamento incrociati fra clienti | regia |
| 5 | 🟠 Alta | `cambiaScelta` ramo «manuale»: piano, moduli e terminali senza pagare, e la licenza segue | regia |
| 6 | 🟠 Alta | La build di tana-drink (`npm ci`, postinstall, Vite) gira sul runner con la chiave owner già in `GOOGLE_APPLICATION_CREDENTIALS` | confine |
| 7 | 🟠 Alta | `GITHUB_DISPATCH_TOKEN` comanda tutta la flotta da qualunque regia; `elimina-istanza` non controlla l'ambiente del progetto; environment senza protezioni né vincolo di ramo | confine |
| 8 | 🟠 Alta | tana-drink in produzione (v1.9.3) senza nessuna difesa sulla licenza: `settings/bar.licenza` riscrivibile dal bartender; la regia compila i locali da `main` | tana |
| 9 | 🟠 Alta | Storage `drinks/*`: foto del menù caricabili, sovrascrivibili e cancellabili da **qualunque autenticato**, cliente registrato compreso | tana |
| 10 | 🟠 Alta | App Check inizializzato ma mai imposto su Functions e Storage (agosto #3) | tana |
| 11 | 🟡 Media | Chiavi di deploy: regia con `secretmanager.admin` e chiavi vecchie mai revocate; tana-drink con la chiave di produzione come secret di **repository**, fuori dall'environment approvato | entrambi |
| 12 | 🟡 Media | `esitoProvisioning`: un bearer per tutta la flotta, `progetto`/`url`/`archivio` fidati dal corpo, nessun anti-replay | regia |
| 13 | 🟡 Media | `traccia`: chiavi `provenienze.<dominio>` illimitate dal corpo → il documento del giorno satura a 1 MiB e si rompe; nessun limite | regia |
| 14 | 🟡 Media | Nessun header di sicurezza su Hosting (CSP, X-Frame-Options, Referrer-Policy…) su entrambi i siti | entrambi |
| 15 | 🟡 Media | Codici sconto: 3 caratteri bastano, nessun limite di tentativi, oracolo; un 100% senza `usi_massimi` = piano gratis | regia |
| 16 | 🟡 Media | Le regole Firestore della regia si provano solo sul testo (`toContain`); nessun emulatore nel repository | regia |
| 17 | 🟡 Media | Per la regia «titolare» = qualunque `role: admin` del locale: compra e disdice moduli sulla carta del titolare | confine |
| 18 | 🟡 Media | L'archivio di eliminazione porta **tutti** i dati operativi del locale nel progetto della regia per 180 giorni, leggibili dal runtime | confine |
| 19 | 🟡 Media | tana-drink, letture pubbliche troppo larghe: ricette dosate, `licenza/attuale` intero, `settings/printer`, documenti interi del tabellone | tana |
| 20 | 🟡 Media | tana-drink: ore e timbrature di tutti leggibili e **modificabili** da tutto il personale (agosto #11) | tana |
| 21 | 🟡 Media | tana-drink: i limiti del piano Free sono solo nella UI (scelta documentata) | tana |
| 22 | 🟡 Media | tana-drink, aperti da agosto: script con default produzione (#7), cache del tablet non svuotata al logout (#8), corpi di errore SumUp al client (#13) | tana |
| 23 | 🟡 Media | Igiene CI/CD su entrambi: action a tag mobili, `allowed_actions: all`, Dependabot spento, alert di secret scanning aperto da agosto, `claude.yml` senza filtro sull'autore, regia senza protezioni dei rami, provider Terraform senza lock | entrambi |
| 24 | 🟡 Media | Dipendenze: regia 17 avvisi (dev) + 8 nelle Functions; tana-drink 37 + 15, alcune in runtime con fix disponibile | entrambi |
| 25 | ⚪ Bassa | Open redirect su `ritorno` in `creaCheckout` e `creaRicaricaAI` | regia |
| 26 | ⚪ Bassa | Sito chiuso: `/dashboard` con account nuovo crea `clienti/{uid}`; `chiediTemaSuMisura` fuori dal controllo | regia |
| 27 | ⚪ Bassa | CSV del commerciale senza neutralizzazione di `= + - @` iniziali | regia |
| 28 | ⚪ Bassa | `href` da dati senza controllo di protocollo (tana: `regia_url`, allegati, social; regia: `istanza.url`); `impostazioni/*` leggibile da ogni autenticato; `admin-regia.mjs` con la produzione come default | entrambi |
| 29 | ⚪ Bassa | `APP_REF=main` mobile e SHA non registrato; bucket tfstate senza versioning né accesso uniforme; `bearerValido` accetta un segnaposto; email nei log | confine |
| 30 | ⚪ Bassa | tana-drink: `service_stats` senza validazione; chiave web di produzione nella storia (pubblica per disegno, da restringere); OAuth client di firebase-tools in sei script | tana |

---

## 🔴 Critiche

### 1. Una sola identità Proprietaria di tutta la flotta, chiavi eterne, copia nel repo pubblico

**Evidenza (verificata con `gcloud` e API GitHub il 09/11).**
- `provisioning@drink-regia.iam.gserviceaccount.com` ha `roles/owner` su
  `drinkpos-prova-bar`, `drinkpos-demo` **e su `tana-drink`**, il progetto
  della Tana in produzione (gli altri owner sono i due account umani).
  `roles/billing.user` su entrambi gli account di fatturazione,
  `roles/storage.objectAdmin` su `gs://drink-regia-tfstate`. Lo script lo
  dichiara: `scripts/ruoli-provisioning.mjs:214-223` dà `owner` perché «un
  elenco più stretto si rompe a ogni risorsa nuova».
- Due chiavi utente attive, scadenza `9999-12-31`: `1439bb8d…` (22/10) e
  `287835e6…` (29/10).
- La chiave sta in tre posti: environment `flotta` e `flotta-test` di
  drink-regia (`PROVISIONING_SA_JSON`, **stesso valore** per le due regie,
  `infra/README.md:23`) e come **secret di repository** di tana-drink
  (pubblico), insieme a `PROVISIONING_CALLBACK_SECRET`, `BILLING_ACCOUNT_ID`,
  all'environment `flotta` e alle variabili `PROGETTO_FLOTTA`,
  `REGIA_CALLBACK_URL`, `TFSTATE_BUCKET`. Nessun workflow di tana-drink li
  usa più: la flotta è passata nella regia il 29/10.
- Il SA `deploy@<locale>` che Terraform crea con ruoli limitati
  (`infra/istanza/main.tf:200-220`) non è usato da nessun passo: il deploy
  lo fa il provisioning SA owner. Il Terraform gli dà comunque sette ruoli
  espliciti (`main.tf:232-246`), inutili sopra `owner`.
- I workflow la scrivono su disco a ogni run
  (`provisiona-istanza.yml:194-201`, `aggiorna-istanza.yml:210-217`,
  `elimina-istanza.yml:78-80`).

**Chi / come / danno.** Chi ottiene una delle due chiavi (un run di GitHub
Actions compromesso in uno dei due repository, un workflow modificato su un
ramo qualunque, una dipendenza malevola nella build, una fuga dal computer)
è proprietario di ogni progetto dei locali e della Tana in produzione:
legge e cancella database, utenti, file; cambia IAM; collega progetti agli
account di fatturazione a nostro carico. La regia di **test** usa la stessa
identità della produzione: un errore sul test colpisce i locali veri. In
tana-drink i secret di repository sono in scope per ogni workflow su ogni
ramo, compresi quelli che `claude.yml` committa (finding 23). È la H3 del
22/10 con tre fatti nuovi: owner anche sulla Tana, due chiavi vive, copia
nel repository pubblico.

**Cosa fare, in quest'ordine.**
1. **Oggi, dalla console GitHub di tana-drink:** cancellare
   `PROVISIONING_SA_JSON`, `PROVISIONING_CALLBACK_SECRET`,
   `BILLING_ACCOUNT_ID`, le tre variabili e l'environment `flotta`.
2. **Oggi, da IAM:** revocare la chiave `1439bb8d…` (quella del 22/10,
   entrata in tana-drink); verificare che negli environment della regia ci
   sia la `287835e6…`. Ruotare `PROVISIONING_CALLBACK_SECRET` con valori
   **diversi** per regia di test e di produzione.
3. Togliere `roles/owner` al provisioning SA su `tana-drink`: la Tana si
   pubblica da sé; se un giorno la regia la aggiornerà, darle i ruoli del
   `deploy@` SA.
4. Un SA per regia (`provisioning-test@drink-regia-test` solo sui
   `drinkpos-prova-*` e sull'account di fatturazione delle prove); il SA di
   produzione mai sul test. Chiave diversa in `flotta-test`.
5. Ruoli minimi: usare davvero `deploy@<locale>` per `firebase deploy`, e
   al provisioning SA lasciare `projectCreator`, `billing.user`,
   `serviceUsageAdmin` e ciò che Terraform crea (da provare su un locale
   nuovo).
6. Workload Identity Federation da GitHub al posto delle chiavi JSON
   (`google-github-actions/auth` con `workload_identity_provider`), con
   condizione su repository ed environment nel provider. Con
   l'Organizzazione Google diventa obbligatorio
   (`disableServiceAccountKeyCreation`, handover §6).

### 2. tana-drink pubblico con i vocali e le foto del banco nella storia

**Evidenza.** `gh repo view`: `visibility: PUBLIC`, 0 fork.
`origin/release/1.3.0` e `origin/release/1.4.0` **esistono ancora**, 63
file in `registrazioni/` ciascuno. 28 commit che aggiungono
`registrazioni/` sono raggiungibili da `origin/main` e `origin/develop`
(`c89e4f5`, `fefa53a`, `64573ad`…). Rami locali `agents/configurazione-agenti`
e `feature/riordino-css` con gli stessi 63 file. Nessuna riscrittura della
storia dal 26/08.

**Chi / come / danno.** Chiunque clona il repository ottiene audio con voci
e nomi di clienti e personale, riutilizzabili anche per impersonazione
vocale. È un problema GDPR prima che di sicurezza, e il repository è il
gestionale di cassa di un esercizio commerciale.

**Cosa fare.** Cancellare sul server `release/1.3.0`, `release/1.4.0` e i
rami locali; `git filter-repo --path registrazioni/ --invert-paths` su
tutti i rami e force-push (i ruleset vietano il force-push su `main` e
`develop`: va fatto da admin togliendo la regola per il tempo necessario);
ticket a GitHub Support per purgare gli oggetti; decidere se il repository
debba restare pubblico. Fare questo **dopo** il punto 1.1, così lo stesso
intervento sul repository chiude anche i segreti residui.

---

## 🟠 Alte

### 3. Il runtime della regia può tutto, su ogni locale, già oggi sulla Tana

**Evidenza (`gcloud`).** `600871952552-compute@developer.gserviceaccount.com`
(runtime delle Functions di `drink-regia`): `roles/editor` su `drink-regia`;
`roles/datastore.user` su **`tana-drink`**; `roles/iam.serviceAccountTokenCreator`
su `firebase-adminsdk-fbsvc@tana-drink`. Il Terraform lo ripete per ogni
locale nuovo (`infra/istanza/main.tf:294-319`, anche `firebaseauth.viewer`).
`functions/index.js:61` `OPTS = { region }` senza `serviceAccount`: tutte le
Functions tranne quelle AI (75-81) girano col default, anche `traccia`, che
è aperta a tutti. `index.js:662-669` `appDi` + `1527` `createCustomToken(uid)`.
`roles/editor` comprende i ruoli legacy sul bucket tfstate.

**Chi / come / danno.** Qualunque codice in esecuzione nelle ~60 Functions
della regia (un bug, una dipendenza compromessa) legge e riscrive l'intero
Firestore di ogni locale (`datastore.user` non distingue `licenza/attuale`
dagli ordini o dalle paghe) e con `tokenCreator` conia un accesso valido
per **qualunque utente di qualunque locale**. L'Admin SDK bypassa le regole
Firestore: «la regia scrive solo la licenza» non ha nessuna serratura
tecnica nel locale, e la guardia `licenza_dalla_regia: false` sulla Tana
(`lib/esistente.js:160`) è codice, non IAM. È la H4 del 22/10, cresciuta
con REQ-FLOTTA-030 e con il binding sulla Tana in produzione.

**Cosa fare.**
1. Un SA dedicato (`regia-istanze@…`, modello `scripts/account-ai.mjs`)
   assegnato via `serviceAccount:` solo alle Functions che scrivono nei
   locali (`esitoProvisioning`, `impostaStatoIstanza`, `scadenza`,
   `gestisciLicenze`, `presentazione`, `passaggioVersoApp/Regia`,
   `scambiaPassaggio`, `temiDelLocale`, `licenzaSegueIlPiano`,
   `licenzaSegueITemiSuMisura`, `moduloDallApp`, `sceltaDallApp`); le
   altre (Stripe, `traccia`, vendita) con un SA che ha solo Firestore della
   regia. Niente `roles/editor` a nessuno dei due. `REGIA_SA_EMAIL` nei due
   environment punta al nuovo SA.
2. Sui locali: `tokenCreator` solo dove il passaggio è acceso (la Tana non
   lo usa ancora); `firebaseauth.viewer` solo se `getUserByEmail` serve.
3. Per la licenza non esiste un ruolo IAM «solo questo documento». Le
   opzioni: (a) `datastore.user` con SA dedicato e audit log Data Access
   sui locali; (b) una Function del locale autenticata OIDC che scrive solo
   `licenza/attuale` (non copre il Free senza Functions); (c) un database
   Firestore secondario `licenza` per locale, con IAM a sé. Documentare la
   scelta nel DPA; finché resta così, i testi legali non devono dire «la
   regia non accede ai dati del locale».

### 4. Slug non unico, effetti fra clienti

**Evidenza.** `firestore.rules:17-24`: la `create` di `clienti/{uid}`
controlla solo la forma dello slug, nessuna unicità. `src/lib/db.js:48-53`
`creaCliente` scrive dal browser; il browser non può interrogare `clienti`
e non esiste una callable che verifichi lo slug (solo `creaCliente` admin,
`index.js:1951`, e `registraLocaleEsistente`, 2355-2359, controllano).
`index.js:1165-1168` `clienteDi(slug)` = `where('slug','==').limit(1)`:
con due clienti torna «il primo». Lo usano `scriviLicenza` (1215),
`scriviDatiDelLocale` (1441: nome, indirizzo, telefono, P.IVA in
`settings/bar` dell'istanza), `proponiAggiornamento`, `applicaScelta`,
`moduloDallApp` (2633 → `aggiornaSubscription` 2655) e tutte le callable
admin (905, 2322, 2385, 2455, 2675).

**Chi / come / danno.** Due titolari registrano locali con lo stesso nome,
senza malizia: stesso slug. Chi attiva per primo prende `drinkpos-<slug>`;
l'altro resta bloccato. Peggio: a ogni riscrittura della licenza
`clienteDi` può prendere il cliente sbagliato e `scriviDatiDelLocale`
copia P.IVA e telefono **dell'altro** nell'app del locale; un admin
dell'app di B che compra un modulo cambia la **subscription Stripe di A**.
Un malintenzionato può prendere apposta il nome di un concorrente
registrato ma non ancora attivo.

**Cosa fare.** (1) Slug unico lato server: registrazione via callable
`registraCliente` che in transazione verifica e scrive, togliendo la
`create` dal browser; oppure collezione di prenotazione `slug/{slug}` con
`getAfter(...)` nella `create` di `clienti`. Questo chiude anche il
finding 26. (2) In ogni `where('slug').limit(1)` (index.js:828, 840, 905,
985, 1166, 2322, 2385, 2455, 2633, 2675) `limit(2)` e errore esplicito se
più di uno. (3) Un test sull'emulatore (finding 16) sulla seconda
registrazione con lo stesso slug.

### 5. `cambiaScelta` ramo manuale senza pagamento (M2 del 22/10)

**Evidenza.** `functions/index.js:1809-1816`: se
`abbonamento.origine === 'manuale'` scrive subito piano, moduli e terminali
e `licenzaSegueIlPiano` (1824-1856) riscrive la licenza dell'istanza.
Nessuna approvazione. `moduloDallApp` nello stesso caso fa la cosa giusta
(`moduliapp.js:97-103`: richiesta in `contatti/`).

**Danno.** Qualunque titolare con piano «manuale» (bonifico, codice 100%,
creato dall'admin) chiama la callable con `{piano:'completo', moduli:[tutti],
terminali:20}` e si trova tutto acceso senza pagare.

**Cosa fare.** In `index.js:1809` sostituire la scrittura con una richiesta
di contatto come `moduliapp.richiestaDallApp`, lasciando la scrittura a
`cambiaPianoAdmin` (2672). La sola riduzione può restare immediata.

### 6. La build di tana-drink gira sul runner con la chiave owner in ambiente

**Evidenza.** `provisiona-istanza.yml:194-201` scrive la chiave in
`$RUNNER_TEMP/sa.json` e mette `GOOGLE_APPLICATION_CREDENTIALS` in
`$GITHUB_ENV`. Solo dopo: `npm ci --prefix app` e `--prefix app/functions`
(273-277, con i postinstall delle dipendenze), `node scripts/genera-cliente.mjs`
(302-304), `npm run build` (306-317, Vite coi plugin del repository). Stesso
ordine in `aggiorna-istanza.yml:210-217` → `258-263` → `331-346`. L'app è
presa da tana-drink al `ref` chiesto; sul test anche `develop`.

**Danno.** Una dipendenza compromessa nel lockfile di tana-drink (Dependabot
è spento, finding 23) o un commit malevolo su un ramo preso dal test legge
`sa.json` e lo esfiltra: è la chiave del finding 1. La guardia «solo quello
che è su main» non protegge da una dipendenza.

**Cosa fare.** Due job: `build` (checkout dell'app, `npm ci`, build,
upload dell'artifact `dist` + `functions`) **senza secret e senza
environment**; `deploy` con environment e chiave che scarica l'artifact e
pubblica. Minimo: spostare il passo delle credenziali dopo la build e
leggere `terraform output` prima, in un file.

### 7. `GITHUB_DISPATCH_TOKEN` comanda la flotta; eliminazione senza controllo dell'ambiente

**Evidenza.** `functions/index.js:100-111`: un solo token lancia
`provisiona`, `aggiorna`, `elimina-istanza` con input scelti dalla Function.
`elimina-istanza.yml:52-57, 126-134`: controlla slug e nome dell'ambiente,
poi `gcloud projects delete "$PROGETTO"` e `gcloud storage rm -r` sullo
stato: **non legge l'etichetta `ambiente` del progetto** (`main.tf:130-135`),
quindi con `ambiente: test` si elimina un locale di produzione, perché
`flotta-test` ha la stessa chiave owner. `aggiorna-istanza.yml:65-70,
123-125`: `progetto` accetta qualunque id tranne le due regie; il SA è
owner di `tana-drink`, quindi la Tana si ripubblica da qui. Environment
`flotta`, `flotta-test`, `production`, `test`: `protection_rules: []`,
`deployment_branch_policy: null`; il 30/10 `provisiona-istanza.yml` è
stato lanciato dal ramo `feature/piano-free` con successo. Il backoffice
chiede il claim `admin` senza MFA (handover §4).

**Danno.** Chi ha il token (Secret Manager della regia, o un admin della
regia di test) cancella i progetti dei locali veri e ripubblica versioni a
scelta su locali e Tana. Oggi il bucket `drink-regia-archivio` non esiste,
quindi l'eliminazione fallirebbe al backup: una rete di sicurezza
involontaria.

**Cosa fare.** (1) In `elimina-istanza.yml`, prima di eliminare:
`gcloud projects describe "$PROGETTO" --format='value(labels.ambiente)'`
uguale ad `$AMBIENTE` e stato Terraform presente nel prefisso, altrimenti
stop. (2) SA distinti per regia (finding 1): il test non tocca la
produzione per IAM, non per disciplina. (3) Deployment branch policy
`main` sugli environment, se GitHub Free la concede ai privati. (4) Token
con scadenza breve annotata nell'handover; conferma a due azioni per
«Elimina» nel backoffice; MFA sugli admin prima della produzione.

### 8. tana-drink in produzione senza le difese sulla licenza

**Evidenza.** `git show origin/main:firestore.rules`: nessun `match
/licenza`, nessun `licenzaValida()`. `origin/main` = v1.9.3 (21/10); i
commit `b4a63e2` (BUG-125), `2ecde70` (REQ-LIC-008), `a5aca4d` (REQ-LIC-009),
`18dd123` (BUG-126), `624ae8c` (BUG-134) sono solo su `develop`, 273
commit avanti. Il registro lo sa: BUG-125 `in_produzione: true`.

**Danno.** Oggi in produzione c'è solo la Tana, che ha tutti i moduli: il
danno economico immediato è nullo. Ma la regia compila i locali in
produzione da `main`: ogni locale attivato oggi riceve regole dove un
bartender dalla console si riscrive piano e moduli in `settings/bar.licenza`,
e dove il contratto regia↔app (`licenza/attuale`, `moduloDallApp`,
presentazione) non esiste.

**Cosa fare.** Rilasciare la 1.10.x in produzione (dopo le prove sul test
e verificato che `licenza/attuale` esista su `tana-drink`: il deploy lo
crea da `clienti/tana/licenza-iniziale.json` solo se manca,
`deploy.yml:141-148`). Fino ad allora, non attivare locali da `main`.

### 9. Storage `drinks/*` scrivibile da qualunque autenticato

**Evidenza.** tana-drink `storage.rules:16-24`: `allow delete: if
request.auth != null`, `allow create, update: if request.auth != null &&
size < 5 MB && image/*`. Il commento dice «backoffice bartender» ma
`isBartender()` (riga 8) **non è usata** per `drinks/`. I clienti si
registrano da soli (`src/lib/customerAuth.js:35, 55`). Nessun test delle
regole Storage.

**Danno.** Chiunque crei un account cliente dal menù cancella tutte le foto
dei prodotti o le sostituisce con un'immagine qualunque, che il menù
pubblico mostra. Vandalismo a costo zero, dal telefono.

**Cosa fare.** `allow create, update, delete: if isBartender()`;
`tests/regole/storage.test.js` con `@firebase/rules-unit-testing` (Storage
è già negli emulatori di `firebase.collaudo.json`). Cinque minuti.

### 10. App Check mai imposto (agosto #3)

**Evidenza.** tana-drink `functions/index.js:53` `OPTS = { region }`, nessun
`enforceAppCheck`/`consumeAppCheckToken`; nessun `request.app` in
`firestore.rules`/`storage.rules`; `src/lib/firebaseClient.js:69` si spegne
in silenzio senza chiave; `vite.config.js` senza guardia. Nella regia:
nessun App Check da nessuna parte (M6 del 22/10). BUG-092 ancora `todo`.
L'enforcement Firestore della Tana è dichiarato acceso in console
(REQ-SIC-002) ma non verificabile dal repository.

**Cosa fare.** tana-drink: `enforceAppCheck: true` sulle callable del
personale, guardia di build su `VITE_RECAPTCHA_SITE_KEY`, poi Storage e
Functions in console seguendo `scripts/appcheck.js`. Regia: valutare App
Check con reCAPTCHA Enterprise almeno su `traccia`, `verificaCodiceSconto`,
`attivaConCodice`, `creaCheckout`; pesarlo con la parte privacy (oggi il
sito non ha script terzi).

---

## 🟡 Medie

### 11. Chiavi di deploy

**Regia.** `scripts/ruoli-deploy.mjs:36`: `secretmanager.admin`,
`run.admin`, `artifactregistry.admin`…; `:85-90` actAs sul runtime; `:93-98`
crea una chiave nuova a ogni `--chiave` e «le vecchie restano». La chiave
in `FIREBASE_SERVICE_ACCOUNT` legge tutte le versioni di tutti i segreti
della produzione (Stripe live, dispatch token, callback secret) e pubblica
codice che gira come il runtime (finding 3). `deploy.yml:75-81`: la `rm`
di `/tmp/sa.json` non è `if: always()`. Nessuna branch protection (GitHub
Free), `firebase-hosting.yml:16-17` pubblica su qualunque tag su `main`.
Il SA di deploy non ha owner/editor: bene.

**tana-drink.** `FIREBASE_SERVICE_ACCOUNT` (chiave `135b28ae…` di
`firebase-adminsdk-fbsvc@tana-drink`, senza scadenza, 05/06) è secret di
**repository** nel repo pubblico; l'environment `production` ha il
required reviewer ma **nessun secret**: il job approvato usa la chiave
del repository, disponibile a ogni workflow su ogni ramo. Il SA ha
`firebaseauth.admin`, `datastore.user`, `firebaserules.admin`,
`cloudfunctions.admin`, `storage.admin`, `tokenCreator`: pieno controllo
di utenti e dati della Tana.

**Cosa fare.** WIF su entrambi (finding 1.6). Intanto: revocare le chiavi
vecchie dei due SA dalla console; nella regia provare
`secretmanager.secretAccessor` + `viewer` al posto di `admin`; `rm -f`
con `if: always()`; in tana-drink spostare `FIREBASE_SERVICE_ACCOUNT` di
produzione nell'environment `production` e i `VITE_*` negli environment.
Decidere su GitHub Pro per le protezioni della regia (handover §5).

### 12. `esitoProvisioning`: corpo fidato, un bearer per la flotta, nessun anti-replay (M1 del 22/10)

**Evidenza.** `functions/lib/provisioning.js:145-166` `esitoValido`:
`progetto`, `url`, `versione`, `ref`, `ambiente` sono `String(...)` liberi;
`index.js:211-226` li scrive in `istanze/<slug>` (`progetto: esito.progetto
?? prima?.progetto`). `lib/eliminazione.js:102-115`: `archivio: { bucket,
percorso, zip }` dal corpo, e `index.js:2515-2531` firma un URL v4 su quel
bucket così com'è. Nessun `run_id`, nessuna scadenza, un solo segreto per
tutti i locali e, dai documenti, per le due regie (`handover.md:333`).
`url` finisce in `href` (`Dashboard.jsx:144`, `Backoffice.jsx:625`). Il
confronto del bearer è a tempo costante (`provisioning.js:230-237`): bene.

**Danno.** Chi ha il segreto (environment GitHub, Secret Manager, e finché
resta lì il repo pubblico tana-drink) segna un locale «eliminata» e fa
scaricare al titolare uno zip da un bucket a sua scelta, ri-punta
`istanze/<slug>.progetto` così le licenze successive vanno altrove,
imposta stati a piacere, inietta `javascript:` nell'`href` del backoffice.

**Cosa fare.** `progetto === 'drinkpos-'+slug` (per `origine: 'esistente'`
uguale a `prima.progetto`); `url` `https://` su `${progetto}.web.app|
firebaseapp.com` o sul dominio registrato; `archivio.bucket` da una
variabile della regia, non dal corpo; `run_id` + `inviato_il` con
tolleranza 10 minuti, registrati in `istanze/{slug}.ultimo_esito` contro i
duplicati, e verifica del run con `GET /repos/{repo}/actions/runs/{id}`
col token già presente; segreto diverso per regia.

### 13. `traccia`: contatori gonfiabili e documento del giorno saturabile

**Evidenza.** `functions/index.js:641-651`: `onRequest({ cors: true })`,
nessun `maxInstances`, nessun App Check. `functions/lib/traffico.js:46-55`
`provenienzaDi`: il dominio viene dal **corpo** (`dati.riferimento`), non
dal `Referer`; `chiaveSicura` lo riduce a `[a-z0-9_]{1,60}` ma non lo
limita; `:88` `incrementi['provenienze.<host>']`.

**Danno.** Un ciclo di POST con `riferimento: https://x<n>.example` crea una
chiave nuova a ogni chiamata: `traffico/<giorno>` arriva a 1 MiB in poche
migliaia di richieste e da lì **ogni** scrittura del giorno fallisce (la
dashboard perde il giorno), con costo di scritture e invocazioni.

**Cosa fare.** Allowlist di provenienze note + `altro` (o primi N domini
del giorno); `Referer`/`Origin` dall'header; `maxInstances: 2` e
`concurrency`; monitorare la dimensione del documento.

### 14. Nessun header di sicurezza su Hosting (entrambi; M5 e agosto #9)

**Evidenza.** Regia `firebase.json:5-18`: solo `public`, `ignore`,
`rewrites`. tana-drink `firebase.json:32-87`: solo `Cache-Control`;
`index.html:31` carica `/epos-2.27.0.js` senza SRI. La demo invece ha già
le sue intestazioni (`infra/demo/intestazioni.json`).

**Danno.** Clickjacking sul backoffice e sul banco; un XSS futuro senza
CSP ha mano libera; su dominio custom manca HSTS.

**Cosa fare.** `hosting.headers` con `Content-Security-Policy`
(`default-src 'self'; script-src 'self'; connect-src 'self'
https://*.googleapis.com https://*.cloudfunctions.net
https://*.firebaseapp.com wss://*.firebaseio.com; frame-src
https://<progetto>.firebaseapp.com https://accounts.google.com; img-src
'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none';
base-uri 'self'; form-action 'self'`), `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy`,
`Strict-Transport-Security`. Partire in `Report-Only` sul test (popup
Google, Stripe, SumUp, stampante da verificare), poi un test in
`tests/ci.test.js` che legga `firebase.json`.

### 15. Codici sconto indovinabili e senza limiti

**Evidenza.** `functions/lib/sconti.js:24` `/^[A-Z0-9][A-Z0-9-]{2,23}$/`;
`index.js:438-455` `verificaCodiceSconto` distingue «sconosciuto» da valido
(oracolo); `461-488` `attivaConCodice` attiva subito con un 100%
(`acquisto.js:148-166`). Nessun limite di tentativi, `usi_massimi`
facoltativo.

**Cosa fare.** Almeno 8 caratteri con 2 cifre o generazione lato server
con `crypto.randomBytes`; contatore di tentativi per uid in
`clienti/{uid}.tentativi_codice` (10/ora → `resource-exhausted`);
`usi_massimi` obbligatorio per il 100%.

### 16. Regole della regia provate solo sul testo

**Evidenza.** `tests/clienti.test.js:80-88` («il repository non ha ancora
l'emulatore»), stesso schema in `eventistripe`, `movimenti`, `passaggio`,
`sconti`, `stili`, `temi`. Nessun `@firebase/rules-unit-testing`, nessun
`emulators` in `firebase.json`. `requirements.yaml:163-170`: «provata
sull'emulatore (25 casi, fuori dal repository)». tana-drink lo fa già
dal 07/11 (`tests/regole/`, in CI): il modello c'è.

**Cosa fare.** `@firebase/rules-unit-testing` + `firebase-tools` in dev;
`tests/regole.emulatore.test.js` con `initializeTestEnvironment` su
`clienti` (H1 e finding 4), `richieste`, `istanze`, `ai/*`, `vendita`,
`impostazioni`; script `test:regole` con `firebase emulators:exec`;
requisito REQ-DEV nel registro.

### 17. Per la regia «titolare» è qualunque admin del locale

**Evidenza.** `functions/lib/aggiornamenti.js:288` `eTitolare = (token) =>
token?.role === 'admin'`, usato da `moduloDallApp` (`index.js:2623`) e
`sceltaDallApp` (1418). In tana-drink un admin crea altri admin
(`staff-service.js:96-103`). `passaggioVersoRegia` è più stretto
(`lib/passaggio.js:350-356`: email verificata uguale a `cliente.email`).

**Danno.** Un dipendente con `admin` aggiunge o disdice moduli sulla
subscription Stripe del titolare con conguaglio immediato
(`index.js:2652-2660`), o sceglie gli aggiornamenti. Scelta dichiarata nel
commento (2660-2661), ma il danno economico ricade sul titolare.

**Cosa fare.** Per `aggiungi`/`disdici` richiedere `chi.uid === cliente.uid`
o l'email verificata del cliente, come in `titolareDallApp`; scriverlo nel
contratto §7 di `docs/flotta.md`.

### 18. L'archivio di eliminazione porta i dati operativi nella regia

**Evidenza.** `scripts/archivia-istanza.mjs:8-18, 87-102`: `dati.json` con
**tutte** le collezioni (ordini, clienti, paghe, magazzino), `utenti.json`
(uid, email, telefono, claim), `file/`; `elimina-istanza.yml:101-107` li
copia in `gs://$ARCHIVIO_BUCKET/istanze/<slug>/` nel progetto
`drink-regia`, 180 giorni (`infra/README.md:57-68`); li legge il
provisioning SA (objectAdmin) e, previsto, il runtime (objectViewer). Il
bucket oggi non esiste. Altri flussi minori: `presentazione` registra
l'uid del dipendente che ha aperto l'app (`lib/presentazione.js:233-243`);
`contatti/` e i log portano l'email dell'admin del locale; la coda `mail`
va a Resend (SMTP extra-UE, da dichiarare). `traccia` invece non salva
né IP né cookie: bene.

**Danno.** Il principio «la regia non contiene mai i dati operativi dei
locali» (CLAUDE.md, regole r.3-5) è vero per Firestore ma non per lo
Storage della regia dopo un'eliminazione: 180 giorni di dati completi di
clienti e personale (art. 28/30 GDPR) leggibili da chi compromette il
runtime (finding 3) o il provisioning SA (finding 1).

**Cosa fare.** Bucket con accesso uniforme, prevenzione accesso pubblico,
retention 180 giorni, accesso a un SA di archivio dedicato (né runtime né
provisioning), firma dell'URL di download con quel SA; zip cifrato con
chiave consegnata al titolare o CMEK; audit log Data Access; scriverlo nel
DPA e nell'informativa; qualificare la frase nei testi.

### 19. tana-drink: letture pubbliche troppo larghe (agosto #4 e #10, più le ricette)

**Evidenza.** `rules:106-109` `drinks` `read: if true` con `recipe` e
`recipe_items` dosati (`api.js:197-198`; il cliente vede solo
`ingredienti`). `rules:380-383` `licenza/*` `read: if true`: piano, moduli,
limiti, `regia_url`, `cancellazione`, note degli aggiornamenti.
`rules:369` tutto `settings/*`: `settings/printer` (IP della stampante) e
`sumup_reader_id`. `rules:227-231` `orders`: `get` pubblico per id (scelta
di design) e lista anonima del tabellone che torna i documenti interi con
`push_token`, `customer_name`, `placed_by.email`.

**Danno.** Con la apiKey del bundle un concorrente scarica le ricette
dosate di tutta la carta e il rapporto commerciale del locale col
fornitore; il tabellone espone dati personali degli avventori.

**Cosa fare.** `recipe`/`recipe_items` in `drinks_ricette/{id}` leggibile
da `isBartender()`; una proiezione `licenza/pubblica` con solo `moduli`,
`stato`, `marchio`; `settings/printer` e `sumup_reader_id` fuori dal
pubblico; per il tabellone una proiezione senza campi personali. Test in
`tests/regole/`.

### 20. tana-drink: ore e timbrature di tutti, per tutto il personale (agosto #11)

**Evidenza.** `rules:594-597` `staff_hours` e `rules:615-619` `staff_shifts`:
`read: if isStaffMember()`, `create, update: if licenzaValida() &&
isStaffMember()`, senza vincolo sulla persona. Il contratto dei permessi
lo codifica come voluto (`tests/contratto/permessi.js:84`). Paghe
(`staff_rates`) e minimi extra sono invece riservati: bene.

**Cosa fare.** `isBartender() || resource.data.person_id == request.auth.uid`
in lettura e scrittura (schema di `presenze`/`staff_tokens`); aggiornare
`tests/contratto/permessi.js:76,84` e aggiungere i casi in `tests/regole/`.

### 21. tana-drink: limiti Free solo nella UI

`src/lib/limiti.js:27-31` lo dichiara («il limite nasconde, non
protegge»). Nelle regole solo `scontiConsentiti()` e `modulo()`; nessun
conteggio di `prodotti_max`, `conti_aperti_max`; `storico_giorni` e
`marchio` sono filtri di schermata. Un titolare Free dalla console va
oltre: danno al modello di business, non ai dati altrui. **Decidere:** o
contatori in `counters/` incrementati nella stessa batch (schema già
usato), o dichiararli «di cortesia» in REQ-LIC-003.

### 22. tana-drink, aperti da agosto

- **#7 script con default produzione:** `scripts/set-role.js:23` (scrive
  subito, nessun `--apply`), `recaptcha-domini.js:19`, `import-carte.js:24`,
  `generate-inventory.js:21`, `import-costi-inventario.js:32`,
  `link-inventory.js:21`. I nuovi (`licenza-moduli.js`, `titolare-locale.mjs`,
  `storico-in-produzione.mjs`) sono fatti bene: fare come loro.
- **#8 cache del tablet:** `src/lib/logout.js` non chiama `terminate()` né
  `clearIndexedDbPersistence()`; la cache Firestore (ordini, `staff_rates`,
  `customers`) sopravvive al logout; in localStorage `drink:staff` (elenco
  con email) e `drink:impostazioni` (licenza compresa).
- **#13 errori SumUp al client:** `index.js:363` → `toHttpsError` (372-377)
  passa il corpo grezzo della risposta SumUp. Messaggio generico e dettaglio
  solo nei log.

### 23. Igiene della catena CI/CD (entrambi)

- Action a tag mobili ovunque: `actions/checkout@v4`, `setup-node@v4`,
  `hashicorp/setup-terraform@v3`, `google-github-actions/auth@v2`,
  `setup-gcloud@v2`, `upload-artifact@v4`, `FirebaseExtended/action-hosting-deploy@v0`,
  `anthropics/claude-code-action@v1`. Entrambi: `allowed_actions: all`,
  `sha_pinning_required: false`. Con le chiavi dei finding 1 e 11 in
  gioco, una compromissione upstream le espone.
- Dependabot spento su entrambi, nessun `dependabot.yml`. tana-drink: alert
  di secret scanning #1 «Google API Key» aperto dall'11/08, mai triagiato
  (chiave web, pubblica per disegno: restringerla per referrer e chiudere).
- tana-drink `claude.yml:29-54`: parte per `@claude` di **chiunque**
  (repository pubblico), con `contents/pull-requests/issues: write` e
  `CLAUDE_CODE_OAUTH_TOKEN` di repository; il rifiuto degli attori senza
  permesso è delegato all'action. Una PR generata da prompt injection e
  mergiata di fretta dall'unico admin arriva ai locali con `APP_REF=main`.
  Aggiungere `author_association` in `OWNER|MEMBER|COLLABORATOR` al `if:`.
- drink-regia: nessuna branch protection né ruleset (GitHub Free),
  environment senza protezioni, un solo collaboratore che si auto-approva.
  tana-drink ha invece ruleset senza bypass su `main`/`develop` e tag solo
  admin: bene.
- Terraform: `~> 6.0` senza `.terraform.lock.hcl` tracciato: il provider
  fluttua a ogni run.
- tana-drink: workflow «Regia» ancora registrato `active` ma assente da
  ogni ramo (residuo di `feature/flotta`); environment `copilot` attivo.

**Cosa fare.** Pin a SHA con commento della versione, `allowed_actions:
selected`, Dependabot acceso (anche solo security updates), lock del
provider committato, alert chiuso, residui rimossi.

### 24. Dipendenze (`npm audit`)

| | Radice | Functions | Nota |
|---|---|---|---|
| drink-regia | 17 (3 critici, 6 alti, 8 moderati) | 8 moderati | critici e alti tutti in **devDependencies** (`vitest`, `vite`, `happy-dom`); `react-router-dom` 6 moderato, impatto nullo oggi; functions tutte transitive di `firebase-admin` 13 |
| tana-drink | 37 (3 critiche, 16 alte, 18 moderate) | 15 (1 critica, 4 alte) | in runtime `firebase` (via `@grpc/grpc-js`) e `react-router-dom` (diretta, fix senza major); functions `proxy-addr` critica, `body-parser`, `@fastify/busboy`, tutte con fix non-major |

**Cosa fare.** tana-drink: `npm audit fix` in `functions/` e alla radice
sulle dirette non-major, subito. Regia: `firebase-admin` 14 nelle
functions. Entrambi: `vite` 8, `vitest` 5, `happy-dom` 21 in un ramo
dedicato; `npm audit --omit=dev --audit-level=high` nel workflow di test.

---

## ⚪ Basse

### 25. Open redirect su `ritorno` (L1 del 22/10)
`index.js:337-338` e `2170-2171`: solo `^https?://`; poi `success_url` di
Stripe su quel dominio. Un Checkout vero che al termine rimanda a un
dominio altrui. **Fare:** accettare solo `origin` in `DOMINI_NOSTRI`/`REGIA_URL`
(già calcolati a `index.js:640`), o ignorare l'input come `portaleAbbonamento`.

### 26. Sito chiuso: punti non coperti
Il blocco lato Functions (`solOSitoAperto`, `index.js:1900-1906`) copre le
nove callable di vendita: bene. Mancano la **registrazione**
(`Dashboard.jsx:44` con account nuovo mostra `Registrati`, `db.js:100-105`
scrive `clienti/{uid}`; le regole lo permettono) e `chiediTemaSuMisura`
(1683). **Fare:** anteprima in `Dashboard.jsx:44` se `chiuso` e nessun
cliente; `solOSitoAperto()` in `chiediTemaSuMisura`; la callable di
registrazione del finding 4 chiude anche questo.

### 27. CSV injection nel commerciale
`src/lib/commerciale.js:346-356` `cella()` quota `; " \n` ma non neutralizza
`= + - @` o tab iniziali; `nome_locale`, `email`, `sconto` arrivano dai
clienti e l'admin apre il CSV in Excel. **Fare:** se
`/^[=+\-@\t\r]/.test(s)` anteporre `'`.

### 28. `href` e piccole cose
- tana-drink `FunzioneNonInclusa.jsx:12`, `InstallazioneSospesa.jsx:56`,
  `AvvisoPiano.jsx:16` (`regia_url`, fonte fidata), `SupplierInvoicesPanel.jsx:598`
  (allegati), `App.jsx:817` (social): nessun controllo di protocollo; al più
  self-XSS fra colleghi. Un `hrefSicuro()` che riusa `httpsValido`
  (`passaggioRegia.js:116-122`). Nella regia `istanza.url` (finding 12).
- Regia `firestore.rules:208-211` `impostazioni/{doc}` leggibile da ogni
  autenticato: informazioni interne. Restringere a `admin()`.
- Regia `scripts/admin-regia.mjs:30`: `--project` con default
  **`drink-regia`**; un `--email` sbagliato dà il claim admin in produzione.
  Obbligare `--project` come `semina-test.mjs`.

### 29. Confine, dettagli
- `APP_REF=main` (`functions/.env:18`, `index.js:88`): le attivazioni
  compilano «quello che c'è su main adesso» e l'esito non registra lo SHA.
  Usare l'ultimo tag di produzione o risolvere a SHA e scriverlo in
  `istanze/<slug>.commit`.
- `gs://drink-regia-tfstate`: versioning spento, accesso uniforme non
  attivo, ruoli legacy a `projectEditor` (quindi al runtime), un bucket per
  le due regie. Versioning, UBLA, un bucket o un prefisso con IAM per regia.
- `lib/provisioning.js:230-237` `bearerValido` accetta qualunque segreto
  non vuoto: con `non-configurato` il callback sarebbe indovinabile.
  Rifiutare sotto 32 caratteri e il segnaposto.
- `index.js:2649, 2664, 2388`: email negli log delle Functions;
  `presentazione.da` = uid di un dipendente del locale. Loggare uid o
  impronta; non salvare `da` se non è il titolare.

### 30. tana-drink, dettagli
- `rules:317-324` `service_stats` senza validazione del valore (agosto #14).
- `092da85`→`f095073`: la web API key di produzione è stata nella storia
  (pubblica per disegno): verificare in GCP la restrizione per referrer e
  per API, e chiudere l'alert.
- Sei script (`set-role.js:38-39`, `bibite-a-pezzo.js`, `generate-inventory.js`,
  `import-carte.js`, `import-costi-inventario.js`, `inventario-a-pezzo.js`)
  portano l'OAuth client **pubblico** di firebase-tools e scambiano da soli
  il `refresh_token`: non è un segreto vostro; portarli su
  `lib-firestore.js` → `accessToken()` come `appcheck.js`.
- `stampanteFinta.js:141-143` escapa `<` e `&` ma non `"`: solo emulatore.

---

## Stato dei precedenti

**Regia, 22/10/2026** (`audit-sicurezza-privacy.md`): chiuse **C1**
(input dei workflow solo via `env:` e validati), **C2** (`richieste` non
creabili, slug e piano dal documento), **H1** (allowlist dei blocchi
modificabili in `clienti`), **M3** (attivazione addebitata), **M4**
(webhook idempotente e ordinato), **M7**, **M8**. Aperte: **H2** (lato
tana-drink: chiusa su `develop`, non in produzione → finding 8), **H3** →
finding 1, **H4** → finding 3, **M1** → finding 12, **M2** → finding 5,
**M5** → finding 14, **M6** → finding 10 e 13, **L1** → finding 25.

**tana-drink, 26/08/2026:**

| # | Finding | Stato |
|---|---|---|
| 1 | Vocali/foto nel repo pubblico | 🔴 aperto → finding 2 |
| 2 | `counters` scrivibile da chiunque | ✅ risolto (`0ecda74`, BUG-091, 14 test, in produzione dalla 1.5.7) |
| 3 | App Check non imposto | 🟠 aperto → finding 10 |
| 4 | `orders` pubblici | 🟡 parziale: creazione chiusa e vincolata alla licenza, `list` ristretta; restano `get` per id e tabellone → finding 19 |
| 5, 6 | Callable SumUp POS Pro, `sumupWebhook` | ⚫ decaduti (codice rimosso, BUG-094/095 `wontfix`) |
| 7 | Script con default produzione | 🟡 aperto → finding 22 |
| 8 | Cache del tablet | 🟡 aperto → finding 22 |
| 9 | CSP/header | 🟡 aperto → finding 14 |
| 10 | `settings/*` pubblici | 🟡 aperto → finding 19 |
| 11 | `staff_shifts` altrui | 🟡 aperto → finding 20 |
| 12 | CI: `@claude`, action, SA | 🟡 aperto → finding 11 e 23 |
| 13 | Errori SumUp al client | 🟡 aperto → finding 22 |
| 14 | Basse | ⚪ mailto risolti; `service_stats` aperto; `npm audit` peggiorato → finding 24, 30 |

---

## Cose fatte bene (da preservare)

**Regia.**
- Tutte le 45 callable esportate: le amministrative aprono con
  `req.auth?.token?.admin !== true → permission-denied`; nessuna senza
  controllo.
- Stripe: firma su `rawBody`, registro `eventi_stripe/{id}` in
  transazione, ordine per `event.created`, «disdetto» che non si riapre,
  prezzi e IVA dal listino lato server, coupon e usi dei codici in
  transazione, `ritorno` del portale fisso su `REGIA_URL`.
- Workflow della flotta: input solo via `env:` validati nel primo passo con
  lo stesso regex delle Functions, `${{ inputs.* }}` mai dentro `run:`,
  `concurrency` per slug, credenziali pulite `if: always()`, produzione
  solo da ciò che è su `main` di tana-drink, `deletion_policy = PREVENT`,
  backup verificato prima di eliminare; demo isolata con regole chiuse e CSP.
- Il token del locale si verifica col progetto che dichiara (`aud` letto
  senza fiducia → `istanze` per progetto → `verifyIdToken` con quel
  progetto): un locale non può spacciarsi per un altro.
- Passaggio regia↔app: 32 byte casuali, SHA-256, 60 s, monouso in
  transazione, frammento `#`, Origin verificato, `iat` ≤ 5 min, titolare
  per email verificata.
- Chiave AI per installazione: solo impronta, `timingSafeEqual`, tipi di
  richiesta chiusi, schema JSON d'uscita, tetto mensile, `maxInstances`;
  federazione OIDC con Anthropic e SA dedicato `ai-regia` senza accesso ai
  locali: **il modello da estendere al resto del runtime.**
- Segnaposto `non-configurato` gestito (Stripe 503, callable
  `failed-precondition`); segreti solo negli environment, mai a livello di
  repository; `gh secret set` via stdin.
- Frontend: nessun `dangerouslySetInnerHTML`, nulla in `localStorage` oltre
  la lingua, claim `admin` usato solo per la UI.
- `semina-test.mjs` rifiuta progetti che non finiscono in `-test`; storia
  git senza segreti; `.env` e `.env.e2e` mai tracciati; dati di prova su
  dominio `.example` con `semina: true`.

**tana-drink.**
- `licenza/attuale` `write: if false`, `settings/bar.licenza` con
  `licenzaIntatta()`, ogni scrittura condizionata a `licenzaValida()`,
  `modulo()` e `scontiConsentiti()` nelle regole, `COLLEZIONI_DEI_MODULI`
  allineata da un test; `licenza-core.js` rilegge la licenza nelle
  Functions e un test la confronta con le regole.
- Regole sull'emulatore in CI a ogni PR, matrice dei moduli, Playwright.
- `counters` chiuso vincolando il *cosa*, non il *chi*.
- Verso la regia: solo i due progetti scritti per intero, token del
  titolare rinnovato, URL di Stripe e di ritorno validate.
- Ruoli nei claim, `staffAdmin` con protezione dell'ultimo admin,
  `requireRole` sul lettore, importi mai dal client, webhook che rilegge
  l'esito da SumUp.
- Ruleset senza bypass su `main`/`develop`, tag solo admin, deploy da tag
  con approvazione; slug dei clienti validati prima del filesystem; build
  per cliente senza segreti né passaggi a shell.

---

## Non verificato

- Valore, scadenza e perimetro di `GITHUB_DISPATCH_TOKEN` e `PROJECT_TOKEN`
  (solo dichiarati fine-grained; il dispatch non c'è in produzione).
- Se `PROVISIONING_CALLBACK_SECRET` di test e produzione è davvero lo
  stesso valore (solo dai documenti); IAM di Secret Manager.
- 2FA dell'account GitHub (`two_factor_authentication: null`, scope
  mancante); MFA sugli admin Firebase; permessi dell'installazione della
  Claude GitHub App e del Copilot agent; se `claude-code-action` verifichi
  da sé i permessi dell'attore.
- Se GitHub Free concede ai privati la deployment branch policy.
- Enforcement App Check reale in console (`scripts/appcheck.js`);
  restrizioni della chiave web di `tana-drink`; regole realmente
  pubblicate in produzione (confrontato `origin/main`, non il live).
- Contenuto dello stato Terraform e dei file in `gs://drink-regia-tfstate`;
  eventi iscritti al webhook Stripe; configurazione di Trigger Email/Resend;
  ticket a GitHub Support sulla purga di `registrazioni/`.

---

## Priorità operativa

**A. Oggi, dalle console, senza codice** (finding 1, 2, 11, 23)
1. tana-drink: cancellare `PROVISIONING_SA_JSON`, `PROVISIONING_CALLBACK_SECRET`,
   `BILLING_ACCOUNT_ID`, le tre variabili e l'environment `flotta`;
   spostare `FIREBASE_SERVICE_ACCOUNT` di produzione nell'environment
   `production`; chiudere l'alert di secret scanning e restringere la
   chiave web; accendere Dependabot (anche sulla regia).
2. IAM: revocare la chiave `1439bb8d…` del provisioning SA; togliergli
   `owner` su `tana-drink`; ruotare il callback secret con valori diversi
   per regia.
3. tana-drink: cancellare `release/1.3.0`, `release/1.4.0` e i rami
   locali; riscrivere la storia senza `registrazioni/`; ticket a GitHub;
   decidere sulla visibilità.

**B. Prima del primo deploy delle Functions della regia in produzione**
(finding 3, 4, 5, 7)
4. SA dedicato per il runtime senza Editor, `REGIA_SA_EMAIL` aggiornato,
   `tokenCreator` sulla Tana solo quando il passaggio si accende; MFA
   sugli admin.
5. Slug unico (callable o prenotazione) + `limit(2)` con errore.
6. `cambiaScelta` manuale → richiesta di approvazione.
7. Controllo dell'etichetta `ambiente` in `elimina-istanza.yml`.

**C. Prima della prima attivazione vera** (finding 6, 8, 9, 10, 12, 17)
8. Job di build separato senza credenziali nei tre workflow.
9. tana-drink: rilascio 1.10.x in produzione; `storage.rules` su `drinks/`
   con test; `enforceAppCheck` sulle callable del personale.
10. Callback: `progetto`, `url`, `archivio.bucket` vincolati, `run_id` e
    anti-replay; `moduloDallApp` legato al titolare.

**D. Entro le prime attivazioni** (finding 1.4-1.6, 13, 14, 15, 16, 18, 19, 20, 23, 24)
11. SA di provisioning per regia e ruoli minimi, poi WIF e revoca di tutte
    le chiavi JSON; `.terraform.lock.hcl`; pin a SHA.
12. `traccia` con allowlist e `maxInstances`; header di sicurezza su
    entrambi (prima in report-only); codici sconto; emulatore e test delle
    regole nella regia.
13. Bucket archivio con SA dedicato, cifratura, audit log, testi legali.
14. tana-drink: tre ritocchi alle regole (ricette, licenza pubblica,
    `settings/printer`, tabellone; `staff_*` per persona) con test;
    `npm audit fix` su `functions/` e dirette.

**E. Consolidamento** (finding 21, 22, 25-30)
15. Decisione sui limiti Free; script con default sul test; cache al
    logout; errori SumUp generici; open redirect; sito chiuso; CSV;
    `hrefSicuro`; `APP_REF` a tag; tfstate con versioning; `bearerValido`;
    log senza email; `claude.yml` con filtro sull'autore.

Le voci su tana-drink si lavorano in quel repository secondo le sue
regole (ramo `feature/`, requisito o bug nel registro); quelle sulla regia
qui, una PR per gruppo. Le voci del blocco A sono azioni di console: le
fa una persona, non la CI.
