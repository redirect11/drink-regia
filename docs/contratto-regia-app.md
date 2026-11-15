# Le interfacce fra la regia e l'app

La regia (questo repository, `drink-regia`) e l'app dei locali (`tana-drink`)
sono due programmi che si parlano. Questo documento elenca **ogni punto in
cui lo fanno**, e dice **come si cambia** uno di questi punti senza rompere i
locali. È il riferimento per tutti e due i repository: tana-drink rimanda
qui invece di tenerne una copia.

Daniele, 14/11/2026: «l'unico modo per essere incompatibili è che tana drink
o regia usino api vecchie quindi io direi di iniziare a documentare le api e
un modo per fare questo cambio quando cambiano le api», e «ogni modifica che
va fatta bisogna sempre verificare se rischiamo di cambiare una interfaccia
ed aggiornare il documento» (REQ-FLOTTA-107).

Stato di partenza: regia 0.4.2, tana-drink 1.10.49 (14/11/2026).
`tests/contratto.test.js` controlla che ogni Function HTTP della regia e ogni
input dei workflow che pubblicano l'app abbiano qui la loro voce.

## Come si cambia un'interfaccia

**Prima di ogni modifica**, in tutti e due i repository, ci si chiede: tocca
una delle interfacce qui sotto? Se sì, il documento si aggiorna **nella
stessa PR**, e la descrizione della PR lo dice.

1. **Cambio compatibile**: un campo nuovo facoltativo, un valore nuovo che
   l'altra parte può ignorare, una Function nuova. Si fa, e si scrive qui con
   la data e la versione da cui c'è.
2. **Cambio incompatibile**: un campo tolto o rinominato, un significato
   diverso, un codice di risposta che cambia senso, un input dei workflow
   che diventa obbligatorio. **Si fa mai sul posto.**
   1. Si **aggiunge** la versione nuova accanto alla vecchia (un campo nuovo,
      una Function nuova, un valore nuovo), e qui si scrive tutte e due.
   2. L'altra parte passa alla nuova, con una sua voce nel registro.
   3. La vecchia passa fra le **interfacce deprecate** (sotto), con la
      versione dell'app da cui non si usa più.
   4. Si toglie solo quando **nessun locale** usa più una versione che la
      chiama: le versioni installate le dice la presentazione di ogni locale
      (`istanze/{slug}.presentazione.versione`). La rimozione ha una sua voce
      nel registro.
3. **Chi la cambia**: un'interfaccia è un contratto fra i due repository, e
   per regola i contratti si cambiano solo con una decisione di Daniele
   (CLAUDE.md). Ogni cambio ha una voce nel registro di tutti e due, e un
   test che controlla la forma della richiesta e della risposta.

## Le interfacce

Convenzioni. «Regia» e «app» indicano il codice dei due repository. Ogni
Function HTTP della regia, per un errore inatteso, risponde `500 { errore }`
(dal 14/11/2026, REQ-FLOTTA-110: prima poteva restare senza risposta fino al
timeout); l'app tratta ogni risposta diversa da `200` come da riprovare. Le
Function della regia stanno in `europe-west1`:
`https://europe-west1-<drink-regia|drink-regia-test>.cloudfunctions.net/<nome>`.
L'app costruisce gli indirizzi con `urlFunzioneRegia` (`src/lib/funzioniRegia.js`),
solo per i due progetti della regia, e aspetta al massimo 20 secondi. Gli
errori della regia arrivano come `{ errore: "<testo in italiano>" }` e l'app
li mostra così come sono.

### 1. La licenza: `licenza/attuale` (regia → app, documento)

- **Trasporto**: la regia scrive con l'Admin SDK nel Firestore del locale
  (`firestoreDi(progetto)`, firmando come `firebase-adminsdk-fbsvc@<progetto>`);
  l'app lo legge in tempo reale, e le sue regole non lo fanno scrivere a
  nessuno dall'app.
- **Campi** (`licenzaProtetta`, regia `functions/lib/licenza.js`): `piano`,
  `moduli` (`{menu_tavoli, ordini_cliente, clienti, magazzino, conta,
  fatture, scadenzario, statistiche, staff, sumup}`: vero o falso),
  `terminali`, `temi`, `temi_su_misura`, `limiti` (per il Free
  `{prodotti_max, conti_aperti_max, sconti, storico_giorni, utenti_max,
  marchio, comande, stampa, ai}`, `null` per gli altri), `prove`
  (`{modulo: scade_il}`), `stato` (`attiva|sospesa|chiusa`), `motivo`, `dal`,
  `slug`, `regia_url`, `rinnovo_url`, `aggiornamenti` (interfaccia 5),
  `valida_fino`, `valida_fino_ts`, `alla_scadenza` (`free|ferma`),
  `cancellazione` (`{il, richiedente}` o `null`), `scritta_il`.
- **Quando**: `scriviLicenza(slug)` (regia `functions/index.js`), chiamata
  dall'esito dell'attivazione, dalla presentazione, dai cambi di piano e di
  temi, dal taglio della giornata e dalle sospensioni. Solo se il locale la
  riceve (`riceveLicenza`: attivo e `licenza_dalla_regia !== false`; la Tana
  e la demo no).
- **App**: `src/lib/licenza.js` (`licenzaEffettiva`; documento assente →
  `non_attivata`), `src/lib/licenzaInVigore.js` (scadenza e `alla_scadenza`),
  `src/lib/limiti.js`, `InstallazioneSospesa.jsx` (`rinnovo_url ||
  regia_url`), `firestore.rules` (`licenzaValida()`).
- **Da quando**: BUG-125 e REQ-LIC-009 (fine ottobre); `valida_fino` dal
  31/10, `alla_scadenza` dal 02/11, `limiti.stampa` dal 12/11, `limiti.ai` e
  `rinnovo_url` dal 13/11.
- **Documenti**: handover §7; app `docs/licenza-valida.md`, `docs/flotta.md`.

**1b. La prima licenza alla nascita** (workflow della regia → progetto del
locale): `scripts/licenza-istanza.mjs` (regia), dal job `pubblica` di
`provisiona-istanza.yml`, prima del deploy. Scrive `licenza/attuale` (piano,
moduli, temi, `temi_su_misura: []`, limiti, stato, slug, `regia_url`,
`rinnovo_url`, `scritta_il`) e in `settings/bar` `venue_name` e
`venue_short_name` se mancano. `scriviLicenza` la completa all'esito.

**1c. La licenza della Tana senza regia** (deploy dell'app): app
`scripts/licenza-iniziale.mjs` con `clienti/<cliente>/licenza-iniziale.json`,
scritta solo se manca (`scritta_da: 'deploy'`). La Tana ha `regia_url: null`.

### 2. I dati del titolare in `settings/bar` (regia → app, documento)

- La regia scrive in `settings/bar`, solo nei campi vuoti, `venue_name`,
  `venue_legal_name`, `venue_address`, `venue_postal_city`, `venue_city`,
  `venue_phone`, `venue_vat_number`, `venue_tax_code`, `venue_legal_address`
  (`datiDelLocale` in `functions/lib/passaggio.js`; `scriviDatiDelLocale`,
  all'esito di un'attivazione riuscita).
- App: `src/lib/venue.js` (le impostazioni vincono sulla build).
- Da REQ-FLOTTA-030 (02/11). Documenti: handover §7; app
  `docs/passaggio-dalla-regia.md` §3.

### 3. Quello che la regia legge da `settings/bar` (app → regia, documento)

- `business_day_cutoff_hour`: l'ora del taglio della giornata (5 se manca,
  come `DEFAULT_CUTOFF_HOUR` nell'app), per le riduzioni, il taglio e
  `valida_fino` (`functions/lib/taglio.js`).
- `stili_installati`, `temi_installati` (`[{id, nome, stile}]`),
  `stile_menu`: li legge `temiDelLocale` (callable del backoffice) per la
  scheda del locale (REQ-FLOTTA-039). Li scrivono `stileMenu.js` e
  `marketplaceTemi.js` dell'app.

### 4. La presentazione: `presentazione` (app → regia, HTTP)

- `POST …/presentazione`, `Authorization: Bearer <ID token di un utente
  qualunque del locale>`, corpo `{ versione }` (`v1.2.3` o `1.2.3-beta.x`). La
  regia riconosce il locale dal progetto del token e lo verifica con quel
  progetto.
- Risposte: `200 { ok, licenza: 'scritta'|'presente'|'non_dalla_regia'|'non_attiva' }`;
  `400` versione; `401` token; `404` locale non registrato o eliminato; `405`;
  `503` licenza che non si legge o non si scrive (REQ-FLOTTA-108: prima la
  lettura fallita era un `500`; per l'app non cambia niente, ogni risposta
  diversa da `200` si riprova alla prossima apertura); `500` errore inatteso.
- La regia salva `istanze/{slug}.presentazione { versione, il, prima_il }`: è
  la versione installata che si vede nella scheda, e quella che decide quando
  si può togliere un'interfaccia deprecata.
- App: `src/lib/presentazione.js` (una volta per versione per dispositivo;
  di nuovo se manca la licenza), `src/lib/api.js`, `src/App.jsx`.
- Da REQ-FLOTTA-026 (02/11). Documenti: handover §7; app
  `docs/presentazione-alla-regia.md`.

### 5. Gli aggiornamenti a scelta: `licenza.aggiornamenti` e `sceltaDallApp`

- **Documento** (regia → app): `licenza.aggiornamenti = { modalita:
  'obbligatori'|'a_scelta', inclusi, motivo: null|'free'|'non_pagato',
  proposta: null|{ tag, note, proposta_il, saltata_il }, avviso: null|{ id,
  testo, dal }, scelta_url }` (`licenzaAggiornamenti`, `functions/lib/aggiornamenti.js`).
- **HTTP** (app → regia): `POST <scelta_url>` = `…/sceltaDallApp`, Bearer
  dell'ID token del titolare, corpo `{ tag: 'vX.Y.Z', scelta:
  'aggiorna'|'salta' }`. Risposte: `200 { ok, scelta }`; `400`; `401`; `403`
  non admin o non il cliente della regia (REQ-FLOTTA-050); `404`; `405`;
  `409` proposta superata o già scelta; `502` aggiornamento non partito.
- **Contratto implicito**: la regia legge il `CHANGELOG.md` di tana-drink al
  tag (`raw.githubusercontent.com`) per le note della proposta: il formato dei
  titoli `## X.Y.Z — data` fa parte del contratto.
- App: `src/lib/aggiornamenti.js` (`sceltaUrl` accetta solo gli indirizzi
  delle due regie), `PropostaAggiornamento.jsx`.
- Da REQ-FLOTTA-020 (31/10). Documenti: handover §7; app
  `docs/aggiornamenti-dalla-regia.md`.

### 6. Dalla regia all'app: «Apri la tua app» (`#accesso-regia` e `scambiaPassaggio`)

- La regia (callable `passaggioVersoApp`) crea un codice monouso e apre
  `<url del locale>/#accesso-regia=<codice>`. L'app toglie il codice
  dall'indirizzo e fa `POST …/scambiaPassaggio` con `{ codice }`, senza token.
- Il codice: 43 caratteri base64url, 60 secondi, una volta sola; nel database
  solo l'impronta (`passaggi/{impronta}`); lo scambio vale solo dall'origine
  dell'`url` registrato per il locale.
- Risposte: `200 { token }` (custom token per `signInWithCustomToken`);
  `400` codice non valido; `403` scaduto, usato o da un altro sito; `405`;
  `503` firma non riuscita.
- Chi entra: nel progetto del locale serve un account con la stessa email di
  chi è entrato nella regia, **verificata**, non disattivato, con
  `role: 'admin'`; per il titolare (`titolareNelLocale`) e, da REQ-FLOTTA-098,
  per un collaboratore (`membroNelLocale`).
- App: `src/lib/passaggioRegia.js`, `src/main.jsx`.
- Da REQ-FLOTTA-030 (02/11). Documenti: handover §7; app
  `docs/passaggio-dalla-regia.md` §1.

### 7. Dall'app alla regia: «Area clienti» (collegamento a `/dashboard`)

- **Dalla 1.10.49** (14/11/2026, REQ-FLOTTA-104): un collegamento in una
  scheda nuova a `<origine di regia_url, se https, altrimenti
  https://<VITE_REGIA_PROGETTO>.web.app>/dashboard`, senza token, visibile
  agli admin del locale. La regia tiene `/dashboard` come ingresso dell'area:
  senza accesso porta a `/accedi` e da lì torna a `/dashboard`
  (`tests/AreaClienti.test.jsx`, `App.test.jsx`, `AccessoGoogle.test.jsx`).
- Prima della 1.10.49: `passaggioVersoRegia`, deprecata (vedi sotto).
- Documenti: app `docs/passaggio-dalla-regia.md` §2.

### 8. Il catalogo dei temi e degli stili: `catalogoTemi` (app ← regia, HTTP pubblico)

- `GET …/catalogoTemi`, senza token, CORS aperto, cache di 5 minuti.
- `200 { temi: [{ id, nome, descrizione, prezzo: 0, tavolozza: { base,
  colori }, stile }], stili: [{ id, nome, descrizione, prezzo: 0, ricetta }] }`,
  solo i pubblicati; la ricetta ha `versione: 1`; `405`.
- Il vocabolario è condiviso e duplicato a mano (vedi «Le copie da tenere
  allineate»).
- App: `src/lib/marketplaceTemi.js` (letto all'apertura del marketplace).
- Da REQ-FLOTTA-032 e 034 (02/11). Documenti: app `docs/marketplace-temi.md`,
  `docs/catalogo-temi.md`, `docs/stili-a-ricetta.md`.

**I temi su misura** arrivano all'app dentro la licenza
(`licenza.temi_su_misura`, interfaccia 1), riscritti dal trigger
`licenzaSegueITemiSuMisura` (REQ-FLOTTA-040).

### 9. I moduli: `catalogoModuli` e `moduloDallApp` (HTTP)

- `GET …/catalogoModuli`, pubblico, cache di un minuto: `200 { moduli: [{ id,
  prezzo, prova_giorni }] }`, solo quelli in vendita e non compresi in ogni
  piano.
- `POST …/moduloDallApp`, Bearer dell'ID token, corpo `{ modulo, azione:
  'prova'|'aggiungi'|'disdici', ritorno }` (`ritorno` sui domini del locale).
  Risposte: `200 { ok }`, `{ ok, scade_il }` (prova), `{ ok, dal }`
  (disdetto), `{ ok, in_attesa: true }` (piano gestito a mano); errori `{ ok:
  false, errore }` con `400`, `401`, `403` (non admin o non il cliente),
  `404`, `405`, `409` (sito chiuso, modulo non in vendita, prova o
  dipendenze), `502` e `503` (Stripe).
- App: `src/lib/marketplaceModuli.js` (serve anche `regia_url` in licenza),
  `MarketplaceTab.jsx`.
- Da REQ-FLOTTA-037 / REQ-LIC-012 (02/11). Documenti: app
  `docs/marketplace-moduli.md`.

### 10. L'AI: `richiestaAI` (Function del locale → regia, HTTP fra server)

- **Identità**: la Function `richiestaAI` del locale gira come
  `ai-locale@<progetto>` (solo se `REGIA_PROGETTO` è nel suo `.env`), chiede
  a Google un ID token con destinatario `regia-ai:<REGIA_PROGETTO>` e fa
  `POST …/richiestaAI` con `Authorization: Bearer <gettone>`. La regia lo
  verifica con Google e riconosce il locale dal nome del progetto
  nell'indirizzo dell'account (`functions/lib/identita-locale.js`); un solo
  locale con quel progetto, attivo, non simulato, non chiuso, non la demo.
- **Richieste**: `{ tipo: 'descrizione', nome, produttore?, categoria?,
  note? }`; `{ tipo: 'fattura', file, media_type }` (PDF fino a 20 MB,
  immagini fino a 5 MB); `{ tipo: 'credito' }`; `{ tipo: 'chat', messaggi,
  strumenti, versione }`.
- **Risposte**: `200` col risultato e `costo_eur`, `credito_eur`; per il
  credito `{ credito_eur, tetto_mensile_eur, speso_mese_eur, attivo, motivo,
  ricaricabile, ricarica_url }`; per la chat `{ turno: { role: 'assistant',
  content, firma }, testo, strumenti_richiesti, versione, limiti_strumenti,
  costo_eur, credito_eur }`. `400`; `401 { errore: 'Locale non
  riconosciuto.' }`; `402 { codice: piano|credito|tetto|spento|senza-cassetto }`;
  `409 { codice: 'versione'|'troppo-lunga' }` (chat,
  `VERSIONE_CHAT = 'chat-2026-11-13.2'`); `422 { codice:
  rifiuto|troncata|vuota|illeggibile }`; `429`; `503 { codice: 'servizio' }`;
  `405`.
- **La chat**: la firma di ogni turno del modello (`<contesto>.<HMAC>`, con
  `AI_CHAT_SECRET`) la fa e la controlla solo la regia; per l'app è una
  stringa da rimandare com'è. Le regole della conversazione (append-only,
  esiti prima del testo, due turni di chi scrive di fila) sono nell'handover
  §7.
- **Regia**: `functions/index.js` (`richiestaAI`, `interrogaClaude`),
  `functions/lib/ai.js`, `functions/lib/ai-chat.js`. **App**:
  `functions/index.js` e `functions/lib/ai-service.js` (che interpreta i
  codici), `src/lib/aiApi.js`, `src/lib/chatAI.js`, `src/lib/strumentiChat.js`.
- **Da quando**: REQ-AI-003 (24/10); il gettone senza chiave dal 12/11
  (REQ-FLOTTA-077, 079); credito, piano, prenotazione e ricarica
  (REQ-FLOTTA-085, 087, 088, 091); chat dal 13/11 (REQ-FLOTTA-094 / REQ-AI-006).
- **L'account `ai-locale`**: per i locali della flotta lo crea il Terraform,
  e `aggiorna-istanza.yml` lo sistema con `scripts/account-ai-locale.mjs`;
  per un locale esistente c'è il workflow `prepara-ai-locale.yml`
  (REQ-FLOTTA-078). L'app ha `REGIA_PROGETTO` in `functions/.env.<progetto>`.

### 11. Le Function della regia per i workflow: il callback `esitoProvisioning` (workflow → regia, HTTP)

- `POST <vars.REGIA_CALLBACK_URL>` = `…/esitoProvisioning`, `Authorization:
  Bearer <PROVISIONING_CALLBACK_SECRET>`.
- Corpo: `{ slug, stato: 'in coda'|'in corso'|'attiva'|'errore', url?,
  progetto, versione, errore, ambiente, operazione:
  'attivazione'|'aggiornamento', profilo, ref, commit, run_id, inviato_il }`;
  per l'eliminazione `{ slug, operazione: 'eliminazione', stato:
  'eliminata'|'errore', archivio, errore, run_id, inviato_il }`.
- Risposte: `200 { ok }`; `400` (esito non valido, progetto diverso, esito
  vecchio o ripetuto); `401`; `405`; `409` (locale simulato); `503` (segreto
  non configurato).
- Lo mandano i workflow della regia, non l'app: tana-drink non lo chiama
  (per la Tana la versione arriva dalla presentazione).
- Da REQ-FLOTTA-006, 012, 048, 049.

### 12. I workflow che pubblicano l'app (regia → GitHub → build di tana-drink)

La regia lancia i suoi workflow con `GITHUB_DISPATCH_TOKEN`, sul ramo
`FLOTTA_REF` (oggi `main`), e il workflow scarica tana-drink al `ref` chiesto.

- **Input di `provisiona-istanza.yml`**: `slug`, `nome_locale`, `piano`
  (`free|base|completo`), `moduli` (csv), `uid`, `email`, `ref` (`main` o
  `vX.Y.Z`; in produzione deve già stare su `main` di tana-drink), `ambiente`
  (`produzione|test`), `profilo` (`completo|leggero`).
- **Input di `aggiorna-istanza.yml`**: `slug`, `nome_locale`, `ref`,
  `ambiente`, `profilo`, `email`, `uid`, `progetto` (per un locale esistente),
  `cliente` (la cartella in `clienti/` di tana-drink), `build` (JSON con sole
  `VITE_FIREBASE_MEASUREMENT_ID`, `VITE_FIREBASE_VAPID_KEY`,
  `VITE_RECAPTCHA_SITE_KEY`).
- **Quello che i workflow si aspettano dentro tana-drink**:
  - `scripts/genera-cliente.mjs` (senza, la versione è troppo vecchia: serve
    la 1.10); `--sa tipo-locale`, poi `--slug --nome [--tipo-locale]`, che
    crea `clienti/<slug>/venue.json` se manca;
  - per la demo `clienti/demo/venue.json` con `demo: true` e
    `scripts/controlla-build-senza-demo.mjs` (o la ricerca di
    `drink:demo-sessione`) per le build che non sono la demo;
  - `npm ci` nella radice e in `functions/`, `npm run build`;
  - la versione pubblicata è `package.json.version`; il formato dei titoli del
    `CHANGELOG.md` è quello dell'interfaccia 5.
- **La build**: `CLIENTE=<cartella>`, `BASE_PATH=/`, `VITE_APP_ENV`,
  `VITE_PROFILO`, `VITE_REGIA_PROGETTO` (`drink-regia` o `drink-regia-test`,
  vuoto per la demo), `GIT_BRANCH`, `GIT_COMMIT`, e `.env` con i
  `VITE_FIREBASE_*` del progetto. Le Functions ricevono `functions/.env.<progetto>`
  con `VENUE_NAME` e `REGIA_PROGETTO`.
- **Il deploy**: `firebase deploy --only firestore,storage,functions,hosting`
  (profilo leggero: `firestore,hosting`); i segreti dell'app (`SUMUP_API_KEY`)
  nascono col segnaposto (`scripts/segreti-istanza.mjs`).
- **Il titolare**: `scripts/titolare-istanza.mjs` crea nel locale l'account
  col **lo stesso uid** di `clienti/{uid}` nella regia, email verificata e
  `role: 'admin'` (REQ-FLOTTA-029, M7). La copia per i locali esistenti è in
  tana-drink (`scripts/titolare-locale.mjs`).
- **L'etichetta `ambiente`** del progetto (`produzione|test`) deve essere
  quella della regia che lancia: altrimenti aggiorna, elimina, provisiona e
  prepara-AI si fermano (REQ-FLOTTA-048, 100).
- Documenti: `docs/flotta-nella-regia.md`, `infra/README.md`, handover §7;
  app `docs/flotta.md`.

### 13. Identità, ruoli e permessi (contratto implicito)

- Nel progetto del locale il custom claim `role` (`admin` è chi amministra il
  locale) lo leggono la regia e le regole dell'app. Il titolare ha nel locale
  lo stesso uid che nella regia.
- La regia, con l'account scritto in `REGIA_SA_EMAIL` dell'environment della
  flotta (in produzione `runtime-regia@drink-regia` dal 14/11/2026), ha su
  ogni locale `roles/datastore.user`, `roles/firebaseauth.viewer` e
  `roles/iam.serviceAccountTokenCreator` su `firebase-adminsdk-fbsvc@<progetto>`
  (Terraform; per un locale esistente `scripts/account-runtime.mjs --locale`).

### 14. `VITE_REGIA_PROGETTO` nella build della Tana

Il deploy della Tana (`.github/workflows/deploy.yml` di tana-drink) mette
`drink-regia` in produzione e `drink-regia-test` altrove; i test e2e
`drink-regia-test`. Da qui vengono gli indirizzi delle interfacce 4, 6, 7, 8
e 9.

## Le interfacce deprecate

| Interfaccia | Al posto suo | L'app smette di usarla | Si toglie quando |
|---|---|---|---|
| `passaggioVersoRegia` (`POST` con Bearer dell'ID token appena rinnovato, `200 { url: '<REGIA_URL>/accesso#accesso-regia=<codice>' }`; `401`, `403`, `404`, `405`, `503`) | il collegamento a `/dashboard` (interfaccia 7) | 1.10.49 (14/11/2026) | tutti i locali almeno alla 1.10.49 |
| `settings/bar.licenza` (la copia della licenza che la regia scrive ancora accanto a `licenza/attuale`) | `licenza/attuale` | 1.10 (BUG-125) | tutti i locali almeno alla 1.10 |

## Le Function HTTP della regia che non parlano con l'app

- `stripeWebhook`: gli eventi di Stripe (abbonamenti, pagamenti).
- `traccia`: il conteggio delle visite del sito della regia (REQ-FLOTTA-042).
- `sentinellaViva`: la prova di vita della sentinella per il guardiano esterno
  (`.github/workflows/guardiano.yml`, REQ-FLOTTA-111): `GET`, risponde solo
  `{ viva, minuti }`. La sentinella apre i siti dei locali come un visitatore
  qualunque: per l'app non è un'interfaccia.

Tutte le altre Function HTTP della regia sono interfacce con l'app o con i
workflow, e sono descritte sopra: `presentazione`, `sceltaDallApp`,
`scambiaPassaggio`, `passaggioVersoRegia`, `catalogoTemi`, `catalogoModuli`,
`moduloDallApp`, `richiestaAI`, `esitoProvisioning`.

## Le copie da tenere allineate a mano

Non sono interfacce che si chiamano, ma valori scritti uguali nei due
repository: cambiarne uno senza l'altro è un cambio di interfaccia.

- `LIMITI_FREE` (app `src/lib/licenzaInVigore.js`) e i limiti del Free in
  `functions/piani.json`.
- `MODULI_PREMIUM` (app) e l'elenco dei moduli della regia.
- Il vocabolario di temi e stili: regia `functions/lib/temi.js` e
  `functions/lib/stili.js` (`BASI`, `STILI`, `ESCLUSIVI`, `CARATTERI`), app
  `themes.js`, `stileMenu.js`, `stiliRicetta.js`, `marketplaceTemi.js`.
- Il titolare nel locale: regia `functions/lib/titolare.js`, app
  `scripts/lib-titolare.js`.
- L'ora del taglio della giornata: 5 da tutti e due i lati.

## Incoerenze note (14/11/2026)

Da sistemare, ognuna con la sua voce quando la si affronta:

1. **Moduli**: l'app gestisce `checkout_url` e il ritorno con `?esito=`, ma la
   regia non risponde mai `checkout_url`; l'app ignora `scade_il` della prova.
2. **Credito AI**: la regia manda `ricaricabile` e `ricarica_url`
   (REQ-FLOTTA-091), che l'app 1.10.x non usa ancora.
3. **Chat**: l'app non legge `limiti_strumenti` (le righe sono fisse in
   `strumentiChat.js`).
4. **La prima licenza** (1b) non ha `valida_fino`, `alla_scadenza`,
   `cancellazione`, `aggiornamenti`, `terminali`, `prove`, `motivo`, `dal`
   finché l'esito non la completa; quella della Tana (1c) non ha `piano`,
   `terminali`, `rinnovo_url`, `aggiornamenti`, `temi_su_misura`. L'app regge
   le assenze.
5. **Campi scritti e non letti**: `licenza.terminali`, `licenza.scritta_il`,
   e la copia deprecata `settings/bar.licenza`.
6. **Il codice del passaggio**: l'app accetta da 8 a 256 caratteri, la regia
   ne genera e accetta 43. Compatibile, non identico.
7. **`genera-cliente.mjs` della 1.10.x** non conosce `--tipo-locale`: il
   workflow ripiega, e telefono, partita IVA, codice fiscale e sede legale
   arrivano solo dall'interfaccia 2.
8. **`provisiona-istanza.yml`** non lancia `account-ai-locale.mjs`: l'account
   `ai-locale` di un locale nuovo dipende dal Terraform.
