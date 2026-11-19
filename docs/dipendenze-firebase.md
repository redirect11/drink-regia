# Le dipendenze della regia da Firebase e da Google Cloud

La mappa di tutti i punti in cui la regia (sito, backoffice, Functions,
flotta) usa Firebase o Google Cloud. Serve il giorno in cui si volesse
cambiare piattaforma: dice cosa reimplementare, dove, e dove oggi manca
l'interfaccia da reimplementare.

Daniele, 15/11/2026: «Un agente dovrebbe segnarsi da qualche parte tutte le
integrazioni forti che abbiamo con firebase così che un giorno se cambiamo
(ad esempio andiamo diretti su aws, o google cloud e docker o simili)
dobbiamo solo reimplementare delle interfacce».

**La regola** (REQ-FLOTTA-116): chi aggiunge una dipendenza nuova da
Firebase o Google Cloud aggiorna questo documento nella stessa PR.
`tests/dipendenzeFirebase.test.js` fa rosso se un file del codice che usa un
SDK di Firebase o di Google Cloud, o un workflow che parla con Google, non è
citato qui. Il controllo cerca il nome della libreria anche nei commenti:
un file che la nomina e basta va citato lo stesso, con una riga che lo dice.

Stato al 15/11/2026, `develop` 219372e (regia 0.5.0-beta). Le righe citate
sono di quel commit; i conteggi sono fatti con `grep` e comprendono i
commenti, quindi sono a spanne.

## Il vocabolario

Lo stesso di tana-drink (`docs/porte-e-adattatori.md` là) e di
[on-premise.md](on-premise.md):

- **porta**: l'interfaccia che il codice usa, con le sole operazioni che
  servono;
- **adattatore**: l'implementazione di oggi, Firebase o Google Cloud;
- **ospite**: chi esegue la logica (oggi `functions/index.js` dentro Cloud
  Functions).

Per ogni porta qui sotto il dato che conta di più è l'ultimo: **c'è un punto
unico** (un modulo da cui passano tutte le chiamate) **o manca la porta**
(chiamate sparse, da raccogliere prima di poter cambiare adattatore).

## Il quadro in breve

| # | Porta | Adattatore di oggi | Punto unico |
|---|---|---|---|
| 1 | Identità delle persone | Firebase Auth (client e Admin), custom claims | client sì (`src/lib/db.js`); server **manca la porta** |
| 2 | Database della regia | Firestore (client e Admin), regole | client sì (`src/lib/db.js`); server **manca la porta** |
| 3 | Funzioni HTTP e callable | Cloud Functions v2 (`onCall`, `onRequest`) | logica sì (`functions/lib/`); ospite in un file solo |
| 4 | Reazioni ai cambi del database | trigger di Firestore | solo in `index.js`, 4 dichiarazioni |
| 5 | Lavori pianificati e compiti a orario | Cloud Scheduler, Cloud Tasks | sì (`programma()`), più 1 `onSchedule` |
| 6 | Segreti e configurazione | Secret Manager (`defineSecret`), `functions/.env.<progetto>` | sì (testa di `index.js`) |
| 7 | Identità dei server dei locali | ID token di Google, account `ai-locale@<progetto>` | sì (`lib/identita-locale.js`) |
| 8 | Identità della regia verso Anthropic | server dei metadati di Google (federazione OIDC) | sì (`claude()` in `index.js`) |
| 9 | Log e monitoraggio | Cloud Logging (scrittura e lettura), `testIamPermissions` | scrittura sì (`lib/registro.js`), ma 73 `console.*` sparse |
| 10 | Hosting del sito | Firebase Hosting | configurazione sì (`firebase.json`); i domini `web.app` sparsi |
| 11 | File e archivi | Cloud Storage | 1 chiamata nelle Functions; script e workflow diretti |
| 12 | Email | estensione Firebase «Trigger Email» (coda `mail`) | sì (`accodaEmail`) |
| 13 | Creazione dei progetti dei locali (flotta) | Terraform google/google-beta, gcloud, firebase-tools | Terraform sì (`infra/istanza/main.tf`); workflow e script **manca la porta** |
| 14 | Accesso ai progetti dei locali | Admin SDK con un'app per progetto (`appDi`) | sì per aprire il progetto; le operazioni **sparse** |
| 15 | Permessi e account di servizio | IAM di Google Cloud | **manca la porta**: script, Terraform e workflow |
| 16 | Prove e strumenti | emulatore di Firestore, firebase-tools | `package.json` e `test.yml` |

Un fatto verificato a favore: in `functions/` solo `index.js` importa
`firebase-functions` e `firebase-admin`; dei 41 moduli di `functions/lib/`
solo `registro.js:98` carica il logger di Firebase, e lo fa dentro una
funzione apposta. Nel sito solo `src/lib/firebase.js` e `src/lib/db.js`
importano `firebase/*`. La separazione fra logica e ospite che tana-drink
sta facendo adesso, qui c'è già per la logica; manca per l'accesso ai dati
lato server.

## Le porte

### 1. Identità delle persone

**Cosa fa.** Registrazione con email e password o con Google, accesso,
password dimenticata, email di verifica; il claim `admin` (backoffice) e il
claim `collabora` (collaboratore di un locale, REQ-FLOTTA-098); chi chiama
una callable (`req.auth`).

**Dove.**
- Client: `src/lib/db.js:4-15` (dieci funzioni di `firebase/auth`);
  `osservaUtente` (`db.js:27-38`) legge i claim dal token; `signInWithPopup`
  `db.js:135-139`; `signInWithCustomToken` `db.js:377` (il passaggio).
- Una fuga dal punto unico: `messaggio()` in `src/pages/Registrati.jsx:293`
  traduce i codici d'errore di Firebase Auth (`email-already-in-use`,
  `invalid-email`, `weak-password`, …). Un altro adattatore deve dare gli
  stessi codici, o la pagina va cambiata.
- Server: `getAuth()` in `functions/index.js` a 883 (`deleteUser`), 2391
  (`listUsers`), 2473, 3017, 3054; `setCustomUserClaims` a 3076 e 3089;
  `req.auth` 121 volte e `req.auth?.token?.admin` 30 volte in `index.js`.
- Regole: `firestore.rules:8-10` (`autenticato`, `admin`, `mio`), 9 usi di
  `request.auth`.
- Script: `scripts/admin-regia.mjs:53`, `scripts/semina-test.mjs:75`,
  `scripts/abilita-accesso-email.mjs` (Identity Toolkit in REST).

**Quanto è intrecciata.** Media: il client è raccolto, il server no (121
letture di `req.auth` dentro i gestori).

**Reimplementarla.** AWS: Cognito (claim negli attributi o nei gruppi; la
finestra di Google come identity provider federato). Docker/Postgres: un
servizio d'accesso (Keycloak, Ory, o quello del backend scelto) con JWT. In
tutti e due i casi gli account esistenti si migrano con l'hash delle
password [da verificare: come si esportano gli hash da Firebase Auth].

**Punto unico.** Client sì (`db.js`). Server **manca la porta**: serve un
«chi chiama e con che ruolo» passato ai gestori invece di `req.auth`.

### 2. Database della regia

**Cosa fa.** Clienti, istanze, richieste, rilasci, credito AI, vendita,
sconti, movimenti, traffico, sentinella, impostazioni, passaggi: tutto lo
stato della regia (24 collezioni in `firestore.rules`).

**Dove.**
- Client: `src/lib/db.js`, l'unico che importa `firebase/firestore`
  (`db.js:16`): `onSnapshot` 9 (ascolti in tempo reale del cliente, delle
  impostazioni, del listino), `getDoc` 4, `getDocs` 5, `getDocsFromServer`
  1, `setDoc` 4, `updateDoc` 4, `addDoc` 1. Il browser scrive solo dal
  backoffice e nei contatti: i clienti li scrive la Function
  (`tests/clienti.test.js:98-104` lo tiene fermo).
- Server: in `functions/index.js` circa 192 chiamate
  `db.doc/collection/runTransaction/batch`, 18 `runTransaction`, 4 `batch`,
  12 `FieldValue.*` (`arrayUnion` 6, `delete` 3, `increment` 2,
  `serverTimestamp` 1), `Timestamp`.
- Moduli di `lib/` che ricevono il client Admin e ne usano la forma:
  `registrazione.js:155-202` (transazione con query), `orari-servizio.js:356-364`
  (transazione), `collaboratori.js:87`, `comunicazioni.js:163-166`
  (`create`). `licenza.js:216` (`perIlDatabase(lic, aTimestamp)`) è invece
  il modello giusto: il tipo di Firestore arriva da fuori.
- Regole: `firestore.rules`, 247 righe. L'autorizzazione delle letture del
  sito sta lì, nel linguaggio delle regole di Firestore.
- Fuori dal codice: la policy TTL su `eventi_stripe.scade_il`
  (`docs/handover.md:809`, `lib/eventistripe.js:19`) [da verificare se è
  attiva]; nel repository non c'è `firestore.indexes.json` [da verificare:
  indici composti creati a mano in console per le query con `where` e
  `orderBy`].

**Quanto è intrecciata.** Molto, lato server: è la parte più grande.

**Reimplementarla.** AWS: DynamoDB (transazioni limitate, niente ascolto in
tempo reale nativo: servono AppSync o WebSocket) o RDS Postgres.
Docker/Postgres: tabelle o colonne JSONB, transazioni vere, tempo reale con
LISTEN/NOTIFY o col backend scelto (PocketBase, Supabase). Le regole
diventano permessi del servizio o Row Level Security.

**Punto unico.** Client sì. Server **manca la porta**: una porta dei dati
lato server come quella di tana-drink (`src/porte/dati.js` là), con le sole
operazioni elencate sopra, transazioni comprese. Manca anche un test-guardia
che tenga Firebase dentro `db.js` e `firebase.js` nel sito, e dentro
`index.js` nelle Functions [da verificare: in `tests/` non ne ho trovati].

### 3. Funzioni HTTP e callable

**Cosa fa.** Tutto il lato server della regia: 52 `onCall` (il sito e il
backoffice) e 12 `onRequest` (app dei locali, workflow, Stripe, sentinella),
in `europe-west1`.

**Dove.**
- `functions/index.js`, 3.630 righe: le dichiarazioni, con i due involucri
  del registro a `index.js:38-40`; `HttpsError` 205 volte.
- Client: `httpsCallable` 45 volte in `src/lib/db.js`, sempre con
  `getFunctions(app, 'europe-west1')`; due indirizzi costruiti a mano su
  `cloudfunctions.net` (`db.js:76` `traccia`, `db.js:373`
  `scambiaPassaggio`).
- Server: `SCELTA_URL` a `index.js:146` (`…cloudfunctions.net/sceltaDallApp`,
  finisce nella licenza dei locali).
- I moduli di `lib/` restituiscono i rifiuti col codice di `HttpsError`
  come stringa (`registrazione.js:40`, `orari-servizio.js:44`,
  `collegamento.js:33`): già staccati dal tipo.

**Quanto è intrecciata.** Media: la logica è separata, il protocollo
callable no. Una callable porta con sé il token d'accesso e il formato di
risposta di Firebase.

**Reimplementarla.** AWS: Lambda dietro API Gateway, un endpoint HTTP JSON
per ogni callable. Docker: un servizio Node (Express o Fastify) con le
stesse funzioni; `onCall` diventa `POST /<nome>` con `Authorization: Bearer`.

**Punto unico.** La logica sì (`functions/lib/`). L'ospite è un file solo,
ma mescola dichiarazioni e accesso ai dati: separarli è il lavoro della
porta 2. Gli indirizzi `cloudfunctions.net` sono anche un contratto con
l'app (sezione «Legate al contratto con l'app»).

### 4. Reazioni ai cambi del database

**Cosa fa.** Lancia l'attivazione quando nasce o cambia una richiesta,
riscrive la licenza quando cambiano il piano o i temi su misura.

**Dove.** `functions/index.js:263` (`avviaProvisioning`, `richieste/{slug}`),
`:271` (`rilanciaProvisioning`), `:1983` (`licenzaSegueITemiSuMisura`),
`:2242` (`licenzaSegueIlPiano`, `clienti/{uid}`).

**Quanto è intrecciata.** Poco: 4 trigger.

**Reimplementarla.** AWS: DynamoDB Streams o EventBridge. Postgres: un
trigger che scrive in una tabella «da fare» (outbox) letta dal servizio, o
LISTEN/NOTIFY. Oppure chiamare la funzione nel punto in cui si scrive.

**Punto unico.** Sono dichiarati solo in `index.js`. Come in tana-drink,
conviene scriverli come dati («a ogni cambio di `clienti/{uid}`, questa
funzione»).

### 5. Lavori pianificati e compiti a orario

**Cosa fa.** La sentinella ogni 15 minuti (REQ-FLOTTA-111); i compiti a una
data: scadenze, taglio della giornata, sospensioni al loro momento.

**Dove.**
- `onSchedule` a `functions/index.js:3611` (sotto c'è Cloud Scheduler).
- `onTaskDispatched` `scadenza` a `index.js:1076` (Cloud Tasks), con
  tentativi e limiti di concorrenza.
- `programma()` a `index.js:1063-1072`: `funzioniAdmin().taskQueue(…)` ed
  `enqueue` con id deterministico; il codice `functions/task-already-exists`
  serve a non programmare due volte. 20 chiamate a `programma(` in
  `index.js`. La logica degli orari è pura (`lib/scadenze.js`).

**Quanto è intrecciata.** Poco: un punto solo per accodare.

**Reimplementarla.** AWS: EventBridge Scheduler (SQS ritarda al massimo 15
minuti, quindi per date lontane serve un compito di Scheduler ciascuna).
Docker/Postgres: una tabella dei compiti con un lavoratore (pg-boss, o
BullMQ con Redis) e un cron.

**Punto unico.** Sì: `programma()`. L'esecutore si sposta col resto
dell'ospite.

### 6. Segreti e configurazione

**Cosa fa.** Le chiavi della regia e la configurazione per progetto.

**Dove.**
- `defineSecret` a `functions/index.js:96-107`: `GITHUB_DISPATCH_TOKEN`,
  `PROVISIONING_CALLBACK_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `AI_CHAT_SECRET`; letti con
  `.value()` 8 volte; legati alle singole Function nelle opzioni
  (`secrets: […]`).
- Configurazione: `functions/.env`, `functions/.env.drink-regia`,
  `functions/.env.drink-regia-test`, che Firebase sceglie in base al
  progetto del deploy. Il progetto corrente da `GCLOUD_PROJECT` o
  `FIREBASE_CONFIG` (`index.js:145`).
- Nei progetti dei locali: `scripts/segreti-istanza.mjs:34-35` (Secret
  Manager in REST, i segreti dell'app col segnaposto).

**Quanto è intrecciata.** Poco.

**Reimplementarla.** AWS: Secrets Manager o Parameter Store. Docker:
variabili d'ambiente o file montati (Docker secrets), con un gestore come
Vault se servono rotazione e registro degli accessi.

**Punto unico.** Sì: le dichiarazioni stanno in testa a `index.js`. Il
legame «questa Function vede questo segreto» va rifatto a mano.

### 7. Identità dei server dei locali

**Cosa fa.** Riconosce quale locale chiama `richiestaAI` senza chiavi
(REQ-FLOTTA-077): la Function del locale gira come `ai-locale@<progetto>`,
chiede a Google un ID token per `regia-ai:<progetto della regia>`, la regia
lo fa verificare a Google e risale al locale dal nome del progetto.

**Dove.**
- `functions/lib/identita-locale.js`, puro (la verifica arriva da fuori):
  il destinatario `:28`, gli emittenti di Google `:30`, la forma
  dell'indirizzo dell'account `:35-40`.
- `functions/index.js:2603` (`OAuth2Client` di `google-auth-library`),
  `:2612` (`verificaGettone`), `:2632` (l'uso).
- L'account: Terraform `infra/istanza/main.tf:326-342`; per i locali
  esistenti `scripts/account-ai-locale.mjs` e `prepara-ai-locale.yml`.

**Quanto è intrecciata.** Poco nel codice, molto nel modello: l'identità di
un locale **è** il nome del suo progetto Google.

**Reimplementarla.** AWS: firme IAM (SigV4) o token OIDC di un ruolo per
locale. Docker: un certificato client (mTLS) o una chiave per apparecchio,
come quella già prevista per l'on premise (`on-premise.md`, «L'attivazione
e il controllo»): la regia terrebbe l'impronta, non il progetto.

**Punto unico.** Sì: `identita-locale.js` più `verificaGettone`. Ma è
l'interfaccia 10 del contratto, e si cambia con la procedura di
`contratto-regia-app.md`.

### 8. Identità della regia verso Anthropic

**Cosa fa.** Le Functions AI si presentano ad Anthropic senza chiave
statica: un token firmato da Google per `AI_SERVICE_ACCOUNT`, che l'SDK
scambia con un token Anthropic.

**Dove.** `functions/index.js:2531` (il server dei metadati
`metadata.google.internal`), `:2532-2556` (`claude()`); la configurazione in
`functions/.env.<progetto>`; l'account da `scripts/account-ai.mjs`. Senza
regola di federazione resta `ANTHROPIC_API_KEY` (porta 6).

**Reimplementarla.** Su un'altra piattaforma serve un emittente OIDC che
Anthropic accetti per la federazione [da verificare quali], oppure si torna
alla chiave nel gestore dei segreti.

**Punto unico.** Sì: `claude()`.

### 9. Log e monitoraggio

**Cosa fa.** Una riga strutturata per ogni chiamata HTTP e callable
(REQ-FLOTTA-110); la salute della flotta legge gli errori delle ultime 24
ore e i permessi della regia sui locali. La sentinella è nostra e scrive nel
database: niente allarmi a pagamento di Google.

**Dove.**
- Scrittura: `functions/lib/registro.js:96-99` (`scrittoreGoogle`, il logger
  di `firebase-functions`; lo scrittore si passa da fuori), righe JSON con
  `severity` nel formato di Cloud Logging; in `index.js` 73
  `console.log/error/warn`, alcune già in JSON (la sentinella,
  `index.js:3607`).
- Lettura: `index.js:3462-3467` (`GoogleAuth`, `chiediAGoogle`),
  `:3483-3497` (`logging.googleapis.com/v2/entries:list`, filtro su
  `cloud_run_revision`), `:3469-3481` (`testIamPermissions` su Cloud
  Resource Manager e IAM).
- Il ruolo `roles/logging.viewer` lo dà `scripts/account-runtime.mjs`.
- `functions/lib/salute.js` è pura: elenca i permessi di Google da provare
  (`iam.serviceAccounts.signBlob`, riga 28) e legge le risposte, ma la
  chiamata la fa `index.js`. Nomina l'account `firebase-adminsdk-fbsvc`.

**Quanto è intrecciata.** Poco per la scrittura (JSON su stdout va bene
quasi ovunque), di più per la lettura e i permessi.

**Reimplementarla.** AWS: CloudWatch Logs (JSON su stdout) e Logs Insights
per leggere; `testIamPermissions` diventa `iam:SimulatePrincipalPolicy`.
Docker: stdout raccolto da Loki o simili; la sezione dei permessi va
ripensata.

**Punto unico.** Scrittura sì (`registro.js`), lettura sì (`chiediAGoogle`).
Le 73 `console.*` sono sparse ma portabili.

### 10. Hosting del sito

**Cosa fa.** Serve il sito compilato, con il ritorno a `index.html` per le
rotte e le intestazioni di sicurezza.

**Dove.**
- `firebase.json`: `hosting.rewrites` (`!/@(assets|fonts|video)/**` →
  `/index.html`) e `headers`, compresa la CSP in sola segnalazione che
  nomina `*.googleapis.com`, `*.cloudfunctions.net`, `*.firebaseapp.com` e
  `accounts.google.com`.
- Pubblicazione: `.github/workflows/deploy.yml:79` (`firebase-tools deploy
  --only firestore,functions,hosting`), chiamato da `firebase-hosting.yml`.
- I domini `web.app` e `firebaseapp.com` nel codice: `functions/index.js:151`
  (`DOMINI_NOSTRI`), `:3570`, `functions/lib/moduliapp.js:63`,
  `src/lib/prodotto.js:39` (la demo); e i canali di anteprima
  `<sito>--<canale>.web.app` dei siti dei locali, riconosciuti in
  `functions/lib/presentazione.js:85-91`.
- Il collaudo e2e gira su `https://drink-regia-test.web.app`
  (`.github/workflows/e2e.yml:48`).

**Quanto è intrecciata.** Poco: è un sito statico.

**Reimplementarla.** AWS: S3 e CloudFront (rotte e intestazioni nelle
policy o in una funzione di CloudFront). Docker: Caddy o nginx.

**Punto unico.** La configurazione sì. I domini `web.app` sono in 5 punti:
con un dominio nostro diventerebbero una lista sola.

### 11. File e archivi

**Cosa fa.** Il link temporaneo all'archivio di un locale eliminato; la
copia degli archivi nel bucket della regia.

**Dove.** `functions/index.js:3266` (`getStorage().bucket(ARCHIVIO_BUCKET)`
e `getSignedUrl`, bucket da `index.js:142`); `scripts/archivia-istanza.mjs:30-33`
(Admin di Firestore, Auth e Storage del locale); `scripts/storage-istanza.mjs`
(Storage del locale nel provisioning, con `GoogleAuth` di
`google-auth-library`, riga 22); `elimina-istanza.yml:123`
(`gcloud firestore export`, formato nativo di Firestore) e `:131-160`
(`gcloud storage`). La regia non ha `storage.rules` sue.

**Reimplementarla.** AWS: S3 con URL prefirmati. Docker: MinIO o un altro
servizio compatibile con S3. L'esportazione nativa di Firestore non ha
equivalenti: resta l'archivio leggibile (`archivio.zip`).

**Punto unico.** Una chiamata sola nelle Functions; script e workflow
chiamano Google direttamente.

### 12. Email

**Cosa fa.** Promemoria e avvisi al titolare e all'admin.

**Dove.** La coda `mail` nel formato dell'estensione Firebase «Trigger
Email» (`{ to, message: { subject, text } }`: `functions/lib/comunicazioni.js:37`
e `:163-166`; `accodaEmail` a `functions/index.js:1044`). L'estensione non è
installata e i messaggi restano nella coda (`docs/handover.md:634-637`); la
scelta di dominio e SMTP è ancora aperta.

**Reimplementarla.** Ovunque: un lavoratore che svuota la stessa coda e
manda con SMTP o con un servizio (SES su AWS).

**Punto unico.** Sì: `accodaEmail` e `accodaUnaVolta`.

### 13. Creazione dei progetti dei locali (flotta)

**Cosa fa.** Un progetto Google `drinkpos-<slug>` per locale, con Firebase,
Firestore, accesso, sito e (profilo completo) Functions, Storage e segreti;
poi il deploy dell'app; alla fine l'eliminazione con l'archivio.

**Dove.**
- `infra/istanza/main.tf` (364 righe): provider `google` e `google-beta`
  `~> 6.0` (`:18-19`), lo stato su GCS (`:21`), le API da accendere
  (`:94-120`), `google_project` (`:123`), `google_firebase_project` (`:146`),
  `google_firestore_database` (`:152`), web app e configurazione
  (`:166-177`), `google_firebase_hosting_site` (`:179`),
  `google_identity_platform_config` (`:186`), account e ruoli (`:200-342`),
  `config_web` con le `VITE_FIREBASE_*` (`:345`), l'indirizzo `web.app`
  (`:362`).
- `scripts/abilita-api.mjs`: accende le API di Google di un progetto
  (Service Usage, `firebase.googleapis.com` e le altre, righe 20-21).
- Workflow: `provisiona-istanza.yml` (9 righe con `terraform`,
  `firebase-tools deploy` a `:538`), `aggiorna-istanza.yml`
  (`hosting:sites:get` e `apps:sdkconfig` a `:310-312`, deploy a `:606` e
  `:621`), `elimina-istanza.yml` (11 righe con `gcloud`, `gcloud projects
  delete` a `:154`), `prepara-ai-locale.yml`. Tutti e quattro leggono
  l'etichetta `ambiente` del progetto con `gcloud projects describe`.
- Script in REST su Google: `storage-istanza.mjs` (il bucket predefinito di
  Firebase), `segreti-istanza.mjs`, `abilita-api.mjs`,
  `abilita-accesso-email.mjs`, `titolare-istanza.mjs` (Identity Toolkit),
  `licenza-istanza.mjs` (Admin di Firestore).
- Il nome del progetto come chiave: `PREFISSO_PROGETTI` in
  `src/lib/prodotto.js:15` e `functions/lib/provisioning.js:18`,
  `progettoAtteso` in `provisioning.js:259-260`.
- Credenziali: i quattro workflow della flotta le prendono da
  `scripts/credenziali-flotta.mjs` (REQ-FLOTTA-136): senza chiave, con la
  federazione delle identità di Google (Workload Identity Federation: il
  gettone di GitHub scambiato con un accesso di un'ora all'account della
  regia) se l'environment ha `FLOTTA_WIF_PROVIDER` e `FLOTTA_SA`; altrimenti
  con la chiave JSON di prima (`PROVISIONING_SA_JSON`). Il file scritto è nel
  formato «external_account» delle librerie di Google, letto da Terraform,
  gcloud, firebase-tools e `google-auth-library`. La regia di produzione usa
  ancora `FIREBASE_SERVICE_ACCOUNT` per il suo deploy (`deploy.yml:75`).
- Il pacchetto di tana-drink nei workflow (REQ-FLOTTA-140):
  `scripts/pacchetto-locale.mjs` e `scripts/pacchetto-su-disco.mjs` non
  chiamano Google, ma preparano quello che firebase-tools pubblica: la
  versione fissata di `firebase-tools` letta dal pacchetto, il
  `firebase.json` ammesso, e il collegamento
  `functions/node_modules/.bin/firebase-functions` che firebase-tools lancia
  per scoprire le Functions.
- Il lavoro della flotta su Google (REQ-FLOTTA-138, in pausa dal 18/11/2026:
  le risorse non sono create): `scripts/flotta-lavoro.mjs`
  (regole in `scripts/lib-lavoro.js`) in un Cloud Run Job del progetto della
  regia, immagine `infra/flotta/Dockerfile` costruita con Cloud Build e
  tenuta in Artifact Registry. Chiama `gcloud`, `terraform` e
  `firebase-tools` come i workflow, con le credenziali che dà Cloud Run;
  il blocco per locale è un oggetto di Cloud Storage con precondizione.

**Quanto è intrecciata.** Molto: l'unità di isolamento di un locale è un
progetto Google, con la sua quota di progetti, la sua fatturazione e il suo
IAM.

**Reimplementarla.** AWS: un account per locale con AWS Organizations, o un
account solo con le risorse separate per nome; il modulo Terraform si
riscrive. Docker: un'istanza (contenitori e database) per locale, creata da
uno script o da un orchestratore; è la strada dell'on premise e del «cloud
puro» (`on-premise.md`).

**Punto unico.** Il modulo Terraform è uno. I workflow e gli script chiamano
gcloud, firebase-tools e le API di Google direttamente: **manca la porta**
«crea, aggiorna, elimina un locale», con dietro un adattatore Google.

### 14. Accesso ai progetti dei locali

**Cosa fa.** La regia entra nel Firestore e nell'Auth di ogni locale:
scrive la licenza e i dati del titolare, legge le impostazioni, verifica i
token degli utenti del locale, firma l'accesso «Apri la tua app».

**Dove.**
- `appDi(progetto)` e `firestoreDi(progetto)` a `functions/index.js:819-826`:
  un'app Admin per progetto, che firma come
  `firebase-adminsdk-fbsvc@<progetto>`.
- Gli usi (13 righe): `scriviLicenza` `:1510-1559` (scrive
  `licenza/attuale` e `settings/bar.licenza`), `verificaLicenza`
  `:1564-1567`, `scriviDatiDelLocale` `:1760-1770`, la licenza presente
  `:2097`, `temiDelLocale` `:3138`; `verifyIdToken` `:1733`, `:1823`,
  `:2068`, `:3366`; `getUserByEmail` `:1796`; `createCustomToken` `:1855`.
- Il progetto ricavato dal campo `aud` del token di Firebase:
  `functions/lib/aggiornamenti.js:268-277` (`progettoDelToken`).
- Script: `licenza-istanza.mjs:27-47`, `scripts/titolare-istanza.mjs`
  (l'account del titolare nell'Auth del locale con `firebase-admin`, righe
  29-31; interfaccia 12 del contratto), `archivia-istanza.mjs`.
- La forma della licenza è pura, in `functions/lib/licenza.js` (riga 215: la
  scrittura con `firebase-admin` resta in `index.js`): è già il lato
  «porta» di questa dipendenza.
- I permessi: Terraform `infra/istanza/main.tf:294-320`
  (`roles/datastore.user`, `roles/firebaseauth.viewer`,
  `roles/iam.serviceAccountTokenCreator` sull'account dell'SDK).

**Quanto è intrecciata.** Molto, e non solo nella regia: ogni operazione è
un'interfaccia del contratto con l'app (sezione sotto).

**Reimplementarla.** Dipende dal backend dell'app: con PocketBase o Postgres
per locale, la regia chiamerebbe un'API del locale (licenza, impostazioni,
utenti) invece di scrivere nel suo database.

**Punto unico.** Per aprire il progetto sì (`appDi`). Le operazioni sono
sparse in `index.js`: serve una porta «il locale» con poche operazioni
(scrivi la licenza, leggi `settings/bar`, completa `settings/bar`, verifica
un token, trova un utente per email, firma un accesso).

### 15. Permessi e account di servizio

**Cosa fa.** Gli account con cui girano le Functions (`RUNTIME_SERVICE_ACCOUNT`
e `AI_SERVICE_ACCOUNT`, `functions/index.js:92-95` e `:121`), quelli del
deploy e del provisioning, i ruoli sui locali.

**Dove.** `scripts/account-runtime.mjs`, `scripts/account-ai.mjs`,
`scripts/ruoli-deploy.mjs`, `scripts/ruoli-provisioning.mjs`,
`scripts/lib-iam.js` (REST su Cloud Resource Manager e IAM); il Terraform
delle porte 13 e 14. Gli script di manutenzione usano come credenziale il
login del Firebase CLI (`scripts/lib-firestore.js:1-40`).

**Reimplementarla.** AWS: ruoli e policy IAM (con Terraform). Docker: non
c'è un IAM; account del database e chiavi per servizio.

**Punto unico.** **Manca la porta**: ogni script parla con le API di Google
a modo suo. È anche la parte meno trasportabile, perché descrive la
piattaforma più che il prodotto.

### 16. Prove e strumenti

**Dove.** `npm run test:regole` sull'emulatore di Firestore (`package.json`,
`firebase.collaudo.json`, `.github/workflows/test.yml:85-101`,
`@firebase/rules-unit-testing`, 6 file in `tests/regole/`);
`tests/db.test.js:22-74` finge i moduli `firebase/*`; `firebase-tools`
15.35.0 fissato in `package.json`; gli e2e sul sito di test.

**Reimplementarla.** Le prove delle regole valgono solo per Firestore: con
un altro backend servono prove dei permessi scritte sulla porta, come la
tabella dei ruoli di tana-drink (`tests/contratto/permessi.js` là).

## Legate al contratto con l'app

Queste non si cambiano solo nella regia: sono interfacce di
[contratto-regia-app.md](contratto-regia-app.md) (`docs/contratto-regia-app.md`;
le regole di sicurezza sono in «La sicurezza delle interfacce», REQ-FLOTTA-115),
e un cambio segue la
procedura di quel documento (versione nuova accanto alla vecchia, decisione
di Daniele, voce nel registro dei due repository).

| Interfaccia | Cosa la lega a Firebase o a Google | Dove nella regia |
|---|---|---|
| 1. `licenza/attuale` | un documento nel Firestore del locale, scritto con l'Admin SDK e letto dall'app in tempo reale; le regole dell'app leggono `valida_fino_ts` come `Timestamp` | `index.js:1510-1559`, `lib/licenza.js:216`, `scripts/licenza-istanza.mjs` |
| 2. `settings/bar` (scrittura) | lo stesso trasporto, `set` con `merge` solo nei campi vuoti | `index.js:1760-1770` |
| 3. `settings/bar` (lettura) | lettura del Firestore del locale | `index.js:1521`, `:3138` |
| 4, 5, 9 e la deprecata `passaggioVersoRegia` | il Bearer è un ID token di **Firebase Auth del locale**: la regia ricava il progetto da `aud` e lo verifica con `verifyIdToken` | `lib/aggiornamenti.js:268`, `index.js:1733`, `:1823`, `:2068`, `:3366` |
| 6. `scambiaPassaggio` | risponde con un **custom token di Firebase** firmato come l'account dell'SDK del locale, per `signInWithCustomToken`; l'utente si cerca con `getUserByEmail` | `index.js:1796`, `:1855` |
| 10. `richiestaAI` | il Bearer è un **ID token di Google** di `ai-locale@<progetto>.iam.gserviceaccount.com`, destinatario `regia-ai:<progetto>` | `lib/identita-locale.js`, `index.js:2612` |
| 12. I workflow | il deploy con `firebase deploy`, le `VITE_FIREBASE_*` dal Terraform, `functions/.env.<progetto>` | porta 13 |
| 13. Ruoli | il custom claim `role` nell'Auth del locale; i ruoli IAM della regia sui locali | `infra/istanza/main.tf:294-320` |
| 4-9 e 14. Gli indirizzi | `https://europe-west1-<progetto>.cloudfunctions.net/<nome>`: l'app li costruisce dal nome del progetto della regia; anche `scelta_url` nella licenza | `index.js:146` |

Due conseguenze:

- **Se cambia la regia e non l'app**, le interfacce 1, 2, 3, 4, 5, 6, 9 e 13
  restano legate al Firebase **dei locali**: la regia deve continuare a
  parlare con Firestore e con Firebase Auth dei locali finché tana-drink non
  ha le sue porte (là la porta dell'accesso è ancora da fare,
  `docs/porte-e-adattatori.md`). Anche gli indirizzi `cloudfunctions.net`
  vanno tenuti, o spostati con un'interfaccia nuova.
- **Se cambia l'app** (on premise), servono versioni nuove della 1 e della 6
  (licenza e accesso che non passano da Firestore e da un custom token di
  Firebase) e della 10 (un'identità del locale che non sia un progetto
  Google).

## Cosa non è una dipendenza da Firebase

Stripe (abbonamenti, `stripeWebhook`, `lib/abbonamento.js`), GitHub
(Actions, l'API dei workflow e delle issue), Anthropic (il modello; solo
l'accesso per federazione passa da Google, porta 8), Playwright e Vitest:
restano uguali su qualsiasi piattaforma. Nemmeno l'SMTP delle email, quando
ci sarà, è Firebase: lo è solo il formato della coda `mail`.

## I tre punti più costosi da staccare

1. **Il database lato server senza porta** (porte 2 e 4): circa 192
   chiamate dirette in `functions/index.js`, 20 transazioni, 4 trigger, e
   l'autorizzazione del sito scritta nelle 247 righe di `firestore.rules`.
   Il primo passo, utile anche senza cambiare piattaforma: una porta dei
   dati lato server e un test-guardia sugli import.
2. **L'accesso ai progetti dei locali** (porta 14 e sezione sul contratto):
   non dipende solo dalla regia. Licenza, token e accesso firmato sono
   Firebase per contratto, e cambiano solo insieme a tana-drink.
3. **Un progetto Google per locale** (porte 13 e 15): Terraform
   `google-beta`, quattro workflow con gcloud e firebase-tools, una decina di
   script in REST, l'IAM fra progetti, l'identità del locale che è il nome
   del progetto. Su un'altra piattaforma va riscritta la fabbrica dei locali
   intera, non un adattatore.

## Dove potrei sbagliare

- I conteggi sono fatti con `grep` e comprendono righe di commento: i 205
  `HttpsError` e i 192 accessi a `db`, per esempio, sono un ordine di
  grandezza, non un numero esatto.
- «I moduli di `lib/` sono puri» l'ho verificato sugli `require`; ne ho
  trovati quattro che ricevono il client Admin e ne usano la forma
  (`registrazione`, `orari-servizio`, `collaboratori`, `comunicazioni`).
  Altri possono ricevere documenti di Firestore (`Timestamp`, `.data()`)
  senza che il `grep` li prenda.
- I workflow (584, 666 e 183 righe) non li ho letti per intero: le chiamate
  a Google che non passano da `gcloud`, `firebase-tools`, `terraform` o da
  un indirizzo `googleapis.com` possono mancare.
- Indici composti, policy TTL e stato dell'estensione delle email stanno
  nella console di Google, non nel repository: sono segnati
  [da verificare].
- Le alternative su AWS e Docker sono indicazioni di massima, non prove: i
  costi, la migrazione degli account con le password e il tempo reale vanno
  provati con un prototipo.
- Di tana-drink ho letto solo `docs/porte-e-adattatori.md` della 1.10.x: lo
  stato delle sue porte può essere più avanti su altri rami.
