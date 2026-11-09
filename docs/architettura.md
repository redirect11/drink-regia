# Architettura: infrastruttura e pipeline

Scritto il 30/10/2026. È il documento di riferimento su come sono fatti e
come si pubblicano i prodotti dell'azienda, oggi solo drink. Lo legge chi
arriva dopo: chi manterrà drink, chi costruirà gym-tracker o un altro
prodotto, e chi dovrà capire perché una cosa è fatta così. Il disegno per i
prodotti nuovi sta in [nuovo-prodotto.md](nuovo-prodotto.md); quello che
verrà dopo in [sviluppi-futuri.md](sviluppi-futuri.md).

---

## 1. I pezzi

```
                      ┌──────────────────────────────┐
  titolari, admin ──▶ │  REGIA  (drink-regia)        │  repository redirect11/drink-regia
                      │  sito del prodotto + backend │  progetti drink-regia / drink-regia-test
                      │  Hosting, Auth, Firestore,   │
                      │  Functions, Stripe           │
                      └──────┬───────────────▲───────┘
           lancia i workflow │               │ esito (callback)
                             ▼               │
                      ┌──────────────────────┴───────┐
                      │  GITHUB ACTIONS della regia  │  environment flotta / flotta-test
                      │  Terraform + firebase-tools  │
                      └──────┬───────────────────────┘
       crea e pubblica       │ (l'app la prende da tana-drink, a un ramo o a un tag)
                             ▼
   ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
   │ drinkpos-a    │ │ drinkpos-b    │ │ drinkpos-…    │   un progetto Google per locale
   │ app del locale│ │ app del locale│ │               │   Hosting, Auth, Firestore,
   └───────────────┘ └───────────────┘ └───────────────┘   (Functions, Storage)

   ┌───────────────────────────────┐
   │ LA TANA (tana-drink)          │   repository redirect11/tana-drink, il codice dell'app
   │ progetti tana-drink /         │   la Tana si pubblica dai suoi workflow, come prima
   │ tana-drink-test               │
   └───────────────────────────────┘
```

| Pezzo | Cos'è | Dove |
|---|---|---|
| **App del locale** | La PWA di cassa e comande (React, Vite, Firebase). Una sola app per tutti i locali; il locale è un dato (`clienti/<slug>/venue.json` e le impostazioni nel suo database) | repository `tana-drink` |
| **La Tana** | Il primo locale, quello vero, nato prima della regia. Si pubblica dai workflow di tana-drink | progetti `tana-drink`, `tana-drink-test` |
| **Regia** | Il sito del prodotto e il suo backend: prezzi, registrazione, abbonamento, dashboard del cliente, backoffice, attivazione delle istanze | repository `drink-regia`, progetti `drink-regia`, `drink-regia-test` |
| **Istanza** | Il progetto Google di un locale cliente, creato dalla regia | progetti `drinkpos-<slug>` |
| **Flotta** | L'insieme delle istanze, e i workflow e il Terraform che le creano | `drink-regia`: `infra/istanza`, `.github/workflows/*-istanza.yml` |

**Il principio: un progetto Google per locale.** I dati di un locale stanno
solo nel suo progetto. La regia non ne legge nessuno: sa solo account,
piani, abbonamenti e stato delle istanze, e nell'istanza scrive solo la
licenza. Ogni locale ha i suoi costi, i suoi limiti e le sue regole, e un
problema in un locale non tocca gli altri.

## 2. I progetti Google e gli account

| Progetto | A cosa serve | Fatturazione |
|---|---|---|
| `drink-regia` (600871952552) | la regia di produzione | account 1 |
| `drink-regia-test` (246268671867) | la regia di test: Stripe in modalità test, istanze di prova | account 2 (le prove) |
| `drinkpos-<slug>` | un locale vero | account 1 |
| `drinkpos-prova-<…>` | un locale di prova, creato dalla regia di test | account 2 |
| `tana-drink`, `tana-drink-test` | la Tana | i suoi |

Gli account di servizio:

| Account | Cosa fa | Dove sta la chiave |
|---|---|---|
| `provisioning@drink-regia` | crea e pubblica le istanze: Terraform, deploy, licenza, backup | segreto `PROVISIONING_SA_JSON` negli environment `flotta` e `flotta-test` |
| runtime delle Functions della regia (`<numero>-compute@…`) | scrive la licenza nelle istanze (sospensione, piano, prove) | nessuna chiave: è il runtime di Google |
| `deploy@<istanza>` | creato in ogni istanza, per un deploy fatto da lì | nessuna chiave in giro |
| l'account di deploy della Tana | pubblica la Tana | segreti di tana-drink |

**Senza un'Organizzazione Google Cloud** un account di servizio non può
creare progetti. Oggi il progetto di un'istanza lo crea una persona, che
dà il ruolo di proprietario a `provisioning@drink-regia`, e il workflow
lo importa nello stato di Terraform. Con l'Organizzazione col nome
dell'azienda (decisa il 30/10/2026, nome e dominio da scegliere) il
progetto lo crea Terraform, in una cartella del prodotto
([nuovo-prodotto.md](nuovo-prodotto.md) §1).

La **quota di progetti** per account di fatturazione è limitata: ogni
istanza, anche Free, ne occupa uno. L'aumento è stato chiesto a Google.

## 3. Dentro la regia

**Sito** (React, Vite, `src/`): la prima pagina coi piani, registrazione in
quattro passi con l'email confermata, dashboard del titolare, backoffice
dell'admin (claim `admin` sull'account), termini e privacy.

**Firestore della regia**, collezioni:

| Collezione | Cosa | Chi scrive |
|---|---|---|
| `clienti/{uid}` | il titolare: locale, piano, moduli, terminali, abbonamento, storico del piano | registrazione, Functions, admin |
| `istanze/{slug}` | stato dell'istanza: progetto, versione, profilo, aggiornamento, eliminazione | Functions (dall'esito dei workflow) |
| `richieste/{slug}` | le richieste di attivazione | solo le Functions |
| `rilasci/…` | i rilasci a ondate | Functions dell'admin |
| `vendita/listino` | cosa è in vendita: Free, moduli, giorni di prova, pagamenti online; più lo `storico` | admin; lo legge chiunque |
| `contatti/{uid}` | le richieste di contatto coi pagamenti online spenti | solo le Functions; l'admin le segna gestite |
| `ai`, `consumi`, `ricariche` | il credito AI dei locali | Functions |
| `impostazioni`, `riservato` | impostazioni della regia, dati che il browser non vede | admin, Functions |

**Le Functions** (gen2, `europe-west1`), per famiglia:

| Famiglia | Functions |
|---|---|
| Attivazione | `chiediAttivazione`, `avviaProvisioning`, `rilanciaProvisioning`, `esitoProvisioning` (il callback dei workflow) |
| Abbonamento | `creaCheckout`, `stripeWebhook`, `cambiaScelta`, `licenzaSegueIlPiano` (anche il cambio di stato dell'abbonamento), `registraPagamento` |
| Scadenze (REQ-FLOTTA-023) | `scadenza` (un compito di Cloud Tasks per ogni scadenza: pagamento a mano, prova, eliminazione, condizioni), `programmaScadenze` |
| Free, vendita, prove | `scegliFree`, `chiediContatto`, `provaModulo`, `cambiaPianoAdmin` |
| Istanze | `impostaStatoIstanza`, `aggiornaIstanza`, `gestisciRilascio`, `registraLocaleEsistente`, `creaCliente` |
| Eliminazione | `gestisciEliminazione`, `scaricaArchivio` |
| Credito AI | `richiestaAI` (la chiamata dell'app), `creaRicaricaAI`, `gestisciCassettoAI` |

Le Functions leggono la configurazione per progetto da
`functions/.env.<progetto>` (niente segreti lì) e i segreti da Secret
Manager: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`GITHUB_DISPATCH_TOKEN`, `PROVISIONING_CALLBACK_SECRET`, la chiave AI.

**Il listino** sta in `functions/piani.json`, letto dalle Functions e dal
sito. Prezzi e piani li decide l'utente.

## 4. La vita di un'istanza

```
 registrazione ─▶ scelta del piano ─▶ abbonamento ─▶ «Attiva» ─▶ workflow ─▶ istanza attiva
                  (Stripe, Free, o contatto      │                    │
                   coi pagamenti spenti)         ▼                    ▼
                                         richieste/{slug}       esito alla regia
```

1. **Abbonamento.** Con Stripe: Checkout e webhook. Col Free:
   `scegliFree`. Coi pagamenti online spenti: richiesta di contatto, e
   l'admin attiva il piano con «Cambia piano» fuori da Stripe.
2. **Attivazione.** Il titolare preme «Attiva»: `chiediAttivazione`
   rilegge tutto lato server e scrive la richiesta. Col deploy automatico
   acceso parte subito, altrimenti aspetta l'autorizzazione dell'admin.
   `avviaProvisioning` lancia `provisiona-istanza.yml`.
3. **Il workflow** (`provisiona-istanza.yml`, quattro job; l'environment
   `flotta` o `flotta-test` solo su `prepara` e `pubblica`, REQ-FLOTTA-047):
   1. `controlla`, senza credenziali: gli input, che entrano nei comandi
      solo come variabili d'ambiente (audit del 22/10/2026, C1), e la
      versione di tana-drink al ref chiesto (un rilascio? su main?); ne
      esporta lo SHA;
   2. `prepara`, con la chiave e senza l'app: Terraform (`infra/istanza`)
      importa il progetto e un Firestore già aperto, poi applica API,
      Firebase, Firestore, web app, sito, accesso con email, ruoli, e col
      profilo completo anche gli agenti di Eventarc e Pub/Sub; la
      configurazione web del progetto esce come output del job;
   3. `compila`, senza credenziali: scarica l'app da tana-drink allo SHA
      controllato, crea la cartella del cliente (`genera-cliente.mjs`),
      compila con `CLIENTE=<slug>` e carica il pacchetto come artifact;
   4. `pubblica`, con la chiave: scrive licenza e nome del locale
      (`scripts/licenza-istanza.mjs`); col profilo completo crea lo
      Storage (`scripts/storage-istanza.mjs`) e i segreti dell'app col
      segnaposto (`scripts/segreti-istanza.mjs`); pubblica
      `firestore,hosting` col profilo leggero,
      `firestore,storage,functions,hosting` col completo, riprovando due
      volte a 90 secondi perché i permessi degli agenti di Google arrivano
      qualche minuto dopo; il titolare admin; e l'esito alla regia,
      sempre, anche se un job prima è fallito.
4. **Licenza.** `settings/bar.licenza` nel Firestore dell'istanza: piano,
   moduli, limiti, prove, stato. La scrive solo la regia, e l'app la
   rispetta. Senza `limiti`, nessun limite.
5. **Aggiornamenti.** Un tag `vX.Y.Z` di tana-drink diventa un rilascio nel
   backoffice. Arriva ai locali a ondate (prove, interne, pilota, tutti),
   ognuna avviata dall'admin quando la precedente è finita senza errori
   (`aggiorna-istanza.yml`). Un aggiornamento fallito non ferma il
   locale: si riprova o si torna alla versione di prima.
6. **Sospensione e chiusura.** Le scrive la regia nella licenza: l'app si
   ferma e lo dice. Un mancato pagamento sospende da solo, quando cambia lo
   stato dell'abbonamento (REQ-FLOTTA-023).
7. **Eliminazione** (`elimina-istanza.yml`):
   0. il progetto è di questa regia: etichetta `ambiente` uguale a quella
      del lancio e stato Terraform presente, altrimenti stop
      (REQ-FLOTTA-048);
   1. backup leggibile ed export nativo di Firestore;
   2. archivio nel bucket della regia (180 giorni, lo scarica solo il
      titolare);
   3. verifica dell'archivio;
   4. solo dopo la verifica, eliminazione del progetto e pulizia dello
      stato Terraform.

   Il titolare la chiede, e parte dopo 30 giorni; l'admin la fa anche
   subito, scrivendo il nome dell'app.

### I due profili

| | leggero (Free) | completo |
|---|---|---|
| Fatturazione | collegata (senza, Google non accende l'accesso con email) | collegata |
| API | Firebase, Firestore, regole, Hosting, accesso, App Check | in più Functions, build, Artifact Registry, Run, Eventarc, Pub/Sub, Storage, Secret Manager, Scheduler |
| Deploy | regole e sito | regole, Storage, Functions e sito |
| Costo da fermo | zero (soglie gratuite) | qualche centesimo: immagini delle Functions, build |

Un Free che compra passa al completo da solo: `licenzaSegueIlPiano` lancia
l'aggiornamento col profilo completo, e `aggiorna-istanza.yml` rifà il
Terraform se nello stato manca l'API delle Functions.

## 5. Le pipeline

### La regia (drink-regia)

| Workflow | Quando | Cosa fa |
|---|---|---|
| `test.yml` | ogni push (tranne `release/**`) e ogni PR verso `develop` o `main` | lint, test, build; sulle PR anche la coverage con le soglie |
| `firebase-hosting.yml` + `deploy.yml` | push su `develop` → **test**; tag su `main` → **produzione**; tag fuori da `main` → fermo; lancio a mano su un ramo → test | lint e test, poi `deploy.yml` con l'environment e la guardia sul progetto (se la configurazione non è del progetto di destinazione si ferma) |
| `provisiona-istanza.yml` | lo lancia la regia (o una persona) | attiva un'istanza (§4) |
| `aggiorna-istanza.yml` | lo lancia la regia | porta una versione dell'app a un'istanza |
| `elimina-istanza.yml` | lo lancia la regia | backup verificato, poi eliminazione |
| `generate-issues.yml` | a ogni cambio del registro | crea e chiude le issue da `requirements.yaml` e `bugs.yaml` |

I workflow delle istanze si possono lanciare solo se stanno sul ramo
predefinito (`main`), ma girano al ref che la regia chiede: la regia di
test usa `develop` (`FLOTTA_REF`), la produzione `main`.

**Rami (GitFlow).** Si lavora su `release/x.y.z` o su `feature/…` da
`develop`, e si mergia solo con una PR e la CI verde. In produzione va
solo un tag su `main`. GitHub Free non dà l'approvazione obbligatoria su
un repository privato: oggi la produzione la protegge solo la regola del
job «Dove va».

**Environment GitHub:**

| Environment | Cosa contiene |
|---|---|
| `test`, `production` | le variabili `VITE_FIREBASE_*` della regia e la chiave di deploy, per il sito |
| `flotta-test`, `flotta` | `PROVISIONING_SA_JSON`, `BILLING_ACCOUNT_ID`, `PROVISIONING_CALLBACK_SECRET`; variabili `TFSTATE_BUCKET`, `REGIA_URL`, `REGIA_CALLBACK_URL`, `REGIA_SA_EMAIL`, `ORG_ID`, `ARCHIVIO_BUCKET` (infra/README.md) |

### L'app (tana-drink)

| Workflow | Quando | Cosa fa |
|---|---|---|
| `test.yml` | ogni push e PR | lint, test (990+), build, coverage sulle PR |
| `firebase-hosting.yml` + `deploy.yml` | tag su `main` → produzione della Tana; tag altrove → test della Tana | pubblica la Tana (`CLIENTE=tana`) |
| `generate-issues.yml` | a ogni cambio del registro | le issue dai registri |

I locali clienti **non** si pubblicano da tana-drink: lì ci sono solo le
credenziali della Tana. La build per cliente è in `develop` dal
30/10/2026 (docs/richieste-tana-drink-rami.md): la regia di test compila
i locali da `develop`, la produzione da `main`, dove arriva con la 1.10.

### Il percorso di una modifica

```
 app:   feature/… ─PR─▶ develop ──▶ test della Tana, istanze di prova (regia di test)
                                └─▶ tag vX.Y.Z su main ──▶ la Tana ──▶ rilascio a ondate ai locali
 regia: feature/… ─PR─▶ develop ──▶ drink-regia-test
                                └─▶ tag su main ──▶ drink-regia
```

## 6. Sicurezza e privacy, in breve

- **Il browser non è di fiducia.** Tutto quello che decide denaro, piano
  o attivazione lo rifà il server; le regole Firestore della regia non
  lasciano scrivere ai client richieste, istanze, contatti o licenze. La
  falla C2 (la richiesta scritta dal browser) è chiusa dal 22/10/2026.
- **Gli input dei workflow** entrano nei comandi solo come variabili
  d'ambiente e si controllano per primi (C1).
- **Segreti**: mai nel repository né nella chat. Stanno negli environment
  GitHub e in Secret Manager.
- **Dati dei locali**: solo nel loro progetto. Il backup di un locale
  eliminato lo scarica solo il titolare, per 180 giorni.
- L'audit completo: [audit-sicurezza-privacy.md](audit-sicurezza-privacy.md).

## 7. Cose imparate (da non ripetere)

| Cosa | Cosa si è visto | Come si fa |
|---|---|---|
| Deploy delle Functions con un account non proprietario | una serie di ruoli e API mancanti, le Functions private (403) | ruoli e API in [actions-come-tana-drink.md](actions-come-tana-drink.md); `allUsers` invoker sulle Functions HTTP |
| Bucket di Storage dell'app | Terraform non lo può creare («Another user owns the domain») | lo crea l'API di Firebase Storage (`storage-istanza.mjs`) |
| Primo deploy con trigger di Firestore | «Permission denied … Eventarc Service Agent» | agenti creati da Terraform col progetto, deploy riprovato |
| Segreti dichiarati dall'app | Firebase non pubblica le Functions | creati col segnaposto prima del deploy |
| Progetto senza fatturazione (Spark) | l'accesso con email non si accende (`BILLING_NOT_ENABLED`) | anche il Free ha la fatturazione, col profilo leggero |
| Firestore aperto a mano | «Database already exists» | il workflow lo importa nello stato |
| Listino fuori da `functions/` | le Functions non partivano | tutto quello che le Functions leggono sta in `functions/` |
| Merge con un controllo rosso | GitHub non lo blocca (niente protezione dei rami su Free) | guardare l'esito della CI prima di mergiare |
