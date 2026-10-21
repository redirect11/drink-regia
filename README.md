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

Le variabili `VITE_FIREBASE_*` del progetto `drink-regia` vanno in un
`.env` locale (non si committa) e nell'environment GitHub «regia». I
segreti delle Functions (`GITHUB_DISPATCH_TOKEN`,
`PROVISIONING_CALLBACK_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`) si mettono con
`firebase functions:secrets:set --project drink-regia`.

I prezzi stanno in `piani.json`, in un posto solo. Il nome visibile del
prodotto in `src/lib/prodotto.js`. I requisiti in
`requirements/requirements.yaml`, coi test che li dimostrano.
