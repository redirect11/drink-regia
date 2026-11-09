# drink-regia — il sito del prodotto

Il sito con cui un locale si abbona e ottiene la sua installazione
dell'app: prima pagina coi prezzi, registrazione e accesso dei titolari,
dashboard del cliente, backoffice, abbonamento con Stripe, e le Cloud
Functions che lanciano l'attivazione di un'istanza e ne ricevono l'esito.

Vive sul progetto Firebase **`drink-regia`**. Non contiene mai i dati
operativi dei locali: solo chi sono, che piano hanno, a che punto è la
loro app.

L'app che viene installata ai locali, il Terraform delle istanze e il
workflow di attivazione stanno nel repository **tana-drink**
(`docs/flotta.md` là dentro spiega il disegno intero). Questo repository
è nato il 22/10/2026 staccando la cartella `regia/` da quello, con la sua
storia.

```sh
npm install
npm run dev        # il sito in locale (senza VITE_FIREBASE_*: solo vetrina)
npm test           # i test (vitest)
npm run lint
npm run build
```

**Due progetti Firebase**, come tana-drink: `drink-regia-test` per
provare e `drink-regia` per la produzione. Un push su `develop` va sul
test; in produzione va solo un tag su `main`, e un tag fuori da `main`
non pubblica niente. Il lancio a mano di «Deploy to Firebase» su un ramo
va sul test (`docs/handover.md` §3,
`docs/actions-come-tana-drink.md`). I segreti stanno nelle GitHub
Environments `test` e `production`, stessi nomi e valori del loro
progetto: i quattro `VITE_FIREBASE_*` (`scripts/segreti-environment.mjs`
li mette dalla sdkconfig) e `FIREBASE_SERVICE_ACCOUNT`. In locale i
`VITE_FIREBASE_*` vanno in un `.env` (non si committa). I segreti delle
Functions (`GITHUB_DISPATCH_TOKEN`, `PROVISIONING_CALLBACK_SECRET`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) si mettono con
`firebase functions:secrets:set --project <progetto>`; la configurazione
non segreta per progetto sta in `functions/.env.<progetto>`.

**Le issue nascono dal registro**: `scripts/generate-issues.mjs` legge
`requirements/requirements.yaml` e `requirements/bugs.yaml` e apre,
riallinea e chiude le issue su GitHub; la bacheca è il project
«drink-regia» (n. 5) dell'account.

**Il cassetto AI** (REQ-AI-003): le installazioni chiedono le funzioni AI
alla Function `richiestaAI` della regia, con una chiave della regia; la
regia controlla il credito del locale, chiama Claude con la sua chiave
(`ANTHROPIC_API_KEY`, solo nei segreti delle Functions) e scala il costo.
Credito, tetto mensile e storico stanno in `ai/{slug}`; il contratto con
l'app è in `docs/handover.md` §7.

**Il backoffice** si apre solo con un account che ha il claim `admin`.
Ci si registra dal sito come un cliente qualsiasi, poi si dà il claim da
qui, con le credenziali del progetto:

```sh
node scripts/admin-regia.mjs --email <la tua email> --project <id del progetto>
```

e si esce e rientra dal sito. Prima di tutto questo, in console Firebase
del progetto `drink-regia`, Authentication va avviata («Inizia») col
provider Email/password acceso: senza, registrazione e accesso
rispondono con un errore di configurazione.

L'audit di sicurezza e privacy del 22/10/2026, con la lista delle cose
da chiudere prima della prima attivazione reale, sta in
[docs/audit-sicurezza-privacy.md](docs/audit-sicurezza-privacy.md).

I prezzi stanno in `functions/piani.json`, in un posto solo. Il nome visibile del
prodotto in `src/lib/prodotto.js`. I requisiti in
`requirements/requirements.yaml`, coi test che li dimostrano.
