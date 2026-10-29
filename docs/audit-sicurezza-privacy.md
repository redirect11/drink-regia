# Audit di sicurezza e conformità privacy — drink-regia e istanze

Data: 22/10/2026. Stato del codice: drink-regia `develop` (a5a5bba),
tana-drink `feature/flotta` (1d3f2e2). Revisione in sola lettura del
codice, delle regole Firestore, dei workflow e del Terraform; quello che
richiede la console Google, GitHub o Stripe è elencato in fondo come
«non verificato».

**Questo non è un parere legale.** La parte privacy è una revisione
tecnica di quello che il codice fa davvero, da far validare a un
consulente prima della prima vendita.

Due livelli di responsabilità, da tenere distinti in tutto il documento:

- **La regia** (sito, registrazione, abbonamento, backoffice): la nostra
  società è **titolare** del trattamento dei dati dei clienti, cioè dei
  titolari dei locali.
- **Le istanze** (l'app installata a ogni locale): il locale è titolare dei
  dati dei suoi clienti e del suo personale; noi siamo **responsabili**
  del trattamento (hosting, manutenzione, aggiornamenti, accesso tecnico).

---

## Parte 1 — Sicurezza

### Critiche: da chiudere prima di qualunque attivazione reale

**C1. Iniezione di comandi nel runner GitHub dagli input del cliente.**
`provisiona-istanza.yml` righe 158, 169, 178 e `aggiorna-istanza.yml`
riga 103 usano `${{ inputs.nome_locale }}`, `${{ inputs.piano }}`,
`${{ inputs.moduli }}` dentro `run:`. L'espansione avviene prima della
shell: le virgolette non proteggono. Quei valori li scrive il cliente in
`richieste/{slug}` (le regole non li validano) e `dispatchPayload` li
passa tali quali. Un cliente registrato può far eseguire al runner un
comando qualsiasi con in mano `PROVISIONING_SA_JSON` (Proprietario di
tutte le istanze, utente di fatturazione, scrittura sul bucket dello
stato Terraform), `BILLING_ACCOUNT_ID` e `PROVISIONING_CALLBACK_SECRET`.
*Rimedio:* mai `${{ inputs.* }}` in `run:`: passare tutto con `env:` e
usare `"$NOME_LOCALE"`. In più, allowlist lato Function (`nome_locale`
`^[\p{L}\p{N} '’.&-]{2,60}$`, `piano` `^(base|completo)$`, `moduli` solo
id del listino, `ref` `^(main|v\d+\.\d+\.\d+)$`) e stessi vincoli nelle
regole Firestore di `richieste`.

**C2. Chiunque autenticato crea `richieste/{slug}` per qualsiasi slug,
con piano e stato a scelta, senza abbonamento.** `firestore.rules`
righe 40-45 controllano solo uid, email verificata e stato in «in coda»
o «da approvare». Non controllano che lo slug sia quello del chiamante,
che esista un abbonamento attivo, né quali campi ci siano. Il controllo
«si può attivare?» e la scelta «da approvare» quando il deploy automatico
è spento vivono solo nel client. Conseguenze: attivazione gratis col
piano completo; salto dell'approvazione dell'admin; richiesta sullo slug
di un altro cliente, che perde la lettura della sua istanza e si vede
riscrivere licenza e nome; costi di run e progetti a piacere.
*Rimedio:* la richiesta la crea una **callable** che rilegge
`clienti/{uid}` sul server, pretende `abbonamento.stato == 'attivo'`,
prende slug, piano, moduli e nome da lì e non dal corpo, e sceglie lo
stato leggendo `impostazioni/regia.deploy_automatico`. La regola di
create per i client si toglie. `avviaProvisioning` rilegge comunque il
cliente e rifiuta se slug o stato non coincidono.
*Chiusa il 22/10/2026* (ramo `release/0.1.0`): callable
`chiediAttivazione` con `preparaRichiesta` e `richiestaCoerente` in
`functions/lib/provisioning.js`, `allow create: if false` in
`firestore.rules`. In produzione solo col deploy delle Functions e
delle regole.

### Alte

**H1. Il cliente si assegna moduli e terminali gratis.** La regola di
update su `clienti/{uid}` (riga 29) nega solo `piano`, `abbonamento`,
`uid`, `slug`; `moduli`, `terminali`, `email`, `creato_da_admin` restano
scrivibili, e il trigger `licenzaSegueIlPiano` riscrive la licenza
dell'istanza entro un minuto. *Rimedio:* allowlist dei campi che il
titolare può toccare (`locale`, `fatturazione`, `referente`,
`consensi`); il resto solo admin e Functions.

**H2. La licenza dell'istanza è riscrivibile dal locale stesso.** Nelle
regole dell'app `settings/{docId}` ha `allow write: if isBartender()`
(riga 243): un bartender dalla console del browser scrive
`licenza.stato = 'attiva'` o accende tutti i moduli. Sospensione e piano
sono applicati solo dall'interfaccia. *Rimedio:* negare ai client ogni
modifica della chiave `licenza` (`affectedKeys().hasAny(['licenza'])`);
la scrive solo l'Admin SDK. Per una sospensione efficace: regole che
negano le scritture operative quando `settings/bar.licenza.stato !=
'attiva'`, oppure la regia disabilita gli utenti dell'istanza.

**H3. Chiave statica del service account di provisioning, con troppi
poteri, in ogni run.** Il SA è Proprietario di ogni istanza e la chiave
JSON è un segreto GitHub scritto su disco a ogni run, anche negli
aggiornamenti che hanno bisogno solo dei ruoli di deploy. Il SA `deploy`
che Terraform crea non è mai usato. *Rimedio:* Workload Identity
Federation (niente chiave), SA distinti per provisioning e deploy, ruoli
minimi invece di Proprietario, rotazione della chiave attuale dopo C1.

**H4. Il runtime della regia è il compute SA di default, con
`datastore.user` su ogni istanza.** Qualunque codice nelle Functions
della regia, o una dipendenza compromessa, legge e altera ordini,
clienti, paghe di tutti i locali. Contraddice il «i dati restano del
locale» dei testi legali. *Rimedio:* SA dedicato per le Functions della
regia; sulle istanze un ruolo limitato o una callable autenticata via
OIDC che scrive solo `settings/bar.licenza`.

### Medie

- **M1. Callback di provisioning senza vincoli né anti-replay.** Accetta
  `progetto` e `url` slegati dallo slug; un esito catturato si ripete.
  Vincolare `progetto == 'drinkpos-' + slug`, `url` sul dominio del
  progetto, `run_id` e timestamp con scadenza.
- **M2. `cambiaScelta` nel ramo «manuale»** scrive subito piano, moduli e
  terminali scelti dal client senza pagamento né approvazione. Nel ramo
  manuale creare una richiesta «da approvare».
- **M3. L'attivazione una tantum non viene addebitata**: il sito e i
  Termini la dichiarano, `abbonamento.js` non la aggiunge al Checkout.
- **M4. Webhook Stripe senza idempotenza né ordine**: un `invoice.paid`
  in ritardo riattiva un abbonamento disdetto. Registrare `event.id`,
  confrontare `event.created`, ignorare `invoice.paid` se disdetto.
- **M5. Nessun header di sicurezza su Hosting** (regia e app): CSP,
  `frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Content-Type-Options`.
- **M6. Nessun App Check né limite d'abuso**: Checkout illimitati,
  registrazione aperta senza captcha, nessun `maxInstances`.
- **M7. L'amministratore dell'istanza non viene creato**: su un'istanza
  nuova non esiste nessun utente, «password dimenticata» fallisce; il
  passo a mano con `set-role.js` ha come progetto di default la
  produzione della Tana. Creare l'admin nel workflow con l'email del
  cliente; togliere il default a `set-role.js`.
- **M8. Dati dei clienti nei log pubblici di GitHub Actions**: tana-drink
  è pubblico, il run si chiama «Attiva <slug>», e nome del locale, uid,
  piano, moduli, URL sono nei log. Chiunque sa quali locali usano il
  prodotto. Spostare i workflow della flotta in un repository privato.

### Basse

L1 open redirect su `ritorno` del Checkout; L2 messaggi d'errore grezzi
a schermo e risposta di GitHub nel documento del cliente; L3
`settings/bar` leggibile da chiunque (`regia_url` usato come link: con
H2 aperto è phishing allo staff); L4 token GitHub con `actions:write` su
tutto il repository; L5 `claude.yml` avviato da issue di chiunque; L6
app e workflow presi da `feature/flotta` (va a `main` prima di vendere);
L7 `ref` arbitrario dall'admin finisce in `run:`; L8 password minime
diverse (10 nella regia, 6 per lo staff dell'istanza); L9 dipendenze:
nessuna versione nota vulnerabile nei range dichiarati, `npm audit` non
eseguito.

### Cose fatte bene

Firma Stripe verificata sul corpo grezzo e prezzi dal listino lato
server; `uid` nei metadati preso dal token; claim admin controllato in
ogni callable amministrativa e nelle regole; stesso regex dello slug in
regole, Functions, workflow, Terraform e script; email verificata
richiesta per le richieste; segreti via `defineSecret`, nessun segreto
nel codice né nella storia git; confronto del bearer a tempo costante;
webhook solo POST senza CORS; `permissions: contents: read` sui
workflow; environment `production` con approvazione; `deletion_policy =
PREVENT`; niente `dangerouslySetInnerHTML` né `localStorage` nella regia;
il recupero password non rivela l'esistenza dell'account.

---

## Parte 2 — GDPR, cookie, trattamento dei dati

### 2.1 Cookie e tracker

**Regia: conforme, banner non necessario.** Nessuno script terzo, nessun
font remoto, nessun Analytics, nessun App Check. Firebase Auth tiene la
sessione in IndexedDB, non in cookie; Hosting non imposta cookie; Stripe
Checkout vive sul dominio di Stripe con la sua informativa. Secondo le
Linee guida del Garante del 10/6/2021 lo storage tecnico non richiede
consenso. Da fare: un paragrafo «Cookie e storage tecnico»
nell'informativa. Un banner qui sarebbe sbagliato.

**App dei locali: da sistemare.** Il banner con «Rifiuta» e «Accetta
tutti» di pari peso e Analytics spento fino al consenso è corretto. Ma:

- **Google Fonts caricati da `fonts.googleapis.com`** (`index.html`,
  pagine privacy e cookie): l'IP di ogni cliente del bar va a Google
  prima di qualunque scelta. Portare il font in `public/fonts/`.
- **Il banner chiede il consenso per Google Analytics** anche sulle
  istanze, dove Analytics non esiste (nessun `measurementId` da
  Terraform). Condizionare la categoria alla presenza della chiave.
- **La cookie policy dice «Firebase Authentication solo per lo staff»**,
  ma i clienti del bar fanno login.
- reCAPTCHA via App Check: spento sulle istanze; se si accende va
  dichiarato e valutato il consenso.

### 2.2 Informativa privacy della regia (art. 13): da sistemare

`Legali.jsx` ha una buona struttura ma: titolare segnaposto; Stripe,
Google e GitHub non nominati con i ruoli (GitHub riceve slug, nome del
locale e uid); nessuna sezione sui trasferimenti extra-UE (Firebase Auth,
Cloud Messaging, Hosting e Analytics non sono regionalizzabili e passano
per gli Stati Uniti; Stripe e GitHub idem: citare EU-US Data Privacy
Framework e clausole contrattuali standard, e dire che Firestore e
Functions stanno in `europe-west1`); tempi di conservazione per
categoria; base «legittimo interesse» per log e sicurezza; **decisione
automatizzata**: `sospendiMorosi` sospende da sola dopo sette giorni di
pagamento in sospeso e chiude su disdetta, va descritta con criteri e
modo di contestare, e i Termini promettono un avviso che **nessuna email
manda**; art. 14 per i clienti creati dall'admin (consensi nulli, email
segnata come verificata senza verifica, nessun blocco nella dashboard);
versione dell'informativa.

### 2.3 Consensi alla registrazione: da sistemare

- Termini: accettazione del contratto, con istante salvato. Bene.
- **Privacy: impostazione sbagliata.** La casella dice «acconsento al
  trattamento per il servizio» ed è obbligatoria. La base giuridica per
  account, fatturazione e assistenza è il contratto: un consenso
  obbligatorio non è libero (art. 7.4). Diventa **presa visione** («Ho
  letto l'informativa»), con `privacy_il` come prova.
- **Marketing:** separato e non preselezionato, bene. Ma si salva solo il
  booleano: mancano **istante** e **versione del testo**, e non c'è modo
  di **revocarlo** dalla dashboard. Aggiungere `marketing_il` e
  `versione_testi`, pretenderli nelle regole, ri-chiedere i termini
  quando la versione cambia.
- Clienti creati dall'admin: serve un blocco «Prima di continuare» nella
  dashboard finché termini e presa visione non sono registrati.

### 2.4 Diritti degli interessati e conservazione: manca

Dalla dashboard il titolare può vedere, attivare e cambiare piano.
**Non può** modificare i dati, cancellare l'account, esportare, revocare
il marketing, né disdire (i Termini dicono «dalla propria pagina», che
non esiste; nessun Stripe Billing Portal). Nessuna funzione di
cancellazione nelle Functions. `clienti`, `richieste`, `istanze` non si
cancellano mai. Un'istanza chiusa resta intera finché qualcuno lancia a
mano `elimina-istanza.mjs`, più trenta giorni di Google: i Termini
promettono trenta giorni, la realtà è «quando ci si ricorda». Lo stato
Terraform resta nel bucket. `backup-db.js` scarica l'intero Firestore in
chiaro sul disco di chi lo lancia, senza scadenza né cifratura. I dati
fiscali (dieci anni) non sono separati dal documento cliente.

Da fare: sezione «Il tuo account» nella dashboard (modifica, esporta,
revoca marketing, disdici via Billing Portal, elimina account con
conservazione separata dell'estratto fiscale); Function pianificata che
elimina le istanze chiuse da più di N giorni e avvisa l'admin; backup
pianificati di Firestore in regione con retention al posto dei dump
locali.

### 2.5 Responsabile del trattamento, registro, sicurezza, breach: manca

- **DPA con ogni locale (art. 28)**: il §6 dei Termini non basta. Serve
  un allegato con oggetto e durata, natura e finalità, tipi di dati
  (clienti del bar, personale con ore e paghe, ordini, esiti SumUp),
  istruzioni, riservatezza, misure, **sub-responsabili** con elenco
  pubblico (Google Cloud EMEA; GitHub per build e deploy; SumUp è
  titolare autonomo col suo contratto diretto col locale), assistenza
  per le richieste, cancellazione o restituzione a fine contratto con
  strumento di export, audit, notifica delle violazioni. Accettato in
  registrazione come i Termini, con versione tracciata.
- **DPA a monte**: Google Cloud Data Processing Addendum (da accettare in
  console), Stripe DPA, GitHub DPA. Copia nel registro.
- **Accessi tecnici da dichiarare**: il SA della regia con
  `datastore.user` su ogni istanza, il SA di provisioning Proprietario
  (vedi H3, H4). Attivare gli audit log «Data Access» su Firestore.
- **Registro dei trattamenti (art. 30)**: obbligatorio, il trattamento
  non è occasionale. Due sezioni: come titolare e come responsabile.
- **Misure (art. 32)**: manca l'MFA per gli account con claim admin, che
  governano tutte le istanze; password minima 6 per i clienti del bar;
  backup cifrati; rotazione dei segreti; politica di accesso ai dati di
  produzione delle istanze.
- **Data breach**: procedura scritta, registro interno, contatto
  dedicato, notifica al Garante entro 72 ore quando dovuta, comunicazione
  ai locali senza ritardo.
- **DPO**: non obbligatorio (art. 37): non ente pubblico, nessun
  monitoraggio sistematico su larga scala. Nominare un referente interno
  e scriverlo.
- **DPIA**: non obbligatoria oggi, ma va fatta e conservata una
  valutazione documentata del perché, con attenzione ai dati dei
  lavoratori (timbrature, presenze, paghe) e alla geolocalizzazione dei
  clienti all'ordine (non memorizzata).

### 2.6 Dati dei clienti dei locali e del personale: da sistemare

- **Le pagine privacy e cookie dentro l'app sono quelle della Tana**
  (ragione sociale, indirizzo, email) e vengono servite identiche a ogni
  istanza: il plugin cliente sostituisce i segnaposto solo in
  `index.html`. Un cliente di un altro locale legge un titolare
  sbagliato. Trasformarle in template dai campi `venue_*`, con la nostra
  società come responsabile e i sub-responsabili; rendere obbligatori
  ragione sociale ed email del locale al provisioning.
- **Informativa modello per il personale** (ore, paghe, timbrature,
  presenze, token push, chiamate): è anche art. 4 dello Statuto dei
  lavoratori, serve l'informativa scritta sulle modalità d'uso.
- **Registrazione account clienti** senza link all'informativa né presa
  visione. Aggiungere la riga con il titolare e salvare
  `informativa_vista_il`.
- **Cancellazione account cliente** incompleta: restano nome e uid sugli
  ordini, gruppi, fatture di cortesia, token push. Anonimizzare con una
  Function. I token push sugli ordini restano per sempre: azzerarli a
  conto chiuso.
- **Paghe leggibili da ogni bartender** (`staff_rates`): restringere ad
  admin, come il commento nelle regole già promette.
- **Data di nascita obbligatoria mai verificata**: l'informativa dice che
  serve per l'età, nessun codice la controlla. O si applica il controllo
  dei 18 anni o si toglie il campo; consigliata la dichiarazione di
  maggiore età più controllo al banco.
- Retention configurabile degli ordini (anonimizzazione dopo 12-24 mesi).
- Note libere degli ordini: possono contenere allergie (dato sanitario):
  dirlo nell'informativa.

### 2.7 Localizzazione dei dati

Conforme: Firestore e Functions in `europe-west1`, bucket dello stato in
EU. Da sistemare: nessun bucket Storage creato da Terraform (il bucket di
default di Firebase nasce spesso in US; le istanze ci mettono foto e
allegati delle fatture fornitore); log delle Functions in bucket «global»
senza retention; nessun backup pianificato. Auth, Messaging, Hosting
passano per gli USA per natura: scriverlo nelle informative.

### 2.8 Email

La regia manda solo le email di Firebase Auth (verifica, reset) da
`noreply@drink-regia.firebaseapp.com`: configurare mittente e dominio
verificato, anche per le istanze. **Nessuna email di servizio nostra**:
pagamento fallito, sospensione tra sette giorni, istanza sospesa o
chiusa, istanza attivata. I Termini promettono un avviso che non parte.
Il marketing, il giorno che parte: solo con `marketing_il`, link di
disiscrizione, mittente con SPF/DKIM/DMARC, mai alle PEC di fatturazione.

---

## Parte 3 — Lista delle cose da fare, in ordine

### Prima di qualunque attivazione reale

1. [codice] **C1**: input dei workflow via `env:`, allowlist nelle
   Functions e nelle regole.
2. [codice] **C2**: la richiesta di attivazione la crea una callable che
   verifica l'abbonamento sul server; via la create dai client.
   **Fatto il 22/10/2026** (`release/0.1.0`), da pubblicare.
3. [codice] **H1**: allowlist dei campi che il titolare può modificare.
4. [codice] **H2**: la chiave `licenza` di `settings/bar` non è
   scrivibile dai client; sospensione applicata dalle regole.
5. [organizzazione] **M8**: workflow della flotta in un repository
   privato; nel frattempo via nome del locale e uid dagli input.
6. [codice] Presa visione al posto del consenso privacy; `marketing_il`
   e `versione_testi`; pagine privacy e cookie dell'app come template dai
   campi del locale; Google Fonts in locale.
7. [testi legali] Informativa completa (titolare reale, Stripe, Google,
   GitHub, trasferimenti, conservazione, decisione automatizzata,
   storage tecnico, versione); DPA art. 28 come allegato ai Termini;
   Termini corretti su avviso, tempi di cancellazione, disdetta.
8. [organizzazione] Registro dei trattamenti; procedura data breach con
   contatto dedicato; MFA sugli account admin; accettazione dei DPA di
   Google, Stripe, GitHub.

### Entro le prime attivazioni

9. [codice] **H3, H4**: Workload Identity Federation, SA distinti, ruoli
   minimi, SA dedicato per la regia.
10. [codice] **M1, M2, M4**: callback vincolata e anti-replay; ramo
    manuale di `cambiaScelta` con approvazione; idempotenza del webhook.
11. [codice] **M3, M5, M6, M7**: attivazione addebitata; header di
    sicurezza; App Check e limiti; creazione dell'admin dell'istanza nel
    workflow.
12. [codice] Dashboard «Il tuo account»: modifica, export, revoca
    marketing, disdetta, eliminazione; blocco termini per clienti creati
    dall'admin; email di servizio (pagamento fallito, sospensione,
    attivazione).
13. [codice] Eliminazione automatica delle istanze chiuse; Terraform con
    bucket Storage in EU, log in regione con retention, audit log,
    backup pianificati.
14. [codice] App: presa visione alla registrazione cliente;
    anonimizzazione alla cancellazione; token push azzerati a conto
    chiuso; data di nascita risolta; paghe solo admin; banner cookie
    condizionato.
15. [testi legali] Informative modello per clienti e personale dei
    locali, da consegnare col DPA.

### Consolidamento

16. Retention configurabile degli ordini; strumento di export per il
    locale; password minima 8-10 anche per lo staff; valutazione
    documentata su DPIA e DPO con revisione annuale; cifratura o divieto
    dei dump locali; basse L1-L9.

---

## Non verificato da qui

Header effettivi di Hosting e HSTS; protezioni degli environment GitHub
e dove sta `PROVISIONING_SA_JSON`; scope reale del token GitHub e ruoli
effettivi dei SA in console; visibilità effettiva dei repository e dei
log; App Check e impostazioni Auth sui progetti (protezione da
enumerazione email, domini autorizzati); eventi iscritti al webhook
Stripe e modalità; regole Firestore realmente deployate; ACL e
versioning del bucket dello stato; versioni risolte nel lockfile.
